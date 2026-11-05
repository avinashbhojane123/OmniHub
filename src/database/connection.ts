import { CREATE_TABLES_SQL } from './migrations/schema';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, seedDatabase } from './seed';

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

function sanitizeParam(val: any): any {
  if (val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (val instanceof Date) return val.toISOString();
  return val;
}

function sanitizeParams(params: any[] = []): any[] {
  return params.map(sanitizeParam);
}

/**
 * High-fidelity in-memory database adapter for test suites and development fallback.
 * Emulates SQLite tables, indexes, constraints, transactions, and common SQL operations.
 */
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
    this.tables.set('battery_sessions', []);
    this.tables.set('reminders', []);
    this.tables.set('notification_schedules', []);
    this.tables.set('pending_sync_queue', []);
    this.tables.set('sync_tombstones', []);
    this.tables.set('schema_migrations', []);
    this.tables.set(
      'settings',
      Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
        key,
        value,
        updatedAt: new Date().toISOString(),
      }))
    );
  }

  public executeSync(query: string, params: any[] = []): { rows: QueryResultRow[]; rowsAffected: number; insertId?: number } {
    return this.executeInternal(query, sanitizeParams(params));
  }

  public async execute(query: string, params: any[] = []): Promise<{ rows: QueryResultRow[]; rowsAffected: number; insertId?: number }> {
    return this.executeInternal(query, sanitizeParams(params));
  }

  private executeInternal(query: string, params: any[] = []): { rows: QueryResultRow[]; rowsAffected: number; insertId?: number } {
    const trimmed = query.replace(/--.*$/gm, '').trim();

    // 0. PRAGMA & Metadata Queries
    if (trimmed.toUpperCase().startsWith('PRAGMA')) {
      const infoMatch = trimmed.match(/PRAGMA\s+table_info\s*\(\s*([a-zA-Z_]+)\s*\)/i);
      if (infoMatch) {
        const tbl = infoMatch[1].toLowerCase();
        const knownCols: Record<string, string[]> = {
          tasks: [
            'id', 'seriesId', 'title', 'description', 'date', 'startTime', 'endTime',
            'priority', 'categoryId', 'status', 'recurrenceRule', 'reminderMinutes',
            'snoozeUntil', 'notes', 'isLoudAlarm', 'isOvernight', 'eisenhowerQuadrant',
            'accentColor', 'estimatedMinutes', 'createdAt', 'updatedAt', 'completedAt',
          ],
          keep_notes: [
            'id', 'title', 'content', 'type', 'color', 'isPinned', 'isArchived',
            'isTrashed', 'trashedAt', 'reminderTime', 'labels', 'checklistData',
            'drawingData', 'audioUri', 'imageUri', 'createdAt', 'updatedAt',
          ],
          habits: ['id', 'name', 'description', 'icon', 'color', 'recurrenceRule', 'target', 'reminderTime', 'createdAt', 'archivedAt'],
          habit_logs: ['id', 'habitId', 'date', 'completed', 'value', 'notes', 'createdAt'],
          calendar_events: ['id', 'title', 'description', 'date', 'time', 'ringAlarm', 'status', 'createdAt', 'updatedAt'],
          movie_bookmarks: ['id', 'tmdbId', 'title', 'overview', 'posterPath', 'backdropPath', 'voteAverage', 'releaseDate', 'genres', 'runtime', 'isWatched', 'isTv', 'savedAt'],
          settings: ['key', 'value', 'updatedAt'],
          categories: ['id', 'name', 'color', 'icon', 'createdAt'],
        };
        const cols = knownCols[tbl] || [];
        return {
          rows: cols.map((colName) => ({ name: colName })),
          rowsAffected: 0,
        };
      }
      return { rows: [], rowsAffected: 0 };
    }

    if (trimmed.includes('sqlite_master')) {
      return { rows: [{ sql: 'CREATE TABLE movie_bookmarks (id TEXT PRIMARY KEY, tmdbId INTEGER, isTv INTEGER)' }], rowsAffected: 0 };
    }

    // 1. SELECT COUNT(*) or SELECT COUNT(CASE ...
    if (trimmed.toUpperCase().includes('COUNT(CASE')) {
      const match = trimmed.match(/FROM\s+([a-zA-Z_]+)/i);
      const tableName = match ? match[1].toLowerCase() : '';
      let tableRows = [...(this.tables.get(tableName) || [])];

      if (trimmed.includes('WHERE date >= ? AND date <= ?')) {
        const weekStart = params[params.length - 2];
        const weekEnd = params[params.length - 1];
        tableRows = tableRows.filter((r) => r.date && r.date >= weekStart && r.date <= weekEnd);

        const nowIso = params[0];
        const todayStr = params[1];
        const currentTimeStr = params[3];

        const weeklyTotal = tableRows.filter((r) => r.status !== 'cancelled').length;
        const weeklyCompleted = tableRows.filter((r) => r.status === 'completed').length;
        const padTime = (t?: string) => (t && t.length === 4 ? `0${t}` : t || '');
        const weeklyOverdue = tableRows.filter((r) => {
          if (r.status === 'completed' || r.status === 'cancelled') return false;
          if (r.snoozeUntil && r.snoozeUntil > nowIso) return false;
          if (!r.date) return false;
          if (r.date < todayStr) return true;
          if (r.date === todayStr && r.startTime && padTime(r.startTime) < currentTimeStr) return true;
          return false;
        }).length;

        return {
          rows: [{ weeklyTotal, weeklyCompleted, weeklyOverdue }],
          rowsAffected: 0,
        };
      }

      // All-time task aggregate query
      const nowIso = params[0];
      const todayStr = params[1];
      const currentTimeStr = params[3];

      const completedCount = tableRows.filter((r) => r.status === 'completed').length;
      const pendingCount = tableRows.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').length;
      const totalActive = tableRows.filter((r) => r.status !== 'cancelled').length;
      const padTime = (t?: string) => (t && t.length === 4 ? `0${t}` : t || '');
      const overdueCount = tableRows.filter((r) => {
        if (r.status === 'completed' || r.status === 'cancelled') return false;
        if (r.snoozeUntil && r.snoozeUntil > nowIso) return false;
        if (!r.date) return false;
        if (r.date < todayStr) return true;
        if (r.date === todayStr && r.startTime && padTime(r.startTime) < currentTimeStr) return true;
        return false;
      }).length;

      return {
        rows: [{ completedCount, pendingCount, totalActive, overdueCount }],
        rowsAffected: 0,
      };
    }

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
      } else if (trimmed.includes('archivedAt IS NULL')) {
        rows = rows.filter((r) => r.archivedAt === null || r.archivedAt === undefined);
      } else if (trimmed.includes('WHERE habitId = ? AND date = ?')) {
        const hid = params[0];
        const dt = params[1];
        rows = rows.filter((r) => r.habitId === hid && r.date === dt);
      } else if (trimmed.includes('WHERE habitId = ?')) {
        const hid = params[0];
        rows = rows.filter((r) => r.habitId === hid);
      } else if (trimmed.includes('WHERE t.status = ? AND t.date = ?') || trimmed.includes('WHERE status = ? AND date = ?')) {
        const st = params[0];
        const dt = params[1];
        rows = rows.filter((r) => r.status === st && r.date === dt);
      } else if (trimmed.includes('WHERE t.date = ?') || trimmed.includes('WHERE date = ?')) {
        const date = params[0];
        rows = rows.filter((r) => r.date === date);
      } else if (trimmed.includes('WHERE t.status = ?') || trimmed.includes('WHERE status = ?')) {
        const st = params[0];
        rows = rows.filter((r) => r.status === st);
      } else if (trimmed.includes('WHERE key = ?')) {
        const k = params[0];
        rows = rows.filter((r) => r.key === k);
      } else if (trimmed.includes('seriesId = ?')) {
        const sid = params[0];
        rows = rows.filter((r) => r.seriesId === sid);
      } else if (trimmed.includes('WHERE tmdbId = ? AND isTv = ?')) {
        const tid = Number(params[0]);
        const isTvVal = Boolean(params[1]);
        rows = rows.filter((r) => Number(r.tmdbId) === tid && Boolean(r.isTv) === isTvVal);
      } else if (trimmed.includes('WHERE tmdbId = ?')) {
        const tid = Number(params[0]);
        rows = rows.filter((r) => Number(r.tmdbId) === tid);
      } else if (trimmed.includes('WHERE categoryId = ?') || trimmed.includes('WHERE category = ?')) {
        const cat = params[0];
        rows = rows.filter((r) => r.categoryId === cat || r.category === cat);
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
      } else if (trimmed.includes('WHERE completed = 0')) {
        rows = rows.filter((r) => !r.completed);
      } else if (trimmed.includes('LIKE ?') && tableName !== 'keep_notes') {
        const rawTerm = (params[0] || '').replace(/%/g, '').toLowerCase();
        rows = rows.filter((r) => {
          const id = (r.id || '').toLowerCase();
          const t = (r.title || '').toLowerCase();
          const d = (r.description || '').toLowerCase();
          const n = (r.notes || '').toLowerCase();
          return id.includes(rawTerm) || t.includes(rawTerm) || d.includes(rawTerm) || n.includes(rawTerm);
        });
      } else if (trimmed.includes('t.date >= ? AND t.date <= ?') || trimmed.includes('date >= ? AND date <= ?')) {
        const startDate = params[0];
        const endDate = params[1];
        rows = rows.filter((r) => r.date >= startDate && r.date <= endDate);
      } else if (trimmed.includes('date >= ?')) {
        const pastLimit = params[0];
        rows = rows.filter((r) => {
          if (!r.date || r.date < pastLimit) return false;
          if (trimmed.includes("status = 'active'") && r.status !== 'active') return false;
          if (trimmed.includes('ringAlarm = 1') && !r.ringAlarm) return false;
          return true;
        });
      } else if (trimmed.includes('OVERDUE') || trimmed.includes('status NOT IN')) {
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

      // Generic ORDER BY handling
      if (trimmed.includes('ORDER BY date ASC, time ASC')) {
        rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
      } else if (trimmed.includes('ORDER BY startTime DESC')) {
        rows.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
      } else if (trimmed.includes('ORDER BY createdAt DESC')) {
        rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      } else if (trimmed.includes('ORDER BY savedAt DESC')) {
        rows.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
      } else if (trimmed.includes('ORDER BY updatedAt DESC')) {
        rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      } else if (trimmed.includes('ORDER BY deletedAt DESC')) {
        rows.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
      } else if (trimmed.includes('ORDER BY name ASC')) {
        rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }

      // Generic LIMIT handling
      const limitMatch = trimmed.match(/LIMIT\s+(\?|\d+)/i);
      if (limitMatch) {
        let limitVal: number;
        if (limitMatch[1] === '?') {
          limitVal = Number(params[params.length - 1]);
        } else {
          limitVal = parseInt(limitMatch[1], 10);
        }
        if (!isNaN(limitVal) && limitVal > 0) {
          rows = rows.slice(0, limitVal);
        }
      }

      return { rows, rowsAffected: 0 };
    }

    // 3. INSERT INTO / INSERT OR REPLACE / INSERT OR IGNORE
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

        const isIgnore = trimmed.toUpperCase().startsWith('INSERT OR IGNORE');
        const isReplace = trimmed.toUpperCase().startsWith('INSERT OR REPLACE') || trimmed.includes('ON CONFLICT');

        // Handle composite unique key for habit_logs (habitId, date)
        if (tableName === 'habit_logs' && newRow.habitId && newRow.date) {
          const existingIdx = table.findIndex((r) => r.habitId === newRow.habitId && r.date === newRow.date);
          if (existingIdx >= 0) {
            if (isIgnore) {
              return { rows: [], rowsAffected: 0 };
            }
            table[existingIdx] = { ...table[existingIdx], ...newRow };
            this.tables.set(tableName, table);
            return { rows: [], rowsAffected: 1 };
          }
        }

        // Handle settings key primary key
        if (tableName === 'settings' && newRow.key !== undefined) {
          const existingIdx = table.findIndex((r) => r.key === newRow.key);
          if (existingIdx >= 0) {
            if (isIgnore) {
              return { rows: [], rowsAffected: 0 };
            }
            table[existingIdx] = { ...table[existingIdx], ...newRow };
            this.tables.set(tableName, table);
            return { rows: [], rowsAffected: 1 };
          }
        }

        // Handle id primary key
        if (newRow.id !== undefined) {
          const existingIdx = table.findIndex((r) => r.id === newRow.id);
          if (existingIdx >= 0) {
            if (isIgnore) {
              return { rows: [], rowsAffected: 0 };
            }
            if (isReplace) {
              table[existingIdx] = { ...table[existingIdx], ...newRow };
              this.tables.set(tableName, table);
              return { rows: [], rowsAffected: 1 };
            }
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

      if (trimmed.includes('WHERE tmdbId = ? AND isTv = ?')) {
        const tid = Number(params[params.length - 2]);
        const isTvVal = Boolean(params[params.length - 1]);
        const targetIndex = table.findIndex(
          (r) => Number(r.tmdbId) === tid && Boolean(r.isTv) === isTvVal,
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

      if (trimmed.includes('WHERE isTrashed = 0') && trimmed.includes('SET isTrashed = isTrash')) {
        let count = 0;
        table.forEach((r) => {
          if (!r.isTrashed && r.isTrash) {
            r.isTrashed = r.isTrash;
            count++;
          }
        });
        this.tables.set(tableName, table);
        return { rows: [], rowsAffected: count };
      }

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

      // Check specific compound WHERE clauses first
      if (trimmed.includes('WHERE tmdbId = ? AND isTv = ?')) {
        const tid = Number(params[0]);
        const isTvVal = Boolean(params[1]);
        const filtered = table.filter(
          (r) => !(Number(r.tmdbId) === tid && Boolean(r.isTv) === isTvVal),
        );
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE tmdbId = ?')) {
        const tid = Number(params[0]);
        const filtered = table.filter((r) => Number(r.tmdbId) !== tid);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE habitId = ? AND date = ?')) {
        const hid = params[0];
        const dt = params[1];
        const filtered = table.filter((r) => !(r.habitId === hid && r.date === dt));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE seriesId = ?')) {
        const sid = params[0];
        const filtered = table.filter((r) => r.seriesId !== sid);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE id IN')) {
        const idSet = new Set(params);
        const filtered = table.filter((r) => !idSet.has(r.id));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE isTrashed = 1 AND trashedAt IS NOT NULL AND trashedAt < ?')) {
        const cutoff = params[0];
        const filtered = table.filter((r) => !(Boolean(r.isTrashed) && r.trashedAt && r.trashedAt < cutoff));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE isTrashed = 1')) {
        const filtered = table.filter((r) => !r.isTrashed);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE createdAt <= ?')) {
        const timeLimit = params[0];
        const filtered = table.filter((r) => !(r.createdAt && r.createdAt <= timeLimit));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE itemId = ? AND op = ?') || trimmed.includes("WHERE itemId = ? AND op = 'upsert'")) {
        const itemId = params[0];
        const op = params[1] || 'upsert';
        const filtered = table.filter((r) => !(r.itemId === itemId && r.op === op));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE itemId = ?')) {
        const itemId = params[0];
        const filtered = table.filter((r) => r.itemId !== itemId);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE taskId = ?')) {
        const taskId = params[0];
        const filtered = table.filter((r) => r.taskId !== taskId);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE id = ? AND updatedAt <= ?')) {
        const targetId = params[0];
        const targetUpdatedAt = params[1];
        const filtered = table.filter((r) => !(r.id === targetId && r.updatedAt && r.updatedAt <= targetUpdatedAt));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE (id = ? OR id = ?) AND savedAt <= ?')) {
        const id1 = params[0];
        const id2 = params[1];
        const savedAtCutoff = params[2];
        const filtered = table.filter((r) => !((r.id === id1 || r.id === id2) && r.savedAt && r.savedAt <= savedAtCutoff));
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (trimmed.includes('WHERE id = ? OR id = ?')) {
        const id1 = params[0];
        const id2 = params[1];
        const filtered = table.filter((r) => r.id !== id1 && r.id !== id2);
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      if (params.length > 0 && trimmed.includes('WHERE')) {
        const idParam = params[0];
        const filtered = table.filter(
          (r) => r.id !== idParam && r.habitId !== idParam && r.seriesId !== idParam && r.taskId !== idParam && r.key !== idParam
        );
        this.tables.set(tableName, filtered);
        return { rows: [], rowsAffected: table.length - filtered.length };
      }

      // DELETE FROM table without WHERE (Full truncate)
      if (!trimmed.includes('WHERE')) {
        const prevCount = table.length;
        this.tables.set(tableName, []);
        return { rows: [], rowsAffected: prevCount };
      }
    }

    return { rows: [], rowsAffected: 0 };
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    const snapshot = new Map<string, any[]>();
    for (const [key, val] of this.tables.entries()) {
      snapshot.set(key, JSON.parse(JSON.stringify(val)));
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

/**
 * Production SQLite adapter backed by @op-engineering/op-sqlite.
 */
class OPSQLiteAdapter implements DatabaseAdapter {
  private db: any;
  private transactionDepth = 0;
  private txMutex: Promise<void> = Promise.resolve();

  constructor(dbInstance: any) {
    this.db = dbInstance;
  }

  public executeSync(query: string, params: any[] = []): { rows: QueryResultRow[]; rowsAffected: number; insertId?: number } {
    try {
      const sanitized = sanitizeParams(params);
      let result: any;
      if (typeof this.db?.executeSync === 'function') {
        result = this.db.executeSync(query, sanitized);
      } else if (typeof this.db?.execute === 'function') {
        result = this.db.execute(query, sanitized);
      }
      return this.formatResult(result);
    } catch (err) {
      console.warn(`SQLite executeSync error for query "${query}":`, err);
      throw err;
    }
  }

  async execute(query: string, params: any[] = []): Promise<{ rows: QueryResultRow[]; rowsAffected: number; insertId?: number }> {
    try {
      const sanitized = sanitizeParams(params);
      let result: any;
      if (typeof this.db?.executeAsync === 'function') {
        result = await this.db.executeAsync(query, sanitized);
      } else if (typeof this.db?.execute === 'function') {
        result = await Promise.resolve(this.db.execute(query, sanitized));
      }
      return this.formatResult(result);
    } catch (err) {
      console.warn(`SQLite execute error for query "${query}":`, err);
      throw err;
    }
  }

  private formatResult(result: any): { rows: QueryResultRow[]; rowsAffected: number; insertId?: number } {
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
      await this.execute('BEGIN IMMEDIATE TRANSACTION;');
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
          await this.execute(`RELEASE SAVEPOINT ${savepointName};`);
        }
      } catch (rollbackErr) {
        console.warn('[OPSQLiteAdapter] Transaction rollback warning:', rollbackErr);
      }
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

/**
 * Singleton managing database initialization, migrations, connection pooling, and lifecycle.
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private adapter: DatabaseAdapter | null = null;
  private isInitialized = false;
  private initPromise: Promise<DatabaseAdapter> | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public isReady(): boolean {
    return this.isInitialized && this.adapter !== null;
  }

  public getAdapterSync(): DatabaseAdapter | null {
    return this.adapter;
  }

  public async getAdapter(): Promise<DatabaseAdapter> {
    if (this.isInitialized && this.adapter) {
      return this.adapter;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        await this.init();
        return this.adapter!;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public async init(): Promise<void> {
    if (this.isInitialized && this.adapter) {
      return;
    }

    const isTestEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';

    if (isTestEnv) {
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

  public async close(): Promise<void> {
    if (this.adapter) {
      try {
        await this.adapter.close();
      } catch (e) {
        console.warn('[DatabaseManager] Error closing adapter:', e);
      }
      this.adapter = null;
    }
    this.isInitialized = false;
    this.initPromise = null;
  }

  private async runMigrations(): Promise<void> {
    if (!this.adapter) return;

    // Configure SQLite WAL mode, concurrency pragmas, and performance parameters
    try {
      await this.adapter.execute('PRAGMA journal_mode = WAL;');
      await this.adapter.execute('PRAGMA busy_timeout = 5000;');
      await this.adapter.execute('PRAGMA synchronous = NORMAL;');
      await this.adapter.execute('PRAGMA foreign_keys = ON;');
      await this.adapter.execute('PRAGMA cache_size = -8000;');
      await this.adapter.execute('PRAGMA temp_store = MEMORY;');
    } catch (e) {
      console.warn('[DatabaseManager] PRAGMA configuration warning:', e);
    }

    // 1. Ensure all core tables exist (idempotent CREATE TABLE IF NOT EXISTS)
    const statements = CREATE_TABLES_SQL.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sql of statements) {
      try {
        await this.adapter.execute(sql + ';');
      } catch (sqlErr) {
        console.warn('[DatabaseManager] Core table statement warning:', sqlErr);
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
    } catch (mErr) {
      console.warn('[DatabaseManager] Migration tracking warning:', mErr);
    }

    // 2. Clean up legacy tables
    try {
      await this.adapter.execute('DROP TABLE IF EXISTS goal_tasks;');
      await this.adapter.execute('DROP TABLE IF EXISTS goals;');
    } catch {}

    // 3. Ensure all tasks columns exist
    try {
      const taskCols = await this.adapter.execute('PRAGMA table_info(tasks);');
      const taskColNames = new Set(taskCols.rows.map((r: any) => r.name));
      if (!taskColNames.has('seriesId')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN seriesId TEXT;');
      }
      if (!taskColNames.has('notes')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN notes TEXT;');
      }
      if (!taskColNames.has('reminderMinutes')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN reminderMinutes INTEGER DEFAULT 0;');
      }
      if (!taskColNames.has('snoozeUntil')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN snoozeUntil TEXT;');
      }
      if (!taskColNames.has('completedAt')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN completedAt TEXT;');
      }
      if (!taskColNames.has('isLoudAlarm')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN isLoudAlarm INTEGER DEFAULT 0;');
      }
      if (!taskColNames.has('isOvernight')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN isOvernight INTEGER DEFAULT 0;');
      }
      if (!taskColNames.has('eisenhowerQuadrant')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN eisenhowerQuadrant TEXT;');
      }
      if (!taskColNames.has('accentColor')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN accentColor TEXT;');
      }
      if (!taskColNames.has('estimatedMinutes')) {
        await this.adapter.execute('ALTER TABLE tasks ADD COLUMN estimatedMinutes INTEGER;');
      }
    } catch (e) {
      console.warn('[DatabaseManager] Tasks column evolution warning:', e);
    }

    // 4. Ensure all keep_notes columns exist
    try {
      const noteCols = await this.adapter.execute('PRAGMA table_info(keep_notes);');
      const noteColNames = new Set(noteCols.rows.map((r: any) => r.name));
      if (!noteColNames.has('title')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN title TEXT NOT NULL DEFAULT '';");
      }
      if (!noteColNames.has('content')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN content TEXT NOT NULL DEFAULT '';");
      }
      if (!noteColNames.has('type')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN type TEXT NOT NULL DEFAULT 'text';");
      }
      if (!noteColNames.has('color')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN color TEXT NOT NULL DEFAULT 'default';");
      }
      if (!noteColNames.has('isPinned')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN isPinned INTEGER NOT NULL DEFAULT 0;');
      }
      if (!noteColNames.has('isArchived')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0;');
      }
      if (!noteColNames.has('isTrashed')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN isTrashed INTEGER NOT NULL DEFAULT 0;');
        if (noteColNames.has('isTrash')) {
          await this.adapter.execute('UPDATE keep_notes SET isTrashed = isTrash WHERE isTrashed = 0;');
        }
      }
      if (!noteColNames.has('trashedAt')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN trashedAt TEXT;');
      }
      if (!noteColNames.has('reminderTime')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN reminderTime TEXT;');
      }
      if (!noteColNames.has('labels')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';");
      }
      if (!noteColNames.has('checklistData')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN checklistData TEXT NOT NULL DEFAULT '[]';");
      }
      if (!noteColNames.has('drawingData')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN drawingData TEXT;');
      }
      if (!noteColNames.has('audioUri')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN audioUri TEXT;');
      }
      if (!noteColNames.has('imageUri')) {
        await this.adapter.execute('ALTER TABLE keep_notes ADD COLUMN imageUri TEXT;');
      }
      if (!noteColNames.has('createdAt')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN createdAt TEXT NOT NULL DEFAULT '';");
      }
      if (!noteColNames.has('updatedAt')) {
        await this.adapter.execute("ALTER TABLE keep_notes ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '';");
      }
    } catch (e) {
      console.warn('[DatabaseManager] KeepNotes column evolution warning:', e);
    }

    // 5. Ensure all habits columns exist
    try {
      const habitCols = await this.adapter.execute('PRAGMA table_info(habits);');
      const habitColNames = new Set(habitCols.rows.map((r: any) => r.name));
      if (!habitColNames.has('reminderTime')) {
        await this.adapter.execute('ALTER TABLE habits ADD COLUMN reminderTime TEXT;');
      }
      if (!habitColNames.has('archivedAt')) {
        await this.adapter.execute('ALTER TABLE habits ADD COLUMN archivedAt TEXT;');
      }
    } catch (e) {
      console.warn('[DatabaseManager] Habits column evolution warning:', e);
    }

    // 6. Ensure habit_logs columns exist
    try {
      const habitLogCols = await this.adapter.execute('PRAGMA table_info(habit_logs);');
      const habitLogColNames = new Set(habitLogCols.rows.map((r: any) => r.name));
      if (!habitLogColNames.has('notes')) {
        await this.adapter.execute('ALTER TABLE habit_logs ADD COLUMN notes TEXT;');
      }
    } catch (e) {
      console.warn('[DatabaseManager] HabitLogs column evolution warning:', e);
    }

    // 7. Ensure calendar_events columns exist
    try {
      const eventCols = await this.adapter.execute('PRAGMA table_info(calendar_events);');
      const eventColNames = new Set(eventCols.rows.map((r: any) => r.name));
      if (!eventColNames.has('date')) {
        await this.adapter.execute("ALTER TABLE calendar_events ADD COLUMN date TEXT DEFAULT '';");
      }
      if (!eventColNames.has('time')) {
        await this.adapter.execute("ALTER TABLE calendar_events ADD COLUMN time TEXT DEFAULT '';");
      }
      if (!eventColNames.has('ringAlarm')) {
        await this.adapter.execute('ALTER TABLE calendar_events ADD COLUMN ringAlarm INTEGER DEFAULT 1;');
      }
      if (!eventColNames.has('status')) {
        await this.adapter.execute("ALTER TABLE calendar_events ADD COLUMN status TEXT DEFAULT 'active';");
      }
    } catch (e) {
      console.warn('[DatabaseManager] CalendarEvents column evolution warning:', e);
    }

    // 8. Ensure movie_bookmarks columns exist & migrate legacy tmdbId UNIQUE constraint if present
    try {
      const tableSqlRes = await this.adapter.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='movie_bookmarks';"
      );
      const createTableSql = String(tableSqlRes.rows[0]?.sql || '');

      if (/tmdbId\s+INTEGER\s+UNIQUE/i.test(createTableSql)) {
        await this.adapter.execute(`
          CREATE TABLE IF NOT EXISTS movie_bookmarks_v2 (
            id TEXT PRIMARY KEY,
            tmdbId INTEGER NOT NULL,
            title TEXT NOT NULL,
            overview TEXT,
            posterPath TEXT,
            backdropPath TEXT,
            voteAverage REAL DEFAULT 0,
            releaseDate TEXT,
            genres TEXT,
            runtime INTEGER DEFAULT 0,
            isWatched INTEGER NOT NULL DEFAULT 0,
            isTv INTEGER NOT NULL DEFAULT 0,
            savedAt TEXT NOT NULL
          );
        `);
        const hasIsTv = createTableSql.includes('isTv');
        if (hasIsTv) {
          await this.adapter.execute(`
            INSERT OR IGNORE INTO movie_bookmarks_v2 (
              id, tmdbId, title, overview, posterPath, backdropPath,
              voteAverage, releaseDate, genres, runtime, isWatched, isTv, savedAt
            ) SELECT id, tmdbId, title, overview, posterPath, backdropPath,
                     voteAverage, releaseDate, genres, runtime, isWatched, isTv, savedAt
              FROM movie_bookmarks;
          `);
        } else {
          await this.adapter.execute(`
            INSERT OR IGNORE INTO movie_bookmarks_v2 (
              id, tmdbId, title, overview, posterPath, backdropPath,
              voteAverage, releaseDate, genres, runtime, isWatched, isTv, savedAt
            ) SELECT id, tmdbId, title, overview, posterPath, backdropPath,
                     voteAverage, releaseDate, genres, runtime, isWatched, 0, savedAt
              FROM movie_bookmarks;
          `);
        }
        await this.adapter.execute('DROP TABLE movie_bookmarks;');
        await this.adapter.execute('ALTER TABLE movie_bookmarks_v2 RENAME TO movie_bookmarks;');
      } else {
        const bookmarkCols = await this.adapter.execute('PRAGMA table_info(movie_bookmarks);');
        const bookmarkColNames = new Set(bookmarkCols.rows.map((r: any) => r.name));
        if (!bookmarkColNames.has('isTv')) {
          await this.adapter.execute('ALTER TABLE movie_bookmarks ADD COLUMN isTv INTEGER NOT NULL DEFAULT 0;');
        }
      }
    } catch (e) {
      console.warn('[DatabaseManager] MovieBookmarks evolution warning:', e);
    }

    // 9. Performance Indexes (Individual error isolation to prevent cascade abortion)
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_tasks_status_date ON tasks(status, date);',
      'CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);',
      'CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(categoryId);',
      'CREATE INDEX IF NOT EXISTS idx_tasks_series ON tasks(seriesId);',
      'CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tasks(status, date, startTime);',
      'CREATE INDEX IF NOT EXISTS idx_keep_notes_active ON keep_notes(isArchived, isTrashed, isPinned, updatedAt);',
      'CREATE INDEX IF NOT EXISTS idx_keep_notes_reminder ON keep_notes(reminderTime);',
      'CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habitId, date);',
      'CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_bookmarks_tmdb_tv ON movie_bookmarks(tmdbId, isTv);',
      'CREATE INDEX IF NOT EXISTS idx_movie_bookmarks_watched ON movie_bookmarks(isWatched);',
    ];

    for (const idxSql of indexes) {
      try {
        await this.adapter.execute(idxSql);
      } catch (idxErr) {
        console.warn('[DatabaseManager] Index creation warning:', idxSql, idxErr);
      }
    }
  }

  private async runSeeds(): Promise<void> {
    if (!this.adapter) return;
    try {
      await seedDatabase(this.adapter);
    } catch (err) {
      console.warn('[DatabaseManager] runSeeds warning:', err);
    }
  }
}

/**
 * Returns the singleton database adapter, initializing it on first call.
 */
export const getDatabase = async (): Promise<DatabaseAdapter> => {
  return await DatabaseManager.getInstance().getAdapter();
};

/**
 * Synchronous check whether database adapter is already initialized.
 */
export const isDatabaseReady = (): boolean => {
  return DatabaseManager.getInstance().isReady();
};

export default {
  getDatabase,
  isDatabaseReady,
  DatabaseManager,
  InMemoryDatabaseAdapter,
};
