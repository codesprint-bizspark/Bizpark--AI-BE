import {
    SocialMediaKind,
    SocialMediaSource,
    SocialPlatform,
    SocialPostType,
} from '../../typeorm/entities/shared/enums';

// ────────────────────────────────────────────────────────────────────────────
// OAuth — initiate / callback / disconnect
// ────────────────────────────────────────────────────────────────────────────

export class InitiateOAuthDto {
    businessId!: string;
    platform!: SocialPlatform;
    redirectAfterConnect?: string;
}

export class OAuthCallbackQueryDto {
    code!: string;
    state!: string;
    error?: string;
    error_description?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Content generation
// ────────────────────────────────────────────────────────────────────────────

export class GenerateSocialContentDto {
    businessId!: string;
    /** One or more platforms to generate variants for. */
    platforms!: SocialPlatform[];
    postType!: SocialPostType;
    /** Optional theme / campaign hook — eg "weekend sale", "new menu launch". */
    topic?: string;
    /** Tone override (defaults to business default). */
    tone?: 'professional' | 'friendly' | 'bold' | 'minimal' | string;
    /** Target audience override. */
    audience?: string;
    /** Maximum number of hashtags (platform best-practice defaults apply). */
    hashtagLimit?: number;
    /** If set, image/flyer/video assets are produced as well. */
    generateMedia?: boolean;
    /** Optional source generation to base regeneration on. */
    sourceGenerationId?: string;
}

export class RegenerateContentFieldDto {
    /** Which field of the post to regenerate. */
    field!: 'caption' | 'hashtags' | 'cta' | 'image_prompt' | 'flyer_prompt' | 'video_script';
    /** Optional instruction to tweak the regeneration. */
    instructions?: string;
}

export class UpdatePostContentDto {
    caption?: string;
    cta?: string;
    hashtags?: string[];
    scheduledAt?: string | null;
    platform?: SocialPlatform;
    postType?: SocialPostType;
    accountId?: string | null;
    aiMetadata?: Record<string, unknown> | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Media management
// ────────────────────────────────────────────────────────────────────────────

export class AttachMediaDto {
    url!: string;
    kind!: SocialMediaKind;
    source?: SocialMediaSource;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
    position?: number;
    prompt?: string;
    metadata?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Publishing
// ────────────────────────────────────────────────────────────────────────────

export class SchedulePostDto {
    /** ISO-8601 timestamp; must be in the future. */
    scheduledAt!: string;
}

export class PublishNowDto {
    /** Optional accountId override; otherwise uses post.accountId. */
    accountId?: string;
}
