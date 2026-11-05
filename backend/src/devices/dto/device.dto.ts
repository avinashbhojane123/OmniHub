import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsArray,
  IsNumber,
} from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  nickname?: string;

  @IsString()
  @IsOptional()
  fcmToken?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceModel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  manufacturer?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  androidVersion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  appVersion?: string;

  @IsString()
  @IsOptional()
  keystorePublicKey?: string;
}

export class BindDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nickname!: string;

  @IsString()
  @IsOptional()
  sessionToken?: string;
}

export class KeystoreChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;
}

export class VerifyKeystoreDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  signature!: string;

  @IsString()
  @IsNotEmpty()
  challenge!: string;
}

export class UpdateFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  fcmToken!: string;
}

export class OfflineSyncActionDto {
  @IsString()
  @IsNotEmpty()
  actionType!: string;

  @IsOptional()
  payload?: any;

  @IsNumber()
  timestamp!: number;
}

export class OfflineSyncDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsNumber()
  lastSyncTimestamp!: number;

  @IsArray()
  @IsOptional()
  queuedActions?: OfflineSyncActionDto[];
}

