import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  IssueTokenDto,
  RefreshTokenDto,
  RevokeTokenDto,
  TokenResponseDto,
} from './dto/auth.dto';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Authenticate mobile client and issue Access + Refresh Token pair.
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async issueTokens(@Body() dto: IssueTokenDto): Promise<TokenResponseDto> {
    if (!dto || !dto.nickname || !dto.deviceId) {
      throw new BadRequestException('nickname and deviceId are required');
    }
    return await this.authService.issueTokens(dto);
  }

  /**
   * Renew expired access token using valid refresh token.
   * Called by OkHttp Authenticator upon encountering HTTP 401.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponseDto> {
    if (!dto || !dto.refreshToken || !dto.deviceId) {
      throw new BadRequestException('refreshToken and deviceId are required');
    }
    return await this.authService.refreshToken(dto);
  }

  /**
   * Revoke refresh token on logout or app data reset.
   */
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Body() dto: RevokeTokenDto) {
    if (!dto || !dto.refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }
    const revoked = this.authService.revokeToken(dto.refreshToken);
    return { success: true, revoked };
  }

  /**
   * Verify an active Bearer JWT token.
   */
  @Get('verify')
  async verify(@Headers('authorization') authHeader?: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }
    const token = authHeader.substring(7).trim();
    const payload = this.authService.verifyJwt(token);
    return {
      valid: true,
      nickname: payload.nickname,
      deviceId: payload.deviceId,
      expiresAt: payload.exp,
    };
  }
}

