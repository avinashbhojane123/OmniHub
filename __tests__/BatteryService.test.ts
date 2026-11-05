import { batteryService } from '../src/services/battery/BatteryService';
import { alarmService } from '../src/services/alarm/AlarmService';
import { getDatabase } from '../src/database/connection';

const waitMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('BatteryService & Charge Alarm Suite', () => {
  beforeAll(async () => {
    await getDatabase();
    await batteryService.initialize();
  });

  beforeEach(() => {
    batteryService.setDndActive(false);
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

    batteryService.updateStatus({
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
    batteryService.updateStatus({
      level: 70,
      isCharging: true,
    });
    await waitMicrotasks();
    startRingingSpy.mockClear();

    // Device reaches 80% while charging
    batteryService.updateStatus({
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
    batteryService.updateStatus({
      level: 50,
      isCharging: false,
    });
    await waitMicrotasks();
    startRingingSpy.mockClear();

    // Device drops to 19% while discharging
    batteryService.updateStatus({
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
    batteryService.updateStatus({
      temperature: 30,
    });
    await waitMicrotasks();
    startRingingSpy.mockClear();

    batteryService.updateStatus({
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

  it('8. should update status and not trigger false alarms for invalid or corrupted readings', async () => {
    const startRingingSpy = jest.spyOn(alarmService, 'startRinging');

    // Passing invalid / unreadable reading (-1) should be ignored and not alarm
    batteryService.updateStatus({
      level: -1,
      isCharging: false,
    });
    await waitMicrotasks();
    expect(startRingingSpy).not.toHaveBeenCalled();

    // Valid update via updateStatus
    const updated = batteryService.updateStatus({
      level: 90,
      isCharging: false,
      temperature: 28,
    });
    expect(updated.level).toBe(90);

    startRingingSpy.mockRestore();
  });

  it('9. should handle listener exceptions gracefully without aborting notifications', () => {
    let secondListenerCalled = false;

    const unsub1 = batteryService.subscribeStatus(() => {
      throw new Error('Component crashed during status update');
    });

    const unsub2 = batteryService.subscribeStatus(() => {
      secondListenerCalled = true;
    });

    batteryService.updateStatus({ level: 88 });
    expect(secondListenerCalled).toBe(true);

    unsub1();
    unsub2();
  });

  it('10. should calculate active charging session stats correctly', () => {
    // Unplugged returns null
    batteryService.updateStatus({ isCharging: false });
    expect(batteryService.getSessionStats()).toBeNull();

    // Plug in at 50%
    batteryService.updateStatus({
      level: 50,
      isCharging: true,
      chargingType: 'AC',
    });

    // Advance level to 65%
    batteryService.updateStatus({
      level: 65,
      isCharging: true,
    });

    const stats = batteryService.getSessionStats();
    expect(stats).not.toBeNull();
    expect(stats?.gained).toBe(15);
    expect(stats?.elapsedMinutes).toBeGreaterThanOrEqual(1);
    expect(stats?.speedPerHour).toBeGreaterThanOrEqual(0);
  });

  it('11. should not re-trigger battery alarm after stopAlarm is called during the same charging session', async () => {
    await batteryService.updateSettings({
      fullChargeAlarmEnabled: true,
      fullChargeTarget: 80,
      autoRepeatAlarm: true,
    });

    // Plug in below target
    batteryService.updateStatus({
      level: 75,
      isCharging: true,
      present: true,
    });

    // Cross target: alarm triggers
    batteryService.updateStatus({
      level: 80,
      isCharging: true,
      present: true,
    });

    // User stops alarm
    await batteryService.stopAlarm(true);

    // Further status updates at or above target should NOT re-trigger alarm while still plugged in
    const triggerSpy = jest.spyOn(batteryService, 'triggerBatteryAlarm');
    batteryService.updateStatus({
      level: 81,
      isCharging: true,
      present: true,
    });
    expect(triggerSpy).not.toHaveBeenCalled();
    triggerSpy.mockRestore();
  });

  it('12. should silence critical 5% alarm and not re-trigger after stopAlarm is called', async () => {
    batteryService.setDndActive(false);
    batteryService.updateStatus({
      level: 10,
      isCharging: false,
      present: true,
    });

    const triggerSpy = jest.spyOn(batteryService, 'triggerBatteryAlarm');

    // Drops to 5% critical
    batteryService.updateStatus({
      level: 5,
      isCharging: false,
      present: true,
    });
    expect(triggerSpy).toHaveBeenCalledTimes(1);

    // User stops the alarm
    await batteryService.stopAlarm(true);

    // Subsequent readings at 4% or 3% should NOT re-trigger while remaining in the same critical state
    batteryService.updateStatus({
      level: 3,
      isCharging: false,
      present: true,
    });
    expect(triggerSpy).toHaveBeenCalledTimes(1);
    triggerSpy.mockRestore();
  });

  it('13. should suppress all battery alarms when Complete DND is enabled', async () => {
    batteryService.setDndActive(true);
    expect(batteryService.getDndActive()).toBe(true);

    const triggerSpy = jest.spyOn(batteryService, 'triggerBatteryAlarm');

    // Try full charge
    batteryService.updateStatus({
      level: 100,
      isCharging: true,
      present: true,
    });
    expect(triggerSpy).not.toHaveBeenCalled();

    // Try critical low
    batteryService.updateStatus({
      level: 4,
      isCharging: false,
      present: true,
    });
    expect(triggerSpy).not.toHaveBeenCalled();

    triggerSpy.mockRestore();
    batteryService.setDndActive(false);
  });
});
