import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { config as loadEnv } from 'dotenv';
import { json, urlencoded } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

// Load Bizpark.Core/.env in local dev (same pattern as other services)
const coreEnv = join(__dirname, '..', '..', 'Bizpark.Core', '.env');
if (existsSync(coreEnv)) {
  loadEnv({ path: coreEnv });
}

async function bootstrap() {
  const BODY_LIMIT = process.env.BODY_LIMIT || '200mb';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  new Logger('Bootstrap').log(`JSON body parser limit set to ${BODY_LIMIT}`);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  // Users send images / videos to /social/content/generate as base64 data
  // URLs in the JSON body. Base64 inflates the raw byte size by ~33%, so a
  // 45MB video → ~60MB on the wire. Default Express limit is 100kb. We need
  // a generous cap with enough headroom for several files in one request.
  // Override via BODY_LIMIT env var if needed.
  const BODY_LIMIT = process.env.BODY_LIMIT || '200mb';

  // `bodyParser: false` disables Nest's default 100kb parsers so we can
  // install our own BEFORE any route is registered. Without this, the
  // default parser rejects the request with 413 before our override sees it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Use the raw Express middleware directly to remove any ambiguity around
  // how Nest's `useBodyParser` wraps the options object across versions.
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  new Logger('Bootstrap').log(`JSON body parser limit set to ${BODY_LIMIT}`);

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // ALLOWED_ORIGINS = comma-separated list, e.g.:
  //   https://app.bizpark.app,https://bizpark.app,https://*.bizpark.app
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  app.enableCors({
    origin: allowedOrigins
      ? allowedOrigins.split(',').map((o) => o.trim())
      : true,
    credentials: true,
  });
      : true, // allow all in dev
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
