import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiUsageQuotas1715000000000 implements MigrationInterface {
    name = 'AddAiUsageQuotas1715000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';

        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        await queryRunner.query(`ALTER TABLE "${schema}"."Subscription" ADD COLUMN IF NOT EXISTS "planId" varchar(100)`);
        await queryRunner.query(`
UPDATE "${schema}"."Subscription"
SET "planId" = CASE
  WHEN "tier"::text = 'AGENCY' THEN 'business'
  WHEN "tier"::text = 'PRO' THEN 'growth'
  ELSE 'starter'
END
WHERE "planId" IS NULL
`);

        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."AiUsagePeriod" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" uuid NOT NULL,
  "month" varchar(7) NOT NULL,
  "planId" varchar(100),
  "tokensUsed" int NOT NULL DEFAULT 0,
  "tokensReserved" int NOT NULL DEFAULT 0,
  "websiteGenerationsUsed" int NOT NULL DEFAULT 0,
  "websiteGenerationsReserved" int NOT NULL DEFAULT 0,
  "mobileAppGenerationsUsed" int NOT NULL DEFAULT 0,
  "mobileAppGenerationsReserved" int NOT NULL DEFAULT 0,
  "socialPostGenerationsUsed" int NOT NULL DEFAULT 0,
  "socialPostGenerationsReserved" int NOT NULL DEFAULT 0,
  CONSTRAINT "FK_AiUsagePeriod_user"
    FOREIGN KEY ("userId") REFERENCES "${schema}"."User"("id") ON DELETE CASCADE,
  CONSTRAINT "UIDX_ai_usage_period_user_month" UNIQUE ("userId", "month")
)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_period_user" ON "${schema}"."AiUsagePeriod" ("userId")`);

        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."AiUsageEvent" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" uuid NOT NULL,
  "businessId" uuid,
  "month" varchar(7) NOT NULL,
  "activityType" varchar(80) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'RESERVED',
  "taskId" uuid,
  "counterKey" varchar(64),
  "counterAmount" int NOT NULL DEFAULT 0,
  "tokenEstimate" int NOT NULL DEFAULT 0,
  "promptTokens" int,
  "completionTokens" int,
  "totalTokens" int,
  "provider" varchar(100),
  "model" varchar(100),
  "metadata" jsonb,
  CONSTRAINT "CHK_AiUsageEvent_status"
    CHECK ("status" IN ('RESERVED', 'COMMITTED', 'RELEASED')),
  CONSTRAINT "FK_AiUsageEvent_user"
    FOREIGN KEY ("userId") REFERENCES "${schema}"."User"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_AiUsageEvent_business"
    FOREIGN KEY ("businessId") REFERENCES "${schema}"."businesses"("id") ON DELETE CASCADE
)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_event_user_month" ON "${schema}"."AiUsageEvent" ("userId", "month")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_event_business" ON "${schema}"."AiUsageEvent" ("businessId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_event_task" ON "${schema}"."AiUsageEvent" ("taskId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';

        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."AiUsageEvent"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."AiUsagePeriod"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."Subscription" DROP COLUMN IF EXISTS "planId"`);
    }
}
