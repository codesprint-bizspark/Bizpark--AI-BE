import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMobileAppGenerationTaskType1714000000001 implements MigrationInterface {
    name = 'AddMobileAppGenerationTaskType1714000000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.RUNNER_DB_SCHEMA || 'runner';
        await queryRunner.query(
            `ALTER TYPE "${schema}"."TaskType" ADD VALUE IF NOT EXISTS 'MOBILE_APP_GENERATION'`,
        );
    }

    public async down(): Promise<void> {
        // PostgreSQL cannot safely remove enum values without recreating the type.
    }
}
