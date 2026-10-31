import { taskService } from '../src/services/tasks/TaskService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { getDatabase } from '../src/database/connection';
import { format, addDays } from 'date-fns';
import { Task, CalendarEvent, HabitWithStreak } from '../src/types';

describe('TaskService Comprehensive Production Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(async () => {
    // Clean up tasks table before each test for test isolation
    const all = await taskRepository.findAll();
    for (const t of all) {
      await taskRepository.delete(t.id);
    }
  });

  describe('1. Task Creation & Overnight Time Validation', () => {
    it('should create a task with complete metadata including reminderMinutes, isLoudAlarm, estimatedMinutes', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Review System Architecture',
        description: 'Check clean architecture boundaries',
        date: today,
        startTime: '10:00',
        endTime: '11:30',
        priority: 'high',
        reminderMinutes: 15,
        isLoudAlarm: true,
        estimatedMinutes: 90,
        notes: '- [ ] Item A\n- [ ] Item B',
        eisenhowerQuadrant: 'q1',
        accentColor: '#3B82F6',
      });

      expect(task).toBeDefined();
      expect(task.title).toBe('Review System Architecture');
      expect(task.status).toBe('pending');
      expect(task.reminderMinutes).toBe(15);
      expect(task.isLoudAlarm).toBe(true);
      expect(task.estimatedMinutes).toBe(90);
      expect(task.eisenhowerQuadrant).toBe('q1');
      expect(task.accentColor).toBe('#3B82F6');

      const fetched = await taskService.getTaskById(task.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('Review System Architecture');
      expect(fetched?.estimatedMinutes).toBe(90);
    });

    it('should reject empty or whitespace-only title', async () => {
      await expect(
        taskService.createTask({
          title: '   ',
          date: '2026-10-31',
        })
      ).rejects.toThrow('Task title cannot be empty.');
    });

    it('should reject end time earlier than start time for daytime tasks', async () => {
      await expect(
        taskService.createTask({
          title: 'Day Task',
          date: '2026-10-31',
          startTime: '16:00',
          endTime: '14:00',
          isOvernight: false,
        })
      ).rejects.toThrow('End time cannot be earlier than start time.');
    });

    it('should permit end time earlier than start time when isOvernight is true', async () => {
      const task = await taskService.createTask({
        title: 'Night Patrol Shift',
        date: '2026-10-31',
        startTime: '23:00',
        endTime: '06:00',
        isOvernight: true,
      });

      expect(task).toBeDefined();
      expect(task.isOvernight).toBe(true);
      expect(task.startTime).toBe('23:00');
      expect(task.endTime).toBe('06:00');
    });
  });

  describe('2. Task Updates & Overnight Validation', () => {
    it('should update task fields and trim strings', async () => {
      const created = await taskService.createTask({
        title: 'Initial Title',
        date: '2026-10-31',
        startTime: '09:00',
        endTime: '10:00',
      });

      const updated = await taskService.updateTask(created.id, {
        title: '   Updated Title   ',
        notes: '   New Notes   ',
        estimatedMinutes: 45,
      });

      expect(updated?.title).toBe('Updated Title');
      expect(updated?.notes).toBe('New Notes');
      expect(updated?.estimatedMinutes).toBe(45);
    });

    it('should reject updating to empty title', async () => {
      const created = await taskService.createTask({
        title: 'Valid Title',
        date: '2026-10-31',
      });

      await expect(
        taskService.updateTask(created.id, {
          title: '   ',
        })
      ).rejects.toThrow('Task title cannot be empty.');
    });

    it('should handle overnight changes on updateTask correctly', async () => {
      const created = await taskService.createTask({
        title: 'Shift Change',
        date: '2026-10-31',
        startTime: '10:00',
        endTime: '12:00',
      });

      // Turning into an overnight task with end time earlier than start time
      const updated = await taskService.updateTask(created.id, {
        startTime: '22:00',
        endTime: '02:00',
        isOvernight: true,
      });

      expect(updated?.isOvernight).toBe(true);
      expect(updated?.startTime).toBe('22:00');
      expect(updated?.endTime).toBe('02:00');
    });
  });

  describe('3. Recurrence Spawning & Double-Execution Guard', () => {
    it('completeTask should auto-spawn next recurrence and prevent double spawning on double-tap', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Daily Standup',
        date: today,
        startTime: '09:30',
        endTime: '10:00',
        reminderMinutes: 10,
        isLoudAlarm: true,
        recurrenceRule: {
          type: 'daily',
          interval: 1,
        },
      });

      expect(task.seriesId).toBeDefined();

      // First complete
      const completed1 = await taskService.completeTask(task.id);
      expect(completed1?.status).toBe('completed');
      expect(completed1?.completedAt).toBeDefined();

      // Second complete call (simulating rapid UI double-tap)
      const completed2 = await taskService.completeTask(task.id);
      expect(completed2?.status).toBe('completed');

      // Verify that only ONE recurrence was spawned
      const seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(2); // The original completed + 1 new pending

      const nextSpawned = seriesTasks.find((t) => t.id !== task.id);
      expect(nextSpawned?.status).toBe('pending');
      expect(nextSpawned?.reminderMinutes).toBe(10);
      expect(nextSpawned?.isLoudAlarm).toBe(true);
    });

    it('skipRecurringTask should cancel current task and spawn next recurrence without duplicates', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Weekly Workout',
        date: today,
        startTime: '07:00',
        recurrenceRule: {
          type: 'weekly',
          interval: 1,
        },
      });

      const skipped = await taskService.skipRecurringTask(task.id);
      expect(skipped?.status).toBe('cancelled');

      // Calling skip on an already cancelled task should not duplicate
      const skippedAgain = await taskService.skipRecurringTask(task.id);
      expect(skippedAgain?.status).toBe('cancelled');

      const seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(2); // Original cancelled + 1 new pending
    });

    it('spawnNextRecurrence should support yearly recurrence and preserve interval', async () => {
      const task = await taskService.createTask({
        title: 'Annual Tax Filing',
        date: '2026-04-15',
        startTime: '10:00',
        recurrenceRule: {
          type: 'yearly',
          interval: 1,
        },
      });

      await taskService.completeTask(task.id);

      const seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      const nextSpawned = seriesTasks.find((t) => t.id !== task.id);
      expect(nextSpawned).toBeDefined();
      expect(nextSpawned?.date).toBe('2027-04-15');
    });

    it('uncompleteTask should revert status and clean up future spawned recurring instance', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Daily Habit Task',
        date: today,
        recurrenceRule: {
          type: 'daily',
          interval: 1,
        },
      });

      await taskService.completeTask(task.id);
      let seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(2);

      // Uncompleting should delete the future auto-spawned instance
      const uncompleted = await taskService.uncompleteTask(task.id);
      expect(uncompleted?.status).toBe('pending');

      seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(1);
    });
  });

  describe('4. Subtask Bullet Toggling', () => {
    it('toggleSubtask should toggle checklist item in notes', async () => {
      const task = await taskService.createTask({
        title: 'Checklist Task',
        date: '2026-10-31',
        notes: '- [ ] First step\n- [ ] Second step',
      });

      const updated = await taskService.toggleSubtask(task.id, 0);
      expect(updated?.notes).toContain('- [x] First step');
      expect(updated?.notes).toContain('- [ ] Second step');
    });

    it('toggleSubtask should toggle checklist in description when notes has no checklist', async () => {
      const task = await taskService.createTask({
        title: 'Desc Checklist Task',
        date: '2026-10-31',
        notes: 'Just plain summary text without checkboxes',
        description: '- [ ] Prepare presentation\n- [ ] Send slides',
      });

      const updated = await taskService.toggleSubtask(task.id, 1);
      expect(updated?.description).toContain('- [x] Send slides');
      expect(updated?.notes).toBe('Just plain summary text without checkboxes');
    });
  });

  describe('5. Reschedule & Deletion', () => {
    it('rescheduleTask should update date and normalize time', async () => {
      const task = await taskService.createTask({
        title: 'Meeting',
        date: '2026-10-31',
        startTime: '10:00',
        endTime: '11:00',
      });

      const rescheduled = await taskService.rescheduleTask(task.id, '2026-11-05', '2:00 PM');
      expect(rescheduled?.date).toBe('2026-11-05');
      expect(rescheduled?.startTime).toBe('14:00');
    });

    it('deleteTask should delete single task or entire series', async () => {
      const task = await taskService.createTask({
        title: 'Recurring Series Item',
        date: '2026-10-31',
        recurrenceRule: {
          type: 'daily',
          interval: 1,
        },
      });

      await taskService.completeTask(task.id);
      let seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(2);

      // Delete entire series
      const deletedSeries = await taskService.deleteTask(task.id, true);
      expect(deletedSeries).toBe(true);

      seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(0);
    });
  });

  describe('6. Conflict Detection', () => {
    it('detectConflicts should detect overlapping daytime tasks and format window', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          title: 'Design Review',
          date: '2026-10-31',
          startTime: '10:00',
          endTime: '11:00',
          priority: 'high',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't2',
          title: 'Client Sync',
          date: '2026-10-31',
          startTime: '10:30',
          endTime: '11:30',
          priority: 'medium',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const result = taskService.detectConflicts(tasks, [], [], '2026-10-31');
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBe(1);
      expect([result.conflicts[0].itemA, result.conflicts[0].itemB]).toEqual(
        expect.arrayContaining(['Client Sync', 'Design Review'])
      );
      expect(result.conflicts[0].time).toContain('10:30 AM – 11:00 AM');
    });

    it('detectConflicts should detect conflict between overnight task and morning task', () => {
      const tasks: Task[] = [
        {
          id: 't_night',
          title: 'Night Shift',
          date: '2026-10-31',
          startTime: '23:00',
          endTime: '07:00',
          isOvernight: true,
          priority: 'high',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't_late',
          title: 'Late Midnight Check',
          date: '2026-10-31',
          startTime: '23:30',
          endTime: '23:50',
          priority: 'low',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const result = taskService.detectConflicts(tasks, [], [], '2026-10-31');
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBe(1);
    });

    it('detectConflicts should not flag back-to-back non-overlapping tasks', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          title: 'Morning Block',
          date: '2026-10-31',
          startTime: '09:00',
          endTime: '10:00',
          priority: 'medium',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't2',
          title: 'Afternoon Block',
          date: '2026-10-31',
          startTime: '10:00',
          endTime: '11:00',
          priority: 'medium',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const result = taskService.detectConflicts(tasks, [], [], '2026-10-31');
      expect(result.hasConflict).toBe(false);
      expect(result.conflicts.length).toBe(0);
    });

    it('detectConflicts should safely handle null or non-array inputs without throwing', () => {
      const result = taskService.detectConflicts(null as any, undefined as any, null as any);
      expect(result.hasConflict).toBe(false);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('7. Query Facades & Backlog Tasks', () => {
    it('getBacklogTasks should return tasks with empty date', async () => {
      await taskService.createTask({
        title: 'Backlog Idea 1',
        date: '',
      });
      await taskService.createTask({
        title: 'Dated Task',
        date: '2026-10-31',
      });

      const backlog = await taskService.getBacklogTasks();
      expect(backlog.length).toBe(1);
      expect(backlog[0].title).toBe('Backlog Idea 1');
    });

    it('getTasksByCategory and searchTasks should filter and search correctly', async () => {
      await taskService.createTask({
        title: 'Database Optimization',
        date: '2026-10-31',
        categoryId: 'cat_tech',
      });
      await taskService.createTask({
        title: 'Grocery Shopping',
        date: '2026-10-31',
        categoryId: 'cat_personal',
      });

      const techTasks = await taskService.getTasksByCategory('cat_tech');
      expect(techTasks.length).toBe(1);
      expect(techTasks[0].title).toBe('Database Optimization');

      const searched = await taskService.searchTasks('Grocery');
      expect(searched.length).toBe(1);
      expect(searched[0].title).toBe('Grocery Shopping');
    });

    it('rescheduleTask should clear endTime in database when new startTime exceeds existing endTime', async () => {
      const task = await taskService.createTask({
        title: 'Interview',
        date: '2026-10-31',
        startTime: '10:00',
        endTime: '11:00',
        isOvernight: false,
      });

      // Reschedule to 12:00 without specifying new endTime -> should invalidate and clear old 11:00 endTime
      const rescheduled = await taskService.rescheduleTask(task.id, '2026-11-01', '12:00');
      expect(rescheduled).not.toBeNull();
      expect(rescheduled?.startTime).toBe('12:00');
      expect(rescheduled?.endTime).toBeUndefined();

      // Verify directly from repository that database field is null
      const reloaded = await taskService.getTaskById(task.id);
      expect(reloaded?.endTime).toBeUndefined();
    });

    it('getTasksByDateRange should handle inverted date order seamlessly', async () => {
      await taskService.createTask({
        title: 'Event in range',
        date: '2026-11-03',
      });

      const tasks = await taskService.getTasksByDateRange('2026-11-05', '2026-11-01');
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Event in range');
    });

    it('detectConflicts should respect calendar event explicit endTime', () => {
      const events: CalendarEvent[] = [
        {
          id: 'ev1',
          title: 'Board Meeting',
          date: '2026-10-31',
          time: '14:00',
          endTime: '16:00',
          ringAlarm: false,
          status: 'active',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const tasks: Task[] = [
        {
          id: 't1',
          title: 'Design Review',
          date: '2026-10-31',
          startTime: '15:15',
          endTime: '15:45',
          priority: 'high',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
      ];

      // Overlap occurs at 15:15 - 15:45 (which would be missed if hardcoded to 45 mins from 14:00)
      const result = taskService.detectConflicts(tasks, events, [], '2026-10-31');
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBe(1);
      expect([result.conflicts[0].itemA, result.conflicts[0].itemB]).toEqual(
        expect.arrayContaining(['Design Review', expect.stringContaining('Board Meeting')])
      );
    });

    it('detectConflicts should respect task estimatedMinutes when endTime is missing', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          title: 'Deep Coding Session',
          date: '2026-10-31',
          startTime: '09:00',
          estimatedMinutes: 120, // 09:00 to 11:00
          priority: 'high',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't2',
          title: 'Standup Sync',
          date: '2026-10-31',
          startTime: '10:00',
          endTime: '10:30',
          priority: 'medium',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const result = taskService.detectConflicts(tasks, [], [], '2026-10-31');
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBe(1);
    });

    it('monthly recurrence should preserve monthDay anchor across month boundaries', async () => {
      const task = await taskService.createTask({
        title: 'Monthly Rent Payment',
        date: '2027-01-31',
        recurrenceRule: {
          type: 'monthly',
          interval: 1,
        },
      });

      // Complete Jan 31, 2027 -> spawns Feb 28, 2027
      const febSpawned = await taskService.completeTask(task.id);
      expect(febSpawned).not.toBeNull();

      const seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      const febTask = seriesTasks.find((t) => t.id !== task.id);
      expect(febTask).toBeDefined();
      expect(febTask?.date).toBe('2027-02-28');
      expect(febTask?.recurrenceRule?.monthDay).toBe(31);

      // Complete Feb 28, 2027 -> should spawn Mar 31, 2027 (recovering the 31st, not drifting to 28th)
      await taskService.completeTask(febTask!.id);
      const updatedSeries = await taskService.getTasksBySeriesId(task.seriesId!);
      const marTask = updatedSeries.find((t) => t.date.startsWith('2027-03'));
      expect(marTask).toBeDefined();
      expect(marTask?.date).toBe('2027-03-31');
    });

    it('getUpcomingTask should fallback to overdue task when today has no pending tasks', async () => {
      // Create an overdue task from yesterday
      const yesterday = format(addDays(new Date(), -1), 'yyyy-MM-dd');
      await taskService.createTask({
        title: 'Overdue Project Report',
        date: yesterday,
        priority: 'high',
      });

      const upcoming = await taskService.getUpcomingTask();
      expect(upcoming).not.toBeNull();
      expect(upcoming?.title).toBe('Overdue Project Report');
    });

    it('createTask and updateTask should reject invalid non-empty time formats', async () => {
      await expect(
        taskService.createTask({
          title: 'Malformed Time Task',
          date: '2026-10-31',
          startTime: 'not-a-valid-time',
        })
      ).rejects.toThrow('Invalid start time format.');

      const created = await taskService.createTask({
        title: 'Valid Task',
        date: '2026-10-31',
      });

      await expect(
        taskService.updateTask(created.id, {
          endTime: '29:99',
        })
      ).rejects.toThrow('Invalid end time format.');
    });

    it('detectConflicts should detect spillover conflict from yesterdays overnight task into today', () => {
      const today = '2026-10-31';
      const yesterday = '2026-10-30';
      const tasks: Task[] = [
        {
          id: 't_yest_overnight',
          title: 'Night Shift',
          date: yesterday,
          startTime: '23:00',
          endTime: '07:00', // Spills over from 00:00 to 07:00 on today
          isOvernight: true,
          status: 'pending',
          priority: 'high',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't_today_morning',
          title: 'Early Morning Standup',
          date: today,
          startTime: '06:00',
          endTime: '06:45',
          status: 'pending',
          priority: 'medium',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const result = taskService.detectConflicts(tasks, [], [], today);
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBe(1);
      expect([result.conflicts[0].itemA, result.conflicts[0].itemB]).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Early Morning Standup'),
          expect.stringContaining('Night Shift'),
        ])
      );
    });

    it('skipRecurringTask should not spawn duplicates if task is already completed', async () => {
      const task = await taskService.createTask({
        title: 'Weekly Sync',
        date: '2026-10-31',
        recurrenceRule: {
          type: 'weekly',
          interval: 1,
        },
      });

      // Complete once (spawns 1 future recurrence)
      await taskService.completeTask(task.id);
      let seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(2);

      // Attempting to skip an already completed task should not spawn another
      await taskService.skipRecurringTask(task.id);
      seriesTasks = await taskService.getTasksBySeriesId(task.seriesId!);
      expect(seriesTasks.length).toBe(2);
    });
  });
});
