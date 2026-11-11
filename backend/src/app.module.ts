import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

import { RoomsModule } from './rooms/rooms.module';
import { ChatModule } from './chat/chat.module';
import { UploadModule } from './upload/upload.module';
import { StatusModule } from './status/status.module';
import { MoviesModule } from './movies/movies.module';
import { BatteryModule } from './battery/battery.module';
import { TasksModule } from './tasks/tasks.module';
import { DevicesModule } from './devices/devices.module';
import { AuthModule } from './auth/auth.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

/**
 * Determine if SSL is required for database connectivity.
 * Avoids forcing SSL on localhost / 127.0.0.1 or when sslmode=disable is set.
 */
export function isSslRequired(
  dbUrl?: string,
  dbSsl?: string,
  isProd = process.env.NODE_ENV === 'production',
): boolean {
  if (dbSsl === 'false') return false;
  if (dbSsl === 'true') return true;

  if (dbUrl) {
    if (dbUrl.includes('sslmode=disable')) return false;
    if (
      dbUrl.includes('sslmode=require') ||
      dbUrl.includes('sslmode=no-verify')
    )
      return true;
    if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) return false;
    return true; // Remote cloud database URL
  }

  return isProd;
}

/**
 * Build production-ready TypeORM connection options with safety checks,
 * connection pooling, and multi-driver support (PostgreSQL, SQLite, MySQL).
 */
export function getTypeOrmOptions(
  configService?: ConfigService,
): TypeOrmModuleOptions {
  const get = (key: string): string | undefined =>
    configService ? configService.get<string>(key) : process.env[key];

  const isProduction = get('NODE_ENV') === 'production';
  const rawDbType = get('DB_TYPE')?.trim().toLowerCase() || 'postgres';
  const dbType = rawDbType as any;
  const rawDbUrl = get('DATABASE_URL')?.trim();
  const dbUrl = rawDbUrl && rawDbUrl.length > 0 ? rawDbUrl : undefined;
  const dbSsl = get('DB_SSL')?.trim();
  const dbSslRejectUnauthorized = get('DB_SSL_REJECT_UNAUTHORIZED')?.trim();
  const dbSynchronize = get('DB_SYNCHRONIZE')?.trim();

  // Prevent schema data loss in production: synchronize defaults to false
  const synchronize = isProduction
    ? dbSynchronize === 'true'
    : dbSynchronize !== 'false';

  // Configurable query logging: errors/warns by default, full SQL only when explicitly requested
  const logging: any =
    get('DB_LOGGING') === 'true' ? true : ['error', 'warn'];

  // Resilient startup for cloud / containerized databases waking from sleep
  const retryAttempts =
    parseInt(get('DB_RETRY_ATTEMPTS') || '10', 10) || 10;
  const retryDelay =
    parseInt(get('DB_RETRY_DELAY_MS') || '3000', 10) || 3000;

  // SQLite / better-sqlite3 configuration
  if (dbType === 'sqlite' || dbType === 'better-sqlite3') {
    const database =
      get('DB_DATABASE')?.trim() || get('DB_NAME')?.trim() || 'omnihub.sqlite';
    return {
      type: dbType,
      database,
      autoLoadEntities: true,
      synchronize,
      logging,
      retryAttempts,
      retryDelay,
    };
  }

  // PostgreSQL / Cloud database configuration
  const isSslEnabled = isSslRequired(dbUrl, dbSsl, isProduction);

  // If SSL is enabled and strict CA validation is NOT requested,
  // sanitize sslmode in DATABASE_URL from 'require' to 'no-verify' so pg-connection-string
  // does not override rejectUnauthorized with true, preventing self-signed cert chain errors.
  let normalizedDbUrl = dbUrl;
  if (normalizedDbUrl && isSslEnabled && dbSslRejectUnauthorized !== 'true') {
    try {
      const parsedUrl = new URL(normalizedDbUrl);
      const sslMode = parsedUrl.searchParams.get('sslmode');
      if (sslMode && sslMode !== 'no-verify' && sslMode !== 'disable') {
        parsedUrl.searchParams.set('sslmode', 'no-verify');
        normalizedDbUrl = parsedUrl.toString();
      }
    } catch {
      normalizedDbUrl = normalizedDbUrl.replace(
        /([?&])sslmode=(?!no-verify|disable)[^&]+/i,
        '$1sslmode=no-verify',
      );
    }
  }

  const poolMax = parseInt(
    get('DB_POOL_MAX') || get('DB_MAX_CONNECTIONS') || '',
    10,
  );
  const timeoutMs = parseInt(get('DB_TIMEOUT_MS') || '', 10);
  const idleTimeoutMs = parseInt(get('DB_IDLE_TIMEOUT_MS') || '', 10);

  const extra: Record<string, any> = {
    max: !isNaN(poolMax) && poolMax > 0 ? poolMax : 20,
    connectionTimeoutMillis:
      !isNaN(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000,
    idleTimeoutMillis:
      !isNaN(idleTimeoutMs) && idleTimeoutMs > 0 ? idleTimeoutMs : 30000,
  };

  if (isSslEnabled) {
    extra.ssl = {
      rejectUnauthorized: dbSslRejectUnauthorized === 'true',
    };
  }

  const rawPort = get('DB_PORT');
  let parsedPort: number | undefined;
  if (rawPort !== undefined && rawPort.trim() !== '') {
    const p = parseInt(rawPort.trim(), 10);
    if (!isNaN(p) && p > 0) {
      parsedPort = p;
    }
  }

  const defaultPort =
    dbType === 'mysql' || dbType === 'mariadb' ? 3306 : 5432;

  return {
    type: dbType,

    ...(normalizedDbUrl
      ? { url: normalizedDbUrl }
      : {
          host: get('DB_HOST')?.trim() || 'localhost',
          port: parsedPort ?? defaultPort,
          username: get('DB_USERNAME')?.trim(),
          password: get('DB_PASSWORD')?.trim(),
          database: get('DB_NAME')?.trim(),
        }),

    ssl: isSslEnabled
      ? {
          rejectUnauthorized: dbSslRejectUnauthorized === 'true',
        }
      : false,

    extra,
    autoLoadEntities: true,
    synchronize,
    logging,
    retryAttempts,
    retryDelay,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getTypeOrmOptions(configService),
    }),

    RoomsModule,
    ChatModule,
    UploadModule,
    StatusModule,
    MoviesModule,
    BatteryModule,
    TasksModule,
    DevicesModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, RateLimitGuard],
  exports: [AppService, RateLimitGuard],
})
export class AppModule {}
