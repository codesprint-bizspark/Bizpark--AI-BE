import asyncio
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = logging.getLogger("runner.agents.social_content")

_llm: Optional[ChatGoogleGenerativeAI] = None
_image_client: Optional[AsyncOpenAI] = None


def _get_image_client() -> AsyncOpenAI:
    global _image_client
    if _image_client is None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set — cannot generate images")
        _image_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _image_client


async def _generate_image_url(prompt: str) -> str:
    """Generate image with one automatic retry on transient failure."""
    last_exc: Exception = RuntimeError("unknown")
    for attempt in range(2):
        try:
            result = await _get_image_client().images.generate(
                model="gpt-image-1",
                prompt=prompt,
                size="1024x1024",
                n=1,
            )
            item = result.data[0] if result.data else None
            if not item:
                raise RuntimeError("OpenAI image generation returned no data")
            if item.url:
                return item.url
            if item.b64_json:
                return f"data:image/png;base64,{item.b64_json}"
            raise RuntimeError("OpenAI image response missing url and b64_json")
        except Exception as exc:
            last_exc = exc
            if attempt == 0:
                logger.warning(f"Image gen attempt 1 failed ({exc}) — retrying in 3s")
                await asyncio.sleep(3)
    raise last_exc


_PLATFORM_GUIDELINES = {
    "FACEBOOK": (
        "- Long-form marketing caption (3–5 short paragraphs, ~600–900 characters).\n"
        "- Open with a story or value hook, then features, then a clear CTA.\n"
        "- 3–6 hashtags max — Facebook readers don't engage with hashtag walls.\n"
        '- CTA examples: "Order now", "Book a table", "Visit our shop", "DM to enquire".'
    ),
    "INSTAGRAM": (
        "- Engaging caption: a punchy hook in the first line, then 2–4 short lines of value,\n"
        "  optional line break, then CTA.\n"
        "- 8–15 niche hashtags, mixing branded + community + discovery tags.\n"
        "- Visual-first — the image/video is the hero; copy is supporting cast.\n"
        "- Use line breaks and at most 1–2 emojis."
    ),
    "TIKTOK": (
        "- Short hook caption (under 150 characters, snappy + curiosity-driven).\n"
        "- 3–6 trending-style hashtags including 1–2 broad ones (e.g. #fyp, #smallbusiness).\n"
        '- Caption should feel like a video voiceover hook ("POV:", "Here\'s why…").\n'
        "- Provide a video concept and a 3–5 beat scene script in aiMetadata."
    ),
}

_POST_TYPE_RULES = {
    "TEXT": "Text-only post. Do NOT generate image/flyer/video prompts.",
    "IMAGE": "Image post. Generate ONE high-quality image prompt for a brand-aligned promotional image.",
    "FLYER": "Flyer post. Generate ONE flyer design prompt — clearly composed with title, sub-text, key offer, logo placement, brand colors.",
    "VIDEO": "Short promotional video. Generate a 15–30s video script with 3–5 numbered scenes, subtitle lines per scene, and a one-line video concept summary.",
}


def _get_llm() -> ChatGoogleGenerativeAI:
    global _llm
    if _llm is None:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not set — cannot run social content agent")
        _llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=settings.gemini_api_key,
            temperature=0.75,
        )
    return _llm


def _build_prompt(business: dict, dto: dict) -> str:
    platforms = dto.get("platforms", [])
    post_type = dto.get("postType", "TEXT")
    topic = dto.get("topic") or ""
    tone = dto.get("tone") or "friendly"
    audience = dto.get("audience") or ""
    hashtag_limit = dto.get("hashtagLimit") or "use platform best-practice"

    guidelines = "\n".join(
        f"### {p}\n{_PLATFORM_GUIDELINES.get(p, '- Standard social media best practices.')}"
        for p in platforms
    )

    cms = business.get("websiteSnapshot")
    website_summary = json.dumps(cms)[:3000] if cms else "(website not yet generated)"
    post_type_rule = _POST_TYPE_RULES.get(post_type, "Text-only post.")

    def variant_template(p: str) -> str:
        lines = [
            '      "caption": "..."',
            '      "cta": "..."',
            '      "hashtags": ["..."]',
        ]
        if post_type == "IMAGE":
            lines.append('      "imagePrompt": "..."')
        elif post_type == "FLYER":
            lines.append('      "flyerPrompt": "..."')
        elif post_type == "VIDEO":
            lines.append('      "videoConcept": "..."')
            lines.append('      "videoScript": [{ "scene": 1, "visual": "...", "subtitle": "..." }]')
        lines.append('      "notes": "(optional short tip for the user)"')
        return '    "' + p + '": {\n' + ',\n'.join(lines) + '\n    }'

    variants_block = ",\n".join(variant_template(p) for p in platforms)

    return f"""You are an expert social media strategist for small businesses. Generate ready-to-publish posts.

=== BUSINESS ===
Name: {business.get("name", "")}
Category: {business.get("category") or "General"}
Description: {business.get("description") or "(none)"}
Target audience: {audience or "Local customers, ages 18-45"}
Brand colors: primary {business.get("primaryColor") or "unspecified"}, secondary {business.get("secondaryColor") or "unspecified"}
Keywords: {business.get("keywords") or "(none)"}

=== WEBSITE SNAPSHOT (truncated) ===
{website_summary}

=== CAMPAIGN ===
Topic / hook: {topic or "(no specific campaign — promote the business broadly)"}
Tone: {tone}
Post type: {post_type}
{post_type_rule}
Hashtag limit per platform: {hashtag_limit}

=== PLATFORM RULES ===
{guidelines}

=== OUTPUT FORMAT (STRICT) ===
Return ONLY a single JSON object — no markdown, no commentary:

{{
  "variants": {{
{variants_block}
  }}
}}

Rules:
- DO NOT invent products, prices, or hours not present in the website snapshot or description.
- Hashtags MUST be lowercase, no spaces, no leading "#" character — we add it client-side.
- Captions must be safe-for-work and free of unverified claims ("#1", "best in town", etc).
- For VIDEO, scenes must be visually distinct and easily filmable on a phone.
"""


def _strip_markdown_json(raw: str) -> str:
    """Strip optional ```json ... ``` wrapper that some models add despite instructions."""
    stripped = re.sub(r"^```(?:json)?\s*\n?", "", raw.strip(), flags=re.IGNORECASE)
    stripped = re.sub(r"\n?```\s*$", "", stripped.strip())
    return stripped.strip()


async def run_social_content_agent(input_data: dict, session: AsyncSession) -> dict:
    dto = input_data.get("dto", {})
    user_id = input_data.get("userId") or None
    business_id = dto.get("businessId", "")

    # ── Fetch business + website snapshot ────────────────────────────────────
    biz_result = await session.execute(
        text("""
            SELECT b.id, b.name, b.category, b.description, b."logoUrl",
                   w."cmsData"
            FROM api."businesses" b
            LEFT JOIN api."Website" w ON w."businessId" = b.id
            WHERE b.id = :bid
            LIMIT 1
        """),
        {"bid": business_id},
    )
    row = biz_result.mappings().fetchone()
    if not row:
        raise ValueError(f"Business {business_id} not found")

    cms = row["cmsData"] or {}
    business = {
        "name": row["name"],
        "category": row["category"],
        "description": row["description"],
        "websiteSnapshot": cms,
        "primaryColor": cms.get("primaryColor"),
        "secondaryColor": cms.get("secondaryColor"),
        "keywords": ((cms.get("content") or {}).get("seo") or {}).get("keywords"),
    }

    platforms = dto.get("platforms", [])
    post_type = dto.get("postType", "TEXT")
    generate_media = dto.get("generateMedia", False)
    now = datetime.now(timezone.utc)
    gen_id = str(uuid.uuid4())

    # ── Batch account lookup (one query for all platforms) ───────────────────
    acc_result = await session.execute(
        text("""
            SELECT platform::text, id FROM api."SocialAccount"
            WHERE "businessId" = :bid
              AND platform::text = ANY(:platforms)
              AND status = 'CONNECTED'
              AND "deletedAt" IS NULL
        """),
        {"bid": business_id, "platforms": platforms},
    )
    account_by_platform: dict[str, str] = {row[0]: str(row[1]) for row in acc_result.fetchall()}

    # ── Step 1: Gemini text generation ───────────────────────────────────────
    prompt = _build_prompt(business, dto)
    t0 = time.time()
    response = await _get_llm().ainvoke(prompt)
    raw_text = _strip_markdown_json(response.content.strip())
    latency_ms = int((time.time() - t0) * 1000)
    logger.info(f"Gemini text gen completed in {latency_ms}ms")

    parsed = json.loads(raw_text)
    variants = parsed.get("variants", {})

    # Warn if any requested platform is missing from the response
    for p in platforms:
        if p not in variants:
            logger.warning(f"Gemini response missing variant for platform {p} — will create empty post")

    usage = getattr(response, "usage_metadata", None) or {}
    prompt_tokens = usage.get("input_tokens", 0)
    completion_tokens = usage.get("output_tokens", 0)

    # ── Step 2: Fire image generation tasks immediately (parallel) ───────────
    image_tasks: dict[str, asyncio.Task] = {}
    if generate_media and post_type in ("IMAGE", "FLYER"):
        for platform in platforms:
            variant = variants.get(platform, {})
            img_prompt = variant.get("imagePrompt") or variant.get("flyerPrompt")
            if img_prompt:
                image_tasks[platform] = asyncio.create_task(_generate_image_url(img_prompt))
                logger.info(f"Image generation task started for {platform}")

    # ── Step 3: DB writes while images generate in background ───────────────
    try:
        await session.execute(
            text("""
                INSERT INTO api."AiGeneration"
                  (id, "businessId", kind, model, input, output,
                   "promptTokens", "completionTokens", "latencyMs",
                   "createdByUserId", "createdAt", "updatedAt")
                VALUES
                  (:id, :bid, 'FULL_POST', 'gemini-2.5-flash',
                   CAST(:inp AS jsonb), CAST(:out AS jsonb),
                   :pt, :ct, :lat, :uid, :now, :now)
            """),
            {
                "id": gen_id,
                "bid": business_id,
                "inp": json.dumps({"dto": dto}),
                "out": json.dumps(parsed),
                "pt": prompt_tokens,
                "ct": completion_tokens,
                "lat": latency_ms,
                "uid": user_id,
                "now": now,
            },
        )
    except Exception as e:
        logger.warning(f"AiGeneration record skipped (non-fatal): {e}")
        gen_id = None

    created_posts = []
    post_id_by_platform: dict[str, str] = {}

    for platform in platforms:
        variant = variants.get(platform, {})
        account_id = account_by_platform.get(platform)

        ai_meta: dict = {}
        if variant.get("notes"):
            ai_meta["notes"] = variant["notes"]
        if post_type == "IMAGE" and variant.get("imagePrompt"):
            ai_meta["imagePrompt"] = variant["imagePrompt"]
        if post_type == "FLYER" and variant.get("flyerPrompt"):
            ai_meta["flyerPrompt"] = variant["flyerPrompt"]
        if post_type == "VIDEO":
            if variant.get("videoConcept"):
                ai_meta["videoConcept"] = variant["videoConcept"]
            if variant.get("videoScript"):
                ai_meta["videoScript"] = variant["videoScript"]

        hashtags = [
            h.strip().lstrip("#").replace(" ", "").lower()
            for h in (variant.get("hashtags") or [])
            if h.strip()
        ][:30]

        post_id = str(uuid.uuid4())
        post_id_by_platform[platform] = post_id

        await session.execute(
            text("""
                INSERT INTO api."SocialPost"
                  (id, "businessId", "accountId", platform, "postType", status,
                   caption, cta, hashtags, "aiMetadata", "sourceGenerationId",
                   "createdByUserId", "createdAt", "updatedAt")
                VALUES
                  (:id, :bid, :acid, :plat, :ptype, 'DRAFT',
                   :caption, :cta, CAST(:hashtags AS jsonb), CAST(:meta AS jsonb), :genid,
                   :uid, :now, :now)
            """),
            {
                "id": post_id,
                "bid": business_id,
                "acid": account_id,
                "plat": platform,
                "ptype": post_type,
                "caption": variant.get("caption"),
                "cta": variant.get("cta"),
                "hashtags": json.dumps(hashtags),
                "meta": json.dumps(ai_meta),
                "genid": gen_id,
                "uid": user_id,
                "now": now,
            },
        )
        created_posts.append({
            "id": post_id,
            "platform": platform,
            "status": "DRAFT",
            "caption": variant.get("caption"),
            "accountId": account_id,
        })

    # ── Step 4: Collect image results (all ran concurrently since Step 2) ────
    if image_tasks:
        logger.info(f"Waiting for {len(image_tasks)} image task(s) to complete…")
        task_platforms = list(image_tasks.keys())
        results = await asyncio.gather(*image_tasks.values(), return_exceptions=True)

        for platform, result in zip(task_platforms, results):
            post_id = post_id_by_platform.get(platform)
            if not post_id:
                continue

            if isinstance(result, Exception):
                logger.warning(f"AI image failed for {platform} after retry: {result}")
                # Record the failure in aiMetadata so the UI can surface it
                await session.execute(
                    text("""
                        UPDATE api."SocialPost"
                        SET "aiMetadata" = "aiMetadata" || CAST(:patch AS jsonb), "updatedAt" = :now
                        WHERE id = CAST(:pid AS uuid)
                    """),
                    {"pid": post_id, "patch": json.dumps({"imageError": str(result)}), "now": now},
                )
                continue

            media_id = str(uuid.uuid4())
            variant = variants.get(platform, {})
            await session.execute(
                text("""
                    INSERT INTO api."SocialPostMedia"
                      (id, "postId", kind, source, url, "mimeType",
                       position, prompt, metadata, "createdAt", "updatedAt")
                    VALUES
                      (:mid, :pid, 'IMAGE', 'AI_GENERATED', :url, 'image/png',
                       0, :prompt, CAST(:meta AS jsonb), :now, :now)
                """),
                {
                    "mid": media_id,
                    "pid": post_id,
                    "url": result,
                    "prompt": variant.get("imagePrompt") or variant.get("flyerPrompt"),
                    "meta": json.dumps({"model": "gpt-image-1", "size": "1024x1024"}),
                    "now": now,
                },
            )
            logger.info(f"AI image saved for {platform} post {post_id}")

    await session.commit()
    logger.info(f"Social content: {len(created_posts)} draft posts created for business {business_id}")
    return {"posts": created_posts, "generationId": gen_id}
