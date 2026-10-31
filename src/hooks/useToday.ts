import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { Task, HabitWithStreak, CalendarEvent, UnifiedNextUpItem } from '../types';
import { taskService } from '../services/tasks/TaskService';
import { habitService } from '../services/habits/HabitService';
import { calendarRepository } from '../database/repositories/CalendarRepository';
import { alarmService } from '../services/alarm/AlarmService';
import { format } from 'date-fns';

function computeUnifiedNextUp(
  upcomingTask: Task | null,
  calendarEvents: CalendarEvent[],
  habits: HabitWithStreak[]
): UnifiedNextUpItem | null {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const currentDayOfWeek = now.getDay();

  const candidates: {
    item: UnifiedNextUpItem;
    startMin: number;
    isActive: boolean;
  }[] = [];

  // 1. Task candidate
  if (upcomingTask && upcomingTask.status !== 'completed' && upcomingTask.status !== 'cancelled') {
    let tStartMin = 9999;
    let isActive = false;
    if (upcomingTask.snoozeUntil) {
      const sDate = new Date(upcomingTask.snoozeUntil);
      if (!isNaN(sDate.getTime()) && sDate.getTime() > now.getTime()) {
        tStartMin = sDate.getHours() * 60 + sDate.getMinutes();
      }
    }
    if (tStartMin === 9999 && upcomingTask.startTime) {
      const match = upcomingTask.startTime.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        tStartMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
        const endMin = upcomingTask.endTime
          ? (parseInt(upcomingTask.endTime.split(':')[0], 10) * 60 + parseInt(upcomingTask.endTime.split(':')[1], 10))
          : tStartMin + 60;
        if (tStartMin <= nowMin && nowMin < endMin) {
          isActive = true;
        }
      }
    }
    candidates.push({
      item: {
        id: upcomingTask.id,
        type: 'task',
        title: upcomingTask.title,
        description: upcomingTask.description,
        startTime: upcomingTask.startTime,
        endTime: upcomingTask.endTime,
        categoryName: upcomingTask.categoryName,
        categoryColor: upcomingTask.categoryColor,
        categoryIcon: upcomingTask.categoryIcon,
        isSnoozed: Boolean(upcomingTask.snoozeUntil && new Date(upcomingTask.snoozeUntil).getTime() > now.getTime()),
        rawTask: upcomingTask,
      },
      startMin: tStartMin,
      isActive,
    });
  }

  // 2. Calendar Event candidate
  const todayEvents = (calendarEvents || []).filter(
    (e) => (e.date?.split('T')[0] === todayStr) && e.status !== 'completed' && e.status !== 'dismissed'
  );
  for (const ev of todayEvents) {
    if (!ev.time) continue;
    const match = ev.time.match(/(\d{1,2}):(\d{2})/);
    if (!match) continue;
    let evStartMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    if (/pm/i.test(ev.time) && parseInt(match[1], 10) < 12) evStartMin += 720;
    if (/am/i.test(ev.time) && parseInt(match[1], 10) === 12) evStartMin -= 720;

    const evEndMin = evStartMin + 45;
    const isActive = evStartMin <= nowMin && nowMin < evEndMin;

    if (evStartMin >= nowMin - 15) {
      candidates.push({
        item: {
          id: ev.id,
          type: 'calendar_event',
          title: ev.title,
          description: ev.description,
          startTime: ev.time,
          categoryName: 'Calendar Event',
          categoryColor: '#3B82F6',
          categoryIcon: '📅',
          rawEvent: ev,
        },
        startMin: evStartMin,
        isActive,
      });
    }
  }

  // 3. Habit Candidate
  const pendingHabits = (habits || []).filter((h) => {
    if (h.completedToday) return false;
    if (!h.reminderTime) return false;
    const days = h.recurrenceRule?.daysOfWeek;
    if (days && days.length > 0 && !days.includes(currentDayOfWeek)) return false;
    return true;
  });

  for (const hb of pendingHabits) {
    const cleanTime = hb.reminderTime!.replace(/[^\d:]/g, '').trim();
    const parts = cleanTime.split(':');
    if (parts.length >= 2) {
      let hbMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      if (/pm/i.test(hb.reminderTime!) && parseInt(parts[0], 10) < 12) hbMin += 720;
      if (/am/i.test(hb.reminderTime!) && parseInt(parts[0], 10) === 12) hbMin -= 720;

      const isActive = hbMin <= nowMin && nowMin < hbMin + 30;
      if (hbMin >= nowMin - 15) {
        candidates.push({
          item: {
            id: hb.id,
            type: 'habit',
            title: hb.name,
            description: hb.description,
            startTime: hb.reminderTime,
            categoryName: 'Daily Habit',
            categoryColor: hb.color || '#10B981',
            categoryIcon: hb.icon || '🎯',
            streakCount: hb.currentStreak,
            rawHabit: hb,
          },
          startMin: hbMin,
          isActive,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  const activeCandidates = candidates.filter((c) => c.isActive);
  if (activeCandidates.length > 0) {
    activeCandidates.sort((a, b) => a.startMin - b.startMin);
    return activeCandidates[0].item;
  }

  candidates.sort((a, b) => a.startMin - b.startMin);
  return candidates[0].item;
}

export function useToday() {
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [upcomingTask, setUpcomingTask] = useState<Task | null>(null);
  const [habits, setHabits] = useState<HabitWithStreak[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [conflicts, setConflicts] = useState<{ itemA: string; itemB: string; time: string }[]>([]);
  const [completionPercentage, setCompletionPercentage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const unifiedNextUp = useMemo(() => {
    return computeUnifiedNextUp(upcomingTask, calendarEvents, habits);
  }, [upcomingTask, calendarEvents, habits]);

  const isFetchingRef = useRef<boolean>(false);
  const lastFetchTimeRef = useRef<number>(0);

  const refreshToday = useCallback(async (force = false) => {
    const now = Date.now();
    if (isFetchingRef.current) return;
    if (!force && now - lastFetchTimeRef.current < 1500) return;

    try {
      isFetchingRef.current = true;
      lastFetchTimeRef.current = now;
      setLoading(true);

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      await taskService.ensureUpcomingRecurrences(3);
      const [tasks, overdue, upcoming, habitList, calEvents] = await Promise.all([
        taskService.getTodayTasks(),
        taskService.getOverdueTasks(),
        taskService.getUpcomingTask(),
        habitService.getHabitsWithStreaks(),
        calendarRepository.findRecentAndUpcoming(todayStr, 7),
      ]);

      setTodayTasks(tasks);
      setOverdueTasks(overdue);
      setUpcomingTask(upcoming);
      setHabits(habitList);
      setCalendarEvents(calEvents);

      // Calculate completion % for today's active tasks
      const active = tasks.filter((t) => t.status !== 'cancelled');
      const total = active.length;
      const completed = active.filter((t) => t.status === 'completed').length;
      setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);

      // Detect schedule conflicts across tasks, calendar events, and scheduled habits
      try {
        const conflictResult = taskService.detectConflicts(tasks, calEvents, habitList);
        setConflicts(conflictResult.conflicts);
      } catch (err) {
        console.warn('Conflict detection error:', err);
        setConflicts([]);
      }
    } catch (e) {
      console.error('Failed to load today data:', e);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  const toggleTask = async (task: Task) => {
    const isNowDone = task.status !== 'completed';
    const nextStatus = isNowDone ? 'completed' : 'pending';

    // Optimistic UI update
    setTodayTasks((prev) => {
      const updated = prev.map((t) =>
        t.id === task.id
          ? { ...t, status: nextStatus as any, completedAt: isNowDone ? new Date().toISOString() : undefined }
          : t
      );
      const active = updated.filter((t) => t.status !== 'cancelled');
      const total = active.length;
      const completed = active.filter((t) => t.status === 'completed').length;
      setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);
      return updated;
    });
    setOverdueTasks((prev) =>
      isNowDone
        ? prev.filter((t) => t.id !== task.id)
        : prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus as any } : t))
    );
    if (isNowDone) {
      setUpcomingTask((prev) => (prev?.id === task.id ? null : prev));
    }

    try {
      if (task.status === 'completed') {
        await taskService.uncompleteTask(task.id);
      } else {
        await taskService.completeTask(task.id);
      }
      // Re-fetch upcoming and overdue quietly in background
      const [overdue, upcoming] = await Promise.all([
        taskService.getOverdueTasks(),
        taskService.getUpcomingTask(),
      ]);
      setOverdueTasks(overdue);
      setUpcomingTask(upcoming);
    } catch (err: any) {
      console.error('Failed to toggle task:', err);
      Alert.alert('Error', err.message || 'Failed to update task status');
      await refreshToday(true);
    }
  };

  const toggleHabit = async (habit: HabitWithStreak) => {
    const nextCompleted = !habit.completedToday;
    const todayIso = format(new Date(), 'yyyy-MM-dd');

    // Optimistic UI update
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habit.id) return h;
        const updatedWeekly = { ...h.weeklyLogs, [todayIso]: nextCompleted };
        const nextStreak = nextCompleted ? h.currentStreak + 1 : Math.max(0, h.currentStreak - 1);
        const nextBest = nextCompleted ? Math.max(h.bestStreak, nextStreak) : h.bestStreak;
        return {
          ...h,
          completedToday: nextCompleted,
          currentStreak: nextStreak,
          bestStreak: nextBest,
          weeklyLogs: updatedWeekly,
        };
      })
    );

    try {
      await habitService.toggleHabitToday(habit.id, habit.completedToday);
      const habitsWithStreaks = await habitService.getHabitsWithStreaks();
      setHabits(habitsWithStreaks);
    } catch (err: any) {
      console.error('Failed to toggle habit:', err);
      Alert.alert('Error', err.message || 'Failed to update habit');
      await refreshToday(true);
    }
  };

  const toggleHabitDate = async (
    habitId: string,
    dateStr: string,
    currentCompleted: boolean
  ) => {
    const nextCompleted = !currentCompleted;
    const todayIso = format(new Date(), 'yyyy-MM-dd');
    const isToday = dateStr === todayIso;

    // Optimistic UI update
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const nextStreak = isToday
          ? (nextCompleted ? h.currentStreak + 1 : Math.max(0, h.currentStreak - 1))
          : h.currentStreak;
        const nextBest = isToday && nextCompleted
          ? Math.max(h.bestStreak, nextStreak)
          : h.bestStreak;
        return {
          ...h,
          completedToday: isToday ? nextCompleted : h.completedToday,
          currentStreak: nextStreak,
          bestStreak: nextBest,
          weeklyLogs: {
            ...h.weeklyLogs,
            [dateStr]: nextCompleted,
          },
        };
      })
    );

    try {
      await habitService.toggleHabitForDate(habitId, dateStr, currentCompleted);
      const habitsWithStreaks = await habitService.getHabitsWithStreaks();
      setHabits(habitsWithStreaks);
    } catch (err: any) {
      console.error('Failed to toggle habit date:', err);
      Alert.alert('Error', err.message || 'Failed to update habit log');
      await refreshToday(true);
    }
  };

  const deleteHabit = async (habitId: string) => {
    // Optimistic removal from in-memory state
    setHabits((prev) => prev.filter((h) => h.id !== habitId));

    try {
      await habitService.deleteHabit(habitId);
      await refreshToday(true);
    } catch (err: any) {
      console.error('Failed to delete habit:', err);
      Alert.alert('Error', err.message || 'Failed to delete habit');
      await refreshToday(true);
    }
  };

  const snoozeTask = async (taskId: string, minutes = 10) => {
    // Optimistic snooze timestamp update
    const snoozeUntilIso = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    setTodayTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, snoozeUntil: snoozeUntilIso } : t))
    );
    setOverdueTasks((prev) => prev.filter((t) => t.id !== taskId));
    setUpcomingTask((prev) => (prev?.id === taskId ? null : prev));

    try {
      await taskService.snoozeTask(taskId, minutes as any);
      await refreshToday(true);
    } catch (err: any) {
      console.error('Failed to snooze task:', err);
      Alert.alert('Error', err.message || 'Failed to snooze task');
      await refreshToday(true);
    }
  };

  const deleteTask = async (taskId: string) => {
    // Optimistic removal from in-memory state
    setTodayTasks((prev) => {
      const updated = prev.filter((t) => t.id !== taskId);
      const active = updated.filter((t) => t.status !== 'cancelled');
      const total = active.length;
      const completed = active.filter((t) => t.status === 'completed').length;
      setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);
      return updated;
    });
    setOverdueTasks((prev) => prev.filter((t) => t.id !== taskId));
    setUpcomingTask((prev) => (prev?.id === taskId ? null : prev));

    try {
      await taskService.deleteTask(taskId);
      await refreshToday(true);
    } catch (err: any) {
      console.error('Failed to delete task:', err);
      Alert.alert('Error', err.message || 'Failed to delete task');
      await refreshToday(true);
    }
  };

  const deleteCalendarEvent = async (eventId: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      await alarmService.cancelEventAlarm(eventId);
      await calendarRepository.delete(eventId);
      await refreshToday(true);
    } catch (err: any) {
      console.error('Failed to delete calendar event:', err);
      Alert.alert('Error', err.message || 'Failed to delete event');
      await refreshToday(true);
    }
  };

  const toggleEventStatus = async (event: CalendarEvent) => {
    const nextStatus = event.status === 'completed' ? 'active' : 'completed';
    setCalendarEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, status: nextStatus } : e))
    );
    try {
      await calendarRepository.update(event.id, { status: nextStatus });
      if (nextStatus === 'completed') {
        await alarmService.cancelEventAlarm(event.id);
      } else if (event.ringAlarm) {
        await alarmService.scheduleEventAlarm(event.id, event.title, event.date, event.time, event.description);
      }
      await refreshToday(true);
    } catch (err: any) {
      console.error('Failed to update event status:', err);
      Alert.alert('Error', err.message || 'Failed to update event');
      await refreshToday();
    }
  };

  const completeAllPendingToday = async () => {
    const pending = todayTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    if (pending.length === 0) return;

    // Optimistic UI update
    setTodayTasks((prev) =>
      prev.map((t) =>
        t.status !== 'completed' && t.status !== 'cancelled'
          ? { ...t, status: 'completed' as any, completedAt: new Date().toISOString() }
          : t
      )
    );
    setCompletionPercentage(100);
    setUpcomingTask(null);

    try {
      await Promise.all(pending.map((t) => taskService.completeTask(t.id)));
      await refreshToday(true);
    } catch (err: any) {
      console.error('Failed to complete all tasks:', err);
      Alert.alert('Error', err.message || 'Failed to complete all tasks');
      await refreshToday(true);
    }
  };

  const toggleSubtask = async (taskId: string, subtaskIndex: number) => {
    try {
      await taskService.toggleSubtask(taskId, subtaskIndex);
      await refreshToday(true);
    } catch (err: any) {
      console.warn('Failed to toggle subtask:', err);
    }
  };

  const toggleHabitSubtask = async (habitId: string, subtaskIndex: number) => {
    try {
      await habitService.toggleHabitSubtask(habitId, subtaskIndex);
      await refreshToday(true);
    } catch (err: any) {
      console.warn('Failed to toggle habit subtask:', err);
    }
  };

  const addHabitSubtask = async (habitId: string, subtaskText: string) => {
    try {
      await habitService.addHabitSubtask(habitId, subtaskText);
      await refreshToday(true);
    } catch (err: any) {
      console.warn('Failed to add habit subtask:', err);
    }
  };

  const deleteHabitSubtask = async (habitId: string, subtaskIndex: number) => {
    try {
      await habitService.deleteHabitSubtask(habitId, subtaskIndex);
      await refreshToday(true);
    } catch (err: any) {
      console.warn('Failed to delete habit subtask:', err);
    }
  };

  return {
    todayTasks,
    overdueTasks,
    upcomingTask,
    unifiedNextUp,
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
    deleteTask,
    snoozeTask,
    deleteCalendarEvent,
    toggleEventStatus,
    completeAllPendingToday,
    toggleSubtask,
    toggleHabitSubtask,
    addHabitSubtask,
    deleteHabitSubtask,
  };
}
