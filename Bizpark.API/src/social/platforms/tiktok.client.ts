import { Injectable, Logger } from '@nestjs/common';
import { SocialPlatform } from 'bizpark.core';
import {
    OAuthExchangeResult,
    PlatformClient,
    PublishPostInput,
    PublishPostResult,
} from './platform-client.types';

const TT_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TT_OAUTH_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TT_API = 'https://open.tiktokapis.com/v2';

/**
 * TikTok Login Kit + Content Posting API.
 *
 * Required env:
 *   TIKTOK_CLIENT_KEY
 *   TIKTOK_CLIENT_SECRET
 *   TIKTOK_REDIRECT_URI
 *
 * Required scopes:
 *   user.info.basic
 *   video.upload  OR  video.publish  (the latter is required to post)
 *   (Image posts need photo.publish — approved on a per-app basis.)
 *
 * Note: TikTok only supports video uploads in production. We use the
 * PULL_FROM_URL flow (publicly accessible CDN URL) — simpler than chunked upload.
 */
@Injectable()
export class TikTokClient implements PlatformClient {
    private readonly logger = new Logger(TikTokClient.name);
    readonly platform = SocialPlatform.TIKTOK;

    private get clientKey() { return process.env.TIKTOK_CLIENT_KEY || ''; }
    private get clientSecret() { return process.env.TIKTOK_CLIENT_SECRET || ''; }
    private get redirectUri() { return process.env.TIKTOK_REDIRECT_URI || ''; }
    private get defaultScopes() {
        return process.env.TIKTOK_DEFAULT_SCOPES || 'user.info.basic,video.upload,video.publish';
    }

    getAuthorizationUrl(state: string): string {
        const params = new URLSearchParams({
            client_key: this.clientKey,
            response_type: 'code',
            scope: this.defaultScopes,
            redirect_uri: this.redirectUri,
            state,
        });
        return `${TT_AUTH}?${params.toString()}`;
    }

    async exchangeCode(code: string): Promise<OAuthExchangeResult> {
        const res = await fetch(TT_OAUTH_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: this.clientKey,
                client_secret: this.clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri,
            }).toString(),
        });
        const body = (await res.json()) as {
            access_token: string;
            expires_in: number;
            refresh_token: string;
            refresh_expires_in: number;
            scope: string;
            open_id: string;
            error?: string;
            error_description?: string;
        };
        if (!res.ok || body.error) {
            throw new Error(`TikTok token exchange failed: ${body.error || res.status} ${body.error_description || ''}`);
        }

        // Look up user info for display
        let displayName: string | null = null;
        let avatarUrl: string | null = null;
        let username: string | null = null;
        try {
            const userRes = await fetch(`${TT_API}/user/info/?fields=open_id,display_name,avatar_url,username`, {
                headers: { Authorization: `Bearer ${body.access_token}` },
            });
            const userBody = await userRes.json() as { data?: { user?: { display_name?: string; avatar_url?: string; username?: string } } };
            displayName = userBody.data?.user?.display_name ?? null;
            avatarUrl = userBody.data?.user?.avatar_url ?? null;
            username = userBody.data?.user?.username ?? null;
        } catch (e) {
            this.logger.warn(`TikTok user info fetch failed: ${(e as Error).message}`);
        }

        return {
            accessToken: body.access_token,
            refreshToken: body.refresh_token,
            expiresInSec: body.expires_in,
            externalAccountId: body.open_id,
            externalPageId: null,
            scope: body.scope,
            displayName,
            avatarUrl,
            username,
            metadata: { refresh_expires_in: body.refresh_expires_in },
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<OAuthExchangeResult> {
        const res = await fetch(TT_OAUTH_TOKEN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: this.clientKey,
                client_secret: this.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }).toString(),
        });
        const body = (await res.json()) as {
            access_token: string;
            expires_in: number;
            refresh_token: string;
            refresh_expires_in: number;
            scope: string;
            open_id: string;
            error?: string;
            error_description?: string;
        };
        if (!res.ok || body.error) {
            throw new Error(`TikTok refresh failed: ${body.error || res.status} ${body.error_description || ''}`);
        }
        return {
            accessToken: body.access_token,
            refreshToken: body.refresh_token,
            expiresInSec: body.expires_in,
            externalAccountId: body.open_id,
            externalPageId: null,
            scope: body.scope,
        };
    }

    async disconnect(accessToken: string): Promise<void> {
        try {
            await fetch(`${TT_API}/oauth/revoke/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_key: this.clientKey,
                    client_secret: this.clientSecret,
                    token: accessToken,
                }).toString(),
            });
        } catch (e) {
            this.logger.warn(`TikTok disconnect failed: ${(e as Error).message}`);
        }
    }

    async publish(input: PublishPostInput): Promise<PublishPostResult> {
        const video = input.media.find((m) => m.kind === 'VIDEO');
        if (!video) {
            throw new Error('TikTok publish requires a VIDEO media item (PULL_FROM_URL).');
        }

        const captionParts = [
            input.caption,
            input.cta,
            input.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '),
        ].filter(Boolean).join(' ');

        const initRes = await fetch(`${TT_API}/post/publish/video/init/`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${input.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                post_info: {
                    title: captionParts.slice(0, 150),
                    privacy_level: process.env.TIKTOK_DEFAULT_PRIVACY || 'SELF_ONLY',
                    disable_duet: false,
                    disable_comment: false,
                    disable_stitch: false,
                    video_cover_timestamp_ms: 1000,
                },
                source_info: {
                    source: 'PULL_FROM_URL',
                    video_url: video.url,
                },
            }),
        });
        const initBody = await initRes.json() as {
            data?: { publish_id?: string };
            error?: { code?: string; message?: string };
        };
        if (!initRes.ok || initBody.error?.code !== 'ok') {
            throw new Error(`TikTok publish init failed: ${initBody.error?.message || initRes.status} ${JSON.stringify(initBody)}`);
        }
        const publishId = initBody.data?.publish_id!;

        // Poll status
        const url = await this.waitForPublishStatus(publishId, input.accessToken);
        return {
            externalPostId: publishId,
            externalPostUrl: url,
            raw: initBody as unknown as Record<string, unknown>,
        };
    }

    private async waitForPublishStatus(publishId: string, accessToken: string, attempts = 20, delayMs = 3000): Promise<string | null> {
        for (let i = 0; i < attempts; i += 1) {
            const r = await fetch(`${TT_API}/post/publish/status/fetch/`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ publish_id: publishId }),
            });
            const body = await r.json() as {
                data?: { status?: string; publicaly_available_post_id?: string[]; share_url?: string };
                error?: { code?: string; message?: string };
            };
            const status = body.data?.status;
            if (status === 'PUBLISH_COMPLETE') return body.data?.share_url || null;
            if (status === 'FAILED' || status === 'EXPIRED') {
                throw new Error(`TikTok publish ${status}: ${JSON.stringify(body)}`);
            }
            await new Promise((res) => setTimeout(res, delayMs));
        }
        // Timed out — return null URL but treat the publish_id as the externalPostId so the user can still track it.
        return null;
    }
}
