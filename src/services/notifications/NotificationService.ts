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
import { Task, SnoozeDurationOption, KeepNote } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
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

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

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
    if (Platform.OS !== 'android') return;

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
            await notifee.openAlarmPermissionSettings();
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
      const effectiveTime = task.startTime || '09:00';
      const match = effectiveTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!match) return null;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const period = match[3]?.toLowerCase();
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      const dateParts = task.date.split('-').map(Number);
      if (dateParts.length !== 3 || dateParts.some(isNaN)) return null;
      let targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], hours, minutes, 0, 0);
      if (isNaN(targetDate.getTime())) return null;

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
              title: '🔕 STOP ALARM',
              pressAction: {
                id: 'dismiss',
              },
            },
            {
              title: '💤 SNOOZE (5m)',
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
          category: 'reminder' as any,
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

      const now = new Date();
      const snoozeTarget = addMinutes(now, snoozeMinutes);
      const snoozeIso = snoozeTarget.toISOString();

      // Persist snooze state in SQLite
      await taskRepository.update(taskId, {
        snoozeUntil: snoozeIso,
      });

      const notificationId = `task_${taskId}`;
      await notifee.cancelNotification(notificationId);

      const soundEnabled = (await settingsRepository.get('notificationSound', 'true')) === 'true';
      const channelId = soundEnabled ? ALARM_CLOCK_CHANNEL_ID : CHANNELS.SILENT.id;

      // Also register native exact alarm for guaranteed wake-up even if app is cleared from Recents
      if (AlarmRingtone?.scheduleExactAlarm) {
        try {
          await AlarmRingtone.scheduleExactAlarm(
            `alarm_task_${taskId}`,
            snoozeTarget.getTime(),
            `Task: ${task.title} (Snoozed)`,
            `Snoozed reminder (${snoozeMinutes}m)`
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
        body: `Snoozed reminder (${snoozeMinutes}m)`,
        data: {
          taskId: task.id,
          taskTitle: task.title,
          description: `Snoozed reminder (${snoozeMinutes}m)`,
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
              title: '🔕 STOP ALARM',
              pressAction: { id: 'done' },
            },
            {
              title: '💤 SNOOZE (5m)',
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

    if (!taskId) return;

    if (type === EventType.PRESS) {
      if (notificationId) {
        await notifee.cancelNotification(notificationId);
      }
    } else if (type === EventType.ACTION_PRESS) {
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
          alarmService.stopRinging();
        } catch {}
        const defaultSnoozeStr = await settingsRepository.get('defaultSnoozeMinutes', '10');
        const minutes = (parseInt(defaultSnoozeStr, 10) || 10) as SnoozeDurationOption;
        await this.snoozeTaskReminder(taskId, minutes);
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
          if (!isBefore(snoozeDate, now)) {
            const remainingMinutes = Math.max(1, Math.round((snoozeDate.getTime() - now.getTime()) / 60000));
            await this.snoozeTaskReminder(t.id, remainingMinutes as SnoozeDurationOption);
            continue;
          }
        }

        if (t.date && (t.startTime || (t.reminderMinutes !== undefined && t.reminderMinutes >= 0))) {
          await this.scheduleTaskReminder(t);
        }
      }
    } catch (e) {
      console.error('restoreAllReminders error:', e);
    }
  }
}

export const notificationService = NotificationService.getInstance();
