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

@Injectable()
export class KeepAliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeepAliveService.name);
  private timer: NodeJS.Timeout | null = null;
  private pingCount = 0;
  private lastPingResult: PingResult | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const isDisable =
      this.configService.get<string>('DISABLE_KEEP_ALIVE') === 'true';

    if (isDisable) {
      this.logger.log(
        'Keep-Alive self-ping service is disabled via DISABLE_KEEP_ALIVE.',
      );
      return;
    }

    const intervalMinutes = Number(
      this.configService.get<string>('KEEP_ALIVE_INTERVAL_MINUTES') || 5,
    );
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

    // Do an initial ping after initial delay to ensure server startup complete
    const initialDelayMs = Number(
      this.configService.get<string>('KEEP_ALIVE_INITIAL_DELAY_MS') || 15000,
    );
    setTimeout(() => {
      this.pingServer().catch((err) => {
        this.logger.warn(
          `Initial keep-alive ping skipped/failed: ${err.message}`,
        );
      });
    }, initialDelayMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('Keep-Alive timer cleared.');
    }
  }

  /**
   * Resolves target URL to ping from environment variables or defaults to localhost.
   */
  public getTargetUrl(): string {
    const renderUrl = this.configService.get<string>('RENDER_EXTERNAL_URL');
    const pingUrl = this.configService.get<string>('PING_URL');
    const serverUrl = this.configService.get<string>('SERVER_URL');

    let baseUrl = renderUrl || pingUrl || serverUrl;

    if (!baseUrl) {
      baseUrl =
        this.configService.get<string>('RENDER_EXTERNAL_URL') ||
        'https://backend-9i6w.onrender.com';
    }

    // Ensure baseUrl does not end with trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');

    // Append ping endpoint if not explicitly provided in URL
    if (
      !baseUrl.includes('/api/keep-alive') &&
      !baseUrl.includes('/api/ping')
    ) {
      return `${baseUrl}/api/keep-alive/ping`;
    }

    return baseUrl;
  }

  /**
   * Pings the server target URL and measures response time.
   */
  public async pingServer(): Promise<PingResult> {
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
        message: error.message || 'Unknown network error during ping',
        timestamp: new Date().toISOString(),
        durationMs,
        url: targetUrl,
      };

      this.lastPingResult = result;
      this.logger.error(`[Ping #${this.pingCount}] Failed: ${error.message}`);
      return result;
    }
  }

  public getStatus() {
    return {
      service: 'KeepAliveService',
      active: !!this.timer,
      targetUrl: this.getTargetUrl(),
      intervalMinutes: Number(
        this.configService.get<string>('KEEP_ALIVE_INTERVAL_MINUTES') || 10,
      ),
      totalPingsSent: this.pingCount,
      lastPingResult: this.lastPingResult,
      uptimeSeconds: process.uptime(),
    };
  }

  private httpGet(url: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const timeoutMs = Number(
        this.configService.get<string>('KEEP_ALIVE_TIMEOUT_MS') || 10000,
      );

      const req = client.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            body,
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      });

      req.end();
    });
  }
}
