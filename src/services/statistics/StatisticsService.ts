import { ProductivityStats } from '../../types';
import { getDatabase } from '../../database/connection';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { format, startOfWeek, endOfWeek } from 'date-fns';

export class StatisticsService {
  async getStats(): Promise<ProductivityStats> {
    const db = await getDatabase();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentTimeStr = format(now, 'HH:mm');

    // 1. O(1) SQL Aggregate Task Counts
    const taskCountsResult = await db.execute(
      `SELECT 
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedCount,
        COUNT(CASE WHEN status IN ('pending', 'in_progress') THEN 1 END) as pendingCount,
        COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as totalActive,
        COUNT(CASE WHEN status NOT IN ('completed', 'cancelled') 
                    AND (snoozeUntil IS NULL OR snoozeUntil <= ?) 
                    AND date IS NOT NULL AND date != '' 
                    AND (date < ? OR (date = ? AND startTime IS NOT NULL AND startTime != '' AND startTime < ?)) 
              THEN 1 END) as overdueCount
       FROM tasks`,
      [nowIso, todayStr, todayStr, currentTimeStr]
    );

    const countsRow = taskCountsResult.rows[0] || {};
    const tasksCompleted = Number(countsRow.completedCount || 0);
    const tasksPending = Number(countsRow.pendingCount || 0);
    const tasksOverdue = Number(countsRow.overdueCount || 0);
    const totalActive = Number(countsRow.totalActive || 0);
    const completionPercentage = totalActive > 0 ? Math.round((tasksCompleted / totalActive) * 100) : 0;

    // 2. Habits
    const habitsWithStreaks = await habitRepository.getHabitsWithStreaks(todayStr);
    const totalHabits = habitsWithStreaks.length;
    const habitsCompletedToday = habitsWithStreaks.filter((h) => h.completedToday).length;
    const habitCompletionPercentage = totalHabits > 0 ? Math.round((habitsCompletedToday / totalHabits) * 100) : 0;

    const currentStreak = habitsWithStreaks.length > 0 ? Math.max(...habitsWithStreaks.map((h) => h.currentStreak)) : 0;
    const bestStreak = habitsWithStreaks.length > 0 ? Math.max(...habitsWithStreaks.map((h) => h.bestStreak)) : 0;

    // 3. Weekly stats via SQL Aggregate
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weeklyResult = await db.execute(
      `SELECT 
        COUNT(*) as weeklyTotal,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as weeklyCompleted,
        COUNT(CASE WHEN status NOT IN ('completed', 'cancelled') AND date < ? THEN 1 END) as weeklyOverdue
       FROM tasks
       WHERE date >= ? AND date <= ?`,
      [todayStr, weekStart, weekEnd]
    );

    const weeklyRow = weeklyResult.rows[0] || {};
    const weeklyTotal = Number(weeklyRow.weeklyTotal || 0);
    const weeklyCompleted = Number(weeklyRow.weeklyCompleted || 0);
    const weeklyOverdue = Number(weeklyRow.weeklyOverdue || 0);
    const weeklyCompletionRate = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

    return {
      tasksCompleted,
      tasksPending,
      tasksOverdue,
      completionPercentage,
      habitsCompletedToday,
      totalHabits,
      habitCompletionPercentage,
      currentStreak,
      bestStreak,
      weeklyCompleted,
      weeklyOverdue,
      weeklyCompletionRate,
    };
  }
}

export const statisticsService = new StatisticsService();
