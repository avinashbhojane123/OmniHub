import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BatteryController } from './battery.controller';
import { BatteryService } from './battery.service';
import {
  UpdateBatterySettingsDto,
  CreateBatterySessionDto,
  BatteryAlertEventDto,
} from './dto/battery.dto';

describe('BatteryController', () => {
  let controller: BatteryController;
  let service: BatteryService;

  const mockBatteryService = {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    resetSettings: jest.fn(),
    recordSession: jest.fn(),
    getRecentSessions: jest.fn(),
    getDeviceStats: jest.fn(),
    getSessionById: jest.fn(),
    deleteSession: jest.fn(),
    clearSessions: jest.fn(),
    handleAlertEvent: jest.fn(),
    getRecentAlerts: jest.fn(),
    clearAlerts: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatteryController],
      providers: [
        {
          provide: BatteryService,
          useValue: mockBatteryService,
        },
      ],
    }).compile();

    controller = module.get<BatteryController>(BatteryController);
    service = module.get<BatteryService>(BatteryService);
  });

  describe('getHealth', () => {
    it('should return health check payload with service status ok', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('battery');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getSettings', () => {
    it('should delegate to service with clean deviceId', async () => {
      const mockResult: any = { deviceId: 'phone_1', fullChargeTarget: 80 };
      mockBatteryService.getSettings.mockResolvedValue(mockResult);

      const result = await controller.getSettings('  phone_1  ');
      expect(mockBatteryService.getSettings).toHaveBeenCalledWith('phone_1');
      expect(result).toBe(mockResult);
    });

    it('should fallback to default_device if deviceId query is omitted or empty', async () => {
      mockBatteryService.getSettings.mockResolvedValue({ deviceId: 'default_device' });

      await controller.getSettings('');
      expect(mockBatteryService.getSettings).toHaveBeenCalledWith('default_device');

      await controller.getSettings(undefined);
      expect(mockBatteryService.getSettings).toHaveBeenCalledWith('default_device');
    });
  });

  describe('updateSettings', () => {
    it('should delegate updateSettings to service', async () => {
      const dto: UpdateBatterySettingsDto = {
        deviceId: 'phone_1',
        fullChargeTarget: 85,
      };
      mockBatteryService.updateSettings.mockResolvedValue({ ...dto });

      const result = await controller.updateSettings(dto);
      expect(mockBatteryService.updateSettings).toHaveBeenCalledWith(dto);
      expect(result.fullChargeTarget).toBe(85);
    });

    it('should use query deviceId when body lacks deviceId', async () => {
      const dto: UpdateBatterySettingsDto = {
        fullChargeTarget: 90,
      };
      mockBatteryService.updateSettings.mockResolvedValue({ deviceId: 'query_dev', fullChargeTarget: 90 });

      await controller.updateSettings(dto, ' query_dev ');
      expect(dto.deviceId).toBe('query_dev');
      expect(mockBatteryService.updateSettings).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetSettings', () => {
    it('should delegate resetSettings to service with cleaned deviceId', async () => {
      mockBatteryService.resetSettings.mockResolvedValue({ deviceId: 'dev_1', fullChargeTarget: 80 });

      const result = await controller.resetSettings(' dev_1 ');
      expect(mockBatteryService.resetSettings).toHaveBeenCalledWith('dev_1');
      expect(result.fullChargeTarget).toBe(80);
    });
  });

  describe('recordSession', () => {
    it('should delegate recordSession to service', async () => {
      const dto: CreateBatterySessionDto = {
        deviceId: 'dev_1',
        startTime: '2026-11-02T12:00:00.000Z',
        startLevel: 20,
      };
      mockBatteryService.recordSession.mockResolvedValue({ id: 1, ...dto });

      const result = await controller.recordSession(dto);
      expect(mockBatteryService.recordSession).toHaveBeenCalledWith(dto);
      expect(result.id).toBe(1);
    });

    it('should fallback to query deviceId if body deviceId is missing', async () => {
      const dto: CreateBatterySessionDto = {
        startTime: '2026-11-02T12:00:00.000Z',
        startLevel: 30,
      };
      mockBatteryService.recordSession.mockResolvedValue({ id: 2, deviceId: 'fallback_dev', ...dto });

      await controller.recordSession(dto, ' fallback_dev ');
      expect(dto.deviceId).toBe('fallback_dev');
    });
  });

  describe('getRecentSessions', () => {
    it('should parse limit and offset safely and delegate to service', async () => {
      mockBatteryService.getRecentSessions.mockResolvedValue([]);

      await controller.getRecentSessions('dev_1', '15', '5');
      expect(mockBatteryService.getRecentSessions).toHaveBeenCalledWith('dev_1', 15, 5);
    });

    it('should clamp invalid limit and negative offset to safe bounds', async () => {
      mockBatteryService.getRecentSessions.mockResolvedValue([]);

      await controller.getRecentSessions('dev_1', 'invalid', '-10');
      expect(mockBatteryService.getRecentSessions).toHaveBeenCalledWith('dev_1', 20, 0);

      await controller.getRecentSessions('dev_1', '999', '0');
      expect(mockBatteryService.getRecentSessions).toHaveBeenCalledWith('dev_1', 100, 0);
    });
  });

  describe('getSessionStats', () => {
    it('should delegate getSessionStats to service', async () => {
      const stats = { deviceId: 'dev_1', totalSessions: 5, avgSpeedPerHour: 35.2 };
      mockBatteryService.getDeviceStats.mockResolvedValue(stats);

      const result = await controller.getSessionStats('dev_1');
      expect(mockBatteryService.getDeviceStats).toHaveBeenCalledWith('dev_1');
      expect(result).toBe(stats);
    });
  });

  describe('getSessionById and deleteSession', () => {
    it('should throw BadRequestException for non-positive session id', async () => {
      await expect(controller.getSessionById(0)).rejects.toThrow(BadRequestException);
      await expect(controller.getSessionById(-5)).rejects.toThrow(BadRequestException);

      await expect(controller.deleteSession(0)).rejects.toThrow(BadRequestException);
      await expect(controller.deleteSession(-1)).rejects.toThrow(BadRequestException);
    });

    it('should delegate getSessionById to service for valid id', async () => {
      const session = { id: 10, startLevel: 15 };
      mockBatteryService.getSessionById.mockResolvedValue(session);

      const result = await controller.getSessionById(10, 'dev_1');
      expect(mockBatteryService.getSessionById).toHaveBeenCalledWith(10, 'dev_1');
      expect(result).toBe(session);
    });

    it('should delegate deleteSession to service for valid id', async () => {
      mockBatteryService.deleteSession.mockResolvedValue({ success: true, message: 'Deleted' });

      const result = await controller.deleteSession(10, 'dev_1');
      expect(mockBatteryService.deleteSession).toHaveBeenCalledWith(10, 'dev_1');
      expect(result.success).toBe(true);
    });
  });

  describe('clearSessions', () => {
    it('should delegate clearSessions to service', async () => {
      mockBatteryService.clearSessions.mockResolvedValue({ deleted: 4 });

      const result = await controller.clearSessions('dev_1');
      expect(mockBatteryService.clearSessions).toHaveBeenCalledWith('dev_1');
      expect(result.deleted).toBe(4);
    });
  });

  describe('postAlert, getAlerts, and clearAlerts', () => {
    it('should delegate postAlert to service and assign query deviceId if missing', async () => {
      const dto: BatteryAlertEventDto = {
        eventType: 'overheat',
        level: 80,
        temperature: 46.5,
        message: 'Too hot',
      };
      mockBatteryService.handleAlertEvent.mockResolvedValue({ success: true, event: 'overheat' });

      await controller.postAlert(dto, 'alert_dev');
      expect(dto.deviceId).toBe('alert_dev');
      expect(mockBatteryService.handleAlertEvent).toHaveBeenCalledWith(dto);
    });

    it('should delegate getAlerts with sanitized limit and offset', async () => {
      mockBatteryService.getRecentAlerts.mockResolvedValue([]);

      await controller.getAlerts('dev_1', '10', '0');
      expect(mockBatteryService.getRecentAlerts).toHaveBeenCalledWith('dev_1', 10, 0);
    });

    it('should delegate clearAlerts to service', async () => {
      mockBatteryService.clearAlerts.mockResolvedValue({ deleted: 2 });

      const result = await controller.clearAlerts('dev_1');
      expect(mockBatteryService.clearAlerts).toHaveBeenCalledWith('dev_1');
      expect(result.deleted).toBe(2);
    });
  });
});

