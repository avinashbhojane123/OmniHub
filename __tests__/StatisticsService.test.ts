import { statisticsService } from '../src/services/statistics/StatisticsService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { habitRepository } from '../src/database/repositories/HabitRepository';
import { getDatabase } from '../src/database/connection';
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { Task, Habit } from '../src/types';

function createTask(partial: Partial<Task> & { id: string; title: string; date: string }): Task {
  const now = new Date().toISOString();
  return {
    priority: 'medium',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function createHabit(partial: Partial<Habit> & { id: string; name: string }): Habit {
  const now = new Date().toISOString();
  return {
    icon: '🎯',
    color: '#3B82F6',
    recurrenceRule: { type: 'daily' },
    target: 1,
    createdAt: now,
    ...partial,
  };
}

describe('StatisticsService Integration Test Suite (No Mocks)', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(async () => {
    const db = await getDatabase();
    await db.execute('DELETE FROM tasks');
    await db.execute('DELETE FROM habit_logs');
    await db.execute('DELETE FROM habits');
  });

  it('1. should return clean zero stats on empty database', async () => {
    const stats = await statisticsService.getStats();

    expect(stats).toEqual({
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
    });
  });

  it('2. should compute accurate all-time task counts (completed, pending, active, completion rate)', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    // 2 completed tasks
    await taskRepository.create(createTask({
      id: 'task_comp_1',
      title: 'Completed Task 1',
      date: today,
      status: 'completed',
    }));
    await taskRepository.create(createTask({
      id: 'task_comp_2',
      title: 'Completed Task 2',
      date: today,
      status: 'completed',
    }));

    // 1 pending task
    await taskRepository.create(createTask({
      id: 'task_pend_1',
      title: 'Pending Task 1',
      date: today,
      status: 'pending',
    }));

    // 1 in_progress task
    await taskRepository.create(createTask({
      id: 'task_prog_1',
      title: 'In Progress Task 1',
      date: today,
      status: 'in_progress',
    }));

    // 1 cancelled task (should NOT be counted in pending or completed, and excluded from rate)
    await taskRepository.create(createTask({
      id: 'task_canc_1',
      title: 'Cancelled Task 1',
      date: today,
      status: 'cancelled',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.tasksCompleted).toBe(2);
    expect(stats.tasksPending).toBe(2); // pending + in_progress
    // totalActive = 2 completed + 2 pending = 4 active
    // completionPercentage = (2 / 4) * 100 = 50%
    expect(stats.completionPercentage).toBe(50);
  });

  it('3. should count overdue status tasks in tasksPending and totalActive without double-counting', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    await taskRepository.create(createTask({
      id: 'task_overdue_status',
      title: 'Task marked overdue',
      date: today,
      status: 'overdue',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.tasksPending).toBe(1);
    expect(stats.completionPercentage).toBe(0);
  });

  it('4. should correctly detect overdue tasks based on past date', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    await taskRepository.create(createTask({
      id: 'task_past_date',
      title: 'Overdue from yesterday',
      date: yesterday,
      status: 'pending',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.tasksOverdue).toBe(1);
    expect(stats.tasksPending).toBe(1);
  });

  it('5. should correctly detect overdue tasks based on today date and past startTime', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    // 00:01 AM is definitely in the past relative to any test execution during normal hours
    await taskRepository.create(createTask({
      id: 'task_past_time_today',
      title: 'Overdue from earlier today',
      date: today,
      startTime: '00:01',
      status: 'pending',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.tasksOverdue).toBe(1);
  });

  it('6. should NOT mark future startTime tasks today as overdue', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    // 23:59 PM is in the future
    await taskRepository.create(createTask({
      id: 'task_future_time_today',
      title: 'Scheduled for tonight',
      date: today,
      startTime: '23:59',
      status: 'pending',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.tasksOverdue).toBe(0);
    expect(stats.tasksPending).toBe(1);
  });

  it('7. should respect future snoozeUntil and not count snoozed tasks as overdue', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const futureSnooze = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await taskRepository.create(createTask({
      id: 'task_snoozed_future',
      title: 'Snoozed into tomorrow',
      date: yesterday,
      snoozeUntil: futureSnooze,
      status: 'pending',
    }));

    const stats = await statisticsService.getStats();

    // Although date is yesterday, task is currently snoozed in the future
    expect(stats.tasksOverdue).toBe(0);
    expect(stats.tasksPending).toBe(1);
  });

  it('8. should count tasks with expired snoozeUntil as overdue if date is in the past', async () => {
    const yesterday = format(subDays(new Date(), 2), 'yyyy-MM-dd');
    const pastSnooze = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago

    await taskRepository.create(createTask({
      id: 'task_snooze_expired',
      title: 'Expired snooze',
      date: yesterday,
      snoozeUntil: pastSnooze,
      status: 'pending',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.tasksOverdue).toBe(1);
  });

  it('9. should exclude cancelled and completed tasks from overdue counts even if date was in the past', async () => {
    const pastDate = format(subDays(new Date(), 3), 'yyyy-MM-dd');

    await taskRepository.create(createTask({
      id: 'task_past_completed',
      title: 'Finished in past',
      date: pastDate,
      status: 'completed',
    }));

    await taskRepository.create(createTask({
      id: 'task_past_cancelled',
      title: 'Cancelled in past',
      date: pastDate,
      status: 'cancelled',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.tasksOverdue).toBe(0);
    expect(stats.tasksCompleted).toBe(1);
    expect(stats.tasksPending).toBe(0);
  });

  it('10. should clamp completionPercentage between 0 and 100', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    await taskRepository.create(createTask({
      id: 'task_all_completed',
      title: 'Completed task',
      date: today,
      status: 'completed',
    }));

    const stats = await statisticsService.getStats();
    expect(stats.completionPercentage).toBe(100);
  });

  it('11. should compute accurate weekly statistics within the current week boundary', async () => {
    const now = new Date();
    const monday = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const sunday = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    // 1 completed task this week
    await taskRepository.create(createTask({
      id: 'task_week_completed',
      title: 'Weekly Completed',
      date: monday,
      status: 'completed',
    }));

    // 1 pending task this week
    await taskRepository.create(createTask({
      id: 'task_week_pending',
      title: 'Weekly Pending',
      date: sunday,
      status: 'pending',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.weeklyCompleted).toBe(1);
    expect(stats.weeklyCompletionRate).toBe(50); // 1 completed out of 2 total this week
  });

  it('12. should exclude tasks outside current week from weeklyTotal and weeklyCompleted', async () => {
    const now = new Date();
    const lastMonth = format(subDays(now, 45), 'yyyy-MM-dd');
    const nextMonth = format(addDays(now, 45), 'yyyy-MM-dd');

    await taskRepository.create(createTask({
      id: 'task_last_month',
      title: 'Last Month Task',
      date: lastMonth,
      status: 'completed',
    }));

    await taskRepository.create(createTask({
      id: 'task_next_month',
      title: 'Next Month Task',
      date: nextMonth,
      status: 'pending',
    }));

    const stats = await statisticsService.getStats();

    // All-time counts should see them
    expect(stats.tasksCompleted).toBe(1);
    expect(stats.tasksPending).toBe(1);

    // Weekly counts should ignore them
    expect(stats.weeklyCompleted).toBe(0);
    expect(stats.weeklyCompletionRate).toBe(0);
  });

  it('13. should exclude cancelled tasks from weekly calculations to protect weeklyCompletionRate', async () => {
    const now = new Date();
    const monday = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    // 1 completed task
    await taskRepository.create(createTask({
      id: 'task_week_comp',
      title: 'Completed',
      date: monday,
      status: 'completed',
    }));

    // 2 cancelled tasks
    await taskRepository.create(createTask({
      id: 'task_week_canc_1',
      title: 'Cancelled 1',
      date: monday,
      status: 'cancelled',
    }));
    await taskRepository.create(createTask({
      id: 'task_week_canc_2',
      title: 'Cancelled 2',
      date: monday,
      status: 'cancelled',
    }));

    const stats = await statisticsService.getStats();

    // Weekly total should exclude the 2 cancelled tasks: 1 completed out of 1 active = 100%
    expect(stats.weeklyCompleted).toBe(1);
    expect(stats.weeklyCompletionRate).toBe(100);
  });

  it('14. should compute habit statistics, completedToday counts, and streak metrics', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const dayBefore = format(subDays(new Date(), 2), 'yyyy-MM-dd');

    const habit1 = await habitRepository.create(createHabit({
      id: 'habit_1',
      name: 'Hydration',
      icon: '💧',
      color: '#3B82F6',
    }));

    const habit2 = await habitRepository.create(createHabit({
      id: 'habit_2',
      name: 'Exercise',
      icon: '🏃',
      color: '#10B981',
    }));

    // Habit 1 logged for 3 consecutive days
    await habitRepository.logHabit(habit1.id, dayBefore, true);
    await habitRepository.logHabit(habit1.id, yesterday, true);
    await habitRepository.logHabit(habit1.id, today, true);

    // Habit 2 not logged today

    const stats = await statisticsService.getStats();

    expect(stats.totalHabits).toBe(2);
    expect(stats.habitsCompletedToday).toBe(1);
    expect(stats.habitCompletionPercentage).toBe(50);
    expect(stats.currentStreak).toBe(3);
    expect(stats.bestStreak).toBeGreaterThanOrEqual(3);
  });

  it('15. should handle habits with zero logs and missing streaks without NaN', async () => {
    await habitRepository.create(createHabit({
      id: 'habit_reading',
      name: 'Read Books',
      icon: '📚',
      color: '#F59E0B',
    }));

    const stats = await statisticsService.getStats();

    expect(stats.totalHabits).toBe(1);
    expect(stats.habitsCompletedToday).toBe(0);
    expect(stats.habitCompletionPercentage).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(0);
    expect(Number.isNaN(stats.currentStreak)).toBe(false);
    expect(Number.isNaN(stats.bestStreak)).toBe(false);
  });

  it('16. should calculate statistics relative to custom targetDate parameter', async () => {
    const historicalDate = new Date('2026-06-15T10:00:00.000Z'); // A Monday
    const histDateStr = '2026-06-15';

    await taskRepository.create(createTask({
      id: 'task_historical',
      title: 'Historical Task',
      date: histDateStr,
      status: 'completed',
    }));

    const stats = await statisticsService.getStats(historicalDate);

    expect(stats.tasksCompleted).toBe(1);
    expect(stats.weeklyCompleted).toBe(1);
    expect(stats.weeklyCompletionRate).toBe(100);
  });

  it('17. should gracefully handle database exceptions and return safe fallback statistics', async () => {
    const db = await getDatabase() as any;
    const originalTables = db.tables;
    try {
      db.tables = null; // Forces db.execute to throw inside StatisticsService
      const stats = await statisticsService.getStats();

      expect(stats).toEqual({
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
      });
    } finally {
      db.tables = originalTables;
    }
  });

  it('18. should parse YYYY-MM-DD string targetDate without local time zone shifting', async () => {
    const histDateStr = '2026-07-20'; // A Monday

    await taskRepository.create(createTask({
      id: 'task_iso_string',
      title: 'ISO String Task',
      date: histDateStr,
      status: 'completed',
    }));

    const stats = await statisticsService.getStats(histDateStr);

    expect(stats.tasksCompleted).toBe(1);
    expect(stats.weeklyCompleted).toBe(1);
    expect(stats.weeklyCompletionRate).toBe(100);
  });

  it('19. should accurately detect overdue tasks with unpadded startTime (e.g. 9:00 vs 14:30)', async () => {
    const targetDate = new Date('2026-10-31T14:30:00');
    const targetDateStr = '2026-10-31';

    // Single-digit hour startTime "9:00" scheduled before 14:30
    await taskRepository.create(createTask({
      id: 'task_unpadded_time',
      title: 'Task at 9:00 AM',
      date: targetDateStr,
      startTime: '9:00',
      status: 'pending',
    }));

    // Double-digit hour startTime "16:00" scheduled after 14:30
    await taskRepository.create(createTask({
      id: 'task_future_padded_time',
      title: 'Task at 4:00 PM',
      date: targetDateStr,
      startTime: '16:00',
      status: 'pending',
    }));

    const stats = await statisticsService.getStats(targetDate);

    expect(stats.tasksOverdue).toBe(1);
    expect(stats.tasksPending).toBe(2);
  });

  it('20. should gracefully fallback to current time when targetDate is invalid or null', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    await taskRepository.create(createTask({
      id: 'task_fallback_date',
      title: 'Fallback Task',
      date: today,
      status: 'completed',
    }));

    const statsInvalidStr = await statisticsService.getStats('invalid-date-string');
    expect(statsInvalidStr.tasksCompleted).toBe(1);

    const statsInvalidDate = await statisticsService.getStats(new Date('invalid'));
    expect(statsInvalidDate.tasksCompleted).toBe(1);

    const statsNull = await statisticsService.getStats(null);
    expect(statsNull.tasksCompleted).toBe(1);
  });

  it('21. should handle multiple concurrent getStats calls without race conditions or data corruption', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    await taskRepository.create(createTask({
      id: 'task_concurrent_1',
      title: 'Concurrent Task 1',
      date: today,
      status: 'completed',
    }));
    await taskRepository.create(createTask({
      id: 'task_concurrent_2',
      title: 'Concurrent Task 2',
      date: today,
      status: 'pending',
    }));

    const promises = Array.from({ length: 10 }, () => statisticsService.getStats());
    const results = await Promise.all(promises);

    expect(results).toHaveLength(10);
    for (const stats of results) {
      expect(stats.tasksCompleted).toBe(1);
      expect(stats.tasksPending).toBe(1);
      expect(stats.completionPercentage).toBe(50);
    }
  });
});
