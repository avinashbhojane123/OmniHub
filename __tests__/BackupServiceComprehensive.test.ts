import { backupService, BackupService } from '../src/services/backup/BackupService';
import { getDatabase } from '../src/database/connection';
import { taskRepository } from '../src/database/repositories/TaskRepository';
import { categoryRepository } from '../src/database/repositories/CategoryRepository';
import { habitRepository } from '../src/database/repositories/HabitRepository';
import { movieRepository } from '../src/database/repositories/MovieRepository';
import { batteryRepository } from '../src/database/repositories/BatteryRepository';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { syncEventBus } from '../src/services/backup/SyncEventBus';

describe('BackupService Comprehensive Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(async () => {
    await backupService.clearAllData();
  });

  it('1. should export and import complete backup including movieBookmarks and batterySessions', async () => {
    // 1. Seed movie bookmark
    await movieRepository.save({
      id: 'bm-test-101',
      tmdbId: 550,
      title: 'Fight Club',
      overview: 'An insomniac office worker...',
      voteAverage: 8.4,
      releaseDate: '1999-10-15',
      genres: ['Drama'],
      runtime: 139,
      isWatched: false,
      isTv: false,
      savedAt: '2026-11-01T10:00:00.000Z',
    });

    // 2. Seed battery session
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO battery_sessions (
        id, startTime, endTime, startLevel, endLevel, gained, durationMinutes,
        chargingType, peakTemperature, peakWattage, avgSpeedPerHour, completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'session-test-202',
        '2026-11-01T08:00:00.000Z',
        '2026-11-01T08:45:00.000Z',
        20,
        80,
        60,
        45,
        'AC',
        36.5,
        18.5,
        80.0,
        1,
      ]
    );

    // 3. Seed a task
    await taskRepository.create({
      id: 'task-test-303',
      title: 'Export Verification Task',
      date: '2026-11-01',
      priority: 'high',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 4. Export backup
    const exportedJson = await backupService.exportBackup();
    const backupObj = JSON.parse(exportedJson);

    expect(backupObj.version).toBe(1);
    expect(Array.isArray(backupObj.movieBookmarks)).toBe(true);
    expect(backupObj.movieBookmarks.some((b: any) => b.tmdbId === 550)).toBe(true);

    expect(Array.isArray(backupObj.batterySessions)).toBe(true);
    expect(backupObj.batterySessions.some((s: any) => s.id === 'session-test-202')).toBe(true);

    // 5. Clear all data
    await backupService.clearAllData();
    const freshMovies = await movieRepository.findAll();
    expect(freshMovies.length).toBe(0);

    // Default categories must be preserved after clearAllData
    const categoriesAfterClear = await categoryRepository.findAll();
    expect(categoriesAfterClear.length).toBeGreaterThan(0);

    // 6. Import the exported backup in replace mode
    const importRes = await backupService.importBackup(exportedJson, 'replace');
    expect(importRes.success).toBe(true);

    const restoredMovies = await movieRepository.findAll();
    expect(restoredMovies.some((m) => m.tmdbId === 550 && m.title === 'Fight Club')).toBe(true);

    const restoredSessions = await batteryRepository.getRecentSessions(10);
    expect(restoredSessions.some((s) => s.id === 'session-test-202')).toBe(true);

    const restoredTask = await taskRepository.findById('task-test-303');
    expect(restoredTask).not.toBeNull();
    expect(restoredTask?.title).toBe('Export Verification Task');
  });

  it('2. should handle merge mode and respect tombstones for tasks and movie bookmarks', async () => {
    const backupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      tasks: [
        {
          id: 'task-tombstone-target',
          title: 'Obsolete Task',
          date: '2026-11-01',
          priority: 'low',
          status: 'pending',
          updatedAt: '2026-11-01T09:00:00.000Z',
          createdAt: '2026-11-01T09:00:00.000Z',
        },
        {
          id: 'task-live',
          title: 'Live Task',
          date: '2026-11-01',
          priority: 'high',
          status: 'pending',
          updatedAt: '2026-11-01T11:00:00.000Z',
          createdAt: '2026-11-01T11:00:00.000Z',
        },
      ],
      categories: [],
      habits: [],
      habitLogs: [],
      notes: [],
      keepNotes: [],
      calendarEvents: [],
      movieBookmarks: [
        {
          id: 'bm-tombstone-target',
          tmdbId: 999,
          title: 'Deleted Movie',
          savedAt: '2026-11-01T08:00:00.000Z',
        },
      ],
      batterySessions: [],
      settings: {},
      tombstones: [
        {
          id: 'task-tombstone-target',
          entityType: 'task',
          deletedAt: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 'bm-tombstone-target',
          entityType: 'movieBookmark',
          deletedAt: '2026-11-01T10:00:00.000Z',
        },
      ],
    };

    const res = await backupService.importBackup(JSON.stringify(backupPayload), 'merge');
    expect(res.success).toBe(true);

    const liveTask = await taskRepository.findById('task-live');
    expect(liveTask).not.toBeNull();

    const deadTask = await taskRepository.findById('task-tombstone-target');
    expect(deadTask).toBeNull();

    const deadMovie = await movieRepository.findByTmdbId(999);
    expect(deadMovie).toBeNull();
  });

  it('3. should handle corrupted or missing optional fields without throwing', async () => {
    const corruptPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      tasks: [
        {
          id: 'task-resilience-1',
          // Missing title, priority, status, dates
        },
      ],
      // Missing categories, habits, notes, calendarEvents, movieBookmarks, batterySessions
      settings: null,
    };

    const res = await backupService.importBackup(JSON.stringify(corruptPayload), 'replace');
    expect(res.success).toBe(true);

    const task = await taskRepository.findById('task-resilience-1');
    expect(task).not.toBeNull();
    expect(task?.title).toBe('Untitled Task');
    expect(task?.priority).toBe('medium');
    expect(task?.status).toBe('pending');
  });

  it('4. should reject completely invalid JSON or missing required version/tasks array', async () => {
    const invalidJsonRes = await backupService.importBackup('not-valid-json{', 'replace');
    expect(invalidJsonRes.success).toBe(false);

    const missingVersionRes = await backupService.importBackup(
      JSON.stringify({ tasks: [] }),
      'replace'
    );
    expect(missingVersionRes.success).toBe(false);

    const missingTasksRes = await backupService.importBackup(
      JSON.stringify({ version: 1 }),
      'replace'
    );
    expect(missingTasksRes.success).toBe(false);
  });

  it('5. should handle string-encoded JSON fields in keepNotes and tasks without double encoding', async () => {
    const stringEncodedPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      tasks: [
        {
          id: 'task-recurrence-str',
          title: 'Daily Review',
          date: '2026-11-01',
          priority: 'medium',
          status: 'pending',
          recurrenceRule: '{"frequency":"daily"}',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      categories: [],
      habits: [
        {
          id: 'habit-str-rule',
          name: 'Read 20 mins',
          icon: 'book',
          color: '#3B82F6',
          recurrenceRule: '{"type":"daily"}',
          createdAt: new Date().toISOString(),
        },
      ],
      habitLogs: [],
      notes: [],
      keepNotes: [
        {
          id: 'kn-str-labels',
          title: 'Checklist Note',
          content: '',
          type: 'checklist',
          labels: '["work","important"]',
          checklistData: '[{"id":"1","text":"Item 1","completed":false}]',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      calendarEvents: [
        {
          id: 'ev-no-time',
          title: 'All Day Event',
          // date and time omitted to test default fallbacks
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      settings: {},
    };

    const res = await backupService.importBackup(JSON.stringify(stringEncodedPayload), 'replace');
    expect(res.success).toBe(true);

    const task = await taskRepository.findById('task-recurrence-str');
    expect(task).not.toBeNull();
    expect(task?.recurrenceRule).toMatchObject({ frequency: 'daily' });
  });

  it('6. should notify syncEventBus restore listeners on importBackup and clearAllData', async () => {
    let restoreEventsCount = 0;
    const unsubscribe = syncEventBus.subscribeToRestore(() => {
      restoreEventsCount++;
    });

    try {
      const payload = {
        version: 1,
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: 'task-event-bus-test',
            title: 'Event Bus Task',
            priority: 'low',
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        settings: {},
      };

      await backupService.importBackup(JSON.stringify(payload), 'replace');
      expect(restoreEventsCount).toBe(1);

      await backupService.clearAllData();
      expect(restoreEventsCount).toBe(2);
    } finally {
      unsubscribe();
    }
  });

  it('7. should strip UTF-8 BOM on import and maintain singleton instance via getInstance()', async () => {
    expect(BackupService.getInstance()).toBe(backupService);

    const payloadWithBom = '\uFEFF' + JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      tasks: [
        {
          id: 'task-bom-test',
          title: 'BOM Test Task',
          priority: 'medium',
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      settings: {},
    });

    const res = await backupService.importBackup(payloadWithBom, 'replace');
    expect(res.success).toBe(true);

    const task = await taskRepository.findById('task-bom-test');
    expect(task).not.toBeNull();
    expect(task?.title).toBe('BOM Test Task');

    // Also test null or non-string input
    const nullRes = await backupService.importBackup(null as any, 'replace');
    expect(nullRes.success).toBe(false);
  });

  it('8. should handle habit resurrection, string recurrence rules, and prevent phantom note duplication', async () => {
    const db = await getDatabase();

    // 1. Pre-seed a tombstone for habit-101 at 2026-11-01T00:00:00.000Z
    await db.execute(
      'INSERT INTO sync_tombstones (id, entityType, deletedAt) VALUES (?, ?, ?)',
      ['habit-101', 'habit', '2026-11-01T00:00:00.000Z']
    );

    // 2. Import a resurrected habit created at 2026-11-01T05:00:00.000Z with a string recurrenceRule
    const backupJson = JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      tasks: [],
      habits: [
        {
          id: 'habit-101',
          name: 'Resurrected Habit',
          icon: 'fitness',
          color: '#10B981',
          recurrenceRule: 'daily', // string instead of object
          target: 1,
          createdAt: '2026-11-01T05:00:00.000Z',
        },
      ],
      habitLogs: [
        {
          id: 'hl-1',
          habitId: 'habit-101',
          date: '2026-11-01T12:00:00.000Z', // ISO string
          completed: true,
          value: 1,
          createdAt: '2026-11-01T12:00:00.000Z',
        },
      ],
      settings: {},
    });

    const mergeRes = await backupService.importBackup(backupJson, 'merge');
    expect(mergeRes.success).toBe(true);

    // Habit must be resurrected and tombstone deleted
    const restoredHabit = await habitRepository.findById('habit-101');
    expect(restoredHabit).not.toBeNull();
    expect(restoredHabit?.name).toBe('Resurrected Habit');
    expect(restoredHabit?.recurrenceRule).toMatchObject({ type: 'daily' });

    const tombstoneCheck = await db.execute('SELECT * FROM sync_tombstones WHERE id = ?', ['habit-101']);
    expect(tombstoneCheck.rows.length).toBe(0);

    // Habit log date must be normalized to YYYY-MM-DD
    const logCheck = await db.execute('SELECT * FROM habit_logs WHERE habitId = ?', ['habit-101']);
    expect(logCheck.rows.length).toBe(1);
    expect(logCheck.rows[0].date).toBe('2026-11-01');

    // 3. Verify no phantom notes are exported when notes table is empty but keep_notes exist
    await db.execute(
      `INSERT INTO keep_notes (id, title, content, type, color, isPinned, isArchived, isTrashed, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      ['kn-phantom-test', 'Keep Note Only', 'Should not leak to notes table', 'text', 'default', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z']
    );

    const exported = await backupService.exportBackup();
    const parsed = JSON.parse(exported);
    expect(parsed.notes.length).toBe(0);
    expect(parsed.keepNotes.some((k: any) => k.id === 'kn-phantom-test')).toBe(true);
  });
});
