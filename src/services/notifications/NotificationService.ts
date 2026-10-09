import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType,
  Event,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
import { Task, SnoozeDurationOption } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { parseISO, addMinutes, isBefore } from 'date-fns';

export const CHANNELS = {
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

      // 2. Request Notification Permission (contextual check)
      await notifee.requestPermission();

      // 3. Register foreground event listener
      notifee.onForegroundEvent(async (event: Event) => {
        await this.handleNotificationEvent(event);
      });

      this.isInitialized = true;
    } catch (e) {
      console.warn('NotificationService initialize warning:', e);
    }
  }

  private async setupChannels(): Promise<void> {
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
  }

  public async scheduleTaskReminder(task: Task): Promise<string | null> {
    try {
      // Check if notifications are enabled in settings
      const notifEnabled = (await settingsRepository.get('notificationsEnabled', 'true')) === 'true';
      if (!notifEnabled) return null;

      if (!task.date || !task.startTime) {
        return null;
      }

      // Calculate scheduled trigger time robustly (handles 12h AM/PM or 24h formats)
      const match = task.startTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!match) return null;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const period = match[3]?.toLowerCase();
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      const dateParts = task.date.split('-').map(Number);
      if (dateParts.length !== 3 || dateParts.some(isNaN)) return null;
      let targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], hours, minutes, 0, 0);

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

      const channelId =
        task.priority === 'high' ? CHANNELS.HIGH_PRIORITY.id : CHANNELS.LIFE_PLANNER.id;

      const notificationId = `task_${task.id}`;

      // Cancel any prior notification for this task
      await notifee.cancelNotification(notificationId);

      // Create Android AlarmManager Timestamp Trigger (allowWhileIdle for exact wake up)
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: targetDate.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      const title = task.title;
      const subtitle = task.reminderMinutes && task.reminderMinutes > 0
        ? `Starts in ${task.reminderMinutes} minutes`
        : "It's time to start your task.";

      await notifee.createTriggerNotification(
        {
          id: notificationId,
          title,
          subtitle: 'Life Planner',
          body: subtitle,
          data: {
            taskId: task.id,
            actionType: 'task_reminder',
          },
          android: {
            channelId,
            importance: CHANNELS.LIFE_PLANNER.importance,
            visibility: AndroidVisibility.PUBLIC, // Lock-screen visible
            category: 'reminder' as any,
            sound: soundEnabled ? 'default' : undefined,
            vibrationPattern: vibrationEnabled ? [300, 500] : undefined,
            pressAction: {
              id: 'default',
            },
            actions: [
              {
                title: 'DONE',
                pressAction: {
                  id: 'done',
                },
              },
              {
                title: 'SNOOZE',
                pressAction: {
                  id: 'snooze',
                },
              },
            ],
          },
        },
        trigger
      );

      return notificationId;
    } catch (err) {
      console.error('Failed to schedule task reminder:', err);
      return null;
    }
  }

  public async cancelTaskReminder(taskId: string): Promise<void> {
    try {
      await notifee.cancelNotification(`task_${taskId}`);
    } catch (e) {
      console.warn('cancelTaskReminder error:', e);
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

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: snoozeTarget.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      await notifee.createTriggerNotification(
        {
          id: notificationId,
          title: task.title,
          subtitle: 'Life Planner (Snoozed)',
          body: `Snoozed reminder (${snoozeMinutes}m)`,
          data: {
            taskId: task.id,
            actionType: 'task_reminder',
          },
          android: {
            channelId: CHANNELS.LIFE_PLANNER.id,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            pressAction: { id: 'default' },
            actions: [
              {
                title: 'DONE',
                pressAction: { id: 'done' },
              },
              {
                title: 'SNOOZE',
                pressAction: { id: 'snooze' },
              },
            ],
          },
        },
        trigger
      );
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

    if (type === EventType.ACTION_PRESS) {
      if (actionId === 'done') {
        const now = new Date().toISOString();
        await taskRepository.update(taskId, {
          status: 'completed',
          completedAt: now,
        });
        if (notificationId) {
          await notifee.cancelNotification(notificationId);
        }
      } else if (actionId === 'snooze') {
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

        if (t.date && t.startTime) {
          const match = t.startTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
          if (match) {
            let hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            const period = match[3]?.toLowerCase();
            if (period === 'pm' && hours < 12) hours += 12;
            if (period === 'am' && hours === 12) hours = 0;

            const parts = t.date.split('-').map(Number);
            if (parts.length === 3 && !parts.some(isNaN)) {
              let targetDate = new Date(parts[0], parts[1] - 1, parts[2], hours, minutes, 0, 0);
              if (t.reminderMinutes && t.reminderMinutes > 0) {
                targetDate = addMinutes(targetDate, -t.reminderMinutes);
              }
              if (!isBefore(targetDate, now)) {
                await this.scheduleTaskReminder(t);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('restoreAllReminders error:', e);
    }
  }
}

export const notificationService = NotificationService.getInstance();
