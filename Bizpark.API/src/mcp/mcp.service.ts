import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Client } from 'pg';
import { applicationDb, UserRole } from 'bizpark.core';
import { UsageService } from '../usage/usage.service';

type CurrentUser = { id: string; email: string; name: string };

const KEY_PREFIX = 'biz_mcp_';
const DISPLAY_PREFIX_LEN = 16; // "biz_mcp_" + 8 chars shown to the user

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawKey(): string {
  return KEY_PREFIX + randomBytes(24).toString('hex'); // biz_mcp_ + 48 hex chars
}

// MCP API keys live in the Commerce DB (public."McpApiKey") so the Go MCP
// server can resolve them — not the application DB.
function getCommerceDbUrl(): string {
  return process.env.COMMERCE_DATABASE_URL || process.env.DATABASE_URL || '';
}

async function withCommerceDb<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: getCommerceDbUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

@Injectable()
export class McpService implements OnModuleInit {
  constructor(private readonly usageService: UsageService) {}

  async onModuleInit() {
    // Ensure the McpApiKey table exists in the Commerce DB on startup.
    await withCommerceDb(async (client) => {
      await client.query(`
                CREATE TABLE IF NOT EXISTS public."McpApiKey" (
                    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "businessId" TEXT NOT NULL,
                    "keyHash"    TEXT NOT NULL UNIQUE,
                    "keyPrefix"  VARCHAR(24) NOT NULL,
                    label        VARCHAR(100),
                    "lastUsedAt" TIMESTAMPTZ,
                    "revokedAt"  TIMESTAMPTZ,
                    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_mcp_api_key_business
                    ON public."McpApiKey" ("businessId");
            `);
    });
  }

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

    const keys = await withCommerceDb(async (client) => {
      const res = await client.query(
        `SELECT id, "keyPrefix", label, "lastUsedAt", "createdAt"
                 FROM public."McpApiKey"
                 WHERE "businessId" = $1 AND "revokedAt" IS NULL
                 ORDER BY "createdAt" DESC`,
        [businessId],
      );
      return res.rows;
    });

    return { success: true, data: keys };
  }

  async generateKey(
    businessId: string,
    label: string | undefined,
    user: CurrentUser,
  ) {
    await this.assertAccess(businessId, user.id);
    const activeKeyCount = await this.countActiveKeysForUser(user.id);
    await this.usageService.assertCanCreateMcpKey(user.id, activeKeyCount);

    const raw = generateRawKey();
    const hash = hashKey(raw);
    const keyPrefix = raw.slice(0, DISPLAY_PREFIX_LEN) + '…';

    await withCommerceDb(async (client) => {
      await client.query(
        `INSERT INTO public."McpApiKey" ("businessId", "keyHash", "keyPrefix", label)
                 VALUES ($1, $2, $3, $4)`,
        [businessId, hash, keyPrefix, label ?? null],
      );
    });

    // Raw key is returned ONCE and never stored.
    return {
      success: true,
      data: { key: raw, keyPrefix, label: label ?? null },
    };
  }

  private async countActiveKeysForUser(userId: string) {
    const businesses = await applicationDb.business.findMany({
      where: { users: { some: { userId, role: UserRole.OWNER } } },
    });
    const businessIds = businesses.map((business) => business.id);
    if (businessIds.length === 0) return 0;

    return withCommerceDb(async (client) => {
      const res = await client.query(
        `SELECT COUNT(*)::int AS count
                 FROM public."McpApiKey"
                 WHERE "businessId" = ANY($1)
                   AND "revokedAt" IS NULL`,
        [businessIds],
      );
      return Number(res.rows[0]?.count ?? 0);
    });
  }

  async revokeKey(keyId: string, businessId: string, user: CurrentUser) {
    await this.assertAccess(businessId, user.id);

    const revoked = await withCommerceDb(async (client) => {
      const existing = await client.query(
        `SELECT id FROM public."McpApiKey" WHERE id = $1 AND "businessId" = $2`,
        [keyId, businessId],
      );
      if (existing.rowCount === 0) return false;

      await client.query(
        `UPDATE public."McpApiKey" SET "revokedAt" = NOW() WHERE id = $1`,
        [keyId],
      );
      return true;
    });

    if (!revoked) throw new NotFoundException('API key not found');
    return { success: true };
  }
}
