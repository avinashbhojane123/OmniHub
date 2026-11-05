import {
  normalizePort,
  urlRewriteMiddleware,
} from './main';

describe('main.ts helpers', () => {
  describe('normalizePort', () => {
    it('should return numeric port when given valid number within TCP range', () => {
      expect(normalizePort(3000)).toBe(3000);
      expect(normalizePort(8080.7)).toBe(8080);
      expect(normalizePort(65535)).toBe(65535);
    });

    it('should parse valid string port', () => {
      expect(normalizePort('5000')).toBe(5000);
      expect(normalizePort('  8000  ')).toBe(8000);
      expect(normalizePort('65535')).toBe(65535);
    });

    it('should fallback to 10000 on invalid or non-positive input', () => {
      expect(normalizePort(undefined)).toBe(10000);
      expect(normalizePort('invalid')).toBe(10000);
      expect(normalizePort(-500)).toBe(10000);
      expect(normalizePort(0)).toBe(10000);
      expect(normalizePort('')).toBe(10000);
    });

    it('should fallback to 10000 on ports exceeding 65535 (TCP limit)', () => {
      expect(normalizePort(70000)).toBe(10000);
      expect(normalizePort('99999')).toBe(10000);
    });
  });

  describe('urlRewriteMiddleware', () => {
    let next: jest.Mock;

    beforeEach(() => {
      next = jest.fn();
    });

    it('should handle undefined or empty requests gracefully', () => {
      urlRewriteMiddleware(undefined, undefined, next);
      expect(next).toHaveBeenCalled();

      const reqWithoutUrl = {};
      urlRewriteMiddleware(reqWithoutUrl, undefined, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should rewrite root path to /api preserving query strings', () => {
      const reqRoot = { url: '/' };
      urlRewriteMiddleware(reqRoot, undefined, next);
      expect(reqRoot.url).toBe('/api');

      const reqRootWithQuery = { url: '/?client=mobile' };
      urlRewriteMiddleware(reqRootWithQuery, undefined, next);
      expect(reqRootWithQuery.url).toBe('/api?client=mobile');
    });

    it('should prepend /api to root health, liveness, and readiness probes', () => {
      const reqHealth = { url: '/health' };
      urlRewriteMiddleware(reqHealth, undefined, next);
      expect(reqHealth.url).toBe('/api/health');

      const reqHealthz = { url: '/healthz?timeout=2000' };
      urlRewriteMiddleware(reqHealthz, undefined, next);
      expect(reqHealthz.url).toBe('/api/healthz?timeout=2000');

      const reqLivez = { url: '/livez' };
      urlRewriteMiddleware(reqLivez, undefined, next);
      expect(reqLivez.url).toBe('/api/livez');

      const reqReadyz = { url: '/readyz' };
      urlRewriteMiddleware(reqReadyz, undefined, next);
      expect(reqReadyz.url).toBe('/api/readyz');
    });

    it('should prepend /api to /auth, /devices, /battery, and /upload controller paths without /api prefix', () => {
      const reqAuth = { url: '/auth/refresh' };
      urlRewriteMiddleware(reqAuth, undefined, next);
      expect(reqAuth.url).toBe('/api/auth/refresh');

      const reqDev = { url: '/devices/status' };
      urlRewriteMiddleware(reqDev, undefined, next);
      expect(reqDev.url).toBe('/api/devices/status');

      const reqBat = { url: '/battery/settings' };
      urlRewriteMiddleware(reqBat, undefined, next);
      expect(reqBat.url).toBe('/api/battery/settings');

      const reqUpload = { url: '/upload' };
      urlRewriteMiddleware(reqUpload, undefined, next);
      expect(reqUpload.url).toBe('/api/upload');

      const reqStaticUpload = { url: '/uploads/avatar.png' };
      urlRewriteMiddleware(reqStaticUpload, undefined, next);
      expect(reqStaticUpload.url).toBe('/uploads/avatar.png');
    });

    it('should leave already-prefixed /api routes untouched', () => {
      const req = { url: '/api/tasks/list' };
      urlRewriteMiddleware(req, undefined, next);
      expect(req.url).toBe('/api/tasks/list');
    });
  });
});
