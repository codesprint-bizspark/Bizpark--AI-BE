import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
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

  // ALLOWED_ORIGINS = comma-separated list, e.g.:
  //   https://app.bizpark.app,https://bizpark.app,https://*.bizpark.app
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  app.enableCors({
    origin: allowedOrigins
      ? allowedOrigins.split(',').map((o) => o.trim())
      : true, // allow all in dev
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
