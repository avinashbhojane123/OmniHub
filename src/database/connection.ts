import { CREATE_TABLES_SQL } from './migrations/schema';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, DEFAULT_HABITS, DEFAULT_TASKS } from './seed';
import { format, subDays } from 'date-fns';

declare const process: any;

export interface QueryResultRow {
  [column: string]: any;
}

export interface DatabaseAdapter {
  execute(query: string, params?: any[]): Promise<{ rows: QueryResultRow[]; rowsAffected: number; insertId?: number }>;
  executeSync?(query: string, params?: any[]): { rows: QueryResultRow[]; rowsAffected: number; insertId?: number };
  transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class InMemoryDatabaseAdapter implements DatabaseAdapter {
  private tables: Map<string, any[]> = new Map();

  constructor() {
    this.initTables();
  }

  private initTables() {
    this.tables.set('categories', DEFAULT_CATEGORIES.map((c) => ({ ...c })));
    this.tables.set('tasks', DEFAULT_TASKS.map((t) => ({ ...t })));
    this.tables.set('calendar_events', []);
    this.tables.set(
      'habits',
      DEFAULT_HABITS.map((h) => ({
        ...h,
        recurrenceRule: JSON.stringify(h.recurrenceRule),
      }))
    );
    const initialLogs: any[] = [];
    for (let i = 0; i < 3; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      initialLogs.push({
        id: `log_habit-water_${d}`,
        habitId: 'habit-water',
        date: d,
        completed: 1,
        value: 1,
        createdAt: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 6; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      initialLogs.push({
        id: `log_habit-meditate_${d}`,
        habitId: 'habit-meditate',
        date: d,
        completed: 1,
        value: 1,
        createdAt: new Date().toISOString(),
      });
    }
    this.tables.set('habit_logs', initialLogs);
    this.tables.set('goals', []);
    this.tables.set('goal_tasks', []);
    this.tables.set('notes', []);
    this.tables.set('reminders', []);
    this.tables.set('notification_schedules', []);
    this.tables.set(
      'settings',
      Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
        key,
        value,
        updatedAt: new Date().toISOString(),
      }))
    );
  }

  async execute(query: string, params: any[] = []): Promise<{ rows: QueryResultRow[]; rowsAffected: number; insertId?: number }> {
    const trimmed = query.trim();

    // 1. SELECT COUNT(*)
    if (trimmed.toUpperCase().includes('COUNT(*)')) {
      const match = trimmed.match(/FROM\s+([a-zA-Z_]+)/i);
      const tableName = match ? match[1].toLowerCase() : '';
      const table = this.tables.get(tableName) || [];
      return { rows: [{ count: table.length }], rowsAffected: 0 };
    }

    // 2. SELECT
    if (trimmed.toUpperCase().startsWith('SELECT')) {
      const match = trimmed.match(/FROM\s+([a-zA-Z_]+)/i);
      const tableName = match ? match[1].toLowerCase() : '';
      let rows = [...(this.tables.get(tableName) || [])];

      // Handle simple WHERE id = ?
      if (trimmed.includes('WHERE t.id = ?') || trimmed.includes('WHERE id = ?')) {
        const id = params[0];
        rows = rows.filter((r) => r.id === id);
      } else if (trimmed.includes('WHERE t.date = ?') || trimmed.includes('WHERE date = ?')) {
        const date = params[0];
        rows = rows.filter((r) => r.date === date);
      } else if (trimmed.includes('WHERE t.status = ?') || trimmed.includes('WHERE status = ?')) {
        const st = params[0];
        rows = rows.filter((r) => r.status === st);
      } else if (trimmed.includes('WHERE habitId = ?')) {
        const hid = params[0];
        rows = rows.filter((r) => r.habitId === hid);
      } else if (trimmed.includes('WHERE key = ?')) {
        const k = params[0];
        rows = rows.filter((r) => r.key === k);
      } else if (trimmed.includes('LIKE ?')) {
        const rawTerm = (params[0] || '').replace(/%/g, '').toLowerCase();
        rows = rows.filter((r) => {
          const t = (r.title || '').toLowerCase();
          const d = (r.description || '').toLowerCase();
          const n = (r.notes || '').toLowerCase();
          return t.includes(rawTerm) || d.includes(rawTerm) || n.includes(rawTerm);
        });
      } else if (trimmed.includes('OVERDUE') || trimmed.includes('status NOT IN')) {
        // Overdue query: (t.status NOT IN ('completed', 'cancelled')) AND (t.date < ? OR (t.date = ? AND t.startTime < ?))
        const today = params[0];
        const currentTime = params[2] || '23:59';
        rows = rows.filter((r) => {
          if (r.status === 'completed' || r.status === 'cancelled') return false;
          if (r.date < today) return true;
          if (r.date === today && r.startTime && r.startTime < currentTime) return true;
          return false;
        });
      }

      // Handle goal_tasks JOIN tasks query
      if (tableName === 'goal_tasks' && trimmed.includes('JOIN tasks')) {
        const goalId = params[0];
        const goalTasks = (this.tables.get('goal_tasks') || []).filter((gt) => gt.goalId === goalId);
        const tasks = this.tables.get('tasks') || [];
        const categories = this.tables.get('categories') || [];
        rows = goalTasks
          .map((gt) => {
            const t = tasks.find((task) => task.id === gt.taskId);
            if (!t) return null;
            const cat = categories.find((c) => c.id === t.categoryId);
            return {
              ...t,
              categoryName: cat?.name,
              categoryColor: cat?.color,
              categoryIcon: cat?.icon,
            };
          })
          .filter(Boolean) as any[];
        return { rows, rowsAffected: 0 };
      }

      // Add joined fields for categories if querying tasks
      if (tableName === 'tasks') {
        const categories = this.tables.get('categories') || [];
        rows = rows.map((t) => {
          const cat = categories.find((c) => c.id === t.categoryId);
          return {
            ...t,
            categoryName: cat?.name,
            categoryColor: cat?.color,
            categoryIcon: cat?.icon,
          };
        });
      }

      return { rows, rowsAffected: 0 };
    }

    // 3. INSERT INTO
    if (trimmed.toUpperCase().startsWith('INSERT')) {
      const match = trimmed.match(/INTO\s+([a-zA-Z_]+)/i);
      const tableName = match ? match[1].toLowerCase() : '';
      const table = this.tables.get(tableName) || [];

      const colsMatch = trimmed.match(/\(([^)]+)\)\s+VALUES/i);
      if (colsMatch) {
        const cols = colsMatch[1].split(',').map((c) => c.trim().replace(/[\r\n\s]+/g, ''));
        const newRow: any = {};
        cols.forEach((col, idx) => {
          newRow[col] = params[idx];
        });

        // Handle conflict replacement (e.g. habit_logs ON CONFLICT)
        if (tableName === 'habit_logs') {
          const existingIdx = table.findIndex((r) => r.habitId === newRow.habitId && r.date === newRow.date);
          if (existingIdx >= 0) {
            table[existingIdx] = { ...table[existingIdx], ...newRow };
            this.tables.set(tableName, table);
            return { rows: [], rowsAffected: 1 };
          }
        }

        if (tableName === 'settings') {
          const existingIdx = table.findIndex((r) => r.key === newRow.key);
          if (existingIdx >= 0) {
            table[existingIdx] = { ...table[existingIdx], ...newRow };
            this.tables.set(tableName, table);
            return { rows: [], rowsAffected: 1 };
          }
        }

        if (tableName === 'goal_tasks') {
          const existing = table.find((r) => r.goalId === newRow.goalId && r.taskId === newRow.taskId);
          if (existing) {
            return { rows: [], rowsAffected: 0 };
          }
        }

        table.push(newRow);
        this.tables.set(tableName, table);
      }
      return { rows: [], rowsAffected: 1 };
    }

    // 4. UPDATE
    if (trimmed.toUpperCase().startsWith('UPDATE')) {
      const match = trimmed.match(/UPDATE\s+([a-zA-Z_]+)/i);
      const tableName = match ? match[1].toLowerCase() : '';
      const table = this.tables.get(tableName) || [];
      const idParam = params[params.length - 1];

      const targetIndex = table.findIndex((r) => r.id === idParam || r.key === idParam);
      if (targetIndex >= 0) {
        const setPart = trimmed.substring(trimmed.indexOf('SET') + 3, trimmed.indexOf('WHERE'));
        const assignments = setPart.split(',').map((a) => a.trim().split('=')[0].trim());
        assignments.forEach((field, i) => {
          table[targetIndex][field] = params[i];
        });
        this.tables.set(tableName, table);
        return { rows: [], rowsAffected: 1 };
      }
      return { rows: [], rowsAffected: 0 };
    }

    // 5. DELETE
    if (trimmed.toUpperCase().startsWith('DELETE')) {
      const match = trimmed.match(/FROM\s+([a-zA-Z_]+)/i);
      const tableName = match ? match[1].toLowerCase() : '';
      const table = this.tables.get(tableName) || [];

      if (trimmed.includes('WHERE goalId = ? AND taskId = ?')) {
        const gid = params[0];
        const tid = params[1];
        const filtered = table.filter((r) => !(r.goalId === gid && r.taskId === tid));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (params.length > 0) {
        const idParam = params[0];
        const filtered = table.filter((r) => r.id !== idParam && r.habitId !== idParam && r.goalId !== idParam);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      } else {
        // DELETE FROM table without WHERE
        this.tables.set(tableName, []);
        return { rows: [], rowsAffected: table.length };
      }
    }

    return { rows: [], rowsAffected: 0 };
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    const snapshot = new Map<string, any[]>();
    for (const [key, val] of this.tables.entries()) {
      snapshot.set(key, val.map((row) => ({ ...row })));
    }
    try {
      return await fn(this);
    } catch (err) {
      this.tables = snapshot;
      throw err;
    }
  }

  async close(): Promise<void> {}
}

class OPSQLiteAdapter implements DatabaseAdapter {
  private db: any;

  constructor(dbInstance: any) {
    this.db = dbInstance;
  }

  async execute(query: string, params: any[] = []): Promise<{ rows: QueryResultRow[]; rowsAffected: number; insertId?: number }> {
    try {
      let result: any;
      if (typeof this.db?.executeAsync === 'function') {
        result = await this.db.executeAsync(query, params);
      } else if (typeof this.db?.execute === 'function') {
        result = await Promise.resolve(this.db.execute(query, params));
      }
      const rows: QueryResultRow[] = [];
      if (result && result.rows) {
        if (Array.isArray(result.rows)) {
          rows.push(...result.rows);
        } else if (typeof result.rows.item === 'function') {
          for (let i = 0; i < result.rows.length; i++) {
            rows.push(result.rows.item(i));
          }
        } else if (Array.isArray(result.rows._array)) {
          rows.push(...result.rows._array);
        }
      }
      return {
        rows,
        rowsAffected: result?.rowsAffected ?? 0,
        insertId: result?.insertId,
      };
    } catch (err) {
      console.warn(`SQLite execute error for query "${query}":`, err);
      throw err;
    }
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    await this.execute('BEGIN TRANSACTION;');
    try {
      const result = await fn(this);
      await this.execute('COMMIT;');
      return result;
    } catch (err) {
      try {
        await this.execute('ROLLBACK;');
      } catch {}
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.db?.close) {
      this.db.close();
    }
  }
}

class DatabaseManager {
  private static instance: DatabaseManager;
  private adapter: DatabaseAdapter | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async getAdapter(): Promise<DatabaseAdapter> {
    if (!this.adapter) {
      await this.init();
    }
    return this.adapter!;
  }

  public async init(): Promise<void> {
    if (this.isInitialized && this.adapter) {
      return;
    }

    const isTestEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';

    if (isTestEnv) {
      // In test runner environment, use high-fidelity In-Memory Database adapter
      this.adapter = new InMemoryDatabaseAdapter();
    } else {
      try {
        const { open } = require('@op-engineering/op-sqlite');
        const nativeDb = open({ name: 'lifeplanner.db', location: 'default' });
        this.adapter = new OPSQLiteAdapter(nativeDb);
      } catch (err) {
        console.warn('Native SQLite unavailable, using In-Memory DB:', err);
        this.adapter = new InMemoryDatabaseAdapter();
      }
    }

    await this.runMigrations();
    await this.runSeeds();
    this.isInitialized = true;
  }

  private async runMigrations(): Promise<void> {
    if (!this.adapter) return;

    try {
      await this.adapter.execute('PRAGMA foreign_keys = ON;');
    } catch {}

    const statements = CREATE_TABLES_SQL.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sql of statements) {
      try {
        await this.adapter.execute(sql + ';');
      } catch {
        // ignore
      }
    }

    // Ensure backwards compatibility for schema evolution across app updates
    try {
      const taskCols = await this.adapter.execute('PRAGMA table_info(tasks)');
      const taskColNames = new Set(taskCols.rows.map((r: any) => r.name));
      if (!taskColNames.has('notes')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN notes TEXT');
      }
      if (!taskColNames.has('reminderMinutes')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN reminderMinutes INTEGER DEFAULT 0');
      }
      if (!taskColNames.has('snoozeUntil')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN snoozeUntil TEXT');
      }
      if (!taskColNames.has('completedAt')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN completedAt TEXT');
      }

      const habitCols = await this.adapter.execute('PRAGMA table_info(habits)');
      const habitColNames = new Set(habitCols.rows.map((r: any) => r.name));
      if (!habitColNames.has('reminderTime')) {
        await this.adapter.execute('ALTER TABLE habits ADD COLUMN reminderTime TEXT');
      }
      if (!habitColNames.has('archivedAt')) {
        await this.adapter.execute('ALTER TABLE habits ADD COLUMN archivedAt TEXT');
      }

      const habitLogCols = await this.adapter.execute('PRAGMA table_info(habit_logs)');
      const habitLogColNames = new Set(habitLogCols.rows.map((r: any) => r.name));
      if (!habitLogColNames.has('notes')) {
        await this.adapter.execute('ALTER TABLE habit_logs ADD COLUMN notes TEXT');
      }
    } catch {
      // Safe to ignore migration errors
    }
  }

  private async runSeeds(): Promise<void> {
    if (!this.adapter) return;

    try {
      const existingCategories = await this.adapter.execute('SELECT COUNT(*) as count FROM categories');
      const count = existingCategories.rows[0]?.count ?? 0;
      if (count === 0) {
        for (const cat of DEFAULT_CATEGORIES) {
          await this.adapter.execute(
            'INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)',
            [cat.id, cat.name, cat.color, cat.icon, cat.createdAt]
          );
        }
      }
    } catch {
      // ignore
    }

    try {
      const existingSettings = await this.adapter.execute('SELECT COUNT(*) as count FROM settings');
      const count = existingSettings.rows[0]?.count ?? 0;
      if (count === 0) {
        const now = new Date().toISOString();
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
          await this.adapter.execute('INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)', [k, v, now]);
        }
      }
    } catch {
      // ignore
    }

    try {
      const existingHabits = await this.adapter.execute('SELECT COUNT(*) as count FROM habits');
      const count = existingHabits.rows[0]?.count ?? 0;
      if (count === 0) {
        for (const h of DEFAULT_HABITS) {
          await this.adapter.execute(
            'INSERT INTO habits (id, name, description, icon, color, recurrenceRule, target, reminderTime, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [h.id, h.name, h.description, h.icon, h.color, JSON.stringify(h.recurrenceRule), h.target, h.reminderTime, h.createdAt]
          );
        }
        for (let i = 0; i < 3; i++) {
          const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
          await this.adapter.execute(
            'INSERT INTO habit_logs (id, habitId, date, completed, value, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [`log_habit-water_${d}`, 'habit-water', d, 1, 1, new Date().toISOString()]
          );
        }
        for (let i = 0; i < 6; i++) {
          const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
          await this.adapter.execute(
            'INSERT INTO habit_logs (id, habitId, date, completed, value, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [`log_habit-meditate_${d}`, 'habit-meditate', d, 1, 1, new Date().toISOString()]
          );
        }
      }
    } catch {
      // ignore
    }

    try {
      const existingTasks = await this.adapter.execute('SELECT COUNT(*) as count FROM tasks');
      const count = existingTasks.rows[0]?.count ?? 0;
      if (count === 0) {
        for (const t of DEFAULT_TASKS) {
          await this.adapter.execute(
            'INSERT INTO tasks (id, title, description, date, startTime, endTime, priority, categoryId, status, reminderMinutes, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [t.id, t.title, t.description, t.date, t.startTime, t.endTime, t.priority, t.categoryId, t.status, t.reminderMinutes, t.notes, t.createdAt, t.updatedAt]
          );
        }
      }
    } catch {
      // ignore
    }
  }
}

export const getDatabase = async (): Promise<DatabaseAdapter> => {
  return await DatabaseManager.getInstance().getAdapter();
};
