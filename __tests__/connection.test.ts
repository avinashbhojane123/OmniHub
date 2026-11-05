import {
  getDatabase,
  isDatabaseReady,
  DatabaseManager,
  InMemoryDatabaseAdapter,
  DatabaseAdapter,
} from '../src/database/connection';
import { SETTINGS_KEYS } from '../src/constants/settingsKeys';

describe('Database Connection & Adapter Suite (connection.ts)', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    await DatabaseManager.getInstance().close();
    db = await getDatabase();
  });

  afterEach(async () => {
    await DatabaseManager.getInstance().close();
  });

  describe('1. DatabaseManager & Lifecycle', () => {
    it('should initialize and return singleton database adapter', async () => {
      expect(db).toBeDefined();
      expect(typeof db.execute).toBe('function');
      expect(isDatabaseReady()).toBe(true);

      const db2 = await getDatabase();
      expect(db2).toBe(db);
    });

    it('should handle concurrent getDatabase() calls safely without race conditions', async () => {
      await DatabaseManager.getInstance().close();
      expect(isDatabaseReady()).toBe(false);

      const [adapter1, adapter2, adapter3] = await Promise.all([
        getDatabase(),
        getDatabase(),
        getDatabase(),
      ]);

      expect(adapter1).toBe(adapter2);
      expect(adapter2).toBe(adapter3);
      expect(isDatabaseReady()).toBe(true);
    });

    it('should reset state cleanly on close()', async () => {
      expect(isDatabaseReady()).toBe(true);
      await DatabaseManager.getInstance().close();
      expect(isDatabaseReady()).toBe(false);
      expect(DatabaseManager.getInstance().getAdapterSync()).toBeNull();
    });
  });

  describe('2. In-Memory Database Execution & Param Sanitization', () => {
    it('executeSync should execute queries synchronously matching execute', () => {
      const adapter = new InMemoryDatabaseAdapter();
      expect(typeof adapter.executeSync).toBe('function');

      const res = adapter.executeSync!('SELECT COUNT(*) as count FROM categories');
      expect(res.rows[0].count).toBe(7);
    });

    it('should sanitize parameters: undefined to null, boolean to integer, Date to ISO string', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      const testDate = new Date('2026-11-01T12:00:00.000Z');

      await adapter.execute(
        'INSERT INTO tasks (id, title, description, isLoudAlarm, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        ['test-sanitize', 'Sanitize Task', undefined, true, testDate, testDate]
      );

      const res = await adapter.execute('SELECT * FROM tasks WHERE id = ?', ['test-sanitize']);
      expect(res.rows.length).toBe(1);
      const row = res.rows[0];
      expect(row.description).toBeNull();
      expect(row.isLoudAlarm).toBe(1);
      expect(row.createdAt).toBe('2026-11-01T12:00:00.000Z');
    });

    it('should handle PRAGMA table_info accurately', async () => {
      const res = await db.execute('PRAGMA table_info(tasks);');
      expect(res.rows.length).toBeGreaterThan(0);
      const colNames = res.rows.map((r: any) => r.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('seriesId');
      expect(colNames).toContain('notes');
    });
  });

  describe('3. Targeted SQL Operations (INSERT, UPDATE, DELETE)', () => {
    it('should handle composite key INSERT OR IGNORE / REPLACE for habit_logs', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      await adapter.execute(
        'INSERT INTO habit_logs (id, habitId, date, completed) VALUES (?, ?, ?, ?)',
        ['log-1', 'h-1', '2026-11-01', 1]
      );

      // INSERT OR IGNORE should ignore duplicate (habitId, date)
      await adapter.execute(
        'INSERT OR IGNORE INTO habit_logs (id, habitId, date, completed) VALUES (?, ?, ?, ?)',
        ['log-2', 'h-1', '2026-11-01', 0]
      );
      let logs = await adapter.execute('SELECT * FROM habit_logs WHERE habitId = ? AND date = ?', ['h-1', '2026-11-01']);
      expect(logs.rows.length).toBe(1);
      expect(logs.rows[0].id).toBe('log-1');

      // INSERT OR REPLACE should update existing row
      await adapter.execute(
        'INSERT OR REPLACE INTO habit_logs (id, habitId, date, completed) VALUES (?, ?, ?, ?)',
        ['log-1', 'h-1', '2026-11-01', 0]
      );
      logs = await adapter.execute('SELECT * FROM habit_logs WHERE habitId = ? AND date = ?', ['h-1', '2026-11-01']);
      expect(logs.rows.length).toBe(1);
      expect(logs.rows[0].completed).toBe(0);
    });

    it('DELETE FROM keep_notes WHERE isTrashed = 1 should ONLY delete trashed notes', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      await adapter.execute(
        'INSERT INTO keep_notes (id, title, isTrashed) VALUES (?, ?, ?)',
        ['note-active', 'Active Note', 0]
      );
      await adapter.execute(
        'INSERT INTO keep_notes (id, title, isTrashed) VALUES (?, ?, ?)',
        ['note-trashed', 'Trashed Note', 1]
      );

      const delRes = await adapter.execute('DELETE FROM keep_notes WHERE isTrashed = 1');
      expect(delRes.rowsAffected).toBe(1);

      const remaining = await adapter.execute('SELECT * FROM keep_notes');
      expect(remaining.rows.length).toBe(1);
      expect(remaining.rows[0].id).toBe('note-active');
    });

    it('DELETE FROM pending_sync_queue should delete matching itemId properly', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      await adapter.execute(
        'INSERT INTO pending_sync_queue (id, tabName, entityType, op, itemId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        ['q-1', 'Tasks', 'task', 'upsert', 'task-100', '2026-11-01T10:00:00Z']
      );
      await adapter.execute(
        'INSERT INTO pending_sync_queue (id, tabName, entityType, op, itemId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        ['q-2', 'Tasks', 'task', 'upsert', 'task-200', '2026-11-01T10:00:00Z']
      );

      await adapter.execute('DELETE FROM pending_sync_queue WHERE itemId = ?', ['task-100']);
      const remaining = await adapter.execute('SELECT * FROM pending_sync_queue');
      expect(remaining.rows.length).toBe(1);
      expect(remaining.rows[0].itemId).toBe('task-200');
    });

    it('DELETE with IN clause should delete multiple records correctly', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      await adapter.execute('INSERT INTO tasks (id, title) VALUES (?, ?)', ['t-1', 'Task 1']);
      await adapter.execute('INSERT INTO tasks (id, title) VALUES (?, ?)', ['t-2', 'Task 2']);
      await adapter.execute('INSERT INTO tasks (id, title) VALUES (?, ?)', ['t-3', 'Task 3']);

      await adapter.execute('DELETE FROM tasks WHERE id IN (?, ?)', ['t-1', 't-3']);
      const remaining = await adapter.execute('SELECT * FROM tasks');
      expect(remaining.rows.length).toBe(1);
      expect(remaining.rows[0].id).toBe('t-2');
    });

    it('should filter calendar_events by date >= ?, status = active, and ringAlarm = 1', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      await adapter.execute(
        'INSERT INTO calendar_events (id, title, date, time, status, ringAlarm) VALUES (?, ?, ?, ?, ?, ?)',
        ['ev-1', 'Meeting', '2026-11-02', '10:00', 'active', 1]
      );
      await adapter.execute(
        'INSERT INTO calendar_events (id, title, date, time, status, ringAlarm) VALUES (?, ?, ?, ?, ?, ?)',
        ['ev-2', 'Dismissed Event', '2026-11-02', '11:00', 'dismissed', 1]
      );
      await adapter.execute(
        'INSERT INTO calendar_events (id, title, date, time, status, ringAlarm) VALUES (?, ?, ?, ?, ?, ?)',
        ['ev-3', 'Silent Event', '2026-11-02', '12:00', 'active', 0]
      );

      const res = await adapter.execute(
        "SELECT * FROM calendar_events WHERE date >= ? AND status = 'active' AND ringAlarm = 1 ORDER BY date ASC, time ASC",
        ['2026-11-01']
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].id).toBe('ev-1');
    });

    it('should strip SQL comments and execute statements cleanly', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      const res = await adapter.execute(`
        -- Single-line comment here
        SELECT COUNT(*) as count FROM categories;
      `);
      expect(res.rows[0].count).toBe(7);
    });
  });

  describe('4. Transaction Isolation & Rollback', () => {
    it('transaction rollback should restore clean in-memory state including deep objects', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      await adapter.execute(
        'INSERT INTO keep_notes (id, title, labels) VALUES (?, ?, ?)',
        ['kn-1', 'Original Note', JSON.stringify(['label1'])]
      );

      try {
        await adapter.transaction(async (tx) => {
          await tx.execute('UPDATE keep_notes SET title = ? WHERE id = ?', ['Mutated Title', 'kn-1']);
          await tx.execute('INSERT INTO tasks (id, title) VALUES (?, ?)', ['tx-task', 'Will Fail']);
          throw new Error('Simulated abort');
        });
      } catch {
        // Expected abort
      }

      const noteRes = await adapter.execute('SELECT * FROM keep_notes WHERE id = ?', ['kn-1']);
      expect(noteRes.rows[0].title).toBe('Original Note');

      const taskRes = await adapter.execute('SELECT * FROM tasks WHERE id = ?', ['tx-task']);
      expect(taskRes.rows.length).toBe(0);
    });

    it('transaction commit should persist all atomic operations', async () => {
      const adapter = new InMemoryDatabaseAdapter();
      await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO tasks (id, title) VALUES (?, ?)', ['tx-commit-1', 'Task Commit 1']);
        await tx.execute('INSERT INTO tasks (id, title) VALUES (?, ?)', ['tx-commit-2', 'Task Commit 2']);
      });

      const res = await adapter.execute('SELECT * FROM tasks WHERE id LIKE ?', ['tx-commit%']);
      expect(res.rows.length).toBe(2);
    });
  });
});

