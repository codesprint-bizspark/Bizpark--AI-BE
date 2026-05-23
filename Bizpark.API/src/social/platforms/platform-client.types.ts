import { SocialPlatform } from 'bizpark.core';

export type OAuthExchangeResult = {
    /** Long-lived access token (or whatever the platform returns). */
    accessToken: string;
    refreshToken?: string | null;
    /** Seconds until accessToken expires; null = unknown / non-expiring. */
    expiresInSec?: number | null;
    scope?: string | null;
    /** Identity that owns this token. */
    externalAccountId: string;
    externalPageId?: string | null;
    displayName?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    /** Anything else worth recording (page list, etc). */
    metadata?: Record<string, unknown>;
};

export type PublishMediaInput = {
    kind: 'IMAGE' | 'VIDEO' | 'THUMBNAIL';
    url: string;
    mimeType?: string | null;
};

export type PublishPostInput = {
    accessToken: string;
    externalPageId: string | null;
    externalAccountId: string;
    caption: string;
    hashtags: string[];
    cta?: string | null;
    media: PublishMediaInput[];
    /** Free-form additional fields, eg flyer prompt / video script. */
    aiMetadata?: Record<string, unknown> | null;
};

export type PublishPostResult = {
    externalPostId: string;
    externalPostUrl?: string | null;
    raw: Record<string, unknown>;
};

export interface PlatformClient {
    readonly platform: SocialPlatform;

    /** Build the URL the user is redirected to to start the OAuth dance. */
    getAuthorizationUrl(state: string): string;

    /** Exchange the OAuth code (returned to the callback URL) for tokens + identity. */
    exchangeCode(code: string): Promise<OAuthExchangeResult>;

    /** Refresh an access token using the refresh token. Returns the same shape. */
    refreshAccessToken(refreshToken: string): Promise<OAuthExchangeResult>;

    /** Best-effort: revoke / disconnect at the platform level. */
    disconnect(accessToken: string): Promise<void>;

    /** Publish the prepared post. Throws on failure (worker retries handle backoff). */
    publish(input: PublishPostInput): Promise<PublishPostResult>;
}
