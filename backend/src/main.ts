import * as dotenv from 'dotenv';
dotenv.config();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Response } from 'express';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable full internet and mobile cross-origin access
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS !== '*'
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : true;

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
  });

  // URL rewrite middleware: normalize routes without /api/ prefix
  app.use((req: any, res: any, next: any) => {
    const rawPath = req.url.split('?')[0];
    if (
      rawPath === '/dashboard' ||
      rawPath === '/monitor' ||
      rawPath === '/api/dashboard' ||
      rawPath === '/api/monitor' ||
      rawPath === '/'
    ) {
      req.url = '/api/devices/dashboard';
    } else if (
      req.url.startsWith('/devices') ||
      req.url.startsWith('/device')
    ) {
      if (!req.url.startsWith('/api/')) {
        req.url = `/api${req.url}`;
      }
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const uploadDirName = process.env.UPLOAD_DIR || 'uploads';
  const uploadPath = join(process.cwd(), uploadDirName);

  console.log('Uploads folder:', uploadPath);

  const uploadPrefix = process.env.UPLOAD_PREFIX || '/uploads/';

  app.useStaticAssets(uploadPath, {
    prefix: uploadPrefix,
    setHeaders: (res: Response) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob: *; media-src 'self' data: blob: *; style-src 'self' 'unsafe-inline';",
      );
      res.set('X-Frame-Options', 'DENY');
      res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    },
  });

  // Also serve uploads under /api/uploads/ to prevent 404 if API prefix is prepended by clients
  app.useStaticAssets(uploadPath, {
    prefix: '/api/uploads/',
    setHeaders: (res: Response) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('X-Content-Type-Options', 'nosniff');
    },
  });

  const globalPrefix = process.env.GLOBAL_PREFIX || 'api';
  const excludePath = `${uploadDirName}/*path`;
  const apiExcludePath = `api/${uploadDirName}/*path`;

  app.setGlobalPrefix(globalPrefix, {
    exclude: [excludePath, uploadDirName, apiExcludePath],
  });

  const port = Number(process.env.PORT || 10000);

  await app.listen(port, '0.0.0.0');

  console.log(`Application running on port ${port} (0.0.0.0)`);
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal error during application startup:', err);
  process.exit(1);
});
