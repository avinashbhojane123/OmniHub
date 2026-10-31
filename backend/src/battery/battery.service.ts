import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatterySettings } from './entities/battery-settings.entity';
import { BatterySession } from './entities/battery-session.entity';
import {
  UpdateBatterySettingsDto,
  CreateBatterySessionDto,
  BatteryAlertEventDto,
} from './dto/battery.dto';

@Injectable()
export class BatteryService {
  private readonly logger = new Logger(BatteryService.name);

  constructor(
    @InjectRepository(BatterySettings)
    private readonly settingsRepo: Repository<BatterySettings>,
    @InjectRepository(BatterySession)
    private readonly sessionRepo: Repository<BatterySession>,
  ) {}

  async getSettings(deviceId: string = 'default_device'): Promise<BatterySettings> {
    let settings = await this.settingsRepo.findOne({ where: { deviceId } });
    if (!settings) {
      settings = this.settingsRepo.create({
        deviceId,
        batteryGuardActive: true,
        fullChargeAlarmEnabled: true,
        fullChargeTarget: 80,
        overchargeFailsafeEnabled: true,
        lowBatteryAlarmEnabled: true,
        lowBatteryTarget: 20,
        criticalLowAlarmEnabled: true,
        tempAlarmEnabled: true,
        tempTarget: 42,
        pluggedAlertEnabled: false,
        unpluggedAlertEnabled: false,
        continuousRingtone: true,
        vibrationEnabled: true,
        soundEnabled: true,
        autoRepeatAlarm: true,
      });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(dto: UpdateBatterySettingsDto): Promise<BatterySettings> {
    const deviceId = dto.deviceId || 'default_device';
    const settings = await this.getSettings(deviceId);

    Object.assign(settings, dto);
    return this.settingsRepo.save(settings);
  }

  async recordSession(dto: CreateBatterySessionDto): Promise<BatterySession> {
    const session = this.sessionRepo.create({
      deviceId: dto.deviceId || 'default_device',
      startTime: dto.startTime,
      endTime: dto.endTime || null,
      startLevel: dto.startLevel,
      endLevel: dto.endLevel ?? null,
      gained: dto.gained ?? 0,
      durationMinutes: dto.durationMinutes ?? 0,
      chargingType: dto.chargingType || 'AC',
      peakTemperature: dto.peakTemperature ?? 0,
      peakWattage: dto.peakWattage ?? 0,
      avgSpeedPerHour: dto.avgSpeedPerHour ?? 0,
    });
    return this.sessionRepo.save(session);
  }

  async getRecentSessions(
    deviceId: string = 'default_device',
    limit: number = 20,
  ): Promise<BatterySession[]> {
    return this.sessionRepo.find({
      where: { deviceId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 50),
    });
  }

  async handleAlertEvent(dto: BatteryAlertEventDto): Promise<{ success: boolean; event: string }> {
    this.logger.warn(
      `[Battery Alert] Device: ${dto.deviceId || 'default'} | Event: ${dto.eventType} | Level: ${dto.level}% | Temp: ${dto.temperature}°C | Message: ${dto.message}`,
    );
    return {
      success: true,
      event: dto.eventType,
    };
  }
}
