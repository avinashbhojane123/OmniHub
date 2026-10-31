import { Platform } from 'react-native';
import { getDatabase } from '../../database/connection';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { tombstoneRepository } from '../../database/repositories/TombstoneRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { categoryRepository } from '../../database/repositories/CategoryRepository';
import { Task, TaskPriority, TaskStatus, EisenhowerQuadrant } from '../../types';
import { syncEventBus } from '../backup/SyncEventBus';
import { normalizeTimeTo24H } from '../../utils/time';
import { sanitizeDateString } from './TaskService';

export interface TaskSyncResult {
  success: boolean;
  syncedCount: number;
  serverUpsertCount?: number;
  serverDeleteCount?: number;
  message: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

const VALID_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high']);
const VALID_STATUSES = new Set<TaskStatus>(['pending', 'in_progress', 'completed', 'overdue', 'cancelled']);
const VALID_QUADRANTS = new Set<EisenhowerQuadrant>(['q1', 'q2', 'q3', 'q4']);

export class TaskBackendSyncService {
  private static instance: TaskBackendSyncService;

  public static readonly SETTINGS_KEY_SERVER = 'task_backend_server_url';
  public static readonly SETTINGS_KEY_LAST_SYNC = 'task_backend_last_sync_timestamp';

  // Cached in-memory URL (falls back to platform defaults or settings)
  private backendUrl: string =
    Platform.OS === 'android' ? 'http://10.0.2.2:10000' : 'http://localhost:10000';

  private isSyncing = false;
  private hasPendingSync = false;
  private isConnected = false;
  private lastSyncTimestamp: string | null = null;
  private listeners: Set<(connected: boolean) => void> = new Set();
  private syncTimer: any = null;
  private retryTimer: any = null;
  private unsubscribeEventBus: (() => void) | null = null;

  public static getInstance(): TaskBackendSyncService {
    if (!TaskBackendSyncService.instance) {
      TaskBackendSyncService.instance = new TaskBackendSyncService();
    }
    return TaskBackendSyncService.instance;
  }

  constructor() {
    // Listen to local task changes and trigger background sync to NestJS backend
    this.unsubscribeEventBus = syncEventBus.subscribeToChanges((mutation) => {
      // Prevent cascading echo loops when sync service itself writes to SQLite
      if (this.isSyncing) return;
      if (mutation && mutation.entityType === 'task') {
        this.scheduleSync(2500);
      }
    });
  }

  public subscribeStatus(listener: (connected: boolean) => void): () => void {
    this.listeners.add(listener);
    try {
      listener(this.isConnected);
    } catch (e) {
      console.warn('[TaskBackendSyncService] Status listener error:', e);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getIsSyncing(): boolean {
    return this.isSyncing;
  }

  private notifyStatus(connected: boolean): void {
    const statusChanged = this.isConnected !== connected;
    this.isConnected = connected;
    if (statusChanged) {
      this.listeners.forEach((fn) => {
        try {
          fn(connected);
        } catch (e) {
          console.warn('[TaskBackendSyncService] Status listener execution error:', e);
        }
      });
    }
  }

  public scheduleSync(delayMs = 2500): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncTimer = setTimeout(() => {
      this.syncWithBackend().catch((err) => {
        console.warn('[TaskBackendSyncService] Sync failed (offline):', err?.message);
      });
    }, delayMs);
  }

  public cancelScheduledSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  public async getBackendUrl(): Promise<string> {
    try {
      const saved = await settingsRepository.get(TaskBackendSyncService.SETTINGS_KEY_SERVER, '');
      if (saved && saved.trim().length > 0) {
        let clean = saved.trim().replace(/\/+$/, '');
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
          clean = `http://${clean}`;
        }
        this.backendUrl = clean;
        return clean;
      }

      // Check if OTA server URL was configured and adapt to NestJS backend port 10000
      const otaUrl = await settingsRepository.get('ota_server_url', '');
      if (otaUrl && otaUrl.trim().length > 0) {
        let cleanOta = otaUrl.trim().replace(/\/+$/, '');
        if (!cleanOta.startsWith('http://') && !cleanOta.startsWith('https://')) {
          cleanOta = `http://${cleanOta}`;
        }
        const replaced = cleanOta.replace(/:\d+$/, ':10000');
        this.backendUrl = replaced;
        return replaced;
      }
    } catch {
      // Fallback to in-memory/platform default
    }

    return this.backendUrl;
  }

  public async setBackendUrl(url: string): Promise<void> {
    if (url && url.trim().length > 0) {
      let clean = url.trim().replace(/\/+$/, '');
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `http://${clean}`;
      }
      this.backendUrl = clean;
      try {
        await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_SERVER, clean);
      } catch (e) {
        console.warn('[TaskBackendSyncService] Failed to persist backend URL:', e);
      }
    }
  }

  public async getLastSyncTimestamp(): Promise<string | null> {
    if (this.lastSyncTimestamp) return this.lastSyncTimestamp;
    try {
      const saved = await settingsRepository.get(TaskBackendSyncService.SETTINGS_KEY_LAST_SYNC, '');
      if (saved && saved.trim().length > 0) {
        this.lastSyncTimestamp = saved.trim();
        return this.lastSyncTimestamp;
      }
    } catch {
      // Fallback
    }
    return null;
  }

  public async resetSyncState(): Promise<void> {
    this.lastSyncTimestamp = null;
    try {
      await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_LAST_SYNC, '');
    } catch {}
  }

  public async testConnection(customUrl?: string, timeoutMs = 4000): Promise<ConnectionTestResult> {
    try {
      const activeUrl = customUrl ? customUrl.trim().replace(/\/+$/, '') : await this.getBackendUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${activeUrl}/api/tasks?limit=1`, {
          method: 'GET',
          signal: controller.signal,
        });

        const ok = response.ok;
        this.notifyStatus(ok);
        return {
          success: ok,
          message: ok ? 'Successfully connected to NestJS backend.' : `Backend returned HTTP ${response.status}`,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (e: any) {
      this.notifyStatus(false);
      return {
        success: false,
        message: e?.message || 'Could not connect to backend server.',
      };
    }
  }

  public async syncWithBackend(timeoutMs = 8000): Promise<TaskSyncResult> {
    if (this.isSyncing) {
      this.hasPendingSync = true;
      return {
        success: false,
        syncedCount: 0,
        message: 'Sync already in progress; queued for immediate follow-up.',
      };
    }
    this.isSyncing = true;

    try {
      const allLocalTasks = await taskRepository.findAll();
      const allTombstones = await tombstoneRepository.getAll();
      const deletedTaskIds = allTombstones
        .filter((t) => t.entityType === 'task')
        .map((t) => t.id);

      // Clean outgoing payload ensuring no unwhitelisted join properties cause HTTP 400
      const sanitizedUpserts = allLocalTasks.map((t) => ({
        id: t.id,
        seriesId: t.seriesId ?? undefined,
        title: t.title,
        description: t.description ?? undefined,
        date: t.date ?? '',
        startTime: t.startTime ?? undefined,
        endTime: t.endTime ?? undefined,
        priority: t.priority ?? 'medium',
        categoryId: t.categoryId ? t.categoryId.trim() : undefined,
        status: t.status ?? 'pending',
        recurrenceRule: t.recurrenceRule ?? undefined,
        reminderMinutes: typeof t.reminderMinutes === 'number' && t.reminderMinutes >= 0 ? t.reminderMinutes : 0,
        snoozeUntil: t.snoozeUntil ?? undefined,
        notes: t.notes ?? undefined,
        isLoudAlarm: Boolean(t.isLoudAlarm),
        isOvernight: Boolean(t.isOvernight),
        eisenhowerQuadrant: t.eisenhowerQuadrant ?? undefined,
        accentColor: t.accentColor ?? undefined,
        estimatedMinutes: typeof t.estimatedMinutes === 'number' && t.estimatedMinutes > 0 ? t.estimatedMinutes : undefined,
        completedAt: t.completedAt ?? undefined,
      }));

      const activeUrl = await this.getBackendUrl();
      const sinceTimestamp = await this.getLastSyncTimestamp();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(`${activeUrl}/api/tasks/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Platform': Platform.OS,
          },
          body: JSON.stringify({
            upserts: sanitizedUpserts,
            deletedIds: deletedTaskIds,
            since: sinceTimestamp || undefined,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        this.notifyStatus(false);
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();
      const newTimestamp = result.timestamp || new Date().toISOString();
      this.lastSyncTimestamp = newTimestamp;
      try {
        await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_LAST_SYNC, newTimestamp);
      } catch {}

      this.notifyStatus(true);

      const db = await getDatabase();
      let changedCount = 0;
      let serverUpsertCount = 0;
      let serverDeleteCount = 0;

      // 1. Clear successfully acknowledged local tombstones
      if (deletedTaskIds.length > 0) {
        await tombstoneRepository.deleteByIds(deletedTaskIds);
      }

      // Build a set of recently deleted task IDs to prevent resurrecting deleted tasks
      const deletedIdSet = new Set(deletedTaskIds);

      // Perform all ingestion inside an atomic transaction for speed & ACID integrity
      await db.transaction(async (tx) => {
        // 2. Ingest server deletions into local SQLite without recording new tombstones
        if (result.serverDeletions && Array.isArray(result.serverDeletions) && result.serverDeletions.length > 0) {
          for (const delId of result.serverDeletions) {
            if (!delId) continue;
            await tx.execute('DELETE FROM tasks WHERE id = ?', [delId]);
            await tombstoneRepository.deleteByIds([delId]);
            changedCount++;
            serverDeleteCount++;
          }
        }

        // 3. Ingest server tasks into local SQLite (Two-Way Delta Merge with Last-Write-Wins)
        if (result.serverTasks && Array.isArray(result.serverTasks) && result.serverTasks.length > 0) {
          for (const st of result.serverTasks) {
            if (!st || !st.id || deletedIdSet.has(st.id)) {
              continue;
            }

            let recurrenceJson: string | null = null;
            if (st.recurrenceRule) {
              if (typeof st.recurrenceRule === 'object') {
                recurrenceJson = JSON.stringify(st.recurrenceRule);
              } else if (typeof st.recurrenceRule === 'string') {
                try {
                  JSON.parse(st.recurrenceRule);
                  recurrenceJson = st.recurrenceRule;
                } catch {
                  recurrenceJson = null;
                }
              }
            }

            const existing = await taskRepository.findById(st.id);
            const serverUpdated = st.updatedAt ? new Date(st.updatedAt).getTime() : 0;
            const localUpdated = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

            // If task does not exist locally or server has newer/equal modification timestamp:
            if (!existing || serverUpdated >= localUpdated) {
              const isLoudAlarmVal = st.isLoudAlarm ? 1 : 0;
              const isOvernightVal = st.isOvernight ? 1 : 0;
              const normDate = st.date ? sanitizeDateString(st.date) : '';
              const normStart = st.startTime ? (normalizeTimeTo24H(st.startTime) ?? null) : null;
              const normEnd = st.endTime ? (normalizeTimeTo24H(st.endTime) ?? null) : null;
              const nowIso = new Date().toISOString();

              // Foreign key safety for categories
              let validCategoryId: string | null = null;
              if (st.categoryId && typeof st.categoryId === 'string') {
                const cleanCat = st.categoryId.trim();
                if (cleanCat.length > 0) {
                  const catExists = await categoryRepository.findById(cleanCat);
                  if (catExists) {
                    validCategoryId = cleanCat;
                  }
                }
              }

              // Validate enums
              const validPriority = VALID_PRIORITIES.has(st.priority) ? st.priority : 'medium';
              const validStatus = VALID_STATUSES.has(st.status) ? st.status : 'pending';
              const validQuadrant = VALID_QUADRANTS.has(st.eisenhowerQuadrant) ? st.eisenhowerQuadrant : null;

              // Ensure completedAt consistency
              const resolvedCompletedAt = validStatus === 'completed'
                ? (st.completedAt ? new Date(st.completedAt).toISOString() : nowIso)
                : null;

              // Sanitize snoozeUntil
              let validSnooze: string | null = null;
              if (st.snoozeUntil && typeof st.snoozeUntil === 'string') {
                const parsedSnooze = new Date(st.snoozeUntil);
                if (!isNaN(parsedSnooze.getTime())) {
                  validSnooze = parsedSnooze.toISOString();
                }
              }

              await tx.execute(
                `INSERT OR REPLACE INTO tasks (
                  id, seriesId, title, description, date, startTime, endTime,
                  priority, categoryId, status, recurrenceRule,
                  reminderMinutes, snoozeUntil, notes, isLoudAlarm, isOvernight,
                  eisenhowerQuadrant, accentColor, estimatedMinutes,
                  createdAt, updatedAt, completedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  st.id,
                  st.seriesId ?? null,
                  st.title ? String(st.title).trim() : 'Untitled Task',
                  st.description ?? null,
                  normDate,
                  normStart,
                  normEnd,
                  validPriority,
                  validCategoryId,
                  validStatus,
                  recurrenceJson,
                  typeof st.reminderMinutes === 'number' && st.reminderMinutes >= 0 ? st.reminderMinutes : 0,
                  validSnooze,
                  st.notes ?? null,
                  isLoudAlarmVal,
                  isOvernightVal,
                  validQuadrant,
                  st.accentColor ?? null,
                  typeof st.estimatedMinutes === 'number' && st.estimatedMinutes > 0 ? st.estimatedMinutes : null,
                  st.createdAt ? new Date(st.createdAt).toISOString() : nowIso,
                  st.updatedAt ? new Date(st.updatedAt).toISOString() : nowIso,
                  resolvedCompletedAt,
                ]
              );
              changedCount++;
              serverUpsertCount++;
            }
          }
        }
      });

      // Notify UI screens that local SQLite task store has been updated from the cloud
      if (changedCount > 0) {
        syncEventBus.notifyDataRestored();
      }

      return {
        success: true,
        syncedCount: allLocalTasks.length,
        serverUpsertCount,
        serverDeleteCount,
        message: 'Tasks synchronized successfully with NestJS backend.',
      };
    } catch (err: any) {
      this.notifyStatus(false);

      // Auto-retry once in 15 seconds if offline to self-heal when connection returns
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.syncWithBackend().catch(() => {});
      }, 15000);

      return {
        success: false,
        syncedCount: 0,
        message: err?.message || 'Network error during backend sync.',
      };
    } finally {
      this.isSyncing = false;
      if (this.hasPendingSync) {
        this.hasPendingSync = false;
        this.scheduleSync(300);
      }
    }
  }

  public destroy(): void {
    this.cancelScheduledSync();
    if (this.unsubscribeEventBus) {
      this.unsubscribeEventBus();
      this.unsubscribeEventBus = null;
    }
    this.listeners.clear();
  }
}

export const taskBackendSyncService = TaskBackendSyncService.getInstance();
