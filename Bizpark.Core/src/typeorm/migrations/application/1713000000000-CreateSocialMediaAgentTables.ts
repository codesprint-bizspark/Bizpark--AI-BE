import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the Social Media Agent schema:
 *   - SocialAccount  (OAuth-connected accounts per business + platform)
 *   - SocialPost     (drafts/scheduled/published posts)
 *   - SocialPostMedia (image/video/flyer assets attached to a post)
 *   - AiGeneration   (history of AI generations — captions, prompts, scripts)
 *   - PublishingLog  (per-platform publish attempt audit trail)
 *
 * Idempotent: all CREATE/ALTER statements use IF NOT EXISTS so the migration
 * can safely re-run after a partial failure on Neon.
 */
export class CreateSocialMediaAgentTables1713000000000 implements MigrationInterface {
    name = 'CreateSocialMediaAgentTables1713000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';

        // ── Enums ────────────────────────────────────────────────────────
        const enums: Array<{ name: string; values: string[] }> = [
            { name: 'SocialPlatform', values: ['FACEBOOK', 'INSTAGRAM', 'TIKTOK'] },
            { name: 'SocialAccountStatus', values: ['CONNECTED', 'EXPIRED', 'REVOKED', 'DISCONNECTED'] },
            { name: 'SocialPostStatus', values: ['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED'] },
            { name: 'SocialPostType', values: ['TEXT', 'IMAGE', 'FLYER', 'VIDEO'] },
            { name: 'SocialMediaKind', values: ['IMAGE', 'VIDEO', 'THUMBNAIL'] },
            { name: 'SocialMediaSource', values: ['AI_GENERATED', 'USER_UPLOAD', 'BUSINESS_ASSET'] },
            { name: 'AiGenerationKind', values: ['CAPTION', 'HASHTAGS', 'IMAGE_PROMPT', 'FLYER_PROMPT', 'VIDEO_SCRIPT', 'FULL_POST'] },
            { name: 'PublishingLogStatus', values: ['PENDING', 'SUCCESS', 'FAILED', 'RETRYING'] },
        ];

        for (const e of enums) {
            const valuesSql = e.values.map((v) => `'${v}'`).join(', ');
            await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '${e.name}' AND n.nspname = '${schema}') THEN
    CREATE TYPE "${schema}"."${e.name}" AS ENUM (${valuesSql});
  END IF;
END $$`);
        }

        // ── SocialAccount ─────────────────────────────────────────────────
        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."SocialAccount" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "platform" "${schema}"."SocialPlatform" NOT NULL,
  "externalAccountId" varchar(255) NOT NULL,
  "externalPageId" varchar(255),
  "displayName" varchar(255),
  "username" varchar(255),
  "avatarUrl" text,
  "accessTokenCipher" text NOT NULL,
  "refreshTokenCipher" text,
  "tokenExpiresAt" timestamptz,
  "scope" text,
  "status" "${schema}"."SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
  "metadata" jsonb,
  "lastRefreshedAt" timestamptz,
  "deletedAt" timestamptz,
  CONSTRAINT "FK_SocialAccount_business"
    FOREIGN KEY ("businessId") REFERENCES "${schema}"."businesses"("id") ON DELETE CASCADE
)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_social_account_business_platform"
            ON "${schema}"."SocialAccount" ("businessId", "platform")`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UIDX_social_account_business_platform_external"
            ON "${schema}"."SocialAccount" ("businessId", "platform", "externalAccountId")
            WHERE "deletedAt" IS NULL`);

        // ── SocialPost ────────────────────────────────────────────────────
        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."SocialPost" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "accountId" uuid,
  "platform" "${schema}"."SocialPlatform" NOT NULL,
  "postType" "${schema}"."SocialPostType" NOT NULL DEFAULT 'TEXT',
  "status" "${schema}"."SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
  "caption" text,
  "cta" text,
  "hashtags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "aiMetadata" jsonb,
  "sourceGenerationId" uuid,
  "scheduledAt" timestamptz,
  "publishedAt" timestamptz,
  "externalPostId" varchar(255),
  "externalPostUrl" text,
  "lastError" text,
  "retryCount" int NOT NULL DEFAULT 0,
  "createdByUserId" varchar(255),
  "deletedAt" timestamptz,
  CONSTRAINT "FK_SocialPost_business"
    FOREIGN KEY ("businessId") REFERENCES "${schema}"."businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_SocialPost_account"
    FOREIGN KEY ("accountId") REFERENCES "${schema}"."SocialAccount"("id") ON DELETE SET NULL
)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_social_post_business_status"
            ON "${schema}"."SocialPost" ("businessId", "status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_social_post_scheduled_at"
            ON "${schema}"."SocialPost" ("scheduledAt")
            WHERE "scheduledAt" IS NOT NULL AND "deletedAt" IS NULL`);

        // ── SocialPostMedia ───────────────────────────────────────────────
        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."SocialPostMedia" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postId" uuid NOT NULL,
  "kind" "${schema}"."SocialMediaKind" NOT NULL,
  "source" "${schema}"."SocialMediaSource" NOT NULL DEFAULT 'USER_UPLOAD',
  "url" text NOT NULL,
  "mimeType" varchar(100),
  "width" int,
  "height" int,
  "durationMs" int,
  "position" int NOT NULL DEFAULT 0,
  "prompt" text,
  "metadata" jsonb,
  "deletedAt" timestamptz,
  CONSTRAINT "FK_SocialPostMedia_post"
    FOREIGN KEY ("postId") REFERENCES "${schema}"."SocialPost"("id") ON DELETE CASCADE
)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_social_post_media_postId"
            ON "${schema}"."SocialPostMedia" ("postId")`);

        // ── AiGeneration ──────────────────────────────────────────────────
        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."AiGeneration" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "postId" uuid,
  "platform" "${schema}"."SocialPlatform",
  "kind" "${schema}"."AiGenerationKind" NOT NULL,
  "model" varchar(100),
  "input" jsonb NOT NULL,
  "output" jsonb NOT NULL,
  "promptTokens" int,
  "completionTokens" int,
  "latencyMs" int,
  "createdByUserId" varchar(255),
  "deletedAt" timestamptz,
  CONSTRAINT "FK_AiGeneration_business"
    FOREIGN KEY ("businessId") REFERENCES "${schema}"."businesses"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_AiGeneration_post"
    FOREIGN KEY ("postId") REFERENCES "${schema}"."SocialPost"("id") ON DELETE SET NULL
)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_generation_business"
            ON "${schema}"."AiGeneration" ("businessId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_generation_post"
            ON "${schema}"."AiGeneration" ("postId")`);

        // ── PublishingLog ─────────────────────────────────────────────────
        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."PublishingLog" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postId" uuid NOT NULL,
  "platform" "${schema}"."SocialPlatform" NOT NULL,
  "status" "${schema}"."PublishingLogStatus" NOT NULL DEFAULT 'PENDING',
  "attempt" int NOT NULL DEFAULT 0,
  "externalPostId" varchar(255),
  "externalPostUrl" text,
  "response" jsonb,
  "errorMessage" text,
  "errorCode" varchar(100),
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  CONSTRAINT "FK_PublishingLog_post"
    FOREIGN KEY ("postId") REFERENCES "${schema}"."SocialPost"("id") ON DELETE CASCADE
)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_publishing_log_post"
            ON "${schema}"."PublishingLog" ("postId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_publishing_log_status"
            ON "${schema}"."PublishingLog" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';

        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."PublishingLog"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."AiGeneration"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."SocialPostMedia"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."SocialPost"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."SocialAccount"`);

        for (const name of [
            'PublishingLogStatus',
            'AiGenerationKind',
            'SocialMediaSource',
            'SocialMediaKind',
            'SocialPostType',
            'SocialPostStatus',
            'SocialAccountStatus',
            'SocialPlatform',
        ]) {
            await queryRunner.query(`DROP TYPE IF EXISTS "${schema}"."${name}"`);
        }
    }
}
