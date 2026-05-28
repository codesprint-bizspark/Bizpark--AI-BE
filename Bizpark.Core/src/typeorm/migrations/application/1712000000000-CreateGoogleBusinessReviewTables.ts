import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateGoogleBusinessReviewTables1712000000000 implements MigrationInterface {
    name = 'CreateGoogleBusinessReviewTables1712000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

        await queryRunner.createTable(
            new Table({
                schema,
                name: 'GoogleBusinessConnection',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
                    { name: 'createdAt', type: 'timestamptz', default: 'CURRENT_TIMESTAMP', isNullable: false },
                    { name: 'updatedAt', type: 'timestamptz', default: 'CURRENT_TIMESTAMP', isNullable: false },
                    { name: 'businessId', type: 'uuid', isNullable: false },
                    { name: 'provider', type: 'varchar', length: '32', default: "'mock'", isNullable: false },
                    { name: 'googleAccountName', type: 'text', isNullable: true },
                    { name: 'locationName', type: 'text', isNullable: true },
                    { name: 'locationTitle', type: 'varchar', length: '255', isNullable: true },
                    { name: 'address', type: 'text', isNullable: true },
                    { name: 'encryptedRefreshToken', type: 'text', isNullable: true },
                    { name: 'scopes', type: 'jsonb', default: "'[]'::jsonb", isNullable: false },
                    { name: 'lastSyncedAt', type: 'timestamptz', isNullable: true },
                    { name: 'status', type: 'varchar', length: '32', default: "'CONNECTED'", isNullable: false },
                ],
            }),
            true,
        );

        await queryRunner.createIndex(
            `${schema}.GoogleBusinessConnection`,
            new TableIndex({ name: `IDX_${schema}_GoogleBusinessConnection_businessId`, columnNames: ['businessId'] }),
        );

        await queryRunner.createForeignKey(
            `${schema}.GoogleBusinessConnection`,
            new TableForeignKey({
                name: `FK_${schema}_GoogleBusinessConnection_businessId`,
                columnNames: ['businessId'],
                referencedSchema: schema,
                referencedTableName: 'businesses',
                referencedColumnNames: ['id'],
                onDelete: 'CASCADE',
            }),
        );

        await queryRunner.createTable(
            new Table({
                schema,
                name: 'GoogleBusinessReview',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
                    { name: 'createdAt', type: 'timestamptz', default: 'CURRENT_TIMESTAMP', isNullable: false },
                    { name: 'updatedAt', type: 'timestamptz', default: 'CURRENT_TIMESTAMP', isNullable: false },
                    { name: 'businessId', type: 'uuid', isNullable: false },
                    { name: 'locationName', type: 'text', isNullable: false },
                    { name: 'reviewName', type: 'text', isUnique: true, isNullable: false },
                    { name: 'reviewId', type: 'varchar', length: '255', isNullable: false },
                    { name: 'reviewerDisplayName', type: 'varchar', length: '255', isNullable: true },
                    { name: 'reviewerIsAnonymous', type: 'boolean', default: false, isNullable: false },
                    { name: 'rating', type: 'int', isNullable: false },
                    { name: 'comment', type: 'text', isNullable: true },
                    { name: 'reviewCreateTime', type: 'timestamptz', isNullable: true },
                    { name: 'reviewUpdateTime', type: 'timestamptz', isNullable: true },
                    { name: 'googleReply', type: 'text', isNullable: true },
                    { name: 'aiReply', type: 'text', isNullable: true },
                    { name: 'status', type: 'varchar', length: '32', default: "'SYNCED'", isNullable: false },
                    { name: 'agentTaskId', type: 'uuid', isNullable: true },
                    { name: 'failureReason', type: 'text', isNullable: true },
                    { name: 'repliedAt', type: 'timestamptz', isNullable: true },
                ],
            }),
            true,
        );

        await queryRunner.createIndex(
            `${schema}.GoogleBusinessReview`,
            new TableIndex({ name: `IDX_${schema}_GoogleBusinessReview_businessId`, columnNames: ['businessId'] }),
        );

        await queryRunner.createForeignKey(
            `${schema}.GoogleBusinessReview`,
            new TableForeignKey({
                name: `FK_${schema}_GoogleBusinessReview_businessId`,
                columnNames: ['businessId'],
                referencedSchema: schema,
                referencedTableName: 'businesses',
                referencedColumnNames: ['id'],
                onDelete: 'CASCADE',
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = process.env.APPLICATION_DB_SCHEMA || 'api';
        await queryRunner.dropTable(`${schema}.GoogleBusinessReview`, true);
        await queryRunner.dropTable(`${schema}.GoogleBusinessConnection`, true);
    }
}
