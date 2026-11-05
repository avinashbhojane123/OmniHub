import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';

export interface PingResult {
  success: boolean;
  statusCode?: number;
  message: string;
  timestamp: string;
  durationMs: number;
  url: string;
}

export interface KeepAliveStatus {
  service: string;
  active: boolean;
  targetUrl: string;
  intervalMinutes: number;
  totalPingsSent: number;
  lastPingResult: PingResult | null;
  uptimeSeconds: number;
}

@Injectable()
export class KeepAliveService implements OnModuleInit, OnModuleDestroy {
  public static readonly DEFAULT_INTERVAL_MINUTES = 5;
  public static readonly MIN_INTERVAL_MINUTES = 1;
  public static readonly DEFAULT_TIMEOUT_MS = 10000;
  public static readonly MIN_TIMEOUT_MS = 1000;
  public static readonly DEFAULT_INITIAL_DELAY_MS = 15000;
  private static readonly MAX_BODY_LENGTH = 64 * 1024; // 64 KB cap to prevent memory bloat

  private readonly logger = new Logger(KeepAliveService.name);
  private timer: NodeJS.Timeout | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;
  private pingCount = 0;
  private lastPingResult: PingResult | null = null;
  private isPinging = false;

  constructor(private readonly configService: ConfigService) {}

  public getIntervalMinutes(): number {
    const raw = this.configService.get<string>('KEEP_ALIVE_INTERVAL_MINUTES');
    const parsed = Number(raw);
    if (!raw || isNaN(parsed) || parsed < KeepAliveService.MIN_INTERVAL_MINUTES) {
      return KeepAliveService.DEFAULT_INTERVAL_MINUTES;
    }
    return Math.floor(parsed);
  }

  public getTimeoutMs(): number {
    const raw =
      this.configService.get<string>('KEEP_ALIVE_TIMEOUT_MS') ||
      this.configService.get<string>('PING_TIMEOUT_MS');
    const parsed = Number(raw);
    if (!raw || isNaN(parsed) || parsed < KeepAliveService.MIN_TIMEOUT_MS) {
      return KeepAliveService.DEFAULT_TIMEOUT_MS;
    }
    return Math.floor(parsed);
  }

  public getInitialDelayMs(): number {
    const raw = this.configService.get<string>('KEEP_ALIVE_INITIAL_DELAY_MS');
    const parsed = Number(raw);
    if (!raw || isNaN(parsed) || parsed < 0) {
      return KeepAliveService.DEFAULT_INITIAL_DELAY_MS;
    }
    return Math.floor(parsed);
  }

  public getMaxBodyLength(): number {
    const raw =
      this.configService.get<string>('KEEP_ALIVE_MAX_BODY_BYTES') ||
      process.env.KEEP_ALIVE_MAX_BODY_BYTES;
    const parsed = Number(raw);
    return !isNaN(parsed) && parsed > 0 ? parsed : 64 * 1024;
  }

  onModuleInit() {
    const rawDisable = (
      this.configService.get<string>('DISABLE_KEEP_ALIVE') || ''
    )
      .toLowerCase()
      .trim();
    const isDisable =
      rawDisable === 'true' || rawDisable === '1' || rawDisable === 'yes';

    if (isDisable) {
      this.logger.log(
        'Keep-Alive self-ping service is disabled via DISABLE_KEEP_ALIVE.',
      );
      return;
    }

    const intervalMinutes = this.getIntervalMinutes();
    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.log(
      `Initializing Keep-Alive self-ping service (Interval: ${intervalMinutes} min / ${intervalMs} ms)`,
    );

    // Schedule periodic self-ping
    this.timer = setInterval(() => {
      this.pingServer().catch((err) => {
        this.logger.error(`Scheduled ping failed: ${err.message}`);
      });
    }, intervalMs);

    if (typeof this.timer?.unref === 'function') {
      this.timer.unref();
    }

    // Do an initial ping after initial delay to ensure server startup complete
    const initialDelayMs = this.getInitialDelayMs();
    if (initialDelayMs > 0) {
      this.startupTimeout = setTimeout(() => {
        this.startupTimeout = null;
        this.pingServer().catch((err) => {
          this.logger.warn(
            `Initial keep-alive ping skipped/failed: ${err.message}`,
          );
        });
      }, initialDelayMs);

      if (typeof this.startupTimeout?.unref === 'function') {
        this.startupTimeout.unref();
      }
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('Keep-Alive timer cleared.');
    }
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
      this.logger.log('Keep-Alive startup timeout cleared.');
    }
  }

  /**
   * Resolves target URL to ping from environment variables or defaults to local server instance.
   */
  public getTargetUrl(): string {
    const pingUrl =
      this.configService.get<string>('PING_URL') ||
      this.configService.get<string>('TARGET_URL') ||
      this.configService.get<string>('RENDER_SERVER_URL');
    const renderUrl = this.configService.get<string>('RENDER_EXTERNAL_URL');
    const serverUrl =
      this.configService.get<string>('SERVER_URL') ||
      this.configService.get<string>('BACKEND_URL') ||
      this.configService.get<string>('BASE_URL');

    let rawCandidate = (pingUrl || renderUrl || serverUrl || '').trim();

    // If no external or custom URL is configured, fallback to local host/port dynamically
    if (!rawCandidate) {
      const port = this.configService.get<string>('PORT') || '10000';
      const host =
        this.configService.get<string>('SERVER_HOST') ||
        this.configService.get<string>('HOST') ||
        '127.0.0.1';
      rawCandidate = `http://${host}:${port}`;
    }

    // Ensure baseUrl does not end with trailing slash
    let baseUrl = rawCandidate.replace(/\/+$/, '');

    // Append ping endpoint if not explicitly provided in URL
    if (
      !baseUrl.includes('/api/keep-alive') &&
      !baseUrl.includes('/api/ping')
    ) {
      baseUrl = `${baseUrl}/api/keep-alive/ping`;
    }

    return baseUrl;
  }

  /**
   * Pings the server target URL and measures response time.
   * Concurrency-guarded to prevent overlapping connection stampedes.
   */
  public async pingServer(): Promise<PingResult> {
    if (this.isPinging) {
      this.logger.debug('Ping already in progress. Skipping overlapping ping.');
      return (
        this.lastPingResult || {
          success: false,
          message: 'Ping already in progress',
          timestamp: new Date().toISOString(),
          durationMs: 0,
          url: this.getTargetUrl(),
        }
      );
    }

    this.isPinging = true;
    const targetUrl = this.getTargetUrl();
    const startTime = Date.now();
    this.pingCount++;

    this.logger.log(
      `[Ping #${this.pingCount}] Pinging keep-alive URL: ${targetUrl}`,
    );

    try {
      const { statusCode, body } = await this.httpGet(targetUrl);
      const durationMs = Date.now() - startTime;
      const isSuccess = statusCode >= 200 && statusCode < 400;

      const result: PingResult = {
        success: isSuccess,
        statusCode,
        message: isSuccess
          ? `Ping succeeded with status code ${statusCode}`
          : `Ping returned non-2xx status code ${statusCode}`,
        timestamp: new Date().toISOString(),
        durationMs,
        url: targetUrl,
      };

      this.lastPingResult = result;

      if (isSuccess) {
        this.logger.log(
          `[Ping #${this.pingCount}] Success (${durationMs}ms) - Status ${statusCode}`,
        );
      } else {
        this.logger.warn(
          `[Ping #${this.pingCount}] Warning (${durationMs}ms) - Status ${statusCode}: ${body}`,
        );
      }

      return result;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const result: PingResult = {
        success: false,
        message: error?.message || 'Unknown network error during ping',
        timestamp: new Date().toISOString(),
        durationMs,
        url: targetUrl,
      };

      this.lastPingResult = result;
      this.logger.error(`[Ping #${this.pingCount}] Failed: ${error?.message}`);
      return result;
    } finally {
      this.isPinging = false;
    }
  }

  public getStatus(): KeepAliveStatus {
    return {
      service: 'KeepAliveService',
      active: !!this.timer,
      targetUrl: this.getTargetUrl(),
      intervalMinutes: this.getIntervalMinutes(),
      totalPingsSent: this.pingCount,
      lastPingResult: this.lastPingResult,
      uptimeSeconds: process.uptime(),
    };
  }

  private httpGet(url: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return reject(new Error(`Invalid keep-alive URL: "${url}"`));
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return reject(
          new Error(`Unsupported protocol: "${parsedUrl.protocol}"`),
        );
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const timeoutMs = this.getTimeoutMs();

      let isSettled = false;
      const safeResolve = (val: { statusCode: number; body: string }) => {
        if (!isSettled) {
          isSettled = true;
          resolve(val);
        }
      };
      const safeReject = (err: Error) => {
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      };

      const req = client.get(
        parsedUrl,
        {
          headers: {
            'User-Agent': 'OmniHub-KeepAlive/1.0',
            Accept: 'application/json, text/plain, */*',
          },
        },
        (res) => {
          let body = '';
          let bodyExceeded = false;

          res.on('data', (chunk) => {
            if (bodyExceeded) return;
            body += chunk;
            const maxBody = this.getMaxBodyLength();
            if (body.length > maxBody) {
              body = body.substring(0, maxBody) + '... (truncated)';
              bodyExceeded = true;
              res.resume(); // discard rest of stream
            }
          });

          res.on('end', () => {
            safeResolve({
              statusCode: res.statusCode || 500,
              body,
            });
          });

          res.on('error', (err) => {
            safeReject(err);
          });
        },
      );

      req.on('error', (err) => {
        safeReject(err);
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy();
        safeReject(new Error(`Request timed out after ${timeoutMs}ms`));
      });
    });
  }
}
