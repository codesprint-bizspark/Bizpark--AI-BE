import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMobileAppTable1714000000000 implements MigrationInterface {
    name = 'CreateMobileAppTable1714000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';

        await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'MobileAppStatus' AND n.nspname = '${schema}') THEN
    CREATE TYPE "${schema}"."MobileAppStatus" AS ENUM ('DRAFT', 'GENERATING', 'PENDING_APPROVAL', 'PUBLISHED', 'UNPUBLISHED', 'FAILED', 'SUSPENDED');
  END IF;
END $$`);

        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."MobileApp" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "cmsData" jsonb,
  "templateId" varchar(255),
  "status" "${schema}"."MobileAppStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" timestamptz,
  "suspendedAt" timestamptz,
  CONSTRAINT "FK_${schema}_MobileApp_businessId"
    FOREIGN KEY ("businessId") REFERENCES "${schema}"."businesses"("id") ON DELETE CASCADE
)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';
        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."MobileApp"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "${schema}"."MobileAppStatus"`);
    }
}
