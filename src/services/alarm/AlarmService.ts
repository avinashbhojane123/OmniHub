import { NativeModules, Vibration } from 'react-native';
declare const process: any;
const { AlarmRingtone } = NativeModules;
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  TriggerType,
  TimestampTrigger,
  Event,
  EventType,
} from '@notifee/react-native';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';

export interface AlarmState {
  isRinging: boolean;
  title: string;
  habitId?: string;
  timeString?: string;
  secondsRemaining: number;
}

type AlarmListener = (state: AlarmState) => void;

class AlarmService {
  private static instance: AlarmService;
  private listeners: Set<AlarmListener> = new Set();
  private ringTimer: any = null;
  private foregroundMonitorTimer: any = null;
  private lastTriggeredMinute: string = '';

  private currentState: AlarmState = {
    isRinging: false,
    title: '',
    habitId: undefined,
    timeString: undefined,
    secondsRemaining: 60,
  };

  public static getInstance(): AlarmService {
    if (!AlarmService.instance) {
      AlarmService.instance = new AlarmService();
    }
    return AlarmService.instance;
  }

  public subscribe(listener: AlarmListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.currentState });
    }
  }

  public async initialize(): Promise<void> {
    try {
      // 1. Create Dedicated Alarm Notification Channel
      await notifee.createChannel({
        id: 'alarm_clock_channel_v3',
        name: 'Alarm Clock Ringing',
        description: 'Loud ringing alarms with vibration for your scheduled routines',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
        vibrationPattern: [500, 1000, 500, 1000],
        lights: true,
        bypassDnd: true,
      });

      // 2. Register Foreground Notifee Event Listener for Alarm Actions
      notifee.onForegroundEvent(async (event: Event) => {
        await this.handleNotificationAction(event);
      });

      // 3. Start foreground minute-level clock checker (skipped in test runner)
      this.startForegroundMonitor();

      // 4. Restore scheduled alarms from SQLite habits
      await this.restoreAllHabitAlarms();
    } catch (e) {
      console.warn('AlarmService initialization error:', e);
    }
  }

  public async handleNotificationAction(event: Event): Promise<void> {
    const { type, detail } = event;
    const actionId = detail?.pressAction?.id;

    if (type === EventType.ACTION_PRESS) {
      if (actionId === 'stop_alarm') {
        this.stopRinging();
      } else if (actionId === 'snooze_alarm') {
        this.snoozeAlarm(5);
      }
    } else if (type === EventType.DELIVERED) {
      // If notification was delivered as an alarm, ensure ringing state is active
      const isHabitAlarm = detail?.notification?.data?.actionType === 'habit_alarm';
      if (isHabitAlarm && !this.currentState.isRinging) {
        const title = (detail?.notification?.data?.habitName as string) || 'Habit Alarm';
        const habitId = detail?.notification?.data?.habitId as string;
        const timeStr = detail?.notification?.data?.timeStr as string;
        this.startRinging(title, habitId, timeStr);
      }
    }
  }

  /**
   * Start ringing for up to 60 seconds (1 minute), like a real alarm app
   */
  public async startRinging(title: string, habitId?: string, timeString?: string): Promise<void> {
    // If already ringing, don't restart
    if (this.currentState.isRinging) return;

    const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
    if (!notifsEnabled) return;

    const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';
    const vibrationEnabled = (await settingsRepository.get('notificationVibration', 'true')) === 'true';

    this.currentState = {
      isRinging: true,
      title,
      habitId,
      timeString,
      secondsRemaining: 60,
    };
    this.notify();

    // Start native loud alarm ringtone and looping hardware vibration
    if (AlarmRingtone) {
      try {
        AlarmRingtone.play(soundEnabled, vibrationEnabled);
      } catch (e) {
        console.warn('AlarmRingtone error:', e);
      }
    } else if (vibrationEnabled) {
      try {
        Vibration.vibrate([0, 800, 400, 800], true);
      } catch (e) {
        console.warn('Vibration error:', e);
      }
    }

    // Display persistent ringing notification with sound and actions
    try {
      await notifee.displayNotification({
        id: 'active_ringing_alarm',
        title: `⏰ Alarm: ${title}`,
        body: `Ringing now! Tap to stop or snooze.`,
        android: {
          channelId: 'alarm_clock_channel_v3',
          category: AndroidCategory.ALARM,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          sound: soundEnabled ? 'default' : undefined,
          ongoing: true,
          autoCancel: false,
          pressAction: { id: 'default' },
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
        data: {
          actionType: 'habit_alarm',
          habitId: String(habitId || ''),
          habitName: String(title || ''),
          timeStr: String(timeString || ''),
        },
      });
    } catch (err) {
      console.warn('Failed to display ringing notification:', err);
    }

    // Clear any existing timer
    if (this.ringTimer) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }

    // Countdown timer up to 60 seconds (1 minute auto-stop)
    this.ringTimer = setInterval(() => {
      const nextRemaining = this.currentState.secondsRemaining - 1;
      if (nextRemaining <= 0) {
        this.stopRinging();
      } else {
        this.currentState.secondsRemaining = nextRemaining;
        this.notify();
      }
    }, 1000);
  }

  /**
   * Stop alarm ringing immediately
   */
  public stopRinging(): void {
    if (this.ringTimer) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }

    if (AlarmRingtone) {
      try {
        AlarmRingtone.stop();
      } catch {}
    }

    try {
      Vibration.cancel();
    } catch {}

    try {
      notifee.cancelNotification('active_ringing_alarm');
    } catch {}

    this.currentState = {
      isRinging: false,
      title: '',
      habitId: undefined,
      timeString: undefined,
      secondsRemaining: 60,
    };
    this.notify();
  }

  /**
   * Snooze alarm for given minutes
   */
  public async snoozeAlarm(minutes?: number): Promise<void> {
    const habitId = this.currentState.habitId;
    const title = this.currentState.title;
    const timeString = this.currentState.timeString;
    this.stopRinging();

    const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
    if (!notifsEnabled) return;
    const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';
    const defaultSnooze = await settingsRepository.get('defaultSnoozeMinutes', '5');
    const snoozeMinutes = minutes ?? (parseInt(defaultSnooze, 10) || 5);

    const snoozeTarget = new Date(Date.now() + snoozeMinutes * 60 * 1000);
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: snoozeTarget.getTime(),
      alarmManager: {
        allowWhileIdle: true,
      },
    };

    try {
      await notifee.createTriggerNotification(
        {
          id: `alarm_snooze_${habitId || Date.now()}`,
          title: `⏰ Snoozed Alarm: ${title}`,
          body: `Snoozed alarm ringing now!`,
          android: {
            channelId: 'alarm_clock_channel_v3',
            category: AndroidCategory.ALARM,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            sound: soundEnabled ? 'default' : undefined,
            ongoing: true,
            pressAction: { id: 'default' },
            actions: [
              { title: '🔕 STOP ALARM', pressAction: { id: 'stop_alarm' } },
              { title: '💤 SNOOZE (5m)', pressAction: { id: 'snooze_alarm' } },
            ],
          },
          data: {
            actionType: 'habit_alarm',
            habitId: String(habitId || ''),
            habitName: String(title || ''),
            timeStr: String(timeString || ''),
          },
        },
        trigger
      );
    } catch (err) {
      console.warn('Failed to schedule snooze alarm:', err);
    }
  }

  /**
   * Schedule next occurrence of habit alarm with Android AlarmManager
   */
  public async scheduleHabitAlarm(
    habitId: string,
    habitName: string,
    timeStr?: string,
    daysOfWeek?: number[]
  ): Promise<void> {
    if (!timeStr) return;

    try {
      // Cancel any existing alarm notification for this habit
      await notifee.cancelNotification(`alarm_${habitId}`);

      const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifsEnabled) return;
      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';

      // Parse time string e.g. "04:30 PM" or "16:30"
      const parsed = this.parseTime(timeStr);
      if (!parsed) return;

      const triggerDate = this.calculateNextOccurrence(parsed.hours, parsed.minutes, daysOfWeek);
      if (!triggerDate) return;

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: triggerDate.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      await notifee.createTriggerNotification(
        {
          id: `alarm_${habitId}`,
          title: `⏰ Alarm: ${habitName}`,
          body: `Time for your routine: ${habitName}!`,
          android: {
            channelId: 'alarm_clock_channel_v3',
            category: AndroidCategory.ALARM,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            sound: soundEnabled ? 'default' : undefined,
            ongoing: true,
            pressAction: { id: 'default' },
            actions: [
              { title: '🔕 STOP ALARM', pressAction: { id: 'stop_alarm' } },
              { title: '💤 SNOOZE (5m)', pressAction: { id: 'snooze_alarm' } },
            ],
          },
          data: {
            actionType: 'habit_alarm',
            habitId: String(habitId || ''),
            habitName: String(habitName || ''),
            timeStr: String(timeStr || ''),
          },
        },
        trigger
      );
    } catch (err) {
      console.warn('Failed to schedule habit alarm:', err);
    }
  }

  public async cancelHabitAlarm(habitId: string): Promise<void> {
    try {
      await notifee.cancelNotification(`alarm_${habitId}`);
    } catch {}
  }

  public async restoreAllHabitAlarms(): Promise<void> {
    try {
      const habits = await habitRepository.findAll();
      for (const h of habits) {
        if (h.reminderTime) {
          const days = h.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
          await this.scheduleHabitAlarm(h.id, h.name, h.reminderTime, days);
        }
      }
    } catch (err) {
      console.warn('Failed to restore habit alarms:', err);
    }
  }

  /**
   * Foreground monitor checks every 5 seconds to trigger immediately if alarm time matches current minute
   */
  public startForegroundMonitor(): void {
    if (this.foregroundMonitorTimer) return;
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      return;
    }

    this.foregroundMonitorTimer = setInterval(async () => {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      // Format current time as "HH:mm" in 12hr e.g. "04:30 PM"
      const period = currentHours >= 12 ? 'PM' : 'AM';
      let h12 = currentHours % 12;
      if (h12 === 0) h12 = 12;
      const hh = String(h12).padStart(2, '0');
      const mm = String(currentMinutes).padStart(2, '0');
      const current12Str = `${hh}:${mm} ${period}`;
      const currentKey = `${now.toDateString()}_${current12Str}`;

      if (this.lastTriggeredMinute === currentKey) return;

      try {
        const habits = await habitRepository.findAll();
        const currentDayIndex = now.getDay();

        for (const habit of habits) {
          if (!habit.reminderTime) continue;

          const days = habit.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
          if (!days.includes(currentDayIndex)) continue;

          // Normalize habit time
          const parsed = this.parseTime(habit.reminderTime);
          if (parsed && parsed.hours === currentHours && parsed.minutes === currentMinutes) {
            this.lastTriggeredMinute = currentKey;
            this.startRinging(habit.name, habit.id, habit.reminderTime);
            break;
          }
        }
      } catch {}
    }, 5000);
  }

  public stopForegroundMonitor(): void {
    if (this.foregroundMonitorTimer) {
      clearInterval(this.foregroundMonitorTimer);
      this.foregroundMonitorTimer = null;
    }
  }

  private parseTime(timeStr: string): { hours: number; minutes: number } | null {
    const clean = timeStr.replace(/[⏰🕒]/g, '').trim();

    // 12-hour format e.g. "04:30 PM"
    const ampmMatch = clean.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = parseInt(ampmMatch[2], 10);
      const p = ampmMatch[3].toUpperCase();
      if (p === 'PM' && h < 12) h += 12;
      if (p === 'AM' && h === 12) h = 0;
      return { hours: h, minutes: m };
    }

    // 24-hour format e.g. "16:30"
    const h24Match = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) {
      return {
        hours: parseInt(h24Match[1], 10),
        minutes: parseInt(h24Match[2], 10),
      };
    }

    return null;
  }

  private calculateNextOccurrence(hours: number, minutes: number, daysOfWeek?: number[]): Date {
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    const allowedDays = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];

    // If today's time has already passed, start checking from tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    // Find the next day that is allowed
    for (let i = 0; i < 7; i++) {
      if (allowedDays.includes(target.getDay())) {
        return target;
      }
      target.setDate(target.getDate() + 1);
    }

    return target;
  }
}

export const alarmService = AlarmService.getInstance();
