import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminControlFields1712000000000 implements MigrationInterface {
    name = 'AddAdminControlFields1712000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';

        await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'BusinessStatus' AND n.nspname = '${schema}') THEN
    CREATE TYPE "${schema}"."BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
  END IF;
END $$`);
        await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'WebsiteStatus' AND n.nspname = '${schema}') THEN
    CREATE TYPE "${schema}"."WebsiteStatus" AS ENUM ('DRAFT', 'GENERATING', 'PENDING_APPROVAL', 'PUBLISHED', 'UNPUBLISHED', 'FAILED', 'SUSPENDED');
  END IF;
END $$`);
        await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'SubscriptionStatus' AND n.nspname = '${schema}') THEN
    CREATE TYPE "${schema}"."SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
  END IF;
END $$`);

        await queryRunner.query(`ALTER TABLE "${schema}"."businesses" ADD COLUMN IF NOT EXISTS "status" "${schema}"."BusinessStatus" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "${schema}"."User" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "${schema}"."Website" ADD COLUMN IF NOT EXISTS "status" "${schema}"."WebsiteStatus" NOT NULL DEFAULT 'DRAFT'`);
        await queryRunner.query(`ALTER TABLE "${schema}"."Website" ADD COLUMN IF NOT EXISTS "publishedAt" timestamptz`);
        await queryRunner.query(`ALTER TABLE "${schema}"."Website" ADD COLUMN IF NOT EXISTS "suspendedAt" timestamptz`);

        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."Subscription" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "tier" "${schema}"."SubscriptionTier" NOT NULL DEFAULT 'FREE',
  "status" "${schema}"."SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "startedAt" timestamptz,
  "expiresAt" timestamptz,
  "paymentProvider" varchar(100),
  "paymentReference" varchar(255),
  CONSTRAINT "FK_${schema}_Subscription_businessId"
    FOREIGN KEY ("businessId") REFERENCES "${schema}"."businesses"("id") ON DELETE CASCADE
)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';

        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."Subscription"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."Website" DROP COLUMN IF EXISTS "suspendedAt"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."Website" DROP COLUMN IF EXISTS "publishedAt"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."Website" DROP COLUMN IF EXISTS "status"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."User" DROP COLUMN IF EXISTS "isActive"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."businesses" DROP COLUMN IF EXISTS "status"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "${schema}"."SubscriptionStatus"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "${schema}"."WebsiteStatus"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "${schema}"."BusinessStatus"`);
    }
}
