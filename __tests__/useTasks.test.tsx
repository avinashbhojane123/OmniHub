import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useTasks } from '../src/hooks/useTasks';
import DefaultUseTasks from '../src/hooks/useTasks';
import { taskService } from '../src/services/tasks/TaskService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { categoryRepository } from '../src/database/repositories/CategoryRepository';
import { calendarRepository } from '../src/database/repositories/CalendarRepository';
import { alarmService } from '../src/services/alarm/AlarmService';
import { syncEventBus } from '../src/services/backup/SyncEventBus';
import { Task, Category, CalendarEvent } from '../src/types';

describe('useTasks Hook Suite', () => {
  let renderers: ReactTestRenderer.ReactTestRenderer[] = [];

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      title: 'First Test Task',
      date: '2026-11-01',
      status: 'pending',
      priority: 'high',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'task-2',
      title: 'Second Test Task',
      date: '2026-11-01',
      status: 'completed',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockCategories: Category[] = [
    {
      id: 'cat-1',
      name: 'Work',
      color: '#3B82F6',
      icon: '💼',
      createdAt: new Date().toISOString(),
    },
  ];

  const mockCalendarEvents: CalendarEvent[] = [
    {
      id: 'cal-1',
      title: 'Board Meeting',
      date: '2026-11-01',
      time: '14:00',
      ringAlarm: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(taskService, 'ensureUpcomingRecurrences').mockResolvedValue(undefined as any);
    jest.spyOn(categoryRepository, 'findAll').mockResolvedValue(mockCategories);
    jest.spyOn(calendarRepository, 'findAll').mockResolvedValue(mockCalendarEvents);
    jest.spyOn(taskRepository, 'findAll').mockResolvedValue(mockTasks);
  });

  afterEach(() => {
    ReactTestRenderer.act(() => {
      renderers.forEach((r) => {
        try {
          r.unmount();
        } catch {}
      });
    });
    renderers = [];
  });

  describe('1. Exports & Initialization', () => {
    it('should export both useTasks named and default identically', () => {
      expect(useTasks).toBeDefined();
      expect(DefaultUseTasks).toBeDefined();
      expect(useTasks).toBe(DefaultUseTasks);
    });

    it('should initialize with tasks, categories, and calendar events loaded', async () => {
      let hookValue: any = null;
      function Consumer() {
        hookValue = useTasks();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(<Consumer />);
        renderers.push(r);
        await Promise.resolve();
      });

      expect(hookValue).not.toBeNull();
      expect(hookValue.tasks).toHaveLength(2);
      expect(hookValue.categories).toHaveLength(1);
      expect(hookValue.calendarEvents).toHaveLength(1);
      expect(hookValue.loading).toBe(false);
      expect(typeof hookValue.createTask).toBe('function');
      expect(typeof hookValue.updateTask).toBe('function');
      expect(typeof hookValue.deleteTask).toBe('function');
      expect(typeof hookValue.completeTask).toBe('function');
      expect(typeof hookValue.uncompleteTask).toBe('function');
      expect(typeof hookValue.snoozeTask).toBe('function');
      expect(typeof hookValue.searchTasks).toBe('function');
    });
  });

  describe('2. Task Actions & Alarm Integration', () => {
    it('should stop ringing alarm and cancel task alarm when deleting a task', async () => {
      const stopRingingSpy = jest.spyOn(alarmService, 'stopRinging').mockReturnValue(undefined);
      const cancelAlarmSpy = jest.spyOn(alarmService, 'cancelTaskAlarm').mockResolvedValue();
      const deleteTaskSpy = jest.spyOn(taskService, 'deleteTask').mockResolvedValue(true);
      jest.spyOn(alarmService, 'getState').mockReturnValue({
        isRinging: true,
        taskId: 'task-1',
        title: 'Alarm Ringing',
        secondsRemaining: 0,
      });

      let hookValue: any = null;
      function Consumer() {
        hookValue = useTasks();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(<Consumer />);
        renderers.push(r);
        await Promise.resolve();
      });

      await ReactTestRenderer.act(async () => {
        const success = await hookValue.deleteTask('task-1');
        expect(success).toBe(true);
      });

      expect(stopRingingSpy).toHaveBeenCalled();
      expect(cancelAlarmSpy).toHaveBeenCalledWith('task-1');
      expect(deleteTaskSpy).toHaveBeenCalledWith('task-1', false);
    });

    it('should stop ringing alarm and cancel task alarm when completing a task', async () => {
      const stopRingingSpy = jest.spyOn(alarmService, 'stopRinging').mockReturnValue(undefined);
      const cancelAlarmSpy = jest.spyOn(alarmService, 'cancelTaskAlarm').mockResolvedValue();
      const completeTaskSpy = jest.spyOn(taskService, 'completeTask').mockResolvedValue({
        ...mockTasks[0],
        status: 'completed',
      });
      jest.spyOn(alarmService, 'getState').mockReturnValue({
        isRinging: true,
        taskId: 'task-1',
        title: 'Alarm Ringing',
        secondsRemaining: 0,
      });

      let hookValue: any = null;
      function Consumer() {
        hookValue = useTasks();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(<Consumer />);
        renderers.push(r);
        await Promise.resolve();
      });

      await ReactTestRenderer.act(async () => {
        await hookValue.completeTask('task-1');
      });

      expect(stopRingingSpy).toHaveBeenCalled();
      expect(cancelAlarmSpy).toHaveBeenCalledWith('task-1');
      expect(completeTaskSpy).toHaveBeenCalledWith('task-1');
    });

    it('should snooze native alarm when snoozing a ringing task', async () => {
      const snoozeAlarmSpy = jest.spyOn(alarmService, 'snoozeAlarm').mockResolvedValue();
      const snoozeTaskSpy = jest.spyOn(taskService, 'snoozeTask').mockResolvedValue({
        ...mockTasks[0],
        snoozeUntil: new Date().toISOString(),
      });
      jest.spyOn(alarmService, 'getState').mockReturnValue({
        isRinging: true,
        taskId: 'task-1',
        title: 'Alarm Ringing',
        secondsRemaining: 0,
      });

      let hookValue: any = null;
      function Consumer() {
        hookValue = useTasks();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(<Consumer />);
        renderers.push(r);
        await Promise.resolve();
      });

      await ReactTestRenderer.act(async () => {
        await hookValue.snoozeTask('task-1', 15);
      });

      expect(snoozeTaskSpy).toHaveBeenCalledWith('task-1', 15);
      expect(snoozeAlarmSpy).toHaveBeenCalledWith(15);
    });

    it('should cancel event alarm when deleting a calendar event', async () => {
      const stopRingingSpy = jest.spyOn(alarmService, 'stopRinging').mockReturnValue(undefined);
      const cancelAlarmSpy = jest.spyOn(alarmService, 'cancelEventAlarm').mockResolvedValue();
      const deleteCalSpy = jest.spyOn(calendarRepository, 'delete').mockResolvedValue(true);
      jest.spyOn(alarmService, 'getState').mockReturnValue({
        isRinging: true,
        eventId: 'cal-1',
        title: 'Event Ringing',
        secondsRemaining: 0,
      });

      let hookValue: any = null;
      function Consumer() {
        hookValue = useTasks();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(<Consumer />);
        renderers.push(r);
        await Promise.resolve();
      });

      await ReactTestRenderer.act(async () => {
        const success = await hookValue.deleteCalendarEvent('cal-1');
        expect(success).toBe(true);
      });

      expect(stopRingingSpy).toHaveBeenCalled();
      expect(cancelAlarmSpy).toHaveBeenCalledWith('cal-1');
      expect(deleteCalSpy).toHaveBeenCalledWith('cal-1');
    });

    it('should search tasks and clear search back to full list', async () => {
      const searchSpy = jest.spyOn(taskRepository, 'search').mockResolvedValue([mockTasks[0]]);
      const findAllSpy = jest.spyOn(taskRepository, 'findAll').mockResolvedValue(mockTasks);

      let hookValue: any = null;
      function Consumer() {
        hookValue = useTasks();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(<Consumer />);
        renderers.push(r);
        await Promise.resolve();
      });

      await ReactTestRenderer.act(async () => {
        await hookValue.searchTasks('First');
      });

      expect(searchSpy).toHaveBeenCalledWith('First');
      expect(hookValue.tasks).toHaveLength(1);

      await ReactTestRenderer.act(async () => {
        await hookValue.searchTasks('');
      });

      expect(findAllSpy).toHaveBeenCalled();
      expect(hookValue.tasks).toHaveLength(2);
    });

    it('should refresh automatically on SyncEventBus changes', async () => {
      let hookValue: any = null;
      function Consumer() {
        hookValue = useTasks();
        return null;
      }

      await ReactTestRenderer.act(async () => {
        const r = ReactTestRenderer.create(<Consumer />);
        renderers.push(r);
        await Promise.resolve();
      });

      const findAllSpy = jest.spyOn(taskRepository, 'findAll');

      await ReactTestRenderer.act(async () => {
        syncEventBus.notifyDataChanged({
          entityType: 'task',
          operation: 'upsert',
          id: 'task-3',
        });
        await Promise.resolve();
      });

      expect(findAllSpy).toHaveBeenCalled();
    });
  });
});
