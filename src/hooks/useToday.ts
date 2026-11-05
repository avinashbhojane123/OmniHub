import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import {
  Task,
  TaskStatus,
  HabitWithStreak,
  CalendarEvent,
  UnifiedNextUpItem,
  SnoozeDurationOption,
} from '../types';
import { taskService } from '../services/tasks/TaskService';
import { habitService } from '../services/habits/HabitService';
import { calendarRepository } from '../database/repositories/CalendarRepository';
import { alarmService } from '../services/alarm/AlarmService';
import { syncEventBus, DataMutation } from '../services/backup/SyncEventBus';
import { format } from 'date-fns';

/**
 * Robust minute-of-day parser supporting:
 * - 24-hour format: "14:30", "09:15", "14:30:00"
 * - 12-hour format: "2:30 PM", "09:15 AM", "12:00 am"
 * - Unicode spacing: non-breaking / narrow spaces
 * Returns integer [0..1439] or null if invalid.
 */
export function parseTimeToMinutes(rawTime?: string | null): number | null {
  if (!rawTime || typeof rawTime !== 'string') return null;
  const clean = rawTime.trim().replace(/[\u00A0\u202F]/g, ' ');
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) {
    // Fallback: extract first valid time token if wrapped in text
    const looseMatch = clean.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
    if (!looseMatch) return null;
    return calculateMinutes(looseMatch[1], looseMatch[2], looseMatch[3]);
  }
  return calculateMinutes(match[1], match[2], match[3]);
}

function calculateMinutes(hStr: string, mStr: string, meridian?: string): number | null {
  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes >= 60) return null;

  if (meridian) {
    const med = meridian.toLowerCase();
    if (med === 'pm' && hours < 12) {
      hours += 12;
    } else if (med === 'am' && hours === 12) {
      hours = 0;
    }
  }

  if (hours < 0 || hours >= 24) return null;
  return hours * 60 + minutes;
}

/**
 * Calculates the single unified "Next Up" item across Tasks, Calendar Events, and Habits.
 * Evaluates active running items first, then earliest upcoming items within relevant threshold.
 */
export function computeUnifiedNextUp(
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

  // 1. Task Candidate
  if (upcomingTask && upcomingTask.status !== 'completed' && upcomingTask.status !== 'cancelled') {
    let tStartMin = 9999;
    let isActive = false;
    let isSnoozed = false;

    if (upcomingTask.snoozeUntil) {
      const sDate = new Date(upcomingTask.snoozeUntil);
      if (!isNaN(sDate.getTime()) && sDate.getTime() > now.getTime()) {
        const snoozeDateStr = format(sDate, 'yyyy-MM-dd');
        if (snoozeDateStr === todayStr) {
          isSnoozed = true;
          tStartMin = sDate.getHours() * 60 + sDate.getMinutes();
        } else {
          // Snoozed to a future date: exclude from today's Next Up candidates
          tStartMin = -1;
        }
      }
    }

    if (tStartMin === 9999 && upcomingTask.startTime) {
      const parsedStart = parseTimeToMinutes(upcomingTask.startTime);
      if (parsedStart !== null) {
        tStartMin = parsedStart;
        const parsedEnd = parseTimeToMinutes(upcomingTask.endTime);
        const endMin = parsedEnd !== null && parsedEnd > parsedStart ? parsedEnd : parsedStart + 60;
        if (tStartMin <= nowMin && nowMin < endMin) {
          isActive = true;
        }
      }
    }

    // Only consider the task if it is not deferred to future, and is active, snoozed, or upcoming (within 15m buffer or untimed fallback)
    if (tStartMin !== -1 && (isActive || isSnoozed || (tStartMin !== 9999 ? tStartMin >= nowMin - 15 : true))) {
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
          isSnoozed,
          rawTask: upcomingTask,
        },
        startMin: tStartMin,
        isActive,
      });
    }
  }

  // 2. Calendar Event Candidate
  const todayEvents = (calendarEvents || []).filter(
    (e) => (e.date?.split('T')[0] === todayStr) && e.status !== 'completed' && e.status !== 'dismissed'
  );

  for (const ev of todayEvents) {
    if (!ev.time) continue;
    const evStartMin = parseTimeToMinutes(ev.time);
    if (evStartMin === null) continue;

    const parsedEnd = parseTimeToMinutes(ev.endTime);
    const evEndMin = parsedEnd !== null && parsedEnd > evStartMin ? parsedEnd : evStartMin + 45;
    const isActive = evStartMin <= nowMin && nowMin < evEndMin;

    if (isActive || evStartMin >= nowMin - 15) {
      candidates.push({
        item: {
          id: ev.id,
          type: 'calendar_event',
          title: ev.title,
          description: ev.description,
          startTime: ev.time,
          endTime: ev.endTime,
          categoryName: 'Calendar Event',
          categoryColor: ev.accentColor || '#3B82F6',
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
    if (h.archivedAt) return false;
    if (!h.reminderTime) return false;

    // Recurrence rules
    if (h.recurrenceRule) {
      if (h.recurrenceRule.endDate && h.recurrenceRule.endDate < todayStr) return false;
      if (h.recurrenceRule.startDate && h.recurrenceRule.startDate > todayStr) return false;
      const days = h.recurrenceRule.daysOfWeek;
      if (days && days.length > 0 && !days.includes(currentDayOfWeek)) return false;
      if (h.recurrenceRule.monthDay && h.recurrenceRule.monthDay !== now.getDate()) return false;
    }
    return true;
  });

  for (const hb of pendingHabits) {
    const hbMin = parseTimeToMinutes(hb.reminderTime);
    if (hbMin === null) continue;

    const isActive = hbMin <= nowMin && nowMin < hbMin + 30;
    if (isActive || hbMin >= nowMin - 15) {
      candidates.push({
        item: {
          id: hb.id,
          type: 'habit',
          title: hb.name,
          description: hb.description,
          startTime: hb.reminderTime,
          categoryName: hb.category || 'Daily Habit',
          categoryColor: hb.categoryColor || hb.color || '#10B981',
          categoryIcon: hb.categoryIcon || hb.icon || '🎯',
          streakCount: hb.currentStreak,
          rawHabit: hb,
        },
        startMin: hbMin,
        isActive,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Prioritize active candidates first
  const activeCandidates = candidates.filter((c) => c.isActive);
  if (activeCandidates.length > 0) {
    activeCandidates.sort((a, b) => a.startMin - b.startMin);
    return activeCandidates[0].item;
  }

  // Fallback to earliest upcoming
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
  const [nowMinute, setNowMinute] = useState<number>(() => Math.floor(Date.now() / 60000));

  const isMountedRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);
  const pendingFetchRef = useRef<boolean>(false);
  const lastFetchTimeRef = useRef<number>(0);
  const lastDateRef = useRef<string>(format(new Date(), 'yyyy-MM-dd'));

  const unifiedNextUp = useMemo(() => {
    return computeUnifiedNextUp(upcomingTask, calendarEvents, habits);
  }, [upcomingTask, calendarEvents, habits, nowMinute]);

  const refreshToday = useCallback(async (force = false) => {
    const now = Date.now();
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    if (!force && now - lastFetchTimeRef.current < 600) {
      return;
    }

    try {
      isFetchingRef.current = true;
      lastFetchTimeRef.current = now;
      if (force && isMountedRef.current) {
        setLoading(true);
      }

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      await taskService.ensureUpcomingRecurrences(3);
      const [tasks, overdue, upcoming, habitList, calEvents] = await Promise.all([
        taskService.getTodayTasks(),
        taskService.getOverdueTasks(),
        taskService.getUpcomingTask(),
        habitService.getHabitsWithStreaks(todayStr),
        calendarRepository.findRecentAndUpcoming(todayStr, 7),
      ]);

      if (!isMountedRef.current) return;

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

      // Detect schedule conflicts across tasks, calendar events, and scheduled habits strictly for today
      try {
        const conflictResult = taskService.detectConflicts(tasks, calEvents, habitList, todayStr);
        if (isMountedRef.current) {
          setConflicts(conflictResult?.conflicts || []);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setConflicts([]);
        }
      }
    } catch (e) {
      console.error('Failed to load today data:', e);
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
      if (pendingFetchRef.current && isMountedRef.current) {
        pendingFetchRef.current = false;
        refreshToday(true);
      }
    }
  }, []);

  // Life-cycle mount, periodic 30s clock tick, midnight rollover, and SyncEventBus real-time subscription
  useEffect(() => {
    isMountedRef.current = true;
    refreshToday(true);

    const clockInterval = setInterval(() => {
      if (!isMountedRef.current) return;
      setNowMinute(Math.floor(Date.now() / 60000));

      // Check if calendar date crossed midnight
      const currentDateStr = format(new Date(), 'yyyy-MM-dd');
      if (currentDateStr !== lastDateRef.current) {
        lastDateRef.current = currentDateStr;
        refreshToday(true);
      }
    }, 30000);

    const unsubChanges = syncEventBus.subscribeToChanges((mutation?: DataMutation) => {
      if (!isMountedRef.current) return;
      if (
        !mutation ||
        mutation.entityType === 'task' ||
        mutation.entityType === 'habit' ||
        mutation.entityType === 'habitLog' ||
        mutation.entityType === 'calendarEvent'
      ) {
        refreshToday(false);
      }
    });

    const unsubRestore = syncEventBus.subscribeToRestore(() => {
      if (isMountedRef.current) {
        refreshToday(true);
      }
    });

    return () => {
      isMountedRef.current = false;
      clearInterval(clockInterval);
      unsubChanges();
      unsubRestore();
    };
  }, [refreshToday]);

  const toggleTask = async (task: Task) => {
    const isNowDone = task.status !== 'completed';
    const nextStatus: TaskStatus = isNowDone ? 'completed' : 'pending';
    const completedAt = isNowDone ? new Date().toISOString() : undefined;

    // Optimistic UI updates across both todayTasks and overdueTasks
    setTodayTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      const updated = exists
        ? prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, completedAt } : t))
        : prev;
      const active = updated.filter((t) => t.status !== 'cancelled');
      const total = active.length;
      const completed = active.filter((t) => t.status === 'completed').length;
      setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);
      return updated;
    });

    setOverdueTasks((prev) =>
      isNowDone
        ? prev.filter((t) => t.id !== task.id)
        : prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, completedAt } : t))
    );

    if (isNowDone) {
      setUpcomingTask((prev) => (prev?.id === task.id ? null : prev));
    }

    try {
      if (task.status === 'completed') {
        await taskService.uncompleteTask(task.id);
      } else {
        // If ringing alarm is active for this task, stop audio immediately
        const alarmState = alarmService.getState();
        if (alarmState.isRinging && alarmState.taskId === task.id) {
          await alarmService.stopRinging();
        }
        await alarmService.cancelTaskAlarm(task.id);
        await taskService.completeTask(task.id);
      }

      if (!isMountedRef.current) return;

      const [updatedToday, updatedOverdue, updatedUpcoming] = await Promise.all([
        taskService.getTodayTasks(),
        taskService.getOverdueTasks(),
        taskService.getUpcomingTask(),
      ]);

      if (!isMountedRef.current) return;
      setTodayTasks(updatedToday);
      setOverdueTasks(updatedOverdue);
      setUpcomingTask(updatedUpcoming);

      const active = updatedToday.filter((t) => t.status !== 'cancelled');
      const total = active.length;
      const completed = active.filter((t) => t.status === 'completed').length;
      setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);

      // Recompute schedule conflicts with updated tasks
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const conflictResult = taskService.detectConflicts(updatedToday, calendarEvents, habits, todayStr);
        if (isMountedRef.current) {
          setConflicts(conflictResult?.conflicts || []);
        }
      } catch (err) {
        // preserve existing conflicts if recalculation fails
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
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
      const alarmState = alarmService.getState();
      if (alarmState.isRinging && alarmState.habitId === habit.id && nextCompleted) {
        await alarmService.stopRinging();
      }
      await habitService.toggleHabitToday(habit.id, habit.completedToday);
      const habitsWithStreaks = await habitService.getHabitsWithStreaks(todayIso);
      if (isMountedRef.current) {
        setHabits(habitsWithStreaks);
        try {
          const conflictResult = taskService.detectConflicts(todayTasks, calendarEvents, habitsWithStreaks, todayIso);
          setConflicts(conflictResult?.conflicts || []);
        } catch {}
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
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
          ? nextCompleted ? h.currentStreak + 1 : Math.max(0, h.currentStreak - 1)
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
      const alarmState = alarmService.getState();
      if (isToday && nextCompleted && alarmState.isRinging && alarmState.habitId === habitId) {
        await alarmService.stopRinging();
      }
      await habitService.toggleHabitForDate(habitId, dateStr, currentCompleted);
      const habitsWithStreaks = await habitService.getHabitsWithStreaks(todayIso);
      if (isMountedRef.current) {
        setHabits(habitsWithStreaks);
        if (isToday) {
          try {
            const conflictResult = taskService.detectConflicts(todayTasks, calendarEvents, habitsWithStreaks, todayIso);
            setConflicts(conflictResult?.conflicts || []);
          } catch {}
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to toggle habit date:', err);
      Alert.alert('Error', err.message || 'Failed to update habit log');
      await refreshToday(true);
    }
  };

  const deleteHabit = async (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));

    try {
      const alarmState = alarmService.getState();
      if (alarmState.isRinging && alarmState.habitId === habitId) {
        await alarmService.stopRinging();
      }
      await alarmService.cancelHabitAlarm(habitId);
      await habitService.deleteHabit(habitId);
      if (isMountedRef.current) {
        await refreshToday(true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to delete habit:', err);
      Alert.alert('Error', err.message || 'Failed to delete habit');
      await refreshToday(true);
    }
  };

  const snoozeTask = async (taskId: string, minutes: SnoozeDurationOption = 10) => {
    const snoozeUntilIso = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    setTodayTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, snoozeUntil: snoozeUntilIso } : t))
    );
    setOverdueTasks((prev) => prev.filter((t) => t.id !== taskId));
    setUpcomingTask((prev) => (prev?.id === taskId ? null : prev));

    try {
      await taskService.snoozeTask(taskId, minutes);

      // If active alarm is ringing for this task, snooze it natively
      const alarmState = alarmService.getState();
      if (alarmState.isRinging && alarmState.taskId === taskId) {
        await alarmService.snoozeAlarm(minutes);
      }

      if (isMountedRef.current) {
        await refreshToday(true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to snooze task:', err);
      Alert.alert('Error', err.message || 'Failed to snooze task');
      await refreshToday(true);
    }
  };

  const deleteTask = async (taskId: string) => {
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
      const alarmState = alarmService.getState();
      if (alarmState.isRinging && alarmState.taskId === taskId) {
        await alarmService.stopRinging();
      }
      await alarmService.cancelTaskAlarm(taskId);
      await taskService.deleteTask(taskId);
      if (isMountedRef.current) {
        await refreshToday(true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to delete task:', err);
      Alert.alert('Error', err.message || 'Failed to delete task');
      await refreshToday(true);
    }
  };

  const deleteCalendarEvent = async (eventId: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      const alarmState = alarmService.getState();
      if (alarmState.isRinging && alarmState.eventId === eventId) {
        await alarmService.stopRinging();
      }
      await alarmService.cancelEventAlarm(eventId);
      await calendarRepository.delete(eventId);
      if (isMountedRef.current) {
        await refreshToday(true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
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
      const alarmState = alarmService.getState();
      if (alarmState.isRinging && alarmState.eventId === event.id && nextStatus === 'completed') {
        await alarmService.stopRinging();
      }
      await calendarRepository.update(event.id, { status: nextStatus });
      if (nextStatus === 'completed') {
        await alarmService.cancelEventAlarm(event.id);
      } else if (event.ringAlarm) {
        await alarmService.scheduleEventAlarm(event.id, event.title, event.date, event.time, event.description);
      }
      if (isMountedRef.current) {
        await refreshToday(true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to update event status:', err);
      Alert.alert('Error', err.message || 'Failed to update event');
      await refreshToday(true);
    }
  };

  const completeAllPendingToday = async () => {
    const pending = todayTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    if (pending.length === 0) return;

    // Optimistic UI update across both todayTasks and overdueTasks
    setTodayTasks((prev) =>
      prev.map((t) =>
        t.status !== 'completed' && t.status !== 'cancelled'
          ? { ...t, status: 'completed' as TaskStatus, completedAt: new Date().toISOString() }
          : t
      )
    );
    setOverdueTasks((prev) => prev.filter((t) => !pending.some((p) => p.id === t.id)));
    setCompletionPercentage(100);
    setUpcomingTask(null);

    try {
      const alarmState = alarmService.getState();
      if (alarmState.isRinging && alarmState.taskId && pending.some((p) => p.id === alarmState.taskId)) {
        await alarmService.stopRinging();
      }
      await Promise.all(
        pending.map(async (t) => {
          await alarmService.cancelTaskAlarm(t.id);
          return taskService.completeTask(t.id);
        })
      );
      if (isMountedRef.current) {
        await refreshToday(true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to complete all tasks:', err);
      Alert.alert('Error', err.message || 'Failed to complete all tasks');
      await refreshToday(true);
    }
  };

  const toggleSubtask = async (taskId: string, subtaskIndex: number) => {
    try {
      const updated = await taskService.toggleSubtask(taskId, subtaskIndex);
      if (updated && isMountedRef.current) {
        setTodayTasks((prev) => {
          const mapped = prev.map((t) => (t.id === taskId ? updated : t));
          const active = mapped.filter((t) => t.status !== 'cancelled');
          const total = active.length;
          const completed = active.filter((t) => t.status === 'completed').length;
          setCompletionPercentage(total > 0 ? Math.round((completed / total) * 100) : 0);
          return mapped;
        });
        setOverdueTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
        setUpcomingTask((prev) => (prev?.id === taskId ? updated : prev));
      } else if (isMountedRef.current) {
        await refreshToday(true);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.warn('Failed to toggle subtask:', err);
      Alert.alert('Error', err.message || 'Failed to toggle subtask');
    }
  };

  const toggleHabitSubtask = async (habitId: string, subtaskIndex: number) => {
    try {
      const todayIso = format(new Date(), 'yyyy-MM-dd');
      await habitService.toggleHabitSubtask(habitId, subtaskIndex);
      const updatedHabits = await habitService.getHabitsWithStreaks(todayIso);
      if (isMountedRef.current) {
        setHabits(updatedHabits);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.warn('Failed to toggle habit subtask:', err);
      Alert.alert('Error', err.message || 'Failed to toggle habit subtask');
    }
  };

  const addHabitSubtask = async (habitId: string, subtaskText: string) => {
    if (!subtaskText || !subtaskText.trim()) return;
    try {
      const todayIso = format(new Date(), 'yyyy-MM-dd');
      await habitService.addHabitSubtask(habitId, subtaskText.trim());
      const updatedHabits = await habitService.getHabitsWithStreaks(todayIso);
      if (isMountedRef.current) {
        setHabits(updatedHabits);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.warn('Failed to add habit subtask:', err);
      Alert.alert('Error', err.message || 'Failed to add habit subtask');
    }
  };

  const deleteHabitSubtask = async (habitId: string, subtaskIndex: number) => {
    try {
      const todayIso = format(new Date(), 'yyyy-MM-dd');
      await habitService.deleteHabitSubtask(habitId, subtaskIndex);
      const updatedHabits = await habitService.getHabitsWithStreaks(todayIso);
      if (isMountedRef.current) {
        setHabits(updatedHabits);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.warn('Failed to delete habit subtask:', err);
      Alert.alert('Error', err.message || 'Failed to delete habit subtask');
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

export type UseTodayResult = ReturnType<typeof useToday>;

export default useToday;
