import {
  Task,
  CreateTaskDTO,
  UpdateTaskDTO,
  SnoozeDurationOption,
  CalendarEvent,
  HabitWithStreak,
} from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { notificationService } from '../notifications/NotificationService';
import { format, parseISO, addDays, addMonths, isValid } from 'date-fns';
import { normalizeTimeTo24H, parseTimeToMinutes } from '../../utils/time';
import { toggleBulletInRawText, resetBulletsInRawText } from '../../utils/bulletNotes';

export class TaskService {
  async createTask(dto: CreateTaskDTO): Promise<Task> {
    // 1. Title Validation
    if (!dto.title || dto.title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }

    const normStart = normalizeTimeTo24H(dto.startTime);
    const normEnd = normalizeTimeTo24H(dto.endTime);
    const isOvernight =
      dto.isOvernight !== undefined
        ? Boolean(dto.isOvernight)
        : Boolean(dto.recurrenceRule?.isOvernight);

    // 2. Start/End Time Validation (Non-overnight tasks cannot end before start)
    if (normStart && normEnd && !isOvernight) {
      const startMin = parseTimeToMinutes(normStart);
      const endMin = parseTimeToMinutes(normEnd);
      if (startMin !== null && endMin !== null && endMin < startMin) {
        throw new Error('End time cannot be earlier than start time.');
      }
    }

    const now = new Date().toISOString();
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const seriesId =
      dto.recurrenceRule && dto.recurrenceRule.type !== 'none'
        ? dto.seriesId || `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        : dto.seriesId;

    const reminderMinutes =
      dto.reminderMinutes !== undefined ? dto.reminderMinutes : -1;

    const isLoudAlarm =
      dto.isLoudAlarm !== undefined
        ? Boolean(dto.isLoudAlarm)
        : Boolean(dto.recurrenceRule?.isLoudAlarm);

    const estimatedMinutes =
      dto.estimatedMinutes !== undefined
        ? dto.estimatedMinutes
        : dto.recurrenceRule?.estimatedMinutes !== undefined
        ? dto.recurrenceRule.estimatedMinutes
        : undefined;

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
      reminderMinutes,
      notes: dto.notes?.trim() || undefined,
      eisenhowerQuadrant:
        dto.eisenhowerQuadrant || dto.recurrenceRule?.eisenhowerQuadrant || undefined,
      accentColor: dto.accentColor || dto.recurrenceRule?.accentColor || undefined,
      isOvernight,
      isLoudAlarm,
      estimatedMinutes,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await taskRepository.create(newTask);

    // Schedule notification reminder if task has a valid scheduled date/time and reminder is enabled
    if (saved && saved.date && saved.startTime && saved.reminderMinutes !== -1) {
      try {
        await notificationService.scheduleTaskReminder(saved);
      } catch (err) {
        console.warn('Failed to schedule reminder on task creation:', err);
      }
    }

    return saved;
  }

  async updateTask(id: string, dto: UpdateTaskDTO): Promise<Task | null> {
    if (!id) return null;

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
      dto.isOvernight !== undefined
        ? Boolean(dto.isOvernight)
        : dto.recurrenceRule?.isOvernight !== undefined
        ? Boolean(dto.recurrenceRule.isOvernight)
        : existing.isOvernight !== undefined
        ? Boolean(existing.isOvernight)
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
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description ? dto.description.trim() : null }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes ? dto.notes.trim() : null } : {}),
      ...(dto.startTime !== undefined ? { startTime: normStart } : {}),
      ...(dto.endTime !== undefined ? { endTime: normEnd } : {}),
      ...(dto.eisenhowerQuadrant !== undefined ? { eisenhowerQuadrant: dto.eisenhowerQuadrant } : {}),
      ...(dto.accentColor !== undefined ? { accentColor: dto.accentColor } : {}),
      ...(dto.isOvernight !== undefined
        ? { isOvernight: dto.isOvernight }
        : dto.recurrenceRule?.isOvernight !== undefined
        ? { isOvernight: dto.recurrenceRule.isOvernight }
        : {}),
      ...(dto.isLoudAlarm !== undefined
        ? { isLoudAlarm: dto.isLoudAlarm }
        : dto.recurrenceRule?.isLoudAlarm !== undefined
        ? { isLoudAlarm: dto.recurrenceRule.isLoudAlarm }
        : {}),
      ...(dto.estimatedMinutes !== undefined
        ? { estimatedMinutes: dto.estimatedMinutes }
        : dto.recurrenceRule?.estimatedMinutes !== undefined
        ? { estimatedMinutes: dto.recurrenceRule.estimatedMinutes }
        : {}),
    };

    const updated = await taskRepository.update(id, updatePayload);
    if (!updated) return null;

    // Synchronize notification reminder state
    if (updated.status === 'completed' || updated.status === 'cancelled') {
      await notificationService.cancelTaskReminder(id);
    } else if (updated.date && updated.startTime && updated.reminderMinutes !== -1) {
      try {
        await notificationService.scheduleTaskReminder(updated);
      } catch (err) {
        console.warn('Failed to update task reminder:', err);
      }
    } else if (updated.reminderMinutes === -1 || !updated.date || !updated.startTime) {
      await notificationService.cancelTaskReminder(id);
    }

    return updated;
  }

  async deleteTask(id: string, deleteEntireSeries = false): Promise<boolean> {
    if (!id) return false;

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

  async clearCompletedTasks(): Promise<number> {
    return await taskRepository.clearCompleted();
  }

  async skipRecurringTask(id: string): Promise<Task | null> {
    if (!id) return null;

    const task = await taskRepository.findById(id);
    if (!task) return null;

    // Prevent duplicate spawning if task is already cancelled
    if (task.status === 'cancelled') {
      return task;
    }

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
    if (!id) return null;

    const existing = await taskRepository.findById(id);
    if (!existing) return null;

    // Prevent duplicate spawning if task is already completed (e.g. rapid double-tap)
    if (existing.status === 'completed') {
      return existing;
    }

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
          return addDays(d, rule.interval && rule.interval > 0 ? rule.interval : 1);
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
          return addDays(d, (rule.interval && rule.interval > 0 ? rule.interval : 1) * 7);
        }
        case 'monthly': {
          const originalDay = rule.monthDay || baseDate.getDate();
          const targetMonthDate = addMonths(d, rule.interval && rule.interval > 0 ? rule.interval : 1);
          const maxDays = new Date(
            targetMonthDate.getFullYear(),
            targetMonthDate.getMonth() + 1,
            0
          ).getDate();
          targetMonthDate.setDate(Math.min(originalDay, maxDays));
          return targetMonthDate;
        }
        case 'yearly': {
          const originalDay = rule.monthDay || baseDate.getDate();
          const intervalYears = rule.interval && rule.interval > 0 ? rule.interval : 1;
          const targetYearDate = addMonths(d, intervalYears * 12);
          const maxDays = new Date(
            targetYearDate.getFullYear(),
            targetYearDate.getMonth() + 1,
            0
          ).getDate();
          targetYearDate.setDate(Math.min(originalDay, maxDays));
          return targetYearDate;
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

    const seriesId =
      task.seriesId || `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Reset subtask checklist items from [x] back to [ ] so recurring task starts clean
    const cleanNotes = resetBulletsInRawText(task.notes);
    const cleanDescription = resetBulletsInRawText(task.description);

    const reminderMinutes =
      task.reminderMinutes !== undefined ? task.reminderMinutes : -1;

    const isLoudAlarm =
      task.isLoudAlarm !== undefined
        ? Boolean(task.isLoudAlarm)
        : Boolean(task.recurrenceRule?.isLoudAlarm);

    const isOvernight =
      task.isOvernight !== undefined
        ? Boolean(task.isOvernight)
        : Boolean(task.recurrenceRule?.isOvernight);

    return await this.createTask({
      seriesId,
      title: task.title,
      description: cleanDescription || undefined,
      date: nextDateStr,
      startTime: task.startTime,
      endTime: task.endTime,
      priority: task.priority,
      categoryId: task.categoryId,
      recurrenceRule: task.recurrenceRule,
      reminderMinutes,
      notes: cleanNotes || undefined,
      eisenhowerQuadrant:
        task.eisenhowerQuadrant || task.recurrenceRule?.eisenhowerQuadrant || undefined,
      accentColor: task.accentColor || task.recurrenceRule?.accentColor || undefined,
      isOvernight,
      isLoudAlarm,
      estimatedMinutes: task.estimatedMinutes,
    });
  }

  private lastRecurrenceCheck = 0;

  /**
   * Pre-generates recurring task occurrences up to `daysAhead` days in the future.
   * Ensures that upcoming tasks are visible on TasksScreen and TodayScreen timelines without flooding AlarmManager.
   * Throttled to run at most once every 5 minutes unless force=true.
   */
  async ensureUpcomingRecurrences(daysAhead: number = 3, force = false): Promise<number> {
    const nowTimestamp = Date.now();
    if (!force && nowTimestamp - this.lastRecurrenceCheck < 5 * 60 * 1000) {
      return 0;
    }
    this.lastRecurrenceCheck = nowTimestamp;

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
   * Toggles the completion state of a subtask/bullet item inside a task's notes or description.
   * Prioritizes whichever field actually contains checkbox syntax to prevent swallowing edits.
   */
  async toggleSubtask(taskId: string, subtaskIndex: number): Promise<Task | null> {
    const task = await taskRepository.findById(taskId);
    if (!task) return null;

    const hasNotesChecklist = Boolean(task.notes && /\[([ xX])\]/.test(task.notes));
    const hasDescChecklist = Boolean(task.description && /\[([ xX])\]/.test(task.description));

    if (hasNotesChecklist) {
      const updatedNotes = toggleBulletInRawText(task.notes!, subtaskIndex);
      return await this.updateTask(taskId, { notes: updatedNotes });
    } else if (hasDescChecklist) {
      const updatedDesc = toggleBulletInRawText(task.description!, subtaskIndex);
      return await this.updateTask(taskId, { description: updatedDesc });
    } else if (task.notes && task.notes.trim().length > 0) {
      const updatedNotes = toggleBulletInRawText(task.notes, subtaskIndex);
      return await this.updateTask(taskId, { notes: updatedNotes });
    } else if (task.description && task.description.trim().length > 0) {
      const updatedDesc = toggleBulletInRawText(task.description, subtaskIndex);
      return await this.updateTask(taskId, { description: updatedDesc });
    }

    return task;
  }

  async uncompleteTask(id: string): Promise<Task | null> {
    if (!id) return null;

    const original = await taskRepository.findById(id);
    if (!original) return null;

    const updated = await taskRepository.update(id, {
      status: 'pending',
      completedAt: null as any,
    });

    // If this was a recurring task that auto-spawned a future occurrence upon completion,
    // clean up any pending future instance in the same series to prevent ghost duplications.
    if (original.seriesId && original.recurrenceRule && original.recurrenceRule.type !== 'none') {
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

    if (updated && updated.date && updated.startTime && updated.reminderMinutes !== -1) {
      try {
        await notificationService.scheduleTaskReminder(updated);
      } catch (err) {
        console.warn('Failed to reschedule reminder on uncomplete:', err);
      }
    }
    return updated;
  }

  async snoozeTask(id: string, minutes: SnoozeDurationOption = 10): Promise<Task | null> {
    if (!id) return null;
    await notificationService.snoozeTaskReminder(id, minutes);
    return await taskRepository.findById(id);
  }

  async rescheduleTask(id: string, newDate: string, newTime?: string): Promise<Task | null> {
    if (!id) return null;

    const existing = await taskRepository.findById(id);
    if (!existing) return null;

    const normTime = newTime !== undefined ? normalizeTimeTo24H(newTime) : existing.startTime;
    const isOvernight = Boolean(existing.isOvernight || existing.recurrenceRule?.isOvernight);

    // Validate that end time does not precede new start time unless overnight
    let adjustedEndTime = existing.endTime;
    if (normTime && existing.endTime && !isOvernight) {
      const startMin = parseTimeToMinutes(normTime);
      const endMin = parseTimeToMinutes(existing.endTime);
      if (startMin !== null && endMin !== null && endMin < startMin) {
        adjustedEndTime = undefined;
      }
    }

    const updated = await taskRepository.update(id, {
      date: newDate,
      startTime: normTime,
      endTime: adjustedEndTime,
      status: 'pending',
      snoozeUntil: null as any,
    });

    if (updated && updated.date && updated.startTime && updated.reminderMinutes !== -1) {
      try {
        await notificationService.scheduleTaskReminder(updated);
      } catch (err) {
        console.warn('Failed to reschedule reminder:', err);
      }
    } else {
      await notificationService.cancelTaskReminder(id);
    }

    return updated;
  }

  async getTaskById(id: string): Promise<Task | null> {
    if (!id) return null;
    return await taskRepository.findById(id);
  }

  async getAllTasks(): Promise<Task[]> {
    return await taskRepository.findAll();
  }

  async getTodayTasks(): Promise<Task[]> {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return await taskRepository.findByDate(todayStr);
  }

  async getBacklogTasks(): Promise<Task[]> {
    return await taskRepository.findByDate('');
  }

  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentTimeStr = format(now, 'HH:mm');
    return await taskRepository.findOverdue(todayStr, currentTimeStr);
  }

  async getTasksByDate(date: string): Promise<Task[]> {
    if (date === undefined || date === null) return [];
    return await taskRepository.findByDate(date);
  }

  async getTasksByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    if (!startDate || !endDate) return [];
    return await taskRepository.findByDateRange(startDate, endDate);
  }

  async getTasksByCategory(categoryId: string): Promise<Task[]> {
    if (!categoryId) return [];
    const all = await taskRepository.findAll();
    return all.filter((t) => t.categoryId === categoryId);
  }

  async getTasksBySeriesId(seriesId: string): Promise<Task[]> {
    if (!seriesId) return [];
    return await taskRepository.findBySeriesId(seriesId);
  }

  async searchTasks(query: string): Promise<Task[]> {
    if (!query || query.trim().length === 0) {
      return await taskRepository.findAll();
    }
    return await taskRepository.search(query.trim());
  }

  async getUpcomingTask(): Promise<Task | null> {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowTimestamp = now.getTime();

    // 1. Check yesterday's active overnight tasks spanning into the early morning
    if (nowMin < 720) {
      const yesterdayStr = format(addDays(now, -1), 'yyyy-MM-dd');
      const yesterdayTasks = await taskRepository.findByDate(yesterdayStr);
      const activeOvernightFromYesterday = yesterdayTasks.find((t) => {
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        const isOvernight = Boolean(t.isOvernight || t.recurrenceRule?.isOvernight);
        if (!isOvernight || !t.startTime || !t.endTime) return false;
        const startMin = parseTimeToMinutes(t.startTime);
        const endMin = parseTimeToMinutes(t.endTime);
        if (startMin === null || endMin === null) return false;
        return endMin < startMin && nowMin < endMin;
      });

      if (activeOvernightFromYesterday) {
        return activeOvernightFromYesterday;
      }
    }

    const todayTasks = await taskRepository.findByDate(todayStr);
    const pendingTasks = todayTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );
    if (pendingTasks.length === 0) return null;

    // 2. Check for tasks currently IN PROGRESS (active right now today)
    const activeTasks = pendingTasks.filter((t) => {
      if (t.snoozeUntil) {
        const sDate = new Date(t.snoozeUntil);
        if (isValid(sDate) && sDate.getTime() > nowTimestamp) return false;
      }
      if (!t.startTime) return false;
      const startMin = parseTimeToMinutes(t.startTime);
      if (startMin === null) return false;

      const isOvernight = Boolean(t.isOvernight || t.recurrenceRule?.isOvernight);
      const parsedEnd = t.endTime ? parseTimeToMinutes(t.endTime) : null;
      let endMin: number;
      if (parsedEnd !== null) {
        if (isOvernight && parsedEnd < startMin) {
          endMin = parsedEnd + 1440;
        } else {
          endMin = Math.max(parsedEnd, startMin + 1);
        }
      } else {
        endMin = startMin + 60;
      }
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

    // 3. Check for upcoming timed tasks later today (including snoozed ones)
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

    // 4. Check for overdue timed tasks earlier today that are still pending
    const overdueTimedTasks = pendingTasks.filter((t) => {
      if (!t.startTime) return false;
      const tMin = parseTimeToMinutes(t.startTime);
      return tMin !== null && tMin < nowMin;
    });
    if (overdueTimedTasks.length > 0) {
      overdueTimedTasks.sort((a, b) => {
        const aMin = parseTimeToMinutes(a.startTime || '') ?? 0;
        const bMin = parseTimeToMinutes(b.startTime || '') ?? 0;
        return aMin - bMin;
      });
      return overdueTimedTasks[0];
    }

    // 5. Fallback: untimed tasks for today sorted by priority
    const priorityWeights: Record<string, number> = { high: 1, medium: 2, low: 3 };
    const untimedTasks = pendingTasks.filter((t) => !t.startTime);
    if (untimedTasks.length > 0) {
      untimedTasks.sort(
        (a, b) => (priorityWeights[a.priority] || 4) - (priorityWeights[b.priority] || 4)
      );
      return untimedTasks[0];
    }

    // 6. Any remaining pending task
    return pendingTasks[0];
  }

  detectConflicts(
    tasks: Task[] = [],
    events: CalendarEvent[] = [],
    habits: HabitWithStreak[] = [],
    targetDate?: string
  ): { hasConflict: boolean; conflicts: { itemA: string; itemB: string; time: string }[] } {
    const conflicts: { itemA: string; itemB: string; time: string }[] = [];

    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const safeEvents = Array.isArray(events) ? events : [];
    const safeHabits = Array.isArray(habits) ? habits : [];

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const effectiveDate = targetDate || safeTasks.find((t) => Boolean(t.date))?.date || todayStr;
    const targetDateObj = parseISO(effectiveDate);
    const targetDayOfWeek = isValid(targetDateObj) ? targetDateObj.getDay() : new Date().getDay();

    const scheduledItems: Array<{
      title: string;
      start: string;
      end: string;
      startMin: number;
      endMin: number;
    }> = [];

    // 1. Scheduled tasks on target date
    for (const t of safeTasks) {
      if (t.startTime && t.status !== 'completed' && t.status !== 'cancelled') {
        if (t.date && t.date !== effectiveDate) continue;

        const startMin = parseTimeToMinutes(t.startTime) ?? 0;
        const isOvernight = Boolean(t.isOvernight || t.recurrenceRule?.isOvernight);
        let endMin: number;

        if (t.endTime) {
          const parsedEnd = parseTimeToMinutes(t.endTime);
          if (parsedEnd !== null) {
            if (isOvernight && parsedEnd < startMin) {
              endMin = parsedEnd + 1440;
            } else {
              endMin = Math.max(parsedEnd, startMin + 1);
            }
          } else {
            endMin = startMin + 30;
          }
        } else {
          endMin = startMin + 30;
        }

        scheduledItems.push({
          title: t.title,
          start: t.startTime,
          end: t.endTime || t.startTime,
          startMin,
          endMin,
        });
      }
    }

    // 2. Active calendar events for target date
    for (const ev of safeEvents) {
      if (ev.time && ev.status !== 'completed' && ev.status !== 'dismissed') {
        if (ev.date && ev.date !== effectiveDate) continue;

        const startMin = parseTimeToMinutes(ev.time) ?? 0;
        const endMin = startMin + 45;
        scheduledItems.push({
          title: `📅 ${ev.title}`,
          start: ev.time,
          end: ev.time,
          startMin,
          endMin,
        });
      }
    }

    // 3. Habits with reminder times scheduled on this day of week
    for (const h of safeHabits) {
      if (h.reminderTime && !h.archivedAt) {
        const days =
          h.recurrenceRule?.daysOfWeek && h.recurrenceRule.daysOfWeek.length > 0
            ? h.recurrenceRule.daysOfWeek
            : [0, 1, 2, 3, 4, 5, 6];
        if (!days.includes(targetDayOfWeek)) continue;

        const isCompleted =
          effectiveDate === todayStr
            ? Boolean(h.completedToday)
            : Boolean(h.weeklyLogs?.[effectiveDate]);
        if (isCompleted) continue;

        const startMin = parseTimeToMinutes(h.reminderTime) ?? 0;
        const endMin = startMin + 20;
        scheduledItems.push({
          title: `🌱 ${h.name}`,
          start: h.reminderTime,
          end: h.reminderTime,
          startMin,
          endMin,
        });
      }
    }

    const formatConflictTime = (min: number) => {
      const normalizedMin = min % 1440;
      const h24 = Math.floor(normalizedMin / 60);
      const m = normalizedMin % 60;
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      const nextDaySuffix = min >= 1440 ? ' (+1d)' : '';
      return `${h12}:${String(m).padStart(2, '0')} ${period}${nextDaySuffix}`;
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
            const timeLabel = `${formatConflictTime(overlapStart)} – ${formatConflictTime(
              overlapEnd
            )}`;
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
