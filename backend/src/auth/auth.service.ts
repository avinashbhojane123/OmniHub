import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IssueTokenDto,
  RefreshTokenDto,
  TokenResponseDto,
} from './dto/auth.dto';

interface JwtPayload {
  sub: string;
  nickname: string;
  deviceId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokens = new Map<
    string,
    { nickname: string; deviceId: string; expiresAt: number }
  >();

  private getSecret(): string {
    return (
      process.env.JWT_SECRET ||
      process.env.APP_SECRET ||
      'omnihub_android_mobile_secure_jwt_secret_key_2026'
    );
  }

  private base64UrlEncode(data: string | Buffer): string {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return buf
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Create a signed HMAC-SHA256 JWT access token.
   */
  private createJwt(payload: JwtPayload): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', this.getSecret())
      .update(signatureInput)
      .digest();
    const encodedSignature = this.base64UrlEncode(signature);

    return `${signatureInput}.${encodedSignature}`;
  }

  /**
   * Verify and parse an incoming HMAC-SHA256 JWT access token.
   */
  verifyJwt(token: string): JwtPayload {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Token is required');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed JWT token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = this.base64UrlEncode(
      crypto
        .createHmac('sha256', this.getSecret())
        .update(signatureInput)
        .digest(),
    );

    if (
      !crypto.timingSafeEqual(
        Buffer.from(encodedSignature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8'),
      )
    ) {
      throw new UnauthorizedException('Invalid JWT signature');
    }

    try {
      const payload: JwtPayload = JSON.parse(
        this.base64UrlDecode(encodedPayload),
      );
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        throw new UnauthorizedException('JWT access token expired');
      }
      return payload;
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid JWT payload format');
    }
  }

  /**
   * Authenticate mobile client and issue Access + Refresh Token pair.
   */
  async issueTokens(dto: IssueTokenDto): Promise<TokenResponseDto> {
    const cleanNick = dto.nickname.trim();
    const cleanDeviceId = dto.deviceId.trim();

    if (!cleanNick || !cleanDeviceId) {
      throw new BadRequestException('Nickname and deviceId are required');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 900; // 15 minutes access token

    const payload: JwtPayload = {
      sub: `${cleanNick}_${cleanDeviceId}`,
      nickname: cleanNick,
      deviceId: cleanDeviceId,
      iat: now,
      exp: now + expiresIn,
    };

    const accessToken = this.createJwt(payload);
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

    this.refreshTokens.set(refreshToken, {
      nickname: cleanNick,
      deviceId: cleanDeviceId,
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      issuedAt: now,
    };
  }

  /**
   * Renew expired access token using valid refresh token (OkHttp Authenticator hook).
   */
  async refreshToken(dto: RefreshTokenDto): Promise<TokenResponseDto> {
    const cleanToken = dto.refreshToken.trim();
    const cleanDeviceId = dto.deviceId.trim();

    const stored = this.refreshTokens.get(cleanToken);
    if (!stored) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    if (stored.deviceId !== cleanDeviceId) {
      this.refreshTokens.delete(cleanToken);
      throw new UnauthorizedException(
        'Refresh token device mismatch. Token invalidated.',
      );
    }

    if (Date.now() > stored.expiresAt) {
      this.refreshTokens.delete(cleanToken);
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Refresh token rotation
    this.refreshTokens.delete(cleanToken);
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    this.refreshTokens.set(newRefreshToken, {
      nickname: stored.nickname,
      deviceId: stored.deviceId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 900; // 15 minutes

    const payload: JwtPayload = {
      sub: `${stored.nickname}_${stored.deviceId}`,
      nickname: stored.nickname,
      deviceId: stored.deviceId,
      iat: now,
      exp: now + expiresIn,
    };

    const accessToken = this.createJwt(payload);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn,
      issuedAt: now,
    };
  }

  /**
   * Revoke a refresh token on user logout or device unbinding.
   */
  revokeToken(refreshToken: string): boolean {
    if (!refreshToken) return false;
    return this.refreshTokens.delete(refreshToken.trim());
  }
}

