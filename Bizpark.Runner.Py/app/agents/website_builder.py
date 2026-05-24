import json
import logging
import re
from typing import TypedDict, Optional, List, Literal

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, ValidationError

from app.config import settings


# ── Output schema ─────────────────────────────────────────────────────────────

class _FeatureItem(BaseModel):
    icon: Literal["truck", "refresh", "shield", "headphones", "sparkles"]
    title: str
    description: str

class _HeroContent(BaseModel):
    title: str
    subtitle: str
    ctaText: str
    ctaLink: str = "/shop"

class _AnnouncementContent(BaseModel):
    enabled: bool = True
    text: str

class _AboutContent(BaseModel):
    title: str
    text: str

class _FooterContent(BaseModel):
    contactEmail: str

class _SeoContent(BaseModel):
    metaDescription: str
    keywords: str

class _WebsiteContent(BaseModel):
    announcement: _AnnouncementContent
    hero: _HeroContent
    features: List[_FeatureItem]
    about: _AboutContent
    footer: _FooterContent
    seo: _SeoContent

class WebsiteGenerationOutput(BaseModel):
    businessName: str
    tagline: str
    primaryColor: str
    secondaryColor: str
    content: _WebsiteContent

logger = logging.getLogger("runner.agents.website_builder")

_llm: Optional[ChatOpenAI] = None


def _get_llm() -> ChatOpenAI:
    global _llm
    if _llm is None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set — cannot run website builder agent")
        _llm = ChatOpenAI(
            model="gpt-4o",
            api_key=settings.openai_api_key,
            temperature=0.4,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
    return _llm


class WebsiteState(TypedDict):
    business: dict
    raw_cms_data: dict
    tone: str
    generated_content: Optional[dict]
    error: Optional[str]


def validate_input(state: WebsiteState) -> WebsiteState:
    business = state.get("business", {})
    if not business.get("name"):
        return {**state, "error": "Business name is missing"}
    return {**state, "error": None}


def generate_with_openai(state: WebsiteState) -> WebsiteState:
    if state.get("error"):
        return state

    business = state["business"]
    raw = state.get("raw_cms_data", {})
    tone = state.get("tone", "professional")

    description = business.get("description", "").strip()
    category = business.get("category", "General Business")
    business_name = business.get("name", "")
    user_color = raw.get("brand.primaryColor", "")

    tone_guide = {
        "professional": "formal, expert, confident — speak to professionals",
        "friendly":     "warm, approachable, conversational — feel like a helpful neighbour",
        "bold":         "energetic, direct, exciting — make it impossible to ignore",
        "minimal":      "clean, understated, let quality speak — fewer words, more impact",
    }.get(tone, "professional, clear, and helpful")

    # Infer a contact email from business name
    email_slug = business_name.lower().replace("'", "").replace(" ", "")
    inferred_email = f"hello@{email_slug}.com"

    prompt = f"""You are an expert website copywriter for small businesses. Write compelling, conversion-focused website copy tailored to the specific business below. Return a COMPLETE website configuration.

=== BUSINESS INFORMATION ===
Name: {business_name}
Type / Category: {category}
Description (owner's words): {description or "(not provided — infer from category)"}
Brand tone: {tone} — {tone_guide}
Brand color (user-chosen): {user_color or "(choose a color that suits this business type)"}

=== WRITING GUIDELINES ===
Hero title: 6–10 words, punchy, speaks to what the customer wants
Hero subtitle: 1 sentence, expands the value prop, max 20 words
CTA text: 2–4 action words ("Explore Our Menu", "Shop Now", "Book a Session")
Tagline: memorable brand phrase, under 10 words
About title: 4–7 words (e.g. "Welcome to Kopi Corner", "Our Story")
About text: 2–3 sentences — brand story + what makes them different
Announcement: short promotional or welcome message (under 20 words), relevant to this business
Features: exactly 4 items — pick icons ONLY from this list: truck, refresh, shield, headphones, sparkles
  Choose icons and descriptions that match this specific business (not generic e-commerce ones)
  e.g. for a café: "sparkles/Fresh Roasted Daily", "headphones/Friendly Service", "truck/Takeaway Available", "shield/Quality Guaranteed"
SEO: write a 1-sentence meta description (under 160 chars) and 5–8 comma-separated keywords
Contact email: use exactly "{inferred_email}"
Colors: {"use " + user_color + " as primaryColor" if user_color else "choose a primaryColor that suits a " + category}; pick a complementary secondaryColor

Return ONLY a valid JSON object — no markdown, no explanation, no extra text:
{{
  "businessName": "{business_name}",
  "tagline": "...",
  "primaryColor": "#xxxxxx",
  "secondaryColor": "#xxxxxx",
  "content": {{
    "announcement": {{
      "enabled": true,
      "text": "..."
    }},
    "hero": {{
      "title": "...",
      "subtitle": "...",
      "ctaText": "...",
      "ctaLink": "/shop"
    }},
    "features": [
      {{ "icon": "sparkles|truck|refresh|shield|headphones", "title": "...", "description": "..." }},
      {{ "icon": "sparkles|truck|refresh|shield|headphones", "title": "...", "description": "..." }},
      {{ "icon": "sparkles|truck|refresh|shield|headphones", "title": "...", "description": "..." }},
      {{ "icon": "sparkles|truck|refresh|shield|headphones", "title": "...", "description": "..." }}
    ],
    "about": {{
      "title": "...",
      "text": "..."
    }},
    "footer": {{
      "contactEmail": "{inferred_email}"
    }},
    "seo": {{
      "metaDescription": "...",
      "keywords": "..."
    }}
  }}
}}"""

    try:
        response = _get_llm().invoke(prompt)
        raw_text = response.content.strip()

        # Fallback strip in case model ignores json_object mime type
        raw_text = re.sub(r"^```(?:json)?\s*\n?", "", raw_text, flags=re.IGNORECASE)
        raw_text = re.sub(r"\n?```\s*$", "", raw_text.strip()).strip()

        generated = json.loads(raw_text)
        try:
            WebsiteGenerationOutput.model_validate(generated)
        except ValidationError as ve:
            logger.error(f"Website builder output failed schema validation: {ve}")
            return {**state, "error": f"AI output did not match expected schema: {ve}"}
        logger.info(f"OpenAI generated full config for {business_name}")
        return {**state, "generated_content": generated}

    except Exception as e:
        logger.error(f"OpenAI generation failed: {e}")
        return {**state, "error": str(e)}


def should_end_on_error(state: WebsiteState) -> str:
    return "end" if state.get("error") else "generate"


_builder = StateGraph(WebsiteState)
_builder.add_node("validate", validate_input)
_builder.add_node("generate", generate_with_openai)
_builder.set_entry_point("validate")
_builder.add_conditional_edges("validate", should_end_on_error, {"generate": "generate", "end": END})
_builder.add_edge("generate", END)
website_graph = _builder.compile()


async def run_website_builder(business: dict, raw_cms_data: dict, tone: str = "professional") -> dict:
    result = await website_graph.ainvoke({
        "business": business,
        "raw_cms_data": raw_cms_data,
        "tone": tone,
        "generated_content": None,
        "error": None,
    })

    if result.get("error"):
        raise RuntimeError(result["error"])

    return result["generated_content"]
