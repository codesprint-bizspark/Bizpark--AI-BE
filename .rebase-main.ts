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
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  app.enableCors({
    origin: allowedOrigins
      ? allowedOrigins.split(',').map((o) => o.trim())
      : true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
