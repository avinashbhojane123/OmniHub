import { NativeModules, Vibration, NativeEventEmitter, AppState } from 'react-native';
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
import { calendarRepository } from '../../database/repositories/CalendarRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';

export interface AlarmState {
  isRinging: boolean;
  title: string;
  habitId?: string;
  eventId?: string;
  taskId?: string;
  description?: string;
  timeString?: string;
  secondsRemaining: number;
  alarmType?: 'battery' | 'habit' | 'event' | 'task';
}

type AlarmListener = (state: AlarmState) => void;

export const ALARM_CHANNEL_ID = 'alarm_clock_channel_v6';

class AlarmService {
  private static instance: AlarmService;
  private listeners: Set<AlarmListener> = new Set();
  private ringTimer: any = null;
  private foregroundMonitorTimer: any = null;
  private lastTriggeredMinute: string = '';
  private cachedHabits: Array<{ id: string; name: string; reminderTime: string; daysOfWeek: number[] }> = [];
  private cachedEvents: Array<{ id: string; title: string; date: string; time: string; description?: string }> = [];
  private cachedTasks: Array<{ id: string; title: string; date: string; time: string; description?: string; isLoud: boolean }> = [];
  private autoSnoozeCounts: Map<string, number> = new Map();

  private currentState: AlarmState = {
    isRinging: false,
    title: '',
    habitId: undefined,
    eventId: undefined,
    description: undefined,
    timeString: undefined,
    secondsRemaining: 60,
    alarmType: undefined,
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
        id: ALARM_CHANNEL_ID,
        name: 'Alarm Clock Ringing',
        description: 'Loud ringing alarms with vibration for your scheduled routines',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
        vibrationPattern: [0, 800, 400, 800],
        lights: true,
        bypassDnd: true,
      });

      // 2. Register Foreground Notifee Event Listener for Alarm Actions
      notifee.onForegroundEvent(async (event: Event) => {
        await this.handleNotificationAction(event);
      });

      // 3. Start foreground minute-level clock checker (skipped in test runner)
      this.startForegroundMonitor();

      // 4. Restore scheduled alarms from SQLite habits, calendar events, and tasks
      await this.restoreAllHabitAlarms();
      await this.restoreAllEventAlarms();
      await this.restoreAllTaskAlarms();

      // 5. Setup NativeEventEmitter for native onAlarmRinging events
      if (AlarmRingtone) {
        try {
          const eventEmitter = new NativeEventEmitter(AlarmRingtone);
          eventEmitter.addListener('onAlarmRinging', (data: any) => {
            if (data?.isRinging) {
              const rawId = data.alarmId || '';
              const isEv = rawId.startsWith('alarm_event_');
              const isTk = rawId.startsWith('alarm_task_');
              const isBat = rawId.startsWith('battery_') || rawId === 'battery_alarm';
              const isHb = rawId.startsWith('alarm_') && !isEv && !isTk && !isBat;
              this.startRinging(
                data.title || 'Alarm',
                isHb ? rawId.replace('alarm_', '') : undefined,
                isBat ? 'Battery Alarm' : undefined,
                isEv ? rawId.replace('alarm_event_', '') : undefined,
                data.description,
                isTk ? rawId.replace('alarm_task_', '') : undefined,
                true, // skipNativePlay = true because native AlarmReceiver is already playing
                isBat ? 'battery' : (isTk ? 'task' : (isEv ? 'event' : (isHb ? 'habit' : undefined)))
              );
            } else {
              this.stopRinging();
            }
          });
        } catch (eeErr) {
          console.warn('NativeEventEmitter onAlarmRinging error:', eeErr);
        }

        // 6. Sync on AppState change (when user opens app or unlocks phone)
        AppState.addEventListener('change', async (nextState) => {
          if (nextState === 'active') {
            await this.checkNativeRingingState();
          }
        });
      }

      await this.checkNativeRingingState();
    } catch (e) {
      console.warn('AlarmService initialization error:', e);
    }
  }

  public async checkNativeRingingState(): Promise<void> {
    if (!AlarmRingtone?.getRingingState) return;
    try {
      const nativeState = await AlarmRingtone.getRingingState();
      if (nativeState?.isRinging && !this.currentState.isRinging) {
        const rawId = nativeState.alarmId || '';
        const isEv = rawId.startsWith('alarm_event_');
        const isTk = rawId.startsWith('alarm_task_');
        const isBat = rawId.startsWith('battery_') || rawId === 'battery_alarm';
        const isHb = rawId.startsWith('alarm_') && !isEv && !isTk && !isBat;
        this.startRinging(
          nativeState.title || 'Alarm',
          isHb ? rawId.replace('alarm_', '') : undefined,
          isBat ? 'Battery Alarm' : undefined,
          isEv ? rawId.replace('alarm_event_', '') : undefined,
          nativeState.description,
          isTk ? rawId.replace('alarm_task_', '') : undefined,
          true, // skipNativePlay = true
          isBat ? 'battery' : (isTk ? 'task' : (isEv ? 'event' : (isHb ? 'habit' : undefined)))
        );
      }
    } catch {}
  }

  public async handleNotificationAction(event: Event): Promise<void> {
    const { type, detail } = event;
    const actionId = detail?.pressAction?.id;
    const taskId = detail?.notification?.data?.taskId as string | undefined;
    const notificationId = detail?.notification?.id;

    if (type === EventType.ACTION_PRESS) {
      if (actionId === 'stop_alarm' || actionId === 'dismiss') {
        this.stopRinging();
        const habitId = detail?.notification?.data?.habitId as string | undefined;
        if (habitId) {
          this.rescheduleNextHabitAlarm(habitId);
        }
        try {
          if (notificationId) {
            await notifee.cancelNotification(notificationId);
          }
          await notifee.cancelNotification('active_battery_alarm');
        } catch {}
      } else if (actionId === 'done' || actionId === 'complete_task') {
        this.stopRinging();
        if (taskId) {
          try {
            const { taskService } = await import('../tasks/TaskService');
            await taskService.completeTask(taskId);
          } catch {
            const { taskRepository } = await import('../../database/repositories/TaskRepository');
            await taskRepository.update(taskId, {
              status: 'completed',
              completedAt: new Date().toISOString(),
            });
          }
        }
        try {
          if (notificationId) {
            await notifee.cancelNotification(notificationId);
          }
          await notifee.cancelNotification('active_battery_alarm');
        } catch {}
      } else if (actionId === 'snooze_alarm' || actionId === 'snooze') {
        this.stopRinging();
        if (taskId) {
          try {
            const { notificationService } = await import('../notifications/NotificationService');
            await notificationService.snoozeTaskReminder(taskId, 5);
          } catch {
            await this.snoozeAlarm(5);
          }
        } else {
          await this.snoozeAlarm(5);
        }
        try {
          if (notificationId) {
            await notifee.cancelNotification(notificationId);
          }
          await notifee.cancelNotification('active_battery_alarm');
        } catch {}
      }
    } else if (type === EventType.DELIVERED || type === EventType.PRESS) {
      // If action is explicit stop or snooze on press
      if (actionId === 'stop_alarm' || actionId === 'done') {
        this.stopRinging();
        if (taskId) {
          try {
            const { taskService } = await import('../tasks/TaskService');
            await taskService.completeTask(taskId);
          } catch {}
        }
        if (notificationId) {
          try {
            await notifee.cancelNotification(notificationId);
          } catch {}
        }
        return;
      }
      if (actionId === 'snooze_alarm' || actionId === 'snooze') {
        this.stopRinging();
        if (taskId) {
          try {
            const { notificationService } = await import('../notifications/NotificationService');
            await notificationService.snoozeTaskReminder(taskId, 5);
          } catch {
            await this.snoozeAlarm(5);
          }
        } else {
          await this.snoozeAlarm(5);
        }
        if (notificationId) {
          try {
            await notifee.cancelNotification(notificationId);
          } catch {}
        }
        return;
      }

      // If notification was delivered or pressed as an alarm, ensure ringing state is active
      const isHabitAlarm = detail?.notification?.data?.actionType === 'habit_alarm';
      const isEventAlarm = detail?.notification?.data?.actionType === 'event_alarm';
      const isTaskAlarm = detail?.notification?.data?.actionType === 'task_alarm';

      if (isHabitAlarm && !this.currentState.isRinging) {
        const title = (detail?.notification?.data?.habitName as string) || 'Habit Alarm';
        const habitId = detail?.notification?.data?.habitId as string;
        const timeStr = detail?.notification?.data?.timeStr as string;
        this.startRinging(title, habitId, timeStr);
      } else if (isEventAlarm && !this.currentState.isRinging) {
        const title = (detail?.notification?.data?.eventTitle as string) || 'Event Reminder';
        const eventId = detail?.notification?.data?.eventId as string;
        const timeStr = detail?.notification?.data?.timeStr as string;
        const desc = detail?.notification?.data?.description as string;
        this.startRinging(title, undefined, timeStr, eventId, desc);
      } else if (isTaskAlarm && !this.currentState.isRinging) {
        const title = (detail?.notification?.data?.taskTitle as string) || 'Task Reminder';
        const taskTimeStr = detail?.notification?.data?.timeStr as string;
        const desc = detail?.notification?.data?.description as string;
        this.startRinging(title, undefined, taskTimeStr, undefined, desc, taskId);
      }
    }
  }

  /**
   * Start ringing for up to 60 seconds (1 minute), like a real alarm app
   */
  public async startRinging(
    title: string,
    habitId?: string,
    timeString?: string,
    eventId?: string,
    description?: string,
    taskId?: string,
    skipNativePlay: boolean = false,
    alarmType?: 'battery' | 'habit' | 'event' | 'task'
  ): Promise<void> {
    // If already ringing, don't restart
    if (this.currentState.isRinging) return;

    const isBattery =
      alarmType === 'battery' ||
      timeString === 'Battery Alarm' ||
      title.toLowerCase().includes('battery');

    if (!isBattery) {
      const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifsEnabled) return;
    }

    const soundEnabled = isBattery
      ? (await settingsRepository.get('battery_sound', 'true')) === 'true'
      : (await settingsRepository.get('notificationSound', 'true')) === 'true';
    const vibrationEnabled = isBattery
      ? (await settingsRepository.get('battery_vibration', 'true')) === 'true'
      : (await settingsRepository.get('notificationVibration', 'true')) === 'true';

    this.currentState = {
      isRinging: true,
      title,
      habitId,
      eventId,
      taskId,
      description,
      timeString,
      secondsRemaining: 60,
      alarmType: isBattery
        ? 'battery'
        : taskId
        ? 'task'
        : eventId
        ? 'event'
        : habitId
        ? 'habit'
        : undefined,
    };
    this.notify();

    // Start native loud alarm ringtone only if not already playing natively
    if (!skipNativePlay) {
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
    }

    // Only display fallback notification on platforms without native alarm receiver to avoid duplicate notifications
    if (!AlarmRingtone) {
      try {
        await notifee.displayNotification({
          id: 'active_ringing_alarm',
          title: `⏰ Alarm: ${title}`,
          body: `Ringing now! Tap to stop or snooze.`,
          android: {
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_notification',
            category: AndroidCategory.ALARM,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            asForegroundService: true,
            ongoing: true,
            autoCancel: false,
            pressAction: { id: 'default' },
            fullScreenAction: { id: 'default' },
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
            actionType: eventId ? 'event_alarm' : 'habit_alarm',
            habitId: String(habitId || ''),
            eventId: String(eventId || ''),
            eventTitle: String(title || ''),
            timeStr: String(timeString || ''),
            description: String(description || ''),
          },
        });
      } catch (err) {
        console.warn('Failed to display ringing notification:', err);
      }
    }

    // Clear any existing timer
    if (this.ringTimer) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }

    // Auto-reschedule next occurrence for this habit so future daily alarms fire reliably
    if (habitId) {
      this.rescheduleNextHabitAlarm(habitId);
    }

    // Countdown timer up to 60 seconds (1 minute auto-stop / auto-snooze)
    this.ringTimer = setInterval(() => {
      const nextRemaining = this.currentState.secondsRemaining - 1;
      if (nextRemaining <= 0) {
        this.handleAlarmTimeout();
      } else {
        this.currentState.secondsRemaining = nextRemaining;
        this.notify();
      }
    }, 1000);
  }

  /**
   * Handles alarm timeout after 60 seconds without user response.
   * Auto-snoozes up to 3 times (10 minutes each), and posts a high-priority missed alarm notification if exceeded.
   */
  private async handleAlarmTimeout(): Promise<void> {
    const active = { ...this.currentState };
    const alarmKey = active.habitId || active.eventId || active.taskId || active.title || 'alarm';
    const currentCount = this.autoSnoozeCounts.get(alarmKey) || 0;

    // Stop current audio/vibration ringing without wiping auto-snooze counter
    this.stopRinging(false);

    if (currentCount < 3) {
      const nextCount = currentCount + 1;
      this.autoSnoozeCounts.set(alarmKey, nextCount);

      // Auto-snooze for 10 minutes
      const snoozeMinutes = 10;
      await this.snoozeAlarm(snoozeMinutes);

      try {
        await notifee.displayNotification({
          id: `auto_snoozed_${alarmKey}`,
          title: `⏰ Auto-Snoozed: ${active.title}`,
          body: `Alarm rang for 60s and was auto-snoozed for ${snoozeMinutes}m (Attempt ${nextCount}/3). Tap to dismiss.`,
          android: {
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_notification',
            category: AndroidCategory.ALARM,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            pressAction: { id: 'default' },
            actions: [
              {
                title: '🔕 DISMISS',
                pressAction: { id: 'dismiss' },
              },
            ],
          },
          data: {
            actionType: active.taskId ? 'task_alarm' : (active.eventId ? 'event_alarm' : 'habit_alarm'),
            habitId: active.habitId || '',
            eventId: active.eventId || '',
            taskId: active.taskId || '',
            taskTitle: active.title || '',
            timeStr: active.timeString || '',
          },
        });
      } catch (err) {
        console.warn('Failed to display auto-snooze notification:', err);
      }
    } else {
      // Reached maximum auto-snoozes (3 attempts) -> Mark as Missed Alarm
      this.autoSnoozeCounts.delete(alarmKey);
      try {
        await notifee.displayNotification({
          id: `missed_alarm_${alarmKey}`,
          title: `⚠️ Missed Alarm: ${active.title}`,
          body: `Scheduled alarm at ${active.timeString || 'routine time'} was not answered and has ended. Tap to view.`,
          android: {
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_notification',
            category: AndroidCategory.REMINDER,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            pressAction: { id: 'default' },
          },
          data: {
            actionType: active.taskId ? 'task_alarm' : (active.eventId ? 'event_alarm' : 'habit_alarm'),
            habitId: active.habitId || '',
            eventId: active.eventId || '',
            taskId: active.taskId || '',
            taskTitle: active.title || '',
            timeStr: active.timeString || '',
          },
        });
      } catch (err) {
        console.warn('Failed to display missed alarm notification:', err);
      }
    }
  }

  /**
   * Automatically reschedule the next occurrence of a habit alarm
   */
  public async rescheduleNextHabitAlarm(habitId: string): Promise<void> {
    try {
      const cached = this.cachedHabits.find((h) => h.id === habitId);
      if (cached) {
        await this.scheduleHabitAlarm(cached.id, cached.name, cached.reminderTime, cached.daysOfWeek, true);
        return;
      }
      const habit = await habitRepository.findById(habitId);
      if (habit && habit.reminderTime) {
        const days = habit.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
        await this.scheduleHabitAlarm(habit.id, habit.name, habit.reminderTime, days, true);
      }
    } catch (e) {
      console.warn('Failed to reschedule next habit alarm:', e);
    }
  }

  /**
   * Check if Android exact alarm permission is granted
   */
  public async checkExactAlarmPermission(): Promise<boolean> {
    try {
      const settings = await notifee.getNotificationSettings();
      if (settings?.android?.alarm !== undefined) {
        return settings.android.alarm === 1; // 1 = ENABLED
      }
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Open Android system settings for Exact Alarms & Reminders
   */
  public async openExactAlarmSettings(): Promise<void> {
    try {
      await notifee.openAlarmPermissionSettings();
    } catch (e) {
      console.warn('Failed to open alarm permission settings:', e);
    }
  }

  public async openAutoStartSettings(): Promise<void> {
    try {
      if (AlarmRingtone?.openAutoStartSettings) {
        await AlarmRingtone.openAutoStartSettings();
      }
    } catch {}
  }

  public async openBatterySaverSettings(): Promise<void> {
    try {
      if (AlarmRingtone?.openBatterySaverSettings) {
        await AlarmRingtone.openBatterySaverSettings();
      }
    } catch {}
  }

  public async openFullScreenSettings(): Promise<void> {
    try {
      if (AlarmRingtone?.openFullScreenSettings) {
        await AlarmRingtone.openFullScreenSettings();
      }
    } catch {}
  }

  public stopRinging(resetAutoSnooze: boolean = true): void {
    const ringingHabitId = this.currentState.habitId;

    if (resetAutoSnooze) {
      const alarmKey = this.currentState.habitId || this.currentState.eventId || this.currentState.taskId || this.currentState.title;
      if (alarmKey) {
        this.autoSnoozeCounts.delete(alarmKey);
      }
    }

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

    try {
      notifee.cancelNotification('active_battery_alarm');
    } catch {}

    this.currentState = {
      isRinging: false,
      title: '',
      habitId: undefined,
      eventId: undefined,
      description: undefined,
      timeString: undefined,
      secondsRemaining: 60,
      alarmType: undefined,
    };
    this.notify();

    if (ringingHabitId) {
      this.rescheduleNextHabitAlarm(ringingHabitId);
    }
  }

  /**
   * Snooze alarm for given minutes
   */
  public async snoozeAlarm(minutes?: number): Promise<void> {
    const isBattery = this.currentState.alarmType === 'battery';
    const habitId = this.currentState.habitId;
    const eventId = this.currentState.eventId;
    const taskId = this.currentState.taskId;
    const description = this.currentState.description;
    const title = this.currentState.title;
    const timeString = this.currentState.timeString;
    this.stopRinging();

    if (!isBattery) {
      const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifsEnabled) return;
    }

    const soundEnabled = isBattery
      ? (await settingsRepository.get('battery_sound', 'true')) === 'true'
      : (await settingsRepository.get('notificationSound', 'true')) === 'true';
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

    const actionType = isBattery
      ? 'battery_alarm'
      : taskId
      ? 'task_alarm'
      : eventId
      ? 'event_alarm'
      : 'habit_alarm';
    const targetId = isBattery ? 'battery' : (taskId || eventId || habitId || Date.now());
    const channelId = isBattery ? 'battery_charge_channel' : ALARM_CHANNEL_ID;

    try {
      await notifee.createTriggerNotification(
        {
          id: `alarm_snooze_${targetId}`,
          title: `⏰ Snoozed: ${title}`,
          body: description || `Snoozed alarm ringing now!`,
          android: {
            channelId,
            smallIcon: 'ic_notification',
            category: AndroidCategory.ALARM,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            sound: soundEnabled ? 'default' : undefined,
            ongoing: true,
            pressAction: { id: 'default' },
            fullScreenAction: { id: 'default' },
            actions: [
              { title: '🔕 STOP ALARM', pressAction: { id: 'stop_alarm' } },
              { title: '💤 SNOOZE (5m)', pressAction: { id: 'snooze_alarm' } },
            ],
          },
          data: {
            actionType,
            taskId: String(taskId || ''),
            habitId: String(habitId || ''),
            eventId: String(eventId || ''),
            taskTitle: String(title || ''),
            habitName: String(title || ''),
            timeStr: String(timeString || ''),
            description: description || '',
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
    daysOfWeek?: number[],
    isReschedule: boolean = false
  ): Promise<void> {
    if (!timeStr) return;

    try {
      const alarmKey = `alarm_habit_${habitId}`;
      // Cancel any existing alarm notification for this habit (both legacy and new format)
      await notifee.cancelNotification(alarmKey);
      await notifee.cancelNotification(`alarm_${habitId}`);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(alarmKey);
          await AlarmRingtone.cancelExactAlarm(`alarm_${habitId}`);
        } catch {}
      }

      const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifsEnabled) return;
      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';

      // Parse time string e.g. "04:30 PM" or "16:30"
      const parsed = this.parseTime(timeStr);
      if (!parsed) return;

      const triggerDate = this.calculateNextOccurrence(parsed.hours, parsed.minutes, daysOfWeek, isReschedule);
      if (!triggerDate) return;

      // Schedule native exact alarm clock for guaranteed wake-up & ringing over lockscreen
      if (AlarmRingtone?.scheduleExactAlarm) {
        try {
          await AlarmRingtone.scheduleExactAlarm(
            alarmKey,
            triggerDate.getTime(),
            `Habit: ${habitName}`,
            `Time for your daily routine: ${habitName}!`
          );
        } catch (e) {
          console.warn('Native exact habit alarm error:', e);
        }
      } else {
        // Fallback for non-native environments (Jest / iOS)
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: triggerDate.getTime(),
          alarmManager: {
            allowWhileIdle: true,
          },
        };

        const notificationPayload = {
          id: alarmKey,
          title: `⏰ Alarm: ${habitName}`,
          body: `Time for your routine: ${habitName}!`,
          android: {
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_notification',
            category: AndroidCategory.ALARM,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            sound: soundEnabled ? 'default' : undefined,
            ongoing: true,
            pressAction: { id: 'default' },
            fullScreenAction: { id: 'default' },
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
        };

        try {
          await notifee.createTriggerNotification(notificationPayload, trigger);
        } catch {
          const fallbackTrigger: TimestampTrigger = {
            type: TriggerType.TIMESTAMP,
            timestamp: triggerDate.getTime(),
          };
          await notifee.createTriggerNotification(notificationPayload, fallbackTrigger);
        }
      }

      // Keep local cachedHabits synchronized so foreground monitor detects it immediately
      const days = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
      const existingIdx = this.cachedHabits.findIndex((h) => h.id === habitId);
      if (existingIdx >= 0) {
        this.cachedHabits[existingIdx] = { id: habitId, name: habitName, reminderTime: timeStr, daysOfWeek: days };
      } else {
        this.cachedHabits.push({ id: habitId, name: habitName, reminderTime: timeStr, daysOfWeek: days });
      }
    } catch (err) {
      console.warn('Failed to schedule habit alarm:', err);
    }
  }

  public async cancelHabitAlarm(habitId: string): Promise<void> {
    try {
      const alarmKey = `alarm_habit_${habitId}`;
      await notifee.cancelNotification(alarmKey);
      await notifee.cancelNotification(`alarm_${habitId}`);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(alarmKey);
          await AlarmRingtone.cancelExactAlarm(`alarm_${habitId}`);
        } catch {}
      }
      this.cachedHabits = this.cachedHabits.filter((h) => h.id !== habitId);
    } catch {}
  }

  /**
   * Schedule one-shot calendar event reminder with loud alarm
   */
  public async scheduleEventAlarm(
    eventId: string,
    title: string,
    date: string,
    timeStr: string,
    description?: string
  ): Promise<void> {
    try {
      await notifee.cancelNotification(`alarm_event_${eventId}`);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(`alarm_event_${eventId}`);
        } catch {}
      }

      const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifsEnabled) return;
      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';

      const parsed = this.parseTime(timeStr);
      if (!parsed) return;

      const dateClean = date.includes('T') ? date.split('T')[0] : date;
      const [year, month, day] = dateClean.split('-').map(Number);
      let target = new Date(year, month - 1, day, parsed.hours, parsed.minutes, 0, 0);

      const now = Date.now();
      // If time is within the current minute (e.g. user set alarm for right now to test), schedule for 2s from now
      if (target.getTime() <= now && target.getTime() >= now - 60000) {
        target = new Date(now + 2000);
      }

      if (target.getTime() > now) {
        // Schedule native exact alarm for guaranteed wake-up & ringing
        if (AlarmRingtone?.scheduleExactAlarm) {
          try {
            await AlarmRingtone.scheduleExactAlarm(
              `alarm_event_${eventId}`,
              target.getTime(),
              title,
              description || 'Scheduled event time reached!'
            );
          } catch (e) {
            console.warn('Native exact event alarm error:', e);
          }
        }

        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: target.getTime(),
          alarmManager: {
            allowWhileIdle: true,
          },
        };

        const notificationPayload = {
          id: `alarm_event_${eventId}`,
          title: `⏰ Alarm: ${title}`,
          body: description ? `${description}` : `Scheduled event time reached!`,
          android: {
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_notification',
            category: AndroidCategory.ALARM,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            sound: soundEnabled ? 'default' : undefined,
            ongoing: true,
            pressAction: { id: 'default' },
            fullScreenAction: { id: 'default' },
            actions: [
              { title: '🔕 STOP ALARM', pressAction: { id: 'stop_alarm' } },
              { title: '💤 SNOOZE (5m)', pressAction: { id: 'snooze_alarm' } },
            ],
          },
          data: {
            actionType: 'event_alarm',
            eventId,
            eventTitle: title,
            timeStr,
            description: description || '',
          },
        };

        try {
          await notifee.createTriggerNotification(notificationPayload, trigger);
        } catch {
          const fallbackTrigger: TimestampTrigger = {
            type: TriggerType.TIMESTAMP,
            timestamp: target.getTime(),
          };
          await notifee.createTriggerNotification(notificationPayload, fallbackTrigger);
        }
      }

      // Synchronize cached events
      const existingIdx = this.cachedEvents.findIndex((e) => e.id === eventId);
      if (existingIdx >= 0) {
        this.cachedEvents[existingIdx] = { id: eventId, title, date, time: timeStr, description };
      } else {
        this.cachedEvents.push({ id: eventId, title, date, time: timeStr, description });
      }
    } catch (err) {
      console.warn('Failed to schedule event alarm:', err);
    }
  }

  public async cancelEventAlarm(eventId: string): Promise<void> {
    try {
      await notifee.cancelNotification(`alarm_event_${eventId}`);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(`alarm_event_${eventId}`);
        } catch {}
      }
      this.cachedEvents = this.cachedEvents.filter((e) => e.id !== eventId);
    } catch {}
  }

  public async restoreAllEventAlarms(): Promise<void> {
    try {
      const events = await calendarRepository.findUpcomingActive();
      this.cachedEvents = events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        time: ev.time,
        description: ev.description,
      }));

      for (const ev of events) {
        if (ev.ringAlarm) {
          await this.scheduleEventAlarm(ev.id, ev.title, ev.date, ev.time, ev.description);
        }
      }
    } catch (err) {
      console.warn('Failed to restore event alarms:', err);
    }
  }

  public async restoreAllHabitAlarms(): Promise<void> {
    try {
      const habits = await habitRepository.findActive();
      this.cachedHabits = habits
        .filter((h) => Boolean(h.reminderTime))
        .map((h) => ({
          id: h.id,
          name: h.name,
          reminderTime: h.reminderTime!,
          daysOfWeek: h.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
        }));

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

  public async scheduleTaskAlarm(
    taskId: string,
    title: string,
    date: string,
    timeStr: string,
    description?: string,
    isLoud: boolean = true
  ): Promise<void> {
    try {
      const existingIdx = this.cachedTasks.findIndex((t) => t.id === taskId);
      const item = { id: taskId, title, date, time: timeStr, description, isLoud };
      if (existingIdx >= 0) {
        this.cachedTasks[existingIdx] = item;
      } else {
        this.cachedTasks.push(item);
      }
    } catch (err) {
      console.warn('Failed to schedule task alarm in AlarmService:', err);
    }
  }

  public async cancelTaskAlarm(taskId: string): Promise<void> {
    try {
      this.cachedTasks = this.cachedTasks.filter((t) => t.id !== taskId);
    } catch {}
  }

  public async restoreAllTaskAlarms(): Promise<void> {
    try {
      const { taskRepository } = await import('../../database/repositories/TaskRepository');
      const allTasks = await taskRepository.findAll();
      this.cachedTasks = allTasks
        .filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && Boolean(t.date && t.startTime))
        .map((t) => ({
          id: t.id,
          title: t.title,
          date: t.date,
          time: t.startTime!,
          description: t.description || t.notes,
          isLoud: Boolean(t.isLoudAlarm || t.priority === 'high' || t.recurrenceRule?.isLoudAlarm),
        }));
    } catch (err) {
      console.warn('Failed to restore task alarms in AlarmService:', err);
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

      if (this.cachedHabits.length === 0) {
        try {
          const habits = await habitRepository.findActive();
          this.cachedHabits = habits
            .filter((h) => Boolean(h.reminderTime))
            .map((h) => ({
              id: h.id,
              name: h.name,
              reminderTime: h.reminderTime!,
              daysOfWeek: h.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
            }));
        } catch {}
      }

      if (this.cachedEvents.length === 0) {
        try {
          const events = await calendarRepository.findUpcomingActive();
          this.cachedEvents = events.map((ev) => ({
            id: ev.id,
            title: ev.title,
            date: ev.date,
            time: ev.time,
            description: ev.description,
          }));
        } catch {}
      }

      try {
        const currentDayIndex = now.getDay();
        for (const habit of this.cachedHabits) {
          if (!habit.daysOfWeek.includes(currentDayIndex)) continue;

          // Normalize habit time
          const parsed = this.parseTime(habit.reminderTime);
          if (parsed && parsed.hours === currentHours && parsed.minutes === currentMinutes) {
            this.lastTriggeredMinute = currentKey;
            this.startRinging(habit.name, habit.id, habit.reminderTime);
            break;
          }
        }

        // Check scheduled calendar event alarms
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        for (const ev of this.cachedEvents) {
          if (ev.date !== todayIso) continue;
          const parsed = this.parseTime(ev.time);
          if (parsed && parsed.hours === currentHours && parsed.minutes === currentMinutes) {
            this.lastTriggeredMinute = currentKey;
            this.startRinging(ev.title, undefined, ev.time, ev.id, ev.description);
            break;
          }
        }

        // Check scheduled loud task alarms
        for (const tk of this.cachedTasks) {
          if (tk.date !== todayIso || !tk.isLoud) continue;
          const parsed = this.parseTime(tk.time);
          if (parsed && parsed.hours === currentHours && parsed.minutes === currentMinutes) {
            this.lastTriggeredMinute = currentKey;
            this.startRinging(tk.title, undefined, tk.time, undefined, tk.description, tk.id);
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

  private calculateNextOccurrence(hours: number, minutes: number, daysOfWeek?: number[], isReschedule: boolean = false): Date {
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    const allowedDays = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];

    // If target is within the past 2 minutes AND this is NOT an automated reschedule of a ringing habit,
    // allow it to fire in 5 seconds for immediate testing
    const diffMs = target.getTime() - now.getTime();
    if (!isReschedule && diffMs > -120000 && diffMs <= 0 && allowedDays.includes(now.getDay())) {
      return new Date(now.getTime() + 5000);
    }

    // If target is today and has already passed (or is currently ringing during auto-reschedule),
    // start checking from tomorrow
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
