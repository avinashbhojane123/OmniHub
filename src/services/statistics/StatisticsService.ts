import { ProductivityStats } from '../../types';
import { getDatabase } from '../../database/connection';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { format, startOfWeek, endOfWeek, isValid, parseISO } from 'date-fns';

function clampPercentage(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const pct = Math.round((numerator / denominator) * 100);
  return Math.min(100, Math.max(0, pct));
}

function safeNumber(val: any): number {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
}

export class StatisticsService {
  /**
   * Computes comprehensive on-device productivity and habit statistics.
   * Runs queries concurrently in O(1) aggregate time without remote telemetry.
   *
   * @param targetDate Optional date to calculate statistics for (defaults to now).
   */
  async getStats(targetDate?: Date | string | null): Promise<ProductivityStats> {
    try {
      const db = await getDatabase();
      let validNow: Date;
      if (targetDate instanceof Date) {
        validNow = isValid(targetDate) ? targetDate : new Date();
      } else if (typeof targetDate === 'string' && targetDate.trim().length > 0) {
        const trimmed = targetDate.trim();
        const parsed = trimmed.length === 10 ? parseISO(trimmed) : new Date(trimmed);
        validNow = isValid(parsed) ? parsed : new Date();
      } else {
        validNow = new Date();
      }

      const nowIso = validNow.toISOString();
      const todayStr = format(validNow, 'yyyy-MM-dd');
      const currentTimeStr = format(validNow, 'HH:mm');

      const weekStart = format(startOfWeek(validNow, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(validNow, { weekStartsOn: 1 }), 'yyyy-MM-dd');

      // 1. All-time aggregate counts query
      const allTimeQuery = `
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedCount,
          COUNT(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 END) as pendingCount,
          COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as totalActive,
          COUNT(CASE WHEN status NOT IN ('completed', 'cancelled') 
                      AND (snoozeUntil IS NULL OR snoozeUntil <= ?) 
                      AND date IS NOT NULL AND date != '' 
                      AND (date < ? OR (date = ? AND startTime IS NOT NULL AND startTime != '' AND CASE WHEN length(startTime) = 4 THEN '0' || startTime ELSE startTime END < ?)) 
                THEN 1 END) as overdueCount
        FROM tasks
      `;
      const allTimeParams = [nowIso, todayStr, todayStr, currentTimeStr];

      // 2. Weekly aggregate counts query (excludes cancelled tasks from total & uses full overdue criteria)
      const weeklyQuery = `
        SELECT 
          COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as weeklyTotal,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as weeklyCompleted,
          COUNT(CASE WHEN status NOT IN ('completed', 'cancelled') 
                      AND (snoozeUntil IS NULL OR snoozeUntil <= ?) 
                      AND (date < ? OR (date = ? AND startTime IS NOT NULL AND startTime != '' AND CASE WHEN length(startTime) = 4 THEN '0' || startTime ELSE startTime END < ?)) 
                THEN 1 END) as weeklyOverdue
        FROM tasks
        WHERE date >= ? AND date <= ?
      `;
      const weeklyParams = [nowIso, todayStr, todayStr, currentTimeStr, weekStart, weekEnd];

      // Execute task counts and habit streak analysis concurrently
      const [allTimeResult, weeklyResult, habitsWithStreaks] = await Promise.all([
        db.execute(allTimeQuery, allTimeParams),
        db.execute(weeklyQuery, weeklyParams),
        habitRepository.getHabitsWithStreaks(todayStr).catch(() => []),
      ]);

      // Parse Task Counts with defense-in-depth fallback
      const countsRow = allTimeResult?.rows?.[0] || {};
      let tasksCompleted = 0;
      let tasksPending = 0;
      let tasksOverdue = 0;
      let totalActive = 0;

      if (countsRow.completedCount !== undefined) {
        tasksCompleted = safeNumber(countsRow.completedCount);
        tasksPending = safeNumber(countsRow.pendingCount);
        tasksOverdue = safeNumber(countsRow.overdueCount);
        totalActive = safeNumber(countsRow.totalActive);
      } else if (Array.isArray(allTimeResult?.rows)) {
        for (const r of allTimeResult.rows) {
          if (r.status === 'completed') {
            tasksCompleted++;
            totalActive++;
          } else if (r.status !== 'cancelled') {
            tasksPending++;
            totalActive++;
            const notSnoozed = !r.snoozeUntil || r.snoozeUntil <= nowIso;
            if (notSnoozed && r.date) {
              const paddedStart = r.startTime && r.startTime.length === 4 ? `0${r.startTime}` : r.startTime;
              if (r.date < todayStr) {
                tasksOverdue++;
              } else if (r.date === todayStr && paddedStart && paddedStart < currentTimeStr) {
                tasksOverdue++;
              }
            }
          }
        }
      }
      const completionPercentage = clampPercentage(tasksCompleted, totalActive);

      // Parse Weekly Counts with defense-in-depth fallback
      const weeklyRow = weeklyResult?.rows?.[0] || {};
      let weeklyTotal = 0;
      let weeklyCompleted = 0;
      let weeklyOverdue = 0;

      if (weeklyRow.weeklyCompleted !== undefined) {
        weeklyTotal = safeNumber(weeklyRow.weeklyTotal);
        weeklyCompleted = safeNumber(weeklyRow.weeklyCompleted);
        weeklyOverdue = safeNumber(weeklyRow.weeklyOverdue);
      } else if (Array.isArray(weeklyResult?.rows)) {
        for (const r of weeklyResult.rows) {
          if (r.date && r.date >= weekStart && r.date <= weekEnd) {
            if (r.status !== 'cancelled') {
              weeklyTotal++;
            }
            if (r.status === 'completed') {
              weeklyCompleted++;
            } else if (r.status !== 'cancelled') {
              const notSnoozed = !r.snoozeUntil || r.snoozeUntil <= nowIso;
              if (notSnoozed && r.date) {
                const paddedStart = r.startTime && r.startTime.length === 4 ? `0${r.startTime}` : r.startTime;
                if (r.date < todayStr) {
                  weeklyOverdue++;
                } else if (r.date === todayStr && paddedStart && paddedStart < currentTimeStr) {
                  weeklyOverdue++;
                }
              }
            }
          }
        }
      }
      const weeklyCompletionRate = clampPercentage(weeklyCompleted, weeklyTotal);

      // Parse Habit Streaks (robust against NaN, null, and large arrays)
      const totalHabits = Array.isArray(habitsWithStreaks) ? habitsWithStreaks.length : 0;
      const habitsCompletedToday = Array.isArray(habitsWithStreaks)
        ? habitsWithStreaks.filter((h) => Boolean(h?.completedToday)).length
        : 0;
      const habitCompletionPercentage = clampPercentage(habitsCompletedToday, totalHabits);

      let currentStreak = 0;
      let bestStreak = 0;
      if (Array.isArray(habitsWithStreaks)) {
        for (const h of habitsWithStreaks) {
          const c = Number(h?.currentStreak);
          const b = Number(h?.bestStreak);
          if (Number.isFinite(c) && c > currentStreak) currentStreak = Math.floor(c);
          if (Number.isFinite(b) && b > bestStreak) bestStreak = Math.floor(b);
        }
      }

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
    } catch (err) {
      console.warn('[StatisticsService] Error computing productivity stats:', err);
      return {
        tasksCompleted: 0,
        tasksPending: 0,
        tasksOverdue: 0,
        completionPercentage: 0,
        habitsCompletedToday: 0,
        totalHabits: 0,
        habitCompletionPercentage: 0,
        currentStreak: 0,
        bestStreak: 0,
        weeklyCompleted: 0,
        weeklyOverdue: 0,
        weeklyCompletionRate: 0,
      };
    }
  }
}

export const statisticsService = new StatisticsService();
