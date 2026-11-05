import { Habit, HabitWithStreak, HabitLog, RecurrenceRule } from '../../types';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { alarmService } from '../alarm/AlarmService';
import { format, parseISO, isValid } from 'date-fns';
import {
  toggleBulletInRawText,
  addBulletToRawText,
  removeBulletFromRawText,
} from '../../utils/bulletNotes';

export class HabitService {
  private resolveDaysOfWeek(recurrenceRule?: RecurrenceRule): number[] {
    if (recurrenceRule?.daysOfWeek && recurrenceRule.daysOfWeek.length > 0) {
      return recurrenceRule.daysOfWeek;
    }
    if (recurrenceRule?.type === 'weekdays') {
      return [1, 2, 3, 4, 5];
    }
    if (recurrenceRule?.type === 'weekends') {
      return [0, 6];
    }
    return [0, 1, 2, 3, 4, 5, 6];
  }

  async getHabitsWithStreaks(targetDate?: Date | string): Promise<HabitWithStreak[]> {
    let todayStr: string;
    if (targetDate instanceof Date) {
      todayStr = isValid(targetDate) ? format(targetDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    } else if (typeof targetDate === 'string' && targetDate.trim()) {
      const parsed = parseISO(targetDate.trim());
      todayStr = isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    } else {
      todayStr = format(new Date(), 'yyyy-MM-dd');
    }
    return await habitRepository.getHabitsWithStreaks(todayStr);
  }

  async getAllHabits(): Promise<Habit[]> {
    return await habitRepository.findAll();
  }

  async getActiveHabits(): Promise<Habit[]> {
    return await habitRepository.findActive();
  }

  async createHabit(data: {
    name: string;
    description?: string;
    icon: string;
    color: string;
    recurrenceRule: RecurrenceRule;
    target?: number;
    reminderTime?: string;
  }): Promise<Habit> {
    if (!data || !data.name || !data.name.trim()) {
      throw new Error('Habit name cannot be empty.');
    }

    const cleanName = data.name.trim();
    const cleanDescription = data.description?.trim() ? data.description.trim() : undefined;
    const cleanReminderTime = data.reminderTime?.trim() ? data.reminderTime.trim() : undefined;
    const validTarget = Math.max(1, Math.floor(Number(data.target) || 1));

    const id = `habit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const habit: Habit = {
      id,
      name: cleanName,
      description: cleanDescription,
      icon: data.icon || 'star',
      color: data.color || '#3B82F6',
      recurrenceRule: data.recurrenceRule || { type: 'daily' },
      target: validTarget,
      reminderTime: cleanReminderTime,
      createdAt: new Date().toISOString(),
    };

    const created = await habitRepository.create(habit);
    if (created.reminderTime) {
      const days = this.resolveDaysOfWeek(created.recurrenceRule);
      try {
        await alarmService.scheduleHabitAlarm(created.id, created.name, created.reminderTime, days);
      } catch (err) {
        console.warn('Failed to schedule habit alarm:', err);
      }
    }
    return created;
  }

  async getHabitById(id: string): Promise<Habit | null> {
    if (!id || typeof id !== 'string' || !id.trim()) return null;
    return await habitRepository.findById(id.trim());
  }

  async updateHabit(
    id: string,
    updates: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      recurrenceRule?: RecurrenceRule;
      target?: number;
      reminderTime?: string;
      archivedAt?: string;
    }
  ): Promise<Habit | null> {
    if (!id || typeof id !== 'string' || !id.trim()) return null;
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Habit name cannot be empty.');
    }

    const sanitizedUpdates: Partial<Habit> = { ...updates };
    if (updates.name !== undefined) {
      sanitizedUpdates.name = updates.name.trim();
    }
    if (updates.description !== undefined) {
      sanitizedUpdates.description = updates.description.trim() ? updates.description.trim() : undefined;
    }
    if (updates.reminderTime !== undefined) {
      sanitizedUpdates.reminderTime = updates.reminderTime && updates.reminderTime.trim()
        ? updates.reminderTime.trim()
        : (null as any);
    }
    if (updates.target !== undefined) {
      sanitizedUpdates.target = Math.max(1, Math.floor(Number(updates.target) || 1));
    }

    const updated = await habitRepository.update(id.trim(), sanitizedUpdates);
    if (updated) {
      // Only recalculate/reschedule alarms if relevant fields changed
      const alarmRelevant =
        updates.name !== undefined ||
        updates.reminderTime !== undefined ||
        updates.recurrenceRule !== undefined ||
        updates.archivedAt !== undefined;

      if (alarmRelevant) {
        try {
          if (updated.reminderTime && !updated.archivedAt) {
            const days = this.resolveDaysOfWeek(updated.recurrenceRule);
            await alarmService.scheduleHabitAlarm(updated.id, updated.name, updated.reminderTime, days);
          } else {
            await alarmService.cancelHabitAlarm(updated.id);
          }
        } catch (err) {
          console.warn('Failed to update habit alarm schedule:', err);
        }
      }
    }
    return updated;
  }

  async archiveHabit(habitId: string): Promise<Habit | null> {
    if (!habitId || typeof habitId !== 'string' || !habitId.trim()) return null;
    try {
      await alarmService.cancelHabitAlarm(habitId.trim());
    } catch (err) {
      console.warn('Failed to cancel habit alarm on archive:', err);
    }
    return await habitRepository.update(habitId.trim(), {
      archivedAt: new Date().toISOString(),
    });
  }

  async unarchiveHabit(habitId: string): Promise<Habit | null> {
    if (!habitId || typeof habitId !== 'string' || !habitId.trim()) return null;
    const updated = await habitRepository.update(habitId.trim(), {
      archivedAt: null as any,
    });
    if (updated && updated.reminderTime) {
      const days = this.resolveDaysOfWeek(updated.recurrenceRule);
      try {
        await alarmService.scheduleHabitAlarm(updated.id, updated.name, updated.reminderTime, days);
      } catch (err) {
        console.warn('Failed to restore habit alarm on unarchive:', err);
      }
    }
    return updated;
  }

  async toggleHabitToday(habitId: string, currentCompleted: boolean, notes?: string): Promise<HabitLog> {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return await this.toggleHabitForDate(habitId, todayStr, currentCompleted, notes);
  }

  async toggleHabitForDate(
    habitId: string,
    dateStr: string,
    currentCompleted: boolean,
    notes?: string
  ): Promise<HabitLog> {
    if (!habitId || typeof habitId !== 'string' || !habitId.trim()) {
      throw new Error('Habit ID is required.');
    }
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
      throw new Error('Valid date string is required.');
    }
    return await habitRepository.logHabit(habitId.trim(), dateStr.trim(), !currentCompleted, notes);
  }

  async logHabit(
    habitId: string,
    dateStr: string,
    completed: boolean,
    notes?: string
  ): Promise<HabitLog> {
    if (!habitId || typeof habitId !== 'string' || !habitId.trim()) {
      throw new Error('Habit ID is required.');
    }
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) {
      throw new Error('Valid date string is required.');
    }
    return await habitRepository.logHabit(habitId.trim(), dateStr.trim(), completed, notes);
  }

  async getHabitLogs(habitId: string, startDate?: string, endDate?: string): Promise<HabitLog[]> {
    if (!habitId || typeof habitId !== 'string' || !habitId.trim()) return [];
    return await habitRepository.getLogsForHabit(habitId.trim(), startDate, endDate);
  }

  async getLogsForDate(dateStr: string): Promise<HabitLog[]> {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return [];
    return await habitRepository.getLogsForDate(dateStr.trim());
  }

  async deleteHabit(habitId: string): Promise<boolean> {
    if (!habitId || typeof habitId !== 'string' || !habitId.trim()) return false;
    try {
      await alarmService.cancelHabitAlarm(habitId.trim());
    } catch (err) {
      console.warn('Failed to cancel habit alarm on delete:', err);
    }
    return await habitRepository.delete(habitId.trim());
  }

  async toggleHabitSubtask(habitId: string, subtaskIndex: number): Promise<Habit | null> {
    if (!habitId || typeof habitId !== 'string' || subtaskIndex < 0) return null;
    const habit = await habitRepository.findById(habitId.trim());
    if (!habit) return null;
    const rawText = habit.description || '';
    const updated = toggleBulletInRawText(rawText, subtaskIndex);
    return await this.updateHabit(habit.id, { description: updated });
  }

  async addHabitSubtask(habitId: string, subtaskText: string): Promise<Habit | null> {
    if (!habitId || typeof habitId !== 'string') return null;
    const habit = await habitRepository.findById(habitId.trim());
    if (!habit) return null;
    const clean = (subtaskText || '').trim();
    if (!clean) return habit;
    const newText = addBulletToRawText(habit.description, clean, 'checklist');
    return await this.updateHabit(habit.id, { description: newText });
  }

  async deleteHabitSubtask(habitId: string, subtaskIndex: number): Promise<Habit | null> {
    if (!habitId || typeof habitId !== 'string' || subtaskIndex < 0) return null;
    const habit = await habitRepository.findById(habitId.trim());
    if (!habit) return null;
    const updated = removeBulletFromRawText(habit.description, subtaskIndex);
    return await this.updateHabit(habit.id, { description: updated });
  }
}

export const habitService = new HabitService();
