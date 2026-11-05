import { Injectable, Optional, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as os from 'os';
import * as fs from 'fs';
import { join } from 'path';

export interface AppInfoResponse {
  name: string;
  version: string;
  status: string;
  environment: string;
  nodeVersion: string;
  uptimeSeconds: number;
  modules: string[];
  timestamp: string;
}

export interface AppMemoryUsage {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
}

export interface AppSystemMetrics {
  platform: string;
  cpuCount: number;
  loadAverage: number[];
  freeMemoryMB: number;
  totalMemoryMB: number;
}

export interface AppDatabasePoolMetrics {
  total?: number;
  idle?: number;
  waiting?: number;
}

export interface AppDatabaseHealth {
  connected: boolean;
  type: string;
  latencyMs?: number;
  entitiesCount?: number;
  pool?: AppDatabasePoolMetrics;
  error?: string;
}

export interface AppHealthStatus {
  status: 'ok' | 'degraded';
  name: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  nodeVersion: string;
  memory: AppMemoryUsage;
  system: AppSystemMetrics;
  database: AppDatabaseHealth;
  modules: string[];
  timestamp: string;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private cachedVersion?: string;

  constructor(@Optional() private readonly dataSource?: DataSource) {}

  /**
   * Return the list of registered core feature modules.
   */
  getModules(): string[] {
    return [
      'RoomsModule',
      'ChatModule',
      'UploadModule',
      'StatusModule',
      'KeepAliveModule',
      'InstagramModule',
      'MoviesModule',
      'BatteryModule',
      'TasksModule',
    ];
  }

  /**
   * Reset the cached version string (useful for testing or dynamic reloads).
   */
  resetCachedVersion(): void {
    this.cachedVersion = undefined;
  }

  /**
   * Resolve application version from environment or package.json,
   * caching the result to avoid repeated synchronous disk reads.
   */
  getVersion(): string {
    if (this.cachedVersion) {
      return this.cachedVersion;
    }

    if (process.env.APP_VERSION) {
      this.cachedVersion = process.env.APP_VERSION;
      return this.cachedVersion;
    }

    if (process.env.npm_package_version) {
      this.cachedVersion = process.env.npm_package_version;
      return this.cachedVersion;
    }

    try {
      const pkgPath = join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) {
          this.cachedVersion = String(pkg.version);
          return this.cachedVersion;
        }
      }
    } catch {
      // Ignore filesystem read errors and fallback safely
    }

    this.cachedVersion = '0.0.1';
    return this.cachedVersion;
  }

  getInfo(): AppInfoResponse {
    return {
      name: 'OmniHub API',
      version: this.getVersion(),
      status: 'online',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      modules: this.getModules(),
      timestamp: new Date().toISOString(),
    };
  }

  getMemoryUsage(): AppMemoryUsage {
    const mem = process.memoryUsage();
    return {
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    };
  }

  getSystemMetrics(): AppSystemMetrics {
    return {
      platform: process.platform,
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg(),
      freeMemoryMB: Math.round((os.freemem() / 1024 / 1024) * 100) / 100,
      totalMemoryMB: Math.round((os.totalmem() / 1024 / 1024) * 100) / 100,
    };
  }

  async pingDatabase(
    timeoutMs?: number,
  ): Promise<{
    connected: boolean;
    latencyMs?: number;
    entitiesCount?: number;
    pool?: AppDatabasePoolMetrics;
    error?: string;
  }> {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      return {
        connected: false,
        error: !this.dataSource
          ? 'Database DataSource is not configured'
          : 'Database connection is not initialized',
      };
    }

    let parsedEnvTimeout = 2500;
    if (process.env.DB_PING_TIMEOUT_MS) {
      const p = parseInt(process.env.DB_PING_TIMEOUT_MS, 10);
      if (!isNaN(p) && p > 0) {
        parsedEnvTimeout = p;
      }
    }

    const effectiveTimeout =
      timeoutMs !== undefined && !isNaN(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : parsedEnvTimeout;

    const start = Date.now();
    let timerId: NodeJS.Timeout | undefined;

    try {
      const pingPromise = this.dataSource.query('SELECT 1');

      // Prevent unhandled rejection if timeout triggers before query finishes
      pingPromise.catch((err) => {
        this.logger.debug(
          `Background ping query completed after timeout or error: ${err?.message || err}`,
        );
      });

      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
          reject(
            new Error(
              `Database ping timed out after ${effectiveTimeout}ms`,
            ),
          );
        }, effectiveTimeout);
      });

      await Promise.race([pingPromise, timeoutPromise]);
      const latencyMs = Date.now() - start;
      const entitiesCount = Array.isArray(this.dataSource.entityMetadatas)
        ? this.dataSource.entityMetadatas.length
        : 0;

      let poolMetrics: AppDatabasePoolMetrics | undefined;
      try {
        const driver = (this.dataSource as any)?.driver;
        const pool = driver?.master?._pool || driver?.pool;
        if (pool) {
          poolMetrics = {
            total: pool.totalCount ?? pool.size,
            idle: pool.idleCount ?? pool.available,
            waiting: pool.waitingCount ?? pool.pending,
          };
        }
      } catch {
        // Pool extraction error suppressed
      }

      return {
        connected: true,
        latencyMs,
        entitiesCount,
        pool: poolMetrics,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      this.logger.warn(`Database health check failed: ${errorMsg}`);
      return {
        connected: false,
        error: errorMsg,
      };
    } finally {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }

  async getHealth(timeoutMs?: number): Promise<AppHealthStatus> {
    const dbType = this.dataSource?.options?.type || 'unknown';
    const dbPing = await this.pingDatabase(timeoutMs);

    const isHealthy = dbPing.connected;

    return {
      status: isHealthy ? 'ok' : 'degraded',
      name: 'OmniHub API',
      version: this.getVersion(),
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memory: this.getMemoryUsage(),
      system: this.getSystemMetrics(),
      database: {
        connected: dbPing.connected,
        type: String(dbType),
        latencyMs: dbPing.latencyMs,
        entitiesCount: dbPing.entitiesCount,
        pool: dbPing.pool,
        error: dbPing.error,
      },
      modules: this.getModules(),
      timestamp: new Date().toISOString(),
    };
  }
}
