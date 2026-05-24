import json
import logging

from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings

logger = logging.getLogger("runner.agents.google_review_reply")

_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=settings.gemini_api_key,
    temperature=0.35,
    thinking_budget=0,
    model_kwargs={"generation_config": {"response_mime_type": "application/json"}},
) if settings.gemini_api_key else None


def _fallback_reply(business: dict, review: dict) -> dict:
    business_name = business.get("name") or "our team"
    reviewer = review.get("reviewerDisplayName") or "there"
    rating = int(review.get("rating") or 0)

    if rating >= 4:
        reply = (
            f"Hi {reviewer}, thank you for the kind review. "
            f"We're glad you had a great experience with {business_name} and hope to see you again soon."
        )
        sentiment = "positive"
        risk = "low"
    else:
        reply = (
            f"Hi {reviewer}, thank you for sharing this. We're sorry the experience did not meet expectations. "
            f"Please contact {business_name} directly so we can look into it and make things right."
        )
        sentiment = "negative" if rating <= 2 else "neutral"
        risk = "high" if rating <= 2 else "medium"

    return {
        "replyText": reply,
        "sentiment": sentiment,
        "riskLevel": risk,
        "autoEligible": rating >= 4,
    }


async def run_google_review_reply_agent(business: dict, review: dict, policy: dict) -> dict:
    if not review.get("reviewName"):
        raise RuntimeError("Review resource name is missing")

    if _llm is None:
        return _fallback_reply(business, review)

    auto_min = int(policy.get("autoReplyMinRating") or 4)
    prompt = f"""You write concise, brand-safe Google Business Profile review replies for small businesses.

Return ONLY valid JSON with:
{{
  "replyText": "plain text reply under 900 characters",
  "sentiment": "positive|neutral|negative",
  "riskLevel": "low|medium|high",
  "autoEligible": true|false
}}

Business:
- Name: {business.get("name") or ""}
- Category: {business.get("category") or ""}
- Description: {business.get("description") or ""}

Review:
- Reviewer: {review.get("reviewerDisplayName") or "Anonymous"}
- Anonymous: {review.get("reviewerIsAnonymous")}
- Rating: {review.get("rating")}
- Comment: {review.get("comment") or "(rating-only review)"}

Policy:
- autoEligible must be true only when rating >= {auto_min} and the reply is low risk.
- For low-star reviews, be empathetic, avoid admitting fault, invite direct contact, and keep autoEligible false.
- Do not offer discounts, refunds, legal claims, or private customer details.
- Do not mention that you are AI.
"""

    response = await _llm.ainvoke(prompt)
    raw_text = response.content.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        parsed = json.loads(raw_text)
    except Exception as exc:
        logger.warning("Gemini review reply JSON parse failed: %s", exc)
        return _fallback_reply(business, review)

    reply_text = str(parsed.get("replyText") or "").strip()
    if not reply_text:
        return _fallback_reply(business, review)

    return {
        "replyText": reply_text[:900],
        "sentiment": parsed.get("sentiment") or "neutral",
        "riskLevel": parsed.get("riskLevel") or "medium",
        "autoEligible": bool(parsed.get("autoEligible")) and int(review.get("rating") or 0) >= auto_min,
    }
