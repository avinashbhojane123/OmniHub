import { ConfigService } from '@nestjs/config';
import {
  AppModule,
  isSslRequired,
  getTypeOrmOptions,
} from './app.module';

describe('AppModule', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should define AppModule class', () => {
    expect(AppModule).toBeDefined();
    const appModule = new AppModule();
    expect(appModule).toBeDefined();
  });

  describe('isSslRequired', () => {
    it('should return false when DB_SSL is explicitly false', () => {
      expect(isSslRequired('postgresql://cloud-host/db', 'false', true)).toBe(
        false,
      );
    });

    it('should return true when DB_SSL is explicitly true', () => {
      expect(isSslRequired('postgresql://localhost/db', 'true', false)).toBe(
        true,
      );
    });

    it('should return false when URL has sslmode=disable', () => {
      expect(
        isSslRequired('postgresql://remote/db?sslmode=disable', undefined, true),
      ).toBe(false);
    });

    it('should return true when URL has sslmode=require', () => {
      expect(
        isSslRequired(
          'postgresql://remote/db?sslmode=require',
          undefined,
          false,
        ),
      ).toBe(true);
    });

    it('should return false for localhost or 127.0.0.1 URLs', () => {
      expect(
        isSslRequired('postgresql://localhost:5432/omnihub', undefined, false),
      ).toBe(false);
      expect(
        isSslRequired(
          'postgresql://127.0.0.1:5432/omnihub',
          undefined,
          false,
        ),
      ).toBe(false);
    });

    it('should return true for remote cloud database URLs', () => {
      expect(
        isSslRequired(
          'postgresql://user:pass@ep-cool-fog-123.us-east-2.aws.neon.tech/neondb',
          undefined,
          false,
        ),
      ).toBe(true);
    });

    it('should fallback to isProd when no URL or DB_SSL is provided', () => {
      expect(isSslRequired(undefined, undefined, true)).toBe(true);
      expect(isSslRequired(undefined, undefined, false)).toBe(false);
    });
  });

  describe('getTypeOrmOptions', () => {
    it('should configure SQLite when DB_TYPE is sqlite or better-sqlite3', () => {
      process.env.DB_TYPE = 'better-sqlite3';
      process.env.DB_DATABASE = 'test.sqlite';

      const options = getTypeOrmOptions() as any;
      expect(options.type).toBe('better-sqlite3');
      expect(options.database).toBe('test.sqlite');
      expect(options.ssl).toBeUndefined();
      expect(options.autoLoadEntities).toBe(true);
      expect(options.retryAttempts).toBe(10);
      expect(options.retryDelay).toBe(3000);
    });

    it('should configure PostgreSQL with connection pool and URL', () => {
      process.env.DB_TYPE = 'postgres';
      process.env.DATABASE_URL =
        'postgresql://user:pass@remote.db.com:5432/dbname';
      process.env.DB_POOL_MAX = '25';
      process.env.DB_TIMEOUT_MS = '5000';
      process.env.DB_IDLE_TIMEOUT_MS = '15000';

      const options = getTypeOrmOptions() as any;
      expect(options.type).toBe('postgres');
      expect(options.url).toBe(
        'postgresql://user:pass@remote.db.com:5432/dbname',
      );
      expect(options.extra.max).toBe(25);
      expect(options.extra.connectionTimeoutMillis).toBe(5000);
      expect(options.extra.idleTimeoutMillis).toBe(15000);
      expect(options.extra.ssl).toEqual({ rejectUnauthorized: false });
      expect(options.ssl).toEqual({ rejectUnauthorized: false });
    });

    it('should sanitize sslmode in DATABASE_URL from require to no-verify for cloud self-signed certs', () => {
      process.env.DB_TYPE = 'postgres';
      process.env.DATABASE_URL =
        'postgresql://user:pass@pooler.supabase.com:6543/postgres?sslmode=require';
      delete process.env.DB_SSL_REJECT_UNAUTHORIZED;

      const options = getTypeOrmOptions() as any;
      expect(options.url).toBe(
        'postgresql://user:pass@pooler.supabase.com:6543/postgres?sslmode=no-verify',
      );
      expect(options.extra.ssl).toEqual({ rejectUnauthorized: false });
      expect(options.ssl).toEqual({ rejectUnauthorized: false });
    });

    it('should support individual DB credentials and sanitize port', () => {
      delete process.env.DATABASE_URL;
      process.env.DB_TYPE = 'postgres';
      process.env.DB_HOST = 'custom-host';
      process.env.DB_PORT = '5433';
      process.env.DB_USERNAME = 'myuser';
      process.env.DB_PASSWORD = 'mypassword';
      process.env.DB_NAME = 'mydb';

      const options = getTypeOrmOptions() as any;
      expect(options.host).toBe('custom-host');
      expect(options.port).toBe(5433);
      expect(options.username).toBe('myuser');
      expect(options.password).toBe('mypassword');
      expect(options.database).toBe('mydb');
    });

    it('should default port to 3306 for MySQL/MariaDB and 5432 for PostgreSQL', () => {
      delete process.env.DATABASE_URL;
      delete process.env.DB_PORT;

      process.env.DB_TYPE = 'mysql';
      const mysqlOptions = getTypeOrmOptions() as any;
      expect(mysqlOptions.port).toBe(3306);

      process.env.DB_TYPE = 'mariadb';
      const mariadbOptions = getTypeOrmOptions() as any;
      expect(mariadbOptions.port).toBe(3306);

      process.env.DB_TYPE = 'postgres';
      const pgOptions = getTypeOrmOptions() as any;
      expect(pgOptions.port).toBe(5432);
    });

    it('should fallback to default port when DB_PORT is invalid', () => {
      delete process.env.DATABASE_URL;
      process.env.DB_TYPE = 'postgres';
      process.env.DB_PORT = 'invalid';
      const options = getTypeOrmOptions() as any;
      expect(options.port).toBe(5432);
    });

    it('should configure logging to errors/warnings by default and full SQL when requested', () => {
      delete process.env.DB_LOGGING;
      const defaultLogging = getTypeOrmOptions() as any;
      expect(defaultLogging.logging).toEqual(['error', 'warn']);

      process.env.DB_LOGGING = 'true';
      const fullLogging = getTypeOrmOptions() as any;
      expect(fullLogging.logging).toBe(true);
    });

    it('should disable synchronize in production by default', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_SYNCHRONIZE;

      const options = getTypeOrmOptions() as any;
      expect(options.synchronize).toBe(false);
    });

    it('should allow synchronize in production only when explicitly requested', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_SYNCHRONIZE = 'true';

      const options = getTypeOrmOptions() as any;
      expect(options.synchronize).toBe(true);
    });

    it('should default synchronize to true in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DB_SYNCHRONIZE;

      const options = getTypeOrmOptions() as any;
      expect(options.synchronize).toBe(true);
    });

    it('should read options from ConfigService instance if provided', () => {
      const mockConfigService = {
        get: (key: string) => {
          if (key === 'DB_TYPE') return 'postgres';
          if (key === 'DATABASE_URL') return 'postgresql://localhost:5432/testdb';
          if (key === 'NODE_ENV') return 'development';
          return undefined;
        },
      } as unknown as ConfigService;

      const options = getTypeOrmOptions(mockConfigService) as any;
      expect(options.type).toBe('postgres');
      expect(options.url).toBe('postgresql://localhost:5432/testdb');
      expect(options.ssl).toBe(false);
    });
  });
});
