import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockService = {
      issueTokens: jest.fn().mockResolvedValue({
        accessToken: 'mock_jwt_access_token',
        refreshToken: 'mock_refresh_token',
        tokenType: 'Bearer',
        expiresIn: 900,
        issuedAt: Date.now(),
      }),
      refreshToken: jest.fn().mockResolvedValue({
        accessToken: 'renewed_jwt_token',
        refreshToken: 'new_refresh_token',
        tokenType: 'Bearer',
        expiresIn: 900,
        issuedAt: Date.now(),
      }),
      revokeToken: jest.fn().mockReturnValue(true),
      verifyJwt: jest.fn().mockReturnValue({
        sub: 'alice_dev1',
        nickname: 'alice',
        deviceId: 'dev1',
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should issue tokens for Android client', async () => {
    const result = await controller.issueTokens({
      nickname: 'alice',
      deviceId: 'dev1',
    });
    expect(result.accessToken).toBe('mock_jwt_access_token');
    expect(service.issueTokens).toHaveBeenCalled();
  });

  it('should refresh tokens via OkHttp Authenticator', async () => {
    const result = await controller.refresh({
      refreshToken: 'mock_refresh_token',
      deviceId: 'dev1',
    });
    expect(result.accessToken).toBe('renewed_jwt_token');
    expect(service.refreshToken).toHaveBeenCalled();
  });

  it('should revoke token', async () => {
    const result = await controller.revoke({ refreshToken: 'mock_refresh_token' });
    expect(result.success).toBe(true);
    expect(result.revoked).toBe(true);
  });

  it('should verify Bearer token', async () => {
    const result = await controller.verify('Bearer valid_jwt_token');
    expect(result.valid).toBe(true);
    expect(result.nickname).toBe('alice');
  });

  it('should reject verify without Bearer token', async () => {
    await expect(controller.verify('invalid_header')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

