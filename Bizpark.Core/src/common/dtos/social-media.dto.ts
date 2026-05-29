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

/**
 * A piece of user-uploaded media to attach to every post created by this
 * generation. The `url` MUST be a data URL (`data:<mime>;base64,...`) — the
 * runner stores it verbatim in the SocialPostMedia row so the existing
 * data-URL → upload path (FacebookClient.uploadMedia, etc.) handles publishing.
 */
export class GenerateUserMediaItem {
    url!: string;
    kind!: SocialMediaKind;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
    originalName?: string;
    sizeBytes?: number;
}

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
    /**
     * Optional user-uploaded media to attach to every generated post. The
     * agent inserts these as SocialPostMedia rows atomically with the post
     * creation, so by the time the FE polls and sees the task COMPLETED, the
     * media is already in the database — no separate upload step needed.
     */
    userMedia?: GenerateUserMediaItem[];
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

/**
 * Attach multiple user-uploaded files (images / videos) to a post in a single
 * call. Each item carries the binary content as a base64 data URL (matches the
 * existing storage format used by OpenAI image generations).
 *
 * Used by the "Upload from device" flow on the Generate and Post Detail pages.
 */
export class BulkAttachMediaDto {
    items!: AttachMediaDto[];
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
