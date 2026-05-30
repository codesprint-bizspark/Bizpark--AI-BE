import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMobileAppStoreFields1714500000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE api."MobileAppStoreStatus" AS ENUM
                    ('NONE', 'REQUESTED', 'IN_REVIEW', 'PUBLISHED', 'REJECTED');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;

            ALTER TABLE api."MobileApp"
                ADD COLUMN IF NOT EXISTS "storeStatus" api."MobileAppStoreStatus" NOT NULL DEFAULT 'NONE',
                ADD COLUMN IF NOT EXISTS "playStoreUrl" TEXT,
                ADD COLUMN IF NOT EXISTS "appStoreUrl" TEXT,
                ADD COLUMN IF NOT EXISTS "storeNote" TEXT,
                ADD COLUMN IF NOT EXISTS "storeRequestedAt" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "storeReviewedAt" TIMESTAMPTZ;
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE api."MobileApp"
                DROP COLUMN IF EXISTS "storeStatus",
                DROP COLUMN IF EXISTS "playStoreUrl",
                DROP COLUMN IF EXISTS "appStoreUrl",
                DROP COLUMN IF EXISTS "storeNote",
                DROP COLUMN IF EXISTS "storeRequestedAt",
                DROP COLUMN IF EXISTS "storeReviewedAt";
            DROP TYPE IF EXISTS api."MobileAppStoreStatus";
        `);
    }
}
