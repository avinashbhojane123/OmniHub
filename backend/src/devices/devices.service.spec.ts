import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicesService } from './devices.service';
import { Device } from './entities/device.entity';

describe('DevicesService', () => {
  let service: DevicesService;
  let repo: jest.Mocked<Repository<Device>>;

  const mockDevice: Device = {
    id: 1,
    deviceId: 'android_hardware_id_123',
    nickname: 'alice',
    fcmToken: 'fcm_token_xyz',
    deviceModel: 'Pixel 8 Pro',
    manufacturer: 'Google',
    androidVersion: 'Android 15',
    appVersion: '1.4.0',
    keystorePublicKey: null,
    keystoreChallenge: null,
    isBound: true,
    lastActive: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 1 })),
      save: jest.fn().mockImplementation(async (d) => ({ ...d })),
      count: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        {
          provide: getRepositoryToken(Device),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
    repo = module.get(getRepositoryToken(Device));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerDevice', () => {
    it('should create new device if not exists', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      const result = await service.registerDevice({
        deviceId: 'new_android_dev_456',
        deviceModel: 'Galaxy S24',
        manufacturer: 'Samsung',
        fcmToken: 'token_123',
      });

      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      expect(result.deviceId).toBe('new_android_dev_456');
    });

    it('should update existing device if already registered', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockDevice });

      const result = await service.registerDevice({
        deviceId: 'android_hardware_id_123',
        fcmToken: 'updated_fcm_token',
      });

      expect(result.fcmToken).toBe('updated_fcm_token');
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('bindDevice', () => {
    it('should bind device to nickname', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockDevice, isBound: false });

      const result = await service.bindDevice({
        deviceId: 'android_hardware_id_123',
        nickname: 'bob',
      });

      expect(result.nickname).toBe('bob');
      expect(result.isBound).toBe(true);
    });
  });

  describe('generateKeystoreChallenge', () => {
    it('should generate a 64-char hex challenge nonce', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockDevice });

      const result = await service.generateKeystoreChallenge(
        'android_hardware_id_123',
      );

      expect(result.challenge).toBeDefined();
      expect(result.challenge.length).toBe(64);
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('updateFcmToken', () => {
    it('should update fcm token for device', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockDevice });

      await service.updateFcmToken({
        deviceId: 'android_hardware_id_123',
        fcmToken: 'fresh_token_999',
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ fcmToken: 'fresh_token_999' }),
      );
    });
  });

  describe('syncOfflineData', () => {
    it('should return processed count and server timestamp', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockDevice });

      const result = await service.syncOfflineData({
        deviceId: 'android_hardware_id_123',
        lastSyncTimestamp: Date.now() - 60000,
        queuedActions: [
          { actionType: 'MARK_READ', timestamp: Date.now() - 30000 },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(result.serverTimestamp).toBeGreaterThan(0);
    });
  });

  describe('getStatus', () => {
    it('should report registered devices statistics', async () => {
      const status = await service.getStatus();
      expect(status.status).toBe('ok');
      expect(status.totalRegisteredDevices).toBe(1);
    });
  });
});

