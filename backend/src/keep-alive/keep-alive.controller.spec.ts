import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Request } from 'express';
import { KeepAliveController } from './keep-alive.controller';
import { KeepAliveService } from './keep-alive.service';
import { TriggerPingDto } from './dto/keep-alive.dto';

describe('KeepAliveController', () => {
  let controller: KeepAliveController;
  let service: KeepAliveService;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.KEEP_ALIVE_ADMIN_SECRET;
    delete process.env.ADMIN_KEY;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KeepAliveController],
      providers: [KeepAliveService, ConfigService],
    }).compile();

    controller = module.get<KeepAliveController>(KeepAliveController);
    service = module.get<KeepAliveService>(KeepAliveService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env = originalEnv;
  });

  describe('DTO Validation', () => {
    it('TriggerPingDto: should validate optional adminSecret', async () => {
      const dto = plainToInstance(TriggerPingDto, {
        adminSecret: 'secret_123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('TriggerPingDto: should reject oversized adminSecret', async () => {
      const dto = plainToInstance(TriggerPingDto, {
        adminSecret: 's'.repeat(257),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('getKeepAliveStatus', () => {
    it('should return service status payload', () => {
      const status = controller.getKeepAliveStatus();
      expect(status.service).toBe('KeepAliveService');
      expect(status.totalPingsSent).toBe(0);
      expect(status.lastPingResult).toBeNull();
    });
  });

  describe('ping', () => {
    it('should return 200 ok health response with uptime', () => {
      const res = controller.ping();
      expect(res.statusCode).toBe(200);
      expect(res.status).toBe('ok');
      expect(res.message).toBe('Server is active and responsive');
      expect(res.timestamp).toBeDefined();
      expect(typeof res.uptime).toBe('number');
    });
  });

  describe('triggerPingNow', () => {
    it('should invoke pingServer and return PingResult when no admin secret is configured', async () => {
      const pingResult = {
        success: true,
        statusCode: 200,
        message: 'Ping succeeded with status code 200',
        timestamp: new Date().toISOString(),
        durationMs: 42,
        url: 'http://127.0.0.1:10000/api/keep-alive/ping',
      };

      jest.spyOn(service, 'pingServer').mockResolvedValueOnce(pingResult);

      const res = await controller.triggerPingNow();
      expect(res).toEqual(pingResult);
    });

    it('should enforce admin secret when KEEP_ALIVE_ADMIN_SECRET is set', async () => {
      process.env.KEEP_ALIVE_ADMIN_SECRET = 'SuperKeepAliveSecret';

      // 1. Missing secret
      await expect(controller.triggerPingNow({} as Request)).rejects.toThrow(
        UnauthorizedException,
      );

      // 2. Incorrect secret
      await expect(
        controller.triggerPingNow({} as Request, { adminSecret: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      // 3. Valid secret in body
      const pingResult = {
        success: true,
        statusCode: 200,
        message: 'Ping succeeded',
        timestamp: new Date().toISOString(),
        durationMs: 25,
        url: 'http://127.0.0.1:10000/api/keep-alive/ping',
      };
      jest.spyOn(service, 'pingServer').mockResolvedValueOnce(pingResult);

      const bodyRes = await controller.triggerPingNow({} as Request, {
        adminSecret: 'SuperKeepAliveSecret',
      });
      expect(bodyRes).toEqual(pingResult);

      // 4. Valid secret in x-admin-key header
      jest.spyOn(service, 'pingServer').mockResolvedValueOnce(pingResult);
      const reqHeader = {
        headers: { 'x-admin-key': 'SuperKeepAliveSecret' },
      } as unknown as Request;
      const headerRes = await controller.triggerPingNow(reqHeader);
      expect(headerRes).toEqual(pingResult);

      // 5. Valid secret in Authorization: Bearer header
      jest.spyOn(service, 'pingServer').mockResolvedValueOnce(pingResult);
      const reqBearer = {
        headers: { authorization: 'Bearer SuperKeepAliveSecret' },
      } as unknown as Request;
      const bearerRes = await controller.triggerPingNow(reqBearer);
      expect(bearerRes).toEqual(pingResult);

      // 6. Valid secret in query param
      jest.spyOn(service, 'pingServer').mockResolvedValueOnce(pingResult);
      const reqQuery = {
        query: { adminSecret: 'SuperKeepAliveSecret' },
      } as unknown as Request;
      const queryRes = await controller.triggerPingNow(reqQuery);
      expect(queryRes).toEqual(pingResult);
    });
  });
});
