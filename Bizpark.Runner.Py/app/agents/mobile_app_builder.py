import json
import logging
import re
from typing import TypedDict, Optional, List, Literal

from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, ValidationError

from app.config import settings


# ── Output schema ─────────────────────────────────────────────────────────────

class _NavItem(BaseModel):
    key: str
    label: str
    icon: Literal["home", "grid", "receipt", "user", "heart", "star", "bell", "map", "camera", "tag"]

class _HomeScreen(BaseModel):
    heroTitle: str
    heroSubtitle: str
    ctaText: str
    promoText: str

class _AboutScreen(BaseModel):
    title: str
    text: str

class _AppScreens(BaseModel):
    home: _HomeScreen
    about: _AboutScreen

class _AppIcon(BaseModel):
    emoji: str
    backgroundColor: str

class _SplashScreen(BaseModel):
    title: str
    subtitle: str

class _NotificationMessages(BaseModel):
    orderConfirmed: str
    orderReady: str

class MobileAppGenerationOutput(BaseModel):
    businessName: str
    tagline: str
    primaryColor: str
    accentColor: str
    backgroundColor: str
    appIcon: _AppIcon
    splashScreen: _SplashScreen
    navigation: List[_NavItem]
    screens: _AppScreens
    appStoreDescription: str
    appStoreKeywords: str
    notificationMessages: _NotificationMessages


logger = logging.getLogger("runner.agents.mobile_app_builder")

_openai_llm: Optional[ChatOpenAI] = None
_gemini_llm: Optional[ChatGoogleGenerativeAI] = None
_minimax_llm: Optional[ChatOpenAI] = None


def _get_openai():
    global _openai_llm
    if _openai_llm is None and settings.openai_api_key:
        _openai_llm = ChatOpenAI(
            model="gpt-4o",
            api_key=settings.openai_api_key,
            temperature=0.4,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
    return _openai_llm


def _get_gemini():
    global _gemini_llm
    if _gemini_llm is None and settings.gemini_api_key:
        _gemini_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=settings.gemini_api_key,
            temperature=0.4,
            model_kwargs={"generation_config": {"response_mime_type": "application/json"}},
        )
    return _gemini_llm


def _get_minimax():
    global _minimax_llm
    if _minimax_llm is None and settings.minimax_api_key:
        _minimax_llm = ChatOpenAI(
            model="MiniMax-Text-01",
            api_key=settings.minimax_api_key,
            base_url="https://api.minimaxi.chat/v1",
            temperature=0.4,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
    return _minimax_llm


class MobileAppState(TypedDict):
    business: dict
    tone: str
    generated_content: Optional[dict]
    error: Optional[str]


def validate_input(state: MobileAppState) -> MobileAppState:
    business = state.get("business", {})
    if not business.get("name"):
        return {**state, "error": "Business name is missing"}
    return {**state, "error": None}


async def generate_with_gemini(state: MobileAppState) -> MobileAppState:
    if state.get("error"):
        return state

    business = state["business"]
    tone = state.get("tone", "professional")

    business_name = business.get("name", "")
    category = business.get("category", "General Business")
    description = business.get("description", "").strip() if business.get("description") else ""

    tone_guide = {
        "professional": "formal, expert, confident — speak to professionals",
        "friendly":     "warm, approachable, conversational — feel like a helpful neighbour",
        "bold":         "energetic, direct, exciting — make it impossible to ignore",
        "minimal":      "clean, understated, let quality speak — fewer words, more impact",
    }.get(tone, "professional, clear, and helpful")

    # Pick an emoji that fits the business category
    emoji_hint = {
        "cafe": "☕", "coffee": "☕", "restaurant": "🍽️", "food": "🍔",
        "retail": "🛍️", "fashion": "👗", "beauty": "💅", "salon": "✂️",
        "fitness": "💪", "gym": "🏋️", "health": "❤️", "medical": "🏥",
        "tech": "💻", "software": "⚙️", "education": "📚", "travel": "✈️",
        "real estate": "🏠", "property": "🏡", "finance": "💰", "law": "⚖️",
    }
    emoji = next(
        (v for k, v in emoji_hint.items() if k in category.lower() or k in business_name.lower()),
        "🏪"
    )

    prompt = f"""You are an expert mobile app designer and copywriter for small businesses.
Generate a complete mobile app configuration for the business below. Return ONLY valid JSON.

=== BUSINESS INFORMATION ===
Name: {business_name}
Type / Category: {category}
Description: {description or "(not provided — infer from category)"}
Brand tone: {tone} — {tone_guide}

=== REQUIREMENTS ===
- navigation: exactly 4 tabs, icons ONLY from: home, grid, receipt, user, heart, star, bell, map, camera, tag
  Choose tabs relevant to this business (e.g., a café: Home, Menu, Orders, Profile)
- screens.home.heroTitle: 5–8 words, punchy and action-oriented
- screens.home.heroSubtitle: 1 sentence, max 15 words
- screens.home.ctaText: 2–4 words (e.g., "Order Now", "Book a Table", "Shop Today")
- screens.home.promoText: short promotional message, under 12 words
- screens.about.title: 3–6 words (e.g., "Our Story", "About {business_name}")
- screens.about.text: 2–3 sentences, brand story + what makes them different
- tagline: memorable phrase under 8 words
- appStoreDescription: compelling app store description, 2–3 sentences, under 200 chars
- appStoreKeywords: 6–8 comma-separated keywords relevant to this business
- notificationMessages: friendly, on-brand push notification copy
- primaryColor: a hex color that suits a {category} business
- accentColor: a complementary highlight hex color
- backgroundColor: a light, clean background hex color (usually near-white)
- appIcon.emoji: use exactly "{emoji}"
- appIcon.backgroundColor: use the primaryColor

Return ONLY a valid JSON object — no markdown, no explanation:
{{
  "businessName": "{business_name}",
  "tagline": "...",
  "primaryColor": "#xxxxxx",
  "accentColor": "#xxxxxx",
  "backgroundColor": "#xxxxxx",
  "appIcon": {{ "emoji": "{emoji}", "backgroundColor": "#xxxxxx" }},
  "splashScreen": {{ "title": "{business_name}", "subtitle": "..." }},
  "navigation": [
    {{ "key": "home",   "label": "...", "icon": "home" }},
    {{ "key": "...",    "label": "...", "icon": "grid" }},
    {{ "key": "...",    "label": "...", "icon": "receipt" }},
    {{ "key": "profile","label": "Profile", "icon": "user" }}
  ],
  "screens": {{
    "home": {{
      "heroTitle": "...",
      "heroSubtitle": "...",
      "ctaText": "...",
      "promoText": "..."
    }},
    "about": {{
      "title": "...",
      "text": "..."
    }}
  }},
  "appStoreDescription": "...",
  "appStoreKeywords": "...",
  "notificationMessages": {{
    "orderConfirmed": "...",
    "orderReady": "..."
  }}
}}"""

    def _parse(raw: str) -> dict:
        raw = re.sub(r"^```(?:json)?\s*\n?", "", raw.strip(), flags=re.IGNORECASE)
        raw = re.sub(r"\n?```\s*$", "", raw.strip()).strip()
        return json.loads(raw)

    # Fallback chain: OpenAI → Gemini → MiniMax
    candidates = [
        ("OpenAI",   _get_openai()),
        ("Gemini",   _get_gemini()),
        ("MiniMax",  _get_minimax()),
    ]
    candidates = [(name, llm) for name, llm in candidates if llm]
    if not candidates:
        return {**state, "error": "No LLM available — set OPENAI_API_KEY, GEMINI_API_KEY, or MINIMAX_API_KEY"}

    last_error = ""
    for provider, llm in candidates:
        try:
            response = await llm.ainvoke(prompt)
            generated = _parse(response.content)
            try:
                MobileAppGenerationOutput.model_validate(generated)
            except ValidationError as ve:
                logger.error(f"Mobile app builder schema validation failed ({provider}): {ve}")
                return {**state, "error": f"AI output did not match expected schema: {ve}"}
            logger.info(f"{provider} generated mobile app config for {business_name}")
            return {**state, "generated_content": generated}
        except Exception as e:
            last_error = str(e)
            logger.warning(f"{provider} failed: {e} — trying next provider")

    logger.error(f"All providers failed. Last error: {last_error}")
    return {**state, "error": last_error}


def should_end_on_error(state: MobileAppState) -> str:
    return "end" if state.get("error") else "generate"


_builder = StateGraph(MobileAppState)
_builder.add_node("validate", validate_input)
_builder.add_node("generate", generate_with_gemini)
_builder.set_entry_point("validate")
_builder.add_conditional_edges("validate", should_end_on_error, {"generate": "generate", "end": END})
_builder.add_edge("generate", END)
mobile_app_graph = _builder.compile()


async def run_mobile_app_builder(business: dict, tone: str = "professional") -> dict:
    result = await mobile_app_graph.ainvoke({
        "business": business,
        "tone": tone,
        "generated_content": None,
        "error": None,
    })

    if result.get("error"):
        raise RuntimeError(result["error"])

    return result["generated_content"]
