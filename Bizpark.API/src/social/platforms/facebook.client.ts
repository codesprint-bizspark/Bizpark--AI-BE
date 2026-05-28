import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { SocialPlatform } from 'bizpark.core';
import {
    OAuthExchangeResult,
    PlatformClient,
    PublishPostInput,
    PublishPostResult,
} from './platform-client.types';

// v21.0 is the current stable Graph API version (v19.0 reaches EOL Feb 2026).
// Override via env if you need to pin to a specific version.
const FB_GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v21.0';
const FB_GRAPH = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;
const FB_OAUTH = `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`;

type GrantedPermission = { permission: string; status: 'granted' | 'declined' | 'expired' };

type FacebookPage = {
    id: string;
    name: string;
    access_token: string;
    category?: string;
    category_list?: Array<{ id: string; name: string }>;
    tasks?: string[];
    picture?: { data?: { url?: string } };
    fan_count?: number;
};

/**
 * Facebook Pages publishing (business-only — never personal timeline).
 *
 * OAuth flow:
 *   1. Frontend → GET /api/social/accounts/connect (signed-in)
 *   2. Backend returns FB OAuth URL → frontend redirects
 *   3. User approves on facebook.com
 *   4. FB redirects to /api/social/accounts/callback?code=...&state=...
 *   5. Backend exchanges code → short user token → long user token → Page tokens
 *   6. We store the PAGE access token (non-expiring) encrypted at rest
 *
 * Required env:
 *   FACEBOOK_APP_ID
 *   FACEBOOK_APP_SECRET
 *   FACEBOOK_REDIRECT_URI       (must EXACTLY match Meta Login → Valid OAuth Redirect URIs)
 *   FACEBOOK_SCOPES             (optional override of the default scope list)
 *
 * Default scopes — the minimal set for publishing to a Page:
 *   pages_show_list           – enumerate the user's Pages
 *   pages_manage_posts        – create posts on a Page
 *   pages_read_engagement     – Meta requires this paired with publishing scopes
 *
 * Scopes NOT requested:
 *   • public_profile — granted implicitly by Facebook Login
 *   • email          — not needed; requires a separate "Authentication and account creation" use case
 *
 * Meta App Dashboard setup (Development Mode, localhost):
 *   1. App Dashboard → Add Product → Facebook Login for Business (or legacy Facebook Login)
 *   2. App Dashboard → Add Product → Pages API
 *   3. Facebook Login → Settings → Valid OAuth Redirect URIs:
 *        http://localhost:3000/api/social/accounts/callback
 *   4. App Dashboard → Use cases → "Manage everything on your Page" → Customize →
 *      Permissions → Add: pages_show_list, pages_manage_posts, pages_read_engagement
 *   5. App Roles → Roles → add YOUR Facebook account as Admin / Developer / Tester.
 *      In Development Mode, only role-holders can grant Page permissions.
 *
 * Going to production:
 *   • Submit each Pages permission for Advanced Access in App Review.
 *   • Switch the app from Development → Live mode.
 *   • Until then, only people with an App Role can complete the OAuth flow.
 */
@Injectable()
export class FacebookClient implements PlatformClient {
    private readonly logger = new Logger(FacebookClient.name);
    readonly platform = SocialPlatform.FACEBOOK;

    private get appId() { return process.env.FACEBOOK_APP_ID || ''; }
    private get appSecret() { return process.env.FACEBOOK_APP_SECRET || ''; }
    private get redirectUri() { return process.env.FACEBOOK_REDIRECT_URI || ''; }

    private get defaultScopes(): string[] {
        const raw = process.env.FACEBOOK_SCOPES
            || process.env.FACEBOOK_DEFAULT_SCOPES
            || 'pages_show_list,pages_manage_posts,pages_read_engagement';
        // Drop scopes that Meta rejects for new apps unless a matching use-case is enabled.
        const REJECTED_BY_DEFAULT = new Set(['email', 'public_profile']);
        return raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !REJECTED_BY_DEFAULT.has(s));
    }

    /**
     * Hard requirements — without these we genuinely cannot complete the connect
     * flow (we'd never be able to list the user's Pages).
     */
    private get hardRequiredScopes(): string[] {
        return ['pages_show_list'];
    }

    /**
     * Soft requirements — needed for the publish API to succeed. We DON'T block
     * the connect flow on these, because Meta's "Reconnect" dialog reuses prior
     * grants and won't re-prompt; we'd reject a perfectly valid reconnect.
     * Instead we record what's missing in metadata so the UI can surface a
     * "Limited" state, and publishes will surface Meta's actual permission error.
     */
    private get publishingScopes(): string[] {
        return ['pages_manage_posts', 'pages_read_engagement'];
    }

    /**
     * appsecret_proof = HMAC-SHA256(access_token, app_secret) — recommended by Meta
     * for server-side Graph calls to prevent leaked-token replay. We attach it on
     * every call we make.
     */
    private appsecretProof(token: string): string {
        return createHmac('sha256', this.appSecret).update(token).digest('hex');
    }

    /** Append access_token + appsecret_proof to a Graph URL. */
    private withAuth(url: string, token: string): string {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}access_token=${encodeURIComponent(token)}&appsecret_proof=${this.appsecretProof(token)}`;
    }

    getAuthorizationUrl(state: string): string {
        if (!this.appId) throw new Error('FACEBOOK_APP_ID is not configured');
        if (!this.appSecret) throw new Error('FACEBOOK_APP_SECRET is not configured');
        if (!this.redirectUri) throw new Error('FACEBOOK_REDIRECT_URI is not configured');

        const params = new URLSearchParams({
            client_id: this.appId,
            redirect_uri: this.redirectUri,
            state,
            scope: this.defaultScopes.join(','),
            response_type: 'code',
            auth_type: 'rerequest', // re-prompt if user previously declined a scope
        });
        return `${FB_OAUTH}?${params.toString()}`;
    }

    async exchangeCode(code: string): Promise<OAuthExchangeResult> {
        // ── 1. Short-lived user token (~1 hour) ───────────────────────────────
        const tokRes = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
            client_id: this.appId,
            client_secret: this.appSecret,
            redirect_uri: this.redirectUri,
            code,
        }).toString()}`);
        if (!tokRes.ok) throw this.toReadableError('token exchange', tokRes.status, await tokRes.text());
        const shortTok = (await tokRes.json()) as { access_token: string; expires_in?: number };

        // ── 2. Long-lived user token (~60 days) ───────────────────────────────
        const longRes = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: shortTok.access_token,
        }).toString()}`);
        if (!longRes.ok) throw this.toReadableError('long-lived token exchange', longRes.status, await longRes.text());
        const longTok = (await longRes.json()) as { access_token: string; expires_in?: number };
        const userToken = longTok.access_token;

        // ── 3. Inspect granted permissions ────────────────────────────────────
        // - Hard requirements throw (no point continuing).
        // - Missing publishing scopes are recorded but DON'T block the connect.
        //   The publish path will surface Meta's own rejection message later.
        const grantedScopes = await this.fetchGrantedPermissions(userToken);
        const missingHard = this.hardRequiredScopes.filter((s) => !grantedScopes.has(s));
        if (missingHard.length > 0) {
            throw new Error(
                `Facebook connect cancelled — required permission${missingHard.length > 1 ? 's' : ''} not granted: ${missingHard.join(', ')}. `
                + 'In Meta App Dashboard go to Use cases → enable these, add yourself as a Tester/Developer under App Roles, '
                + 'remove the app from facebook.com → Settings → Apps and Websites to force a fresh consent prompt, then try again.',
            );
        }
        const missingPublishing = this.publishingScopes.filter((s) => !grantedScopes.has(s));
        if (missingPublishing.length > 0) {
            this.logger.warn(
                `[connect] account will be saved with LIMITED permissions — missing: ${missingPublishing.join(', ')}. Publishing will fail until granted.`,
            );
        }

        // ── 4. Identify the user ──────────────────────────────────────────────
        const meRes = await fetch(this.withAuth(`${FB_GRAPH}/me?fields=id,name,picture`, userToken));
        if (!meRes.ok) throw this.toReadableError('user lookup', meRes.status, await meRes.text());
        const me = (await meRes.json()) as { id: string; name?: string; picture?: { data?: { url?: string } } };

        // ── 5. List the user's Pages (with non-expiring Page Access Tokens) ───
        // /me/accounts returns one Page Access Token per Page the user manages.
        // Page tokens derived from a long-lived user token DO NOT EXPIRE — they
        // only become invalid if the user revokes permissions or changes their
        // password.
        const pagesRes = await fetch(this.withAuth(
            `${FB_GRAPH}/me/accounts?fields=id,name,access_token,category,category_list,tasks,fan_count,picture`,
            userToken,
        ));
        if (!pagesRes.ok) throw this.toReadableError('list Pages', pagesRes.status, await pagesRes.text());
        const pages = (await pagesRes.json()) as { data: FacebookPage[] };

        if (!pages.data?.length) {
            throw new Error(
                'No Facebook Pages found on this account. '
                + 'You must be an admin (or have a manage-content task) on at least one Facebook Page. '
                + 'Personal Facebook profiles cannot publish via the API.',
            );
        }

        // Prefer Pages where the user can actually create content.
        const publishable = pages.data.filter(
            (p) => !p.tasks || p.tasks.includes('CREATE_CONTENT') || p.tasks.includes('MANAGE'),
        );
        const primaryPage = publishable[0] || pages.data[0];

        // NOTE: we deliberately do NOT re-verify the Page Access Token here.
        // Meta just minted it via /me/accounts a moment ago — there's nothing
        // to "verify" that wouldn't be racy or dependent on appsecret_proof
        // enforcement (which has subtly different behavior for Page tokens vs
        // User tokens). If the token is bad, the publish path will fail with
        // Meta's actual error, which is clearer than a synthetic "rejected by
        // Meta" message.

        return {
            // Store the (non-expiring) Page Access Token, not the user token.
            accessToken: primaryPage.access_token,
            refreshToken: null,
            expiresInSec: null, // Page tokens don't expire
            externalAccountId: me.id,
            externalPageId: primaryPage.id,
            displayName: primaryPage.name || me.name || null,
            username: null,
            avatarUrl: primaryPage.picture?.data?.url || me.picture?.data?.url || null,
            scope: this.defaultScopes.join(','),
            metadata: {
                // We DON'T persist the user token in the access_token column, but
                // keep it in metadata in case we need to recover/repick a page later.
                userToken,
                userTokenExpiresInSec: longTok.expires_in ?? null,
                grantedScopes: Array.from(grantedScopes),
                missingPublishingScopes: missingPublishing,
                // Expose ALL pages so the UI can let the user switch later without
                // re-running the OAuth flow.
                pages: pages.data.map((p) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category ?? null,
                    fanCount: p.fan_count ?? null,
                    pictureUrl: p.picture?.data?.url ?? null,
                    canPublish: !p.tasks || p.tasks.includes('CREATE_CONTENT') || p.tasks.includes('MANAGE'),
                })),
            },
        };
    }

    async refreshAccessToken(_refreshToken: string): Promise<OAuthExchangeResult> {
        // Facebook page tokens (derived from long-lived user tokens) don't expire.
        // Refresh is a no-op — we surface an error so callers know to ask the user
        // to reconnect if the stored token is ever rejected.
        throw new Error('Facebook Page tokens do not expire — reconnect required if revoked.');
    }

    async disconnect(accessToken: string): Promise<void> {
        try {
            await fetch(this.withAuth(`${FB_GRAPH}/me/permissions`, accessToken), { method: 'DELETE' });
        } catch (e) {
            this.logger.warn(`FB disconnect failed: ${(e as Error).message}`);
        }
    }

    // ── Publishing ──────────────────────────────────────────────────────────────

    async publish(input: PublishPostInput): Promise<PublishPostResult> {
        const { accessToken, externalPageId, caption, cta, hashtags, media } = input;
        const pageId = externalPageId ?? '';
        if (!pageId) throw new Error('Facebook publishing requires externalPageId (Page ID)');

        const captionText = this.buildCaption(caption, cta, hashtags);
        const images = (media || []).filter(m => ['IMAGE', 'THUMBNAIL'].includes(m.kind));
        const videos = (media || []).filter(m => m.kind === 'VIDEO');

        if (videos.length > 0) {
            const body = await this.graphPost(`/${pageId}/videos`, accessToken, {
                description: captionText,
                file_url: videos[0].url,
            });
            const postId = String(body['id'] ?? '');
            return { externalPostId: postId, externalPostUrl: postId ? `https://www.facebook.com/${postId}` : null, raw: body };
        }

        if (images.length > 1) {
            const attached: Array<{ media_fbid: string }> = [];
            for (const img of images) {
                const up = await this.uploadMedia(`/${pageId}/photos`, accessToken, img.url, { published: 'false' }, 'image');
                const fbid = String(up['id'] ?? '');
                if (!fbid) throw new Error(`Facebook photo upload returned no id: ${JSON.stringify(up)}`);
                attached.push({ media_fbid: fbid });
            }
            const feed = await this.graphPost(`/${pageId}/feed`, accessToken, { message: captionText, attached_media: attached });
            const postId = String(feed['id'] ?? '');
            return { externalPostId: postId, externalPostUrl: postId ? `https://www.facebook.com/${postId}` : null, raw: feed };
        }

        if (images.length === 1) {
            const body = await this.uploadMedia(`/${pageId}/photos`, accessToken, images[0].url, { caption: captionText }, 'image');
            const postId = String(body['post_id'] ?? body['id'] ?? '');
            return { externalPostId: postId, externalPostUrl: postId ? `https://www.facebook.com/${postId}` : null, raw: body };
        }

        // Text-only
        const body = await this.graphPost(`/${pageId}/feed`, accessToken, { message: captionText });
        const postId = String(body['id'] ?? '');
        return { externalPostId: postId, externalPostUrl: postId ? `https://www.facebook.com/${postId}` : null, raw: body };
    }

    private buildCaption(caption: string, cta?: string | null, hashtags?: string[]): string {
        const tagStr = (hashtags || []).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');
        return [caption, cta, tagStr].filter(Boolean).join('\n\n');
    }

    private async graphPost(path: string, token: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
        const url = this.withAuth(`${FB_GRAPH}${path}`, token);
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json() as Record<string, unknown>;
        if (!resp.ok || data['error']) {
            const msg = (data['error'] as any)?.message || JSON.stringify(data);
            throw new Error(`Facebook ${path} failed (${resp.status}): ${msg}`);
        }
        return data;
    }

    private async uploadMedia(path: string, token: string, mediaUrl: string, extra: Record<string, string>, kind: string): Promise<Record<string, unknown>> {
        if (mediaUrl.startsWith('data:')) {
            const match = mediaUrl.match(/^data:([^;,]+)(?:;base64)?,(.*)$/);
            if (!match) throw new Error('Malformed data URI');
            const mimeType = match[1];
            const buffer = Buffer.from(match[2], 'base64');
            const blob = new Blob([buffer], { type: mimeType });
            const filename = kind === 'video' ? 'upload.mp4' : 'upload.png';

            const form = new FormData();
            form.append('source', blob, filename);
            form.append('access_token', token);
            form.append('appsecret_proof', this.appsecretProof(token));
            for (const [k, v] of Object.entries(extra)) form.append(k, v);

            const resp = await fetch(`${FB_GRAPH}${path}`, { method: 'POST', body: form });
            const data = await resp.json() as Record<string, unknown>;
            if (!resp.ok || data['error']) {
                const msg = (data['error'] as any)?.message || JSON.stringify(data);
                throw new Error(`Facebook media upload failed (${resp.status}): ${msg}`);
            }
            return data;
        }

        const field = kind === 'video' ? 'file_url' : 'url';
        return this.graphPost(path, token, { [field]: mediaUrl, ...extra });
    }

    /** Return the set of scopes Meta reports as `granted` for this token. */
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

    /**
     * Decode the most common Meta OAuth/Graph error envelopes into a single
     * actionable message. Specifically catches the "Invalid Scopes" flavor
     * since it's the most common first-time error.
     */
    private toReadableError(stage: string, status: number, rawBody: string): Error {
        let parsed: { error?: { message?: string; type?: string; code?: number; error_subcode?: number } } | null = null;
        try { parsed = JSON.parse(rawBody); } catch { /* not JSON */ }
        const msg = parsed?.error?.message || rawBody;

        if (/invalid scope/i.test(msg)) {
            return new Error(
                `Facebook rejected the requested OAuth scopes during ${stage}: ${msg}. `
                + 'In Meta App Dashboard → "Use cases" / "Permissions and Features" enable each scope. '
                + 'In Development Mode the user logging in must also have an App Role (Admin / Developer / Tester). '
                + 'Override the scope list via the FACEBOOK_SCOPES env var if needed.',
            );
        }
        if (/redirect[_ ]uri/i.test(msg)) {
            return new Error(
                `Facebook rejected the redirect URI during ${stage}: ${msg}. `
                + 'It must exactly match (scheme + host + port + path + trailing slash) '
                + 'the value in Facebook Login → Settings → Valid OAuth Redirect URIs.',
            );
        }
        if (/code.*been used|already.*used/i.test(msg)) {
            return new Error(
                `Facebook authorization code already used during ${stage}. `
                + 'Codes are single-use and short-lived — start a fresh OAuth flow.',
            );
        }
        return new Error(`Facebook ${stage} failed: ${status} ${msg}`);
    }
}
