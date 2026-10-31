export class UpdateBatterySettingsDto {
  deviceId?: string;
  batteryGuardActive?: boolean;
  fullChargeAlarmEnabled?: boolean;
  fullChargeTarget?: number;
  overchargeFailsafeEnabled?: boolean;
  lowBatteryAlarmEnabled?: boolean;
  lowBatteryTarget?: number;
  criticalLowAlarmEnabled?: boolean;
  tempAlarmEnabled?: boolean;
  tempTarget?: number;
  pluggedAlertEnabled?: boolean;
  unpluggedAlertEnabled?: boolean;
  continuousRingtone?: boolean;
  vibrationEnabled?: boolean;
  soundEnabled?: boolean;
  autoRepeatAlarm?: boolean;
}

export class CreateBatterySessionDto {
  deviceId?: string;
  startTime!: string;
  endTime?: string;
  startLevel!: number;
  endLevel?: number;
  gained?: number;
  durationMinutes?: number;
  chargingType?: string;
  peakTemperature?: number;
  peakWattage?: number;
  avgSpeedPerHour?: number;
}

export class BatteryAlertEventDto {
  deviceId?: string;
  eventType!: 'full_charge' | 'overcharge_100' | 'low_battery' | 'critical_low' | 'overheat';
  level!: number;
  temperature?: number;
  message!: string;
  timestamp!: string;
}
