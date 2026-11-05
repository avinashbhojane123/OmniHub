import { alarmService, AlarmService, ALARM_CHANNEL_ID } from '../src/services/alarm/AlarmService';
import { getDatabase } from '../src/database/connection';
import notifee, { EventType } from '@notifee/react-native';

describe('AlarmService Comprehensive Test Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(() => {
    alarmService.cleanup();
  });

  afterEach(() => {
    alarmService.cleanup();
  });

  describe('1. Instance and State Management', () => {
    it('should be a singleton instance with default idle state', () => {
      const instance1 = AlarmService.getInstance();
      const instance2 = AlarmService.getInstance();
      expect(instance1).toBe(instance2);
      expect(alarmService).toBe(instance1);

      const state = alarmService.getState();
      expect(state.isRinging).toBe(false);
      expect(state.title).toBe('');
      expect(state.secondsRemaining).toBe(60);
      expect(state.alarmType).toBeUndefined();
    });

    it('should subscribe and notify subscribers on state changes', async () => {
      const states: boolean[] = [];
      const unsubscribe = alarmService.subscribe((st) => {
        states.push(st.isRinging);
      });

      expect(states).toEqual([false]); // Initial notification

      await alarmService.startRinging('Test Routine Alarm', 'habit_123', '07:30 AM');
      expect(states).toEqual([false, true]);

      alarmService.stopRinging(true);
      expect(states).toEqual([false, true, false]);

      unsubscribe();
    });

    it('should isolate subscriber errors so other subscribers are not impacted', async () => {
      let secondSubscriberCalled = false;
      const unsub1 = alarmService.subscribe(() => {
        throw new Error('Exploding UI subscriber');
      });
      const unsub2 = alarmService.subscribe((st) => {
        if (st.isRinging) {
          secondSubscriberCalled = true;
        }
      });

      await alarmService.startRinging('Resilient Alarm');
      expect(secondSubscriberCalled).toBe(true);

      unsub1();
      unsub2();
    });
  });

  describe('2. Time Parsing Robustness', () => {
    it('should parse 12-hour AM/PM formats accurately', () => {
      expect(alarmService.parseTime('07:30 AM')).toEqual({ hours: 7, minutes: 30 });
      expect(alarmService.parseTime('7:30 am')).toEqual({ hours: 7, minutes: 30 });
      expect(alarmService.parseTime('12:00 PM')).toEqual({ hours: 12, minutes: 0 });
      expect(alarmService.parseTime('12:00 AM')).toEqual({ hours: 0, minutes: 0 });
      expect(alarmService.parseTime('11:45 PM')).toEqual({ hours: 23, minutes: 45 });
    });

    it('should parse 24-hour formats accurately', () => {
      expect(alarmService.parseTime('00:00')).toEqual({ hours: 0, minutes: 0 });
      expect(alarmService.parseTime('07:30')).toEqual({ hours: 7, minutes: 30 });
      expect(alarmService.parseTime('16:45')).toEqual({ hours: 16, minutes: 45 });
      expect(alarmService.parseTime('23:59')).toEqual({ hours: 23, minutes: 59 });
    });

    it('should handle times with seconds, ISO strings, clock emojis, and Unicode spaces', () => {
      expect(alarmService.parseTime('07:30:00 AM')).toEqual({ hours: 7, minutes: 30 });
      expect(alarmService.parseTime('16:45:00')).toEqual({ hours: 16, minutes: 45 });
      expect(alarmService.parseTime('⏰ 08:15 AM')).toEqual({ hours: 8, minutes: 15 });
      expect(alarmService.parseTime('09:20\u202FAM')).toEqual({ hours: 9, minutes: 20 });
      expect(alarmService.parseTime('09:20\u00A0PM')).toEqual({ hours: 21, minutes: 20 });
      expect(alarmService.parseTime('2026-11-01T14:30:00.000Z')).toEqual({ hours: 14, minutes: 30 });
    });

    it('should return null for invalid time strings without throwing', () => {
      expect(alarmService.parseTime('')).toBeNull();
      expect(alarmService.parseTime('invalid')).toBeNull();
      expect(alarmService.parseTime('25:00')).toBeNull();
      expect(alarmService.parseTime('12:65')).toBeNull();
      expect(alarmService.parseTime('13:00 PM')).toBeNull();
      expect(alarmService.parseTime(null as any)).toBeNull();
      expect(alarmService.parseTime(undefined as any)).toBeNull();
    });
  });

  describe('3. Next Occurrence Calculation', () => {
    it('should calculate next occurrence on allowed days of week', () => {
      const nextDate = alarmService.calculateNextOccurrence(10, 30, [0, 1, 2, 3, 4, 5, 6], true);
      expect(nextDate).toBeInstanceOf(Date);
      expect(nextDate.getHours()).toBe(10);
      expect(nextDate.getMinutes()).toBe(30);
      expect(nextDate.getSeconds()).toBe(0);
    });

    it('should default to all days if daysOfWeek is empty or invalid', () => {
      const nextDate = alarmService.calculateNextOccurrence(8, 0, [], true);
      expect(nextDate).toBeInstanceOf(Date);
      expect(nextDate.getHours()).toBe(8);
      expect(nextDate.getMinutes()).toBe(0);
    });
  });

  describe('4. Alarm Ringing, Timeout & Snooze', () => {
    it('should correctly set alarmType based on parameters', async () => {
      await alarmService.startRinging('Task Alarm', undefined, '09:00 AM', undefined, undefined, 'task_999');
      let st = alarmService.getState();
      expect(st.isRinging).toBe(true);
      expect(st.alarmType).toBe('task');
      expect(st.taskId).toBe('task_999');

      alarmService.stopRinging(true);

      await alarmService.startRinging('Event Alarm', undefined, '10:00 AM', 'event_888');
      st = alarmService.getState();
      expect(st.isRinging).toBe(true);
      expect(st.alarmType).toBe('event');
      expect(st.eventId).toBe('event_888');

      alarmService.stopRinging(true);

      await alarmService.startRinging('Battery Alarm', undefined, 'Battery Alarm');
      st = alarmService.getState();
      expect(st.isRinging).toBe(true);
      expect(st.alarmType).toBe('battery');
    });

    it('should snooze alarm and preserve state', async () => {
      await alarmService.startRinging('Habit Alarm', 'habit_555', '06:00 AM');
      expect(alarmService.getState().isRinging).toBe(true);

      await alarmService.snoozeAlarm(10);
      expect(alarmService.getState().isRinging).toBe(false);
    });
  });

  describe('5. Notification Action Handling', () => {
    it('should stop ringing on dismiss action press', async () => {
      await alarmService.startRinging('Dismiss Me');
      expect(alarmService.getState().isRinging).toBe(true);

      await alarmService.handleNotificationAction({
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'stop_alarm' },
        },
      });

      expect(alarmService.getState().isRinging).toBe(false);
    });

    it('should stop ringing when actionId is stop_alarm or dismiss on EventType.PRESS', async () => {
      await alarmService.startRinging('Dismiss Via Press');
      expect(alarmService.getState().isRinging).toBe(true);

      await alarmService.handleNotificationAction({
        type: EventType.PRESS,
        detail: {
          pressAction: { id: 'dismiss' },
        },
      });

      expect(alarmService.getState().isRinging).toBe(false);
    });

    it('should not re-trigger stopped alarm when user taps notification body (EventType.PRESS)', async () => {
      await alarmService.startRinging('Body Tap Test');
      alarmService.stopRinging(true);
      expect(alarmService.getState().isRinging).toBe(false);

      await alarmService.handleNotificationAction({
        type: EventType.PRESS,
        detail: {
          pressAction: { id: 'default' },
          notification: {
            data: {
              actionType: 'habit_alarm',
              habitId: 'habit_body_tap',
            },
          },
        },
      });

      expect(alarmService.getState().isRinging).toBe(false);
    });

    it('should stop ringing when notification is swiped away (EventType.DISMISSED)', async () => {
      await alarmService.startRinging('Swipe Me');
      expect(alarmService.getState().isRinging).toBe(true);

      await alarmService.handleNotificationAction({
        type: EventType.DISMISSED,
        detail: {},
      });

      expect(alarmService.getState().isRinging).toBe(false);
    });

    it('should handle snooze action press', async () => {
      await alarmService.startRinging('Snooze Me', 'habit_123');
      expect(alarmService.getState().isRinging).toBe(true);

      await alarmService.handleNotificationAction({
        type: EventType.ACTION_PRESS,
        detail: {
          pressAction: { id: 'snooze_alarm' },
        },
      });

      expect(alarmService.getState().isRinging).toBe(false);
    });
  });

  describe('6. Scheduling and Cancellation Helpers', () => {
    it('should schedule and cancel habit alarms without throwing', async () => {
      await expect(
        alarmService.scheduleHabitAlarm('h_1', 'Morning Meditation', '07:00 AM', [1, 2, 3, 4, 5])
      ).resolves.not.toThrow();

      await expect(alarmService.cancelHabitAlarm('h_1')).resolves.not.toThrow();
    });

    it('should schedule and cancel event alarms without throwing', async () => {
      await expect(
        alarmService.scheduleEventAlarm('ev_1', 'Dentist Visit', '2026-11-15', '14:00', 'Check teeth')
      ).resolves.not.toThrow();

      await expect(alarmService.cancelEventAlarm('ev_1')).resolves.not.toThrow();
    });

    it('should schedule and cancel task alarms without throwing', async () => {
      await expect(
        alarmService.scheduleTaskAlarm('tk_1', 'Tax Filing', '2026-11-20', '11:00', 'Submit return', true)
      ).resolves.not.toThrow();

      await expect(alarmService.cancelTaskAlarm('tk_1')).resolves.not.toThrow();
    });

    it('should verify exact alarm permission check returns boolean', async () => {
      const hasPerm = await alarmService.checkExactAlarmPermission();
      expect(typeof hasPerm).toBe('boolean');
    });
  });

  describe('7. Complete Do Not Disturb (DND)', () => {
    it('should suppress alarms from ringing when DND is active', async () => {
      await alarmService.setDndActive(true);
      expect(await alarmService.isDndActive()).toBe(true);

      await alarmService.startRinging('DND Silent Alarm');
      expect(alarmService.getState().isRinging).toBe(false);

      await alarmService.setDndActive(false);
      expect(await alarmService.isDndActive()).toBe(false);
    });

    it('should silence currently ringing alarms when DND is enabled', async () => {
      await alarmService.setDndActive(false);
      await alarmService.startRinging('Ringing to be muted');
      expect(alarmService.getState().isRinging).toBe(true);

      await alarmService.setDndActive(true);
      expect(alarmService.getState().isRinging).toBe(false);

      await alarmService.setDndActive(false);
    });
  });
});
