import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeepAliveService } from './keep-alive.service';
import * as http from 'http';

describe('KeepAliveService', () => {
  let service: KeepAliveService;
  let configService: ConfigService;
  let testHttpServer: http.Server | null = null;
  let serverPort = 0;

  const originalEnv = process.env;

  beforeAll(async () => {
    testHttpServer = http.createServer((req, res) => {
      if (req.url?.includes('/hang')) {
        // Deliberately do not respond to test timeout
        return;
      }
      if (req.url?.includes('/error-503')) {
        res.statusCode = 503;
        res.end('Service Unavailable');
        return;
      }
      if (req.url?.includes('/large')) {
        res.statusCode = 200;
        res.write('x'.repeat(70 * 1024));
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    });

    await new Promise<void>((resolve) => {
      testHttpServer!.listen(0, '127.0.0.1', () => {
        const address = testHttpServer!.address();
        serverPort = typeof address === 'object' && address ? address.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (testHttpServer) {
      await new Promise<void>((resolve) => testHttpServer!.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.PING_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.SERVER_URL;
    delete process.env.BACKEND_URL;
    delete process.env.BASE_URL;
    delete process.env.PORT;
    delete process.env.SERVER_HOST;
    delete process.env.HOST;
    delete process.env.DISABLE_KEEP_ALIVE;
    delete process.env.KEEP_ALIVE_INTERVAL_MINUTES;
    delete process.env.KEEP_ALIVE_TIMEOUT_MS;
    delete process.env.KEEP_ALIVE_INITIAL_DELAY_MS;

    const module: TestingModule = await Test.createTestingModule({
      providers: [KeepAliveService, ConfigService],
    }).compile();

    service = module.get<KeepAliveService>(KeepAliveService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('getTargetUrl', () => {
    it('should default to dynamic local host and port when no env vars configured', () => {
      const url = service.getTargetUrl();
      expect(url).toBe('http://127.0.0.1:10000/api/keep-alive/ping');
      expect(url).not.toContain('backend-9i6w.onrender.com');
    });

    it('should respect custom PORT and HOST in fallback', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'PORT') return '8080';
        if (key === 'HOST') return 'localhost';
        return null;
      });

      const url = service.getTargetUrl();
      expect(url).toBe('http://localhost:8080/api/keep-alive/ping');
    });

    it('should prioritize PING_URL when explicitly configured', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'PING_URL') return 'https://custom-ping.app/api/ping';
        return null;
      });

      const url = service.getTargetUrl();
      expect(url).toBe('https://custom-ping.app/api/ping');
    });

    it('should append /api/keep-alive/ping to RENDER_EXTERNAL_URL if missing', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'RENDER_EXTERNAL_URL') return 'https://my-omnihub.onrender.com/';
        return null;
      });

      const url = service.getTargetUrl();
      expect(url).toBe('https://my-omnihub.onrender.com/api/keep-alive/ping');
    });

    it('should append /api/keep-alive/ping to SERVER_URL if missing', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'SERVER_URL') return 'https://api.omnihub.dev';
        return null;
      });

      const url = service.getTargetUrl();
      expect(url).toBe('https://api.omnihub.dev/api/keep-alive/ping');
    });

    it('should not double-append endpoint if URL already includes /api/keep-alive', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'PING_URL') return 'https://example.com/api/keep-alive/status';
        return null;
      });

      const url = service.getTargetUrl();
      expect(url).toBe('https://example.com/api/keep-alive/status');
    });
  });

  describe('Configuration Parsing & Clamping', () => {
    it('getIntervalMinutes: should return default 5 when unset, NaN, or < 1', () => {
      expect(service.getIntervalMinutes()).toBe(5);

      jest.spyOn(configService, 'get').mockReturnValue('invalid' as any);
      expect(service.getIntervalMinutes()).toBe(5);

      jest.spyOn(configService, 'get').mockReturnValue('0' as any);
      expect(service.getIntervalMinutes()).toBe(5);

      jest.spyOn(configService, 'get').mockReturnValue('-5' as any);
      expect(service.getIntervalMinutes()).toBe(5);

      jest.spyOn(configService, 'get').mockReturnValue('15' as any);
      expect(service.getIntervalMinutes()).toBe(15);
    });

    it('getTimeoutMs: should return default 10000 when unset, NaN, or < 1000', () => {
      expect(service.getTimeoutMs()).toBe(10000);

      jest.spyOn(configService, 'get').mockReturnValue('bad' as any);
      expect(service.getTimeoutMs()).toBe(10000);

      jest.spyOn(configService, 'get').mockReturnValue('500' as any);
      expect(service.getTimeoutMs()).toBe(10000);

      jest.spyOn(configService, 'get').mockReturnValue('25000' as any);
      expect(service.getTimeoutMs()).toBe(25000);
    });

    it('getInitialDelayMs: should return default 15000 when unset, NaN, or negative', () => {
      expect(service.getInitialDelayMs()).toBe(15000);

      jest.spyOn(configService, 'get').mockReturnValue('abc' as any);
      expect(service.getInitialDelayMs()).toBe(15000);

      jest.spyOn(configService, 'get').mockReturnValue('-1' as any);
      expect(service.getInitialDelayMs()).toBe(15000);

      jest.spyOn(configService, 'get').mockReturnValue('5000' as any);
      expect(service.getInitialDelayMs()).toBe(5000);
    });
  });

  describe('Lifecycle Management (onModuleInit & onModuleDestroy)', () => {
    it('should skip scheduling when DISABLE_KEEP_ALIVE is true, 1, or yes', () => {
      for (const flag of ['true', '1', 'yes', 'TRUE', ' Yes ']) {
        jest.spyOn(configService, 'get').mockImplementation((key: string) => {
          if (key === 'DISABLE_KEEP_ALIVE') return flag;
          return null;
        });

        service.onModuleInit();
        const status = service.getStatus();
        expect(status.active).toBe(false);
      }
    });

    it('should schedule periodic interval and startup timeout when enabled', () => {
      jest.useFakeTimers();

      service.onModuleInit();
      const status = service.getStatus();
      expect(status.active).toBe(true);

      service.onModuleDestroy();
      expect(service.getStatus().active).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('getStatus', () => {
    it('should return consistent status payload matching configured interval', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'KEEP_ALIVE_INTERVAL_MINUTES') return '8';
        return null;
      });

      const status = service.getStatus();
      expect(status.service).toBe('KeepAliveService');
      expect(status.intervalMinutes).toBe(8);
      expect(status.totalPingsSent).toBe(0);
      expect(status.lastPingResult).toBeNull();
      expect(typeof status.uptimeSeconds).toBe('number');
    });
  });

  describe('pingServer & real HTTP interactions', () => {
    it('should execute ping against real local HTTP server and return 200 OK', async () => {
      jest.spyOn(service, 'getTargetUrl').mockReturnValue(`http://127.0.0.1:${serverPort}/api/keep-alive/ping`);

      const result = await service.pingServer();
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.message).toContain('Ping succeeded with status code 200');
      expect(service.getStatus().totalPingsSent).toBe(1);
      expect(service.getStatus().lastPingResult).toEqual(result);
    });

    it('should handle non-2xx status code and report failure', async () => {
      jest.spyOn(service, 'getTargetUrl').mockReturnValue(`http://127.0.0.1:${serverPort}/error-503`);

      const result = await service.pingServer();
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.message).toContain('Ping returned non-2xx status code 503');
    });

    it('should handle connection refused cleanly', async () => {
      // Port 1 is reserved and typically closed
      jest.spyOn(service, 'getTargetUrl').mockReturnValue('http://127.0.0.1:1/api/keep-alive/ping');

      const result = await service.pingServer();
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('should reject unsupported protocols like ftp: or file:', async () => {
      jest.spyOn(service, 'getTargetUrl').mockReturnValue('ftp://my-server.com/ping');

      const result = await service.pingServer();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unsupported protocol');
    });

    it('should reject malformed URLs cleanly', async () => {
      jest.spyOn(service, 'getTargetUrl').mockReturnValue('not-a-valid-url');

      const result = await service.pingServer();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid keep-alive URL');
    });

    it('should prevent overlapping concurrent pings', async () => {
      jest.spyOn(service, 'getTargetUrl').mockReturnValue(`http://127.0.0.1:${serverPort}/api/keep-alive/ping`);

      const promise1 = service.pingServer();
      const promise2 = service.pingServer();

      const [res1, res2] = await Promise.all([promise1, promise2]);
      expect(res1.success).toBe(true);
      expect(res2.message).toBe('Ping already in progress');
    });

    it('should truncate body exceeding 64KB without crashing', async () => {
      jest.spyOn(service, 'getTargetUrl').mockReturnValue(`http://127.0.0.1:${serverPort}/large`);

      const result = await service.pingServer();
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });
  });
});
