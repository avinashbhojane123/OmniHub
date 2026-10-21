import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Task, CreateTaskDTO, UpdateTaskDTO, Category } from '../types';
import { taskService } from '../services/tasks/TaskService';
import { taskRepository } from '../database/repositories/TaskRepository';
import { categoryRepository } from '../database/repositories/CategoryRepository';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeQuery, setActiveQuery] = useState<string>('');
  const hasLoadedRef = useRef<boolean>(false);

  const refresh = useCallback(async (showLoadingSpinner = false) => {
    try {
      if (showLoadingSpinner || !hasLoadedRef.current) {
        setLoading(true);
      }
      await taskService.ensureUpcomingRecurrences(3);
      const allCats = await categoryRepository.findAll();
      setCategories(allCats);
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
    const success = await taskService.deleteTask(id, deleteEntireSeries);
    await refresh();
    return success;
  };

  const completeTask = async (id: string) => {
    const updated = await taskService.completeTask(id);
    await refresh();
    return updated;
  };

  const uncompleteTask = async (id: string) => {
    const updated = await taskService.uncompleteTask(id);
    await refresh();
    return updated;
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
    const updated = await taskService.toggleSubtask(id, subtaskIndex);
    await refresh();
    return updated;
  };

  const searchTasks = (query: string) => {
    setActiveQuery(query);
  };

  return {
    tasks,
    categories,
    loading,
    refresh,
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    snoozeTask,
    rescheduleTask,
    toggleSubtask,
    searchTasks,
  };
}
