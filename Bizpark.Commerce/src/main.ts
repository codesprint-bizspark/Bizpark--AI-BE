import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

// Suppress TypeORM + pg@8 synchronize deprecation warning.
// TypeORM 0.3.x fires concurrent client.query() calls during schema sync.
// Harmless — does not affect query correctness. Remove when migrating to TypeORM migrations.
process.on('warning', (w) => {
  if (w.message?.includes('client.query()')) {
    // absorbed — suppress default stderr output for this known warning
  }
});
// Override emit to prevent the default warning handler from printing it
const _originalEmit = process.emit;
process.emit = function (event: string, ...args: unknown[]): boolean {
  if (event === 'warning' && (args[0] as Error)?.message?.includes('client.query()')) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_originalEmit as any).call(process, event, ...args);
} as typeof process.emit;

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'commerce-secret-change-me') {
    console.warn('\n⚠️  WARNING: JWT_SECRET is not set or is using the insecure default.\n   Set JWT_SECRET in your .env file before deploying to production.\n');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Storefronts run on per-tenant subdomains (<slug>.bizspark.online) and call
  // this API cross-origin with credentials, so reflect our own domains' origins
  // (any bizspark.online / randitha.net subdomain + localhost) and allow creds.
  app.enableCors({
    origin: [
      /^https:\/\/([a-z0-9-]+\.)*bizspark\.online$/,
      /^https:\/\/([a-z0-9-]+\.)*randitha\.net$/,
      /^http:\/\/localhost(:\d+)?$/,
    ],
    credentials: true,
  });
  // Serve locally-stored uploads (dev fallback when Supabase Storage is unset)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Swagger ────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Bizpark Commerce API')
    .setDescription(
      'Multi-tenant e-commerce REST API.\n\n' +
      '**Headers required on every request:**\n' +
      '- `x-tenant-id` — your tenant identifier (e.g. `testbiz`)\n\n' +
      '**Auth:** Most write endpoints require a Bearer JWT obtained from `/api/commerce/auth/login`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT from /auth/login' },
      'JWT',
    )
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-tenant-id', description: 'Tenant identifier' }, 'TenantId')
    .addTag('Auth', 'Register, login, profile')
    .addTag('Catalog — Products', 'Browse and manage products')
    .addTag('Catalog — Categories', 'Browse and manage categories')
    .addTag('Catalog — Variants', 'Product variants (size, colour, etc.)')
    .addTag('Cart', 'Shopping cart operations')
    .addTag('Checkout', 'Begin and complete checkout')
    .addTag('Orders', 'Order management')
    .addTag('Customers', 'Admin: manage customers')
    .addTag('Inventory', 'Admin: stock management')
    .addTag('Shipping', 'Shipping methods and quotes')
    .addTag('Payments', 'Payment intents and webhooks')
    .addTag('Subscriptions', 'Subscription management')
    .addTag('Website Config', 'Store branding and content')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
  // ──────────────────────────────────────────────────────────────

  await app.listen(process.env.PORT ?? 3003);
  console.log(`\n📚 Swagger UI → http://localhost:${process.env.PORT ?? 3003}/api/docs\n`);
}

bootstrap();
