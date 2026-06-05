import { SocialPlatform } from 'bizpark.core';

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
