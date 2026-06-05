import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMcpApiKeyTable1714000000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS api."McpApiKey" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "businessId" UUID NOT NULL REFERENCES api."businesses"(id) ON DELETE CASCADE,
                "keyHash" TEXT NOT NULL UNIQUE,
                "keyPrefix" VARCHAR(24) NOT NULL,
                label VARCHAR(100),
                "lastUsedAt" TIMESTAMPTZ,
                "revokedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS "IDX_mcp_api_key_business"
                ON api."McpApiKey" ("businessId");
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS api."McpApiKey";`);
    }
}
