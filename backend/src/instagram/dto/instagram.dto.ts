import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class InstagramPreviewDto {
  @IsNotEmpty({ message: 'Query parameter "url" is required' })
  @IsString({ message: 'Query parameter "url" must be a string' })
  @MaxLength(2048, { message: 'URL exceeds maximum length of 2048 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  url!: string;
}

export class InstagramProxyDto {
  @IsNotEmpty({ message: 'Query parameter "url" is required' })
  @IsString({ message: 'Query parameter "url" must be a string' })
  @MaxLength(4096, { message: 'URL exceeds maximum length of 4096 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  url!: string;
}

export class InstagramSessionKeyDto {
  @IsOptional()
  @IsString({ message: 'sessionId must be a string' })
  @MaxLength(500, { message: 'sessionId exceeds maximum length of 500 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  sessionId?: string;

  @IsOptional()
  @IsString({ message: 'adminSecret must be a string' })
  @MaxLength(256, { message: 'adminSecret exceeds maximum length of 256 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  adminSecret?: string;
}

export interface InstagramSessionStatusResponse {
  configured: boolean;
}

export interface InstagramSessionKeyResponse {
  success: boolean;
  configured: boolean;
  cleared?: boolean;
}

