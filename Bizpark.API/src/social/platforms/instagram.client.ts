import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { SocialPlatform } from 'bizpark.core';
import {
    OAuthExchangeResult,
    PlatformClient,
    PublishPostInput,
    PublishPostResult,
} from './platform-client.types';

const FB_GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v21.0';
const FB_GRAPH = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;
const FB_OAUTH = `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`;

type GrantedPermission = { permission: string; status: 'granted' | 'declined' | 'expired' };

/**
 * Instagram Graph API (Business / Creator accounts only — NOT Basic Display).
 *
 * Required env:
 *   INSTAGRAM_APP_ID                (often the same as FACEBOOK_APP_ID)
 *   INSTAGRAM_APP_SECRET            (often the same as FACEBOOK_APP_SECRET)
 *   INSTAGRAM_REDIRECT_URI
 *   INSTAGRAM_SCOPES                (optional override)
 *
 * Default scopes (minimal, no email / public_profile):
 *   instagram_basic            – read IG business profile
 *   instagram_content_publish  – publish content to IG
 *   pages_show_list            – discover the linked FB Page
 *   pages_read_engagement      – required by Meta with IG publishing
 *
 * The user MUST have an Instagram Business or Creator account linked to a
 * Facebook Page. Personal IG accounts cannot publish via the API.
 *
 * Meta App Dashboard setup (Development Mode, localhost):
 *   1. App Dashboard → Add Product → Facebook Login (Web)
 *   2. App Dashboard → Add Product → Instagram Graph API
 *   3. Facebook Login → Settings → Valid OAuth Redirect URIs:
 *        http://localhost:3000/api/social/accounts/callback
 *   4. App Roles → Roles → add YOUR FB account as Admin/Developer/Tester
 *   5. App Review → Permissions and Features → request each scope above.
 */
@Injectable()
export class InstagramClient implements PlatformClient {
    private readonly logger = new Logger(InstagramClient.name);
    readonly platform = SocialPlatform.INSTAGRAM;

    private get appId() { return process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID || ''; }
    private get appSecret() { return process.env.INSTAGRAM_APP_SECRET || process.env.FACEBOOK_APP_SECRET || ''; }
    private get redirectUri() { return process.env.INSTAGRAM_REDIRECT_URI || ''; }

    private get defaultScopes(): string[] {
        const raw = process.env.INSTAGRAM_SCOPES
            || process.env.INSTAGRAM_DEFAULT_SCOPES
            || 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement';
        const REJECTED_BY_DEFAULT = new Set(['email', 'public_profile']);
        return raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !REJECTED_BY_DEFAULT.has(s));
    }

    // Hard-required: needed to even find the IG business account during connect.
    private get hardRequiredScopes(): string[] {
        return ['pages_show_list', 'instagram_basic'];
    }

    // Soft-required: needed to publish. Missing → save anyway, mark Limited.
    private get publishingScopes(): string[] {
        return ['instagram_content_publish', 'pages_read_engagement'];
    }

    private appsecretProof(token: string): string {
        return createHmac('sha256', this.appSecret).update(token).digest('hex');
    }

    private withAuth(url: string, token: string): string {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}access_token=${encodeURIComponent(token)}&appsecret_proof=${this.appsecretProof(token)}`;
    }

    getAuthorizationUrl(state: string): string {
        if (!this.appId) throw new Error('INSTAGRAM_APP_ID (or FACEBOOK_APP_ID) is not configured');
        if (!this.appSecret) throw new Error('INSTAGRAM_APP_SECRET (or FACEBOOK_APP_SECRET) is not configured');
        if (!this.redirectUri) throw new Error('INSTAGRAM_REDIRECT_URI is not configured');

        const params = new URLSearchParams({
            client_id: this.appId,
            redirect_uri: this.redirectUri,
            state,
            scope: this.defaultScopes.join(','),
            response_type: 'code',
            auth_type: 'rerequest',
        });
        return `${FB_OAUTH}?${params.toString()}`;
    }

    async exchangeCode(code: string): Promise<OAuthExchangeResult> {
        // 1) Short-lived user token
        const tokRes = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
            client_id: this.appId,
            client_secret: this.appSecret,
            redirect_uri: this.redirectUri,
            code,
        }).toString()}`);
        if (!tokRes.ok) throw this.toReadableError('token exchange', tokRes.status, await tokRes.text());
        const shortTok = (await tokRes.json()) as { access_token: string };

        // 2) Long-lived user token
        const longRes = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: shortTok.access_token,
        }).toString()}`);
        if (!longRes.ok) throw this.toReadableError('long-lived token exchange', longRes.status, await longRes.text());
        const longTok = (await longRes.json()) as { access_token: string; expires_in?: number };
        const userToken = longTok.access_token;

        // 3) Inspect granted permissions — hard requirements throw, soft ones
        //    just get recorded in metadata so the UI can show "Limited".
        const grantedScopes = await this.fetchGrantedPermissions(userToken);
        const missingHard = this.hardRequiredScopes.filter((s) => !grantedScopes.has(s));
        if (missingHard.length > 0) {
            throw new Error(
                `Instagram connect cancelled — required permission${missingHard.length > 1 ? 's' : ''} not granted: ${missingHard.join(', ')}. `
                + 'In Meta App Dashboard enable these under Use cases and add yourself as an App Tester. '
                + 'To force a fresh consent prompt, remove the app from facebook.com → Settings → Apps and Websites first.',
            );
        }
        const missingPublishing = this.publishingScopes.filter((s) => !grantedScopes.has(s));
        if (missingPublishing.length > 0) {
            this.logger.warn(
                `[connect] Instagram account will be saved with LIMITED permissions — missing: ${missingPublishing.join(', ')}.`,
            );
        }

        // 4) Find a Page with an Instagram Business account linked
        const pagesRes = await fetch(this.withAuth(
            `${FB_GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url,followers_count}`,
            userToken,
        ));
        if (!pagesRes.ok) throw this.toReadableError('list Pages', pagesRes.status, await pagesRes.text());
        const pages = (await pagesRes.json()) as {
            data: Array<{
                id: string;
                name: string;
                access_token: string;
                instagram_business_account?: {
                    id: string;
                    name?: string;
                    username?: string;
                    profile_picture_url?: string;
                    followers_count?: number;
                };
            }>;
        };

        const pageWithIg = pages.data?.find((p) => p.instagram_business_account?.id);
        if (!pageWithIg || !pageWithIg.instagram_business_account) {
            throw new Error(
                'No Instagram Business account linked to any of your Facebook Pages. '
                + 'In the Instagram app: Settings → Account → Switch to Professional → Business/Creator. '
                + 'Then in Facebook: link the Instagram account to a Facebook Page you admin.',
            );
        }

        const ig = pageWithIg.instagram_business_account;

        return {
            // Page Access Token also works for IG publishing endpoints.
            accessToken: pageWithIg.access_token,
            refreshToken: null,
            expiresInSec: null, // Page tokens don't expire
            externalAccountId: ig.id,
            externalPageId: pageWithIg.id,
            displayName: ig.name || ig.username || null,
            username: ig.username || null,
            avatarUrl: ig.profile_picture_url || null,
            scope: this.defaultScopes.join(','),
            metadata: {
                userToken,
                userTokenExpiresInSec: longTok.expires_in ?? null,
                pageId: pageWithIg.id,
                igBusinessId: ig.id,
                followersCount: ig.followers_count ?? null,
                grantedScopes: Array.from(grantedScopes),
                missingPublishingScopes: missingPublishing,
            },
        };
    }

    async refreshAccessToken(_refreshToken: string): Promise<OAuthExchangeResult> {
        throw new Error('Instagram (Graph) tokens are page tokens — reconnect required if expired.');
    }

    private async fetchGrantedPermissions(userToken: string): Promise<Set<string>> {
        try {
            const r = await fetch(this.withAuth(`${FB_GRAPH}/me/permissions`, userToken));
            if (!r.ok) {
                this.logger.warn(`Could not read /me/permissions: ${r.status}`);
                return new Set();
            }
            const body = (await r.json()) as { data?: GrantedPermission[] };
            return new Set((body.data || []).filter((p) => p.status === 'granted').map((p) => p.permission));
        } catch (e) {
            this.logger.warn(`/me/permissions threw: ${(e as Error).message}`);
            return new Set();
        }
    }

    private toReadableError(stage: string, status: number, rawBody: string): Error {
        let parsed: { error?: { message?: string; type?: string; code?: number } } | null = null;
        try { parsed = JSON.parse(rawBody); } catch { /* not JSON */ }
        const msg = parsed?.error?.message || rawBody;

        if (/invalid scope/i.test(msg)) {
            return new Error(
                `Instagram (Meta) rejected the requested OAuth scopes during ${stage}: ${msg}. `
                + 'In Meta App Dashboard add the "Instagram Graph API" product, then under "Use Cases" / '
                + '"Permissions and Features" request: instagram_basic, instagram_content_publish, '
                + 'pages_show_list, pages_read_engagement. In Development Mode the user must have an App Role. '
                + 'Override via INSTAGRAM_SCOPES if needed.',
            );
        }
        if (/redirect[_ ]uri/i.test(msg)) {
            return new Error(
                `Instagram rejected the redirect URI during ${stage}: ${msg}. `
                + 'It must exactly match the value in Facebook Login → Settings → Valid OAuth Redirect URIs.',
            );
        }
        return new Error(`Instagram ${stage} failed: ${status} ${msg}`);
    }

    async disconnect(accessToken: string): Promise<void> {
        try {
            await fetch(this.withAuth(`${FB_GRAPH}/me/permissions`, accessToken), { method: 'DELETE' });
        } catch (e) {
            this.logger.warn(`IG disconnect failed: ${(e as Error).message}`);
        }
    }

    async publish(input: PublishPostInput): Promise<PublishPostResult> {
        const igId = input.externalAccountId;
        if (!igId) throw new Error('Instagram publish requires externalAccountId (IG business id)');

        const captionParts = [
            input.caption,
            input.cta,
            input.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '),
        ].filter(Boolean).join('\n\n');

        const images = input.media.filter((m) => m.kind === 'IMAGE' || m.kind === 'THUMBNAIL');
        const videos = input.media.filter((m) => m.kind === 'VIDEO');

        // ── Two-step: create media container → publish container ─────────
        let containerId: string;

        if (videos.length > 0) {
            // Reels for video. Single video supported per container.
            const createRes = await fetch(`${FB_GRAPH}/${igId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    media_type: 'REELS',
                    video_url: videos[0].url,
                    caption: captionParts,
                    access_token: input.accessToken,
                }),
            });
            const createBody = await createRes.json().catch(() => ({})) as { id?: string };
            if (!createRes.ok || !createBody.id) throw new Error(`IG video container failed: ${createRes.status} ${JSON.stringify(createBody)}`);
            containerId = createBody.id;

            await this.waitForContainerReady(igId, containerId, input.accessToken);

        } else if (images.length > 1) {
            // Carousel: create child containers, then a CAROUSEL container.
            const children: string[] = [];
            for (const img of images) {
                const childRes = await fetch(`${FB_GRAPH}/${igId}/media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_url: img.url, is_carousel_item: true, access_token: input.accessToken }),
                });
                const body = await childRes.json().catch(() => ({})) as { id?: string };
                if (!childRes.ok || !body.id) throw new Error(`IG carousel child failed: ${childRes.status} ${JSON.stringify(body)}`);
                children.push(body.id);
            }
            const carouselRes = await fetch(`${FB_GRAPH}/${igId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    media_type: 'CAROUSEL',
                    children: children.join(','),
                    caption: captionParts,
                    access_token: input.accessToken,
                }),
            });
            const carouselBody = await carouselRes.json().catch(() => ({})) as { id?: string };
            if (!carouselRes.ok || !carouselBody.id) throw new Error(`IG carousel container failed: ${carouselRes.status} ${JSON.stringify(carouselBody)}`);
            containerId = carouselBody.id;
        } else if (images.length === 1) {
            const createRes = await fetch(`${FB_GRAPH}/${igId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_url: images[0].url,
                    caption: captionParts,
                    access_token: input.accessToken,
                }),
            });
            const body = await createRes.json().catch(() => ({})) as { id?: string };
            if (!createRes.ok || !body.id) throw new Error(`IG image container failed: ${createRes.status} ${JSON.stringify(body)}`);
            containerId = body.id;
        } else {
            // Instagram does not support text-only posts.
            throw new Error('Instagram requires at least one image or video.');
        }

        // Publish the container.
        const pubRes = await fetch(`${FB_GRAPH}/${igId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creation_id: containerId, access_token: input.accessToken }),
        });
        const pubBody = await pubRes.json().catch(() => ({})) as { id?: string };
        if (!pubRes.ok || !pubBody.id) throw new Error(`IG publish failed: ${pubRes.status} ${JSON.stringify(pubBody)}`);

        return {
            externalPostId: pubBody.id,
            externalPostUrl: `https://www.instagram.com/p/${pubBody.id}`,
            raw: pubBody as unknown as Record<string, unknown>,
        };
    }

    /**
     * Polls IG until a media container finishes processing. Required for video / reels
     * which are async; falls through quickly for images.
     */
    private async waitForContainerReady(
        igId: string,
        containerId: string,
        accessToken: string,
        attempts = 20,
        delayMs = 3000,
    ): Promise<void> {
        for (let i = 0; i < attempts; i += 1) {
            const r = await fetch(`${FB_GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`);
            const body = await r.json().catch(() => ({})) as { status_code?: string; status?: string };
            const status = body.status_code || body.status;
            if (status === 'FINISHED') return;
            if (status === 'ERROR' || status === 'EXPIRED') {
                throw new Error(`IG container processing ${status}: ${JSON.stringify(body)}`);
            }
            await new Promise((res) => setTimeout(res, delayMs));
        }
        throw new Error('IG container did not reach FINISHED status within timeout');
    }
}
