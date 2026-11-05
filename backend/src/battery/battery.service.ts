import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatterySettings } from './entities/battery-settings.entity';
import { BatterySession } from './entities/battery-session.entity';
import { BatteryAlert } from './entities/battery-alert.entity';
import {
  UpdateBatterySettingsDto,
  CreateBatterySessionDto,
  BatteryAlertEventDto,
} from './dto/battery.dto';

export interface DeviceBatteryStats {
  deviceId: string;
  totalSessions: number;
  completedSessions: number;
  totalGainedPercent: number;
  totalDurationMinutes: number;
  avgSpeedPerHour: number;
  maxPeakTemperature: number;
  maxPeakWattage: number;
  lastSession: BatterySession | null;
}

export interface BatteryAlertResponse {
  success: boolean;
  event: string;
  deviceId: string;
  level: number;
  timestamp: string;
  id?: number;
}

@Injectable()
export class BatteryService {
  private readonly logger = new Logger(BatteryService.name);

  constructor(
    @InjectRepository(BatterySettings)
    private readonly settingsRepo: Repository<BatterySettings>,
    @InjectRepository(BatterySession)
    private readonly sessionRepo: Repository<BatterySession>,
    @Optional()
    @InjectRepository(BatteryAlert)
    private readonly alertRepo?: Repository<BatteryAlert>,
  ) {}

  /**
   * Sanitizes and normalizes device identifiers.
   * Defaults to 'default_device' if empty or invalid, truncated to 100 characters.
   */
  private sanitizeDeviceId(deviceId?: string | null): string {
    if (!deviceId || typeof deviceId !== 'string') {
      return 'default_device';
    }
    const trimmed = deviceId.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 100) : 'default_device';
  }

  /**
   * Sanitizes strings with length bounding to avoid varchar column overflows.
   */
  private sanitizeString(
    val?: string | null,
    maxLength: number = 50,
    fallback: string = '',
  ): string {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed.slice(0, maxLength) : fallback;
  }

  /**
   * Safe boolean parser handling boolean primitives or string representations ('true', 'false', '1', '0').
   */
  private parseBoolean(val: any): boolean | undefined {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return undefined;
  }

  /**
   * Safe integer parser handling number primitives or numeric strings.
   */
  private parseInteger(val: any): number | undefined {
    if (val === undefined || val === null) return undefined;
    const num = Number(val);
    if (!Number.isFinite(num)) return undefined;
    return Math.round(num);
  }

  private getDefaultFullChargeTarget(): number {
    const raw = process.env.DEFAULT_BATTERY_FULL_CHARGE_TARGET;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed >= 50 && parsed <= 100 ? parsed : 80;
  }

  private getDefaultLowBatteryTarget(): number {
    const raw = process.env.DEFAULT_BATTERY_LOW_TARGET;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed >= 5 && parsed <= 50 ? parsed : 20;
  }

  private getDefaultTempTarget(): number {
    const raw = process.env.DEFAULT_BATTERY_TEMP_TARGET;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed >= 30 && parsed <= 80 ? parsed : 42;
  }

  /**
   * Retrieves battery guard settings for a device.
   * Concurrency-safe: handles concurrent initialization races gracefully without duplicate insertions.
   */
  async getSettings(
    deviceId: string = 'default_device',
  ): Promise<BatterySettings> {
    const cleanDeviceId = this.sanitizeDeviceId(deviceId);

    let settings = await this.settingsRepo.findOne({
      where: { deviceId: cleanDeviceId },
      order: { updatedAt: 'DESC' },
    });

    if (!settings) {
      try {
        settings = this.settingsRepo.create({
          deviceId: cleanDeviceId,
          batteryGuardActive: true,
          fullChargeAlarmEnabled: true,
          fullChargeTarget: this.getDefaultFullChargeTarget(),
          overchargeFailsafeEnabled: true,
          lowBatteryAlarmEnabled: true,
          lowBatteryTarget: this.getDefaultLowBatteryTarget(),
          criticalLowAlarmEnabled: true,
          tempAlarmEnabled: true,
          tempTarget: this.getDefaultTempTarget(),
          pluggedAlertEnabled: false,
          unpluggedAlertEnabled: false,
          continuousRingtone: true,
          vibrationEnabled: true,
          soundEnabled: true,
          autoRepeatAlarm: true,
        });
        settings = await this.settingsRepo.save(settings);
      } catch (err) {
        // Handle concurrent insert race condition: retrieve existing record created by the other worker
        const existing = await this.settingsRepo.findOne({
          where: { deviceId: cleanDeviceId },
          order: { updatedAt: 'DESC' },
        });
        if (existing) {
          return existing;
        }
        this.logger.error(
          `Failed to initialize battery settings for device "${cleanDeviceId}": ${err}`,
        );
        throw err;
      }
    }

    return settings;
  }

  /**
   * Updates battery guard settings with explicit whitelist assignment and strict boundary checking.
   * Prevents mass-assignment vulnerabilities, invalid ranges, and cross-threshold conflicts.
   */
  async updateSettings(
    dto: UpdateBatterySettingsDto,
  ): Promise<BatterySettings> {
    const deviceId = this.sanitizeDeviceId(dto.deviceId);
    const settings = await this.getSettings(deviceId);

    let fullChargeTarget = settings.fullChargeTarget;
    let lowBatteryTarget = settings.lowBatteryTarget;

    // Validate fullChargeTarget: 50% - 100%
    const parsedFullTarget = this.parseInteger(dto.fullChargeTarget);
    if (parsedFullTarget !== undefined) {
      if (parsedFullTarget < 50 || parsedFullTarget > 100) {
        throw new BadRequestException(
          'fullChargeTarget must be an integer between 50 and 100%',
        );
      }
      fullChargeTarget = parsedFullTarget;
    }

    // Validate lowBatteryTarget: 5% - 50%
    const parsedLowTarget = this.parseInteger(dto.lowBatteryTarget);
    if (parsedLowTarget !== undefined) {
      if (parsedLowTarget < 5 || parsedLowTarget > 50) {
        throw new BadRequestException(
          'lowBatteryTarget must be an integer between 5 and 50%',
        );
      }
      lowBatteryTarget = parsedLowTarget;
    }

    // Logical cross-validation: lowBatteryTarget must be strictly less than fullChargeTarget
    if (lowBatteryTarget >= fullChargeTarget) {
      throw new BadRequestException(
        `lowBatteryTarget (${lowBatteryTarget}%) must be strictly less than fullChargeTarget (${fullChargeTarget}%)`,
      );
    }

    // Validate tempTarget: 30°C - 80°C
    const parsedTempTarget = this.parseInteger(dto.tempTarget);
    if (parsedTempTarget !== undefined) {
      if (parsedTempTarget < 30 || parsedTempTarget > 80) {
        throw new BadRequestException(
          'tempTarget must be an integer between 30 and 80°C',
        );
      }
      settings.tempTarget = parsedTempTarget;
    }

    settings.fullChargeTarget = fullChargeTarget;
    settings.lowBatteryTarget = lowBatteryTarget;

    // Whitelist boolean property updates strictly checking type to prevent null DB violations
    const guard = this.parseBoolean(dto.batteryGuardActive);
    if (guard !== undefined) settings.batteryGuardActive = guard;

    const fullAlarm = this.parseBoolean(dto.fullChargeAlarmEnabled);
    if (fullAlarm !== undefined) settings.fullChargeAlarmEnabled = fullAlarm;

    const overcharge = this.parseBoolean(dto.overchargeFailsafeEnabled);
    if (overcharge !== undefined) settings.overchargeFailsafeEnabled = overcharge;

    const lowAlarm = this.parseBoolean(dto.lowBatteryAlarmEnabled);
    if (lowAlarm !== undefined) settings.lowBatteryAlarmEnabled = lowAlarm;

    const critLow = this.parseBoolean(dto.criticalLowAlarmEnabled);
    if (critLow !== undefined) settings.criticalLowAlarmEnabled = critLow;

    const tempAlarm = this.parseBoolean(dto.tempAlarmEnabled);
    if (tempAlarm !== undefined) settings.tempAlarmEnabled = tempAlarm;

    const plugged = this.parseBoolean(dto.pluggedAlertEnabled);
    if (plugged !== undefined) settings.pluggedAlertEnabled = plugged;

    const unplugged = this.parseBoolean(dto.unpluggedAlertEnabled);
    if (unplugged !== undefined) settings.unpluggedAlertEnabled = unplugged;

    const ring = this.parseBoolean(dto.continuousRingtone);
    if (ring !== undefined) settings.continuousRingtone = ring;

    const vib = this.parseBoolean(dto.vibrationEnabled);
    if (vib !== undefined) settings.vibrationEnabled = vib;

    const snd = this.parseBoolean(dto.soundEnabled);
    if (snd !== undefined) settings.soundEnabled = snd;

    const repeat = this.parseBoolean(dto.autoRepeatAlarm);
    if (repeat !== undefined) settings.autoRepeatAlarm = repeat;

    return this.settingsRepo.save(settings);
  }

  /**
   * Resets device battery settings to factory safe defaults.
   */
  async resetSettings(
    deviceId: string = 'default_device',
  ): Promise<BatterySettings> {
    const cleanDeviceId = this.sanitizeDeviceId(deviceId);
    const settings = await this.getSettings(cleanDeviceId);

    settings.batteryGuardActive = true;
    settings.fullChargeAlarmEnabled = true;
    settings.fullChargeTarget = this.getDefaultFullChargeTarget();
    settings.overchargeFailsafeEnabled = true;
    settings.lowBatteryAlarmEnabled = true;
    settings.lowBatteryTarget = this.getDefaultLowBatteryTarget();
    settings.criticalLowAlarmEnabled = true;
    settings.tempAlarmEnabled = true;
    settings.tempTarget = this.getDefaultTempTarget();
    settings.pluggedAlertEnabled = false;
    settings.unpluggedAlertEnabled = false;
    settings.continuousRingtone = true;
    settings.vibrationEnabled = true;
    settings.soundEnabled = true;
    settings.autoRepeatAlarm = true;

    return this.settingsRepo.save(settings);
  }

  /**
   * Records or updates a battery charging session.
   * Features:
   * - Idempotency: updates existing session if (deviceId, startTime) already exists
   * - Auto-derivation of gained %, durationMinutes, and avgSpeedPerHour
   * - Level clamping (0-100) and ISO timestamp validation
   */
  async recordSession(dto: CreateBatterySessionDto): Promise<BatterySession> {
    const deviceId = this.sanitizeDeviceId(dto.deviceId);

    // Validate startTime
    if (
      !dto.startTime ||
      typeof dto.startTime !== 'string' ||
      isNaN(new Date(dto.startTime).getTime())
    ) {
      throw new BadRequestException('Valid startTime ISO string is required');
    }
    const startTime = dto.startTime.trim().slice(0, 50);

    // Validate endTime
    let endTime: string | null = null;
    if (dto.endTime && typeof dto.endTime === 'string') {
      if (isNaN(new Date(dto.endTime).getTime())) {
        throw new BadRequestException('Invalid endTime ISO string');
      }
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(dto.endTime).getTime();
      if (endMs < startMs) {
        throw new BadRequestException(
          'endTime cannot be earlier than startTime',
        );
      }
      endTime = dto.endTime.trim().slice(0, 50);
    }

    // Validate startLevel
    if (
      !Number.isFinite(dto.startLevel) ||
      dto.startLevel < 0 ||
      dto.startLevel > 100
    ) {
      throw new BadRequestException(
        'startLevel must be a number between 0 and 100',
      );
    }
    const startLevel = Math.round(Math.max(0, Math.min(100, dto.startLevel)));

    // Validate endLevel
    let endLevel: number | null = null;
    if (dto.endLevel !== undefined && dto.endLevel !== null) {
      if (
        !Number.isFinite(dto.endLevel) ||
        dto.endLevel < 0 ||
        dto.endLevel > 100
      ) {
        throw new BadRequestException(
          'endLevel must be a number between 0 and 100',
        );
      }
      endLevel = Math.round(Math.max(0, Math.min(100, dto.endLevel)));
    }

    // Auto-compute gained % if missing or 0
    let gained = 0;
    if (Number.isFinite(dto.gained) && dto.gained! > 0) {
      gained = Math.round(dto.gained!);
    } else if (endLevel !== null) {
      gained = Math.max(0, endLevel - startLevel);
    }

    // Auto-compute durationMinutes if missing or 0
    let durationMinutes = 0;
    if (Number.isFinite(dto.durationMinutes) && dto.durationMinutes! > 0) {
      durationMinutes = Math.round(dto.durationMinutes!);
    } else if (endTime !== null) {
      const durationMs =
        new Date(endTime).getTime() - new Date(startTime).getTime();
      durationMinutes = Math.max(1, Math.round(durationMs / 60000));
    }

    // Auto-compute avgSpeedPerHour if missing or 0
    let avgSpeedPerHour = 0;
    if (Number.isFinite(dto.avgSpeedPerHour) && dto.avgSpeedPerHour! > 0) {
      avgSpeedPerHour = Math.round(dto.avgSpeedPerHour! * 10) / 10;
    } else if (durationMinutes > 0 && gained > 0) {
      avgSpeedPerHour = Math.round((gained / (durationMinutes / 60)) * 10) / 10;
    }

    const chargingType = this.sanitizeString(dto.chargingType, 30, 'AC');
    // Allow sub-zero battery temperatures down to -30°C for cold climates
    const peakTemperature = Number.isFinite(dto.peakTemperature)
      ? Math.max(-30, Math.min(100, Math.round(dto.peakTemperature! * 10) / 10))
      : 0;
    const peakWattage = Number.isFinite(dto.peakWattage)
      ? Math.max(0, Math.round(dto.peakWattage! * 10) / 10)
      : 0;

    // Deduplication check: if session with same deviceId and startTime exists, update it
    let session = await this.sessionRepo.findOne({
      where: { deviceId, startTime },
    });

    if (session) {
      session.endTime = endTime ?? session.endTime;
      session.endLevel = endLevel ?? session.endLevel;
      session.gained = Math.max(session.gained, gained);
      session.durationMinutes = Math.max(
        session.durationMinutes,
        durationMinutes,
      );
      session.chargingType = chargingType || session.chargingType;
      session.peakTemperature = Math.max(
        session.peakTemperature,
        peakTemperature,
      );
      session.peakWattage = Math.max(session.peakWattage, peakWattage);
      session.avgSpeedPerHour =
        avgSpeedPerHour > 0 ? avgSpeedPerHour : session.avgSpeedPerHour;
      return this.sessionRepo.save(session);
    }

    session = this.sessionRepo.create({
      deviceId,
      startTime,
      endTime,
      startLevel,
      endLevel,
      gained,
      durationMinutes,
      chargingType,
      peakTemperature,
      peakWattage,
      avgSpeedPerHour,
    });

    return this.sessionRepo.save(session);
  }

  /**
   * Retrieves recent charging sessions for a device with bounded pagination.
   * Safe against NaN or negative limit/offset values.
   */
  async getRecentSessions(
    deviceId: string = 'default_device',
    limit: number = 20,
    offset: number = 0,
  ): Promise<BatterySession[]> {
    const cleanDeviceId = this.sanitizeDeviceId(deviceId);
    const defaultLimit =
      Number(process.env.BATTERY_SESSIONS_DEFAULT_LIMIT) || 20;
    const maxLimit =
      Number(process.env.BATTERY_SESSIONS_MAX_LIMIT) || 100;
    const safeLimit = Math.max(
      1,
      Math.min(
        Number.isFinite(limit) ? Math.floor(limit) : defaultLimit,
        maxLimit,
      ),
    );
    const safeOffset = Math.max(
      0,
      Number.isFinite(offset) ? Math.floor(offset) : 0,
    );

    return this.sessionRepo.find({
      where: { deviceId: cleanDeviceId },
      order: { startTime: 'DESC', createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
  }

  /**
   * Retrieves a specific session by primary key ID and optional device ownership verification.
   */
  async getSessionById(id: number, deviceId?: string): Promise<BatterySession> {
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Valid positive session ID is required');
    }
    const where: any = { id };
    if (deviceId) {
      where.deviceId = this.sanitizeDeviceId(deviceId);
    }
    const session = await this.sessionRepo.findOne({ where });
    if (!session) {
      throw new NotFoundException(`Battery session with ID ${id} not found`);
    }
    return session;
  }

  /**
   * Deletes a specific session.
   */
  async deleteSession(
    id: number,
    deviceId?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('Valid positive session ID is required');
    }
    const session = await this.getSessionById(id, deviceId);
    await this.sessionRepo.remove(session);
    return {
      success: true,
      message: `Session ${id} deleted successfully`,
    };
  }

  /**
   * Clears all session records for a device.
   */
  async clearSessions(
    deviceId: string = 'default_device',
  ): Promise<{ deleted: number }> {
    const cleanDeviceId = this.sanitizeDeviceId(deviceId);
    const result = await this.sessionRepo.delete({ deviceId: cleanDeviceId });
    return {
      deleted: result.affected ?? 0,
    };
  }

  /**
   * Aggregates battery telemetry metrics for a device.
   */
  async getDeviceStats(
    deviceId: string = 'default_device',
  ): Promise<DeviceBatteryStats> {
    const cleanDeviceId = this.sanitizeDeviceId(deviceId);
    const sessions = await this.sessionRepo.find({
      where: { deviceId: cleanDeviceId },
      order: { startTime: 'DESC' },
    });

    const totalSessions = sessions.length;
    let completedSessions = 0;
    let totalGainedPercent = 0;
    let totalDurationMinutes = 0;
    let speedSum = 0;
    let speedCount = 0;
    let maxPeakTemperature: number | null = null;
    let maxPeakWattage = 0;

    for (const s of sessions) {
      if (s.endTime !== null && s.endLevel !== null) {
        completedSessions++;
      }
      totalGainedPercent += s.gained || 0;
      totalDurationMinutes += s.durationMinutes || 0;
      if (s.avgSpeedPerHour && s.avgSpeedPerHour > 0) {
        speedSum += s.avgSpeedPerHour;
        speedCount++;
      }
      if (
        s.peakTemperature !== null &&
        s.peakTemperature !== undefined &&
        Number.isFinite(s.peakTemperature)
      ) {
        if (
          maxPeakTemperature === null ||
          s.peakTemperature > maxPeakTemperature
        ) {
          maxPeakTemperature = s.peakTemperature;
        }
      }
      if (s.peakWattage && s.peakWattage > maxPeakWattage) {
        maxPeakWattage = s.peakWattage;
      }
    }

    const avgSpeedPerHour =
      speedCount > 0 ? Math.round((speedSum / speedCount) * 10) / 10 : 0;

    return {
      deviceId: cleanDeviceId,
      totalSessions,
      completedSessions,
      totalGainedPercent,
      totalDurationMinutes,
      avgSpeedPerHour,
      maxPeakTemperature: maxPeakTemperature !== null ? maxPeakTemperature : 0,
      maxPeakWattage,
      lastSession: sessions[0] || null,
    };
  }

  /**
   * Handles incoming battery guard alert events:
   * - Validates eventType and battery level (0-100)
   * - Sanitizes temperature (preventing NaN in float DB columns)
   * - Logs with appropriate severity level (error/warn/log)
   * - Persists alert record to database
   * - Returns structured acknowledgement
   */
  async handleAlertEvent(
    dto: BatteryAlertEventDto,
  ): Promise<BatteryAlertResponse> {
    const allowedEvents = [
      'full_charge',
      'overcharge_100',
      'low_battery',
      'critical_low',
      'overheat',
    ];
    if (!dto.eventType || !allowedEvents.includes(dto.eventType)) {
      throw new BadRequestException(
        `Invalid eventType. Must be one of: ${allowedEvents.join(', ')}`,
      );
    }

    const deviceId = this.sanitizeDeviceId(dto.deviceId);
    const timestamp =
      dto.timestamp &&
      typeof dto.timestamp === 'string' &&
      !isNaN(new Date(dto.timestamp).getTime())
        ? dto.timestamp
        : new Date().toISOString();

    const level = Number.isFinite(dto.level)
      ? Math.max(0, Math.min(100, Math.round(dto.level)))
      : 0;

    // Guard against NaN in float columns
    const validTemp =
      dto.temperature !== undefined &&
      dto.temperature !== null &&
      Number.isFinite(Number(dto.temperature))
        ? Math.round(Number(dto.temperature) * 10) / 10
        : null;
    const tempStr = validTemp !== null ? `${validTemp}°C` : 'N/A';
    const message = this.sanitizeString(
      dto.message,
      255,
      'Battery Alert Triggered',
    );

    const logMessage = `[Battery Alert] Device: ${deviceId} | Event: ${dto.eventType} | Level: ${level}% | Temp: ${tempStr} | Message: ${message}`;
    if (dto.eventType === 'overheat' || dto.eventType === 'critical_low') {
      this.logger.error(logMessage);
    } else if (
      dto.eventType === 'overcharge_100' ||
      dto.eventType === 'low_battery'
    ) {
      this.logger.warn(logMessage);
    } else {
      this.logger.log(logMessage);
    }

    let savedId: number | undefined;
    if (this.alertRepo) {
      try {
        const alert = this.alertRepo.create({
          deviceId,
          eventType: dto.eventType,
          level,
          temperature: validTemp,
          message,
          timestamp,
        });
        const saved = await this.alertRepo.save(alert);
        savedId = saved.id;
      } catch (err) {
        this.logger.warn(`Failed to persist battery alert record: ${err}`);
      }
    }

    return {
      success: true,
      event: dto.eventType,
      deviceId,
      level,
      timestamp,
      ...(savedId !== undefined ? { id: savedId } : {}),
    };
  }

  /**
   * Retrieves recent battery alerts for a device with bounded pagination.
   */
  async getRecentAlerts(
    deviceId: string = 'default_device',
    limit: number = 20,
    offset: number = 0,
  ): Promise<BatteryAlert[]> {
    if (!this.alertRepo) return [];
    const cleanDeviceId = this.sanitizeDeviceId(deviceId);
    const defaultLimit =
      Number(process.env.BATTERY_SESSIONS_DEFAULT_LIMIT) || 20;
    const maxLimit =
      Number(process.env.BATTERY_SESSIONS_MAX_LIMIT) || 100;
    const safeLimit = Math.max(
      1,
      Math.min(
        Number.isFinite(limit) ? Math.floor(limit) : defaultLimit,
        maxLimit,
      ),
    );
    const safeOffset = Math.max(
      0,
      Number.isFinite(offset) ? Math.floor(offset) : 0,
    );

    return this.alertRepo.find({
      where: { deviceId: cleanDeviceId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
  }

  /**
   * Clears alerts for a device.
   */
  async clearAlerts(
    deviceId: string = 'default_device',
  ): Promise<{ deleted: number }> {
    if (!this.alertRepo) return { deleted: 0 };
    const cleanDeviceId = this.sanitizeDeviceId(deviceId);
    const result = await this.alertRepo.delete({ deviceId: cleanDeviceId });
    return {
      deleted: result.affected ?? 0,
    };
  }
}
