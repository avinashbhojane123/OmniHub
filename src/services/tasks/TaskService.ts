import { Task, CreateTaskDTO, UpdateTaskDTO, CalendarEvent, SnoozeDurationOption } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { notificationService } from '../notifications/NotificationService';
import { format, parseISO, addDays, addMonths, isValid } from 'date-fns';
import { normalizeTimeTo24H, parseTimeToMinutes } from '../../utils/time';

export class TaskService {
  private parseTimeToMinutes(timeStr: string): number | null {
    return parseTimeToMinutes(timeStr);
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    // Validation
    if (!dto.title || dto.title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }

    const normStart = normalizeTimeTo24H(dto.startTime);
    const normEnd = normalizeTimeTo24H(dto.endTime);
    if (normStart && normEnd) {
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
    if (saved.date && saved.startTime) {
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
    if (normStart && normEnd) {
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
    } else if (updated.date && updated.startTime) {
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
        case 'weekly':
          return addDays(d, (rule.interval || 1) * 7);
        case 'monthly':
          return addMonths(d, rule.interval || 1);
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

    // Prevent duplicate spawning if an active task with the same title already exists on nextDateStr
    const existingOnDate = await taskRepository.findByDate(nextDateStr);
    const alreadyExists = existingOnDate.some(
      (t) => t.title.toLowerCase().trim() === task.title.toLowerCase().trim() && t.status !== 'cancelled'
    );
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

  async uncompleteTask(id: string): Promise<Task | null> {
    const updated = await taskRepository.update(id, {
      status: 'pending',
      completedAt: null as any,
    });
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

    const todayTasks = await taskRepository.findByDate(todayStr);
    const pendingUpcoming = todayTasks.filter((t) => {
      if (t.status === 'completed' || t.status === 'cancelled' || !t.startTime) return false;
      const tMin = parseTimeToMinutes(t.startTime);
      return tMin !== null && tMin >= nowMin;
    });

    pendingUpcoming.sort((a, b) => {
      const aMin = parseTimeToMinutes(a.startTime) ?? 9999;
      const bMin = parseTimeToMinutes(b.startTime) ?? 9999;
      return aMin - bMin;
    });

    return pendingUpcoming.length > 0 ? pendingUpcoming[0] : null;
  }

  async getTasksByDate(date: string): Promise<Task[]> {
    return await taskRepository.findByDate(date);
  }

  detectConflicts(tasks: Task[], events: CalendarEvent[], targetDate?: string): { hasConflict: boolean; conflicts: { itemA: string; itemB: string; time: string }[] } {
    const conflicts: { itemA: string; itemB: string; time: string }[] = [];
    const dateStr = targetDate || format(new Date(), 'yyyy-MM-dd');

    // Only consider events scheduled for the specified date
    const todayEvents = events.filter((e) => {
      try {
        const startD = parseISO(e.startTime);
        return isValid(startD) && format(startD, 'yyyy-MM-dd') === dateStr;
      } catch {
        return false;
      }
    });

    const scheduledItems = [
      ...tasks
        .filter((t) => t.startTime && t.status !== 'completed' && t.status !== 'cancelled')
        .map((t) => {
          const startMin = parseTimeToMinutes(t.startTime!) ?? 0;
          const endMin = t.endTime ? Math.max(parseTimeToMinutes(t.endTime) ?? (startMin + 30), startMin + 1) : startMin + 30;
          return {
            title: t.title,
            start: t.startTime!,
            end: t.endTime || t.startTime!,
            startMin,
            endMin,
          };
        }),
      ...todayEvents.map((e) => {
        const start = format(parseISO(e.startTime), 'HH:mm');
        const end = format(parseISO(e.endTime), 'HH:mm');
        const startMin = parseTimeToMinutes(start) ?? 0;
        const endMin = Math.max(parseTimeToMinutes(end) ?? (startMin + 30), startMin + 1);
        return {
          title: e.title,
          start,
          end,
          startMin,
          endMin,
        };
      }),
    ];

    // Check pairwise overlap
    for (let i = 0; i < scheduledItems.length; i++) {
      for (let j = i + 1; j < scheduledItems.length; j++) {
        const a = scheduledItems[i];
        const b = scheduledItems[j];
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          conflicts.push({
            itemA: a.title,
            itemB: b.title,
            time: `${a.start} vs ${b.start}`,
          });
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
