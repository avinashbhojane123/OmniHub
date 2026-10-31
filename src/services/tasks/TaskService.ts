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
import { format, parseISO, addDays, isValid } from 'date-fns';
import { normalizeTimeTo24H, parseTimeToMinutes, isTimeValid } from '../../utils/time';
import { toggleBulletInRawText, resetBulletsInRawText } from '../../utils/bulletNotes';

/**
 * Sanitizes and normalizes an input date string to YYYY-MM-DD.
 * Handles dates containing ISO timestamp suffixes, slashes, unpadded components, or timezone offsets.
 * Returns empty string if the date is invalid or empty.
 */
function sanitizeDateString(dateStr?: string | null): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  // 1. Match date components directly (YYYY-MM-DD, YYYY/MM/DD, YYYY-M-D)
  const dateOnlyMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (dateOnlyMatch) {
    const y = dateOnlyMatch[1];
    const m = dateOnlyMatch[2].padStart(2, '0');
    const d = dateOnlyMatch[3].padStart(2, '0');
    const candidate = `${y}-${m}-${d}`;
    if (isValid(parseISO(candidate))) {
      return candidate;
    }
    return '';
  }

  // 2. Full ISO timestamp or Date string with timezone: convert to local calendar date
  const parsed = parseISO(trimmed);
  if (isValid(parsed)) {
    return format(parsed, 'yyyy-MM-dd');
  }

  // 3. Fallback: split by 'T' or whitespace and normalize components
  const splitPart = trimmed.split(/[T\s]+/)[0].trim();
  const splitMatch = splitPart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (splitMatch) {
    const candidate = `${splitMatch[1]}-${splitMatch[2].padStart(2, '0')}-${splitMatch[3].padStart(2, '0')}`;
    if (isValid(parseISO(candidate))) {
      return candidate;
    }
  }
  return '';
}

/**
 * Checks if a task should have a scheduled notification reminder.
 * True for tasks with a date, non-disabled reminder, and either a start time
 * or an untimed all-day reminder (> 0 minutes).
 */
function shouldScheduleReminder(task?: Task | null): boolean {
  if (!task || !task.date || task.reminderMinutes === -1) return false;
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  return Boolean(task.startTime) || (task.reminderMinutes !== undefined && task.reminderMinutes > 0);
}

export class TaskService {
  async createTask(dto: CreateTaskDTO): Promise<Task> {
    // 1. Title Validation
    if (!dto.title || dto.title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }

    // 2. Validate time format if explicitly provided as non-empty
    if (dto.startTime !== undefined && dto.startTime !== null) {
      const str = String(dto.startTime).trim();
      if (str.length > 0 && !isTimeValid(str)) {
        throw new Error('Invalid start time format.');
      }
    }
    if (dto.endTime !== undefined && dto.endTime !== null) {
      const str = String(dto.endTime).trim();
      if (str.length > 0 && !isTimeValid(str)) {
        throw new Error('Invalid end time format.');
      }
    }

    // 3. Validate date format if explicitly provided as non-empty
    let cleanDate = '';
    if (dto.date !== undefined && dto.date !== null) {
      const dateStr = String(dto.date).trim();
      if (dateStr.length > 0) {
        cleanDate = sanitizeDateString(dateStr);
        if (!cleanDate) {
          throw new Error('Invalid date format.');
        }
      }
    }

    // 4. Validate estimatedMinutes if provided
    if (dto.estimatedMinutes !== undefined && dto.estimatedMinutes !== null) {
      const est = Number(dto.estimatedMinutes);
      if (isNaN(est) || est <= 0) {
        throw new Error('Estimated minutes must be a positive number.');
      }
    }

    // 5. Validate reminderMinutes if provided
    if (dto.reminderMinutes !== undefined && dto.reminderMinutes !== null) {
      const rem = Number(dto.reminderMinutes);
      if (isNaN(rem) || rem < -1) {
        throw new Error('Invalid reminder minutes.');
      }
    }

    const normStart = normalizeTimeTo24H(dto.startTime);
    const normEnd = normalizeTimeTo24H(dto.endTime);
    const isOvernight =
      dto.isOvernight !== undefined
        ? Boolean(dto.isOvernight)
        : Boolean(dto.recurrenceRule?.isOvernight);

    // 6. Start/End Time Validation (Non-overnight tasks cannot end before start)
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

    // Anchor monthDay safely if monthly or yearly recurrence
    const anchoredMonthDay =
      cleanDate && cleanDate.includes('-')
        ? parseInt(cleanDate.split('-')[2], 10) || (isValid(parseISO(cleanDate)) ? parseISO(cleanDate).getDate() : new Date().getDate())
        : new Date().getDate();

    const recurrenceRule = dto.recurrenceRule
      ? {
          ...dto.recurrenceRule,
          ...((dto.recurrenceRule.type === 'monthly' || dto.recurrenceRule.type === 'yearly') &&
          !dto.recurrenceRule.monthDay &&
          cleanDate
            ? { monthDay: anchoredMonthDay }
            : {}),
        }
      : undefined;

    const newTask: Task = {
      id,
      seriesId,
      title: dto.title.trim(),
      description: dto.description?.trim() || undefined,
      date: cleanDate,
      startTime: normStart || undefined,
      endTime: normEnd || undefined,
      priority: dto.priority || 'medium',
      categoryId: dto.categoryId?.trim() || undefined,
      status: 'pending',
      recurrenceRule,
      reminderMinutes,
      notes: dto.notes?.trim() || undefined,
      eisenhowerQuadrant:
        dto.eisenhowerQuadrant || recurrenceRule?.eisenhowerQuadrant || undefined,
      accentColor: dto.accentColor || recurrenceRule?.accentColor || undefined,
      isOvernight,
      isLoudAlarm,
      estimatedMinutes,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await taskRepository.create(newTask);

    // Schedule notification reminder if task has a valid scheduled date/time and reminder is enabled
    if (saved && shouldScheduleReminder(saved)) {
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

    // Validate time format if explicitly provided as non-empty
    if (dto.startTime !== undefined && dto.startTime !== null) {
      const str = String(dto.startTime).trim();
      if (str.length > 0 && !isTimeValid(str)) {
        throw new Error('Invalid start time format.');
      }
    }
    if (dto.endTime !== undefined && dto.endTime !== null) {
      const str = String(dto.endTime).trim();
      if (str.length > 0 && !isTimeValid(str)) {
        throw new Error('Invalid end time format.');
      }
    }

    // Validate estimatedMinutes if provided
    if (dto.estimatedMinutes !== undefined && dto.estimatedMinutes !== null) {
      const est = Number(dto.estimatedMinutes);
      if (isNaN(est) || est <= 0) {
        throw new Error('Estimated minutes must be a positive number.');
      }
    }

    // Validate reminderMinutes if provided
    if (dto.reminderMinutes !== undefined && dto.reminderMinutes !== null) {
      const rem = Number(dto.reminderMinutes);
      if (isNaN(rem) || rem < -1) {
        throw new Error('Invalid reminder minutes.');
      }
    }

    const existing = await taskRepository.findById(id);
    if (!existing) return null;

    // Validate date format if explicitly provided as non-empty
    let cleanDate = existing.date;
    if (dto.date !== undefined && dto.date !== null) {
      const dateStr = String(dto.date).trim();
      if (dateStr.length > 0) {
        cleanDate = sanitizeDateString(dateStr);
        if (!cleanDate) {
          throw new Error('Invalid date format.');
        }
      } else {
        cleanDate = '';
      }
    } else if (dto.date === null) {
      cleanDate = '';
    }

    const rawStart = dto.startTime !== undefined ? dto.startTime : existing.startTime;
    const rawEnd = dto.endTime !== undefined ? dto.endTime : existing.endTime;
    const normStart = normalizeTimeTo24H(rawStart);
    let normEnd: string | null | undefined = normalizeTimeTo24H(rawEnd);

    // If startTime is explicitly cleared to null/empty and endTime was not explicitly supplied, clear endTime
    if (dto.startTime !== undefined && !normStart && dto.endTime === undefined) {
      normEnd = null;
    }

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

    const anchoredMonthDay =
      cleanDate && cleanDate.includes('-')
        ? parseInt(cleanDate.split('-')[2], 10) || (isValid(parseISO(cleanDate)) ? parseISO(cleanDate).getDate() : new Date().getDate())
        : new Date().getDate();

    // Anchor monthDay if recurrence rule is updated to monthly/yearly without monthDay
    const updatedRecurrenceRule = dto.recurrenceRule
      ? {
          ...dto.recurrenceRule,
          ...((dto.recurrenceRule.type === 'monthly' || dto.recurrenceRule.type === 'yearly') &&
          !dto.recurrenceRule.monthDay &&
          cleanDate
            ? { monthDay: anchoredMonthDay }
            : {}),
        }
      : dto.recurrenceRule;

    // Auto-generate seriesId if task is made recurring without an existing seriesId
    let seriesId = dto.seriesId !== undefined ? dto.seriesId : existing.seriesId;
    if (
      updatedRecurrenceRule &&
      updatedRecurrenceRule.type !== 'none' &&
      !seriesId
    ) {
      seriesId = `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    const updatePayload: UpdateTaskDTO = {
      ...dto,
      seriesId,
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.date !== undefined ? { date: cleanDate } : {}),
      ...(dto.recurrenceRule !== undefined ? { recurrenceRule: updatedRecurrenceRule } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description ? dto.description.trim() : null }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes ? dto.notes.trim() : null } : {}),
      ...(dto.startTime !== undefined ? { startTime: normStart || null } : {}),
      ...(dto.endTime !== undefined || (dto.startTime !== undefined && !normStart)
        ? { endTime: normEnd || null }
        : {}),
      ...(dto.categoryId !== undefined
        ? { categoryId: dto.categoryId ? dto.categoryId.trim() || null : null }
        : {}),
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
    } else if (shouldScheduleReminder(updated)) {
      try {
        await notificationService.scheduleTaskReminder(updated);
      } catch (err) {
        console.warn('Failed to update task reminder:', err);
      }
    } else {
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

    // Prevent duplicate spawning if task is already cancelled or completed
    if (task.status === 'cancelled' || task.status === 'completed') {
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

  private advanceStep(d: Date, rule: NonNullable<Task['recurrenceRule']>, baseDate: Date): Date {
    switch (rule.type) {
      case 'daily':
        return addDays(d, rule.interval && rule.interval > 0 ? rule.interval : 1);
      case 'weekdays': {
        const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;
        let temp = d;
        for (let i = 0; i < interval; i++) {
          temp = addDays(temp, 1);
          while (temp.getDay() === 0 || temp.getDay() === 6) {
            temp = addDays(temp, 1);
          }
        }
        return temp;
      }
      case 'weekends': {
        const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;
        let temp = d;
        for (let i = 0; i < interval; i++) {
          temp = addDays(temp, 1);
          while (temp.getDay() !== 0 && temp.getDay() !== 6) {
            temp = addDays(temp, 1);
          }
        }
        return temp;
      }
      case 'weekly':
      case 'custom': {
        if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
          // Map to ISO day index (1 = Monday, 2 = Tuesday, ..., 7 = Sunday)
          const toIsoDay = (day: number) => (day === 0 ? 7 : day);
          const sortedDays = [...rule.daysOfWeek].map(toIsoDay).sort((a, b) => a - b);
          const currentIsoDay = toIsoDay(d.getDay());
          const nextDayThisWeek = sortedDays.find((day) => day > currentIsoDay);
          if (nextDayThisWeek !== undefined) {
            return addDays(d, nextDayThisWeek - currentIsoDay);
          }
          const firstDayNextWeek = sortedDays[0];
          const intervalWeeks = rule.interval && rule.interval > 1 ? rule.interval : 1;
          const daysToNextWeekStart = 8 - currentIsoDay;
          const daysToAdd = daysToNextWeekStart + (intervalWeeks - 1) * 7 + (firstDayNextWeek - 1);
          return addDays(d, daysToAdd);
        }
        return addDays(d, (rule.interval && rule.interval > 0 ? rule.interval : 1) * 7);
      }
      case 'monthly': {
        const originalDay = rule.monthDay || baseDate.getDate();
        const intervalMonths = rule.interval && rule.interval > 0 ? rule.interval : 1;
        const currentYear = d.getFullYear();
        const currentMonth = d.getMonth();
        const targetTotalMonth = currentMonth + intervalMonths;
        const targetYear = currentYear + Math.floor(targetTotalMonth / 12);
        const targetMonth = ((targetTotalMonth % 12) + 12) % 12;
        const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const safeDay = Math.min(originalDay, maxDaysInTargetMonth);
        // Midday (12:00) prevents DST midnight shift anomalies
        return new Date(targetYear, targetMonth, safeDay, 12, 0);
      }
      case 'yearly': {
        const originalDay = rule.monthDay || baseDate.getDate();
        const intervalYears = rule.interval && rule.interval > 0 ? rule.interval : 1;
        const targetYear = d.getFullYear() + intervalYears;
        const targetMonth = d.getMonth();
        const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const safeDay = Math.min(originalDay, maxDaysInTargetMonth);
        // Midday (12:00) prevents DST midnight shift anomalies
        return new Date(targetYear, targetMonth, safeDay, 12, 0);
      }
      default:
        return addDays(d, 1);
    }
  }

  private async spawnNextRecurrence(task: Task): Promise<Task | null> {
    const rule = task.recurrenceRule;
    if (!rule || rule.type === 'none') return null;

    const baseDate = parseISO(task.date);
    if (!isValid(baseDate)) return null;

    let nextDate = this.advanceStep(baseDate, rule, baseDate);
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // If base date was overdue in the past, advance nextDate forward until today or future
    let advanceLimit = 0;
    while (format(nextDate, 'yyyy-MM-dd') < todayStr && advanceLimit < 1000) {
      if (rule.endDate && format(nextDate, 'yyyy-MM-dd') > rule.endDate) {
        return null;
      }
      nextDate = this.advanceStep(nextDate, rule, baseDate);
      advanceLimit++;
    }

    const nextDateStr = format(nextDate, 'yyyy-MM-dd');
    if (rule.endDate && nextDateStr > rule.endDate) {
      return null;
    }

    // Ensure seriesId is persisted back to parent task if it was previously undefined
    let seriesId = task.seriesId;
    if (!seriesId) {
      seriesId = `series_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      try {
        await taskRepository.update(task.id, { seriesId });
      } catch (err) {
        console.warn('Failed to persist auto-generated seriesId to parent task:', err);
      }
    }

    // Prevent duplicate spawning: Match strictly by seriesId if present, else fallback to title
    const existingOnDate = await taskRepository.findByDate(nextDateStr);
    const alreadyExists = existingOnDate.some((t) => {
      if (seriesId) {
        return t.seriesId === seriesId;
      }
      return t.title.toLowerCase().trim() === task.title.toLowerCase().trim();
    });

    if (alreadyExists) {
      return null;
    }

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

    // Preserve monthDay anchor across future occurrences
    const preservedRule = {
      ...rule,
      ...(rule.type === 'monthly' || rule.type === 'yearly'
        ? { monthDay: rule.monthDay || baseDate.getDate() }
        : {}),
    };

    return await this.createTask({
      seriesId,
      title: task.title,
      description: cleanDescription || undefined,
      date: nextDateStr,
      startTime: task.startTime,
      endTime: task.endTime,
      priority: task.priority,
      categoryId: task.categoryId,
      recurrenceRule: preservedRule,
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
        (t) => t.recurrenceRule && t.recurrenceRule.type !== 'none'
      );
      if (recurringTasks.length === 0) return 0;

      const horizonDays = typeof daysAhead === 'number' && daysAhead > 0 ? daysAhead : 3;
      const today = new Date();
      const horizonDateStr = format(addDays(today, horizonDays), 'yyyy-MM-dd');
      let spawnedCount = 0;

      // Group by seriesId (or task.id if no seriesId)
      const seriesMap = new Map<string, Task[]>();
      for (const t of recurringTasks) {
        const key = t.seriesId || t.id;
        if (!seriesMap.has(key)) seriesMap.set(key, []);
        seriesMap.get(key)!.push(t);
      }

      const maxIterationsPerSeries = Math.min(Math.max(horizonDays * 2, 20), 100);

      for (const [, instances] of seriesMap.entries()) {
        instances.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const latest = instances[instances.length - 1];
        if (!latest || !latest.recurrenceRule || latest.recurrenceRule.type === 'none') continue;

        let currentCursor = latest;
        let safetyCounter = 0;

        while ((currentCursor.date || '') < horizonDateStr && safetyCounter < maxIterationsPerSeries) {
          safetyCounter++;
          const spawned = await this.spawnNextRecurrence(currentCursor);
          if (spawned) {
            spawnedCount++;
            currentCursor = spawned;
          } else {
            // If already exists on the next date step, advance cursor across that existing task
            const baseDate = parseISO(currentCursor.date);
            if (!isValid(baseDate)) break;
            const nextDate = this.advanceStep(baseDate, currentCursor.recurrenceRule!, baseDate);
            const nextDateStr = format(nextDate, 'yyyy-MM-dd');
            if (nextDateStr <= currentCursor.date) break;

            const existingTasksOnDate = await taskRepository.findByDate(nextDateStr);
            const existingInstance = existingTasksOnDate.find((t) =>
              currentCursor.seriesId
                ? t.seriesId === currentCursor.seriesId
                : t.title.toLowerCase().trim() === currentCursor.title.toLowerCase().trim()
            );

            if (existingInstance && (existingInstance.date || '') > (currentCursor.date || '')) {
              currentCursor = existingInstance;
            } else {
              break;
            }
          }
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
    if (!taskId || subtaskIndex < 0) return null;

    const task = await taskRepository.findById(taskId);
    if (!task) return null;

    const hasNotesChecklist = Boolean(task.notes && /\[([ xX])\]/.test(task.notes));
    const hasDescChecklist = Boolean(task.description && /\[([ xX])\]/.test(task.description));

    if (hasNotesChecklist) {
      const updatedNotes = toggleBulletInRawText(task.notes!, subtaskIndex);
      if (updatedNotes === task.notes) return task;
      return await this.updateTask(taskId, { notes: updatedNotes });
    } else if (hasDescChecklist) {
      const updatedDesc = toggleBulletInRawText(task.description!, subtaskIndex);
      if (updatedDesc === task.description) return task;
      return await this.updateTask(taskId, { description: updatedDesc });
    } else if (task.notes && task.notes.trim().length > 0) {
      const updatedNotes = toggleBulletInRawText(task.notes, subtaskIndex);
      if (updatedNotes === task.notes) return task;
      return await this.updateTask(taskId, { notes: updatedNotes });
    } else if (task.description && task.description.trim().length > 0) {
      const updatedDesc = toggleBulletInRawText(task.description, subtaskIndex);
      if (updatedDesc === task.description) return task;
      return await this.updateTask(taskId, { description: updatedDesc });
    }

    return task;
  }

  async uncompleteTask(id: string): Promise<Task | null> {
    if (!id) return null;

    const original = await taskRepository.findById(id);
    if (!original) return null;

    // Idempotent: If task is not completed, no state change or series deletion needed
    if (original.status !== 'completed') {
      return original;
    }

    const updated = await taskRepository.update(id, {
      status: 'pending',
      completedAt: null as any,
    });

    // If this was a recurring task that auto-spawned a future occurrence upon completion,
    // clean up any pending future instance in the same series to prevent ghost duplications.
    if (original.recurrenceRule && original.recurrenceRule.type !== 'none') {
      try {
        let seriesTasks: Task[] = [];
        if (original.seriesId) {
          seriesTasks = await taskRepository.findBySeriesId(original.seriesId);
        } else {
          const allTasks = await taskRepository.findAll();
          seriesTasks = allTasks.filter(
            (t) => t.title.toLowerCase().trim() === original.title.toLowerCase().trim()
          );
        }
        const futureSpawned = seriesTasks.filter(
          (t) => t.id !== id && t.status === 'pending' && Boolean(t.date && original.date && t.date > original.date)
        );
        for (const ft of futureSpawned) {
          await notificationService.cancelTaskReminder(ft.id);
          await taskRepository.delete(ft.id);
        }
      } catch (err) {
        console.warn('Failed to clean up future recurrence on uncomplete:', err);
      }
    }

    if (updated && shouldScheduleReminder(updated)) {
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
    const existing = await taskRepository.findById(id);
    if (!existing) return null;

    const safeMinutes = typeof minutes === 'number' && minutes > 0 ? minutes : 10;
    try {
      await notificationService.snoozeTaskReminder(id, safeMinutes);
    } catch (err) {
      console.warn('Failed to snooze task reminder in notification service:', err);
      const snoozeTarget = new Date(Date.now() + safeMinutes * 60 * 1000).toISOString();
      await taskRepository.update(id, { snoozeUntil: snoozeTarget });
    }
    return await taskRepository.findById(id);
  }

  async rescheduleTask(id: string, newDate: string, newTime?: string): Promise<Task | null> {
    if (!id) return null;

    const existing = await taskRepository.findById(id);
    if (!existing) return null;

    if (newTime !== undefined && newTime !== null) {
      const str = String(newTime).trim();
      if (str.length > 0 && !isTimeValid(str)) {
        throw new Error('Invalid start time format.');
      }
    }

    let cleanDate = existing.date;
    if (newDate !== undefined && newDate !== null) {
      const str = String(newDate).trim();
      if (str.length > 0) {
        cleanDate = sanitizeDateString(str);
        if (!cleanDate) {
          throw new Error('Invalid date format.');
        }
      } else {
        cleanDate = '';
      }
    }

    const normTime =
      newTime !== undefined ? (normalizeTimeTo24H(newTime) || null) : existing.startTime;
    const isOvernight = Boolean(existing.isOvernight || existing.recurrenceRule?.isOvernight);

    // Validate that end time does not precede new start time unless overnight.
    // Also clear end time if start time is removed.
    let adjustedEndTime: string | null | undefined = existing.endTime;
    if (!normTime) {
      adjustedEndTime = null;
    } else if (existing.endTime && !isOvernight) {
      const startMin = parseTimeToMinutes(normTime);
      const endMin = parseTimeToMinutes(existing.endTime);
      if (startMin !== null && endMin !== null && endMin < startMin) {
        // Pass null so TaskRepository clears it in the database
        adjustedEndTime = null;
      }
    }

    const updated = await taskRepository.update(id, {
      date: cleanDate,
      startTime: normTime,
      endTime: adjustedEndTime,
      status: 'pending',
      completedAt: null as any,
      snoozeUntil: null as any,
    });

    if (updated && shouldScheduleReminder(updated)) {
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
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const todayTasks = await taskRepository.findByDate(todayStr);

    // Also include yesterday's active overnight tasks spanning into today
    const yesterdayStr = format(addDays(now, -1), 'yyyy-MM-dd');
    const yesterdayTasks = await taskRepository.findByDate(yesterdayStr);
    const overnightSpillover = yesterdayTasks.filter((t) => {
      const isOvernight = Boolean(t.isOvernight || t.recurrenceRule?.isOvernight);
      if (!isOvernight || !t.startTime || !t.endTime) return false;
      const startMin = parseTimeToMinutes(t.startTime);
      const endMin = parseTimeToMinutes(t.endTime);
      return startMin !== null && endMin !== null && endMin < startMin;
    });

    if (overnightSpillover.length === 0) {
      return todayTasks;
    }

    const existingIds = new Set(todayTasks.map((t) => t.id));
    return [...overnightSpillover.filter((t) => !existingIds.has(t.id)), ...todayTasks];
  }

  async getBacklogTasks(): Promise<Task[]> {
    const all = await taskRepository.findAll();
    return all.filter((t) => !t.date || t.date.trim().length === 0);
  }

  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentTimeStr = format(now, 'HH:mm');
    const overdue = await taskRepository.findOverdue(todayStr, currentTimeStr);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const yesterdayStr = format(addDays(now, -1), 'yyyy-MM-dd');
    return overdue.filter((t) => {
      // Guard 1: Yesterday's overnight task that is actively in progress right now is not yet overdue
      if (t.date === yesterdayStr && (t.isOvernight || t.recurrenceRule?.isOvernight) && t.startTime && t.endTime) {
        const startMin = parseTimeToMinutes(t.startTime);
        const endMin = parseTimeToMinutes(t.endTime);
        if (startMin !== null && endMin !== null && endMin < startMin && nowMin < endMin) {
          return false; // Still actively running in overnight morning window
        }
      }

      // Guard 2: Today's active tasks (either overnight or within duration) are currently in progress, not overdue
      if (t.date === todayStr && t.startTime) {
        const startMin = parseTimeToMinutes(t.startTime);
        if (startMin !== null) {
          const isOvernight = Boolean(t.isOvernight || t.recurrenceRule?.isOvernight);
          if (isOvernight) {
            return false; // Runs into tomorrow morning, not overdue today
          }
          if (t.endTime) {
            const endMin = parseTimeToMinutes(t.endTime);
            if (endMin !== null && endMin > startMin && nowMin < endMin) {
              return false; // In-progress within scheduled start/end window
            }
          } else if (t.estimatedMinutes && t.estimatedMinutes > 0) {
            if (nowMin < startMin + t.estimatedMinutes) {
              return false; // In-progress within estimated duration
            }
          }
        }
      }

      return true;
    });
  }

  async getTasksByDate(date: string): Promise<Task[]> {
    if (date === undefined || date === null) return [];
    const clean = sanitizeDateString(date);
    if (!clean) return [];
    return await taskRepository.findByDate(clean);
  }

  async getTasksByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    const cleanStart = sanitizeDateString(startDate);
    const cleanEnd = sanitizeDateString(endDate);
    if (!cleanStart || !cleanEnd) return [];
    const [start, end] = cleanStart <= cleanEnd ? [cleanStart, cleanEnd] : [cleanEnd, cleanStart];
    return await taskRepository.findByDateRange(start, end);
  }

  async getTasksByCategory(categoryId: string): Promise<Task[]> {
    if (!categoryId || categoryId.trim().length === 0) return [];
    const cleanId = categoryId.trim();
    const all = await taskRepository.findAll();
    return all.filter((t) => t.categoryId === cleanId);
  }

  async getTasksBySeriesId(seriesId: string): Promise<Task[]> {
    if (!seriesId || seriesId.trim().length === 0) return [];
    return await taskRepository.findBySeriesId(seriesId.trim());
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
    const priorityWeights: Record<string, number> = { high: 1, medium: 2, low: 3 };

    // 1. Check yesterday's active overnight tasks spanning into the early morning
    if (nowMin < 720) {
      const yesterdayStr = format(addDays(now, -1), 'yyyy-MM-dd');
      const yesterdayTasks = await taskRepository.findByDate(yesterdayStr);
      const activeOvernightFromYesterday = yesterdayTasks.filter((t) => {
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        if (t.snoozeUntil) {
          const sDate = new Date(t.snoozeUntil);
          if (isValid(sDate) && sDate.getTime() > nowTimestamp) return false;
        }
        const isOvernight = Boolean(t.isOvernight || t.recurrenceRule?.isOvernight);
        if (!isOvernight || !t.startTime || !t.endTime) return false;
        const startMin = parseTimeToMinutes(t.startTime);
        const endMin = parseTimeToMinutes(t.endTime);
        if (startMin === null || endMin === null) return false;
        return endMin < startMin && nowMin < endMin;
      });

      if (activeOvernightFromYesterday.length > 0) {
        activeOvernightFromYesterday.sort((a, b) => {
          const pA = priorityWeights[a.priority] || 2;
          const pB = priorityWeights[b.priority] || 2;
          if (pA !== pB) return pA - pB;
          const aEnd = parseTimeToMinutes(a.endTime || '') ?? 0;
          const bEnd = parseTimeToMinutes(b.endTime || '') ?? 0;
          return aEnd - bEnd;
        });
        return activeOvernightFromYesterday[0];
      }
    }

    const todayTasks = await taskRepository.findByDate(todayStr);
    const pendingTasks = todayTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );

    // Fallback: If no pending tasks today, return top overdue task if available
    if (pendingTasks.length === 0) {
      const overdue = await this.getOverdueTasks();
      return overdue.length > 0 ? overdue[0] : null;
    }

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
      } else if (t.estimatedMinutes && t.estimatedMinutes > 0) {
        endMin = startMin + t.estimatedMinutes;
      } else {
        endMin = startMin + 60;
      }
      return startMin <= nowMin && nowMin < endMin;
    });

    if (activeTasks.length > 0) {
      activeTasks.sort((a, b) => {
        const pA = priorityWeights[a.priority] || 2;
        const pB = priorityWeights[b.priority] || 2;
        if (pA !== pB) return pA - pB;
        const aStart = parseTimeToMinutes(a.startTime || '') ?? 0;
        const bStart = parseTimeToMinutes(b.startTime || '') ?? 0;
        return aStart - bStart;
      });
      return activeTasks[0];
    }

    // 3. Check for upcoming timed tasks later today (including snoozed ones that wake up today)
    const upcomingTimedTasks = pendingTasks.filter((t) => {
      if (t.snoozeUntil) {
        const sDate = new Date(t.snoozeUntil);
        if (isValid(sDate) && sDate.getTime() > nowTimestamp) {
          // Only count as today's upcoming if it wakes up within today
          return format(sDate, 'yyyy-MM-dd') === todayStr;
        }
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
              const diffMins = Math.round((sDate.getTime() - nowTimestamp) / 60000);
              return nowMin + diffMins;
            }
          }
          return parseTimeToMinutes(t.startTime || '') ?? 9999;
        };
        const diff = getEffectiveMin(a) - getEffectiveMin(b);
        if (diff !== 0) return diff;
        return (priorityWeights[a.priority] || 2) - (priorityWeights[b.priority] || 2);
      });
      return upcomingTimedTasks[0];
    }

    // 4. Check for overdue timed tasks earlier today that are still pending (and not future-snoozed)
    const overdueTimedTasks = pendingTasks.filter((t) => {
      if (t.snoozeUntil) {
        const sDate = new Date(t.snoozeUntil);
        if (isValid(sDate) && sDate.getTime() > nowTimestamp) return false;
      }
      if (!t.startTime) return false;
      const tMin = parseTimeToMinutes(t.startTime);
      return tMin !== null && tMin < nowMin;
    });
    if (overdueTimedTasks.length > 0) {
      overdueTimedTasks.sort((a, b) => {
        const pA = priorityWeights[a.priority] || 2;
        const pB = priorityWeights[b.priority] || 2;
        if (pA !== pB) return pA - pB;
        const aMin = parseTimeToMinutes(a.startTime || '') ?? 0;
        const bMin = parseTimeToMinutes(b.startTime || '') ?? 0;
        return aMin - bMin;
      });
      return overdueTimedTasks[0];
    }

    // 5. Fallback: untimed tasks for today sorted by priority
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
    const rawTarget =
      (targetDate && targetDate.trim()) ||
      safeTasks.find((t) => Boolean(t.date))?.date ||
      safeEvents.find((e) => Boolean(e.date))?.date ||
      todayStr;

    const cleanEffective = sanitizeDateString(rawTarget);
    const parsedTarget = cleanEffective ? parseISO(cleanEffective) : parseISO(rawTarget);
    const targetDateObj = isValid(parsedTarget) ? parsedTarget : new Date();
    const effectiveDate = format(targetDateObj, 'yyyy-MM-dd');
    const targetDayOfWeek = targetDateObj.getDay();
    const yesterdayDateStr = format(addDays(targetDateObj, -1), 'yyyy-MM-dd');

    const scheduledItems: Array<{
      title: string;
      start: string;
      end: string;
      startMin: number;
      endMin: number;
    }> = [];

    // 1. Scheduled tasks on target date (and active overnight tasks extending from yesterday)
    for (const t of safeTasks) {
      if (t.startTime && t.status !== 'completed' && t.status !== 'cancelled') {
        // Check for yesterday's overnight task spilling into effectiveDate
        if (t.date === yesterdayDateStr) {
          const isOvernight = Boolean(t.isOvernight || t.recurrenceRule?.isOvernight);
          if (isOvernight && t.endTime) {
            const startMin = parseTimeToMinutes(t.startTime);
            const endMin = parseTimeToMinutes(t.endTime);
            if (startMin !== null && endMin !== null && endMin < startMin) {
              scheduledItems.push({
                title: `🌙 ${t.title} (Overnight)`,
                start: '00:00',
                end: t.endTime,
                startMin: 0,
                endMin,
              });
            }
          }
          continue;
        }

        if (t.date && t.date !== effectiveDate) continue;

        const parsedStart = parseTimeToMinutes(t.startTime);
        if (parsedStart === null) continue;
        const startMin = parsedStart;
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
        } else if (t.estimatedMinutes && t.estimatedMinutes > 0) {
          endMin = startMin + t.estimatedMinutes;
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

    // 2. Active calendar events for target date (respecting explicit endTime if provided)
    for (const ev of safeEvents) {
      if (ev.time && ev.status !== 'completed' && ev.status !== 'dismissed') {
        if (ev.date && ev.date !== effectiveDate) continue;

        const parsedEvStart = parseTimeToMinutes(ev.time);
        if (parsedEvStart === null) continue;
        const startMin = parsedEvStart;
        let endMin: number;
        if (ev.endTime) {
          const parsedEnd = parseTimeToMinutes(ev.endTime);
          endMin = parsedEnd !== null ? Math.max(parsedEnd, startMin + 1) : startMin + 45;
        } else {
          endMin = startMin + 45;
        }

        scheduledItems.push({
          title: `📅 ${ev.title}`,
          start: ev.time,
          end: ev.endTime || ev.time,
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

        const parsedStart = parseTimeToMinutes(h.reminderTime);
        if (parsedStart === null) continue;
        const startMin = parsedStart;
        const duration = h.recurrenceRule?.estimatedMinutes && h.recurrenceRule.estimatedMinutes > 0
          ? h.recurrenceRule.estimatedMinutes
          : 20;
        const endMin = startMin + duration;

        scheduledItems.push({
          title: `🌱 ${h.name}`,
          start: h.reminderTime,
          end: h.reminderTime,
          startMin,
          endMin,
        });
      }
    }

    // Sort scheduled items chronologically for clear time ordering
    scheduledItems.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

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
          const pairKey = [`${a.title}@${a.startMin}`, `${b.title}@${b.startMin}`].sort().join(':::');
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
