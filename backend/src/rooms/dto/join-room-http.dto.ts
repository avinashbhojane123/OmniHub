import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class JoinRoomHttpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/[\r\n\t\0\u200B-\u200D\uFEFF]/g, '').trim()
      : value,
  )
  nickname!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/[\r\n\t\0\u200B-\u200D\uFEFF]/g, '').trim()
      : value,
  )
  passcode!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  deviceType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  deviceModel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  appVersion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  os?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  networkLabel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  batteryLabel?: string;

  @IsBoolean()
  @IsOptional()
  batteryIsCharging?: boolean;

  @IsNumber()
  @IsOptional()
  batteryLevel?: number;
}
