import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { applicationDb } from 'bizpark.core';

type CurrentUser = { id: string; email: string; name: string };

const KEY_PREFIX = 'biz_mcp_';
const DISPLAY_PREFIX_LEN = 16; // "biz_mcp_" + 8 chars shown to user

function hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
}

function generateRawKey(): string {
    return KEY_PREFIX + randomBytes(24).toString('hex'); // biz_mcp_ + 48 hex chars
}

@Injectable()
export class McpService {
    private async assertAccess(businessId: string, userId: string) {
        const rows = await applicationDb.business.findMany({
            where: { users: { some: { userId } } },
        });
        const biz = rows.find((b) => b.id === businessId);
        if (!biz) throw new ForbiddenException('No access to this business');
        return biz;
    }

    async listKeys(businessId: string, user: CurrentUser) {
        await this.assertAccess(businessId, user.id);
        const keys = await applicationDb.mcpApiKey.findMany({
            where: { businessId, revokedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        return {
            success: true,
            data: keys.map((k) => ({
                id: k.id,
                keyPrefix: k.keyPrefix,
                label: k.label,
                lastUsedAt: k.lastUsedAt,
                createdAt: k.createdAt,
            })),
        };
    }

    async generateKey(businessId: string, label: string | undefined, user: CurrentUser) {
        await this.assertAccess(businessId, user.id);

        const raw = generateRawKey();
        const hash = hashKey(raw);
        const keyPrefix = raw.slice(0, DISPLAY_PREFIX_LEN) + '…';

        await applicationDb.mcpApiKey.create({
            data: {
                businessId,
                keyHash: hash,
                keyPrefix,
                label: label ?? null,
            },
        });

        // Raw key returned ONCE — not stored
        return { success: true, data: { key: raw, keyPrefix, label: label ?? null } };
    }

    async revokeKey(keyId: string, businessId: string, user: CurrentUser) {
        await this.assertAccess(businessId, user.id);

        const key = await applicationDb.mcpApiKey.findUnique({ where: { id: keyId } });
        if (!key || key.businessId !== businessId) throw new NotFoundException('API key not found');
        if (key.revokedAt) throw new ForbiddenException('Key already revoked');

        await applicationDb.mcpApiKey.update({
            where: { id: keyId },
            data: { revokedAt: new Date() },
        });

        return { success: true };
    }
}
