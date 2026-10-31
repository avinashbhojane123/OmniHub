import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Task, CreateTaskDTO, UpdateTaskDTO, Category, CalendarEvent } from '../types';
import { taskService } from '../services/tasks/TaskService';
import { taskRepository } from '../database/repositories/TaskRepository';
import { categoryRepository } from '../database/repositories/CategoryRepository';
import { calendarRepository } from '../database/repositories/CalendarRepository';
import { toggleBulletInRawText } from '../utils/bulletNotes';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeQuery, setActiveQuery] = useState<string>('');
  const hasLoadedRef = useRef<boolean>(false);

  const refresh = useCallback(async (showLoadingSpinner = false) => {
    try {
      if (showLoadingSpinner || !hasLoadedRef.current) {
        setLoading(true);
      }
      await taskService.ensureUpcomingRecurrences(3);
      const [allCats, allCalEvents] = await Promise.all([
        categoryRepository.findAll(),
        calendarRepository.findAll(),
      ]);
      setCategories(allCats);
      setCalendarEvents(allCalEvents);

      if (activeQuery.trim()) {
        const results = await taskRepository.search(activeQuery);
        setTasks(results);
      } else {
        const allTasks = await taskRepository.findAll();
        setTasks(allTasks);
      }
      hasLoadedRef.current = true;
    } catch (e) {
      console.error('Failed to load tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [activeQuery]);

  useEffect(() => {
    refresh();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refresh();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refresh]);

  const createTask = async (dto: CreateTaskDTO) => {
    const created = await taskService.createTask(dto);
    await refresh();
    return created;
  };

  const updateTask = async (id: string, dto: UpdateTaskDTO) => {
    const updated = await taskService.updateTask(id, dto);
    await refresh();
    return updated;
  };

  const deleteTask = async (id: string, deleteEntireSeries = false) => {
    // Optimistic removal
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const success = await taskService.deleteTask(id, deleteEntireSeries);
    await refresh();
    return success;
  };

  const clearCompletedTasks = async (): Promise<number> => {
    // Optimistically remove completed tasks from state immediately
    setTasks((prev) => prev.filter((t) => t.status !== 'completed'));
    const count = await taskService.clearCompletedTasks();
    await refresh();
    return count;
  };

  const completeTask = async (id: string) => {
    // Optimistic completion update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'completed' as const } : t))
    );
    try {
      const updated = await taskService.completeTask(id);
      await refresh();
      return updated;
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  const uncompleteTask = async (id: string) => {
    // Optimistic uncomplete update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'pending' as const } : t))
    );
    try {
      const updated = await taskService.uncompleteTask(id);
      await refresh();
      return updated;
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  const snoozeTask = async (id: string, minutes = 10) => {
    const updated = await taskService.snoozeTask(id, minutes as any);
    await refresh();
    return updated;
  };

  const rescheduleTask = async (id: string, date: string, time?: string) => {
    const updated = await taskService.rescheduleTask(id, date, time);
    await refresh();
    return updated;
  };

  const toggleSubtask = async (id: string, subtaskIndex: number) => {
    // Optimistic subtask state toggle
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.notes && t.notes.trim().length > 0) {
          return { ...t, notes: toggleBulletInRawText(t.notes, subtaskIndex) };
        } else if (t.description && t.description.trim().length > 0) {
          return { ...t, description: toggleBulletInRawText(t.description, subtaskIndex) };
        }
        return t;
      })
    );

    try {
      const updated = await taskService.toggleSubtask(id, subtaskIndex);
      if (updated) {
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
      return updated;
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  const deleteCalendarEvent = async (id: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
    const success = await calendarRepository.delete(id);
    await refresh();
    return success;
  };

  const searchTasks = (query: string) => {
    setActiveQuery(query);
  };

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
