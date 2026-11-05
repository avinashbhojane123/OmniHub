import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class IssueTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nickname!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsOptional()
  sessionToken?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;
}

export class RevokeTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  issuedAt: number;
}

