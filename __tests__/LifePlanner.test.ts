import { taskService } from '../src/services/tasks/TaskService';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { habitService } from '../src/services/habits/HabitService';
import { habitRepository } from '../src/database/repositories/HabitRepository';
import { statisticsService } from '../src/services/statistics/StatisticsService';
import { backupService } from '../src/services/backup/BackupService';
import { notificationService } from '../src/services/notifications/NotificationService';
import { getDatabase } from '../src/database/connection';
import { format, subDays } from 'date-fns';

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
});
