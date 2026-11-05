import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  Task,
  CreateTaskDTO,
  UpdateTaskDTO,
  Category,
  CalendarEvent,
  SnoozeDurationOption,
} from '../types';
import { taskService } from '../services/tasks/TaskService';
import { taskRepository } from '../database/repositories/TaskRepository';
import { categoryRepository } from '../database/repositories/CategoryRepository';
import { calendarRepository } from '../database/repositories/CalendarRepository';
import { alarmService } from '../services/alarm/AlarmService';
import { toggleBulletInRawText } from '../utils/bulletNotes';
import { syncEventBus, DataMutation } from '../services/backup/SyncEventBus';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeQuery, setActiveQuery] = useState<string>('');

  const isMountedRef = useRef<boolean>(true);
  const hasLoadedRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);
  const pendingFetchRef = useRef<boolean>(false);
  const lastFetchTimeRef = useRef<number>(0);
  const activeQueryRef = useRef<string>('');
  const searchRequestIdRef = useRef<number>(0);

  const refresh = useCallback(async (showLoadingSpinner = false) => {
    const now = Date.now();
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    if (!showLoadingSpinner && now - lastFetchTimeRef.current < 400) {
      return;
    }

    try {
      isFetchingRef.current = true;
      lastFetchTimeRef.current = now;

      if ((showLoadingSpinner || !hasLoadedRef.current) && isMountedRef.current) {
        setLoading(true);
      }

      await taskService.ensureUpcomingRecurrences(3);
      const [allCats, allCalEvents] = await Promise.all([
        categoryRepository.findAll(),
        calendarRepository.findAll(),
      ]);

      if (!isMountedRef.current) return;
      setCategories(allCats);
      setCalendarEvents(allCalEvents);

      const currentQuery = activeQueryRef.current.trim();
      if (currentQuery) {
        const results = await taskRepository.search(currentQuery);
        if (isMountedRef.current) {
          setTasks(results);
        }
      } else {
        const allTasks = await taskRepository.findAll();
        if (isMountedRef.current) {
          setTasks(allTasks);
        }
      }
      hasLoadedRef.current = true;
    } catch (e) {
      console.error('[useTasks] Failed to load tasks:', e);
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
      if (pendingFetchRef.current && isMountedRef.current) {
        pendingFetchRef.current = false;
        refresh(false);
      }
    }
  }, []);

  // Mount lifecycle, AppState change listener, and SyncEventBus subscriptions
  useEffect(() => {
    isMountedRef.current = true;
    refresh();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && isMountedRef.current) {
        refresh(false);
      }
    });

    const unsubRestore = syncEventBus.subscribeToRestore(() => {
      if (isMountedRef.current) {
        refresh(false);
      }
    });

    const unsubChanges = syncEventBus.subscribeToChanges((mutation?: DataMutation) => {
      if (!isMountedRef.current) return;
      if (
        !mutation ||
        mutation.entityType === 'task' ||
        mutation.entityType === 'calendarEvent'
      ) {
        refresh(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.remove();
      unsubRestore();
      unsubChanges();
    };
  }, [refresh]);

  const createTask = useCallback(
    async (dto: CreateTaskDTO) => {
      const created = await taskService.createTask(dto);
      if (isMountedRef.current) {
        await refresh(false);
      }
      return created;
    },
    [refresh]
  );

  const updateTask = useCallback(
    async (id: string, dto: UpdateTaskDTO) => {
      const updated = await taskService.updateTask(id, dto);
      if (isMountedRef.current) {
        await refresh(false);
      }
      return updated;
    },
    [refresh]
  );

  const deleteTask = useCallback(
    async (id: string, deleteEntireSeries = false) => {
      // Optimistic removal
      setTasks((prev) => prev.filter((t) => t.id !== id));

      try {
        const alarmState = alarmService.getState();
        if (alarmState.isRinging && alarmState.taskId === id) {
          await alarmService.stopRinging();
        }
        await alarmService.cancelTaskAlarm(id);
        const success = await taskService.deleteTask(id, deleteEntireSeries);
        if (isMountedRef.current) {
          await refresh(false);
        }
        return success;
      } catch (err) {
        if (isMountedRef.current) {
          await refresh(false);
        }
        throw err;
      }
    },
    [refresh]
  );

  const clearCompletedTasks = useCallback(async (): Promise<number> => {
    // Optimistically remove completed tasks from state immediately
    setTasks((prev) => prev.filter((t) => t.status !== 'completed'));

    try {
      const count = await taskService.clearCompletedTasks();
      if (isMountedRef.current) {
        await refresh(false);
      }
      return count;
    } catch (err) {
      if (isMountedRef.current) {
        await refresh(false);
      }
      throw err;
    }
  }, [refresh]);

  const completeTask = useCallback(
    async (id: string) => {
      // Optimistic completion update
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'completed' as const } : t))
      );
      try {
        const alarmState = alarmService.getState();
        if (alarmState.isRinging && alarmState.taskId === id) {
          await alarmService.stopRinging();
        }
        await alarmService.cancelTaskAlarm(id);
        const updated = await taskService.completeTask(id);
        if (isMountedRef.current) {
          await refresh(false);
        }
        return updated;
      } catch (err) {
        if (isMountedRef.current) {
          await refresh(false);
        }
        throw err;
      }
    },
    [refresh]
  );

  const uncompleteTask = useCallback(
    async (id: string) => {
      // Optimistic uncomplete update
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'pending' as const } : t))
      );
      try {
        const updated = await taskService.uncompleteTask(id);
        if (isMountedRef.current) {
          await refresh(false);
        }
        return updated;
      } catch (err) {
        if (isMountedRef.current) {
          await refresh(false);
        }
        throw err;
      }
    },
    [refresh]
  );

  const snoozeTask = useCallback(
    async (id: string, minutes: SnoozeDurationOption = 10) => {
      try {
        const updated = await taskService.snoozeTask(id, minutes);
        const alarmState = alarmService.getState();
        if (alarmState.isRinging && alarmState.taskId === id) {
          await alarmService.snoozeAlarm(minutes);
        }
        if (isMountedRef.current) {
          await refresh(false);
        }
        return updated;
      } catch (err) {
        if (isMountedRef.current) {
          await refresh(false);
        }
        throw err;
      }
    },
    [refresh]
  );

  const rescheduleTask = useCallback(
    async (id: string, date: string, time?: string) => {
      const updated = await taskService.rescheduleTask(id, date, time);
      if (isMountedRef.current) {
        await refresh(false);
      }
      return updated;
    },
    [refresh]
  );

  const toggleSubtask = useCallback(
    async (id: string, subtaskIndex: number) => {
      // Optimistic subtask state toggle matching TaskService checklist logic
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const hasNotesChecklist = Boolean(t.notes && /-\s*\[[ xX]\]/.test(t.notes));
          const hasDescChecklist = Boolean(t.description && /-\s*\[[ xX]\]/.test(t.description));

          if (hasNotesChecklist) {
            return { ...t, notes: toggleBulletInRawText(t.notes!, subtaskIndex) };
          } else if (hasDescChecklist) {
            return { ...t, description: toggleBulletInRawText(t.description!, subtaskIndex) };
          } else if (t.notes && t.notes.trim().length > 0) {
            return { ...t, notes: toggleBulletInRawText(t.notes, subtaskIndex) };
          }
          return t;
        })
      );

      try {
        const updated = await taskService.toggleSubtask(id, subtaskIndex);
        if (updated && isMountedRef.current) {
          setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        }
        return updated;
      } catch (err) {
        if (isMountedRef.current) {
          await refresh(false);
        }
        throw err;
      }
    },
    [refresh]
  );

  const deleteCalendarEvent = useCallback(
    async (id: string) => {
      setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
      try {
        const alarmState = alarmService.getState();
        if (alarmState.isRinging && alarmState.eventId === id) {
          await alarmService.stopRinging();
        }
        await alarmService.cancelEventAlarm(id);
        const success = await calendarRepository.delete(id);
        if (isMountedRef.current) {
          await refresh(false);
        }
        return success;
      } catch (err) {
        if (isMountedRef.current) {
          await refresh(false);
        }
        throw err;
      }
    },
    [refresh]
  );

  const searchTasks = useCallback(async (query: string) => {
    activeQueryRef.current = query;
    setActiveQuery(query);
    const trimmed = query.trim();
    const requestId = ++searchRequestIdRef.current;

    if (!trimmed) {
      try {
        const allTasks = await taskRepository.findAll();
        if (isMountedRef.current && searchRequestIdRef.current === requestId) {
          setTasks(allTasks);
        }
      } catch (err) {
        console.warn('[useTasks] Search clear failed:', err);
      }
      return;
    }

    try {
      const results = await taskRepository.search(trimmed);
      if (isMountedRef.current && searchRequestIdRef.current === requestId) {
        setTasks(results);
      }
    } catch (err) {
      console.warn('[useTasks] Search failed:', err);
    }
  }, []);

  return {
    tasks,
    categories,
    calendarEvents,
    loading,
    refresh,
    createTask,
    updateTask,
    deleteTask,
    clearCompletedTasks,
    completeTask,
    uncompleteTask,
    snoozeTask,
    rescheduleTask,
    toggleSubtask,
    deleteCalendarEvent,
    searchTasks,
  };
}

export type UseTasksResult = ReturnType<typeof useTasks>;

export default useTasks;
