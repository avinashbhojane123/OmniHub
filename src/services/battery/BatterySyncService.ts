import { Platform } from 'react-native';
import { BatteryAlarmSettings } from './BatteryService';
import { batteryRepository, BatterySessionRecord } from '../../database/repositories/BatteryRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';

export interface BatterySyncSessionPayload {
  startTime: string;
  endTime?: string | null;
  startLevel: number;
  endLevel?: number | null;
  gained?: number;
  durationMinutes?: number;
  chargingType?: string;
  peakTemperature?: number;
  peakWattage?: number;
  avgSpeedPerHour?: number;
}

export interface BatteryAlertPayload {
  eventType: 'full_charge' | 'overcharge_100' | 'low_battery' | 'critical_low' | 'overheat';
  level: number;
  temperature?: number;
  message: string;
  timestamp?: string;
}

export class BatterySyncService {
  private static instance: BatterySyncService;

  public static readonly SETTINGS_KEY_SERVER = 'battery_backend_server_url';
  public static readonly SETTINGS_KEY_DEVICE_ID = 'battery_device_id';

  // Default server url based on platform
  private backendUrl: string =
    Platform.OS === 'android' ? 'http://10.0.2.2:10000' : 'http://localhost:10000';

  private cachedDeviceId: string | null = null;

  public static getInstance(): BatterySyncService {
    if (!BatterySyncService.instance) {
      BatterySyncService.instance = new BatterySyncService();
    }
    return BatterySyncService.instance;
  }

  public async getBackendUrl(): Promise<string> {
    try {
      const saved = await settingsRepository.get(BatterySyncService.SETTINGS_KEY_SERVER, '');
      if (saved && saved.trim().length > 0) {
        this.backendUrl = this.normalizeUrl(saved);
        return this.backendUrl;
      }

      // Check task backend sync server url
      const taskBackendUrl = await settingsRepository.get('task_backend_server_url', '');
      if (taskBackendUrl && taskBackendUrl.trim().length > 0) {
        this.backendUrl = this.normalizeUrl(taskBackendUrl);
        return this.backendUrl;
      }

      // Check OTA server URL as fallback and adapt port to 10000
      const otaUrl = await settingsRepository.get('ota_server_url', '');
      if (otaUrl && otaUrl.trim().length > 0) {
        const cleanOta = this.normalizeUrl(otaUrl);
        const replaced = cleanOta.replace(/:\d+$/, ':10000');
        this.backendUrl = replaced;
        return replaced;
      }
    } catch {
      // Use fallback default
    }
    return this.backendUrl;
  }

  public setBackendUrl(url: string): void {
    if (url && url.trim().length > 0) {
      const clean = this.normalizeUrl(url);
      this.backendUrl = clean;
      settingsRepository.set(BatterySyncService.SETTINGS_KEY_SERVER, clean).catch((err) => {
        console.warn('Failed to persist battery backend URL:', err);
      });
    }
  }

  public async setBackendUrlAsync(url: string): Promise<void> {
    if (url && url.trim().length > 0) {
      const clean = this.normalizeUrl(url);
      this.backendUrl = clean;
      await settingsRepository.set(BatterySyncService.SETTINGS_KEY_SERVER, clean);
    }
  }

  public async getDeviceId(): Promise<string> {
    if (this.cachedDeviceId) {
      return this.cachedDeviceId;
    }

    try {
      const savedId = await settingsRepository.get(BatterySyncService.SETTINGS_KEY_DEVICE_ID, '');
      if (savedId && savedId.trim().length > 0) {
        this.cachedDeviceId = savedId.trim();
        return this.cachedDeviceId;
      }

      // Generate a stable unique device ID
      const newId = `${Platform.OS}_device_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      this.cachedDeviceId = newId;
      await settingsRepository.set(BatterySyncService.SETTINGS_KEY_DEVICE_ID, newId);
      return newId;
    } catch {
      return `${Platform.OS}_default_device`;
    }
  }

  public async setDeviceId(id: string): Promise<void> {
    if (id && id.trim().length > 0) {
      this.cachedDeviceId = id.trim();
      await settingsRepository.set(BatterySyncService.SETTINGS_KEY_DEVICE_ID, this.cachedDeviceId);
    }
  }

  private normalizeUrl(url: string): string {
    let clean = url.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean;
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async testConnection(): Promise<{ success: boolean; message: string; url: string }> {
    const baseUrl = await this.getBackendUrl();
    const deviceId = await this.getDeviceId();
    try {
      const response = await this.fetchWithTimeout(
        `${baseUrl}/api/battery/settings?deviceId=${encodeURIComponent(deviceId)}`,
        { method: 'GET' },
        4000
      );

      if (response.ok) {
        return { success: true, message: 'Connected to battery backend server.', url: baseUrl };
      }
      return { success: false, message: `Server returned HTTP ${response.status}`, url: baseUrl };
    } catch (err: any) {
      return {
        success: false,
        message: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Network error'),
        url: baseUrl,
      };
    }
  }

  public async syncSettingsToCloud(settings: BatteryAlarmSettings): Promise<boolean> {
    try {
      const baseUrl = await this.getBackendUrl();
      const deviceId = await this.getDeviceId();

      const response = await this.fetchWithTimeout(`${baseUrl}/api/battery/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          ...settings,
        }),
      });
      return response.ok;
    } catch {
      // Local-first: failure is non-blocking
      return false;
    }
  }

  public async fetchSettingsFromCloud(): Promise<Partial<BatteryAlarmSettings> | null> {
    try {
      const baseUrl = await this.getBackendUrl();
      const deviceId = await this.getDeviceId();

      const response = await this.fetchWithTimeout(
        `${baseUrl}/api/battery/settings?deviceId=${encodeURIComponent(deviceId)}`,
        { method: 'GET' }
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || typeof data !== 'object') return null;

      const result: Partial<BatteryAlarmSettings> = {};
      if (typeof data.batteryGuardActive === 'boolean') result.batteryGuardActive = data.batteryGuardActive;
      if (typeof data.fullChargeAlarmEnabled === 'boolean') result.fullChargeAlarmEnabled = data.fullChargeAlarmEnabled;
      if (typeof data.fullChargeTarget === 'number') result.fullChargeTarget = data.fullChargeTarget;
      if (typeof data.overchargeFailsafeEnabled === 'boolean') result.overchargeFailsafeEnabled = data.overchargeFailsafeEnabled;
      if (typeof data.lowBatteryAlarmEnabled === 'boolean') result.lowBatteryAlarmEnabled = data.lowBatteryAlarmEnabled;
      if (typeof data.lowBatteryTarget === 'number') result.lowBatteryTarget = data.lowBatteryTarget;
      if (typeof data.criticalLowAlarmEnabled === 'boolean') result.criticalLowAlarmEnabled = data.criticalLowAlarmEnabled;
      if (typeof data.tempAlarmEnabled === 'boolean') result.tempAlarmEnabled = data.tempAlarmEnabled;
      if (typeof data.tempTarget === 'number') result.tempTarget = data.tempTarget;
      if (typeof data.pluggedAlertEnabled === 'boolean') result.pluggedAlertEnabled = data.pluggedAlertEnabled;
      if (typeof data.unpluggedAlertEnabled === 'boolean') result.unpluggedAlertEnabled = data.unpluggedAlertEnabled;
      if (typeof data.continuousRingtone === 'boolean') result.continuousRingtone = data.continuousRingtone;
      if (typeof data.vibrationEnabled === 'boolean') result.vibrationEnabled = data.vibrationEnabled;
      if (typeof data.soundEnabled === 'boolean') result.soundEnabled = data.soundEnabled;
      if (typeof data.autoRepeatAlarm === 'boolean') result.autoRepeatAlarm = data.autoRepeatAlarm;

      return result;
    } catch {
      return null;
    }
  }

  public async syncSessionToCloud(session: BatterySyncSessionPayload): Promise<boolean> {
    try {
      const baseUrl = await this.getBackendUrl();
      const deviceId = await this.getDeviceId();

      const response = await this.fetchWithTimeout(`${baseUrl}/api/battery/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          startTime: session.startTime,
          endTime: session.endTime ?? null,
          startLevel: session.startLevel,
          endLevel: session.endLevel ?? null,
          gained: session.gained ?? 0,
          durationMinutes: session.durationMinutes ?? 0,
          chargingType: session.chargingType || 'AC',
          peakTemperature: session.peakTemperature ?? 0,
          peakWattage: session.peakWattage ?? 0,
          avgSpeedPerHour: session.avgSpeedPerHour ?? 0,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async getRecentSessionsFromCloud(limit: number = 20): Promise<BatterySessionRecord[]> {
    try {
      const baseUrl = await this.getBackendUrl();
      const deviceId = await this.getDeviceId();

      const response = await this.fetchWithTimeout(
        `${baseUrl}/api/battery/sessions?deviceId=${encodeURIComponent(deviceId)}&limit=${limit}`,
        { method: 'GET' }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /**
   * Syncs completed SQLite sessions that were recorded locally while offline
   */
  public async syncPendingSessions(limit: number = 20): Promise<number> {
    try {
      const localSessions = await batteryRepository.getRecentSessions(limit);
      if (!localSessions || localSessions.length === 0) return 0;

      let syncedCount = 0;
      for (const sess of localSessions) {
        const ok = await this.syncSessionToCloud({
          startTime: sess.startTime,
          endTime: sess.endTime,
          startLevel: sess.startLevel,
          endLevel: sess.endLevel,
          gained: sess.gained,
          durationMinutes: sess.durationMinutes,
          chargingType: sess.chargingType,
          peakTemperature: sess.peakTemperature,
          peakWattage: sess.peakWattage,
          avgSpeedPerHour: sess.avgSpeedPerHour,
        });
        if (ok) syncedCount++;
      }
      return syncedCount;
    } catch {
      return 0;
    }
  }

  public async logAlertToCloud(event: BatteryAlertPayload): Promise<boolean> {
    try {
      const baseUrl = await this.getBackendUrl();
      const deviceId = await this.getDeviceId();

      const response = await this.fetchWithTimeout(`${baseUrl}/api/battery/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          timestamp: event.timestamp || new Date().toISOString(),
          eventType: event.eventType,
          level: event.level,
          temperature: event.temperature,
          message: event.message,
        }),
      });
      return response.ok;
    } catch {
      // Non-blocking
      return false;
    }
  }
}

export const batterySyncService = BatterySyncService.getInstance();
