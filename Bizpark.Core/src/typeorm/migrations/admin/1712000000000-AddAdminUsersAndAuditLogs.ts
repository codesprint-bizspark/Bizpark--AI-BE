import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminUsersAndAuditLogs1712000000000 implements MigrationInterface {
    name = 'AddAdminUsersAndAuditLogs1712000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.ADMIN_DB_SCHEMA || 'admin';

        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
        await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'AdminRole' AND n.nspname = '${schema}') THEN
    CREATE TYPE "${schema}"."AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPPORT');
  END IF;
END $$`);

        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."AdminUser" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email" varchar(255) NOT NULL UNIQUE,
  "passwordHash" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "role" "${schema}"."AdminRole" NOT NULL DEFAULT 'ADMIN',
  "isActive" boolean NOT NULL DEFAULT true
)`);

        await queryRunner.query(`
CREATE TABLE IF NOT EXISTS "${schema}"."AdminAuditLog" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "adminId" uuid,
  "action" varchar(255) NOT NULL,
  "targetType" varchar(100) NOT NULL,
  "targetId" varchar(255),
  "beforeData" jsonb,
  "afterData" jsonb
)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.ADMIN_DB_SCHEMA || 'admin';

        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."AdminAuditLog"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."AdminUser"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "${schema}"."AdminRole"`);
    }
}
