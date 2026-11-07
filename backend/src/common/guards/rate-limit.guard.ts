import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  maxHits?: number;
  windowMs?: number;
}

export const SetRateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, RateLimitRecord>();
  private lastCleanupTime = Date.now();

  constructor(@Optional() private readonly reflector?: Reflector) {}

  private getMaxEntries(): number {
    const raw = parseInt(process.env.RATE_LIMIT_MAX_ENTRIES || '', 10);
    return !isNaN(raw) && raw > 0 ? raw : 5000;
  }

  private getCleanupIntervalMs(): number {
    const raw = parseInt(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS || '', 10);
    return !isNaN(raw) && raw > 0 ? raw : 30000;
  }

  private extractClientIp(req: any): string {
    let raw = req?.ip || (Array.isArray(req?.headers?.['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req?.headers?.['x-forwarded-for']?.split(',')[0]) || req?.socket?.remoteAddress || req?.connection?.remoteAddress;
    if (!raw || typeof raw !== 'string') return '127.0.0.1';

    let ip = raw.trim().replace(/^["']|["']$/g, '');
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
    if (v4) ip = v4[1];
    else {
      const v6 = ip.match(/^\[([a-fA-F0-9:]+)\]:\d+$/);
      if (v6) ip = v6[1];
    }
    if (ip === '::1') ip = '127.0.0.1';
    return ip.length > 64 ? ip.slice(0, 64) : ip;
  }

  private cleanupExpired(now: number): void {
    const max = this.getMaxEntries();
    if (now - this.lastCleanupTime < this.getCleanupIntervalMs() && this.hits.size < max) return;
    this.lastCleanupTime = now;
    for (const [k, v] of this.hits.entries()) {
      if (now > v.resetTime) this.hits.delete(k);
    }
    while (this.hits.size > max) {
      const oldest = this.hits.keys().next().value;
      if (oldest) this.hits.delete(oldest);
      else break;
    }
  }

  private setRecord(key: string, record: RateLimitRecord): void {
    const max = this.getMaxEntries();
    if (this.hits.size >= max && !this.hits.has(key)) {
      const oldest = this.hits.keys().next().value;
      if (oldest) this.hits.delete(oldest);
    }
    this.hits.set(key, record);
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const http = context.switchToHttp();
    const req = http.getRequest();
    if (!req) return true;
    const res = http.getResponse();

    let customOptions: RateLimitOptions | undefined;
    try {
      if (this.reflector && context.getHandler() && context.getClass()) {
        customOptions = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
      }
    } catch {}

    const maxHits = customOptions?.maxHits ?? (Number(process.env.RATE_LIMIT_MAX_HITS) || 20);
    const windowMs = customOptions?.windowMs ?? (Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000);
    const clientIp = this.extractClientIp(req);
    const now = Date.now();

    this.cleanupExpired(now);
    const record = this.hits.get(clientIp);

    if (!record || now > record.resetTime) {
      const newResetTime = now + windowMs;
      this.setRecord(clientIp, { count: 1, resetTime: newResetTime });
      if (res?.setHeader && !res.headersSent) {
        res.setHeader('X-RateLimit-Limit', String(maxHits));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxHits - 1)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(newResetTime / 1000)));
      }
      return true;
    }

    const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    const resetSec = Math.ceil(record.resetTime / 1000);

    if (record.count >= maxHits) {
      if (res?.setHeader && !res.headersSent) {
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Limit', String(maxHits));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', String(resetSec));
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Too many requests. Please slow down and try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    record.count++;
    if (res?.setHeader && !res.headersSent) {
      res.setHeader('X-RateLimit-Limit', String(maxHits));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxHits - record.count)));
      res.setHeader('X-RateLimit-Reset', String(resetSec));
    }
    return true;
  }

  resetAll(): void {
    this.hits.clear();
  }

  getHitCount(ip: string): number {
    return this.hits.get(ip)?.count || 0;
  }
}
