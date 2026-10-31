import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsObject,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nickname?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  message!: string;

  @IsOptional()
  @IsObject()
  replyTo?: {
    id?: number | string;
    nickname: string;
    message: string;
  } | null;

  @IsString()
  @IsOptional()
  fileUrl?: string | null;

  @IsString()
  @IsOptional()
  fileName?: string | null;

  @IsString()
  @IsOptional()
  fileType?: string | null;

  @IsOptional()
  fileSize?: number | string | null;

  @IsOptional()
  isVoiceNote?: boolean;

  @IsOptional()
  isVideoNote?: boolean;

  @IsOptional()
  isWithoutSound?: boolean;

  @IsOptional()
  expiresIn?: number | null;

  @IsOptional()
  pollData?: any;

  @IsOptional()
  locationData?: { lat: number; lng: number } | null;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsString()
  tempId?: string | null;
}

export class SendDirectMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  targetNickname!: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  message!: string;

  @IsString()
  @IsOptional()
  fileUrl?: string | null;

  @IsString()
  @IsOptional()
  fileName?: string | null;

  @IsString()
  @IsOptional()
  fileType?: string | null;

  @IsOptional()
  fileSize?: number | string | null;

  @IsOptional()
  isVoiceNote?: boolean;

  @IsOptional()
  isVideoNote?: boolean;

  @IsOptional()
  isWithoutSound?: boolean;

  @IsOptional()
  expiresIn?: number | null;

  @IsOptional()
  @IsString()
  tempId?: string | null;
}
