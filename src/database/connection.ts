import { CREATE_TABLES_SQL } from './migrations/schema';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './seed';

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
    this.tables.set('tasks', []);
    this.tables.set('calendar_events', []);
    this.tables.set('habits', []);
    this.tables.set('habit_logs', []);
    this.tables.set('notes', []);
    this.tables.set('keep_notes', []);
    this.tables.set('movie_bookmarks', []);
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
      } else if (trimmed.includes('seriesId = ?')) {
        const sid = params[0];
        rows = rows.filter((r) => r.seriesId === sid);
      } else if (trimmed.includes('WHERE tmdbId = ?')) {
        const tid = Number(params[0]);
        rows = rows.filter((r) => Number(r.tmdbId) === tid);
      } else if (trimmed.includes('WHERE category = ?')) {
        const cat = params[0];
        rows = rows.filter((r) => r.category === cat);
      } else if (trimmed.includes('WHERE entityType = ?')) {
        const et = params[0];
        rows = rows.filter((r) => r.entityType === et);
        if (trimmed.includes('AND entityId = ?') && params[1]) {
          rows = rows.filter((r) => r.entityId === params[1]);
        }
      } else if (trimmed.includes('WHERE completed = 1')) {
        rows = rows.filter((r) => Boolean(r.completed));
        if (trimmed.includes('AND date >= ?') && params[0]) {
          rows = rows.filter((r) => r.date >= params[0]);
        }
      } else if (trimmed.includes('LIKE ?') && tableName !== 'keep_notes') {
        const rawTerm = (params[0] || '').replace(/%/g, '').toLowerCase();
        rows = rows.filter((r) => {
          const t = (r.title || '').toLowerCase();
          const d = (r.description || '').toLowerCase();
          const n = (r.notes || '').toLowerCase();
          return t.includes(rawTerm) || d.includes(rawTerm) || n.includes(rawTerm);
        });
      } else if (trimmed.includes('t.date >= ? AND t.date <= ?')) {
        const startDate = params[0];
        const endDate = params[1];
        rows = rows.filter((r) => r.date >= startDate && r.date <= endDate);
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

      // Handle keep_notes filtering and sorting
      if (tableName === 'keep_notes') {
        if (trimmed.includes('isTrashed = 1')) {
          rows = rows.filter((r) => Boolean(r.isTrashed));
        } else if (trimmed.includes('isArchived = 1')) {
          rows = rows.filter((r) => !r.isTrashed && Boolean(r.isArchived));
        } else if (trimmed.includes('reminderTime IS NOT NULL')) {
          rows = rows.filter((r) => !r.isTrashed && !r.isArchived && Boolean(r.reminderTime));
        } else if (trimmed.includes('isTrashed = 0') || trimmed.includes('isArchived = 0')) {
          rows = rows.filter((r) => !r.isTrashed && !r.isArchived);
        }
        if (trimmed.includes('color = ?')) {
          const colorParam = params[params.length - 1];
          rows = rows.filter((r) => r.color === colorParam);
        }
        if (trimmed.includes('AND labels LIKE ?')) {
          const lblParam = trimmed.includes('color = ?') ? params[params.length - 2] : params[params.length - 1];
          const cleanLbl = (lblParam || '').replace(/%/g, '').replace(/"/g, '').toLowerCase();
          rows = rows.filter((r) => (r.labels || '').toLowerCase().includes(cleanLbl));
        }
        if (params.length > 0 && typeof params[0] === 'string' && trimmed.includes('(title LIKE ?')) {
          let raw = params[0] || '';
          if (raw.startsWith('%')) raw = raw.slice(1);
          if (raw.endsWith('%')) raw = raw.slice(0, -1);
          const q = raw.replace(/\\([%_\\])/g, '$1').toLowerCase();
          rows = rows.filter((r) =>
            (r.title || '').toLowerCase().includes(q) ||
            (r.content || '').toLowerCase().includes(q) ||
            (r.labels || '').toLowerCase().includes(q) ||
            (r.checklistData || '').toLowerCase().includes(q)
          );
        }
        rows.sort((a, b) => {
          if (Boolean(b.isPinned) !== Boolean(a.isPinned)) {
            return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
          }
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
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
      const targetIndex = table.findIndex(
        (r) =>
          r.id === idParam ||
          r.key === idParam ||
          (r.tmdbId !== undefined && Number(r.tmdbId) === Number(idParam)),
      );
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


      if (trimmed.includes('WHERE tmdbId = ?')) {
        const tid = Number(params[0]);
        const filtered = table.filter((r) => Number(r.tmdbId) !== tid);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE seriesId = ?')) {
        const sid = params[0];
        const filtered = table.filter((r) => r.seriesId !== sid);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (params.length > 0) {
        const idParam = params[0];
        const filtered = table.filter((r) => r.id !== idParam && r.habitId !== idParam && r.seriesId !== idParam);
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

  async close(): Promise<void> { }
}

class OPSQLiteAdapter implements DatabaseAdapter {
  private db: any;
  private transactionDepth = 0;
  private txMutex: Promise<void> = Promise.resolve();

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
    if (this.transactionDepth > 0) {
      return this.runTransaction(fn);
    }

    let releaseMutex: () => void;
    const prevMutex = this.txMutex;
    this.txMutex = new Promise<void>((resolve) => {
      releaseMutex = resolve;
    });

    await prevMutex;
    try {
      return await this.runTransaction(fn);
    } finally {
      releaseMutex!();
    }
  }

  private async runTransaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    const isRoot = this.transactionDepth === 0;
    const savepointName = `sp_${this.transactionDepth}`;
    this.transactionDepth++;

    if (isRoot) {
      await this.execute('BEGIN TRANSACTION;');
    } else {
      await this.execute(`SAVEPOINT ${savepointName};`);
    }

    try {
      const result = await fn(this);
      if (isRoot) {
        await this.execute('COMMIT;');
      } else {
        await this.execute(`RELEASE SAVEPOINT ${savepointName};`);
      }
      return result;
    } catch (err) {
      try {
        if (isRoot) {
          await this.execute('ROLLBACK;');
        } else {
          await this.execute(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        }
      } catch { }
      throw err;
    } finally {
      this.transactionDepth--;
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

  private constructor() { }

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
      } catch (err: any) {
        if (!__DEV__) {
          throw new Error(
            `Local SQLite database failed to initialize: ${err?.message || 'Native storage engine unavailable'}. Please check storage permissions and retry startup.`
          );
        }
        console.warn('Native SQLite unavailable in development, using In-Memory DB:', err);
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
      await this.adapter.execute('PRAGMA journal_mode = WAL;');
      await this.adapter.execute('PRAGMA busy_timeout = 5000;');
      await this.adapter.execute('PRAGMA synchronous = NORMAL;');
      await this.adapter.execute('PRAGMA foreign_keys = ON;');
    } catch { }

    // 1. Ensure all core tables exist (idempotent CREATE TABLE IF NOT EXISTS)
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

    try {
      await this.adapter.execute(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL);'
      );
      const now = new Date().toISOString();
      await this.adapter.execute(
        'INSERT OR IGNORE INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)',
        [1, 'v1_initial_core_schema', now]
      );
      await this.adapter.execute(
        'INSERT OR IGNORE INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)',
        [2, 'v2_goals_notes_calendar_schema', now]
      );
      await this.adapter.execute(
        'INSERT OR IGNORE INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)',
        [3, 'v3_keep_notes_schema', now]
      );
      await this.adapter.execute(
        'INSERT OR IGNORE INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)',
        [4, 'v4_notes_schema_evolution', now]
      );
      await this.adapter.execute(
        'INSERT OR IGNORE INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)',
        [5, 'v5_complete_notes_and_keep_schema', now]
      );
      await this.adapter.execute(
        `CREATE TABLE IF NOT EXISTS movie_bookmarks (
          id TEXT PRIMARY KEY,
          tmdbId INTEGER UNIQUE NOT NULL,
          title TEXT NOT NULL,
          overview TEXT,
          posterPath TEXT,
          backdropPath TEXT,
          voteAverage REAL DEFAULT 0,
          releaseDate TEXT,
          genres TEXT,
          runtime INTEGER DEFAULT 0,
          isWatched INTEGER NOT NULL DEFAULT 0,
          savedAt TEXT NOT NULL
        );`
      );
      await this.adapter.execute(
        `CREATE TABLE IF NOT EXISTS sync_tombstones (
          id TEXT PRIMARY KEY,
          entityType TEXT NOT NULL,
          deletedAt TEXT NOT NULL
        );`
      );
      await this.adapter.execute(
        'CREATE INDEX IF NOT EXISTS idx_tombstones_type ON sync_tombstones(entityType);'
      );
    } catch { }

    // 2. Clean up legacy tables
    try {
      await this.adapter.execute('DROP TABLE IF EXISTS goal_tasks');
      await this.adapter.execute('DROP TABLE IF EXISTS goals');
    } catch { }

    // 3. Ensure all tasks columns exist
    try {
      const taskCols = await this.adapter.execute('PRAGMA table_info(tasks)');
      const taskColNames = new Set(taskCols.rows.map((r: any) => r.name));
      if (!taskColNames.has('seriesId')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN seriesId TEXT');
      }
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
      if (!taskColNames.has('isLoudAlarm')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN isLoudAlarm INTEGER DEFAULT 0');
      }
      if (!taskColNames.has('eisenhowerQuadrant')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN eisenhowerQuadrant TEXT');
      }
      if (!taskColNames.has('accentColor')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN accentColor TEXT');
      }
      if (!taskColNames.has('estimatedMinutes')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN estimatedMinutes INTEGER');
      }
    } catch { }

    // 4. Ensure all keep_notes columns exist
    try {
      const noteCols = await this.adapter.execute('PRAGMA table_info(keep_notes)');
      const noteColNames = new Set(noteCols.rows.map((r: any) => r.name));
      if (!noteColNames.has('title')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
      }
      if (!noteColNames.has('content')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN content TEXT NOT NULL DEFAULT ''");
      }
      if (!noteColNames.has('type')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN type TEXT NOT NULL DEFAULT 'text'");
      }
      if (!noteColNames.has('color')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN color TEXT NOT NULL DEFAULT 'default'");
      }
      if (!noteColNames.has('isPinned')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN isPinned INTEGER NOT NULL DEFAULT 0');
      }
      if (!noteColNames.has('isArchived')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0');
      }
      if (!noteColNames.has('isTrashed')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN isTrashed INTEGER NOT NULL DEFAULT 0');
        if (noteColNames.has('isTrash')) {
          await this.adapter.execute('UPDATE keep_notes SET isTrashed = isTrash WHERE isTrashed = 0');
        }
      }
      if (!noteColNames.has('trashedAt')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN trashedAt TEXT');
      }
      if (!noteColNames.has('reminderTime')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN reminderTime TEXT');
      }
      if (!noteColNames.has('labels')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN labels TEXT NOT NULL DEFAULT '[]'");
      }
      if (!noteColNames.has('checklistData')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN checklistData TEXT NOT NULL DEFAULT '[]'");
      }
      if (!noteColNames.has('drawingData')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN drawingData TEXT');
      }
      if (!noteColNames.has('audioUri')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN audioUri TEXT');
      }
      if (!noteColNames.has('imageUri')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN imageUri TEXT');
      }
      if (!noteColNames.has('createdAt')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''");
      }
      if (!noteColNames.has('updatedAt')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''");
      }
    } catch { }

    // 5. Ensure all habits columns exist
    try {
      const habitCols = await this.adapter.execute('PRAGMA table_info(habits)');
      const habitColNames = new Set(habitCols.rows.map((r: any) => r.name));
      if (!habitColNames.has('reminderTime')) {
        await this.adapter.execute('ALTER TABLE habits ADD COLUMN reminderTime TEXT');
      }
      if (!habitColNames.has('archivedAt')) {
        await this.adapter.execute('ALTER TABLE habits ADD COLUMN archivedAt TEXT');
      }
    } catch { }

    // 6. Ensure habit_logs columns exist
    try {
      const habitLogCols = await this.adapter.execute('PRAGMA table_info(habit_logs)');
      const habitLogColNames = new Set(habitLogCols.rows.map((r: any) => r.name));
      if (!habitLogColNames.has('notes')) {
        await this.adapter.execute('ALTER TABLE habit_logs ADD COLUMN notes TEXT');
      }
    } catch { }

    // 7. Ensure calendar_events columns exist
    try {
      const eventCols = await this.adapter.execute('PRAGMA table_info(calendar_events)');
      const eventColNames = new Set(eventCols.rows.map((r: any) => r.name));
      if (!eventColNames.has('date')) {
        await this.adapter.execute("ALTER TABLE calendar_events ADD COLUMN date TEXT DEFAULT ''");
      }
      if (!eventColNames.has('time')) {
        await this.adapter.execute("ALTER TABLE calendar_events ADD COLUMN time TEXT DEFAULT ''");
      }
      if (!eventColNames.has('ringAlarm')) {
        await this.adapter.execute('ALTER TABLE calendar_events ADD COLUMN ringAlarm INTEGER DEFAULT 1');
      }
      if (!eventColNames.has('status')) {
        await this.adapter.execute("ALTER TABLE calendar_events ADD COLUMN status TEXT DEFAULT 'active'");
      }
    } catch { }

    // 8. Performance Indexes (using valid column names)
    try {
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_tasks_status_date ON tasks(status, date);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(categoryId);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_tasks_series ON tasks(seriesId);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tasks(status, date, startTime);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_keep_notes_active ON keep_notes(isArchived, isTrashed, isPinned, updatedAt);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_keep_notes_reminder ON keep_notes(reminderTime);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habitId, completedDate);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);');
      await this.adapter.execute('CREATE INDEX IF NOT EXISTS idx_movie_bookmarks_watched ON movie_bookmarks(isWatched);');
    } catch { }
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
      } else {
        // Ensure default Google Sheet Webhook is configured if missing or empty
        const existingSheetUrl = await this.adapter.execute(
          "SELECT value FROM settings WHERE key = 'googleSheetWebhookUrl'"
        );
        if (!existingSheetUrl.rows.length || !existingSheetUrl.rows[0]?.value) {
          const now = new Date().toISOString();
          await this.adapter.execute(
            "INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES ('googleSheetWebhookUrl', ?, ?)",
            [DEFAULT_SETTINGS.googleSheetWebhookUrl, now]
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
