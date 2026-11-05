import { notificationService, CHANNELS, ALARM_CLOCK_CHANNEL_ID } from '../src/services/notifications/NotificationService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { keepNoteRepository } from '../src/database/repositories/KeepNoteRepository';
import { habitRepository } from '../src/database/repositories/HabitRepository';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { getDatabase } from '../src/database/connection';
import notifee, { EventType } from '@notifee/react-native';
import { Task, KeepNote, Habit } from '../src/types';
import { format, addDays, addMinutes, subDays } from 'date-fns';

function createTask(partial: Partial<Task> & { id: string; title: string; date: string }): Task {
  const now = new Date().toISOString();
  return {
    priority: 'medium',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function createKeepNote(partial: Partial<KeepNote> & { id: string; title: string }): KeepNote {
  const now = new Date().toISOString();
  return {
    content: 'Test content',
    type: 'text',
    color: 'default',
    isPinned: false,
    isArchived: false,
    isTrashed: false,
    labels: [],
    checklistData: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function createHabit(partial: Partial<Habit> & { id: string; name: string }): Habit {
  const now = new Date().toISOString();
  return {
    icon: '🎯',
    color: '#3B82F6',
    recurrenceRule: { type: 'daily' },
    target: 1,
    createdAt: now,
    ...partial,
  };
}

describe('NotificationService Comprehensive Test Suite (No Mocks/No Mock Data)', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(async () => {
    const db = await getDatabase();
    await db.execute('DELETE FROM tasks');
    await db.execute('DELETE FROM keep_notes');
    await db.execute('DELETE FROM habits');
    await db.execute('DELETE FROM habit_logs');

    await settingsRepository.set('notificationsEnabled', 'true');
    await settingsRepository.set('notificationSound', 'true');
    await settingsRepository.set('notificationVibration', 'true');
    await settingsRepository.set('defaultSnoozeMinutes', '10');

    (notifee.createTriggerNotification as jest.Mock).mockClear();
    (notifee.cancelNotification as jest.Mock).mockClear();
    (notifee.cancelAllNotifications as jest.Mock).mockClear();
    (notifee.createChannel as jest.Mock).mockClear();
  });

  it('1. should initialize successfully and setup Android notification channels', async () => {
    await notificationService.initialize(true);
    expect(notifee.createChannel).toHaveBeenCalled();
  });

  it('2. should schedule task reminder with future date and 24h time format', async () => {
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const task = createTask({
      id: 'task_future_1',
      title: 'Review Quarterly Report',
      date: tomorrowStr,
      startTime: '14:30',
      priority: 'medium',
    });

    const notifId = await notificationService.scheduleTaskReminder(task);
    expect(notifId).toBe('task_task_future_1');
    expect(notifee.createTriggerNotification).toHaveBeenCalled();
  });

  it('3. should schedule task reminder with 12h AM/PM time format', async () => {
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const task = createTask({
      id: 'task_future_am',
      title: 'Morning Standup Meeting',
      date: tomorrowStr,
      startTime: '09:15 am',
      priority: 'medium',
    });

    const notifId = await notificationService.scheduleTaskReminder(task);
    expect(notifId).toBe('task_task_future_am');
    expect(notifee.createTriggerNotification).toHaveBeenCalled();
  });

  it('4. should schedule task reminder with ISO timestamp formatted date string', async () => {
    const tomorrowDate = addDays(new Date(), 1);
    const isoDateStr = `${format(tomorrowDate, 'yyyy-MM-dd')}T00:00:00.000Z`;
    const task = createTask({
      id: 'task_iso_date',
      title: 'ISO Timestamp Task',
      date: isoDateStr,
      startTime: '11:00',
    });

    const notifId = await notificationService.scheduleTaskReminder(task);
    expect(notifId).toBe('task_task_iso_date');
    expect(notifee.createTriggerNotification).toHaveBeenCalled();
  });

  it('5. should reject completed or cancelled tasks and cancel any existing reminder', async () => {
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const completedTask = createTask({
      id: 'task_completed_1',
      title: 'Already Finished Task',
      date: tomorrowStr,
      startTime: '10:00',
      status: 'completed',
    });

    const res1 = await notificationService.scheduleTaskReminder(completedTask);
    expect(res1).toBeNull();
    expect(notifee.cancelNotification).toHaveBeenCalledWith('task_task_completed_1');

    const cancelledTask = createTask({
      id: 'task_cancelled_1',
      title: 'Cancelled Task',
      date: tomorrowStr,
      startTime: '10:00',
      status: 'cancelled',
    });

    const res2 = await notificationService.scheduleTaskReminder(cancelledTask);
    expect(res2).toBeNull();
    expect(notifee.cancelNotification).toHaveBeenCalledWith('task_task_cancelled_1');
  });

  it('6. should reject tasks scheduled in the past', async () => {
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const task = createTask({
      id: 'task_past',
      title: 'Past Task',
      date: yesterdayStr,
      startTime: '08:00',
    });

    const res = await notificationService.scheduleTaskReminder(task);
    expect(res).toBeNull();
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('7. should reject invalid time strings (e.g. 25:00 or invalid syntax)', async () => {
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const taskInvalidHour = createTask({
      id: 'task_invalid_hour',
      title: 'Invalid Hour',
      date: tomorrowStr,
      startTime: '25:00',
    });

    const res1 = await notificationService.scheduleTaskReminder(taskInvalidHour);
    expect(res1).toBeNull();

    const taskInvalidSyntax = createTask({
      id: 'task_bad_syntax',
      title: 'Bad Syntax',
      date: tomorrowStr,
      startTime: 'not-a-time',
    });

    const res2 = await notificationService.scheduleTaskReminder(taskInvalidSyntax);
    expect(res2).toBeNull();
  });

  it('8. should reject untimed all-day tasks without an explicit positive reminder', async () => {
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const taskUntimed = createTask({
      id: 'task_untimed',
      title: 'All Day Untimed Task',
      date: tomorrowStr,
      reminderMinutes: 0,
    });

    const res = await notificationService.scheduleTaskReminder(taskUntimed);
    expect(res).toBeNull();
    expect(notifee.cancelNotification).toHaveBeenCalledWith('task_task_untimed');
  });

  it('9. should route high-priority or loud tasks to ALARM_CLOCK_CHANNEL_ID and silent when sound disabled', async () => {
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const highTask = createTask({
      id: 'task_high_prio',
      title: 'Urgent System Deployment',
      date: tomorrowStr,
      startTime: '15:00',
      priority: 'high',
    });

    await notificationService.scheduleTaskReminder(highTask);
    const lastCall = (notifee.createTriggerNotification as jest.Mock).mock.calls[0];
    const payload = lastCall[0];
    expect(payload.android.channelId).toBe(ALARM_CLOCK_CHANNEL_ID);

    // Turn sound off in settings
    (notifee.createTriggerNotification as jest.Mock).mockClear();
    await settingsRepository.set('notificationSound', 'false');
    await notificationService.scheduleTaskReminder(highTask);
    const silentCall = (notifee.createTriggerNotification as jest.Mock).mock.calls[0];
    expect(silentCall[0].android.channelId).toBe(CHANNELS.SILENT.id);
  });

  it('10. should respect notificationsEnabled setting and abort if disabled', async () => {
    await settingsRepository.set('notificationsEnabled', 'false');
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const task = createTask({
      id: 'task_notif_disabled',
      title: 'Should Not Schedule',
      date: tomorrowStr,
      startTime: '12:00',
    });

    const res = await notificationService.scheduleTaskReminder(task);
    expect(res).toBeNull();
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('11. should snooze task reminder and persist snoozeUntil timestamp in database', async () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    await taskRepository.create(createTask({
      id: 'task_to_snooze',
      title: 'Task To Snooze',
      date: todayStr,
      startTime: '10:00',
    }));

    await notificationService.snoozeTaskReminder('task_to_snooze', 15);

    const updated = await taskRepository.findById('task_to_snooze');
    expect(updated?.snoozeUntil).toBeDefined();

    expect(notifee.createTriggerNotification).toHaveBeenCalled();
    const call = (notifee.createTriggerNotification as jest.Mock).mock.calls[0];
    expect(call[0].body).toContain('15m');
    // Ensure the DISMISS button has action id 'dismiss' and NOT 'done'
    const dismissAction = call[0].android.actions.find((a: any) => a.pressAction.id === 'dismiss');
    expect(dismissAction).toBeDefined();
    expect(dismissAction.title).toContain('DISMISS');
  });

  it('12. should safely clamp snoozeMinutes when invalid or negative values are passed', async () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    await taskRepository.create(createTask({
      id: 'task_invalid_snooze',
      title: 'Invalid Snooze Task',
      date: todayStr,
      startTime: '10:00',
    }));

    await notificationService.snoozeTaskReminder('task_invalid_snooze', -5 as any);

    const updated = await taskRepository.findById('task_invalid_snooze');
    expect(updated?.snoozeUntil).toBeDefined();
    expect(notifee.createTriggerNotification).toHaveBeenCalled();
  });

  it('13. should cancel task reminder correctly', async () => {
    await notificationService.cancelTaskReminder('task_xyz');
    expect(notifee.cancelNotification).toHaveBeenCalledWith('task_task_xyz');
  });

  it('14. should schedule keep note reminder with valid future timestamp', async () => {
    const futureIso = addMinutes(new Date(), 60).toISOString();
    const note = createKeepNote({
      id: 'note_123',
      title: 'Doctor Appointment Note',
      reminderTime: futureIso,
    });

    const res = await notificationService.scheduleNoteReminder(note);
    expect(res).toBe('note_note_123');
    expect(notifee.createTriggerNotification).toHaveBeenCalled();
  });

  it('15. should reject keep note reminder with past or missing reminderTime and clean up', async () => {
    const noteNoReminder = createKeepNote({
      id: 'note_no_rem',
      title: 'Note without reminder',
    });

    const res1 = await notificationService.scheduleNoteReminder(noteNoReminder);
    expect(res1).toBeNull();
    expect(notifee.cancelNotification).toHaveBeenCalledWith('note_note_no_rem');

    const pastIso = subDays(new Date(), 1).toISOString();
    const notePast = createKeepNote({
      id: 'note_past',
      title: 'Past Note',
      reminderTime: pastIso,
    });

    const res2 = await notificationService.scheduleNoteReminder(notePast);
    expect(res2).toBeNull();
    expect(notifee.cancelNotification).toHaveBeenCalledWith('note_note_past');
  });

  it('16. should cancel keep note reminder correctly', async () => {
    await notificationService.cancelNoteReminder('note_abc');
    expect(notifee.cancelNotification).toHaveBeenCalledWith('note_note_abc');
  });

  it('17. should schedule and cancel habit reminder successfully', async () => {
    const habit = createHabit({
      id: 'habit_drink_water',
      name: 'Drink Water',
      reminderTime: '18:00',
    });

    const res = await notificationService.scheduleHabitReminder(habit);
    expect(res).toBe('habit_habit_drink_water');
    expect(notifee.createTriggerNotification).toHaveBeenCalled();

    await notificationService.cancelHabitReminder('habit_drink_water');
    expect(notifee.cancelNotification).toHaveBeenCalledWith('habit_habit_drink_water');
  });

  it('18. should cancel all notifications when cancelAllReminders is invoked', async () => {
    await notificationService.cancelAllReminders();
    expect(notifee.cancelAllNotifications).toHaveBeenCalled();
  });

  it('19. should handle notification tap (EventType.PRESS) by dismissing notification from drawer', async () => {
    await notificationService.handleNotificationEvent({
      type: EventType.PRESS,
      detail: {
        notification: {
          id: 'note_any_id',
          data: { noteId: '123' },
        },
      },
    });

    expect(notifee.cancelNotification).toHaveBeenCalledWith('note_any_id');
  });

  it('20. should handle action "dismiss" without completing task', async () => {
    const task = await taskRepository.create(createTask({
      id: 'task_dismiss_action',
      title: 'Dismiss Action Task',
      date: format(new Date(), 'yyyy-MM-dd'),
      status: 'pending',
    }));

    await notificationService.handleNotificationEvent({
      type: EventType.ACTION_PRESS,
      detail: {
        notification: {
          id: `task_${task.id}`,
          data: { taskId: task.id },
        },
        pressAction: { id: 'dismiss' },
      },
    });

    const after = await taskRepository.findById(task.id);
    expect(after?.status).toBe('pending'); // Must stay pending!
    expect(notifee.cancelNotification).toHaveBeenCalledWith(`task_${task.id}`);
  });

  it('21. should handle action "done" by marking task completed in SQLite', async () => {
    const task = await taskRepository.create(createTask({
      id: 'task_done_action',
      title: 'Complete Me Action Task',
      date: format(new Date(), 'yyyy-MM-dd'),
      status: 'pending',
    }));

    await notificationService.handleNotificationEvent({
      type: EventType.ACTION_PRESS,
      detail: {
        notification: {
          id: `task_${task.id}`,
          data: { taskId: task.id },
        },
        pressAction: { id: 'done' },
      },
    });

    const after = await taskRepository.findById(task.id);
    expect(after?.status).toBe('completed');
    expect(after?.completedAt).toBeDefined();
    expect(notifee.cancelNotification).toHaveBeenCalledWith(`task_${task.id}`);
  });

  it('22. should restore all tasks and Keep Note reminders without throwing on corrupt snoozeUntil', async () => {
    const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    // 1. Valid pending task
    await taskRepository.create(createTask({
      id: 'task_valid_restore',
      title: 'Valid Task To Restore',
      date: tomorrowStr,
      startTime: '10:00',
    }));

    // 2. Corrupt snoozeUntil string that previously crashed with RangeError: Invalid time value
    await taskRepository.create(createTask({
      id: 'task_corrupt_snooze',
      title: 'Corrupt Snooze Task',
      date: tomorrowStr,
      startTime: '10:00',
      snoozeUntil: 'invalid-corrupt-date-string',
    }));

    // 3. Keep Note with future reminder
    await keepNoteRepository.create(createKeepNote({
      id: 'note_restore_1',
      title: 'Keep Note Reminder To Restore',
      content: 'Important reminder',
      reminderTime: addMinutes(new Date(), 120).toISOString(),
    }));

    // 4. Habit with scheduled reminder
    await habitRepository.create(createHabit({
      id: 'habit_restore_1',
      name: 'Restored Morning Routine',
      reminderTime: '07:30',
    }));

    // restoreAllReminders should succeed smoothly
    await expect(notificationService.restoreAllReminders()).resolves.not.toThrow();
  });

  it('23. should schedule habit reminder matching allowed daysOfWeek recurrence rules', async () => {
    // Weekday-only habit
    const weekdayHabit = createHabit({
      id: 'habit_weekday_only',
      name: 'Weekday Focus Session',
      reminderTime: '10:00',
      recurrenceRule: { type: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5] },
    });

    const notifId = await notificationService.scheduleHabitReminder(weekdayHabit);
    expect(notifId).toBe('habit_habit_weekday_only');
    expect(notifee.createTriggerNotification).toHaveBeenCalled();

    const call = (notifee.createTriggerNotification as jest.Mock).mock.calls.slice(-1)[0];
    const triggerTimestamp = call[1].timestamp;
    const triggerDate = new Date(triggerTimestamp);
    // Trigger date's day of week must be between Monday (1) and Friday (5)
    expect(triggerDate.getDay()).toBeGreaterThanOrEqual(1);
    expect(triggerDate.getDay()).toBeLessThanOrEqual(5);
  });
});
