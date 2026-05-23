import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from 'node:crypto';

/**
 * Symmetric AES-256-GCM encryption for OAuth tokens at rest.
 *
 * The encryption key is derived from TOKEN_ENCRYPTION_KEY (env). If unset, we
 * fall back to a SHA-256 of JWT_SECRET so dev still works — but the env var
 * MUST be set in production (32+ random bytes, base64 or hex).
 *
 * Wire format (base64): version(1) || iv(12) || authTag(16) || ciphertext
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 0x01;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
    if (cachedKey) return cachedKey;
    const raw = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'super-secret-key-change-me';
    // Always normalise to 32 bytes via SHA-256 so any-length input works.
    cachedKey = createHash('sha256').update(raw, 'utf8').digest();
    return cachedKey;
}

export function encryptToken(plaintext: string | null | undefined): string | null {
    if (!plaintext) return null;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([Buffer.from([VERSION]), iv, authTag, encrypted]);
    return payload.toString('base64');
}

export function decryptToken(cipherText: string | null | undefined): string | null {
    if (!cipherText) return null;
    const payload = Buffer.from(cipherText, 'base64');
    if (payload.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('Invalid encrypted token payload');
    }
    const version = payload[0];
    if (version !== VERSION) {
        throw new Error(`Unsupported encrypted token version: ${version}`);
    }
    const iv = payload.subarray(1, 1 + IV_LENGTH);
    const authTag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}
