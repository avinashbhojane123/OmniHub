import { NativeModules, NativeEventEmitter } from 'react-native';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
} from '@notifee/react-native';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { alarmService } from '../alarm/AlarmService';

const { DeviceBattery } = NativeModules;

declare const process: any;

export interface BatteryStatus {
  level: number; // 0 - 100
  isCharging: boolean;
  chargingType: 'AC' | 'USB' | 'Wireless' | 'Plugged' | 'Unplugged';
  status: 'Charging' | 'Discharging' | 'Full' | 'Not Charging' | 'Unknown';
  health: string;
  temperature: number; // in Celsius (e.g. 37.0)
  voltage: number; // in mV (e.g. 3964)
  technology: string;
  present: boolean;
}

export interface BatteryAlarmSettings {
  batteryGuardActive: boolean;
  fullChargeAlarmEnabled: boolean;
  fullChargeTarget: number; // e.g. 80, 85, 90, 95, 100
  lowBatteryAlarmEnabled: boolean;
  lowBatteryTarget: number; // e.g. 10, 15, 20, 25
  tempAlarmEnabled: boolean;
  tempTarget: number; // e.g. 40, 42, 45 (Celsius)
  pluggedAlertEnabled: boolean;
  unpluggedAlertEnabled: boolean;
  continuousRingtone: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
}

export type BatteryStatusListener = (status: BatteryStatus) => void;
export type BatterySettingsListener = (settings: BatteryAlarmSettings) => void;

class BatteryService {
  private static instance: BatteryService;
  private statusListeners: Set<BatteryStatusListener> = new Set();
  private settingsListeners: Set<BatterySettingsListener> = new Set();
  private pollerTimer: any = null;
  private initialized = false;

  private currentStatus: BatteryStatus = {
    level: 63,
    isCharging: true,
    chargingType: 'USB',
    status: 'Charging',
    health: 'Good',
    temperature: 37.0,
    voltage: 3964,
    technology: 'Li-poly',
    present: true,
  };

  private currentSettings: BatteryAlarmSettings = {
    batteryGuardActive: true,
    fullChargeAlarmEnabled: true,
    fullChargeTarget: 80,
    lowBatteryAlarmEnabled: true,
    lowBatteryTarget: 20,
    tempAlarmEnabled: true,
    tempTarget: 42,
    pluggedAlertEnabled: false,
    unpluggedAlertEnabled: false,
    continuousRingtone: true,
    vibrationEnabled: true,
    soundEnabled: true,
  };

  // Tracking flags to prevent duplicate alarm ringing in the same state
  private hasTriggeredFullAlarm = false;
  private hasTriggeredLowAlarm = false;
  private hasTriggeredTempAlarm = false;
  private lastChargingState: boolean | null = null;

  public static getInstance(): BatteryService {
    if (!BatteryService.instance) {
      BatteryService.instance = new BatteryService();
    }
    return BatteryService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.loadSettings();
    await this.initNotificationChannel();
    this.startListening();
    await this.refreshBatteryStatus();
  }

  private async initNotificationChannel(): Promise<void> {
    try {
      await notifee.createChannel({
        id: 'battery_charge_channel',
        name: 'Battery Charge & Health Alarm',
        description: 'Instant alerts for target charge, low battery, and battery health',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
        vibrationPattern: [400, 800, 400, 800],
        lights: true,
        bypassDnd: true,
      });
    } catch (e) {
      console.warn('BatteryService channel creation error:', e);
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const guard = await settingsRepository.get('battery_guard_active', 'true');
      const fullEnabled = await settingsRepository.get('battery_full_enabled', 'true');
      const fullTarget = await settingsRepository.get('battery_full_target', '80');
      const lowEnabled = await settingsRepository.get('battery_low_enabled', 'true');
      const lowTarget = await settingsRepository.get('battery_low_target', '20');
      const tempEnabled = await settingsRepository.get('battery_temp_enabled', 'true');
      const tempTarget = await settingsRepository.get('battery_temp_target', '42');
      const pluggedAlert = await settingsRepository.get('battery_plugged_alert', 'false');
      const unpluggedAlert = await settingsRepository.get('battery_unplugged_alert', 'false');
      const continuous = await settingsRepository.get('battery_continuous_ring', 'true');
      const vibration = await settingsRepository.get('battery_vibration', 'true');
      const sound = await settingsRepository.get('battery_sound', 'true');

      this.currentSettings = {
        batteryGuardActive: guard === 'true',
        fullChargeAlarmEnabled: fullEnabled === 'true',
        fullChargeTarget: parseInt(fullTarget, 10) || 80,
        lowBatteryAlarmEnabled: lowEnabled === 'true',
        lowBatteryTarget: parseInt(lowTarget, 10) || 20,
        tempAlarmEnabled: tempEnabled === 'true',
        tempTarget: parseInt(tempTarget, 10) || 42,
        pluggedAlertEnabled: pluggedAlert === 'true',
        unpluggedAlertEnabled: unpluggedAlert === 'true',
        continuousRingtone: continuous === 'true',
        vibrationEnabled: vibration === 'true',
        soundEnabled: sound === 'true',
      };
      this.notifySettings();
    } catch (e) {
      console.warn('Failed to load battery settings:', e);
    }
  }

  public getStatus(): BatteryStatus {
    return { ...this.currentStatus };
  }

  public getSettings(): BatteryAlarmSettings {
    return { ...this.currentSettings };
  }

  public subscribeStatus(listener: BatteryStatusListener): () => void {
    this.statusListeners.add(listener);
    listener({ ...this.currentStatus });
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public subscribeSettings(listener: BatterySettingsListener): () => void {
    this.settingsListeners.add(listener);
    listener({ ...this.currentSettings });
    return () => {
      this.settingsListeners.delete(listener);
    };
  }

  private notifyStatus() {
    for (const listener of this.statusListeners) {
      listener({ ...this.currentStatus });
    }
  }

  private notifySettings() {
    for (const listener of this.settingsListeners) {
      listener({ ...this.currentSettings });
    }
  }

  public async updateSettings(updates: Partial<BatteryAlarmSettings>): Promise<void> {
    this.currentSettings = { ...this.currentSettings, ...updates };
    this.notifySettings();

    try {
      if (updates.batteryGuardActive !== undefined) {
        await settingsRepository.set('battery_guard_active', String(updates.batteryGuardActive));
      }
      if (updates.fullChargeAlarmEnabled !== undefined) {
        await settingsRepository.set('battery_full_enabled', String(updates.fullChargeAlarmEnabled));
      }
      if (updates.fullChargeTarget !== undefined) {
        await settingsRepository.set('battery_full_target', String(updates.fullChargeTarget));
      }
      if (updates.lowBatteryAlarmEnabled !== undefined) {
        await settingsRepository.set('battery_low_enabled', String(updates.lowBatteryAlarmEnabled));
      }
      if (updates.lowBatteryTarget !== undefined) {
        await settingsRepository.set('battery_low_target', String(updates.lowBatteryTarget));
      }
      if (updates.tempAlarmEnabled !== undefined) {
        await settingsRepository.set('battery_temp_enabled', String(updates.tempAlarmEnabled));
      }
      if (updates.tempTarget !== undefined) {
        await settingsRepository.set('battery_temp_target', String(updates.tempTarget));
      }
      if (updates.pluggedAlertEnabled !== undefined) {
        await settingsRepository.set('battery_plugged_alert', String(updates.pluggedAlertEnabled));
      }
      if (updates.unpluggedAlertEnabled !== undefined) {
        await settingsRepository.set('battery_unplugged_alert', String(updates.unpluggedAlertEnabled));
      }
      if (updates.continuousRingtone !== undefined) {
        await settingsRepository.set('battery_continuous_ring', String(updates.continuousRingtone));
      }
      if (updates.vibrationEnabled !== undefined) {
        await settingsRepository.set('battery_vibration', String(updates.vibrationEnabled));
      }
      if (updates.soundEnabled !== undefined) {
        await settingsRepository.set('battery_sound', String(updates.soundEnabled));
      }
    } catch (e) {
      console.warn('Failed to save battery settings:', e);
    }

    // Evaluate immediate conditions with updated settings
    this.checkAlarmTriggers(this.currentStatus);
  }

  private startListening() {
    if (DeviceBattery) {
      try {
        DeviceBattery.startMonitoring();
        const eventEmitter = new NativeEventEmitter(DeviceBattery);
        eventEmitter.addListener('BatteryStatusChanged', (data: any) => {
          this.handleNewStatus(data as BatteryStatus);
        });
      } catch (e) {
        console.warn('Error attaching DeviceBattery event listener:', e);
      }
    }

    // Foreground interval to periodically poll status every 4s (skipped in test runner)
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      return;
    }

    if (this.pollerTimer) clearInterval(this.pollerTimer);
    this.pollerTimer = setInterval(() => {
      this.refreshBatteryStatus();
    }, 4000);
  }

  public async refreshBatteryStatus(): Promise<BatteryStatus> {
    if (DeviceBattery && typeof DeviceBattery.getBatteryInfo === 'function') {
      try {
        const info = await DeviceBattery.getBatteryInfo();
        if (info && typeof info.level === 'number') {
          this.handleNewStatus(info);
          return this.currentStatus;
        }
      } catch (e) {
        console.warn('Error reading native battery info:', e);
      }
    }

    // Fallback if native module is unavailable (e.g. during testing or web)
    this.handleNewStatus(this.currentStatus);
    return this.currentStatus;
  }

  private handleNewStatus(newStatus: BatteryStatus) {
    this.currentStatus = { ...newStatus };

    // Plug/unplug transition detection
    if (this.lastChargingState !== null && this.lastChargingState !== newStatus.isCharging) {
      if (newStatus.isCharging) {
        // Charger plugged in
        this.hasTriggeredFullAlarm = false; // Reset full alarm for this new session
        if (this.currentSettings.pluggedAlertEnabled) {
          this.notifyPlugEvent('🔌 Charger Connected', `Battery is now charging at ${newStatus.level}%`);
        }
      } else {
        // Charger unplugged
        this.hasTriggeredLowAlarm = false; // Reset low alarm for this new session
        if (this.currentSettings.unpluggedAlertEnabled) {
          this.notifyPlugEvent('⚡ Charger Disconnected', `Device unplugged at ${newStatus.level}%`);
        }
      }
    }
    this.lastChargingState = newStatus.isCharging;

    this.notifyStatus();
    this.checkAlarmTriggers(newStatus);
  }

  private async notifyPlugEvent(title: string, body: string) {
    try {
      await notifee.displayNotification({
        title,
        body,
        android: {
          channelId: 'battery_charge_channel',
          smallIcon: 'ic_notification',
          importance: AndroidImportance.DEFAULT,
        },
      });
    } catch {}
  }

  private checkAlarmTriggers(status: BatteryStatus) {
    if (!this.currentSettings.batteryGuardActive) return;

    // 1. Full Charge Alarm Check
    if (
      this.currentSettings.fullChargeAlarmEnabled &&
      status.isCharging &&
      status.level >= this.currentSettings.fullChargeTarget
    ) {
      if (!this.hasTriggeredFullAlarm) {
        this.hasTriggeredFullAlarm = true;
        this.triggerBatteryAlarm(
          `⚡ Battery ${status.level}% Charged!`,
          `Target reached (${this.currentSettings.fullChargeTarget}%). Unplug your charger to protect battery health and lifespan.`
        );
      }
    } else if (!status.isCharging || status.level < this.currentSettings.fullChargeTarget) {
      // Reset trigger once conditions are no longer met
      this.hasTriggeredFullAlarm = false;
    }

    // 2. Low Battery Alarm Check
    if (
      this.currentSettings.lowBatteryAlarmEnabled &&
      !status.isCharging &&
      status.level <= this.currentSettings.lowBatteryTarget
    ) {
      if (!this.hasTriggeredLowAlarm) {
        this.hasTriggeredLowAlarm = true;
        this.triggerBatteryAlarm(
          `🪫 Low Battery Alert (${status.level}%)`,
          `Battery dropped to ${status.level}%. Please connect your charger to avoid power off.`
        );
      }
    } else if (status.isCharging || status.level > this.currentSettings.lowBatteryTarget) {
      this.hasTriggeredLowAlarm = false;
    }

    // 3. Overheat Alarm Check
    if (
      this.currentSettings.tempAlarmEnabled &&
      status.temperature >= this.currentSettings.tempTarget
    ) {
      if (!this.hasTriggeredTempAlarm) {
        this.hasTriggeredTempAlarm = true;
        this.triggerBatteryAlarm(
          `🔥 High Battery Temperature (${status.temperature.toFixed(1)}°C)!`,
          `Device battery is running hot. Unplug and allow it to cool down to protect hardware.`
        );
      }
    } else if (status.temperature < this.currentSettings.tempTarget - 2) {
      this.hasTriggeredTempAlarm = false;
    }
  }

  /**
   * Trigger the loud battery alarm using AlarmService
   */
  public async triggerBatteryAlarm(title: string, message: string): Promise<void> {
    // 1. Display prominent lock-screen alert
    try {
      await notifee.displayNotification({
        id: 'active_battery_alarm',
        title: `⏰ ${title}`,
        body: message,
        android: {
          channelId: 'battery_charge_channel',
          smallIcon: 'ic_notification',
          category: AndroidCategory.ALARM,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          asForegroundService: true,
          ongoing: true,
          autoCancel: false,
          actions: [
            {
              title: '🔕 STOP ALARM',
              pressAction: { id: 'stop_alarm' },
            },
            {
              title: '💤 SNOOZE (5m)',
              pressAction: { id: 'snooze_alarm' },
            },
          ],
        },
      });
    } catch (err) {
      console.warn('Failed to display battery notification:', err);
    }

    // 2. Ring native siren and show AlarmRingingModal
    try {
      if (this.currentSettings.continuousRingtone) {
        await alarmService.startRinging(title, undefined, 'Battery Alarm');
      }
    } catch (e) {
      console.warn('Failed to trigger battery alarm ringtone:', e);
    }
  }

  /**
   * Test action triggered manually from UI
   */
  public async testAlarm(type: 'full' | 'low' | 'temp'): Promise<void> {
    if (type === 'full') {
      await this.triggerBatteryAlarm(
        `⚡ Test: Battery ${this.currentSettings.fullChargeTarget}% Charged!`,
        'Battery has reached your configured charge limit. Please unplug.'
      );
    } else if (type === 'low') {
      await this.triggerBatteryAlarm(
        `🪫 Test: Low Battery Alert (${this.currentSettings.lowBatteryTarget}%)`,
        'Battery is below threshold. Please connect charger.'
      );
    } else {
      await this.triggerBatteryAlarm(
        `🔥 Test: Battery Temperature Overheat (${this.currentSettings.tempTarget}°C)`,
        'Battery heat warning. Unplug and cool down.'
      );
    }
  }

  /**
   * Manual status override for simulator / testing
   */
  public setMockStatus(updates: Partial<BatteryStatus>): void {
    this.handleNewStatus({ ...this.currentStatus, ...updates });
  }

  public cleanup() {
    if (this.pollerTimer) {
      clearInterval(this.pollerTimer);
      this.pollerTimer = null;
    }
    if (DeviceBattery && typeof DeviceBattery.stopMonitoring === 'function') {
      try {
        DeviceBattery.stopMonitoring();
      } catch {}
    }
  }
}

export const batteryService = BatteryService.getInstance();
