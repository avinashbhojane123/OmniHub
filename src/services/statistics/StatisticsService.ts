import { ProductivityStats } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { format, startOfWeek, endOfWeek } from 'date-fns';

export class StatisticsService {
  async getStats(): Promise<ProductivityStats> {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentTimeStr = format(now, 'HH:mm');

    // All tasks
    const allTasks = await taskRepository.findAll();
    const completedTasks = allTasks.filter((t) => t.status === 'completed');
    const overdueTasks = await taskRepository.findOverdue(todayStr, currentTimeStr);
    const pendingTasks = allTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');

    const activeTasks = allTasks.filter((t) => t.status !== 'cancelled');
    const totalActive = activeTasks.length;
    const completionPercentage = totalActive > 0 ? Math.round((completedTasks.length / totalActive) * 100) : 0;

    // Habits
    const habitsWithStreaks = await habitRepository.getHabitsWithStreaks(todayStr);
    const totalHabits = habitsWithStreaks.length;
    const habitsCompletedToday = habitsWithStreaks.filter((h) => h.completedToday).length;
    const habitCompletionPercentage = totalHabits > 0 ? Math.round((habitsCompletedToday / totalHabits) * 100) : 0;

    const currentStreak = habitsWithStreaks.length > 0 ? Math.max(...habitsWithStreaks.map((h) => h.currentStreak)) : 0;
    const bestStreak = habitsWithStreaks.length > 0 ? Math.max(...habitsWithStreaks.map((h) => h.bestStreak)) : 0;

    // Weekly stats
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weeklyTasks = await taskRepository.findByDateRange(weekStart, weekEnd);
    const weeklyCompleted = weeklyTasks.filter((t) => t.status === 'completed').length;
    const weeklyOverdue = weeklyTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled' && t.date < todayStr
    ).length;
    const weeklyTotal = weeklyTasks.length;
    const weeklyCompletionRate = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

    return {
      tasksCompleted: completedTasks.length,
      tasksPending: pendingTasks.length,
      tasksOverdue: overdueTasks.length,
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
