import { Injectable, Logger } from '@nestjs/common';
import { SocialPlatform } from 'bizpark.core';
import {
    OAuthExchangeResult,
    PlatformClient,
    PublishPostInput,
    PublishPostResult,
} from './platform-client.types';

/**
 * Instagram API with Instagram Login (Business / Creator accounts).
 *
 * Unlike the older "Instagram Graph API via Facebook Login" flow, this one
 * sends the user to instagram.com directly — no Facebook Page linkage required.
 *
 * Required env:
 *   INSTAGRAM_APP_ID                (Instagram app id — NOT the Facebook app id)
 *   INSTAGRAM_APP_SECRET            (Instagram app secret)
 *   INSTAGRAM_REDIRECT_URI          (must EXACTLY match the value configured in the
 *                                    Instagram app dashboard)
 *   INSTAGRAM_SCOPES                (optional override)
 *
 * Default scopes:
 *   instagram_business_basic            – read IG business profile
 *   instagram_business_content_publish  – publish content to IG
 *
 * The user MUST have an Instagram Business or Creator account.
 *
 * Meta App Dashboard setup:
 *   1. App Dashboard → Add Product → "Instagram" → "API setup with Instagram login"
 *   2. Instagram → API setup with Instagram login → set OAuth Redirect URIs:
 *        http://localhost:3000/api/social/accounts/callback
 *   3. App Roles → Roles → add YOUR IG account as Admin/Developer/Tester (dev mode)
 *   4. App Review → request each permission above before going Live.
 */
@Injectable()
export class InstagramClient implements PlatformClient {
    private readonly logger = new Logger(InstagramClient.name);
    readonly platform = SocialPlatform.INSTAGRAM;

    private readonly IG_OAUTH = 'https://www.instagram.com/oauth/authorize';
    private readonly IG_API = 'https://api.instagram.com';
    private readonly IG_GRAPH = 'https://graph.instagram.com';

    private get appId() { return process.env.INSTAGRAM_APP_ID || ''; }
    private get appSecret() { return process.env.INSTAGRAM_APP_SECRET || ''; }
    private get redirectUri() { return process.env.INSTAGRAM_REDIRECT_URI || ''; }

    private get defaultScopes(): string[] {
        const raw = process.env.INSTAGRAM_SCOPES
            || process.env.INSTAGRAM_DEFAULT_SCOPES
            || 'instagram_business_basic,instagram_business_content_publish';
        return raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }

    private get hardRequiredScopes(): string[] {
        return ['instagram_business_basic'];
    }

    private get publishingScopes(): string[] {
        return ['instagram_business_content_publish'];
    }

    getAuthorizationUrl(state: string): string {
        if (!this.appId) throw new Error('INSTAGRAM_APP_ID is not configured');
        if (!this.appSecret) throw new Error('INSTAGRAM_APP_SECRET is not configured');
        if (!this.redirectUri) throw new Error('INSTAGRAM_REDIRECT_URI is not configured');

        const params = new URLSearchParams({
            client_id: this.appId,
            redirect_uri: this.redirectUri,
            state,
            scope: this.defaultScopes.join(','),
            response_type: 'code',
        });
        return `${this.IG_OAUTH}?${params.toString()}`;
    }

    async exchangeCode(code: string): Promise<OAuthExchangeResult> {
        // Instagram strips an optional `#_` fragment onto the code; remove it.
        const cleanCode = code.replace(/#_$/, '');

        // 1) Short-lived user token (POST form-encoded to api.instagram.com)
        const form = new URLSearchParams({
            client_id: this.appId,
            client_secret: this.appSecret,
            grant_type: 'authorization_code',
            redirect_uri: this.redirectUri,
            code: cleanCode,
        });
        const shortRes = await fetch(`${this.IG_API}/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
        });
        if (!shortRes.ok) throw this.toReadableError('token exchange', shortRes.status, await shortRes.text());
        const shortTok = (await shortRes.json()) as {
            access_token: string;
            user_id: number | string;
            permissions?: string[] | string;
        };

        // 2) Long-lived token (~60 days, refreshable)
        const longUrl = `${this.IG_GRAPH}/access_token?${new URLSearchParams({
            grant_type: 'ig_exchange_token',
            client_secret: this.appSecret,
            access_token: shortTok.access_token,
        }).toString()}`;
        const longRes = await fetch(longUrl);
        if (!longRes.ok) throw this.toReadableError('long-lived token exchange', longRes.status, await longRes.text());
        const longTok = (await longRes.json()) as {
            access_token: string;
            token_type?: string;
            expires_in?: number;
        };
        const userToken = longTok.access_token;

        // 3) Verify granted scopes — Instagram returns these in the short-token
        //    response as either an array or comma-separated string.
        const granted = new Set<string>(
            Array.isArray(shortTok.permissions)
                ? shortTok.permissions
                : (shortTok.permissions || '').split(',').map((s) => s.trim()).filter(Boolean),
        );
        const missingHard = this.hardRequiredScopes.filter((s) => !granted.has(s));
        if (granted.size > 0 && missingHard.length > 0) {
            throw new Error(
                `Instagram connect cancelled — required permission${missingHard.length > 1 ? 's' : ''} not granted: ${missingHard.join(', ')}. `
                + 'In Meta App Dashboard → Instagram → API setup with Instagram login, request these permissions, '
                + 'and make sure the connecting account has an App Role (Admin/Developer/Tester) in Development Mode.',
            );
        }
        const missingPublishing = this.publishingScopes.filter((s) => !granted.has(s));
        if (granted.size > 0 && missingPublishing.length > 0) {
            this.logger.warn(
                `[connect] Instagram account will be saved with LIMITED permissions — missing: ${missingPublishing.join(', ')}.`,
            );
        }

        // 4) Fetch profile — me endpoint on graph.instagram.com
        const meUrl = `${this.IG_GRAPH}/me?${new URLSearchParams({
            fields: 'id,user_id,username,name,account_type,profile_picture_url,followers_count',
            access_token: userToken,
        }).toString()}`;
        const meRes = await fetch(meUrl);
        if (!meRes.ok) throw this.toReadableError('profile lookup', meRes.status, await meRes.text());
        const me = (await meRes.json()) as {
            id: string;
            user_id?: string | number;
            username?: string;
            name?: string;
            account_type?: string;
            profile_picture_url?: string;
            followers_count?: number;
        };

        if (me.account_type && !/BUSINESS|CREATOR/i.test(me.account_type)) {
            throw new Error(
                `Instagram account "${me.username ?? me.id}" is a ${me.account_type} account — `
                + 'only Business or Creator accounts can publish via the API. '
                + 'In the Instagram app: Settings → Account → Switch to Professional → Business/Creator.',
            );
        }

        return {
            accessToken: userToken,
            refreshToken: null,
            expiresInSec: longTok.expires_in ?? null,
            externalAccountId: String(me.id),
            externalPageId: null,
            displayName: me.name || me.username || null,
            username: me.username || null,
            avatarUrl: me.profile_picture_url || null,
            scope: Array.from(granted).join(',') || this.defaultScopes.join(','),
            metadata: {
                userId: me.user_id ?? null,
                accountType: me.account_type ?? null,
                followersCount: me.followers_count ?? null,
                grantedScopes: Array.from(granted),
                missingPublishingScopes: missingPublishing,
            },
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<OAuthExchangeResult> {
        // Instagram long-lived tokens are refreshed by calling /refresh_access_token
        // with the existing (still-valid) token. We treat the passed-in argument as
        // that existing token since this client doesn't keep a separate refresh token.
        const url = `${this.IG_GRAPH}/refresh_access_token?${new URLSearchParams({
            grant_type: 'ig_refresh_token',
            access_token: refreshToken,
        }).toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw this.toReadableError('refresh', res.status, await res.text());
        const body = (await res.json()) as { access_token: string; expires_in?: number };
        return {
            accessToken: body.access_token,
            refreshToken: null,
            expiresInSec: body.expires_in ?? null,
            externalAccountId: '',
        };
    }

    async disconnect(_accessToken: string): Promise<void> {
        // Instagram API with Instagram Login doesn't expose a permission-revocation
        // endpoint — the user revokes from instagram.com → Settings → Apps & Websites.
        // We just no-op so the row is soft-deleted locally.
    }

    private toReadableError(stage: string, status: number, rawBody: string): Error {
        let parsed: { error_type?: string; error_message?: string; error?: { message?: string } } | null = null;
        try { parsed = JSON.parse(rawBody); } catch { /* not JSON */ }
        const msg = parsed?.error_message || parsed?.error?.message || rawBody;

        if (/invalid scope/i.test(msg)) {
            return new Error(
                `Instagram rejected the requested OAuth scopes during ${stage}: ${msg}. `
                + 'In Meta App Dashboard → Instagram → API setup with Instagram login, request: '
                + 'instagram_business_basic, instagram_business_content_publish. '
                + 'Override via INSTAGRAM_SCOPES if needed.',
            );
        }
        if (/redirect[_ ]uri/i.test(msg)) {
            return new Error(
                `Instagram rejected the redirect URI during ${stage}: ${msg}. `
                + 'It must exactly match the value configured in Instagram → API setup with Instagram login → OAuth Redirect URIs.',
            );
        }
        return new Error(`Instagram ${stage} failed: ${status} ${msg}`);
    }

    // ── Publishing ──────────────────────────────────────────────────────────────

    async publish(input: PublishPostInput): Promise<PublishPostResult> {
        const { accessToken, externalAccountId, caption, cta, hashtags, media } = input;
        if (!externalAccountId) throw new Error('Instagram publishing requires externalAccountId (IG business account ID)');

        const captionText = this.buildCaption(caption, cta, hashtags);
        const images = (media || []).filter(m => ['IMAGE', 'THUMBNAIL'].includes(m.kind));
        const videos = (media || []).filter(m => m.kind === 'VIDEO');

        let containerId: string;

        if (videos.length > 0) {
            const videoUrl = this.toPublicUrl(videos[0].url, videos[0].id);
            const body = await this.igPost(`/${externalAccountId}/media`, accessToken, {
                media_type: 'REELS',
                video_url: videoUrl,
                caption: captionText,
            });
            containerId = String(body['id'] ?? '');
            await this.waitContainer(containerId, accessToken);
        } else if (images.length > 1) {
            const children: string[] = [];
            for (const img of images) {
                const imageUrl = this.toPublicUrl(img.url, img.id);
                const child = await this.igPost(`/${externalAccountId}/media`, accessToken, {
                    image_url: imageUrl,
                    is_carousel_item: true,
                });
                children.push(String(child['id'] ?? ''));
            }
            const carousel = await this.igPost(`/${externalAccountId}/media`, accessToken, {
                media_type: 'CAROUSEL',
                children: children.join(','),
                caption: captionText,
            });
            containerId = String(carousel['id'] ?? '');
        } else if (images.length === 1) {
            const imageUrl = this.toPublicUrl(images[0].url, images[0].id);
            const body = await this.igPost(`/${externalAccountId}/media`, accessToken, {
                image_url: imageUrl,
                caption: captionText,
            });
            containerId = String(body['id'] ?? '');
        } else {
            throw new Error('Instagram requires at least one image or video');
        }

        if (!containerId) throw new Error('Instagram media container creation failed — no id returned');

        const pub = await this.igPost(`/${externalAccountId}/media_publish`, accessToken, { creation_id: containerId });
        const postId = String(pub['id'] ?? '');

        // The published media id is NOT a public shortcode — fetch the real permalink.
        let permalink: string | null = null;
        if (postId) {
            try {
                const permUrl = `${this.IG_GRAPH}/${postId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`;
                const permRes = await fetch(permUrl);
                const permData = await permRes.json() as Record<string, unknown>;
                if (permRes.ok && typeof permData['permalink'] === 'string') {
                    permalink = permData['permalink'] as string;
                }
            } catch (e) {
                this.logger.warn(`Could not fetch IG permalink for ${postId}: ${(e as Error).message}`);
            }
        }

        return {
            externalPostId: postId,
            externalPostUrl: permalink,
            raw: pub,
        };
    }

    private buildCaption(caption: string, cta?: string | null, hashtags?: string[]): string {
        const tagStr = (hashtags || []).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
        return [caption, cta, tagStr].filter(Boolean).join('\n\n');
    }

    private async igPost(path: string, token: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
        const url = `${this.IG_GRAPH}${path}?access_token=${encodeURIComponent(token)}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json() as Record<string, unknown>;
        if (!resp.ok || data['error']) {
            const msg = (data['error'] as any)?.message || JSON.stringify(data);
            throw new Error(`Instagram ${path} failed (${resp.status}): ${msg}`);
        }
        return data;
    }

    /**
     * Instagram's Graph API needs a publicly fetchable URL for image_url /
     * video_url — it can't consume data URIs. For media stored as data URIs we
     * return a public URL pointing at our PublicMediaController, which decodes
     * and streams the bytes. Requires PUBLIC_API_URL to be set to a URL the
     * Instagram servers can reach (e.g. an ngrok HTTPS URL in dev).
     */
    private toPublicUrl(url: string, mediaId: string): string {
        if (!url.startsWith('data:')) return url;
        const base = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
        if (!base) {
            throw new Error(
                'Cannot publish media stored as a data URI: PUBLIC_API_URL is not configured. '
                + 'Set it to a URL the Instagram servers can reach (e.g. your ngrok HTTPS URL), '
                + 'then retry. Example: PUBLIC_API_URL=https://<ngrok-id>.ngrok-free.dev',
            );
        }
        return `${base}/api/social/media/${mediaId}/raw`;
    }

    private async waitContainer(containerId: string, token: string, attempts = 20, delay = 3000): Promise<void> {
        for (let i = 0; i < attempts; i++) {
            const url = `${this.IG_GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
            const resp = await fetch(url);
            const body = await resp.json() as Record<string, unknown>;
            const status = body['status_code'] || body['status'];
            if (status === 'FINISHED') return;
            if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`IG container ${status}: ${JSON.stringify(body)}`);
            await new Promise(r => setTimeout(r, delay));
        }
        throw new Error('IG container did not reach FINISHED within timeout');
    }
}
