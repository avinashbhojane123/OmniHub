import { Test, TestingModule } from '@nestjs/testing';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

describe('DevicesController', () => {
  let controller: DevicesController;
  let service: jest.Mocked<DevicesService>;

  beforeEach(async () => {
    const mockService = {
      registerDevice: jest.fn().mockResolvedValue({
        deviceId: 'dev_123',
        nickname: 'alice',
        isBound: true,
      }),
      bindDevice: jest.fn().mockResolvedValue({
        deviceId: 'dev_123',
        nickname: 'alice',
        isBound: true,
      }),
      generateKeystoreChallenge: jest.fn().mockResolvedValue({
        challenge: 'random_hex_nonce',
        expiresAt: Date.now() + 300000,
      }),
      verifyKeystoreSignature: jest.fn().mockResolvedValue({
        verified: true,
        message: 'Verified',
      }),
      updateFcmToken: jest.fn().mockResolvedValue(undefined),
      syncOfflineData: jest.fn().mockResolvedValue({
        success: true,
        serverTimestamp: Date.now(),
        processedCount: 0,
        updates: [],
      }),
      getStatus: jest.fn().mockResolvedValue({
        status: 'ok',
        totalRegisteredDevices: 5,
        boundDevices: 3,
        timestamp: new Date().toISOString(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [
        {
          provide: DevicesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<DevicesController>(DevicesController);
    service = module.get(DevicesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should register device', async () => {
    const result = await controller.register({
      deviceId: 'dev_123',
      deviceModel: 'Pixel 8',
    });
    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('dev_123');
    expect(service.registerDevice).toHaveBeenCalled();
  });

  it('should bind device', async () => {
    const result = await controller.bind({
      deviceId: 'dev_123',
      nickname: 'alice',
    });
    expect(result.success).toBe(true);
    expect(service.bindDevice).toHaveBeenCalled();
  });

  it('should issue challenge', async () => {
    const result = await controller.requestChallenge({ deviceId: 'dev_123' });
    expect(result.challenge).toBe('random_hex_nonce');
  });

  it('should verify signature', async () => {
    const result = await controller.verifySignature({
      deviceId: 'dev_123',
      signature: 'base64_sig',
      challenge: 'random_hex_nonce',
    });
    expect(result.verified).toBe(true);
  });

  it('should update fcm token', async () => {
    const result = await controller.updateToken({
      deviceId: 'dev_123',
      fcmToken: 'fcm_token_xyz',
    });
    expect(result.success).toBe(true);
  });

  it('should sync offline data', async () => {
    const result = await controller.sync({
      deviceId: 'dev_123',
      lastSyncTimestamp: 1000,
    });
    expect(result.success).toBe(true);
  });

  it('should return telemetry status', async () => {
    const result = await controller.getStatus();
    expect(result.status).toBe('ok');
    expect(result.totalRegisteredDevices).toBe(5);
  });
});

