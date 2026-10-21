import { Task, CreateTaskDTO, UpdateTaskDTO, SnoozeDurationOption, CalendarEvent, HabitWithStreak } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { notificationService } from '../notifications/NotificationService';
import { format, parseISO, addDays, addMonths, isValid } from 'date-fns';
import { normalizeTimeTo24H, parseTimeToMinutes } from '../../utils/time';
import { toggleBulletInRawText } from '../../utils/bulletNotes';

export class TaskService {

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    // Validation
    if (!dto.title || dto.title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }

    const normStart = normalizeTimeTo24H(dto.startTime);
    const normEnd = normalizeTimeTo24H(dto.endTime);
    const isOvernight = Boolean(dto.recurrenceRule?.isOvernight);
    if (normStart && normEnd && !isOvernight) {
      const startMin = parseTimeToMinutes(normStart);
      const endMin = parseTimeToMinutes(normEnd);
      if (startMin !== null && endMin !== null && endMin < startMin) {
        throw new Error('End time cannot be earlier than start time.');
      }
    }

    const now = new Date().toISOString();
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const seriesId = dto.recurrenceRule && dto.recurrenceRule.type !== 'none'
      ? dto.seriesId || `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      : dto.seriesId;

    const newTask: Task = {
      id,
      seriesId,
      title: dto.title.trim(),
      description: dto.description?.trim() || undefined,
      date: dto.date,
      startTime: normStart || undefined,
      endTime: normEnd || undefined,
      priority: dto.priority || 'medium',
      categoryId: dto.categoryId || undefined,
      status: 'pending',
      recurrenceRule: dto.recurrenceRule,
      reminderMinutes: dto.reminderMinutes ?? 0,
      notes: dto.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await taskRepository.create(newTask);

    // Schedule notification if reminder is enabled
    if (saved.date && (saved.startTime || (saved.reminderMinutes !== undefined && saved.reminderMinutes >= 0))) {
      await notificationService.scheduleTaskReminder(saved);
    }

    return saved;
  }

  async updateTask(id: string, dto: UpdateTaskDTO): Promise<Task | null> {
    if (dto.title !== undefined && dto.title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }

    const existing = await taskRepository.findById(id);
    if (!existing) return null;

    const rawStart = dto.startTime !== undefined ? dto.startTime : existing.startTime;
    const rawEnd = dto.endTime !== undefined ? dto.endTime : existing.endTime;
    const normStart = normalizeTimeTo24H(rawStart);
    const normEnd = normalizeTimeTo24H(rawEnd);
    const isOvernight =
      dto.recurrenceRule?.isOvernight !== undefined
        ? Boolean(dto.recurrenceRule?.isOvernight)
        : Boolean(existing.recurrenceRule?.isOvernight);
    if (normStart && normEnd && !isOvernight) {
      const startMin = parseTimeToMinutes(normStart);
      const endMin = parseTimeToMinutes(normEnd);
      if (startMin !== null && endMin !== null && endMin < startMin) {
        throw new Error('End time cannot be earlier than start time.');
      }
    }

    const updatePayload: UpdateTaskDTO = {
      ...dto,
      ...(dto.startTime !== undefined ? { startTime: normStart } : {}),
      ...(dto.endTime !== undefined ? { endTime: normEnd } : {}),
    };

    const updated = await taskRepository.update(id, updatePayload);
    if (!updated) return null;

    // Reschedule or cancel notification
    if (updated.status === 'completed' || updated.status === 'cancelled') {
      await notificationService.cancelTaskReminder(id);
    } else if (updated.date && (updated.startTime || (updated.reminderMinutes !== undefined && updated.reminderMinutes >= 0))) {
      await notificationService.scheduleTaskReminder(updated);
    }

    return updated;
  }

  async deleteTask(id: string, deleteEntireSeries = false): Promise<boolean> {
    const task = await taskRepository.findById(id);
    if (!task) return false;

    await notificationService.cancelTaskReminder(id);

    if (deleteEntireSeries && task.seriesId) {
      const seriesTasks = await taskRepository.findBySeriesId(task.seriesId);
      for (const t of seriesTasks) {
        await notificationService.cancelTaskReminder(t.id);
      }
      return await taskRepository.deleteBySeriesId(task.seriesId);
    }

    return await taskRepository.delete(id);
  }

  async skipRecurringTask(id: string): Promise<Task | null> {
    const task = await taskRepository.findById(id);
    if (!task) return null;

    await notificationService.cancelTaskReminder(id);
    const cancelled = await taskRepository.update(id, {
      status: 'cancelled',
    });

    if (task.recurrenceRule && task.recurrenceRule.type !== 'none') {
      try {
        await this.spawnNextRecurrence(task);
      } catch (err) {
        console.warn('Failed to auto-spawn skipped recurrence:', err);
      }
    }

    return cancelled;
  }

  async completeTask(id: string): Promise<Task | null> {
    const now = new Date().toISOString();
    const updated = await taskRepository.update(id, {
      status: 'completed',
      completedAt: now,
    });
    await notificationService.cancelTaskReminder(id);

    // If task is recurring, auto-spawn the next occurrence
    if (updated && updated.recurrenceRule && updated.recurrenceRule.type !== 'none') {
      try {
        await this.spawnNextRecurrence(updated);
      } catch (err) {
        console.warn('Failed to auto-spawn recurring task:', err);
      }
    }

    return updated;
  }

  private async spawnNextRecurrence(task: Task): Promise<Task | null> {
    const rule = task.recurrenceRule;
    if (!rule || rule.type === 'none') return null;

    const baseDate = parseISO(task.date);
    if (!isValid(baseDate)) return null;

    const advanceStep = (d: Date): Date => {
      switch (rule.type) {
        case 'daily':
          return addDays(d, rule.interval || 1);
        case 'weekdays': {
          let temp = addDays(d, 1);
          while (temp.getDay() === 0 || temp.getDay() === 6) {
            temp = addDays(temp, 1);
          }
          return temp;
        }
        case 'weekends': {
          let temp = addDays(d, 1);
          while (temp.getDay() !== 0 && temp.getDay() !== 6) {
            temp = addDays(temp, 1);
          }
          return temp;
        }
        case 'weekly':
        case 'custom': {
          if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
            const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);
            const currentDay = d.getDay();
            const nextDayThisWeek = sortedDays.find((day) => day > currentDay);
            if (nextDayThisWeek !== undefined) {
              return addDays(d, nextDayThisWeek - currentDay);
            }
            const firstDayNextWeek = sortedDays[0];
            const intervalWeeks = rule.interval && rule.interval > 1 ? rule.interval : 1;
            const daysToSunday = 7 - currentDay;
            const daysToAdd = daysToSunday + (intervalWeeks - 1) * 7 + firstDayNextWeek;
            return addDays(d, daysToAdd);
          }
          return addDays(d, (rule.interval || 1) * 7);
        }
        case 'monthly': {
          const originalDay = baseDate.getDate();
          const targetMonthDate = addMonths(d, rule.interval || 1);
          const maxDays = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth() + 1, 0).getDate();
          targetMonthDate.setDate(Math.min(originalDay, maxDays));
          return targetMonthDate;
        }
        default:
          return addDays(d, 1);
      }
    };

    let nextDate = advanceStep(baseDate);
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // If base date was overdue in the past, advance nextDate forward until today or future
    let advanceLimit = 0;
    while (format(nextDate, 'yyyy-MM-dd') < todayStr && advanceLimit < 365) {
      nextDate = advanceStep(nextDate);
      advanceLimit++;
    }

    const nextDateStr = format(nextDate, 'yyyy-MM-dd');
    if (rule.endDate && nextDateStr > rule.endDate) {
      return null;
    }

    // Prevent duplicate spawning: Match strictly by seriesId if present, else fallback to title
    const existingOnDate = await taskRepository.findByDate(nextDateStr);
    const alreadyExists = existingOnDate.some((t) => {
      if (t.status === 'cancelled') return false;
      if (task.seriesId && t.seriesId) {
        return t.seriesId === task.seriesId;
      }
      return t.title.toLowerCase().trim() === task.title.toLowerCase().trim();
    });
    if (alreadyExists) {
      return null;
    }

    const seriesId = task.seriesId || `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return await this.createTask({
      seriesId,
      title: task.title,
      description: task.description,
      date: nextDateStr,
      startTime: task.startTime,
      endTime: task.endTime,
      priority: task.priority,
      categoryId: task.categoryId,
      recurrenceRule: task.recurrenceRule,
      reminderMinutes: task.reminderMinutes,
      notes: task.notes,
    });
  }

  /**
   * Pre-generates recurring task occurrences up to `daysAhead` days in the future.
   * Ensures that upcoming tasks are visible on TasksScreen and TodayScreen timelines without flooding AlarmManager.
   */
  async ensureUpcomingRecurrences(daysAhead: number = 3): Promise<number> {
    try {
      const allTasks = await taskRepository.findAll();
      const recurringTasks = allTasks.filter(
        (t) => t.recurrenceRule && t.recurrenceRule.type !== 'none' && t.status !== 'cancelled'
      );
      if (recurringTasks.length === 0) return 0;

      const today = new Date();
      const horizonDateStr = format(addDays(today, daysAhead), 'yyyy-MM-dd');
      let spawnedCount = 0;

      // Group by seriesId (or task.id if no seriesId)
      const seriesMap = new Map<string, Task[]>();
      for (const t of recurringTasks) {
        const key = t.seriesId || t.id;
        if (!seriesMap.has(key)) seriesMap.set(key, []);
        seriesMap.get(key)!.push(t);
      }

      for (const [, instances] of seriesMap.entries()) {
        instances.sort((a, b) => a.date.localeCompare(b.date));
        const latest = instances[instances.length - 1];
        if (!latest || !latest.recurrenceRule || latest.recurrenceRule.type === 'none') continue;

        let currentCursor = latest;
        let safetyCounter = 0;

        while (currentCursor.date < horizonDateStr && safetyCounter < 10) {
          safetyCounter++;
          const spawned = await this.spawnNextRecurrence(currentCursor);
          if (!spawned) break;
          spawnedCount++;
          currentCursor = spawned;
        }
      }

      return spawnedCount;
    } catch (e) {
      console.warn('ensureUpcomingRecurrences warning:', e);
      return 0;
    }
  }

  /**
   * Toggles the completion state of a subtask/bullet item inside a task's notes,
   * preserving all surrounding paragraphs, URLs, headers, and non-bullet markdown.
   */
  async toggleSubtask(taskId: string, subtaskIndex: number): Promise<Task | null> {
    const task = await taskRepository.findById(taskId);
    if (!task) return null;

    const rawNotes = task.notes || task.description || '';
    const updatedNotes = toggleBulletInRawText(rawNotes, subtaskIndex);

    return await this.updateTask(taskId, {
      notes: updatedNotes,
      description: task.description ? toggleBulletInRawText(task.description, subtaskIndex) : updatedNotes,
    });
  }

  async uncompleteTask(id: string): Promise<Task | null> {
    const original = await taskRepository.findById(id);
    const updated = await taskRepository.update(id, {
      status: 'pending',
      completedAt: null as any,
    });

    // If this was a recurring task that auto-spawned a future occurrence upon completion,
    // clean up any pending future instance in the same series to prevent ghost duplications.
    if (original?.seriesId && original.recurrenceRule && original.recurrenceRule.type !== 'none') {
      try {
        const seriesTasks = await taskRepository.findBySeriesId(original.seriesId);
        const futureSpawned = seriesTasks.filter(
          (t) => t.id !== id && t.status === 'pending' && t.date > original.date
        );
        for (const ft of futureSpawned) {
          await notificationService.cancelTaskReminder(ft.id);
          await taskRepository.delete(ft.id);
        }
      } catch (err) {
        console.warn('Failed to clean up future recurrence on uncomplete:', err);
      }
    }

    if (updated && updated.date && updated.startTime) {
      await notificationService.scheduleTaskReminder(updated);
    }
    return updated;
  }

  async snoozeTask(id: string, minutes: SnoozeDurationOption = 10): Promise<Task | null> {
    await notificationService.snoozeTaskReminder(id, minutes);
    return await taskRepository.findById(id);
  }

  async rescheduleTask(id: string, newDate: string, newTime?: string): Promise<Task | null> {
    const updated = await taskRepository.update(id, {
      date: newDate,
      startTime: newTime,
      status: 'pending',
      snoozeUntil: undefined,
    });
    if (updated && updated.startTime) {
      await notificationService.scheduleTaskReminder(updated);
    }
    return updated;
  }

  async getTodayTasks(): Promise<Task[]> {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return await taskRepository.findByDate(todayStr);
  }

  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentTimeStr = format(now, 'HH:mm');
    return await taskRepository.findOverdue(todayStr, currentTimeStr);
  }

  async getUpcomingTask(): Promise<Task | null> {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowTimestamp = now.getTime();

    const todayTasks = await taskRepository.findByDate(todayStr);
    const pendingTasks = todayTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    if (pendingTasks.length === 0) return null;

    // 1. Check for tasks currently IN PROGRESS (active right now)
    const activeTasks = pendingTasks.filter((t) => {
      if (t.snoozeUntil) {
        const sDate = new Date(t.snoozeUntil);
        if (isValid(sDate) && sDate.getTime() > nowTimestamp) return false;
      }
      if (!t.startTime) return false;
      const startMin = parseTimeToMinutes(t.startTime);
      if (startMin === null) return false;
      const endMin = t.endTime
        ? Math.max(parseTimeToMinutes(t.endTime) ?? (startMin + 60), startMin + 1)
        : startMin + 60;
      return startMin <= nowMin && nowMin < endMin;
    });

    if (activeTasks.length > 0) {
      activeTasks.sort((a, b) => {
        const aStart = parseTimeToMinutes(a.startTime || '') ?? 0;
        const bStart = parseTimeToMinutes(b.startTime || '') ?? 0;
        return aStart - bStart;
      });
      return activeTasks[0];
    }

    // 2. Check for upcoming timed tasks later today (including snoozed ones)
    const upcomingTimedTasks = pendingTasks.filter((t) => {
      if (t.snoozeUntil) {
        const sDate = new Date(t.snoozeUntil);
        if (isValid(sDate) && sDate.getTime() > nowTimestamp) return true;
      }
      if (!t.startTime) return false;
      const tMin = parseTimeToMinutes(t.startTime);
      return tMin !== null && tMin >= nowMin;
    });

    if (upcomingTimedTasks.length > 0) {
      upcomingTimedTasks.sort((a, b) => {
        const getEffectiveMin = (t: Task) => {
          if (t.snoozeUntil) {
            const sDate = new Date(t.snoozeUntil);
            if (isValid(sDate) && sDate.getTime() > nowTimestamp) {
              return sDate.getHours() * 60 + sDate.getMinutes();
            }
          }
          return parseTimeToMinutes(t.startTime || '') ?? 9999;
        };
        return getEffectiveMin(a) - getEffectiveMin(b);
      });
      return upcomingTimedTasks[0];
    }

    // 3. Fallback: untimed tasks for today sorted by priority
    const priorityWeights: Record<string, number> = { high: 1, medium: 2, low: 3 };
    const untimedTasks = pendingTasks.filter((t) => !t.startTime);
    if (untimedTasks.length > 0) {
      untimedTasks.sort((a, b) => (priorityWeights[a.priority] || 4) - (priorityWeights[b.priority] || 4));
      return untimedTasks[0];
    }

    // 4. Any remaining pending task
    return pendingTasks[0];
  }

  async getTasksByDate(date: string): Promise<Task[]> {
    return await taskRepository.findByDate(date);
  }

  detectConflicts(
    tasks: Task[],
    events: CalendarEvent[] = [],
    habits: HabitWithStreak[] = []
  ): { hasConflict: boolean; conflicts: { itemA: string; itemB: string; time: string }[] } {
    const conflicts: { itemA: string; itemB: string; time: string }[] = [];

    const scheduledItems: Array<{ title: string; start: string; end: string; startMin: number; endMin: number }> = [];

    // 1. Scheduled tasks
    for (const t of tasks) {
      if (t.startTime && t.status !== 'completed' && t.status !== 'cancelled') {
        const startMin = parseTimeToMinutes(t.startTime) ?? 0;
        const endMin = t.endTime ? Math.max(parseTimeToMinutes(t.endTime) ?? (startMin + 30), startMin + 1) : startMin + 30;
        scheduledItems.push({
          title: t.title,
          start: t.startTime,
          end: t.endTime || t.startTime,
          startMin,
          endMin,
        });
      }
    }

    // 2. Active calendar events for today
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    for (const ev of events) {
      if (ev.time && ev.date === todayStr && ev.status !== 'completed' && ev.status !== 'dismissed') {
        const startMin = parseTimeToMinutes(ev.time) ?? 0;
        const endMin = startMin + 45;
        scheduledItems.push({
          title: ev.title,
          start: ev.time,
          end: ev.time,
          startMin,
          endMin,
        });
      }
    }

    // 3. Habits with reminder times scheduled today
    for (const h of habits) {
      if (h.reminderTime && !h.completedToday && !h.archivedAt) {
        const startMin = parseTimeToMinutes(h.reminderTime) ?? 0;
        const endMin = startMin + 20;
        scheduledItems.push({
          title: h.name,
          start: h.reminderTime,
          end: h.reminderTime,
          startMin,
          endMin,
        });
      }
    }

    const formatConflictTime = (min: number) => {
      const h24 = Math.floor(min / 60);
      const m = min % 60;
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    };

    // Check pairwise overlap and deduplicate
    const seenPairs = new Set<string>();
    for (let i = 0; i < scheduledItems.length; i++) {
      for (let j = i + 1; j < scheduledItems.length; j++) {
        const a = scheduledItems[i];
        const b = scheduledItems[j];
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          const pairKey = [a.title, b.title].sort().join(':::');
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            const overlapStart = Math.max(a.startMin, b.startMin);
            const overlapEnd = Math.min(a.endMin, b.endMin);
            const timeLabel = `${formatConflictTime(overlapStart)} – ${formatConflictTime(overlapEnd)}`;
            conflicts.push({
              itemA: a.title,
              itemB: b.title,
              time: timeLabel,
            });
          }
        }
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }
}

export const taskService = new TaskService();
