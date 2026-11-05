import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpStatus, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getInfo: jest.fn().mockReturnValue({
              name: 'OmniHub API',
              version: '0.0.1',
              status: 'online',
              environment: 'test',
              nodeVersion: process.version,
              uptimeSeconds: 42,
              modules: ['TasksModule'],
              timestamp: '2026-11-04T00:00:00.000Z',
            }),
            getHealth: jest.fn().mockResolvedValue({
              status: 'ok',
              name: 'OmniHub API',
              version: '0.0.1',
              environment: 'test',
              uptimeSeconds: 42,
              nodeVersion: process.version,
              memory: { heapUsedMB: 50, heapTotalMB: 100, rssMB: 120 },
              system: {
                platform: 'win32',
                cpuCount: 8,
                loadAverage: [0, 0, 0],
                freeMemoryMB: 8000,
                totalMemoryMB: 16000,
              },
              database: {
                connected: true,
                type: 'postgres',
                latencyMs: 3,
                entitiesCount: 10,
              },
              modules: ['TasksModule'],
              timestamp: '2026-11-04T00:00:00.000Z',
            }),
            pingDatabase: jest.fn().mockResolvedValue({
              connected: true,
              latencyMs: 3,
              entitiesCount: 10,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getInfo', () => {
    it('should return API information', () => {
      const res = controller.getInfo();
      expect(res.name).toBe('OmniHub API');
      expect(res.status).toBe('online');
      expect(Array.isArray(res.modules)).toBe(true);
      expect(service.getInfo).toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('should return health, set Cache-Control, and set HTTP 200 when system is healthy', async () => {
      const res = await controller.getHealth(mockResponse as Response, '1500');
      expect(res.status).toBe('ok');
      expect(res.database.connected).toBe(true);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-store, must-revalidate',
      );
      expect(service.getHealth).toHaveBeenCalledWith(1500);
    });

    it('should set HTTP 503 Service Unavailable when system is degraded', async () => {
      (service.getHealth as jest.Mock).mockResolvedValueOnce({
        status: 'degraded',
        name: 'OmniHub API',
        version: '0.0.1',
        environment: 'test',
        uptimeSeconds: 42,
        nodeVersion: process.version,
        memory: { heapUsedMB: 50, heapTotalMB: 100, rssMB: 120 },
        system: {
          platform: 'win32',
          cpuCount: 8,
          loadAverage: [0, 0, 0],
          freeMemoryMB: 8000,
          totalMemoryMB: 16000,
        },
        database: {
          connected: false,
          type: 'postgres',
          error: 'Connection timeout',
        },
        modules: ['TasksModule'],
        timestamp: '2026-11-04T00:00:00.000Z',
      });

      const res = await controller.getHealth(mockResponse as Response);
      expect(res.status).toBe('degraded');
      expect(res.database.connected).toBe(false);
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    });

    it('should throw BadRequestException on invalid timeout query', async () => {
      await expect(
        controller.getHealth(mockResponse as Response, 'invalid'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getHealth(mockResponse as Response, '-10'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLiveness', () => {
    it('should return liveness status and set Cache-Control', () => {
      const live = controller.getLiveness(mockResponse as Response);
      expect(live.status).toBe('ok');
      expect(live.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof live.timestamp).toBe('string');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-store, must-revalidate',
      );
    });
  });

  describe('getReadiness', () => {
    it('should return ready and set HTTP 200 when database is connected', async () => {
      const ready = await controller.getReadiness(
        mockResponse as Response,
        '2000',
      );
      expect(ready.ready).toBe(true);
      expect(ready.status).toBe('ok');
      expect(ready.database.connected).toBe(true);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-store, must-revalidate',
      );
      expect(service.pingDatabase).toHaveBeenCalledWith(2000);
    });

    it('should set HTTP 503 when database is not connected', async () => {
      (service.pingDatabase as jest.Mock).mockResolvedValueOnce({
        connected: false,
        error: 'Database not reachable',
      });

      const ready = await controller.getReadiness(mockResponse as Response);
      expect(ready.ready).toBe(false);
      expect(ready.status).toBe('degraded');
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    });

    it('should throw BadRequestException on invalid timeout parameter', async () => {
      await expect(
        controller.getReadiness(mockResponse as Response, '0'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
