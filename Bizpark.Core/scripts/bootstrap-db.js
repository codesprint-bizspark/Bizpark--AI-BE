#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const coreDir = path.resolve(__dirname, '..');
const envPath = process.env.BIZPARK_ENV_FILE || path.join(coreDir, '.env');

const parseEnv = (raw) => {
  const result = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }
  return result;
};

if (fs.existsSync(envPath)) {
  const fileEnv = parseEnv(fs.readFileSync(envPath, 'utf8'));
  for (const [k, v] of Object.entries(fileEnv)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.APPLICATION_DATABASE_URL ||
  process.env.ADMIN_DATABASE_URL ||
  process.env.RUNNER_DATABASE_URL;

if (!dbUrl) {
  console.error(`Missing DB URL. Set DATABASE_URL (checked env file: ${envPath}).`);
  process.exit(1);
}

const appSchema = process.env.APPLICATION_DB_SCHEMA || 'api';
const adminSchema = process.env.ADMIN_DB_SCHEMA || 'admin';
const runnerSchema = process.env.RUNNER_DB_SCHEMA || 'runner';

const quoteIdent = (value) => `"${String(value).replaceAll('"', '""')}"`;
const escapeLiteral = (value) => String(value).replaceAll("'", "''");

const createEnumIfMissing = async (client, schema, enumName, values) => {
  const enumValuesSql = values.map((value) => `'${escapeLiteral(value)}'`).join(', ');
  const existing = await client.query(
    `SELECT 1
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = $1
       AND n.nspname = $2
     LIMIT 1`,
    [enumName, schema],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return;
  }

  await client.query(
    `CREATE TYPE ${quoteIdent(schema)}.${quoteIdent(enumName)} AS ENUM (${enumValuesSql})`,
  );
};

const addConstraintIfMissing = async (client, schema, table, constraintName, definitionSql) => {
  const regclass = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const existing = await client.query(
    `SELECT 1
     FROM pg_constraint
     WHERE conname = $1
       AND conrelid = $2::regclass
     LIMIT 1`,
    [constraintName, regclass],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return;
  }

  await client.query(
    `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)}
       ADD CONSTRAINT ${quoteIdent(constraintName)} ${definitionSql}`,
  );
};

const ensureBaseSchemas = async (client) => {
  await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  for (const schema of new Set([appSchema, adminSchema, runnerSchema])) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
  }
};

const ensureEnums = async (client) => {
  await createEnumIfMissing(client, appSchema, 'SubscriptionTier', ['FREE', 'PRO', 'AGENCY']);
  await createEnumIfMissing(client, appSchema, 'SubscriptionStatus', [
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELLED',
    'EXPIRED',
  ]);
  await createEnumIfMissing(client, appSchema, 'BusinessStatus', ['ACTIVE', 'SUSPENDED', 'ARCHIVED']);
  await createEnumIfMissing(client, appSchema, 'WebsiteStatus', [
    'DRAFT',
    'GENERATING',
    'PENDING_APPROVAL',
    'PUBLISHED',
    'UNPUBLISHED',
    'FAILED',
    'SUSPENDED',
  ]);
  await createEnumIfMissing(client, appSchema, 'UserRole', ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);
  await createEnumIfMissing(client, adminSchema, 'AdminRole', ['SUPER_ADMIN', 'ADMIN', 'SUPPORT']);
  await createEnumIfMissing(client, adminSchema, 'TemplateType', [
    'SHOWCASE',
    'ECOMMERCE_ITEM',
    'ECOMMERCE_SUBSCRIPTION',
  ]);
  await createEnumIfMissing(client, runnerSchema, 'TaskType', [
    'WEBSITE_GENERATION',
    'SOCIAL_MEDIA_CONTENT',
    'BLOG_POST_WRITING',
    'GOOGLE_REVIEW_REPLY',
  ]);
  await createEnumIfMissing(client, runnerSchema, 'TaskStatus', [
    'QUEUED',
    'PROCESSING',
    'PENDING_APPROVAL',
    'COMPLETED',
    'FAILED',
  ]);
};

const ensureApiTables = async (client) => {
  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('User')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email" varchar(255) NOT NULL,
  "passwordHash" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true
)`);
  await client.query(`
CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(`UQ_${appSchema}_User_email`)}
  ON ${quoteIdent(appSchema)}.${quoteIdent('User')} ("email")`);

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('businesses')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" varchar(255) NOT NULL,
  "category" varchar(255),
  "description" text,
  "logoUrl" text,
  "subscriptionTier" ${quoteIdent(appSchema)}.${quoteIdent('SubscriptionTier')} NOT NULL DEFAULT 'FREE',
  "status" ${quoteIdent(appSchema)}.${quoteIdent('BusinessStatus')} NOT NULL DEFAULT 'ACTIVE'
)`);

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('BusinessUser')} (
  "userId" uuid NOT NULL,
  "businessId" uuid NOT NULL,
  "role" ${quoteIdent(appSchema)}.${quoteIdent('UserRole')} NOT NULL DEFAULT 'EDITOR',
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "businessId")
)`);

  await addConstraintIfMissing(
    client,
    appSchema,
    'BusinessUser',
    `FK_${appSchema}_BusinessUser_userId`,
    `FOREIGN KEY ("userId") REFERENCES ${quoteIdent(appSchema)}.${quoteIdent('User')}("id") ON DELETE CASCADE`,
  );

  await addConstraintIfMissing(
    client,
    appSchema,
    'BusinessUser',
    `FK_${appSchema}_BusinessUser_businessId`,
    `FOREIGN KEY ("businessId") REFERENCES ${quoteIdent(appSchema)}.${quoteIdent('businesses')}("id") ON DELETE CASCADE`,
  );

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('Website')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "domain" varchar(255),
  "vercelUrl" text,
  "cmsData" jsonb,
  "templateId" varchar(255),
  "status" ${quoteIdent(appSchema)}.${quoteIdent('WebsiteStatus')} NOT NULL DEFAULT 'DRAFT',
  "publishedAt" timestamptz,
  "suspendedAt" timestamptz
)`);
  await client.query(`
CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(`UQ_${appSchema}_Website_domain`)}
  ON ${quoteIdent(appSchema)}.${quoteIdent('Website')} ("domain")`);

  await addConstraintIfMissing(
    client,
    appSchema,
    'Website',
    `FK_${appSchema}_Website_businessId`,
    `FOREIGN KEY ("businessId") REFERENCES ${quoteIdent(appSchema)}.${quoteIdent('businesses')}("id") ON DELETE CASCADE`,
  );

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('Subscription')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "tier" ${quoteIdent(appSchema)}.${quoteIdent('SubscriptionTier')} NOT NULL DEFAULT 'FREE',
  "status" ${quoteIdent(appSchema)}.${quoteIdent('SubscriptionStatus')} NOT NULL DEFAULT 'TRIALING',
  "startedAt" timestamptz,
  "expiresAt" timestamptz,
  "paymentProvider" varchar(100),
  "paymentReference" varchar(255)
)`);

  await addConstraintIfMissing(
    client,
    appSchema,
    'Subscription',
    `FK_${appSchema}_Subscription_businessId`,
    `FOREIGN KEY ("businessId") REFERENCES ${quoteIdent(appSchema)}.${quoteIdent('businesses')}("id") ON DELETE CASCADE`,
  );

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('GoogleBusinessConnection')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "provider" varchar(32) NOT NULL DEFAULT 'mock',
  "googleAccountName" text,
  "locationName" text,
  "locationTitle" varchar(255),
  "address" text,
  "encryptedRefreshToken" text,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "lastSyncedAt" timestamptz,
  "status" varchar(32) NOT NULL DEFAULT 'CONNECTED'
)`);
  await client.query(`
CREATE INDEX IF NOT EXISTS ${quoteIdent(`IDX_${appSchema}_GoogleBusinessConnection_businessId`)}
  ON ${quoteIdent(appSchema)}.${quoteIdent('GoogleBusinessConnection')} ("businessId")`);

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('GoogleBusinessReview')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" uuid NOT NULL,
  "locationName" text NOT NULL,
  "reviewName" text NOT NULL UNIQUE,
  "reviewId" varchar(255) NOT NULL,
  "reviewerDisplayName" varchar(255),
  "reviewerIsAnonymous" boolean NOT NULL DEFAULT false,
  "rating" int NOT NULL,
  "comment" text,
  "reviewCreateTime" timestamptz,
  "reviewUpdateTime" timestamptz,
  "googleReply" text,
  "aiReply" text,
  "status" varchar(32) NOT NULL DEFAULT 'SYNCED',
  "agentTaskId" uuid,
  "failureReason" text,
  "repliedAt" timestamptz
)`);
  await client.query(`
CREATE INDEX IF NOT EXISTS ${quoteIdent(`IDX_${appSchema}_GoogleBusinessReview_businessId`)}
  ON ${quoteIdent(appSchema)}.${quoteIdent('GoogleBusinessReview')} ("businessId")`);

  // Compatibility for legacy API paths still reading these tables.
  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('Product')} (
  "id" text PRIMARY KEY,
  "businessId" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "price" double precision,
  "imageUrl" text,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL
)`);

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(appSchema)}.${quoteIdent('SocialMediaPost')} (
  "id" text PRIMARY KEY,
  "businessId" text NOT NULL,
  "platform" text NOT NULL,
  "content" text NOT NULL,
  "hashtags" text[],
  "status" text NOT NULL DEFAULT 'DRAFT',
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL
)`);
};

const ensureAdminTables = async (client) => {
  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(adminSchema)}.${quoteIdent('Template')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" varchar(255) NOT NULL,
  "description" text,
  "type" ${quoteIdent(adminSchema)}.${quoteIdent('TemplateType')} NOT NULL DEFAULT 'SHOWCASE',
  "deployment" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "cmsSchema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "baseHtmlUrl" text
)`);

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(adminSchema)}.${quoteIdent('AdminUser')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email" varchar(255) NOT NULL UNIQUE,
  "passwordHash" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "role" ${quoteIdent(adminSchema)}.${quoteIdent('AdminRole')} NOT NULL DEFAULT 'ADMIN',
  "isActive" boolean NOT NULL DEFAULT true
)`);

  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(adminSchema)}.${quoteIdent('AdminAuditLog')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "adminId" uuid,
  "action" varchar(255) NOT NULL,
  "targetType" varchar(100) NOT NULL,
  "targetId" varchar(255),
  "beforeData" jsonb,
  "afterData" jsonb
)`);

  // Existing legacy data can miss updatedAt.
  await client.query(
    `ALTER TABLE ${quoteIdent(adminSchema)}.${quoteIdent('Template')}
     ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz`,
  );
  await client.query(
    `UPDATE ${quoteIdent(adminSchema)}.${quoteIdent('Template')}
     SET "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
     WHERE "updatedAt" IS NULL`,
  );
  await client.query(
    `ALTER TABLE ${quoteIdent(adminSchema)}.${quoteIdent('Template')}
     ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`,
  );
  await client.query(
    `ALTER TABLE ${quoteIdent(adminSchema)}.${quoteIdent('Template')}
     ALTER COLUMN "updatedAt" SET NOT NULL`,
  );
};

const ensureRunnerTables = async (client) => {
  await client.query(`
CREATE TABLE IF NOT EXISTS ${quoteIdent(runnerSchema)}.${quoteIdent('AgentTask')} (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "businessId" varchar(255) NOT NULL,
  "taskType" ${quoteIdent(runnerSchema)}.${quoteIdent('TaskType')} NOT NULL,
  "status" ${quoteIdent(runnerSchema)}.${quoteIdent('TaskStatus')} NOT NULL DEFAULT 'QUEUED',
  "inputData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "outputData" jsonb,
  "logs" text
)`);
};

const main = async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await ensureBaseSchemas(client);
    await ensureEnums(client);
    await ensureApiTables(client);
    await ensureAdminTables(client);
    await ensureRunnerTables(client);
    await client.query('COMMIT');
    console.log('DB bootstrap complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('DB bootstrap failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
