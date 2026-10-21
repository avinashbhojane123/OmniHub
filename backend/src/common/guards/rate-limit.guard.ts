import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, RateLimitRecord>();
  private readonly windowMs = 60 * 1000; // 1 minute window
  private readonly maxHits = 20; // max 20 requests per minute per IP

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip =
      req.headers['x-forwarded-for'] ||
      req.socket?.remoteAddress ||
      'unknown-ip';

    const clientIp = Array.isArray(ip) ? ip[0] : ip.split(',')[0].trim();
    const now = Date.now();

    const record = this.hits.get(clientIp);

    if (this.hits.size > 1000) {
      for (const [key, val] of this.hits.entries()) {
        if (now > val.resetTime) {
          this.hits.delete(key);
        }
      }
    }

    if (!record || now > record.resetTime) {
      this.hits.set(clientIp, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (record.count >= this.maxHits) {
      throw new HttpException(
        'Too many requests. Please slow down and try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    return true;
  }
}
