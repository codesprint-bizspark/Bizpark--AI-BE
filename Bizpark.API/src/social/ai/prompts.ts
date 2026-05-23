import { SocialPlatform, SocialPostType } from 'bizpark.core';

export type BusinessBrief = {
    id: string;
    name: string;
    category?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    /** Website-derived: hero copy, about, products, brand colors, … */
    websiteSnapshot?: Record<string, unknown> | null;
    targetAudience?: string | null;
    /** Comma-separated keywords lifted from SEO. */
    keywords?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
};

export type ContentBrief = {
    platforms: SocialPlatform[];
    postType: SocialPostType;
    topic?: string;
    tone?: string;
    audience?: string;
    hashtagLimit?: number;
};

const PLATFORM_GUIDELINES: Record<SocialPlatform, string> = {
    FACEBOOK: `
- Long-form marketing caption (3–5 short paragraphs, ~600–900 characters).
- Open with a story or value hook, then features, then a clear CTA.
- 3–6 hashtags max — Facebook readers don't engage with hashtag walls.
- CTA examples: "Order now", "Book a table", "Visit our shop", "DM to enquire".
`,
    INSTAGRAM: `
- Engaging caption: a punchy hook in the first line, then 2–4 short lines of value,
  optional line break (use a separator like "·" or new-line stack), then CTA.
- 8–15 niche hashtags, mixing branded + community + discovery tags.
- Visual-first — the image/video is the hero; copy is the supporting cast.
- Use line breaks and at most 1–2 emojis (don't overdo it).
`,
    TIKTOK: `
- Short hook caption (under 150 characters, snappy + curiosity-driven).
- 3–6 trending-style hashtags including 1–2 broad ones (e.g. #fyp, #smallbusiness).
- Caption should feel like a video voiceover hook — "POV:", "Here's why…", "Wait for it…".
- Provide a video concept (one sentence) and a 3–5 beat scene script in aiMetadata.
`,
};

/**
 * Build a single OpenAI prompt that generates platform-tailored variants in one round trip.
 * Returns an object keyed by platform.
 */
export function buildSocialContentPrompt(brief: BusinessBrief, content: ContentBrief): string {
    const guidelines = content.platforms
        .map((p) => `### ${p}\n${PLATFORM_GUIDELINES[p]}`)
        .join('\n');

    const websiteSummary = brief.websiteSnapshot
        ? JSON.stringify(brief.websiteSnapshot).slice(0, 3000)
        : '(website not yet generated)';

    const postTypeRules: Record<SocialPostType, string> = {
        TEXT: `Text-only post. Do NOT generate image/flyer/video prompts.`,
        IMAGE: `Image post. Generate ONE high-quality image prompt for a brand-aligned promotional image.`,
        FLYER: `Flyer post. Generate ONE flyer design prompt — clearly composed with title, sub-text, key offer, logo placement, brand colors.`,
        VIDEO: `Short promotional video. Generate a 15–30s video script with 3–5 numbered scenes, subtitle lines per scene, and a one-line video concept summary.`,
    };

    return `You are an expert social media strategist for small businesses. Generate ready-to-publish posts.

=== BUSINESS ===
Name: ${brief.name}
Category: ${brief.category ?? 'General'}
Description: ${brief.description ?? '(none)'}
Target audience: ${content.audience ?? brief.targetAudience ?? 'Local customers, ages 18-45'}
Brand colors: primary ${brief.primaryColor ?? 'unspecified'}, secondary ${brief.secondaryColor ?? 'unspecified'}
Keywords: ${brief.keywords ?? '(none)'}

=== WEBSITE SNAPSHOT (truncated) ===
${websiteSummary}

=== CAMPAIGN ===
Topic / hook: ${content.topic ?? '(no specific campaign — promote the business broadly)'}
Tone: ${content.tone ?? 'friendly, confident, conversion-focused'}
Post type: ${content.postType}
${postTypeRules[content.postType]}
Hashtag limit per platform: ${content.hashtagLimit ?? 'use platform best-practice'}

=== PLATFORM RULES ===
${guidelines}

=== OUTPUT FORMAT (STRICT) ===
Return ONLY a single JSON object — no markdown, no commentary — with this exact shape:

{
  "variants": {
${content.platforms.map((p) => `    "${p}": {
      "caption": "...",
      "cta": "...",
      "hashtags": ["..."],
      ${content.postType === 'IMAGE' ? '"imagePrompt": "...",' : ''}
      ${content.postType === 'FLYER' ? '"flyerPrompt": "...",' : ''}
      ${content.postType === 'VIDEO' ? '"videoConcept": "...",\n      "videoScript": [{ "scene": 1, "visual": "...", "subtitle": "..." }],' : ''}
      "notes": "(optional short tip for the user)"
    }`).join(',\n')}
  }
}

Rules:
- DO NOT invent products, prices, or hours not present in the website snapshot or description.
- Hashtags MUST be lowercase, no spaces, no leading "#" character — we add it client-side.
- Captions must be safe-for-work and free of unverified claims ("#1", "best", etc).
- For VIDEO, scenes must be visually distinct and easily filmable on a phone.
`;
}

/**
 * Smaller prompt for regenerating a single field on an existing post.
 */
export function buildFieldRegenerationPrompt(args: {
    business: BusinessBrief;
    platform: SocialPlatform;
    field: 'caption' | 'hashtags' | 'cta' | 'image_prompt' | 'flyer_prompt' | 'video_script';
    current: Record<string, unknown>;
    instructions?: string;
}): string {
    const fieldRules: Record<typeof args.field, string> = {
        caption: 'Rewrite the caption only. Keep the same intent but change the angle / hook / phrasing.',
        hashtags: 'Generate a fresh set of hashtags (same count) — vary the mix of niche / community / discovery.',
        cta: 'Rewrite ONLY the CTA — keep it short, action-driven, and platform-appropriate.',
        image_prompt: 'Generate a brand-new image prompt for the same campaign. Vary the composition / mood.',
        flyer_prompt: 'Generate a brand-new flyer prompt. Vary the layout (split / centered / banner).',
        video_script: 'Generate a brand-new 3–5 scene video script — vary the hook and structure.',
    };
    return `You are tweaking a single field of an existing social post.

Business: ${args.business.name} (${args.business.category ?? 'General'})
Platform: ${args.platform}
Field to regenerate: ${args.field}
${args.instructions ? `User instructions: ${args.instructions}` : ''}

Existing post (for context only — do NOT echo it back):
${JSON.stringify(args.current).slice(0, 2000)}

Task: ${fieldRules[args.field]}

Return ONLY a JSON object with the key matching the camelCase field name:
${args.field === 'caption' ? '{ "caption": "..." }' : ''}
${args.field === 'hashtags' ? '{ "hashtags": ["..."] }' : ''}
${args.field === 'cta' ? '{ "cta": "..." }' : ''}
${args.field === 'image_prompt' ? '{ "imagePrompt": "..." }' : ''}
${args.field === 'flyer_prompt' ? '{ "flyerPrompt": "..." }' : ''}
${args.field === 'video_script' ? '{ "videoConcept": "...", "videoScript": [{ "scene": 1, "visual": "...", "subtitle": "..." }] }' : ''}

No markdown, no commentary.`;
}
