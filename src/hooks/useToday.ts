import { useState, useEffect, useCallback } from 'react';
import { Task, HabitWithStreak, CalendarEvent } from '../types';
import { taskService } from '../services/tasks/TaskService';
import { habitService } from '../services/habits/HabitService';

export function useToday() {
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [upcomingTask, setUpcomingTask] = useState<Task | null>(null);
  const [habits, setHabits] = useState<HabitWithStreak[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [conflicts, setConflicts] = useState<{ itemA: string; itemB: string; time: string }[]>([]);
  const [completionPercentage, setCompletionPercentage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshToday = useCallback(async () => {
    try {
      setLoading(true);

      const [tasks, overdue, upcoming, habitList] = await Promise.all([
        taskService.getTodayTasks(),
        taskService.getOverdueTasks(),
        taskService.getUpcomingTask(),
        habitService.getHabitsWithStreaks(),
      ]);

      setTodayTasks(tasks);
      setOverdueTasks(overdue);
      setUpcomingTask(upcoming);
      setHabits(habitList);
      setCalendarEvents([]);

      // Calculate completion %
      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === 'completed').length;
      setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);

      // Detect schedule conflicts among today's tasks
      const conflictResult = taskService.detectConflicts(tasks, []);
      setConflicts(conflictResult.conflicts);
    } catch (e) {
      console.error('Failed to load today data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  const toggleTask = async (task: Task) => {
    if (task.status === 'completed') {
      await taskService.uncompleteTask(task.id);
    } else {
      await taskService.completeTask(task.id);
    }
    await refreshToday();
  };

  const toggleHabit = async (habit: HabitWithStreak) => {
    await habitService.toggleHabitToday(habit.id, habit.completedToday);
    await refreshToday();
  };

  const toggleHabitDate = async (
    habitId: string,
    dateStr: string,
    currentCompleted: boolean
  ) => {
    await habitService.toggleHabitForDate(habitId, dateStr, currentCompleted);
    await refreshToday();
  };

  const deleteHabit = async (habitId: string) => {
    await habitService.deleteHabit(habitId);
    await refreshToday();
  };

  const snoozeTask = async (taskId: string) => {
    await taskService.snoozeTask(taskId, 10);
    await refreshToday();
  };

  return {
    todayTasks,
    overdueTasks,
    upcomingTask,
    habits,
    calendarEvents,
    conflicts,
    completionPercentage,
    loading,
    refreshToday,
    toggleTask,
    toggleHabit,
    toggleHabitDate,
    deleteHabit,
    snoozeTask,
  };
}
