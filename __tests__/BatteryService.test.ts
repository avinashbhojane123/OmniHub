import { batteryService } from '../src/services/battery/BatteryService';
import { alarmService } from '../src/services/alarm/AlarmService';
import { getDatabase } from '../src/database/connection';

const waitMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('BatteryService & Charge Alarm Suite', () => {
  beforeAll(async () => {
    await getDatabase();
    await batteryService.initialize();
  });

  afterEach(() => {
    alarmService.stopRinging();
    jest.clearAllMocks();
  });

  it('1. should initialize with default status and settings', () => {
    const status = batteryService.getStatus();
    const settings = batteryService.getSettings();

    expect(status).toBeDefined();
    expect(typeof status.level).toBe('number');
    expect(settings.batteryGuardActive).toBe(true);
    expect(settings.fullChargeTarget).toBe(80);
    expect(settings.lowBatteryTarget).toBe(20);
    expect(settings.tempTarget).toBe(42);
  });

  it('2. should notify status subscribers when battery updates', () => {
    let notifiedStatus: any = null;
    const unsubscribe = batteryService.subscribeStatus((st: any) => {
      notifiedStatus = st;
    });

    batteryService.setMockStatus({
      level: 75,
      isCharging: true,
      chargingType: 'USB',
    });

    expect(notifiedStatus).not.toBeNull();
    expect(notifiedStatus?.level).toBe(75);
    expect(notifiedStatus?.isCharging).toBe(true);

    unsubscribe();
  });

  it('3. should update and persist settings', async () => {
    await batteryService.updateSettings({
      fullChargeTarget: 85,
      lowBatteryTarget: 15,
      tempTarget: 45,
    });

    const settings = batteryService.getSettings();
    expect(settings.fullChargeTarget).toBe(85);
    expect(settings.lowBatteryTarget).toBe(15);
    expect(settings.tempTarget).toBe(45);
  });

  it('4. should trigger full charge alarm when battery reaches configured target', async () => {
    const startRingingSpy = jest.spyOn(alarmService, 'startRinging');

    await batteryService.updateSettings({
      batteryGuardActive: true,
      fullChargeAlarmEnabled: true,
      fullChargeTarget: 80,
    });

    // Reset baseline below threshold
    batteryService.setMockStatus({
      level: 70,
      isCharging: true,
    });
    await waitMicrotasks();
    startRingingSpy.mockClear();

    // Device reaches 80% while charging
    batteryService.setMockStatus({
      level: 80,
      isCharging: true,
    });
    await waitMicrotasks();

    expect(startRingingSpy).toHaveBeenCalledWith(
      expect.stringContaining('80% Charged'),
      undefined,
      'Battery Alarm'
    );

    startRingingSpy.mockRestore();
  });

  it('5. should trigger low battery alarm when discharging below target', async () => {
    const startRingingSpy = jest.spyOn(alarmService, 'startRinging');

    await batteryService.updateSettings({
      batteryGuardActive: true,
      lowBatteryAlarmEnabled: true,
      lowBatteryTarget: 20,
    });

    // Reset baseline above threshold
    batteryService.setMockStatus({
      level: 50,
      isCharging: false,
    });
    await waitMicrotasks();
    startRingingSpy.mockClear();

    // Device drops to 19% while discharging
    batteryService.setMockStatus({
      level: 19,
      isCharging: false,
    });
    await waitMicrotasks();

    expect(startRingingSpy).toHaveBeenCalledWith(
      expect.stringContaining('Low Battery Alert (19%)'),
      undefined,
      'Battery Alarm'
    );

    startRingingSpy.mockRestore();
  });

  it('6. should trigger overheat alarm when temperature exceeds threshold', async () => {
    const startRingingSpy = jest.spyOn(alarmService, 'startRinging');

    await batteryService.updateSettings({
      batteryGuardActive: true,
      tempAlarmEnabled: true,
      tempTarget: 42,
    });

    // Reset baseline temp below threshold
    batteryService.setMockStatus({
      temperature: 30,
    });
    await waitMicrotasks();
    startRingingSpy.mockClear();

    batteryService.setMockStatus({
      temperature: 43.5,
    });
    await waitMicrotasks();

    expect(startRingingSpy).toHaveBeenCalledWith(
      expect.stringContaining('High Battery Temperature (43.5°C)'),
      undefined,
      'Battery Alarm'
    );

    startRingingSpy.mockRestore();
  });

  it('7. should trigger test alarm on demand', async () => {
    const startRingingSpy = jest.spyOn(alarmService, 'startRinging');

    await batteryService.testAlarm('full');
    await waitMicrotasks();
    expect(startRingingSpy).toHaveBeenCalled();

    startRingingSpy.mockRestore();
  });
});
