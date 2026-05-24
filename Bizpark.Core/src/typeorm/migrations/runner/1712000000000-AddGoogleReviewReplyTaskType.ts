import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleReviewReplyTaskType1712000000000 implements MigrationInterface {
    name = 'AddGoogleReviewReplyTaskType1712000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.RUNNER_DB_SCHEMA || 'runner';
        await queryRunner.query(
            `ALTER TYPE "${schema}"."TaskType" ADD VALUE IF NOT EXISTS 'GOOGLE_REVIEW_REPLY'`,
        );
    }

    public async down(): Promise<void> {
        // PostgreSQL cannot safely remove enum values without recreating the type.
    }
}
