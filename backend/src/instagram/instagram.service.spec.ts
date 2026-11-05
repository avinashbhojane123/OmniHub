import { InstagramService } from './instagram.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('InstagramService', () => {
  let service: InstagramService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'INSTAGRAM_SESSION_ID') return 'mock_session_12345';
        return null;
      }),
    } as any;
    service = new InstagramService(configService);
    service.clearCache();
  });

  describe('parseUrl', () => {
    it('should parse Instagram Reel URLs correctly', () => {
      const url = 'https://www.instagram.com/reel/C123abc456/?igsh=MWx1Yw==';
      const parsed = service.parseUrl(url);
      expect(parsed).not.toBeNull();
      expect(parsed?.shortcode).toBe('C123abc456');
      expect(parsed?.type).toBe('reel');
      expect(parsed?.cleanUrl).toBe('https://www.instagram.com/reel/C123abc456/');
    });

    it('should parse Instagram Post URLs correctly with /p/ cleanUrl', () => {
      const url = 'https://instagram.com/p/DABcde987/';
      const parsed = service.parseUrl(url);
      expect(parsed).not.toBeNull();
      expect(parsed?.shortcode).toBe('DABcde987');
      expect(parsed?.type).toBe('p');
      expect(parsed?.cleanUrl).toBe('https://www.instagram.com/p/DABcde987/');
    });

    it('should parse Instagram TV URLs correctly with /tv/ cleanUrl', () => {
      const url = 'https://www.instagram.com/tv/C987654321';
      const parsed = service.parseUrl(url);
      expect(parsed).not.toBeNull();
      expect(parsed?.shortcode).toBe('C987654321');
      expect(parsed?.type).toBe('tv');
      expect(parsed?.cleanUrl).toBe('https://www.instagram.com/tv/C987654321/');
    });

    it('should parse mobile m.instagram.com URLs correctly', () => {
      const url = 'https://m.instagram.com/reel/Mob123456';
      const parsed = service.parseUrl(url);
      expect(parsed).not.toBeNull();
      expect(parsed?.shortcode).toBe('Mob123456');
      expect(parsed?.type).toBe('reel');
    });

    it('should parse Instagram Share Reel URLs correctly', () => {
      const url = 'https://www.instagram.com/share/reel/XYZ123456';
      const parsed = service.parseUrl(url);
      expect(parsed).not.toBeNull();
      expect(parsed?.shortcode).toBe('XYZ123456');
      expect(parsed?.type).toBe('reel');
    });

    it('should return null for invalid or non-instagram URLs', () => {
      expect(service.parseUrl('')).toBeNull();
      expect(service.parseUrl('https://youtube.com/watch?v=123')).toBeNull();
      expect(service.parseUrl('not a url')).toBeNull();
    });
  });

  describe('shortcodeToMediaId', () => {
    it('should convert shortcode to numeric media ID', () => {
      const shortcode = 'B-0123';
      const mediaId = service.shortcodeToMediaId(shortcode);
      expect(mediaId).toBeTruthy();
      expect(typeof mediaId).toBe('string');
    });

    it('should return 0 for empty or invalid shortcodes', () => {
      expect(service.shortcodeToMediaId('')).toBe('0');
      expect(service.shortcodeToMediaId(null as any)).toBe('0');
    });
  });

  describe('Session ID management & Header Injection Protection', () => {
    it('should handle session ID config and custom runtime update', () => {
      expect(service.getSessionId()).toBe('mock_session_12345');
      expect(service.hasSessionId()).toBe(true);

      service.setCustomSessionId('custom_test_session');
      expect(service.getSessionId()).toBe('custom_test_session');
    });

    it('should sanitize carriage returns and newlines from session key', () => {
      service.setCustomSessionId('malicious\r\nsession\tkey');
      expect(service.getSessionId()).toBe('malicioussessionkey');
    });
  });

  describe('In-Memory Preview Caching', () => {
    it('should return fallback and cache result for subsequent queries', async () => {
      // Mock global fetch to fail so it falls back to basic preview
      const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result1 = await service.getPreview('https://instagram.com/reel/TestReel123', 'http://localhost:3000');
      expect(result1.shortcode).toBe('TestReel123');
      expect(result1.cleanUrl).toBe('https://www.instagram.com/reel/TestReel123/');

      // Second query should return cached object without repeating fetch
      const result2 = await service.getPreview('https://instagram.com/reel/TestReel123', 'http://localhost:3000');
      expect(result2.shortcode).toBe('TestReel123');

      fetchSpy.mockRestore();
    });
  });

  describe('proxyMedia (SSRF & Security Validations)', () => {
    const createMockReqRes = (method = 'GET') => {
      const req: any = {
        method,
        headers: {},
      };
      const headersSet: Record<string, string> = {};
      const res: any = {
        headersSent: false,
        statusCode: 200,
        setHeader: jest.fn((k: string, v: string) => {
          headersSet[k] = v;
        }),
        status: jest.fn(function (code: number) {
          res.statusCode = code;
          return res;
        }),
        json: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };
      return { req, res, headersSet };
    };

    it('should reject missing media URL', () => {
      const { req, res } = createMockReqRes();
      expect(() => service.proxyMedia('', req, res)).toThrow(BadRequestException);
    });

    it('should reject non-http/https protocols', () => {
      const { req, res } = createMockReqRes();
      expect(() => service.proxyMedia('ftp://cdninstagram.com/file.mp4', req, res)).toThrow(BadRequestException);
      expect(() => service.proxyMedia('javascript:alert(1)', req, res)).toThrow(BadRequestException);
    });

    it('should reject disallowed domains to prevent SSRF', () => {
      const { req, res } = createMockReqRes();
      // Internal metadata / localhost / foreign domains
      expect(() => service.proxyMedia('http://169.254.169.254/latest/meta-data', req, res)).toThrow(BadRequestException);
      expect(() => service.proxyMedia('http://localhost:3000/api/users', req, res)).toThrow(BadRequestException);
      expect(() => service.proxyMedia('https://evil-site.com/video.mp4', req, res)).toThrow(BadRequestException);
    });

    it('should allow fbsbx.com Meta attachment domain', () => {
      const { req, res } = createMockReqRes('OPTIONS');
      expect(() =>
        service.proxyMedia('https://video.fbsbx.com/v/t50/vid.mp4', req, res),
      ).not.toThrow();
    });

    it('should handle OPTIONS preflight with 204 No Content', () => {
      const { req, res, headersSet } = createMockReqRes('OPTIONS');
      service.proxyMedia('https://scontent.cdninstagram.com/v/t50/vid.mp4', req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      expect(headersSet['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should reject redirect loops after 5 redirects', () => {
      const { req, res } = createMockReqRes();
      service.proxyMedia('https://scontent.cdninstagram.com/v/t50/vid.mp4', req, res, 6);

      expect(res.status).toHaveBeenCalledWith(508);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Too many') }));
    });
  });
});
