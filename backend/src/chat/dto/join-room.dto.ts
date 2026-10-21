import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nickname!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  passcode!: string;

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
  @MaxLength(100)
  browser?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  os?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  networkLabel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  batteryLabel?: string;

  @IsOptional()
  batteryIsCharging?: boolean;

  @IsOptional()
  @IsNumber()
  batteryLevel?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  sessionToken?: string;
}
