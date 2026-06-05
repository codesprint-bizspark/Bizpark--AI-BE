import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.locals.currentPath = request.path;
    next();
  });
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');
  const port = process.env.PORT ?? 3002;
  await app.listen(port);

  const url = `http://localhost:${port}`;
  const logger = new Logger('Bootstrap');
  logger.log(`Bizpark Admin MVC frontend ready → ${url}`);
}
bootstrap();
