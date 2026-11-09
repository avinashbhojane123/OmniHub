import { NativeModules, Vibration, NativeEventEmitter, AppState, Linking, EmitterSubscription } from 'react-native';
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
import { taskRepository } from '../../database/repositories/TaskRepository';
import { SETTINGS_KEYS } from '../../constants/settingsKeys';

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

export type AlarmListener = (state: AlarmState) => void;

export const ALARM_CHANNEL_ID = 'alarm_clock_channel_v6';

export class AlarmService {
  private static instance: AlarmService;
  private listeners: Set<AlarmListener> = new Set();
  private ringTimer: any = null;
  private foregroundMonitorTimer: any = null;
  private triggeredKeysForMinute: Set<string> = new Set();
  private currentMinuteKey: string = '';
  private snoozedUntilMap: Map<string, number> = new Map();

  private cachedHabits: Array<{ id: string; name: string; reminderTime: string; daysOfWeek: number[] }> = [];
  private cachedEvents: Array<{ id: string; title: string; date: string; time: string; description?: string }> = [];
  private cachedTasks: Array<{ id: string; title: string; date: string; time: string; description?: string; isLoud: boolean }> = [];
  private autoSnoozeCounts: Map<string, number> = new Map();

  private habitsLoaded: boolean = false;
  private eventsLoaded: boolean = false;
  private tasksLoaded: boolean = false;
  private isInitialized: boolean = false;

  private nativeEventEmitter: NativeEventEmitter | null = null;
  private nativeRingSub: EmitterSubscription | null = null;
  private appStateSub: { remove: () => void } | null = null;

  private currentState: AlarmState = {
    isRinging: false,
    title: '',
    habitId: undefined,
    eventId: undefined,
    taskId: undefined,
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

  public getState(): AlarmState {
    return { ...this.currentState };
  }

  public subscribe(listener: AlarmListener): () => void {
    this.listeners.add(listener);
    try {
      listener({ ...this.currentState });
    } catch (e) {
      console.warn('[AlarmService] Initial listener call failed:', e);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const stateSnapshot = { ...this.currentState };
    const listenersList = Array.from(this.listeners);
    for (const listener of listenersList) {
      try {
        listener(stateSnapshot);
      } catch (err) {
        console.warn('[AlarmService] Listener notification error:', err);
      }
    }
  }

  private parseAlarmId(rawId: string): {
    cleanHabitId?: string;
    cleanEventId?: string;
    cleanTaskId?: string;
    alarmType?: 'battery' | 'habit' | 'event' | 'task';
    timeString?: string;
  } {
    const isBat =
      rawId.startsWith('battery_') ||
      rawId === 'battery_alarm' ||
      rawId.startsWith('alarm_snooze_battery_');
    const isEv = rawId.startsWith('alarm_event_') || rawId.startsWith('alarm_snooze_event_');
    const isTk = rawId.startsWith('alarm_task_') || rawId.startsWith('alarm_snooze_task_');
    const isHb =
      (rawId.startsWith('alarm_habit_') ||
        rawId.startsWith('alarm_snooze_habit_') ||
        rawId.startsWith('alarm_')) &&
      !isEv &&
      !isTk &&
      !isBat;

    let cleanEventId = isEv ? rawId.replace(/^alarm_(snooze_)?event_/, '') : undefined;
    let cleanTaskId = isTk ? rawId.replace(/^alarm_(snooze_)?task_/, '') : undefined;
    let cleanHabitId = isHb ? rawId.replace(/^alarm_(snooze_)?(habit_)?/, '') : undefined;

    // Fallback resolution if rawId was a legacy 'alarm_snooze_<id>' without explicit type prefix
    if (rawId.startsWith('alarm_snooze_') && !isEv && !isTk && !cleanHabitId && !isBat) {
      const rawTarget = rawId.replace('alarm_snooze_', '');
      if (this.cachedTasks.some((t) => t.id === rawTarget)) {
        cleanTaskId = rawTarget;
      } else if (this.cachedEvents.some((e) => e.id === rawTarget)) {
        cleanEventId = rawTarget;
      } else if (this.cachedHabits.some((h) => h.id === rawTarget)) {
        cleanHabitId = rawTarget;
      }
    }

    const alarmType: 'battery' | 'habit' | 'event' | 'task' | undefined = isBat
      ? 'battery'
      : cleanTaskId
      ? 'task'
      : cleanEventId
      ? 'event'
      : cleanHabitId
      ? 'habit'
      : undefined;

    let timeString: string | undefined = isBat ? 'Battery Alarm' : undefined;
    if (cleanHabitId) {
      const h = this.cachedHabits.find((item) => item.id === cleanHabitId);
      if (h) timeString = h.reminderTime;
    } else if (cleanEventId) {
      const e = this.cachedEvents.find((item) => item.id === cleanEventId);
      if (e) timeString = e.time;
    } else if (cleanTaskId) {
      const t = this.cachedTasks.find((item) => item.id === cleanTaskId);
      if (t) timeString = t.time;
    }

    return { cleanHabitId, cleanEventId, cleanTaskId, alarmType, timeString };
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      await this.checkNativeRingingState();
      return;
    }

    try {
      // 1. Create Dedicated Alarm Notification Channel (isolated error handling for non-Android platforms)
      try {
        await notifee.createChannel({
          id: ALARM_CHANNEL_ID,
          name: 'Alarm Clock Ringing',
          description: 'Loud ringing alarms with vibration for your scheduled routines and tasks',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          sound: 'default',
          vibration: true,
          vibrationPattern: [0, 800, 400, 800],
          lights: true,
          bypassDnd: true,
        });
      } catch (channelErr) {
        console.warn('[AlarmService] Notification channel creation warning:', channelErr);
      }

      // 2. Register Foreground Notifee Event Listener for Alarm Actions
      notifee.onForegroundEvent(async (event: Event) => {
        await this.handleNotificationAction(event);
      });

      // 3. Start foreground minute-level clock checker
      this.startForegroundMonitor();

      // 4. Restore scheduled alarms from SQLite habits, calendar events, and tasks
      await this.restoreAllHabitAlarms();
      await this.restoreAllEventAlarms();
      await this.restoreAllTaskAlarms();

      // 5. Setup NativeEventEmitter for native onAlarmRinging events
      if (AlarmRingtone) {
        try {
          this.nativeEventEmitter = new NativeEventEmitter(AlarmRingtone);
          this.nativeRingSub = this.nativeEventEmitter.addListener('onAlarmRinging', (data: any) => {
            if (data?.isRinging) {
              const rawId = String(data.alarmId || '');
              const parsed = this.parseAlarmId(rawId);

              this.startRinging(
                data.title || 'Alarm',
                parsed.cleanHabitId,
                parsed.timeString,
                parsed.cleanEventId,
                data.description,
                parsed.cleanTaskId,
                true, // skipNativePlay = true because native AlarmReceiver is already playing
                parsed.alarmType
              );
            } else {
              this.stopRinging(true);
            }
          });
        } catch (eeErr) {
          console.warn('[AlarmService] NativeEventEmitter onAlarmRinging error:', eeErr);
        }

        // 6. Sync on AppState change (when user opens app or unlocks phone)
        this.appStateSub = AppState.addEventListener('change', async (nextState) => {
          if (nextState === 'active') {
            await this.checkNativeRingingState();
          }
        });
      }

      await this.checkNativeRingingState();
      this.isInitialized = true;
    } catch (e) {
      console.warn('[AlarmService] Initialization error:', e);
    }
  }

  public async checkNativeRingingState(): Promise<void> {
    if (!AlarmRingtone?.getRingingState) return;
    try {
      const nativeState = await AlarmRingtone.getRingingState();
      if (nativeState?.isRinging && !this.currentState.isRinging) {
        const rawId = String(nativeState.alarmId || '');
        const parsed = this.parseAlarmId(rawId);

        const targetKey = parsed.cleanTaskId
          ? `task_${parsed.cleanTaskId}`
          : parsed.cleanHabitId
          ? `habit_${parsed.cleanHabitId}`
          : parsed.cleanEventId
          ? `event_${parsed.cleanEventId}`
          : parsed.alarmType === 'battery'
          ? 'battery'
          : '';

        if (targetKey && (this.snoozedUntilMap.get(targetKey) || 0) > Date.now()) {
          if (AlarmRingtone?.stop) {
            AlarmRingtone.stop();
          }
          return;
        }

        if (parsed.cleanTaskId) {
          try {
            const task = await taskRepository.findById(parsed.cleanTaskId);
            if (task?.snoozeUntil && new Date(task.snoozeUntil).getTime() > Date.now()) {
              if (AlarmRingtone?.stop) {
                AlarmRingtone.stop();
              }
              return;
            }
          } catch {}
        }

        this.startRinging(
          nativeState.title || 'Alarm',
          parsed.cleanHabitId,
          parsed.timeString,
          parsed.cleanEventId,
          nativeState.description,
          parsed.cleanTaskId,
          true, // skipNativePlay = true
          parsed.alarmType
        );
      } else if (!nativeState?.isRinging && this.currentState.isRinging) {
        // Native ringing stopped (hardware key press or native 60s timeout) while app was backgrounded
        this.stopRinging(true);
      }
    } catch (err) {
      console.warn('[AlarmService] checkNativeRingingState error:', err);
    }
  }

  public async handleNotificationAction(event: Event): Promise<void> {
    const { type, detail } = event;
    const actionId = detail?.pressAction?.id;
    const data = detail?.notification?.data;
    const taskId = (data?.taskId as string) || this.currentState.taskId;
    const habitId = (data?.habitId as string) || this.currentState.habitId;
    const eventId = (data?.eventId as string) || this.currentState.eventId;
    const notificationId = detail?.notification?.id;

    // Handle user swiping away the ringing notification
    if (type === EventType.DISMISSED) {
      if (this.currentState.isRinging) {
        this.stopRinging(true);
      }
      return;
    }

    if (type === EventType.ACTION_PRESS) {
      if (actionId === 'stop_alarm' || actionId === 'dismiss') {
        this.stopRinging(true);
        try {
          const { batteryService } = await import('../battery/BatteryService');
          await batteryService.stopAlarm(true);
        } catch {}
        if (eventId) {
          try {
            await calendarRepository.update(eventId, { status: 'dismissed' });
          } catch {}
        }
        try {
          if (notificationId) {
            await notifee.cancelNotification(notificationId);
          }
          await notifee.cancelNotification('active_ringing_alarm');
          await notifee.cancelNotification('active_battery_alarm');
        } catch {}
      } else if (actionId === 'done' || actionId === 'complete_task') {
        this.stopRinging(true);
        if (taskId) {
          try {
            const { taskService } = await import('../tasks/TaskService');
            await taskService.completeTask(taskId);
          } catch {
            await taskRepository.update(taskId, {
              status: 'completed',
              completedAt: new Date().toISOString(),
            });
          }
        }
        if (eventId) {
          try {
            await calendarRepository.update(eventId, { status: 'completed' });
          } catch {}
        }
        try {
          if (notificationId) {
            await notifee.cancelNotification(notificationId);
          }
          await notifee.cancelNotification('active_ringing_alarm');
          await notifee.cancelNotification('active_battery_alarm');
        } catch {}
      } else if (actionId === 'snooze_alarm' || actionId === 'snooze') {
        const activeStateSnapshot = { ...this.currentState };
        this.stopRinging(false);
        await this.snoozeAlarm(5, activeStateSnapshot);
        try {
          if (notificationId) {
            await notifee.cancelNotification(notificationId);
          }
          await notifee.cancelNotification('active_ringing_alarm');
          await notifee.cancelNotification('active_battery_alarm');
        } catch {}
        return;
      }
    } else if (type === EventType.DELIVERED || type === EventType.PRESS) {
      if (actionId === 'stop_alarm' || actionId === 'dismiss' || actionId === 'done') {
        this.stopRinging(true);
        try {
          const { batteryService } = await import('../battery/BatteryService');
          await batteryService.stopAlarm(true);
        } catch {}
        if (taskId && actionId === 'done') {
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
        const activeStateSnapshot = { ...this.currentState };
        this.stopRinging(false);
        await this.snoozeAlarm(5, activeStateSnapshot);
        if (notificationId) {
          try {
            await notifee.cancelNotification(notificationId);
          } catch {}
        }
        return;
      }

      // If user tapped notification body, sync UI state without re-triggering stopped alarms
      if (type === EventType.PRESS) {
        if (this.currentState.isRinging) {
          this.notify();
        }
        return;
      }

      // If notification was delivered as an alarm, ensure ringing state is active
      const actionType = data?.actionType;
      const isHabitAlarm = actionType === 'habit_alarm';
      const isEventAlarm = actionType === 'event_alarm';
      const isTaskAlarm = actionType === 'task_alarm';
      const isBatteryAlarm = actionType === 'battery_alarm';

      const targetHabitId = (data?.habitId as string) || habitId;
      const targetTaskId = (data?.taskId as string) || taskId;
      const targetEventId = (data?.eventId as string) || eventId;

      const alarmKey = isHabitAlarm
        ? `habit_${targetHabitId || ''}`
        : isEventAlarm
        ? `event_${targetEventId || ''}`
        : isTaskAlarm
        ? `task_${targetTaskId || ''}`
        : isBatteryAlarm
        ? 'battery'
        : '';

      if (alarmKey) {
        const snoozeUntil = this.snoozedUntilMap.get(alarmKey) || 0;
        if (Date.now() < snoozeUntil) {
          if (notificationId) {
            notifee.cancelNotification(notificationId).catch(() => {});
          }
          return;
        }
        if (this.triggeredKeysForMinute.has(alarmKey)) {
          return;
        }
      }

      if (targetTaskId) {
        try {
          const task = await taskRepository.findById(targetTaskId);
          if (task?.snoozeUntil && new Date(task.snoozeUntil).getTime() > Date.now()) {
            if (notificationId) {
              notifee.cancelNotification(notificationId).catch(() => {});
            }
            return;
          }
        } catch {}
      }

      if (isBatteryAlarm) {
        try {
          const bSnooze = await settingsRepository.get('battery_snooze_until', '0');
          if (Date.now() < Number(bSnooze)) {
            if (notificationId) {
              notifee.cancelNotification(notificationId).catch(() => {});
            }
            return;
          }
        } catch {}
      }

      if (!this.currentState.isRinging) {
        if (alarmKey) {
          this.triggeredKeysForMinute.add(alarmKey);
        }
        if (isHabitAlarm) {
          const title = (data?.habitName as string) || (data?.taskTitle as string) || 'Habit Alarm';
          const timeStr = data?.timeStr as string;
          this.startRinging(title, targetHabitId, timeStr, undefined, undefined, undefined, false, 'habit');
        } else if (isEventAlarm) {
          const title = (data?.eventTitle as string) || (data?.title as string) || 'Event Reminder';
          const timeStr = data?.timeStr as string;
          const desc = data?.description as string;
          this.startRinging(title, undefined, timeStr, targetEventId, desc, undefined, false, 'event');
        } else if (isTaskAlarm) {
          const title = (data?.taskTitle as string) || (data?.title as string) || 'Task Reminder';
          const taskTimeStr = data?.timeStr as string;
          const desc = data?.description as string;
          this.startRinging(title, undefined, taskTimeStr, undefined, desc, targetTaskId, false, 'task');
        } else if (isBatteryAlarm) {
          const title = (data?.title as string) || 'Battery Alarm';
          const desc = data?.description as string;
          this.startRinging(title, undefined, 'Battery Alarm', undefined, desc, undefined, false, 'battery');
        }
      }
    }
  }

  /**
   * Start ringing for up to 60 seconds (1 minute), like a real alarm clock app
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
    if (this.currentState.isRinging) return;

    if (await this.isDndActive()) {
      return;
    }

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

    const resolvedAlarmType = isBattery
      ? 'battery'
      : taskId
      ? 'task'
      : eventId
      ? 'event'
      : habitId
      ? 'habit'
      : undefined;

    const alarmKey = habitId
      ? `habit_${habitId}`
      : eventId
      ? `event_${eventId}`
      : taskId
      ? `task_${taskId}`
      : isBattery
      ? 'battery'
      : title;

    if (alarmKey) {
      this.triggeredKeysForMinute.add(alarmKey);
    }

    this.currentState = {
      isRinging: true,
      title: title || 'Alarm',
      habitId,
      eventId,
      taskId,
      description,
      timeString,
      secondsRemaining: 60,
      alarmType: resolvedAlarmType,
    };
    this.notify();

    // Start native loud alarm ringtone only if not already playing natively
    if (!skipNativePlay) {
      if (AlarmRingtone?.play) {
        try {
          const nativeAlarmId = habitId ? `alarm_habit_${habitId}` : taskId ? `alarm_task_${taskId}` : eventId ? `alarm_event_${eventId}` : 'alarm';
          AlarmRingtone.play(soundEnabled, vibrationEnabled, nativeAlarmId, title, description);
        } catch (e) {
          console.warn('[AlarmService] AlarmRingtone.play error, falling back to Vibration:', e);
          if (vibrationEnabled) {
            try {
              Vibration.vibrate([0, 800, 400, 800], true);
            } catch {}
          }
        }
      } else if (vibrationEnabled) {
        try {
          Vibration.vibrate([0, 800, 400, 800], true);
        } catch (e) {
          console.warn('[AlarmService] Vibration error:', e);
        }
      }
    }

    // Display foreground ringing notification with full controls if not already handled natively
    if (!skipNativePlay || !AlarmRingtone) {
      try {
        const actions: Array<{ title: string; pressAction: { id: string } }> = [
          {
            title: '🔕 STOP ALARM',
            pressAction: { id: 'stop_alarm' },
          },
          {
            title: '💤 SNOOZE (5m)',
            pressAction: { id: 'snooze_alarm' },
          },
        ];

        if (taskId) {
          actions.unshift({
            title: '✅ DONE',
            pressAction: { id: 'done' },
          });
        }

        await notifee.displayNotification({
          id: 'active_ringing_alarm',
          title: `⏰ Alarm: ${title}`,
          body: description || 'Ringing now! Tap to stop or snooze.',
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
            actions,
          },
          data: {
            actionType: resolvedAlarmType ? `${resolvedAlarmType}_alarm` : 'habit_alarm',
            habitId: String(habitId || ''),
            eventId: String(eventId || ''),
            taskId: String(taskId || ''),
            eventTitle: String(title || ''),
            taskTitle: String(title || ''),
            habitName: String(title || ''),
            timeStr: String(timeString || ''),
            description: String(description || ''),
          },
        });
      } catch (err) {
        console.warn('[AlarmService] Failed to display ringing notification:', err);
      }
    }

    // Clear any existing ring countdown timer
    if (this.ringTimer) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }

    // Countdown timer up to 60 seconds (1 minute auto-stop / auto-snooze)
    this.ringTimer = setInterval(() => {
      const nextRemaining = this.currentState.secondsRemaining - 1;
      if (nextRemaining <= 0) {
        if (this.ringTimer) {
          clearInterval(this.ringTimer);
          this.ringTimer = null;
        }
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

    // Stop audio and vibration without resetting auto-snooze counter
    this.stopRinging(false);

    if (currentCount < 3) {
      const nextCount = currentCount + 1;
      this.autoSnoozeCounts.set(alarmKey, nextCount);

      const snoozeMinutes = 10;
      await this.snoozeAlarm(snoozeMinutes, active);

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
            actionType: active.taskId
              ? 'task_alarm'
              : active.eventId
              ? 'event_alarm'
              : active.alarmType === 'battery'
              ? 'battery_alarm'
              : 'habit_alarm',
            habitId: active.habitId || '',
            eventId: active.eventId || '',
            taskId: active.taskId || '',
            taskTitle: active.title || '',
            timeStr: active.timeString || '',
          },
        });
      } catch (err) {
        console.warn('[AlarmService] Failed to display auto-snooze notification:', err);
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
            actionType: active.taskId
              ? 'task_alarm'
              : active.eventId
              ? 'event_alarm'
              : active.alarmType === 'battery'
              ? 'battery_alarm'
              : 'habit_alarm',
            habitId: active.habitId || '',
            eventId: active.eventId || '',
            taskId: active.taskId || '',
            taskTitle: active.title || '',
            timeStr: active.timeString || '',
          },
        });
      } catch (err) {
        console.warn('[AlarmService] Failed to display missed alarm notification:', err);
      }
    }
  }

  /**
   * Automatically reschedule the next occurrence of a habit alarm
   */
  public async rescheduleNextHabitAlarm(habitId: string): Promise<void> {
    if (!habitId || typeof habitId !== 'string' || !habitId.trim()) return;
    const cleanId = habitId.trim();

    try {
      const cached = this.cachedHabits.find((h) => h.id === cleanId);
      if (cached) {
        await this.scheduleHabitAlarm(cached.id, cached.name, cached.reminderTime, cached.daysOfWeek, true);
        return;
      }
      const habit = await habitRepository.findById(cleanId);
      if (habit && !habit.archivedAt && habit.reminderTime) {
        const days = habit.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
        await this.scheduleHabitAlarm(habit.id, habit.name, habit.reminderTime, days, true);
      }
    } catch (e) {
      console.warn('[AlarmService] Failed to reschedule next habit alarm:', e);
    }
  }

  /**
   * Check if Complete Application Do Not Disturb (DND) is active
   */
  public async isDndActive(): Promise<boolean> {
    try {
      const val = await settingsRepository.get(SETTINGS_KEYS.APP_DND_ENABLED, 'false');
      return val === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Enable or disable Complete Application Do Not Disturb (DND)
   */
  public async setDndActive(active: boolean): Promise<void> {
    try {
      await settingsRepository.set(SETTINGS_KEYS.APP_DND_ENABLED, String(active));
      if (active) {
        this.stopRinging(true);
      }
      try {
        const { batteryService } = await import('../battery/BatteryService');
        batteryService.setDndActive(active);
      } catch {}
    } catch (e) {
      console.warn('[AlarmService] Failed to set DND state:', e);
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
      console.warn('[AlarmService] Failed to open alarm permission settings, using Linking fallback:', e);
      try {
        await Linking.openSettings();
      } catch {}
    }
  }

  public async openAutoStartSettings(): Promise<void> {
    try {
      if (AlarmRingtone?.openAutoStartSettings) {
        await AlarmRingtone.openAutoStartSettings();
      } else {
        await Linking.openSettings();
      }
    } catch {
      try {
        await Linking.openSettings();
      } catch {}
    }
  }

  public async openBatterySaverSettings(): Promise<void> {
    try {
      if (AlarmRingtone?.openBatterySaverSettings) {
        await AlarmRingtone.openBatterySaverSettings();
      } else {
        await Linking.openSettings();
      }
    } catch {
      try {
        await Linking.openSettings();
      } catch {}
    }
  }

  public async openFullScreenSettings(): Promise<void> {
    try {
      if (AlarmRingtone?.openFullScreenSettings) {
        await AlarmRingtone.openFullScreenSettings();
      } else {
        await Linking.openSettings();
      }
    } catch {
      try {
        await Linking.openSettings();
      } catch {}
    }
  }

  private isStoppingRinging = false;

  public stopRinging(resetAutoSnooze: boolean = true): void {
    if (this.isStoppingRinging) return;
    this.isStoppingRinging = true;

    try {
      const wasRinging = this.currentState.isRinging;
      const ringingHabitId = this.currentState.habitId;
      const ringingTaskId = this.currentState.taskId;
      const ringingEventId = this.currentState.eventId;
      const isBattery =
        this.currentState.alarmType === 'battery' ||
        this.currentState.timeString === 'Battery Alarm' ||
        (this.currentState.title || '').toLowerCase().includes('battery');

      if (ringingHabitId) {
        this.triggeredKeysForMinute.add(`habit_${ringingHabitId}`);
        this.triggeredKeysForMinute.add(`alarm_habit_${ringingHabitId}`);
        this.triggeredKeysForMinute.add(`alarm_snooze_habit_${ringingHabitId}`);
      }
      if (ringingTaskId) {
        this.triggeredKeysForMinute.add(`task_${ringingTaskId}`);
        this.triggeredKeysForMinute.add(`alarm_task_${ringingTaskId}`);
        this.triggeredKeysForMinute.add(`alarm_snooze_task_${ringingTaskId}`);
      }
      if (ringingEventId) {
        this.triggeredKeysForMinute.add(`event_${ringingEventId}`);
        this.triggeredKeysForMinute.add(`alarm_event_${ringingEventId}`);
        this.triggeredKeysForMinute.add(`alarm_snooze_event_${ringingEventId}`);
      }
      if (isBattery) {
        this.triggeredKeysForMinute.add('battery');
      }
      if (this.currentState.title) {
        this.triggeredKeysForMinute.add(this.currentState.title);
      }

      if (resetAutoSnooze) {
        const autoKey =
          this.currentState.habitId ||
          this.currentState.eventId ||
          this.currentState.taskId ||
          this.currentState.title ||
          'alarm';
        this.autoSnoozeCounts.delete(autoKey);
      }

      if (this.ringTimer) {
        clearInterval(this.ringTimer);
        this.ringTimer = null;
      }

      if (AlarmRingtone?.stop) {
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

      if (ringingHabitId) {
        notifee.cancelNotification(`alarm_habit_${ringingHabitId}`).catch(() => {});
        notifee.cancelNotification(`alarm_${ringingHabitId}`).catch(() => {});
        if (AlarmRingtone?.cancelAlarmNotification) {
          try {
            AlarmRingtone.cancelAlarmNotification(`alarm_habit_${ringingHabitId}`);
          } catch {}
        }
      }
      if (ringingTaskId) {
        notifee.cancelNotification(`alarm_task_${ringingTaskId}`).catch(() => {});
        notifee.cancelNotification(`task_${ringingTaskId}`).catch(() => {});
        if (AlarmRingtone?.cancelAlarmNotification) {
          try {
            AlarmRingtone.cancelAlarmNotification(`alarm_task_${ringingTaskId}`);
          } catch {}
        }
      }
      if (ringingEventId) {
        notifee.cancelNotification(`alarm_event_${ringingEventId}`).catch(() => {});
        notifee.cancelNotification(`event_${ringingEventId}`).catch(() => {});
        if (AlarmRingtone?.cancelAlarmNotification) {
          try {
            AlarmRingtone.cancelAlarmNotification(`alarm_event_${ringingEventId}`);
          } catch {}
        }
      }

      if (isBattery) {
        try {
          const { batteryService } = require('../battery/BatteryService');
          batteryService.stopAlarm(true);
        } catch {}
      }

      if (wasRinging) {
        this.currentState = {
          isRinging: false,
          title: '',
          habitId: undefined,
          eventId: undefined,
          taskId: undefined,
          description: undefined,
          timeString: undefined,
          secondsRemaining: 60,
          alarmType: undefined,
        };
        this.notify();
      }

      if (ringingHabitId && resetAutoSnooze) {
        this.rescheduleNextHabitAlarm(ringingHabitId);
      }
    } finally {
      this.isStoppingRinging = false;
    }
  }

  /**
   * Snooze alarm for given minutes, accepting optional state snapshot to avoid race conditions
   */
  public async snoozeAlarm(minutes?: number, stateOverride?: Partial<AlarmState>): Promise<void> {
    const activeState = stateOverride || this.currentState;
    const isBattery = activeState.alarmType === 'battery';
    const habitId = activeState.habitId;
    const eventId = activeState.eventId;
    const taskId = activeState.taskId;
    const description = activeState.description;
    const title = activeState.title || 'Alarm';
    const timeString = activeState.timeString;

    // Stop current ringing without resetting auto-snooze counter
    this.stopRinging(false);

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
    const targetId = isBattery ? 'battery' : taskId || eventId || habitId || String(Date.now());
    const prefix = isBattery
      ? 'battery_'
      : taskId
      ? 'task_'
      : eventId
      ? 'event_'
      : habitId
      ? 'habit_'
      : '';
    const snoozeAlarmId = `alarm_snooze_${prefix}${targetId}`;

    const targetKey = isBattery ? 'battery' : taskId ? `task_${taskId}` : habitId ? `habit_${habitId}` : eventId ? `event_${eventId}` : 'alarm';
    this.snoozedUntilMap.set(targetKey, snoozeTarget.getTime());
    this.triggeredKeysForMinute.add(targetKey);
    this.triggeredKeysForMinute.add(snoozeAlarmId);

    if (taskId) {
      try {
        await taskRepository.update(taskId, { snoozeUntil: snoozeTarget.toISOString() });
      } catch (e) {
        console.warn('[AlarmService] Failed to persist task snooze:', e);
      }
    }

    if (isBattery) {
      try {
        await settingsRepository.set('battery_snooze_until', String(snoozeTarget.getTime()));
      } catch {}
      try {
        const { batteryService } = require('../battery/BatteryService');
        await batteryService.snoozeAlarm(snoozeMinutes);
      } catch {}
    }

    // 1. Schedule with native Android AlarmManager if available (guaranteed wake-up through Doze)
    if (AlarmRingtone?.scheduleExactAlarm) {
      try {
        await AlarmRingtone.scheduleExactAlarm(
          snoozeAlarmId,
          snoozeTarget.getTime(),
          `⏰ Snoozed: ${title}`,
          description || 'Snoozed alarm ringing now!'
        );
      } catch (nativeErr) {
        console.warn('[AlarmService] Native snooze schedule error:', nativeErr);
      }
    }

    // 2. Schedule Notifee trigger notification as cross-platform fallback
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
    const channelId = isBattery ? 'battery_charge_channel' : ALARM_CHANNEL_ID;

    try {
      await notifee.createTriggerNotification(
        {
          id: snoozeAlarmId,
          title: `⏰ Snoozed: ${title}`,
          body: description || 'Snoozed alarm ringing now!',
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
      console.warn('[AlarmService] Failed to schedule Notifee snooze trigger:', err);
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
    if (!habitId || !timeStr) return;

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

      const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifsEnabled) return;
      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';

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
          console.warn('[AlarmService] Native exact habit alarm error:', e);
        }
      } else {
        // Fallback for non-native environments
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

      // Synchronize cached habits
      const days = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
      const existingIdx = this.cachedHabits.findIndex((h) => h.id === habitId);
      if (existingIdx >= 0) {
        this.cachedHabits[existingIdx] = { id: habitId, name: habitName, reminderTime: timeStr, daysOfWeek: days };
      } else {
        this.cachedHabits.push({ id: habitId, name: habitName, reminderTime: timeStr, daysOfWeek: days });
      }
    } catch (err) {
      console.warn('[AlarmService] Failed to schedule habit alarm:', err);
    }
  }

  public async cancelHabitAlarm(habitId: string): Promise<void> {
    if (!habitId) return;
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
    } catch (err) {
      console.warn('[AlarmService] Failed to cancel habit alarm:', err);
    }
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
    if (!eventId || !date || !timeStr) return;

    try {
      const alarmKey = `alarm_event_${eventId}`;
      await notifee.cancelNotification(alarmKey);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(alarmKey);
        } catch {}
      }

      const notifsEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifsEnabled) return;
      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';

      const parsed = this.parseTime(timeStr);
      if (!parsed) return;

      const dateClean = (date || '').includes('T') ? date.split('T')[0] : date;
      const parts = dateClean.split('-').map(Number);
      if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
        return;
      }
      const [year, month, day] = parts;
      let target = new Date(year, month - 1, day, parsed.hours, parsed.minutes, 0, 0);

      const now = Date.now();
      if (target.getTime() <= now && target.getTime() >= now - 60000) {
        target = new Date(now + 2000);
      }

      if (target.getTime() > now) {
        if (AlarmRingtone?.scheduleExactAlarm) {
          try {
            await AlarmRingtone.scheduleExactAlarm(
              alarmKey,
              target.getTime(),
              title,
              description || 'Scheduled event time reached!'
            );
          } catch (e) {
            console.warn('[AlarmService] Native exact event alarm error:', e);
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
          id: alarmKey,
          title: `⏰ Alarm: ${title}`,
          body: description ? `${description}` : 'Scheduled event time reached!',
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

      // Synchronize cached events with clean date
      const existingIdx = this.cachedEvents.findIndex((e) => e.id === eventId);
      if (existingIdx >= 0) {
        this.cachedEvents[existingIdx] = { id: eventId, title, date: dateClean, time: timeStr, description };
      } else {
        this.cachedEvents.push({ id: eventId, title, date: dateClean, time: timeStr, description });
      }
    } catch (err) {
      console.warn('[AlarmService] Failed to schedule event alarm:', err);
    }
  }

  public async cancelEventAlarm(eventId: string): Promise<void> {
    if (!eventId) return;
    try {
      const alarmKey = `alarm_event_${eventId}`;
      await notifee.cancelNotification(alarmKey);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(alarmKey);
        } catch {}
      }
      this.cachedEvents = this.cachedEvents.filter((e) => e.id !== eventId);
    } catch (err) {
      console.warn('[AlarmService] Failed to cancel event alarm:', err);
    }
  }

  public async restoreAllEventAlarms(): Promise<void> {
    try {
      const events = await calendarRepository.findUpcomingActive();
      this.cachedEvents = events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: (ev.date || '').includes('T') ? ev.date.split('T')[0] : ev.date,
        time: ev.time,
        description: ev.description,
      }));
      this.eventsLoaded = true;

      for (const ev of events) {
        if (ev.ringAlarm && ev.status === 'active') {
          try {
            await this.scheduleEventAlarm(ev.id, ev.title, ev.date, ev.time, ev.description);
          } catch (innerErr) {
            console.warn('[AlarmService] Failed to schedule event alarm during restore:', ev.id, innerErr);
          }
        }
      }
    } catch (err) {
      console.warn('[AlarmService] Failed to restore event alarms:', err);
    }
  }

  public async restoreAllHabitAlarms(): Promise<void> {
    try {
      const habits = await habitRepository.findActive();
      this.cachedHabits = habits
        .filter((h) => Boolean(h.reminderTime) && !h.archivedAt)
        .map((h) => ({
          id: h.id,
          name: h.name,
          reminderTime: h.reminderTime!,
          daysOfWeek: h.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
        }));
      this.habitsLoaded = true;

      for (const h of habits) {
        if (h.reminderTime && !h.archivedAt) {
          try {
            const days = h.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
            // isReschedule=true prevents spurious 5s test triggers on startup if within 2 minutes
            await this.scheduleHabitAlarm(h.id, h.name, h.reminderTime, days, true);
          } catch (innerErr) {
            console.warn('[AlarmService] Failed to schedule habit alarm during restore:', h.id, innerErr);
          }
        }
      }
    } catch (err) {
      console.warn('[AlarmService] Failed to restore habit alarms:', err);
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
    if (!taskId || !date || !timeStr) return;

    try {
      const dateClean = (date || '').includes('T') ? date.split('T')[0] : date;
      const existingIdx = this.cachedTasks.findIndex((t) => t.id === taskId);
      const item = { id: taskId, title, date: dateClean, time: timeStr, description, isLoud };
      if (existingIdx >= 0) {
        this.cachedTasks[existingIdx] = item;
      } else {
        this.cachedTasks.push(item);
      }

      if (isLoud) {
        const parsed = this.parseTime(timeStr);
        if (parsed) {
          const parts = dateClean.split('-').map(Number);
          if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
            const [y, m, d] = parts;
            const target = new Date(y, m - 1, d, parsed.hours, parsed.minutes, 0, 0);
            if (target.getTime() > Date.now()) {
              if (AlarmRingtone?.scheduleExactAlarm) {
                try {
                  await AlarmRingtone.scheduleExactAlarm(
                    `alarm_task_${taskId}`,
                    target.getTime(),
                    `Task: ${title}`,
                    description || 'Scheduled task time reached!'
                  );
                } catch (e) {
                  console.warn('[AlarmService] Native exact task alarm error:', e);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[AlarmService] Failed to schedule task alarm:', err);
    }
  }

  public async cancelTaskAlarm(taskId: string): Promise<void> {
    if (!taskId) return;
    try {
      await notifee.cancelNotification(`alarm_task_${taskId}`);
      await notifee.cancelNotification(`task_${taskId}`);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(`alarm_task_${taskId}`);
        } catch {}
      }
      this.cachedTasks = this.cachedTasks.filter((t) => t.id !== taskId);
    } catch (err) {
      console.warn('[AlarmService] Failed to cancel task alarm:', err);
    }
  }

  public async restoreAllTaskAlarms(): Promise<void> {
    try {
      const allTasks = await taskRepository.findAll();
      const activeTasks = allTasks.filter(
        (t) => t.status !== 'completed' && t.status !== 'cancelled' && Boolean(t.date && t.startTime)
      );

      this.cachedTasks = activeTasks.map((t) => ({
        id: t.id,
        title: t.title,
        date: (t.date || '').includes('T') ? t.date.split('T')[0] : t.date,
        time: t.startTime!,
        description: t.description || t.notes,
        isLoud: Boolean(t.isLoudAlarm || t.priority === 'high' || t.recurrenceRule?.isLoudAlarm),
      }));
      this.tasksLoaded = true;

      const now = Date.now();
      for (const tk of this.cachedTasks) {
        if (!tk.isLoud) continue;
        const parsed = this.parseTime(tk.time);
        if (!parsed) continue;

        const parts = tk.date.split('-').map(Number);
        if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) continue;

        const [year, month, day] = parts;
        const target = new Date(year, month - 1, day, parsed.hours, parsed.minutes, 0, 0);

        if (target.getTime() > now) {
          if (AlarmRingtone?.scheduleExactAlarm) {
            try {
              await AlarmRingtone.scheduleExactAlarm(
                `alarm_task_${tk.id}`,
                target.getTime(),
                `Task: ${tk.title}`,
                tk.description || 'Time to complete your scheduled task!'
              );
            } catch (e) {
              console.warn('[AlarmService] Failed to schedule task alarm during restore:', tk.id, e);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[AlarmService] Failed to restore task alarms:', err);
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

      const period = currentHours >= 12 ? 'PM' : 'AM';
      let h12 = currentHours % 12;
      if (h12 === 0) h12 = 12;
      const hh = String(h12).padStart(2, '0');
      const mm = String(currentMinutes).padStart(2, '0');
      const current12Str = `${hh}:${mm} ${period}`;
      const minuteKey = `${now.toDateString()}_${current12Str}`;

      if (this.currentMinuteKey !== minuteKey) {
        this.currentMinuteKey = minuteKey;
        this.triggeredKeysForMinute.clear();
      }

      // Load cache once if not yet loaded (prevents continuous 5-second polling when DB is empty)
      if (!this.habitsLoaded) {
        try {
          const habits = await habitRepository.findActive();
          this.cachedHabits = habits
            .filter((h) => Boolean(h.reminderTime) && !h.archivedAt)
            .map((h) => ({
              id: h.id,
              name: h.name,
              reminderTime: h.reminderTime!,
              daysOfWeek: h.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
            }));
          this.habitsLoaded = true;
        } catch {}
      }

      if (!this.eventsLoaded) {
        try {
          const events = await calendarRepository.findUpcomingActive();
          this.cachedEvents = events.map((ev) => ({
            id: ev.id,
            title: ev.title,
            date: (ev.date || '').includes('T') ? ev.date.split('T')[0] : ev.date,
            time: ev.time,
            description: ev.description,
          }));
          this.eventsLoaded = true;
        } catch {}
      }

      if (!this.tasksLoaded) {
        try {
          const allTasks = await taskRepository.findAll();
          this.cachedTasks = allTasks
            .filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && Boolean(t.date && t.startTime))
            .map((t) => ({
              id: t.id,
              title: t.title,
              date: (t.date || '').includes('T') ? t.date.split('T')[0] : t.date,
              time: t.startTime!,
              description: t.description || t.notes,
              isLoud: Boolean(t.isLoudAlarm || t.priority === 'high' || t.recurrenceRule?.isLoudAlarm),
            }));
          this.tasksLoaded = true;
        } catch {}
      }

      if (this.currentState.isRinging) return;

    if (await this.isDndActive()) {
      return;
    }

      try {
        const currentDayIndex = now.getDay();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // 1. Check scheduled habits
        for (const habit of this.cachedHabits) {
          const alarmKey = `habit_${habit.id}`;
          if (this.triggeredKeysForMinute.has(alarmKey)) continue;
          const snoozeMs = this.snoozedUntilMap.get(alarmKey) || 0;
          if (Date.now() < snoozeMs) continue;
          if (!habit.daysOfWeek.includes(currentDayIndex)) continue;

          const parsed = this.parseTime(habit.reminderTime);
          if (parsed && parsed.hours === currentHours && parsed.minutes === currentMinutes) {
            this.triggeredKeysForMinute.add(alarmKey);
            this.startRinging(habit.name, habit.id, habit.reminderTime, undefined, undefined, undefined, false, 'habit');
            return;
          }
        }

        // 2. Check scheduled calendar event alarms
        for (const ev of this.cachedEvents) {
          const alarmKey = `event_${ev.id}`;
          if (this.triggeredKeysForMinute.has(alarmKey)) continue;
          const snoozeMs = this.snoozedUntilMap.get(alarmKey) || 0;
          if (Date.now() < snoozeMs) continue;
          const evDate = (ev.date || '').includes('T') ? ev.date.split('T')[0] : ev.date;
          if (evDate !== todayIso) continue;

          const parsed = this.parseTime(ev.time);
          if (parsed && parsed.hours === currentHours && parsed.minutes === currentMinutes) {
            this.triggeredKeysForMinute.add(alarmKey);
            this.startRinging(ev.title, undefined, ev.time, ev.id, ev.description, undefined, false, 'event');
            return;
          }
        }

        // 3. Check scheduled loud task alarms
        for (const tk of this.cachedTasks) {
          const alarmKey = `task_${tk.id}`;
          if (this.triggeredKeysForMinute.has(alarmKey)) continue;
          const snoozeMs = this.snoozedUntilMap.get(alarmKey) || 0;
          if (Date.now() < snoozeMs) continue;
          if (tk.snoozeUntil && new Date(tk.snoozeUntil).getTime() > Date.now()) continue;
          const tkDate = (tk.date || '').includes('T') ? tk.date.split('T')[0] : tk.date;
          if (tkDate !== todayIso || !tk.isLoud) continue;

          const parsed = this.parseTime(tk.time);
          if (parsed && parsed.hours === currentHours && parsed.minutes === currentMinutes) {
            this.triggeredKeysForMinute.add(alarmKey);
            this.startRinging(tk.title, undefined, tk.time, undefined, tk.description, tk.id, false, 'task');
            return;
          }
        }
      } catch (monitorErr) {
        console.warn('[AlarmService] Foreground monitor error:', monitorErr);
      }
    }, 5000);
  }

  public stopForegroundMonitor(): void {
    if (this.foregroundMonitorTimer) {
      clearInterval(this.foregroundMonitorTimer);
      this.foregroundMonitorTimer = null;
    }
  }

  public parseTime(timeStr: string): { hours: number; minutes: number } | null {
    if (!timeStr || typeof timeStr !== 'string') return null;

    let clean = timeStr
      .replace(/[\u00A0\u202F\uFEFF]/g, ' ')
      .replace(/[⏰🕒]/g, '')
      .trim();

    if (clean.includes('T')) {
      clean = clean.split('T')[1].split('.')[0].trim();
    }

    // 12-hour format e.g. "04:30 PM", "4:30:00 PM", "4:30am"
    const ampmMatch = clean.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = parseInt(ampmMatch[2], 10);
      const p = ampmMatch[3].toUpperCase();
      if (h < 1 || h > 12 || m < 0 || m > 59) return null;
      if (p === 'PM' && h < 12) h += 12;
      if (p === 'AM' && h === 12) h = 0;
      return { hours: h, minutes: m };
    }

    // 24-hour format e.g. "16:30" or "16:30:00"
    const h24Match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (h24Match) {
      const h = parseInt(h24Match[1], 10);
      const m = parseInt(h24Match[2], 10);
      if (h < 0 || h > 23 || m < 0 || m > 59) return null;
      return { hours: h, minutes: m };
    }

    return null;
  }

  public calculateNextOccurrence(
    hours: number,
    minutes: number,
    daysOfWeek?: number[],
    _isReschedule: boolean = false
  ): Date {
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    const validDays = Array.isArray(daysOfWeek)
      ? daysOfWeek.filter((d) => typeof d === 'number' && d >= 0 && d <= 6)
      : [];
    const allowedDays = validDays.length > 0 ? validDays : [0, 1, 2, 3, 4, 5, 6];

    // If target has passed today, check from tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
      target.setHours(hours, minutes, 0, 0);
    }

    // Find the next allowed day of week
    for (let i = 0; i < 7; i++) {
      if (allowedDays.includes(target.getDay())) {
        target.setHours(hours, minutes, 0, 0);
        return target;
      }
      target.setDate(target.getDate() + 1);
      target.setHours(hours, minutes, 0, 0);
    }

    target.setHours(hours, minutes, 0, 0);
    return target;
  }

  /**
   * Complete cleanup for testing or service teardown
   */
  public cleanup(): void {
    this.stopForegroundMonitor();
    if (this.ringTimer) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
    if (this.nativeRingSub) {
      try {
        this.nativeRingSub.remove();
      } catch {}
      this.nativeRingSub = null;
    }
    if (this.appStateSub) {
      try {
        this.appStateSub.remove();
      } catch {}
      this.appStateSub = null;
    }
    this.stopRinging(true);
    this.listeners.clear();
    this.isInitialized = false;
    this.habitsLoaded = false;
    this.eventsLoaded = false;
    this.tasksLoaded = false;
  }
}

export const alarmService = AlarmService.getInstance();
export default alarmService;
