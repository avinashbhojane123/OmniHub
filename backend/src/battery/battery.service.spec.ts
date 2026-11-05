import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BatteryService } from './battery.service';

describe('BatteryService (Backend)', () => {
  let service: BatteryService;
  let mockSettingsRepo: any;
  let mockSessionRepo: any;
  let mockAlertRepo: any;

  beforeEach(() => {
    mockSettingsRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({
        id: 1,
        updatedAt: new Date(),
        ...data,
      })),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: entity.id || 1,
          updatedAt: new Date(),
          ...entity,
        }),
      ),
    };

    mockSessionRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({
        id: 1,
        createdAt: new Date(),
        ...data,
      })),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: entity.id || 1,
          createdAt: new Date(),
          ...entity,
        }),
      ),
      remove: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      delete: jest.fn().mockImplementation(() => Promise.resolve({ affected: 3 })),
    };

    mockAlertRepo = {
      find: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({
        id: 101,
        createdAt: new Date(),
        ...data,
      })),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({
          id: entity.id || 101,
          createdAt: new Date(),
          ...entity,
        }),
      ),
      delete: jest.fn().mockImplementation(() => Promise.resolve({ affected: 2 })),
    };

    service = new BatteryService(
      mockSettingsRepo,
      mockSessionRepo,
      mockAlertRepo,
    );
  });

  describe('getSettings', () => {
    it('should return existing settings for a device', async () => {
      const existingSettings = {
        id: 1,
        deviceId: 'device_abc',
        batteryGuardActive: true,
        fullChargeTarget: 80,
        lowBatteryTarget: 20,
      };
      mockSettingsRepo.findOne.mockResolvedValue(existingSettings);

      const result = await service.getSettings('device_abc');
      expect(result).toEqual(existingSettings);
      expect(mockSettingsRepo.findOne).toHaveBeenCalledWith({
        where: { deviceId: 'device_abc' },
        order: { updatedAt: 'DESC' },
      });
      expect(mockSettingsRepo.create).not.toHaveBeenCalled();
    });

    it('should create and return default settings when not found', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      const result = await service.getSettings('device_xyz');
      expect(result.deviceId).toBe('device_xyz');
      expect(result.fullChargeTarget).toBe(80);
      expect(result.lowBatteryTarget).toBe(20);
      expect(result.tempTarget).toBe(42);
      expect(result.batteryGuardActive).toBe(true);
      expect(mockSettingsRepo.save).toHaveBeenCalled();
    });

    it('should sanitize empty or whitespace deviceId to default_device', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      const result = await service.getSettings('   ');
      expect(result.deviceId).toBe('default_device');
    });

    it('should truncate deviceId longer than 100 chars to 100 chars', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);
      const longId = 'a'.repeat(150);

      const result = await service.getSettings(longId);
      expect(result.deviceId.length).toBe(100);
      expect(result.deviceId).toBe('a'.repeat(100));
    });

    it('should handle concurrent insert race condition and retrieve existing settings', async () => {
      const concurrentSettings = {
        id: 2,
        deviceId: 'device_race',
        fullChargeTarget: 80,
      };
      // First findOne returns null, save throws duplicate error, fallback findOne returns concurrentSettings
      mockSettingsRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(concurrentSettings);
      mockSettingsRepo.save.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint'),
      );

      const result = await service.getSettings('device_race');
      expect(result).toEqual(concurrentSettings);
    });
  });

  describe('updateSettings', () => {
    it('should update whitelisted settings safely without mass assignment', async () => {
      const current = {
        id: 1,
        deviceId: 'device_abc',
        batteryGuardActive: true,
        fullChargeAlarmEnabled: true,
        fullChargeTarget: 80,
        lowBatteryTarget: 20,
        tempTarget: 42,
        continuousRingtone: true,
      };
      mockSettingsRepo.findOne.mockResolvedValue(current);

      const result = await service.updateSettings({
        deviceId: 'device_abc',
        fullChargeTarget: 85,
        lowBatteryTarget: 15,
        tempTarget: 45,
        continuousRingtone: false,
        // @ts-expect-error test malicious field
        id: 9999,
      });

      expect(result.id).toBe(1); // Primary key should NOT be overwritten
      expect(result.fullChargeTarget).toBe(85);
      expect(result.lowBatteryTarget).toBe(15);
      expect(result.tempTarget).toBe(45);
      expect(result.continuousRingtone).toBe(false);
    });

    it('should throw BadRequestException if fullChargeTarget is out of range', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        id: 1,
        deviceId: 'device_abc',
        fullChargeTarget: 80,
        lowBatteryTarget: 20,
      });

      await expect(
        service.updateSettings({
          deviceId: 'device_abc',
          fullChargeTarget: 105,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateSettings({
          deviceId: 'device_abc',
          fullChargeTarget: 40,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if lowBatteryTarget is out of range', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        id: 1,
        deviceId: 'device_abc',
        fullChargeTarget: 80,
        lowBatteryTarget: 20,
      });

      await expect(
        service.updateSettings({ deviceId: 'device_abc', lowBatteryTarget: 2 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateSettings({
          deviceId: 'device_abc',
          lowBatteryTarget: 60,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if lowBatteryTarget >= fullChargeTarget', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        id: 1,
        deviceId: 'device_abc',
        fullChargeTarget: 80,
        lowBatteryTarget: 20,
      });

      await expect(
        service.updateSettings({
          deviceId: 'device_abc',
          fullChargeTarget: 50,
          lowBatteryTarget: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if tempTarget is out of range', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        id: 1,
        deviceId: 'device_abc',
        fullChargeTarget: 80,
        lowBatteryTarget: 20,
        tempTarget: 42,
      });

      await expect(
        service.updateSettings({ deviceId: 'device_abc', tempTarget: 20 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateSettings({ deviceId: 'device_abc', tempTarget: 95 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetSettings', () => {
    it('should reset device settings to factory safe defaults', async () => {
      const corrupted = {
        id: 1,
        deviceId: 'device_custom',
        batteryGuardActive: false,
        fullChargeTarget: 95,
        lowBatteryTarget: 10,
        tempTarget: 50,
      };
      mockSettingsRepo.findOne.mockResolvedValue(corrupted);

      const result = await service.resetSettings('device_custom');
      expect(result.batteryGuardActive).toBe(true);
      expect(result.fullChargeTarget).toBe(80);
      expect(result.lowBatteryTarget).toBe(20);
      expect(result.tempTarget).toBe(42);
      expect(mockSettingsRepo.save).toHaveBeenCalled();
    });
  });

  describe('recordSession', () => {
    it('should throw BadRequestException for invalid or missing startTime', async () => {
      await expect(
        service.recordSession({
          startTime: 'not_a_date',
          startLevel: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if endTime is earlier than startTime', async () => {
      await expect(
        service.recordSession({
          startTime: '2026-11-01T12:00:00Z',
          endTime: '2026-11-01T11:00:00Z',
          startLevel: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if startLevel is out of range', async () => {
      await expect(
        service.recordSession({
          startTime: '2026-11-01T12:00:00Z',
          startLevel: 150,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordSession({
          startTime: '2026-11-01T12:00:00Z',
          startLevel: -10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should automatically compute gained, durationMinutes, and avgSpeedPerHour when omitted', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      const session = await service.recordSession({
        deviceId: 'dev_1',
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T11:00:00.000Z', // 60 minutes
        startLevel: 20,
        endLevel: 80, // gained = 60
      });

      expect(session.gained).toBe(60);
      expect(session.durationMinutes).toBe(60);
      expect(session.avgSpeedPerHour).toBe(60); // 60% per hour
    });

    it('should provide idempotency by updating existing session with same deviceId and startTime', async () => {
      const existingSession = {
        id: 10,
        deviceId: 'dev_1',
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: null,
        startLevel: 20,
        endLevel: null,
        gained: 0,
        durationMinutes: 0,
        chargingType: 'AC',
        peakTemperature: 30,
        peakWattage: 15,
        avgSpeedPerHour: 0,
      };
      mockSessionRepo.findOne.mockResolvedValue(existingSession);

      const updated = await service.recordSession({
        deviceId: 'dev_1',
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T10:30:00.000Z',
        startLevel: 20,
        endLevel: 50,
        peakTemperature: 38,
        peakWattage: 25,
      });

      expect(updated.id).toBe(10);
      expect(updated.endTime).toBe('2026-11-01T10:30:00.000Z');
      expect(updated.endLevel).toBe(50);
      expect(updated.gained).toBe(30);
      expect(updated.durationMinutes).toBe(30);
      expect(updated.peakTemperature).toBe(38);
      expect(updated.peakWattage).toBe(25);
      expect(mockSessionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getRecentSessions', () => {
    it('should clamp safe limit and offset and order by startTime DESC', async () => {
      mockSessionRepo.find.mockResolvedValue([]);

      await service.getRecentSessions('dev_1', 25, 10);
      expect(mockSessionRepo.find).toHaveBeenCalledWith({
        where: { deviceId: 'dev_1' },
        order: { startTime: 'DESC', createdAt: 'DESC' },
        take: 25,
        skip: 10,
      });
    });

    it('should protect against NaN, negative, or excessive limits', async () => {
      mockSessionRepo.find.mockResolvedValue([]);

      // NaN limit
      await service.getRecentSessions('dev_1', NaN);
      expect(mockSessionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );

      // Negative limit
      await service.getRecentSessions('dev_1', -50);
      expect(mockSessionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );

      // Excessive limit > 100
      await service.getRecentSessions('dev_1', 500);
      expect(mockSessionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('getSessionById and deleteSession', () => {
    it('should retrieve session by id', async () => {
      const session = { id: 5, deviceId: 'dev_1' };
      mockSessionRepo.findOne.mockResolvedValue(session);

      const res = await service.getSessionById(5, 'dev_1');
      expect(res).toEqual(session);
    });

    it('should throw NotFoundException if session does not exist', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(service.getSessionById(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete existing session', async () => {
      const session = { id: 5, deviceId: 'dev_1' };
      mockSessionRepo.findOne.mockResolvedValue(session);

      const res = await service.deleteSession(5, 'dev_1');
      expect(res.success).toBe(true);
      expect(mockSessionRepo.remove).toHaveBeenCalledWith(session);
    });
  });

  describe('clearSessions', () => {
    it('should clear sessions for a device', async () => {
      const res = await service.clearSessions('dev_1');
      expect(res.deleted).toBe(3);
      expect(mockSessionRepo.delete).toHaveBeenCalledWith({
        deviceId: 'dev_1',
      });
    });
  });

  describe('getDeviceStats', () => {
    it('should aggregate metrics correctly across recorded sessions', async () => {
      mockSessionRepo.find.mockResolvedValue([
        {
          id: 1,
          deviceId: 'dev_1',
          startTime: '2026-11-01T12:00:00Z',
          endTime: '2026-11-01T13:00:00Z',
          startLevel: 20,
          endLevel: 80,
          gained: 60,
          durationMinutes: 60,
          avgSpeedPerHour: 60,
          peakTemperature: 41,
          peakWattage: 25,
        },
        {
          id: 2,
          deviceId: 'dev_1',
          startTime: '2026-11-01T08:00:00Z',
          endTime: '2026-11-01T08:30:00Z',
          startLevel: 30,
          endLevel: 60,
          gained: 30,
          durationMinutes: 30,
          avgSpeedPerHour: 60,
          peakTemperature: 39,
          peakWattage: 30,
        },
      ]);

      const stats = await service.getDeviceStats('dev_1');
      expect(stats.totalSessions).toBe(2);
      expect(stats.completedSessions).toBe(2);
      expect(stats.totalGainedPercent).toBe(90);
      expect(stats.totalDurationMinutes).toBe(90);
      expect(stats.avgSpeedPerHour).toBe(60);
      expect(stats.maxPeakTemperature).toBe(41);
      expect(stats.maxPeakWattage).toBe(30);
      expect(stats.lastSession?.id).toBe(1);
    });
  });

  describe('handleAlertEvent', () => {
    it('should persist alert and log with proper severity', async () => {
      const result = await service.handleAlertEvent({
        deviceId: 'dev_1',
        eventType: 'overheat',
        level: 85,
        temperature: 46.5,
        message: 'Device temperature exceeded safety limit',
        timestamp: '2026-11-01T12:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.event).toBe('overheat');
      expect(result.deviceId).toBe('dev_1');
      expect(result.level).toBe(85);
      expect(result.id).toBe(101);
      expect(mockAlertRepo.create).toHaveBeenCalled();
      expect(mockAlertRepo.save).toHaveBeenCalled();
    });

    it('should clamp level between 0 and 100', async () => {
      const result = await service.handleAlertEvent({
        deviceId: 'dev_1',
        eventType: 'full_charge',
        level: 110,
        message: 'Charged to 100%',
        timestamp: '2026-11-01T12:00:00Z',
      });

      expect(result.level).toBe(100);
    });
  });

  describe('getRecentAlerts and clearAlerts', () => {
    it('should retrieve recent alerts for a device', async () => {
      mockAlertRepo.find.mockResolvedValue([
        { id: 101, eventType: 'overheat' },
      ]);

      const alerts = await service.getRecentAlerts('dev_1', 10);
      expect(alerts.length).toBe(1);
      expect(mockAlertRepo.find).toHaveBeenCalledWith({
        where: { deviceId: 'dev_1' },
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 0,
      });
    });

    it('should clear alerts for a device', async () => {
      const result = await service.clearAlerts('dev_1');
      expect(result.deleted).toBe(2);
      expect(mockAlertRepo.delete).toHaveBeenCalledWith({ deviceId: 'dev_1' });
    });
  });
});
