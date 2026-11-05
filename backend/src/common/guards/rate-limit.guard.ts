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

/**
 * Decorator to configure custom rate limit parameters per controller or route handler.
 */
export const SetRateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private getMaxEntries(): number {
    const raw = process.env.RATE_LIMIT_MAX_ENTRIES;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : 5000;
  }

  private getCleanupIntervalMs(): number {
    const raw = process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : 30 * 1000;
  }

  private readonly hits = new Map<string, RateLimitRecord>();
  private lastCleanupTime = Date.now();

  constructor(@Optional() private readonly reflector?: Reflector) {}

  /**
   * Extract and normalize client IP from request.
   * Strips ports, quotes, IPv6-mapped IPv4 prefixes, and normalizes loopbacks.
   */
  private extractClientIp(req: any): string {
    let rawIp: string | undefined = req?.ip;

    if (!rawIp) {
      const forwarded = req?.headers?.['x-forwarded-for'];
      if (forwarded) {
        rawIp = Array.isArray(forwarded)
          ? forwarded[0]
          : forwarded.split(',')[0];
      } else {
        rawIp = req?.socket?.remoteAddress || req?.connection?.remoteAddress;
      }
    }

    if (!rawIp || typeof rawIp !== 'string') {
      return '127.0.0.1';
    }

    let ip = rawIp.trim().replace(/^["']|["']$/g, '');

    // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:192.168.1.1 -> 192.168.1.1)
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }

    // Strip port if present in IPv4 (e.g. 192.168.1.1:8080 -> 192.168.1.1)
    const ipv4WithPort = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
    if (ipv4WithPort) {
      ip = ipv4WithPort[1];
    } else {
      // Strip port if present in bracketed IPv6 (e.g. [2001:db8::1]:8080 -> 2001:db8::1)
      const ipv6WithPort = ip.match(/^\[([a-fA-F0-9:]+)\]:\d+$/);
      if (ipv6WithPort) {
        ip = ipv6WithPort[1];
      }
    }

    // Normalize IPv6 loopback ::1 to 127.0.0.1
    if (ip === '::1') {
      ip = '127.0.0.1';
    }

    // Limit length to prevent memory bloat from malformed headers
    if (ip.length > 64) {
      ip = ip.substring(0, 64);
    }

    return ip;
  }

  /**
   * Periodically evict expired rate limit records and enforce bounded memory capacity.
   */
  private cleanupExpired(now: number): void {
    const maxEntries = this.getMaxEntries();
    const cleanupInterval = this.getCleanupIntervalMs();

    if (
      now - this.lastCleanupTime < cleanupInterval &&
      this.hits.size < maxEntries
    ) {
      return;
    }

    this.lastCleanupTime = now;

    for (const [key, val] of this.hits.entries()) {
      if (now > val.resetTime) {
        this.hits.delete(key);
      }
    }

    // If still exceeding maxEntries under heavy load, evict oldest records (LRU style)
    while (this.hits.size > maxEntries) {
      const oldestKey = this.hits.keys().next().value;
      if (oldestKey) {
        this.hits.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  private setRecord(key: string, record: RateLimitRecord): void {
    const maxEntries = this.getMaxEntries();
    if (this.hits.size >= maxEntries && !this.hits.has(key)) {
      const oldestKey = this.hits.keys().next().value;
      if (oldestKey) {
        this.hits.delete(oldestKey);
      }
    }
    this.hits.set(key, record);
  }

  canActivate(context: ExecutionContext): boolean {
    // If not an HTTP context (e.g. WebSockets, RPC), safely allow
    if (context.getType() !== 'http') {
      return true;
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest();
    if (!req) {
      return true;
    }

    const res = httpContext.getResponse();

    // Determine custom limits from route metadata or fallback to env / defaults
    let customOptions: RateLimitOptions | undefined;
    try {
      const handler = context.getHandler();
      const targetClass = context.getClass();
      if (this.reflector && handler && targetClass) {
        customOptions = this.reflector.getAllAndOverride<RateLimitOptions>(
          RATE_LIMIT_KEY,
          [handler, targetClass],
        );
      }
    } catch {
      // Ignore reflection errors on unadorned handlers
    }

    const defaultMaxHits = Number(process.env.RATE_LIMIT_MAX_HITS) || 20;
    const defaultWindowMs =
      Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;

    const maxHits = customOptions?.maxHits ?? defaultMaxHits;
    const windowMs = customOptions?.windowMs ?? defaultWindowMs;

    const clientIp = this.extractClientIp(req);
    const now = Date.now();

    this.cleanupExpired(now);

    const record = this.hits.get(clientIp);

    if (!record || now > record.resetTime) {
      const newResetTime = now + windowMs;
      this.setRecord(clientIp, {
        count: 1,
        resetTime: newResetTime,
      });

      if (res?.setHeader && !res.headersSent) {
        const remaining = Math.max(0, maxHits - 1);
        res.setHeader('X-RateLimit-Limit', maxHits.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader(
          'X-RateLimit-Reset',
          Math.ceil(newResetTime / 1000).toString(),
        );
      }

      return true;
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((record.resetTime - now) / 1000),
    );
    const resetTimestampSeconds = Math.ceil(record.resetTime / 1000);

    if (record.count >= maxHits) {
      if (res?.setHeader && !res.headersSent) {
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.setHeader('X-RateLimit-Limit', maxHits.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', resetTimestampSeconds.toString());
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Too many requests. Please slow down and try again later.',
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;

    if (res?.setHeader && !res.headersSent) {
      const remaining = Math.max(0, maxHits - record.count);
      res.setHeader('X-RateLimit-Limit', maxHits.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTimestampSeconds.toString());
    }

    return true;
  }

  /**
   * Helper method for testing or administrative reset.
   */
  resetAll(): void {
    this.hits.clear();
  }

  /**
   * Helper method to inspect current hit count for an IP.
   */
  getHitCount(ip: string): number {
    return this.hits.get(ip)?.count || 0;
  }
}
