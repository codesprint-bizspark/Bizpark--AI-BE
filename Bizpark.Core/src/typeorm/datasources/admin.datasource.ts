import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ADMIN_ENTITIES } from '../entities/admin';
import { createPostgresDataSourceOptions } from './common';

let adminDataSource: DataSource | null = null;

export const getAdminDataSource = () => {
    if (!adminDataSource) {
        adminDataSource = new DataSource(
            createPostgresDataSourceOptions({
                name: 'admin',
                urlEnvVar: 'ADMIN_DATABASE_URL',
                schemaEnvVar: 'ADMIN_DB_SCHEMA',
                defaultSchema: 'admin',
                entities: ADMIN_ENTITIES,
                migrationsGlob: `${__dirname}/../migrations/admin/*{.ts,.js}`,
            }),
        );
    }
    return adminDataSource;
};

export default getAdminDataSource();
