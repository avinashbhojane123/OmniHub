import { NativeModules, Platform } from 'react-native';

const { SafeGuardAgentModule } = NativeModules;

export interface HardwareInfo {
  brand: string;
  model: string;
  device: string;
  androidVersion: string;
  sdkInt: number;
}

export interface InstalledAppInfo {
  packageName: string;
  appName: string;
  isSystemApp: boolean;
}

export class SafeGuardNativeBridge {
  /**
   * Check if Android Usage Access (UsageStatsManager) is granted
   */
  public static async hasUsageStatsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return true; // Dev simulated fallback
    }
    try {
      return await SafeGuardAgentModule.hasUsageStatsPermission();
    } catch {
      return false;
    }
  }

  /**
   * Open Android Usage Access Settings page
   */
  public static async openUsageStatsSettings(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return true;
    }
    try {
      return await SafeGuardAgentModule.openUsageStatsSettings();
    } catch {
      return false;
    }
  }

  /**
   * Check if Notification Listener Service permission is granted
   */
  public static async hasNotificationAccess(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return true;
    }
    try {
      return await SafeGuardAgentModule.hasNotificationListenerPermission();
    } catch {
      return false;
    }
  }

  /**
   * Open Notification Listener Settings page
   */
  public static async openNotificationListenerSettings(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return true;
    }
    try {
      return await SafeGuardAgentModule.openNotificationListenerSettings();
    } catch {
      return false;
    }
  }

  /**
   * Check if Accessibility Service is enabled for App Blocking
   */
  public static async isAccessibilityEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return true;
    }
    try {
      return await SafeGuardAgentModule.isAccessibilityServiceEnabled();
    } catch {
      return false;
    }
  }

  /**
   * Open Accessibility Settings page
   */
  public static async openAccessibilitySettings(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return true;
    }
    try {
      return await SafeGuardAgentModule.openAccessibilitySettings();
    } catch {
      return false;
    }
  }

  /**
   * Retrieve list of installed applications
   */
  public static async getInstalledApps(): Promise<InstalledAppInfo[]> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return [
        { packageName: 'com.instagram.android', appName: 'Instagram', isSystemApp: false },
        { packageName: 'com.google.android.youtube', appName: 'YouTube', isSystemApp: false },
        { packageName: 'com.zhiliaoapp.musically', appName: 'TikTok', isSystemApp: false },
        { packageName: 'com.snapchat.android', appName: 'Snapchat', isSystemApp: false },
        { packageName: 'com.roblox.client', appName: 'Roblox', isSystemApp: false },
        { packageName: 'com.whatsapp', appName: 'WhatsApp', isSystemApp: false },
        { packageName: 'com.discord', appName: 'Discord', isSystemApp: false },
        { packageName: 'com.spotify.music', appName: 'Spotify', isSystemApp: false },
        { packageName: 'com.android.chrome', appName: 'Chrome Browser', isSystemApp: true },
      ];
    }
    try {
      const apps = await SafeGuardAgentModule.getInstalledApplications();
      return apps || [];
    } catch {
      return [];
    }
  }

  /**
   * Retrieve device hardware specifications
   */
  public static async getHardwareInfo(): Promise<HardwareInfo> {
    if (Platform.OS !== 'android' || !SafeGuardAgentModule) {
      return {
        brand: 'Samsung',
        model: 'Galaxy A54 5G',
        device: 'a54x',
        androidVersion: '14 (API 34)',
        sdkInt: 34,
      };
    }
    try {
      return await SafeGuardAgentModule.getDeviceHardwareInfo();
    } catch {
      return {
        brand: 'Android Device',
        model: 'Pixel / Galaxy',
        device: 'generic',
        androidVersion: '14',
        sdkInt: 34,
      };
    }
  }
}
