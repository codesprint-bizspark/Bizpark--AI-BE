import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingApprovalTaskStatus1712000000000 implements MigrationInterface {
    name = 'AddPendingApprovalTaskStatus1712000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.RUNNER_DB_SCHEMA || 'runner';
        await queryRunner.query(`DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = '${schema}'
      AND t.typname = 'TaskStatus'
      AND e.enumlabel = 'PENDING_APPROVAL'
  ) THEN
    ALTER TYPE "${schema}"."TaskStatus" ADD VALUE 'PENDING_APPROVAL' AFTER 'PROCESSING';
  END IF;
END $$`);
    }

    public async down(): Promise<void> {
        // PostgreSQL enum values cannot be safely removed without recreating the type.
    }
}
