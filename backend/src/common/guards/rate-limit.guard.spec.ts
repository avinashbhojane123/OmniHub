import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, SetRateLimit } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockReflector: Reflector;

  const createMockContext = (
    ipOptions: {
      ip?: string;
      forwardedFor?: string | string[];
      remoteAddress?: string;
    } = {},
    type: string = 'http',
  ): { context: ExecutionContext; headersSet: Record<string, string> } => {
    const headersSet: Record<string, string> = {};

    const req: any = {
      ip: ipOptions.ip,
      headers: {
        'x-forwarded-for': ipOptions.forwardedFor,
      },
      socket: {
        remoteAddress: ipOptions.remoteAddress,
      },
    };

    const res: any = {
      setHeader: jest.fn((key: string, val: string) => {
        headersSet[key] = val;
      }),
    };

    const context: any = {
      getType: jest.fn().mockReturnValue(type),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: jest.fn().mockReturnValue(function testHandler() {}),
      getClass: jest.fn().mockReturnValue(class TestController {}),
    };

    return { context, headersSet };
  };

  beforeEach(() => {
    mockReflector = new Reflector();
    guard = new RateLimitGuard(mockReflector);
    guard.resetAll();
  });

  describe('Standard HTTP Rate Limiting', () => {
    it('should allow requests within limit and set X-RateLimit headers', () => {
      const { context, headersSet } = createMockContext({ ip: '192.168.1.10' });

      const allowed = guard.canActivate(context);

      expect(allowed).toBe(true);
      expect(headersSet['X-RateLimit-Limit']).toBe('20');
      expect(headersSet['X-RateLimit-Remaining']).toBe('19');
      expect(headersSet['X-RateLimit-Reset']).toBeDefined();
    });

    it('should decrement remaining hits on subsequent requests', () => {
      const { context: ctx1, headersSet: h1 } = createMockContext({ ip: '192.168.1.11' });
      const { context: ctx2, headersSet: h2 } = createMockContext({ ip: '192.168.1.11' });

      guard.canActivate(ctx1);
      expect(h1['X-RateLimit-Remaining']).toBe('19');

      guard.canActivate(ctx2);
      expect(h2['X-RateLimit-Remaining']).toBe('18');
    });

    it('should throw 429 Too Many Requests with Retry-After when limit exceeded', () => {
      const ip = '192.168.1.20';

      for (let i = 0; i < 20; i++) {
        const { context } = createMockContext({ ip });
        expect(guard.canActivate(context)).toBe(true);
      }

      const { context, headersSet } = createMockContext({ ip });

      try {
        guard.canActivate(context);
        fail('Expected guard to throw HttpException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const response = err.getResponse();
        expect(response).toMatchObject({
          statusCode: 429,
          error: 'Too Many Requests',
          message: expect.stringContaining('Too many requests'),
          retryAfter: expect.any(Number),
        });
        expect(headersSet['Retry-After']).toBeDefined();
        expect(headersSet['X-RateLimit-Remaining']).toBe('0');
      }
    });

    it('should reset quota after window expires', () => {
      const ip = '192.168.1.30';
      const now = Date.now();
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

      // Hit limit 20
      for (let i = 0; i < 20; i++) {
        const { context } = createMockContext({ ip });
        guard.canActivate(context);
      }

      // 21st fails at time `now`
      const { context: blockedCtx } = createMockContext({ ip });
      expect(() => guard.canActivate(blockedCtx)).toThrow(HttpException);

      // Advance time by 61 seconds (past window)
      dateSpy.mockReturnValue(now + 61 * 1000);

      const { context: allowedCtx, headersSet } = createMockContext({ ip });
      const result = guard.canActivate(allowedCtx);

      expect(result).toBe(true);
      expect(headersSet['X-RateLimit-Remaining']).toBe('19');

      dateSpy.mockRestore();
    });
  });

  describe('IP Extraction & Normalization', () => {
    it('should prefer req.ip over headers', () => {
      const { context } = createMockContext({
        ip: '10.0.0.1',
        forwardedFor: '203.0.113.195',
        remoteAddress: '127.0.0.1',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('10.0.0.1')).toBe(1);
    });

    it('should extract first IP from comma-separated x-forwarded-for header', () => {
      const { context } = createMockContext({
        forwardedFor: '203.0.113.195, 70.41.3.18, 150.172.238.178',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('203.0.113.195')).toBe(1);
    });

    it('should extract first element if x-forwarded-for is an array', () => {
      const { context } = createMockContext({
        forwardedFor: ['198.51.100.25', '198.51.100.26'],
      });

      guard.canActivate(context);
      expect(guard.getHitCount('198.51.100.25')).toBe(1);
    });

    it('should fall back to socket.remoteAddress if req.ip and headers are missing', () => {
      const { context } = createMockContext({
        remoteAddress: '172.16.0.5',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('172.16.0.5')).toBe(1);
    });

    it('should strip IPv6-mapped IPv4 prefix (::ffff:)', () => {
      const { context } = createMockContext({
        remoteAddress: '::ffff:192.168.1.55',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('192.168.1.55')).toBe(1);
    });

    it('should normalize IPv6 loopback (::1) to 127.0.0.1', () => {
      const { context } = createMockContext({
        remoteAddress: '::1',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('127.0.0.1')).toBe(1);
    });

    it('should strip port from IPv4 address', () => {
      const { context } = createMockContext({
        forwardedFor: '192.168.1.55:54321',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('192.168.1.55')).toBe(1);
    });

    it('should strip port from bracketed IPv6 address', () => {
      const { context } = createMockContext({
        forwardedFor: '[2001:db8::1]:8080',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('2001:db8::1')).toBe(1);
    });

    it('should strip quotes from IP string', () => {
      const { context } = createMockContext({
        forwardedFor: '"192.168.1.99"',
      });

      guard.canActivate(context);
      expect(guard.getHitCount('192.168.1.99')).toBe(1);
    });

    it('should fallback to 127.0.0.1 if no IP can be found', () => {
      const { context } = createMockContext({});

      guard.canActivate(context);
      expect(guard.getHitCount('127.0.0.1')).toBe(1);
    });
  });

  describe('Custom Route Options via Reflector / Decorator', () => {
    it('should respect custom maxHits and windowMs provided by reflector', () => {
      jest.spyOn(mockReflector, 'getAllAndOverride').mockReturnValue({
        maxHits: 3,
        windowMs: 10000,
      });

      const ip = '10.50.50.1';

      // 3 requests allowed
      for (let i = 0; i < 3; i++) {
        const { context } = createMockContext({ ip });
        expect(guard.canActivate(context)).toBe(true);
      }

      // 4th request must throw 429
      const { context } = createMockContext({ ip });
      expect(() => guard.canActivate(context)).toThrow(HttpException);
    });
  });

  describe('Non-HTTP Context Safety', () => {
    it('should safely allow requests in non-http contexts', () => {
      const { context } = createMockContext({}, 'ws');
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should not call setHeader if res.headersSent is true', () => {
      const setHeaderMock = jest.fn();
      const context: any = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => ({ ip: '127.0.0.1' }),
          getResponse: () => ({ setHeader: setHeaderMock, headersSent: true }),
        }),
        getHandler: () => () => {},
        getClass: () => class TestController {},
      };

      expect(guard.canActivate(context)).toBe(true);
      expect(setHeaderMock).not.toHaveBeenCalled();
    });

    it('should safely allow if request object is undefined', () => {
      const context: any = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => null,
          getResponse: () => null,
        }),
      };

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('Memory management and bounded capacity', () => {
    it('should cap cache entries and evict oldest to avoid memory exhaustion', () => {
      // Simulate adding 5005 unique IPs
      for (let i = 0; i < 5005; i++) {
        const { context } = createMockContext({ ip: `10.0.${Math.floor(i / 256)}.${i % 256}` });
        guard.canActivate(context);
      }

      // Internal size must not exceed MAX_ENTRIES (5000)
      expect((guard as any).hits.size).toBeLessThanOrEqual(5000);
    });

    it('should reset all records via resetAll', () => {
      const { context } = createMockContext({ ip: '1.2.3.4' });
      guard.canActivate(context);
      expect(guard.getHitCount('1.2.3.4')).toBe(1);

      guard.resetAll();
      expect(guard.getHitCount('1.2.3.4')).toBe(0);
    });
  });
});
