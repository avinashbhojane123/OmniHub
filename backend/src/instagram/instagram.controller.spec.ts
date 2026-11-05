import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import {
  InstagramPreviewDto,
  InstagramProxyDto,
  InstagramSessionKeyDto,
} from './dto/instagram.dto';

describe('InstagramController', () => {
  let controller: InstagramController;
  let service: InstagramService;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.INSTAGRAM_ADMIN_SECRET;
    delete process.env.ADMIN_KEY;
    delete process.env.BACKEND_URL;
    delete process.env.BASE_URL;
    delete process.env.SERVER_URL;
    delete process.env.SERVER_HOST;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstagramController],
      providers: [InstagramService, ConfigService],
    }).compile();

    controller = module.get<InstagramController>(InstagramController);
    service = module.get<InstagramService>(InstagramService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DTO Validation', () => {
    it('InstagramPreviewDto: should validate a valid URL', async () => {
      const dto = plainToInstance(InstagramPreviewDto, {
        url: 'https://www.instagram.com/reel/C123456/',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('InstagramPreviewDto: should reject empty URL', async () => {
      const dto = plainToInstance(InstagramPreviewDto, {
        url: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('url');
    });

    it('InstagramPreviewDto: should reject oversized URL', async () => {
      const dto = plainToInstance(InstagramPreviewDto, {
        url: 'https://instagram.com/' + 'a'.repeat(2100),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('InstagramProxyDto: should validate a valid proxy URL', async () => {
      const dto = plainToInstance(InstagramProxyDto, {
        url: 'https://scontent.cdninstagram.com/v/t50/vid.mp4',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('InstagramProxyDto: should reject missing URL', async () => {
      const dto = plainToInstance(InstagramProxyDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('InstagramSessionKeyDto: should validate optional sessionId and adminSecret', async () => {
      const dto = plainToInstance(InstagramSessionKeyDto, {
        sessionId: 'test_session_id_123',
        adminSecret: 'secret_key_abc',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('InstagramSessionKeyDto: should reject oversized sessionId', async () => {
      const dto = plainToInstance(InstagramSessionKeyDto, {
        sessionId: 's'.repeat(501),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('getPreview', () => {
    it('should throw BadRequestException if url is empty or whitespace', async () => {
      const mockReq = {} as Request;
      await expect(
        controller.getPreview({ url: '' }, mockReq),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getPreview({ url: '   ' }, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call instagramService.getPreview with sanitized URL and computed baseUrlPrefix', async () => {
      const mockReq = {
        headers: { host: 'omnihub.app' },
        protocol: 'https',
        get: (header: string) => (header.toLowerCase() === 'host' ? 'omnihub.app' : undefined),
      } as unknown as Request;

      const spy = jest
        .spyOn(service, 'getPreview')
        .mockResolvedValueOnce({ success: true, cleanUrl: 'https://instagram.com/p/123' } as any);

      const result = await controller.getPreview(
        { url: ' https://www.instagram.com/reel/C123456/ ' },
        mockReq,
      );

      expect(spy).toHaveBeenCalledWith(
        'https://www.instagram.com/reel/C123456/',
        'https://omnihub.app',
      );
      expect(result).toEqual({ success: true, cleanUrl: 'https://instagram.com/p/123' });
    });

    it('should accept direct string parameter for backward compatibility', async () => {
      const mockReq = {
        headers: { host: 'localhost:3000' },
        protocol: 'http',
        get: (header: string) => (header.toLowerCase() === 'host' ? 'localhost:3000' : undefined),
      } as unknown as Request;

      const spy = jest
        .spyOn(service, 'getPreview')
        .mockResolvedValueOnce({ success: true } as any);

      await controller.getPreview('https://instagram.com/p/123' as any, mockReq);

      expect(spy).toHaveBeenCalledWith(
        'https://instagram.com/p/123',
        'http://localhost:3000',
      );
    });
  });

  describe('resolveBaseUrl & Host Header Poisoning Protection', () => {
    it('should prioritize BACKEND_URL when configured', async () => {
      process.env.BACKEND_URL = 'https://api.mycustomdomain.com';
      const mockReq = {
        headers: { host: 'evil-attacker.com' },
        get: () => 'evil-attacker.com',
      } as unknown as Request;

      const spy = jest.spyOn(service, 'getPreview').mockResolvedValueOnce({} as any);

      await controller.getPreview({ url: 'https://instagram.com/reel/123' }, mockReq);

      expect(spy).toHaveBeenCalledWith(
        'https://instagram.com/reel/123',
        'https://api.mycustomdomain.com',
      );
    });

    it('should use x-forwarded-proto when valid http/https', async () => {
      const mockReq = {
        headers: {
          'x-forwarded-proto': 'http',
          host: 'api.example.com',
        },
        get: () => 'api.example.com',
      } as unknown as Request;

      const spy = jest.spyOn(service, 'getPreview').mockResolvedValueOnce({} as any);

      await controller.getPreview({ url: 'https://instagram.com/reel/123' }, mockReq);

      expect(spy).toHaveBeenCalledWith(
        'https://instagram.com/reel/123',
        'http://api.example.com',
      );
    });

    it('should reject invalid protocol in x-forwarded-proto and default to https', async () => {
      const mockReq = {
        headers: {
          'x-forwarded-proto': 'javascript:',
          host: 'api.example.com',
        },
        get: () => 'api.example.com',
      } as unknown as Request;

      const spy = jest.spyOn(service, 'getPreview').mockResolvedValueOnce({} as any);

      await controller.getPreview({ url: 'https://instagram.com/reel/123' }, mockReq);

      expect(spy).toHaveBeenCalledWith(
        'https://instagram.com/reel/123',
        'https://api.example.com',
      );
    });

    it('should allow valid IPv6 host literals with port', async () => {
      const mockReq = {
        headers: { host: '[::1]:3000' },
        protocol: 'http',
        get: () => '[::1]:3000',
      } as unknown as Request;

      const spy = jest.spyOn(service, 'getPreview').mockResolvedValueOnce({} as any);

      await controller.getPreview({ url: 'https://instagram.com/reel/123' }, mockReq);

      expect(spy).toHaveBeenCalledWith(
        'https://instagram.com/reel/123',
        'http://[::1]:3000',
      );
    });

    it('should reject poisoned host header with CRLF or slashes and return empty prefix', async () => {
      const mockReq = {
        headers: {
          host: 'evil.com\r\nX-Injected: true',
        },
        get: () => 'evil.com\r\nX-Injected: true',
      } as unknown as Request;

      const spy = jest.spyOn(service, 'getPreview').mockResolvedValueOnce({} as any);

      await controller.getPreview({ url: 'https://instagram.com/reel/123' }, mockReq);

      expect(spy).toHaveBeenCalledWith('https://instagram.com/reel/123', '');
    });

    it('should handle undefined req gracefully', async () => {
      const spy = jest.spyOn(service, 'getPreview').mockResolvedValueOnce({} as any);

      await controller.getPreview({ url: 'https://instagram.com/reel/123' }, undefined as any);

      expect(spy).toHaveBeenCalledWith('https://instagram.com/reel/123', '');
    });
  });

  describe('proxyMedia', () => {
    it('should throw BadRequestException if url is missing for GET/HEAD', () => {
      const mockReq = { method: 'GET' } as unknown as Request;
      const mockRes = {} as unknown as Response;

      expect(() => controller.proxyMedia({ url: '' }, mockReq, mockRes)).toThrow(
        BadRequestException,
      );
    });

    it('should delegate valid URL to instagramService.proxyMedia', () => {
      const mockReq = { method: 'GET' } as unknown as Request;
      const mockRes = {} as unknown as Response;

      const spy = jest.spyOn(service, 'proxyMedia').mockImplementation(() => {});

      controller.proxyMedia(
        { url: ' https://scontent.cdninstagram.com/video.mp4 ' },
        mockReq,
        mockRes,
      );

      expect(spy).toHaveBeenCalledWith(
        'https://scontent.cdninstagram.com/video.mp4',
        mockReq,
        mockRes,
      );
    });
  });

  describe('session management & security', () => {
    it('getSessionStatus should report false initially and true when session ID is set', () => {
      expect(controller.getSessionStatus()).toEqual({ configured: false });

      service.setCustomSessionId('valid_session_123');
      expect(controller.getSessionStatus()).toEqual({ configured: true });
    });

    it('setSessionKey should update session key when no admin secret is configured in env', () => {
      const mockReq = {} as Request;
      const response = controller.setSessionKey(
        { sessionId: ' new_session_token\r\n ' },
        mockReq,
      );

      expect(response).toEqual({ success: true, configured: true });
      expect(service.hasSessionId()).toBe(true);
    });

    it('setSessionKey should enforce admin authentication when INSTAGRAM_ADMIN_SECRET is configured', () => {
      process.env.INSTAGRAM_ADMIN_SECRET = 'SuperSecretAdmin123';
      const mockReq = { headers: {} } as Request;

      // Without secret -> throws UnauthorizedException
      expect(() =>
        controller.setSessionKey({ sessionId: 'new_token' }, mockReq),
      ).toThrow(UnauthorizedException);

      // With wrong secret -> throws UnauthorizedException
      expect(() =>
        controller.setSessionKey(
          { sessionId: 'new_token', adminSecret: 'wrong_secret' },
          mockReq,
        ),
      ).toThrow(UnauthorizedException);

      // With correct secret in body -> succeeds
      const successBody = controller.setSessionKey(
        { sessionId: 'new_token', adminSecret: 'SuperSecretAdmin123' },
        mockReq,
      );
      expect(successBody).toEqual({ success: true, configured: true });

      // With correct secret in x-admin-key header -> succeeds
      const reqWithHeader = {
        headers: { 'x-admin-key': 'SuperSecretAdmin123' },
      } as unknown as Request;
      const successHeader = controller.setSessionKey(
        { sessionId: 'another_token' },
        reqWithHeader,
      );
      expect(successHeader).toEqual({ success: true, configured: true });

      // With correct secret in Authorization: Bearer header -> succeeds
      const reqWithBearer = {
        headers: { authorization: 'Bearer SuperSecretAdmin123' },
      } as unknown as Request;
      const successBearer = controller.setSessionKey(
        { sessionId: 'bearer_token' },
        reqWithBearer,
      );
      expect(successBearer).toEqual({ success: true, configured: true });
    });

    it('clearSessionKey (DELETE) should clear session key and enforce admin secret if configured', () => {
      service.setCustomSessionId('active_session_123');
      expect(service.hasSessionId()).toBe(true);

      process.env.ADMIN_KEY = 'AdminKey456';
      const unauthReq = { headers: {} } as Request;

      expect(() => controller.clearSessionKey(unauthReq)).toThrow(
        UnauthorizedException,
      );

      const authReq = {
        headers: { 'x-admin-secret': 'AdminKey456' },
      } as unknown as Request;

      const res = controller.clearSessionKey(authReq);
      expect(res).toEqual({
        success: true,
        configured: false,
        cleared: true,
      });
      expect(service.hasSessionId()).toBe(false);
    });
  });
});
