import { taskService } from '../src/services/tasks/TaskService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { habitService } from '../src/services/habits/HabitService';
import { habitRepository } from '../src/database/repositories/HabitRepository';
import { statisticsService } from '../src/services/statistics/StatisticsService';
import { backupService } from '../src/services/backup/BackupService';
import { notificationService } from '../src/services/notifications/NotificationService';
import { getDatabase } from '../src/database/connection';
import { computeAgeStats } from '../src/components/ProfileModal';
import { goalService } from '../src/services/goals/GoalService';
import { goalRepository } from '../src/database/repositories/GoalRepository';
import { noteRepository } from '../src/database/repositories/NoteRepository';
import { format, subDays, addDays } from 'date-fns';

describe('LifePlanner Local-First Core Test Suite', () => {
  beforeAll(async () => {
    // Initialize database migrations and seeds
    await getDatabase();
  });

  describe('1. Task Management & Validation', () => {
    it('should create a task with valid fields and schedule reminder', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Study React Native',
        description: 'Focus on native modules and local SQLite',
        date: today,
        startTime: '18:00',
        endTime: '19:00',
        priority: 'high',
        reminderMinutes: 10,
      });

      expect(task).toBeDefined();
      expect(task.title).toBe('Study React Native');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('pending');
      expect(task.reminderMinutes).toBe(10);

      // Verify in database
      const found = await taskRepository.findById(task.id);
      expect(found).not.toBeNull();
      expect(found?.title).toBe('Study React Native');
    });

    it('should reject invalid task data (empty title)', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      await expect(
        taskService.createTask({
          title: '',
          date: today,
        })
      ).rejects.toThrow('Task title cannot be empty.');
    });

    it('should reject invalid time range (end time before start time)', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      await expect(
        taskService.createTask({
          title: 'Invalid Time Task',
          date: today,
          startTime: '18:00',
          endTime: '17:00',
        })
      ).rejects.toThrow('End time cannot be earlier than start time.');
    });

    it('should accept valid AM to PM time ranges without false error', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Morning to Afternoon Task',
        date: today,
        startTime: '09:00 AM',
        endTime: '02:00 PM',
      });
      expect(task).toBeDefined();
      expect(task.startTime).toBe('09:00 AM');
      expect(task.endTime).toBe('02:00 PM');
    });

    it('should mark task completed and record completedAt timestamp', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Exercise Session',
        date: today,
        startTime: '07:00',
      });

      const completed = await taskService.completeTask(task.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).toBeDefined();

      // Verify uncomplete
      const uncompleted = await taskService.uncompleteTask(task.id);
      expect(uncompleted?.status).toBe('pending');
      expect(uncompleted?.completedAt).toBeUndefined();
    });

    it('should correctly detect overdue tasks', async () => {
      // Create a task yesterday
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Past Unfinished Task',
        date: yesterday,
        startTime: '10:00',
      });

      const overdue = await taskService.getOverdueTasks();
      expect(overdue.some((t) => t.id === task.id)).toBe(true);
    });

    it('should snooze a task and persist snoozeUntil', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const task = await taskService.createTask({
        title: 'Snooze Test Task',
        date: today,
        startTime: '12:00',
      });

      const snoozed = await taskService.snoozeTask(task.id, 15);
      expect(snoozed?.snoozeUntil).toBeDefined();
    });
  });

  describe('2. Habits & Streaks Calculation', () => {
    it('should create a habit and calculate consecutive streaks', async () => {
      const habit = await habitService.createHabit({
        name: 'Daily Meditation',
        icon: '🧘',
        color: '#10B981',
        recurrenceRule: { type: 'daily' },
      });

      expect(habit.id).toBeDefined();
      expect(habit.name).toBe('Daily Meditation');

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const dayBeforeYesterdayStr = format(subDays(new Date(), 2), 'yyyy-MM-dd');

      // Log 3 consecutive days
      await habitRepository.logHabit(habit.id, dayBeforeYesterdayStr, true);
      await habitRepository.logHabit(habit.id, yesterdayStr, true);
      await habitRepository.logHabit(habit.id, todayStr, true);

      const list = await habitService.getHabitsWithStreaks();
      const meditation = list.find((h) => h.id === habit.id);
      expect(meditation).toBeDefined();
      expect(meditation?.currentStreak).toBe(3);
      expect(meditation?.bestStreak).toBeGreaterThanOrEqual(3);
      expect(meditation?.completedToday).toBe(true);
    });
  });

  describe('3. Local Productivity Statistics', () => {
    it('should compute productivity rates on-device without remote analytics', async () => {
      const stats = await statisticsService.getStats();
      expect(stats).toBeDefined();
      expect(stats.tasksCompleted).toBeGreaterThanOrEqual(0);
      expect(stats.completionPercentage).toBeGreaterThanOrEqual(0);
      expect(stats.completionPercentage).toBeLessThanOrEqual(100);
      expect(stats.weeklyCompletionRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('4. Versioned Local Backup & Restore', () => {
    it('should export all SQLite data into a versioned JSON format', async () => {
      const backupJson = await backupService.exportBackup();
      expect(backupJson).toBeDefined();

      const parsed = JSON.parse(backupJson);
      expect(parsed.version).toBe(1);
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(Array.isArray(parsed.categories)).toBe(true);
      expect(Array.isArray(parsed.habits)).toBe(true);
      expect(parsed.createdAt).toBeDefined();
    });

    it('should safely import backup data and recreate state', async () => {
      const backupJson = await backupService.exportBackup();
      const result = await backupService.importBackup(backupJson);
      expect(result.success).toBe(true);
    });

    it('should preserve and restore settings in backup', async () => {
      const backupJson = await backupService.exportBackup();
      const parsed = JSON.parse(backupJson);
      expect(parsed.settings).toBeDefined();
      expect(parsed.settings.notificationsEnabled).toBeDefined();
    });
  });

  describe('5. Bullet Notes & Checklist Parsing', () => {
    it('should generate deterministic bullet IDs without random regeneration', () => {
      const { parseBulletNotes } = require('../src/utils/bulletNotes');
      const text = '• Item 1\n• Item 2\n[x] Completed Item';
      const parsed1 = parseBulletNotes(text);
      const parsed2 = parseBulletNotes(text);

      expect(parsed1[0].id).toBe('bullet_0');
      expect(parsed2[0].id).toBe('bullet_0');
      expect(parsed1[2].completed).toBe(true);
    });
  });

  describe('6. Reboot Recovery', () => {
    it('should execute restoreAllReminders without error', async () => {
      await expect(notificationService.restoreAllReminders()).resolves.not.toThrow();
    });
  });

  describe('7. Atomic Transactions & Rollback Protection', () => {
    it('should rollback in-memory state on transaction error', async () => {
      const db = await getDatabase();
      const initialCountRes = await db.execute('SELECT COUNT(*) as count FROM tasks');
      const countBefore = initialCountRes.rows[0].count;

      await expect(
        db.transaction(async (tx) => {
          await tx.execute(
            'INSERT INTO tasks (id, title, date, status, priority, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['temp_task_tx', 'Tx Test Task', '2026-10-10', 'pending', 'medium', new Date().toISOString(), new Date().toISOString()]
          );
          throw new Error('Simulated failure during transaction');
        })
      ).rejects.toThrow('Simulated failure during transaction');

      const countAfterRes = await db.execute('SELECT COUNT(*) as count FROM tasks');
      expect(countAfterRes.rows[0].count).toBe(countBefore);
    });
  });

  describe('8. Profile Age Validation', () => {
    it('should reject future birth dates and return null for stats', () => {
      const futureStats = computeAgeStats('2099-01-01');
      expect(futureStats).toBeNull();

      const validStats = computeAgeStats('2000-01-01');
      expect(validStats).not.toBeNull();
      expect(validStats?.years).toBeGreaterThan(0);
    });
  });

  describe('9. Schedule Conflict Detection with End Time', () => {
    it('should accurately detect overlapping tasks with explicit end times', () => {
      const taskA: any = {
        id: 't_a',
        title: 'Meeting A',
        startTime: '10:00',
        endTime: '11:00',
        status: 'pending',
      };
      const taskB: any = {
        id: 't_b',
        title: 'Meeting B',
        startTime: '10:30',
        endTime: '11:30',
        status: 'pending',
      };
      const taskC: any = {
        id: 't_c',
        title: 'Meeting C',
        startTime: '12:00',
        endTime: '13:00',
        status: 'pending',
      };

      const result = taskService.detectConflicts([taskA, taskB, taskC], []);
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].itemA).toBe('Meeting A');
      expect(result.conflicts[0].itemB).toBe('Meeting B');
    });
  });

  describe('10. Auto-Spawning Recurring Tasks', () => {
    it('should automatically spawn next daily recurrence on completion', async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

      const recurringTask = await taskService.createTask({
        title: 'Daily Standup Meeting',
        date: today,
        recurrenceRule: {
          type: 'daily',
          interval: 1,
        },
      });

      expect(recurringTask.recurrenceRule?.type).toBe('daily');

      // Complete the task
      const completed = await taskService.completeTask(recurringTask.id);
      expect(completed?.status).toBe('completed');

      // Check that a new pending task was spawned for tomorrow
      const tomorrowTasks = await taskRepository.findByDate(tomorrow);
      const nextSpawned = tomorrowTasks.find(
        (t) => t.title === 'Daily Standup Meeting' && t.status === 'pending'
      );
      expect(nextSpawned).toBeDefined();
      expect(nextSpawned?.date).toBe(tomorrow);
      expect(nextSpawned?.recurrenceRule?.type).toBe('daily');
    });
  });

  describe('11. Goal Management & Linking', () => {
    it('should create goal, link task, and compute progress correctly', async () => {
      const goal = await goalService.createGoal({
        title: 'Master React Native Architecture',
        category: 'Learning',
      });
      expect(goal).toBeDefined();
      expect(goal.title).toBe('Master React Native Architecture');
      expect(goal.progress).toBe(0);

      const task = await taskService.createTask({
        title: 'Complete DB transactions lesson',
        date: format(new Date(), 'yyyy-MM-dd'),
      });

      // Link task to goal
      await goalService.linkTaskToGoal(goal.id, task.id);
      const linkedTasks = await goalService.getGoalTasks(goal.id);
      expect(linkedTasks.length).toBe(1);
      expect(linkedTasks[0].id).toBe(task.id);

      // Verify goal progress updates to 100% when task is completed
      await taskService.completeTask(task.id);
      const updatedGoal = await goalRepository.findById(goal.id);
      expect(updatedGoal?.progress).toBe(100);

      // Clean up goal
      const deleted = await goalService.deleteGoal(goal.id);
      expect(deleted).toBe(true);
    });
  });

  describe('12. Multi-Field Task Search', () => {
    it('should find tasks by notes, description, or title using keyword search', async () => {
      const uniqueKeyword = `kw_${Date.now()}`;
      const taskWithNotes = await taskService.createTask({
        title: 'Review Documentation',
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: `Contains unique secret info: ${uniqueKeyword}`,
      });

      const results = await taskRepository.search(uniqueKeyword);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((t) => t.id === taskWithNotes.id)).toBe(true);
    });
  });

  describe('13. Notes Repository & Comprehensive Entity Types', () => {
    it('should create and retrieve notes across all entity types with findAll', async () => {
      const now = new Date().toISOString();
      const note1 = await noteRepository.create({
        id: `note_gen_${Date.now()}`,
        entityType: 'general',
        title: 'General Idea',
        content: 'Random inspiration note',
        createdAt: now,
        updatedAt: now,
      });

      const note2 = await noteRepository.create({
        id: `note_task_${Date.now()}`,
        entityType: 'task',
        entityId: 'task_123',
        title: 'Task Note',
        content: 'Specific note for task',
        createdAt: now,
        updatedAt: now,
      });

      const allNotes = await noteRepository.findAll();
      expect(allNotes.some((n) => n.id === note1.id)).toBe(true);
      expect(allNotes.some((n) => n.id === note2.id)).toBe(true);

      const generalOnly = await noteRepository.findByEntity('general');
      expect(generalOnly.some((n) => n.id === note1.id)).toBe(true);
      expect(generalOnly.some((n) => n.id === note2.id)).toBe(false);
    });
  });

  describe('14. Goal Tasks Link Persistence Across Backup & Restore', () => {
    it('should serialize and restore goal_tasks links in backup', async () => {
      const goal = await goalService.createGoal({
        title: 'Backup Link Test Goal',
      });
      const task = await taskService.createTask({
        title: 'Backup Link Test Task',
        date: format(new Date(), 'yyyy-MM-dd'),
      });

      await goalService.linkTaskToGoal(goal.id, task.id);
      const linksBefore = await goalRepository.getAllLinks();
      expect(linksBefore.some((l) => l.goalId === goal.id && l.taskId === task.id)).toBe(true);

      const backupJson = await backupService.exportBackup();
      const parsed = JSON.parse(backupJson);
      expect(parsed.goalTasks).toBeDefined();
      expect(parsed.goalTasks.some((l: any) => l.goalId === goal.id && l.taskId === task.id)).toBe(true);

      // Restore backup and verify link still exists
      const importResult = await backupService.importBackup(backupJson);
      expect(importResult.success).toBe(true);

      const linksAfter = await goalRepository.getAllLinks();
      expect(linksAfter.some((l) => l.goalId === goal.id && l.taskId === task.id)).toBe(true);
    });
  });
});

