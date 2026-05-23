import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type OAuthStatePayload = {
    businessId: string;
    userId: string;
    platform: string;
    redirectAfterConnect?: string;
    // Random nonce to make the state unguessable.
    n: string;
    // Unix-ms expiry (default 10min).
    exp: number;
};

function getSecret(): string {
    return process.env.OAUTH_STATE_SECRET
        || process.env.JWT_SECRET
        || 'super-secret-key-change-me';
}

/**
 * Encode and HMAC-sign an OAuth state payload.
 * Wire format: base64url(JSON) + "." + base64url(HMAC-SHA256)
 */
export function signOAuthState(payload: Omit<OAuthStatePayload, 'n' | 'exp'> & { ttlMs?: number }): string {
    const { ttlMs = 10 * 60 * 1000, ...rest } = payload;
    const full: OAuthStatePayload = {
        ...rest,
        n: randomBytes(12).toString('base64url'),
        exp: Date.now() + ttlMs,
    };
    const body = Buffer.from(JSON.stringify(full)).toString('base64url');
    const mac = createHmac('sha256', getSecret()).update(body).digest('base64url');
    return `${body}.${mac}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload {
    if (typeof state !== 'string' || !state.includes('.')) {
        throw new Error('Invalid OAuth state');
    }
    const [body, mac] = state.split('.');
    const expected = createHmac('sha256', getSecret()).update(body).digest('base64url');
    const macBuf = Buffer.from(mac);
    const expectedBuf = Buffer.from(expected);
    if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) {
        throw new Error('OAuth state signature mismatch');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!payload.exp || payload.exp < Date.now()) {
        throw new Error('OAuth state expired');
    }
    return payload;
}
