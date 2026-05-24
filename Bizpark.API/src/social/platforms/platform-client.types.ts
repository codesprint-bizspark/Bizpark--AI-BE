import { SocialPlatform } from 'bizpark.core';

export type PublishPostInput = {
    accessToken: string;
    externalPageId?: string | null;
    externalAccountId: string;
    caption: string;
    hashtags?: string[];
    cta?: string | null;
    media?: Array<{ kind: string; url: string; mimeType?: string | null }>;
    aiMetadata?: unknown;
};

export type PublishPostResult = {
    externalPostId: string;
    externalPostUrl: string | null;
    raw: unknown;
};

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

    /** Publish a post to the platform. */
    publish(input: PublishPostInput): Promise<PublishPostResult>;
}
