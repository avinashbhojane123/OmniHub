import { NativeModules, Platform } from 'react-native';
import { otaService } from '../src/services/ota/OTAService';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { getDatabase } from '../src/database/connection';

describe('OTAService Test Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(async () => {
    Platform.OS = 'android';
    await settingsRepository.set('ota_server_url', '');
    await settingsRepository.set('local_ota_version', '0');

    NativeModules.OTAModule = {
      getOTAStatus: jest.fn().mockResolvedValue({
        hasCustomBundle: true,
        bundleSize: 2426231,
        lastModified: 1792422638235,
        bundlePath: '/data/user/0/com.lifeplanner/files/ota/index.android.bundle',
      }),
      downloadOTABundle: jest.fn().mockResolvedValue({
        success: true,
        size: 2426231,
        modified: 1792422638235,
      }),
      revertToEmbedded: jest.fn().mockResolvedValue(true),
      restartApp: jest.fn().mockResolvedValue(true),
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('1. should return default server URL and allow updating it', async () => {
    const defaultUrl = await otaService.getServerUrl();
    expect(defaultUrl).toBe('http://10.34.159.73:8888');

    await otaService.setServerUrl('http://192.168.1.50:8888/');
    const updatedUrl = await otaService.getServerUrl();
    expect(updatedUrl).toBe('http://192.168.1.50:8888');
  });

  it('2. should get OTA status with installed version from repository', async () => {
    await settingsRepository.set('local_ota_version', '100');
    const status = await otaService.getStatus();

    expect(status.hasCustomBundle).toBe(true);
    expect(status.bundleSize).toBe(2426231);
    expect(status.installedVersion).toBe(100);
    expect(NativeModules.OTAModule.getOTAStatus).toHaveBeenCalled();
  });

  it('3. should check for update and detect new version when remote > local', async () => {
    await settingsRepository.set('local_ota_version', '10');

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 20,
        buildTime: '08:30 PM',
        notes: 'Feature update',
        bundleUrl: '/ota/index.android.bundle',
      }),
    } as any);

    const result = await otaService.checkForUpdate();
    expect(result.available).toBe(true);
    expect(result.remoteVersion).toBe(20);
    expect(result.currentVersion).toBe(10);
    expect(result.buildTime).toBe('08:30 PM');
    expect(result.bundleUrl).toContain('http://');
  });

  it('4. should report update unavailable when remote <= local', async () => {
    await settingsRepository.set('local_ota_version', '50');

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 50,
        buildTime: '08:00 PM',
      }),
    } as any);

    const result = await otaService.checkForUpdate();
    expect(result.available).toBe(false);
    expect(result.remoteVersion).toBe(50);
    expect(result.currentVersion).toBe(50);
  });

  it('5. should download and apply update then update installed version', async () => {
    const success = await otaService.downloadAndApplyUpdate('http://test-server/bundle', 12345);
    expect(success).toBe(true);
    expect(NativeModules.OTAModule.downloadOTABundle).toHaveBeenCalledWith('http://test-server/bundle');

    const savedVersion = await settingsRepository.get('local_ota_version', '0');
    expect(savedVersion).toBe('12345');
  });

  it('6. should revert to default embedded bundle and reset version', async () => {
    await settingsRepository.set('local_ota_version', '999');
    const success = await otaService.revertToDefault();

    expect(success).toBe(true);
    expect(NativeModules.OTAModule.revertToEmbedded).toHaveBeenCalled();
    const savedVersion = await settingsRepository.get('local_ota_version', '0');
    expect(savedVersion).toBe('0');
  });

  it('7. should trigger native app restart', async () => {
    await otaService.restartApp();
    expect(NativeModules.OTAModule.restartApp).toHaveBeenCalled();
  });

  it('8. should return fallback status on non-android platforms', async () => {
    Platform.OS = 'ios';
    const status = await otaService.getStatus();
    expect(status.hasCustomBundle).toBe(false);
    expect(status.bundleSize).toBe(0);
    expect(status.installedVersion).toBe(0);
  });
});
