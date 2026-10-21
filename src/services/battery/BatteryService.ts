import { NativeModules, NativeEventEmitter, Vibration } from 'react-native';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
} from '@notifee/react-native';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { alarmService } from '../alarm/AlarmService';

const { DeviceBattery, AlarmRingtone } = NativeModules;

declare const process: any;

export interface BatteryStatus {
  level: number; // 0 - 100
  isCharging: boolean;
  chargingType: 'AC' | 'USB' | 'Wireless' | 'Plugged' | 'Unplugged';
  status: 'Charging' | 'Discharging' | 'Full' | 'Not Charging' | 'Unknown';
  health: string;
  temperature: number; // in Celsius (e.g. 37.0)
  voltage: number; // in mV (e.g. 3964)
  currentNow?: number; // in mA
  wattage?: number; // in W (e.g. 18.5)
  technology: string;
  present: boolean;
}

export interface BatteryAlarmSettings {
  batteryGuardActive: boolean;
  fullChargeAlarmEnabled: boolean;
  fullChargeTarget: number; // e.g. 80, 85, 90, 95, 100
  overchargeFailsafeEnabled: boolean; // Emergency alarm at 100%
  lowBatteryAlarmEnabled: boolean;
  lowBatteryTarget: number; // e.g. 10, 15, 20, 25
  criticalLowAlarmEnabled: boolean; // Emergency alarm at 5%
  tempAlarmEnabled: boolean;
  tempTarget: number; // e.g. 42, 45, 48, 50 (Celsius)
  pluggedAlertEnabled: boolean;
  unpluggedAlertEnabled: boolean;
  continuousRingtone: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  autoRepeatAlarm: boolean; // Re-rings every 3m if not unplugged
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
    currentNow: 1850,
    wattage: 7.3,
    technology: 'Li-poly',
    present: true,
  };

  private currentSettings: BatteryAlarmSettings = {
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
  };

  // Tracking flags to prevent duplicate alarm ringing in the same state
  private hasTriggeredFullAlarm = false;
  private hasTriggered100Alarm = false;
  private hasTriggeredLowAlarm = false;
  private hasTriggeredCritical5Alarm = false;
  private hasTriggeredTempAlarm = false;
  private lastAlarmTime = 0;
  private lastChargingState: boolean | null = null;
  private sessionStartTime: number | null = null;
  private sessionStartLevel: number | null = null;
  private lastPollerRun = 0;

  public static getInstance(): BatteryService {
    if (!BatteryService.instance) {
      BatteryService.instance = new BatteryService();
    }
    return BatteryService.instance;
  }

  public getCurrentStatus(): BatteryStatus {
    return this.currentStatus;
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

      await notifee.createChannel({
        id: 'battery_monitor_channel',
        name: 'Battery Guard Background Monitor',
        description: 'Ensures background battery tracking stays active while charging',
        importance: AndroidImportance.LOW,
        visibility: AndroidVisibility.SECRET,
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
      const overcharge100 = await settingsRepository.get('battery_overcharge_100', 'true');
      const lowEnabled = await settingsRepository.get('battery_low_enabled', 'true');
      const lowTarget = await settingsRepository.get('battery_low_target', '20');
      const critLow = await settingsRepository.get('battery_critical_low_5', 'true');
      const tempEnabled = await settingsRepository.get('battery_temp_enabled', 'true');
      const tempTarget = await settingsRepository.get('battery_temp_target', '42');
      const pluggedAlert = await settingsRepository.get('battery_plugged_alert', 'false');
      const unpluggedAlert = await settingsRepository.get('battery_unplugged_alert', 'false');
      const continuous = await settingsRepository.get('battery_continuous_ring', 'true');
      const vibration = await settingsRepository.get('battery_vibration', 'true');
      const sound = await settingsRepository.get('battery_sound', 'true');
      const autoRepeat = await settingsRepository.get('battery_auto_repeat', 'true');

      this.currentSettings = {
        batteryGuardActive: guard === 'true',
        fullChargeAlarmEnabled: fullEnabled === 'true',
        fullChargeTarget: parseInt(fullTarget, 10) || 80,
        overchargeFailsafeEnabled: overcharge100 === 'true',
        lowBatteryAlarmEnabled: lowEnabled === 'true',
        lowBatteryTarget: parseInt(lowTarget, 10) || 20,
        criticalLowAlarmEnabled: critLow === 'true',
        tempAlarmEnabled: tempEnabled === 'true',
        tempTarget: parseInt(tempTarget, 10) || 42,
        pluggedAlertEnabled: pluggedAlert === 'true',
        unpluggedAlertEnabled: unpluggedAlert === 'true',
        continuousRingtone: continuous === 'true',
        vibrationEnabled: vibration === 'true',
        soundEnabled: sound === 'true',
        autoRepeatAlarm: autoRepeat === 'true',
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
      if (updates.overchargeFailsafeEnabled !== undefined) {
        await settingsRepository.set('battery_overcharge_100', String(updates.overchargeFailsafeEnabled));
      }
      if (updates.lowBatteryAlarmEnabled !== undefined) {
        await settingsRepository.set('battery_low_enabled', String(updates.lowBatteryAlarmEnabled));
      }
      if (updates.lowBatteryTarget !== undefined) {
        await settingsRepository.set('battery_low_target', String(updates.lowBatteryTarget));
      }
      if (updates.criticalLowAlarmEnabled !== undefined) {
        await settingsRepository.set('battery_critical_low_5', String(updates.criticalLowAlarmEnabled));
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
      if (updates.autoRepeatAlarm !== undefined) {
        await settingsRepository.set('battery_auto_repeat', String(updates.autoRepeatAlarm));
      }
    } catch (e) {
      console.warn('Failed to save battery settings:', e);
    }

    // Evaluate immediate conditions with updated settings
    this.checkAlarmTriggers(this.currentStatus);
    this.updateOngoingMonitorNotification(this.currentStatus);
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
      // While charging, poll every 4s to track live wattage and current.
      // When unplugged, poll every 30s to conserve energy, relying on native broadcasts.
      const isCharging = this.currentStatus.isCharging;
      const now = Date.now();
      if (isCharging || !this.lastPollerRun || now - this.lastPollerRun >= 30000) {
        this.lastPollerRun = now;
        this.refreshBatteryStatus();
      }
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

    // Initial status on app startup: if already charging, initialize session tracking
    if (this.lastChargingState === null && newStatus.isCharging) {
      this.sessionStartTime = Date.now();
      this.sessionStartLevel = newStatus.level;
      if (newStatus.level >= this.currentSettings.fullChargeTarget) {
        this.hasTriggeredFullAlarm = true;
      }
    }

    // Plug/unplug transition detection
    if (this.lastChargingState !== null && this.lastChargingState !== newStatus.isCharging) {
      if (newStatus.isCharging) {
        // Charger plugged in: start session tracking
        this.sessionStartTime = Date.now();
        this.sessionStartLevel = newStatus.level;
        if (newStatus.level >= this.currentSettings.fullChargeTarget) {
          this.hasTriggeredFullAlarm = true;
        } else {
          this.hasTriggeredFullAlarm = false;
        }
        this.hasTriggered100Alarm = false;
        if (this.currentSettings.pluggedAlertEnabled) {
          this.notifyPlugEvent('🔌 Charger Connected', `Battery is now charging at ${newStatus.level}%`);
        }
      } else {
        // Charger unplugged: reset alarms and session
        this.hasTriggeredLowAlarm = false;
        this.hasTriggeredCritical5Alarm = false;
        this.hasTriggered100Alarm = false;
        this.sessionStartTime = null;
        this.sessionStartLevel = null;
        if (this.currentSettings.unpluggedAlertEnabled) {
          this.notifyPlugEvent('⚡ Charger Disconnected', `Device unplugged at ${newStatus.level}%`);
        }
      }
    }
    this.lastChargingState = newStatus.isCharging;

    this.notifyStatus();
    this.checkAlarmTriggers(newStatus);
    this.updateOngoingMonitorNotification(newStatus);
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

    const now = Date.now();

    // 1. Full Charge Alarm Check (Target level e.g. 80%)
    if (
      this.currentSettings.fullChargeAlarmEnabled &&
      status.isCharging &&
      status.level >= this.currentSettings.fullChargeTarget
    ) {
      if (!this.hasTriggeredFullAlarm) {
        this.hasTriggeredFullAlarm = true;
        this.lastAlarmTime = now;
        this.triggerBatteryAlarm(
          `⚡ Battery ${status.level}% Charged!`,
          `Target reached (${this.currentSettings.fullChargeTarget}%). Unplug your charger to protect battery health and lifespan.`
        );
      } else if (
        this.currentSettings.autoRepeatAlarm &&
        now - this.lastAlarmTime > 180000 &&
        status.level < 100
      ) {
        // Re-ring every 3 minutes if phone remains plugged in
        this.lastAlarmTime = now;
        this.triggerBatteryAlarm(
          `⚡ Reminder: Battery at ${status.level}%!`,
          `Target was reached. Unplug your device to avoid high-voltage stress.`
        );
      }
    } else if (!status.isCharging || status.level < this.currentSettings.fullChargeTarget) {
      this.hasTriggeredFullAlarm = false;
    }

    // 2. Emergency 100% Overcharge Failsafe Alarm
    if (
      this.currentSettings.overchargeFailsafeEnabled &&
      this.currentSettings.fullChargeTarget < 100 &&
      status.isCharging &&
      status.level >= 100
    ) {
      if (!this.hasTriggered100Alarm) {
        this.hasTriggered100Alarm = true;
        this.triggerBatteryAlarm(
          `🚨 CRITICAL OVERCHARGE: 100% Full!`,
          `Battery is at 100%! Continuous trickle charge degrades lithium cells rapidly. Unplug immediately!`
        );
      }
    } else if (!status.isCharging || status.level < 100) {
      this.hasTriggered100Alarm = false;
    }

    // 3. Low Battery Alarm Check (Target e.g. 20%)
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

    // 4. Critical 5% Discharge Alarm
    if (
      this.currentSettings.criticalLowAlarmEnabled &&
      !status.isCharging &&
      status.level <= 5
    ) {
      if (!this.hasTriggeredCritical5Alarm) {
        this.hasTriggeredCritical5Alarm = true;
        this.triggerBatteryAlarm(
          `🪫 CRITICAL 5% BATTERY!`,
          `Phone will shut down in seconds! Connect charger immediately.`
        );
      }
    } else if (status.isCharging || status.level > 5) {
      this.hasTriggeredCritical5Alarm = false;
    }

    // 5. Overheat Alarm Check
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

  public getSessionStats(): { elapsedMinutes: number; gained: number; speedPerHour: number } | null {
    if (!this.currentStatus.isCharging || !this.sessionStartTime || this.sessionStartLevel === null) {
      return null;
    }
    const elapsedMinutes = Math.max(1, Math.round((Date.now() - this.sessionStartTime) / 60000));
    const gained = Math.max(0, this.currentStatus.level - this.sessionStartLevel);
    const speedPerHour = Math.round((gained / (elapsedMinutes / 60)) * 10) / 10;
    return {
      elapsedMinutes,
      gained,
      speedPerHour,
    };
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
      if (this.currentSettings.soundEnabled || this.currentSettings.vibrationEnabled) {
        if (this.currentSettings.continuousRingtone) {
          await alarmService.startRinging(title, undefined, 'Battery Alarm');
        } else {
          // One-shot chime / vibration alert (doesn't loop for 60s)
          if (AlarmRingtone) {
            AlarmRingtone.play(this.currentSettings.soundEnabled, this.currentSettings.vibrationEnabled);
            setTimeout(() => {
              try {
                AlarmRingtone.stop();
              } catch {}
            }, 4000);
          } else if (this.currentSettings.vibrationEnabled) {
            Vibration.vibrate([0, 500, 200, 500]);
          }
        }
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

  public async stopAlarm(): Promise<void> {
    try {
      await alarmService.stopRinging();
    } catch {}
    if (AlarmRingtone) {
      try {
        AlarmRingtone.stop();
      } catch {}
    }
    try {
      Vibration.cancel();
    } catch {}
    try {
      await notifee.cancelNotification('active_battery_alarm');
    } catch {}
  }

  private async updateOngoingMonitorNotification(status: BatteryStatus): Promise<void> {
    if (!this.currentSettings.batteryGuardActive || !status.isCharging) {
      try {
        await notifee.cancelNotification('battery_guard_monitor');
      } catch {}
      return;
    }

    try {
      await notifee.displayNotification({
        id: 'battery_guard_monitor',
        title: `⚡ Battery Guard Active: ${status.level}% (${status.chargingType})`,
        body: `Monitoring charge to ${this.currentSettings.fullChargeTarget}% target`,
        android: {
          channelId: 'battery_monitor_channel',
          smallIcon: 'ic_notification',
          asForegroundService: true,
          ongoing: true,
          autoCancel: false,
          pressAction: { id: 'default' },
        },
        data: {
          screen: 'BatteryAlarm',
        },
      });
    } catch {
      // Ignore background notification exceptions
    }
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
