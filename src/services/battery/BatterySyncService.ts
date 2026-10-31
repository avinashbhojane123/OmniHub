import { Platform } from 'react-native';
import { BatteryAlarmSettings, BatteryStatus } from './BatteryService';
import { batteryRepository } from '../../database/repositories/BatteryRepository';

export class BatterySyncService {
  private static instance: BatterySyncService;
  private backendUrl: string = 'http://localhost:3000'; // Default, dynamically overridden if configured

  public static getInstance(): BatterySyncService {
    if (!BatterySyncService.instance) {
      BatterySyncService.instance = new BatterySyncService();
    }
    return BatterySyncService.instance;
  }

  public setBackendUrl(url: string) {
    if (url) {
      this.backendUrl = url.replace(/\/+$/, '');
    }
  }

  public async syncSettingsToCloud(settings: BatteryAlarmSettings): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/battery/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: `${Platform.OS}_native_device`,
          ...settings,
        }),
      });
      return response.ok;
    } catch {
      // Offline or network error - local-first fallback
      return false;
    }
  }

  public async fetchSettingsFromCloud(): Promise<Partial<BatteryAlarmSettings> | null> {
    try {
      const response = await fetch(
        `${this.backendUrl}/api/battery/settings?deviceId=${Platform.OS}_native_device`
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  public async syncSessionToCloud(session: {
    startTime: string;
    endTime?: string | null;
    startLevel: number;
    endLevel?: number | null;
    gained: number;
    durationMinutes: number;
    chargingType: string;
    peakTemperature: number;
    peakWattage: number;
    avgSpeedPerHour: number;
  }): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/battery/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: `${Platform.OS}_native_device`,
          ...session,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async logAlertToCloud(event: {
    eventType: 'full_charge' | 'overcharge_100' | 'low_battery' | 'critical_low' | 'overheat';
    level: number;
    temperature?: number;
    message: string;
  }): Promise<void> {
    try {
      await fetch(`${this.backendUrl}/api/battery/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: `${Platform.OS}_native_device`,
          timestamp: new Date().toISOString(),
          ...event,
        }),
      });
    } catch {
      // Non-blocking
    }
  }
}

export const batterySyncService = BatterySyncService.getInstance();
