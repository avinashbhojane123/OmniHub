import { backupService } from '../src/services/backup/BackupService';
import { getDatabase } from '../src/database/connection';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { categoryRepository } from '../src/database/repositories/CategoryRepository';
import { habitRepository } from '../src/database/repositories/HabitRepository';

describe('BackupService Foreign Key & Restore Resilience Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  it('should cleanly restore backup when task has non-existent categoryId without foreign key errors', async () => {
    const backupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      categories: [], // Empty categories
      tasks: [
        {
          id: 'task-fk-test-1',
          title: 'Task with non-existent category',
          date: '2026-10-25',
          startTime: '09:00',
          priority: 'high',
          status: 'pending',
          categoryId: 'non-existent-cat-uuid',
          categoryName: 'Custom Project',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      habits: [],
      habitLogs: [],
      notes: [],
      keepNotes: [],
      calendarEvents: [],
      settings: {},
    };

    const res = await backupService.importBackup(JSON.stringify(backupPayload), 'replace');
    expect(res.success).toBe(true);

    const task = await taskRepository.findById('task-fk-test-1');
    expect(task).not.toBeNull();
    expect(task?.title).toBe('Task with non-existent category');
  });

  it('should handle task with empty string categoryId without foreign key violation', async () => {
    const backupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      categories: [],
      tasks: [
        {
          id: 'task-fk-test-2',
          title: 'Task with empty string categoryId',
          date: '2026-10-25',
          priority: 'medium',
          status: 'pending',
          categoryId: '', // Empty string should resolve to null
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      habits: [],
      habitLogs: [],
      notes: [],
      keepNotes: [],
      calendarEvents: [],
      settings: {},
    };

    const res = await backupService.importBackup(JSON.stringify(backupPayload), 'replace');
    expect(res.success).toBe(true);

    const task = await taskRepository.findById('task-fk-test-2');
    expect(task).not.toBeNull();
    expect(task?.categoryId).toBeUndefined();
  });

  it('should skip orphan habit logs without throwing FOREIGN KEY constraint failed', async () => {
    const backupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      categories: [],
      tasks: [],
      habits: [
        {
          id: 'habit-real-1',
          name: 'Morning Run',
          icon: 'run',
          color: '#10B981',
          recurrenceRule: { type: 'daily' },
          target: 1,
          createdAt: new Date().toISOString(),
        },
      ],
      habitLogs: [
        {
          id: 'log-orphan',
          habitId: 'non-existent-habit-id',
          date: '2026-10-25',
          completed: true,
          value: 1,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'log-valid',
          habitId: 'habit-real-1',
          date: '2026-10-25',
          completed: true,
          value: 1,
          createdAt: new Date().toISOString(),
        },
      ],
      notes: [],
      keepNotes: [],
      calendarEvents: [],
      settings: {},
    };

    const res = await backupService.importBackup(JSON.stringify(backupPayload), 'replace');
    expect(res.success).toBe(true);

    const habit = await habitRepository.findById('habit-real-1');
    expect(habit).not.toBeNull();
  });

  it('should map category by categoryName if categoryId does not match', async () => {
    const backupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      categories: [
        {
          id: 'cat-my-work',
          name: 'Work',
          color: '#3B82F6',
          icon: 'briefcase',
          createdAt: new Date().toISOString(),
        },
      ],
      tasks: [
        {
          id: 'task-fk-test-3',
          title: 'Work Project Sprint',
          date: '2026-10-25',
          priority: 'high',
          status: 'pending',
          categoryId: 'unknown-id',
          categoryName: 'Work',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      habits: [],
      habitLogs: [],
      notes: [],
      keepNotes: [],
      calendarEvents: [],
      settings: {},
    };

    const res = await backupService.importBackup(JSON.stringify(backupPayload), 'replace');
    expect(res.success).toBe(true);

    const task = await taskRepository.findById('task-fk-test-3');
    expect(task).not.toBeNull();
    const category = await categoryRepository.findById(task?.categoryId || '');
    expect(category?.name.toLowerCase()).toBe('work');
  });
});
