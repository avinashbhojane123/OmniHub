import { batterySyncService, BatterySyncService } from '../src/services/battery/BatterySyncService';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { batteryRepository } from '../src/database/repositories/BatteryRepository';
import { getDatabase } from '../src/database/connection';

describe('BatterySyncService Suite', () => {
  const originalFetch = (globalThis as any).fetch;

  beforeAll(async () => {
    await getDatabase();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('1. should resolve backend url and normalize trailing slashes and protocol', async () => {
    await batterySyncService.setBackendUrlAsync('http://192.168.1.50:10000///');
    const url = await batterySyncService.getBackendUrl();
    expect(url).toBe('http://192.168.1.50:10000');

    // Should add protocol if missing
    batterySyncService.setBackendUrl('my-server.local:10000/');
    const url2 = await batterySyncService.getBackendUrl();
    expect(url2).toBe('http://my-server.local:10000');
  });

  it('2. should manage a persistent unique device ID', async () => {
    const deviceId = await batterySyncService.getDeviceId();
    expect(deviceId).toBeDefined();
    expect(deviceId.length).toBeGreaterThan(5);

    await batterySyncService.setDeviceId('custom_phone_device_123');
    const updatedId = await batterySyncService.getDeviceId();
    expect(updatedId).toBe('custom_phone_device_123');
  });

  it('3. should test connection to backend server successfully', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    const result = await batterySyncService.testConnection();
    expect(result.success).toBe(true);
    expect(result.message).toContain('Connected to battery backend server');
  });

  it('4. should handle connection failure when server returns error status', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as any);

    const result = await batterySyncService.testConnection();
    expect(result.success).toBe(false);
    expect(result.message).toContain('HTTP 503');
  });

  it('5. should sync battery alarm settings to cloud backend', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as any);
    (globalThis as any).fetch = fetchSpy;

    const ok = await batterySyncService.syncSettingsToCloud({
      batteryGuardActive: true,
      fullChargeAlarmEnabled: true,
      fullChargeTarget: 80,
      overchargeFailsafeEnabled: true,
      lowBatteryAlarmEnabled: true,
      lowBatteryTarget: 20,
      criticalLowAlarmEnabled: true,
      tempAlarmEnabled: true,
      tempTarget: 42,
      pluggedAlertEnabled: true,
      unpluggedAlertEnabled: true,
      continuousRingtone: true,
      vibrationEnabled: true,
      soundEnabled: true,
      autoRepeatAlarm: true,
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/battery/settings'),
      expect.objectContaining({
        method: 'PUT',
      })
    );
  });

  it('6. should fetch and parse battery settings from cloud backend', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        batteryGuardActive: true,
        fullChargeTarget: 85,
        lowBatteryTarget: 15,
        tempTarget: 44,
      }),
    } as any);

    const cloudSettings = await batterySyncService.fetchSettingsFromCloud();
    expect(cloudSettings).not.toBeNull();
    expect(cloudSettings?.fullChargeTarget).toBe(85);
    expect(cloudSettings?.lowBatteryTarget).toBe(15);
    expect(cloudSettings?.tempTarget).toBe(44);
  });

  it('7. should sync battery charging session to cloud backend', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
    } as any);
    (globalThis as any).fetch = fetchSpy;

    const ok = await batterySyncService.syncSessionToCloud({
      startTime: '2026-11-01T08:00:00.000Z',
      endTime: '2026-11-01T08:45:00.000Z',
      startLevel: 30,
      endLevel: 80,
      gained: 50,
      durationMinutes: 45,
      chargingType: 'AC',
      peakTemperature: 38.5,
      peakWattage: 22.4,
      avgSpeedPerHour: 66.7,
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/battery/sessions'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('8. should fetch recent charging sessions from cloud backend', async () => {
    const mockSessions = [
      {
        id: 'session_1',
        startTime: '2026-11-01T07:00:00.000Z',
        startLevel: 20,
        endLevel: 80,
        gained: 60,
      },
    ];

    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSessions,
    } as any);

    const sessions = await batterySyncService.getRecentSessionsFromCloud(10);
    expect(sessions.length).toBe(1);
    expect(sessions[0].startLevel).toBe(20);
  });

  it('9. should log battery alert events to cloud diagnostics', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
    } as any);
    (globalThis as any).fetch = fetchSpy;

    const ok = await batterySyncService.logAlertToCloud({
      eventType: 'full_charge',
      level: 80,
      temperature: 36.2,
      message: 'Target reached (80%)',
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/battery/alert'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('10. should sync pending sessions from local SQLite database', async () => {
    // Record a local session in SQLite
    await batteryRepository.startSession(20, 'AC');
    await batteryRepository.finishActiveSession(75);

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
    } as any);
    (globalThis as any).fetch = fetchSpy;

    const syncedCount = await batterySyncService.syncPendingSessions(5);
    expect(syncedCount).toBeGreaterThanOrEqual(1);
  });
});
