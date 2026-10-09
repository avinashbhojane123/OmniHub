import { Task, CreateTaskDTO, UpdateTaskDTO, CalendarEvent, SnoozeDurationOption } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { notificationService } from '../notifications/NotificationService';
import { format, parseISO } from 'date-fns';

export class TaskService {
  private parseTimeToMinutes(timeStr: string): number | null {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3]?.toLowerCase();
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  async createTask(dto: CreateTaskDTO): Promise<Task> {
    // Validation
    if (!dto.title || dto.title.trim().length === 0) {
      throw new Error('Task title cannot be empty.');
    }

    if (dto.startTime && dto.endTime) {
      const startMin = this.parseTimeToMinutes(dto.startTime);
      const endMin = this.parseTimeToMinutes(dto.endTime);
      if (startMin !== null && endMin !== null && endMin < startMin) {
        throw new Error('End time cannot be earlier than start time.');
      }
    }

    const now = new Date().toISOString();
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newTask: Task = {
      id,
      title: dto.title.trim(),
      description: dto.description?.trim() || undefined,
      date: dto.date,
      startTime: dto.startTime || undefined,
      endTime: dto.endTime || undefined,
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

    const startStr = dto.startTime !== undefined ? dto.startTime : existing.startTime;
    const endStr = dto.endTime !== undefined ? dto.endTime : existing.endTime;
    if (startStr && endStr) {
      const startMin = this.parseTimeToMinutes(startStr);
      const endMin = this.parseTimeToMinutes(endStr);
      if (startMin !== null && endMin !== null && endMin < startMin) {
        throw new Error('End time cannot be earlier than start time.');
      }
    }

    const updated = await taskRepository.update(id, dto);
    if (!updated) return null;

    // Reschedule or cancel notification
    if (updated.status === 'completed' || updated.status === 'cancelled') {
      await notificationService.cancelTaskReminder(id);
    } else if (updated.date && updated.startTime) {
      await notificationService.scheduleTaskReminder(updated);
    }

    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    await notificationService.cancelTaskReminder(id);
    return await taskRepository.delete(id);
  }

  async completeTask(id: string): Promise<Task | null> {
    const now = new Date().toISOString();
    const updated = await taskRepository.update(id, {
      status: 'completed',
      completedAt: now,
    });
    await notificationService.cancelTaskReminder(id);
    return updated;
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
    const currentTimeStr = format(now, 'HH:mm');

    const todayTasks = await taskRepository.findByDate(todayStr);
    const pendingUpcoming = todayTasks.filter(
      (t) =>
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        t.startTime &&
        t.startTime >= currentTimeStr
    );

    return pendingUpcoming.length > 0 ? pendingUpcoming[0] : null;
  }

  async getTasksByDate(date: string): Promise<Task[]> {
    return await taskRepository.findByDate(date);
  }

  detectConflicts(tasks: Task[], events: CalendarEvent[]): { hasConflict: boolean; conflicts: { itemA: string; itemB: string; time: string }[] } {
    const conflicts: { itemA: string; itemB: string; time: string }[] = [];

    const toMinutes = (timeStr: string): number => {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!match) return 0;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const period = match[3]?.toLowerCase();
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    const scheduledItems = [
      ...tasks
        .filter((t) => t.startTime && t.status !== 'completed' && t.status !== 'cancelled')
        .map((t) => {
          const startMin = toMinutes(t.startTime!);
          const endMin = t.endTime ? Math.max(toMinutes(t.endTime), startMin + 1) : startMin + 30;
          return {
            title: t.title,
            start: t.startTime!,
            end: t.endTime || t.startTime!,
            startMin,
            endMin,
          };
        }),
      ...events.map((e) => {
        const start = format(parseISO(e.startTime), 'HH:mm');
        const end = format(parseISO(e.endTime), 'HH:mm');
        const startMin = toMinutes(start);
        const endMin = Math.max(toMinutes(end), startMin + 1);
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
