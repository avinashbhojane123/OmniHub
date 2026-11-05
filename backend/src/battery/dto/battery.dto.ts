import {
  IsOptional,
  IsBoolean,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

export class UpdateBatterySettingsDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsBoolean()
  batteryGuardActive?: boolean;

  @IsOptional()
  @IsBoolean()
  fullChargeAlarmEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  fullChargeTarget?: number;

  @IsOptional()
  @IsBoolean()
  overchargeFailsafeEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  lowBatteryAlarmEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  lowBatteryTarget?: number;

  @IsOptional()
  @IsBoolean()
  criticalLowAlarmEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  tempAlarmEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  tempTarget?: number;

  @IsOptional()
  @IsBoolean()
  pluggedAlertEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  unpluggedAlertEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  continuousRingtone?: boolean;

  @IsOptional()
  @IsBoolean()
  vibrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoRepeatAlarm?: boolean;

  @IsOptional()
  id?: any;

  @IsOptional()
  createdAt?: any;

  @IsOptional()
  updatedAt?: any;
}

export class CreateBatterySessionDto {
  @IsOptional()
  id?: any;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsNotEmpty()
  @IsString()
  startTime!: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsNotEmpty()
  @IsNumber()
  startLevel!: number;

  @IsOptional()
  @IsNumber()
  endLevel?: number;

  @IsOptional()
  @IsNumber()
  gained?: number;

  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  chargingType?: string;

  @IsOptional()
  @IsNumber()
  peakTemperature?: number;

  @IsOptional()
  @IsNumber()
  peakWattage?: number;

  @IsOptional()
  @IsNumber()
  avgSpeedPerHour?: number;
}

export class BatteryAlertEventDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsNotEmpty()
  @IsIn([
    'full_charge',
    'overcharge_100',
    'low_battery',
    'critical_low',
    'overheat',
  ])
  eventType!:
    | 'full_charge'
    | 'overcharge_100'
    | 'low_battery'
    | 'critical_low'
    | 'overheat';

  @IsNotEmpty()
  @IsNumber()
  level!: number;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsNotEmpty()
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
