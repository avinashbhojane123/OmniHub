import { Habit, HabitWithStreak, HabitLog, RecurrenceRule } from '../../types';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { alarmService } from '../alarm/AlarmService';
import { format } from 'date-fns';

export class HabitService {
  async getHabitsWithStreaks(): Promise<HabitWithStreak[]> {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return await habitRepository.getHabitsWithStreaks(todayStr);
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
    if (!data.name.trim()) {
      throw new Error('Habit name cannot be empty.');
    }

    const id = `habit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const habit: Habit = {
      id,
      name: data.name.trim(),
      description: data.description?.trim(),
      icon: data.icon,
      color: data.color,
      recurrenceRule: data.recurrenceRule,
      target: data.target || 1,
      reminderTime: data.reminderTime,
      createdAt: new Date().toISOString(),
    };

    const created = await habitRepository.create(habit);
    if (created.reminderTime) {
      const days = created.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
      await alarmService.scheduleHabitAlarm(created.id, created.name, created.reminderTime, days);
    }
    return created;
  }

  async getHabitById(id: string): Promise<Habit | null> {
    return await habitRepository.findById(id);
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
    }
  ): Promise<Habit | null> {
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Habit name cannot be empty.');
    }
    const updated = await habitRepository.update(id, updates);
    if (updated) {
      if (updated.reminderTime) {
        const days = updated.recurrenceRule?.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
        await alarmService.scheduleHabitAlarm(updated.id, updated.name, updated.reminderTime, days);
      } else {
        await alarmService.cancelHabitAlarm(updated.id);
      }
    }
    return updated;
  }

  async toggleHabitToday(habitId: string, currentCompleted: boolean): Promise<HabitLog> {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return await habitRepository.logHabit(habitId, todayStr, !currentCompleted);
  }

  async toggleHabitForDate(habitId: string, dateStr: string, currentCompleted: boolean): Promise<HabitLog> {
    return await habitRepository.logHabit(habitId, dateStr, !currentCompleted);
  }

  async deleteHabit(habitId: string): Promise<boolean> {
    await alarmService.cancelHabitAlarm(habitId);
    return await habitRepository.delete(habitId);
  }
}

export const habitService = new HabitService();
