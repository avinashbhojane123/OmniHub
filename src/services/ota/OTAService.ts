import { NativeModules, Platform } from 'react-native';
import { settingsRepository } from '../../database/repositories/SettingsRepository';

const getOTAModule = () => NativeModules.OTAModule;

export interface OTAStatus {
  hasCustomBundle: boolean;
  bundleSize: number;
  lastModified: number;
  bundlePath?: string;
  installedVersion: number;
}

export interface UpdateCheckResult {
  available: boolean;
  remoteVersion: number;
  currentVersion: number;
  buildTime?: string;
  notes?: string;
  bundleUrl: string;
}

const SETTINGS_KEY_SERVER = 'ota_server_url';
const SETTINGS_KEY_VERSION = 'local_ota_version';
const DEFAULT_SERVER = 'http://10.34.159.73:8888';

export class OTAService {
  private static instance: OTAService;

  private constructor() { }

  public static getInstance(): OTAService {
    if (!OTAService.instance) {
      OTAService.instance = new OTAService();
    }
    return OTAService.instance;
  }

  public async getServerUrl(): Promise<string> {
    try {
      const saved = await settingsRepository.get(SETTINGS_KEY_SERVER, DEFAULT_SERVER);
      let clean = (saved || DEFAULT_SERVER).trim().replace(/\/+$/, '');
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `http://${clean}`;
      }
      const hostPart = clean.replace(/^https?:\/\//i, '');
      if (!hostPart.includes(':')) {
        clean = `${clean}:8888`;
      }
      return clean;
    } catch {
      return DEFAULT_SERVER;
    }
  }

  public async setServerUrl(url: string): Promise<void> {
    const clean = url.trim().replace(/\/+$/, '');
    await settingsRepository.set(SETTINGS_KEY_SERVER, clean);
  }

  public async getStatus(): Promise<OTAStatus> {
    const otaModule = getOTAModule();
    if (Platform.OS !== 'android' || !otaModule) {
      return {
        hasCustomBundle: false,
        bundleSize: 0,
        lastModified: 0,
        installedVersion: 0,
      };
    }

    try {
      const nativeStatus = await otaModule.getOTAStatus();
      const verStr = await settingsRepository.get(SETTINGS_KEY_VERSION, '0');
      const installedVersion = parseInt(verStr, 10) || 0;

      return {
        hasCustomBundle: Boolean(nativeStatus.hasCustomBundle),
        bundleSize: Number(nativeStatus.bundleSize || 0),
        lastModified: Number(nativeStatus.lastModified || 0),
        bundlePath: nativeStatus.bundlePath,
        installedVersion,
      };
    } catch (e) {
      console.warn('Error reading OTA status:', e);
      return {
        hasCustomBundle: false,
        bundleSize: 0,
        lastModified: 0,
        installedVersion: 0,
      };
    }
  }

  public async checkForUpdate(): Promise<UpdateCheckResult> {
    const serverUrl = await this.getServerUrl();
    const status = await this.getStatus();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const resp = await fetch(`${serverUrl}/ota/version`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`Server responded with ${resp.status}`);
      }

      const data = await resp.json();
      const remoteVersion = Number(data.version || 0);
      const available = remoteVersion > status.installedVersion;

      let bundleUrl = data.bundleUrl || '/ota/index.android.bundle';
      if (!bundleUrl.startsWith('http')) {
        bundleUrl = `${serverUrl}${bundleUrl.startsWith('/') ? '' : '/'}${bundleUrl}`;
      }

      return {
        available,
        remoteVersion,
        currentVersion: status.installedVersion,
        buildTime: data.buildTime,
        notes: data.notes,
        bundleUrl,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(
        err.name === 'AbortError'
          ? `Could not reach PC hotspot server (${serverUrl}). Ensure phone is on the same hotspot.`
          : `Update check error: ${err.message || 'Server unreachable'}`
      );
    }
  }

  public async downloadAndApplyUpdate(bundleUrl: string, remoteVersion: number): Promise<boolean> {
    const otaModule = getOTAModule();
    if (Platform.OS !== 'android' || !otaModule) {
      throw new Error('OTA updates are only supported on Android devices.');
    }

    const res = await otaModule.downloadOTABundle(bundleUrl);
    if (!res || !res.success) {
      throw new Error('Failed to download OTA update package.');
    }

    await settingsRepository.set(SETTINGS_KEY_VERSION, String(remoteVersion));
    return true;
  }

  public async revertToDefault(): Promise<boolean> {
    const otaModule = getOTAModule();
    if (Platform.OS !== 'android' || !otaModule) return false;
    await otaModule.revertToEmbedded();
    await settingsRepository.set(SETTINGS_KEY_VERSION, '0');
    return true;
  }

  public async restartApp(): Promise<void> {
    const otaModule = getOTAModule();
    if (Platform.OS !== 'android' || !otaModule) return;
    await otaModule.restartApp();
  }
}

export const otaService = OTAService.getInstance();
