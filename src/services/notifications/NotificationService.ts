import { NativeModules, Platform } from 'react-native';
const { AlarmRingtone } = NativeModules;
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  EventType,
  Event,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
import { Task, SnoozeDurationOption, KeepNote, Habit } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { keepNoteRepository } from '../../database/repositories/KeepNoteRepository';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { parseISO, addMinutes, isBefore, isValid } from 'date-fns';

export const ALARM_CLOCK_CHANNEL_ID = 'alarm_clock_channel_v6';

export const CHANNELS = {
  ALARM_CLOCK: {
    id: ALARM_CLOCK_CHANNEL_ID,
    name: 'Alarm Clock Ringing',
    description: 'Loud ringing alarms with vibration for your scheduled routines and tasks',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  },
  LIFE_PLANNER: {
    id: 'life_planner_tasks',
    name: 'Life Planner Reminders',
    description: 'Scheduled reminders for your tasks and daily activities',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  },
  HIGH_PRIORITY: {
    id: 'high_priority_reminders',
    name: 'High Priority Reminders',
    description: 'Critical reminders that require immediate attention',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  },
  HABITS: {
    id: 'habits_reminders',
    name: 'Habits Daily Reminder',
    description: 'Reminders to help maintain your habit streaks',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
  },
  SILENT: {
    id: 'life_planner_silent',
    name: 'Life Planner Silent Reminders',
    description: 'Notifications without audio alerts',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
  },
};

export class NotificationService {
  private static instance: NotificationService;
  private isInitialized = false;

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async initialize(force = false): Promise<void> {
    if (this.isInitialized && !force) return;

    try {
      // 1. Create Android Notification Channels
      await this.setupChannels();

      // 2. Request Notification Permission and essential install permissions directly
      await this.requestDirectInstallPermissions();

      // 3. Register foreground event listener
      notifee.onForegroundEvent(async (event: Event) => {
        await this.handleNotificationEvent(event);
      });

      this.isInitialized = true;
    } catch (e) {
      console.warn('NotificationService initialize warning:', e);
    }
  }

  /**
   * Request essential Android application permissions directly on app install / first launch:
   * 1. Notification Permission (POST_NOTIFICATIONS dialog on Android 13+)
   * 2. Battery Optimization Exemption dialog (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
   * 3. Exact Alarm scheduling check (SCHEDULE_EXACT_ALARM on Android 12+)
   */
  public async requestDirectInstallPermissions(): Promise<void> {
    if (Platform.OS === 'ios') return;

    try {
      // 1. Post Notifications Permission dialog
      await notifee.requestPermission();

      // 2. Direct Battery Optimization Whitelist Prompt
      try {
        if (typeof notifee?.isBatteryOptimizationEnabled === 'function') {
          const isBatteryRestricted = await notifee.isBatteryOptimizationEnabled();
          if (isBatteryRestricted) {
            const prompted = await settingsRepository.get('BATTERY_OPT_PROMPTED_ON_INSTALL', 'false');
            if (prompted !== 'true') {
              await settingsRepository.set('BATTERY_OPT_PROMPTED_ON_INSTALL', 'true');
              if (typeof notifee?.openBatteryOptimizationSettings === 'function') {
                await notifee.openBatteryOptimizationSettings();
              }
            }
          }
        }
      } catch (batteryErr) {
        console.warn('Battery optimization direct prompt warning:', batteryErr);
      }

      // 3. Exact Alarm permission check for Android 12+
      try {
        const settings = await notifee.getNotificationSettings();
        if (settings?.android?.alarm === 0) { // 0 = DISABLED
          const exactAlarmPrompted = await settingsRepository.get('EXACT_ALARM_PROMPTED_ON_INSTALL', 'false');
          if (exactAlarmPrompted !== 'true') {
            await settingsRepository.set('EXACT_ALARM_PROMPTED_ON_INSTALL', 'true');
            if (typeof notifee?.openAlarmPermissionSettings === 'function') {
              await notifee.openAlarmPermissionSettings();
            }
          }
        }
      } catch (alarmErr) {
        console.warn('Exact alarm direct prompt warning:', alarmErr);
      }
    } catch (e) {
      console.warn('Direct install permissions request error:', e);
    }
  }

  private async setupChannels(): Promise<void> {
    await notifee.createChannel({
      id: ALARM_CLOCK_CHANNEL_ID,
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

    await notifee.createChannel({
      id: CHANNELS.LIFE_PLANNER.id,
      name: CHANNELS.LIFE_PLANNER.name,
      description: CHANNELS.LIFE_PLANNER.description,
      importance: CHANNELS.LIFE_PLANNER.importance,
      visibility: CHANNELS.LIFE_PLANNER.visibility,
      sound: 'default',
      vibration: true,
      lights: true,
    });

    await notifee.createChannel({
      id: CHANNELS.HIGH_PRIORITY.id,
      name: CHANNELS.HIGH_PRIORITY.name,
      description: CHANNELS.HIGH_PRIORITY.description,
      importance: CHANNELS.HIGH_PRIORITY.importance,
      visibility: CHANNELS.HIGH_PRIORITY.visibility,
      sound: 'default',
      vibration: true,
      lights: true,
    });

    await notifee.createChannel({
      id: CHANNELS.HABITS.id,
      name: CHANNELS.HABITS.name,
      description: CHANNELS.HABITS.description,
      importance: CHANNELS.HABITS.importance,
      visibility: CHANNELS.HABITS.visibility,
      sound: 'default',
      vibration: false,
    });

    await notifee.createChannel({
      id: CHANNELS.SILENT.id,
      name: CHANNELS.SILENT.name,
      description: CHANNELS.SILENT.description,
      importance: CHANNELS.SILENT.importance,
      visibility: CHANNELS.SILENT.visibility,
      sound: undefined,
      vibration: false,
    });
  }

  public async scheduleTaskReminder(task: Task): Promise<string | null> {
    try {
      // Check if notifications are enabled in settings
      const notifEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifEnabled) return null;

      // Completed or cancelled tasks should not schedule reminders
      if (task.status === 'completed' || task.status === 'cancelled') {
        await this.cancelTaskReminder(task.id);
        return null;
      }

      if (!task.date || task.reminderMinutes === -1) {
        if (task.reminderMinutes === -1) {
          await this.cancelTaskReminder(task.id);
        }
        return null;
      }

      // Untimed all-day tasks without an explicit positive reminder should never trigger an unrequested 09:00 AM loud alarm
      if (!task.startTime && (task.reminderMinutes === undefined || task.reminderMinutes <= 0)) {
        await this.cancelTaskReminder(task.id);
        return null;
      }

      // Calculate scheduled trigger time robustly (handles 12h AM/PM or 24h formats; defaults all-day tasks to 09:00)
      const effectiveTime = task.startTime ? task.startTime.trim() : '09:00';
      const timeMatch = effectiveTime.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
      if (!timeMatch) return null;
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const period = timeMatch[3]?.toLowerCase();
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

      // Extract date part cleanly (handles YYYY-MM-DD or ISO strings like 2026-10-31T00:00:00.000Z)
      const cleanDate = task.date.trim().split('T')[0];
      const dateParts = cleanDate.split('-').map(Number);
      if (dateParts.length !== 3 || dateParts.some(isNaN)) return null;
      const [year, month, day] = dateParts;
      if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) return null;

      let targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
      if (!isValid(targetDate) || isNaN(targetDate.getTime())) return null;

      if (task.reminderMinutes && task.reminderMinutes > 0) {
        targetDate = addMinutes(targetDate, -task.reminderMinutes);
      }

      const now = new Date();
      // If time has already passed, don't schedule
      if (isBefore(targetDate, now)) {
        return null;
      }

      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';
      const vibrationEnabled = (await settingsRepository.get('notificationVibration', 'true')) === 'true';
      const defaultSnoozeStr = await settingsRepository.get('defaultSnoozeMinutes', '10');
      const defaultSnoozeMinutes = parseInt(defaultSnoozeStr, 10) || 10;

      const isLoudTask =
        task.priority === 'high' ||
        Boolean(task.recurrenceRule?.isLoudAlarm) ||
        Boolean((task as any).isLoudAlarm);
      const channelId = !soundEnabled
        ? CHANNELS.SILENT.id
        : isLoudTask
        ? ALARM_CLOCK_CHANNEL_ID
        : CHANNELS.LIFE_PLANNER.id;

      const notificationId = `task_${task.id}`;

      // Cancel any prior notification for this task
      await notifee.cancelNotification(notificationId);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(`alarm_task_${task.id}`);
        } catch {}
      }

      const title = task.title;
      const subtitle = task.reminderMinutes && task.reminderMinutes > 0
        ? `Starts in ${task.reminderMinutes} minutes`
        : "It's time to start your task.";

      // Schedule native exact alarm with Android AlarmManager for loud alarm tasks
      // (Native AlarmReceiver handles loud audio + persistent full-screen alarm notification without clashing with Notifee)
      try {
        const { alarmService } = await import('../alarm/AlarmService');
        await alarmService.scheduleTaskAlarm(task.id, task.title, task.date, effectiveTime, task.description || subtitle, isLoudTask);
      } catch {}

      if (isLoudTask && AlarmRingtone?.scheduleExactAlarm) {
        try {
          await AlarmRingtone.scheduleExactAlarm(
            `alarm_task_${task.id}`,
            targetDate.getTime(),
            `Task: ${task.title}`,
            task.description || subtitle
          );
          return notificationId;
        } catch (e) {
          console.warn('Native exact task alarm error, falling back to Notifee:', e);
        }
      }

      // Create Android AlarmManager Timestamp Trigger for regular notifications
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: targetDate.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      const reminderPayload = {
        id: notificationId,
        title,
        subtitle: 'Life Planner',
        body: subtitle,
        data: {
          taskId: task.id,
          taskTitle: task.title,
          timeStr: effectiveTime,
          description: task.description || subtitle,
          actionType: 'task_alarm',
        },
        android: {
          channelId,
          smallIcon: 'ic_notification',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC, // Lock-screen visible
          category: AndroidCategory.ALARM,
          sound: soundEnabled ? 'default' : undefined,
          vibrationPattern: vibrationEnabled ? [500, 1000, 500, 1000] : undefined,
          autoCancel: true,
          fullScreenAction: { id: 'default' },
          pressAction: {
            id: 'default',
          },
          actions: [
            {
              title: '🔕 DISMISS',
              pressAction: {
                id: 'dismiss',
              },
            },
            {
              title: '✅ COMPLETE',
              pressAction: {
                id: 'done',
              },
            },
            {
              title: `💤 SNOOZE (${defaultSnoozeMinutes}m)`,
              pressAction: {
                id: 'snooze',
              },
            },
          ],
        },
      };

      try {
        await notifee.createTriggerNotification(reminderPayload, trigger);
      } catch {
        // Fallback for Android 13/14 if allowWhileIdle is restricted
        const fallbackTrigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: targetDate.getTime(),
        };
        await notifee.createTriggerNotification(reminderPayload, fallbackTrigger);
      }

      return notificationId;
    } catch (err) {
      console.error('Failed to schedule task reminder:', err);
      return null;
    }
  }

  public async scheduleNoteReminder(note: KeepNote): Promise<string | null> {
    try {
      const notifEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifEnabled) return null;

      if (!note.reminderTime) {
        await this.cancelNoteReminder(note.id);
        return null;
      }

      const targetDate = parseISO(note.reminderTime);
      if (!isValid(targetDate) || isBefore(targetDate, new Date())) {
        await this.cancelNoteReminder(note.id);
        return null;
      }

      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';
      const vibrationEnabled = (await settingsRepository.get('notificationVibration', 'true')) === 'true';
      const channelId = soundEnabled ? CHANNELS.LIFE_PLANNER.id : CHANNELS.SILENT.id;
      const notificationId = `note_${note.id}`;

      await notifee.cancelNotification(notificationId);

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: targetDate.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      const title = note.title || 'Note Reminder';
      const body = note.content || 'Reminder for your note';

      const reminderPayload = {
        id: notificationId,
        title,
        subtitle: 'Keep Notes',
        body,
        data: {
          noteId: note.id,
          actionType: 'note_reminder',
        },
        android: {
          channelId,
          smallIcon: 'ic_notification',
          importance: CHANNELS.LIFE_PLANNER.importance,
          visibility: AndroidVisibility.PUBLIC,
          category: AndroidCategory.REMINDER,
          sound: soundEnabled ? 'default' : undefined,
          vibrationPattern: vibrationEnabled ? [300, 500] : undefined,
          autoCancel: true,
          pressAction: {
            id: 'default',
          },
        },
      };

      try {
        await notifee.createTriggerNotification(reminderPayload, trigger);
      } catch {
        const fallbackTrigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: targetDate.getTime(),
        };
        await notifee.createTriggerNotification(reminderPayload, fallbackTrigger);
      }

      return notificationId;
    } catch (err) {
      console.warn('Failed to schedule note reminder:', err);
      return null;
    }
  }

  public async cancelNoteReminder(noteId: string): Promise<void> {
    try {
      await notifee.cancelNotification(`note_${noteId}`);
    } catch (e) {
      console.warn('Failed to cancel note reminder:', e);
    }
  }

  public async scheduleHabitReminder(habit: Habit): Promise<string | null> {
    try {
      const notifEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifEnabled) return null;

      if (!habit.reminderTime || habit.archivedAt) {
        await this.cancelHabitReminder(habit.id);
        return null;
      }

      const timeMatch = habit.reminderTime.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
      if (!timeMatch) return null;
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const period = timeMatch[3]?.toLowerCase();
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

      let allowedDays = [0, 1, 2, 3, 4, 5, 6];
      if (habit.recurrenceRule?.daysOfWeek && habit.recurrenceRule.daysOfWeek.length > 0) {
        allowedDays = habit.recurrenceRule.daysOfWeek;
      } else if (habit.recurrenceRule?.type === 'weekdays') {
        allowedDays = [1, 2, 3, 4, 5];
      } else if (habit.recurrenceRule?.type === 'weekends') {
        allowedDays = [0, 6];
      }

      const now = new Date();
      let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
      if (isBefore(targetDate, now) || !allowedDays.includes(targetDate.getDay())) {
        for (let i = 1; i <= 7; i++) {
          const nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hours, minutes, 0, 0);
          if (allowedDays.includes(nextDate.getDay())) {
            targetDate = nextDate;
            break;
          }
        }
      }

      const notificationId = `habit_${habit.id}`;
      await notifee.cancelNotification(notificationId);

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: targetDate.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';
      const channelId = soundEnabled ? CHANNELS.HABITS.id : CHANNELS.SILENT.id;

      const payload = {
        id: notificationId,
        title: habit.name,
        subtitle: 'Habit Reminder',
        body: habit.description || `Time for your daily ${habit.name}!`,
        data: {
          habitId: habit.id,
          actionType: 'habit_reminder',
        },
        android: {
          channelId,
          smallIcon: 'ic_notification',
          importance: AndroidImportance.DEFAULT,
          visibility: AndroidVisibility.PUBLIC,
          category: AndroidCategory.REMINDER,
          autoCancel: true,
          pressAction: { id: 'default' },
        },
      };

      try {
        await notifee.createTriggerNotification(payload, trigger);
      } catch {
        const fallbackTrigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: targetDate.getTime(),
        };
        await notifee.createTriggerNotification(payload, fallbackTrigger);
      }

      return notificationId;
    } catch (e) {
      console.warn('Failed to schedule habit reminder:', e);
      return null;
    }
  }

  public async cancelHabitReminder(habitId: string): Promise<void> {
    try {
      await notifee.cancelNotification(`habit_${habitId}`);
    } catch (e) {
      console.warn('cancelHabitReminder error:', e);
    }
  }

  public async cancelTaskReminder(taskId: string): Promise<void> {
    try {
      await notifee.cancelNotification(`task_${taskId}`);
      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(`alarm_task_${taskId}`);
        } catch {}
      }
      try {
        const { alarmService } = await import('../alarm/AlarmService');
        await alarmService.cancelTaskAlarm(taskId);
      } catch {}
    } catch (e) {
      console.warn('cancelTaskReminder error:', e);
    }
  }

  public async cancelAllReminders(): Promise<void> {
    try {
      await notifee.cancelAllNotifications();
      if (AlarmRingtone?.cancelAllAlarms) {
        try {
          await AlarmRingtone.cancelAllAlarms();
        } catch {}
      }
      try {
        const tasks = await taskRepository.findAll();
        for (const t of tasks) {
          if (AlarmRingtone?.cancelExactAlarm) {
            try {
              await AlarmRingtone.cancelExactAlarm(`alarm_task_${t.id}`);
            } catch {}
          }
        }
      } catch {}
    } catch (e) {
      console.warn('cancelAllReminders error:', e);
    }
  }

  public async snoozeTaskReminder(
    taskId: string,
    snoozeMinutes: SnoozeDurationOption = 10
  ): Promise<void> {
    try {
      const task = await taskRepository.findById(taskId);
      if (!task) return;

      const safeMinutes = Math.max(1, Math.min(1440, Number(snoozeMinutes) || 10));
      const now = new Date();
      const snoozeTarget = addMinutes(now, safeMinutes);
      const snoozeIso = snoozeTarget.toISOString();

      // Persist snooze state in SQLite
      await taskRepository.update(taskId, {
        snoozeUntil: snoozeIso,
      });

      const notificationId = `task_${taskId}`;
      await notifee.cancelNotification(notificationId);

      if (AlarmRingtone?.cancelExactAlarm) {
        try {
          await AlarmRingtone.cancelExactAlarm(`alarm_task_${taskId}`);
        } catch {}
      }

      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';
      const channelId = soundEnabled ? ALARM_CLOCK_CHANNEL_ID : CHANNELS.SILENT.id;

      // Also register native exact alarm for guaranteed wake-up even if app is cleared from Recents
      if (AlarmRingtone?.scheduleExactAlarm) {
        try {
          await AlarmRingtone.scheduleExactAlarm(
            `alarm_task_${taskId}`,
            snoozeTarget.getTime(),
            `Task: ${task.title} (Snoozed)`,
            `Snoozed reminder (${safeMinutes}m)`
          );
        } catch (e) {
          console.warn('Native exact snooze task alarm error:', e);
        }
      }

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: snoozeTarget.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      const snoozePayload = {
        id: notificationId,
        title: task.title,
        subtitle: 'Life Planner (Snoozed)',
        body: `Snoozed reminder (${safeMinutes}m)`,
        data: {
          taskId: task.id,
          taskTitle: task.title,
          description: `Snoozed reminder (${safeMinutes}m)`,
          actionType: 'task_alarm',
        },
        android: {
          channelId,
          smallIcon: 'ic_notification',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          category: AndroidCategory.ALARM,
          autoCancel: true,
          fullScreenAction: { id: 'default' },
          pressAction: { id: 'default' },
          actions: [
            {
              title: '🔕 DISMISS',
              pressAction: { id: 'dismiss' },
            },
            {
              title: '✅ COMPLETE',
              pressAction: { id: 'done' },
            },
            {
              title: `💤 SNOOZE (${safeMinutes}m)`,
              pressAction: { id: 'snooze' },
            },
          ],
        },
      };

      try {
        await notifee.createTriggerNotification(snoozePayload, trigger);
      } catch {
        const fallbackTrigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: snoozeTarget.getTime(),
        };
        await notifee.createTriggerNotification(snoozePayload, fallbackTrigger);
      }
    } catch (err) {
      console.error('Failed to snooze task reminder:', err);
    }
  }

  public async handleNotificationEvent(event: Event): Promise<void> {
    const { type, detail } = event;
    const actionId = detail?.pressAction?.id;
    const taskId = detail?.notification?.data?.taskId as string;
    const notificationId = detail?.notification?.id;

    // 1. Tapping or swiping away a notification always dismisses it from drawer
    if (type === EventType.PRESS || type === EventType.DISMISSED) {
      if (notificationId) {
        await notifee.cancelNotification(notificationId);
      }
      return;
    }

    // 2. Action button presses
    if (type === EventType.ACTION_PRESS) {
      if (actionId === 'dismiss' || actionId === 'stop_alarm') {
        try {
          if (AlarmRingtone?.stop) {
            AlarmRingtone.stop();
          }
        } catch {}
        try {
          const { alarmService } = await import('../alarm/AlarmService');
          alarmService.stopRinging();
        } catch {}
        if (notificationId) {
          await notifee.cancelNotification(notificationId);
        }
      } else if (actionId === 'done' || actionId === 'complete_task') {
        try {
          if (AlarmRingtone?.stop) {
            AlarmRingtone.stop();
          }
        } catch {}
        try {
          const { alarmService } = await import('../alarm/AlarmService');
          alarmService.stopRinging();
        } catch {}
        if (taskId) {
          try {
            const { taskService } = await import('../tasks/TaskService');
            await taskService.completeTask(taskId);
          } catch {
            const now = new Date().toISOString();
            await taskRepository.update(taskId, {
              status: 'completed',
              completedAt: now,
            });
          }
        }
        if (notificationId) {
          await notifee.cancelNotification(notificationId);
        }
      } else if (actionId === 'snooze') {
        try {
          if (AlarmRingtone?.stop) {
            AlarmRingtone.stop();
          }
        } catch {}
        try {
          const { alarmService } = await import('../alarm/AlarmService');
          alarmService.stopRinging(false);
        } catch {}
        if (taskId) {
          const defaultSnoozeStr = await settingsRepository.get('defaultSnoozeMinutes', '10');
          const minutes = (parseInt(defaultSnoozeStr, 10) || 10) as SnoozeDurationOption;
          await this.snoozeTaskReminder(taskId, minutes);
        }
        if (notificationId) {
          await notifee.cancelNotification(notificationId);
        }
        try {
          await notifee.cancelNotification('active_ringing_alarm');
          await notifee.cancelNotification('active_battery_alarm');
        } catch {}
      }
    }
  }

  public async restoreAllReminders(): Promise<void> {
    try {
      const allTasks = await taskRepository.findAll();
      const now = new Date();

      for (const t of allTasks) {
        if (t.status === 'completed' || t.status === 'cancelled') {
          continue;
        }

        if (t.snoozeUntil) {
          const snoozeDate = parseISO(t.snoozeUntil);
          if (isValid(snoozeDate) && !isBefore(snoozeDate, now)) {
            const remainingMinutes = Math.max(1, Math.round((snoozeDate.getTime() - now.getTime()) / 60000));
            await this.snoozeTaskReminder(t.id, remainingMinutes as SnoozeDurationOption);
            continue;
          }
        }

        if (t.date && (t.startTime || (t.reminderMinutes !== undefined && t.reminderMinutes >= 0))) {
          await this.scheduleTaskReminder(t);
        }
      }

      // Restore active Keep Note reminders
      try {
        const notesWithReminders = await keepNoteRepository.findAll({ status: 'reminders' });
        for (const note of notesWithReminders) {
          if (note.reminderTime) {
            const targetDate = parseISO(note.reminderTime);
            if (isValid(targetDate) && !isBefore(targetDate, now)) {
              await this.scheduleNoteReminder(note);
            }
          }
        }
      } catch (noteErr) {
        console.warn('Failed to restore note reminders:', noteErr);
      }

      // Restore active Habit reminders
      try {
        const activeHabits = await habitRepository.findActive();
        for (const habit of activeHabits) {
          if (habit.reminderTime && !habit.archivedAt) {
            await this.scheduleHabitReminder(habit);
          }
        }
      } catch (habitErr) {
        console.warn('Failed to restore habit reminders:', habitErr);
      }
    } catch (e) {
      console.error('restoreAllReminders error:', e);
    }
  }
}

export const notificationService = NotificationService.getInstance();
