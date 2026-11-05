import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issueTokens', () => {
    it('should generate valid JWT access token and refresh token', async () => {
      const tokens = await service.issueTokens({
        nickname: 'alice',
        deviceId: 'pixel_device_001',
      });

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(900);

      // Verify the generated JWT
      const payload = service.verifyJwt(tokens.accessToken);
      expect(payload.nickname).toBe('alice');
      expect(payload.deviceId).toBe('pixel_device_001');
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token using valid refresh token', async () => {
      const initial = await service.issueTokens({
        nickname: 'bob',
        deviceId: 'samsung_device_002',
      });

      const renewed = await service.refreshToken({
        refreshToken: initial.refreshToken,
        deviceId: 'samsung_device_002',
      });

      expect(renewed.accessToken).toBeDefined();
      expect(renewed.refreshToken).not.toBe(initial.refreshToken); // Token rotated

      const payload = service.verifyJwt(renewed.accessToken);
      expect(payload.nickname).toBe('bob');
    });

    it('should reject refresh if deviceId does not match', async () => {
      const initial = await service.issueTokens({
        nickname: 'charlie',
        deviceId: 'device_A',
      });

      await expect(
        service.refreshToken({
          refreshToken: initial.refreshToken,
          deviceId: 'device_B_attacker',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject unknown or revoked refresh token', async () => {
      await expect(
        service.refreshToken({
          refreshToken: 'unknown_token_999',
          deviceId: 'device_A',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('revokeToken', () => {
    it('should invalidate refresh token', async () => {
      const tokens = await service.issueTokens({
        nickname: 'dave',
        deviceId: 'device_D',
      });

      expect(service.revokeToken(tokens.refreshToken)).toBe(true);

      await expect(
        service.refreshToken({
          refreshToken: tokens.refreshToken,
          deviceId: 'device_D',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

