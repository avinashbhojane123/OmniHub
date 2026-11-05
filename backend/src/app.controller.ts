import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import type { AppHealthStatus, AppInfoResponse } from './app.service';
import {
  RateLimitGuard,
  SetRateLimit,
} from './common/guards/rate-limit.guard';

export interface AppLivenessResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface AppReadinessResponse {
  status: 'ok' | 'degraded';
  ready: boolean;
  database: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
  timestamp: string;
}

@UseGuards(RateLimitGuard)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getInfo(): AppInfoResponse {
    return this.appService.getInfo();
  }

  /**
   * Comprehensive health check reporting full system, process, and database telemetry.
   * Returns HTTP 200 if healthy, HTTP 503 if degraded, with elevated rate limits for monitors.
   * Supported paths: GET /health and standard Kubelet probe GET /healthz
   */
  @Get(['health', 'healthz'])
  @SetRateLimit({ maxHits: 3000, windowMs: 60 * 1000 })
  async getHealth(
    @Res({ passthrough: true }) res: Response,
    @Query('timeout') timeoutQuery?: string,
  ): Promise<AppHealthStatus> {
    let customTimeout: number | undefined;
    if (timeoutQuery !== undefined && timeoutQuery !== '') {
      const parsed = parseInt(timeoutQuery, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new BadRequestException(
          'Invalid timeout parameter. Must be a positive integer.',
        );
      }
      const maxTimeout =
        Number(process.env.HEALTH_CHECK_MAX_TIMEOUT_MS) || 30000;
      customTimeout = Math.min(parsed, maxTimeout);
    }

    // Prevent proxy / CDN caching of health status
    if (typeof res?.setHeader === 'function') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    const health = await this.appService.getHealth(customTimeout);

    if (health.status === 'degraded') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    } else {
      res.status(HttpStatus.OK);
    }

    return health;
  }

  /**
   * Kubernetes/Docker Liveness probe.
   * Fast check verifying process event-loop responsiveness without hitting external databases.
   * Supported paths: GET /health/live and standard Kubelet probe GET /livez
   */
  @Get(['health/live', 'livez'])
  @SetRateLimit({ maxHits: 5000, windowMs: 60 * 1000 })
  getLiveness(@Res({ passthrough: true }) res?: Response): AppLivenessResponse {
    if (typeof res?.setHeader === 'function') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Kubernetes/Docker Readiness probe.
   * Verifies database connectivity and readiness to receive client traffic.
   * Returns HTTP 200 if ready, HTTP 503 if not ready.
   * Supported paths: GET /health/ready and standard Kubelet probe GET /readyz
   */
  @Get(['health/ready', 'readyz'])
  @SetRateLimit({ maxHits: 3000, windowMs: 60 * 1000 })
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
    @Query('timeout') timeoutQuery?: string,
  ): Promise<AppReadinessResponse> {
    let customTimeout: number | undefined;
    if (timeoutQuery !== undefined && timeoutQuery !== '') {
      const parsed = parseInt(timeoutQuery, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new BadRequestException(
          'Invalid timeout parameter. Must be a positive integer.',
        );
      }
      const maxTimeout =
        Number(process.env.HEALTH_CHECK_MAX_TIMEOUT_MS) || 30000;
      customTimeout = Math.min(parsed, maxTimeout);
    }

    if (typeof res?.setHeader === 'function') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    const dbPing = await this.appService.pingDatabase(customTimeout);
    const isReady = dbPing.connected;

    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    } else {
      res.status(HttpStatus.OK);
    }

    return {
      status: isReady ? 'ok' : 'degraded',
      ready: isReady,
      database: {
        connected: dbPing.connected,
        latencyMs: dbPing.latencyMs,
        error: dbPing.error,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
