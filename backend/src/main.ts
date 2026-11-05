import * as dotenv from 'dotenv';
dotenv.config();

import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded, Response } from 'express';
import { join } from 'path';
import * as fs from 'fs';
import compression from 'compression';

import { AppModule } from './app.module';

/**
 * Sanitize and validate port configuration, falling back to 10000.
 * Enforces valid TCP 16-bit unsigned port range (1 - 65535).
 */
export function normalizePort(portVal?: string | number): number {
  if (typeof portVal === 'number' && !isNaN(portVal) && portVal > 0 && portVal <= 65535) {
    return Math.floor(portVal);
  }
  if (typeof portVal === 'string' && portVal.trim()) {
    const parsed = parseInt(portVal.trim(), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return 10000;
}

/**
 * Android mobile-first request normalizer.
 * Routes root path and health probes (/healthz, /livez, /readyz) to their respective endpoints,
 * and prefixes Android mobile endpoints (/auth, /devices, /battery, /upload) with /api.
 */
export function urlRewriteMiddleware(req: any, _res: any, next: any) {
  if (!req || !req.url) {
    return next();
  }

  const queryIdx = req.url.indexOf('?');
  const rawPath = queryIdx !== -1 ? req.url.substring(0, queryIdx) : req.url;
  const queryString = queryIdx !== -1 ? req.url.substring(queryIdx) : '';

  // Route root path to API info endpoint
  if (rawPath === '/' || rawPath === '/api' || rawPath === '/api/') {
    req.url = `/api${queryString}`;
  }
  // Route standard root health probes to their api-prefixed controller counterparts
  else if (
    rawPath === '/healthz' ||
    rawPath === '/livez' ||
    rawPath === '/readyz' ||
    rawPath === '/health' ||
    rawPath === '/health/live' ||
    rawPath === '/health/ready'
  ) {
    req.url = `/api${req.url}`;
  }
  // Normalize Android controller routes without /api prefix
  else if (
    req.url.startsWith('/auth') ||
    req.url.startsWith('/devices') ||
    req.url.startsWith('/device') ||
    req.url.startsWith('/battery') ||
    (req.url.startsWith('/upload') && !req.url.startsWith('/uploads/'))
  ) {
    if (!req.url.startsWith('/api/')) {
      req.url = `/api${req.url}`;
    }
  }

  next();
}

export async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust first-hop proxy in cloud environments (Render, Railway, AWS ALB, Nginx)
  const trustProxyEnv = process.env.TRUST_PROXY?.trim();
  const trustProxy =
    trustProxyEnv === 'true'
      ? true
      : trustProxyEnv === 'false'
        ? false
        : !isNaN(Number(trustProxyEnv)) && Number(trustProxyEnv) >= 0
          ? Number(trustProxyEnv)
          : 1;
  app.set('trust proxy', trustProxy);

  // Graceful shutdown hooks on SIGTERM / SIGINT to close DB pools cleanly
  app.enableShutdownHooks();

  // Mobile payload compression (GZIP/Brotli) for OkHttp / Retrofit clients
  app.use(compression());

  // URL rewrite middleware
  app.use(urlRewriteMiddleware);

  // Anti-sniff header for native binary/media endpoints
  app.use((_req: any, res: any, next: any) => {
    if (typeof res?.setHeader === 'function') {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    next();
  });

  // Safe body payload parsing boundaries
  const maxBodySize = process.env.MAX_BODY_SIZE || '10mb';
  app.use(json({ limit: maxBodySize }));
  app.use(urlencoded({ extended: true, limit: maxBodySize }));

  // Global DTO Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Ensure uploads directory exists on disk
  const uploadDirName = (process.env.UPLOAD_DIR || 'uploads').replace(/^\/+|\/+$/g, '');
  const uploadPath = join(process.cwd(), uploadDirName);
  if (!fs.existsSync(uploadPath)) {
    try {
      fs.mkdirSync(uploadPath, { recursive: true });
    } catch {
      // Directory creation race condition ignored
    }
  }

  logger.log(`Uploads folder: ${uploadPath}`);

  // Static media headers for Android ExoPlayer and Glide/Coil byte-range caching
  const setStaticHeaders = (res: Response) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Accept-Ranges', 'bytes');
  };

  // Static assets serving for Android media downloads and streaming
  const uploadPrefix = process.env.UPLOAD_PREFIX || '/uploads/';
  app.useStaticAssets(uploadPath, {
    prefix: uploadPrefix,
    setHeaders: setStaticHeaders,
  });

  // Also serve uploads under /api/uploads/
  app.useStaticAssets(uploadPath, {
    prefix: '/api/uploads/',
    setHeaders: setStaticHeaders,
  });

  // Global API route prefixing
  const globalPrefix = process.env.GLOBAL_PREFIX || 'api';
  const excludePath = `${uploadDirName}/*path`;
  const apiExcludePath = `api/${uploadDirName}/*path`;

  app.setGlobalPrefix(globalPrefix, {
    exclude: [excludePath, uploadDirName, apiExcludePath],
  });

  const port = normalizePort(process.env.PORT || process.env.port);
  const host = (process.env.SERVER_HOST || process.env.HOST || '0.0.0.0').trim();
  await app.listen(port, host);

  logger.log(`Android Mobile API running on ${host}:${port}`);
  return app;
}

// Global runtime exception and rejection safety handlers
process.on('unhandledRejection', (reason: unknown) => {
  const logger = new Logger('UnhandledRejection');
  logger.error('Unhandled Promise Rejection detected:', reason);
});

process.on('uncaughtException', (err: Error) => {
  const logger = new Logger('UncaughtException');
  logger.error('Uncaught Exception detected:', err?.stack || err?.message);
});

// Run bootstrap when launched directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err: unknown) => {
    const logger = new Logger('BootstrapFatal');
    logger.error('Fatal error during application startup:', err);
    process.exit(1);
  });
}
