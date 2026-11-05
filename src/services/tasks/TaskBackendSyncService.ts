import { Platform } from 'react-native';
import { getDatabase } from '../../database/connection';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { tombstoneRepository } from '../../database/repositories/TombstoneRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { categoryRepository } from '../../database/repositories/CategoryRepository';
import { Task, TaskPriority, TaskStatus, EisenhowerQuadrant } from '../../types';
import { syncEventBus } from '../backup/SyncEventBus';
import { normalizeTimeTo24H } from '../../utils/time';
import { sanitizeDateString, shouldScheduleReminder } from './TaskService';
import { notificationService } from '../notifications/NotificationService';

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

function normalizePriority(val: any): TaskPriority {
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase() as TaskPriority;
    if (VALID_PRIORITIES.has(lower)) return lower;
  }
  return 'medium';
}

function normalizeStatus(val: any): TaskStatus {
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase() as TaskStatus;
    if (VALID_STATUSES.has(lower)) return lower;
  }
  return 'pending';
}

function normalizeQuadrant(val: any): EisenhowerQuadrant | null {
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase() as EisenhowerQuadrant;
    if (VALID_QUADRANTS.has(lower)) return lower;
  }
  return null;
}

function sanitizeReminderMinutes(val: any): number {
  if (val === undefined || val === null) return 0;
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  const intVal = Math.floor(num);
  return intVal >= -1 ? intVal : 0;
}

function sanitizeEstimatedMinutes(val: any): number | null {
  if (val === undefined || val === null) return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

function safeIsoDate(raw: any, fallback: string): string {
  if (!raw) return fallback;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? fallback : d.toISOString();
}

function safeTimestamp(dateVal: any, fallbackVal?: any): number {
  if (dateVal) {
    const t = new Date(dateVal).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (fallbackVal) {
    const t2 = new Date(fallbackVal).getTime();
    if (Number.isFinite(t2)) return t2;
  }
  return 0;
}

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
      // Snapshot listeners array to prevent skipped calls if a listener unsubscribes during broadcast
      const snapshot = Array.from(this.listeners);
      snapshot.forEach((fn) => {
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
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.syncTimer = setTimeout(() => {
      this.syncWithBackend().catch((err) => {
        console.warn('[TaskBackendSyncService] Sync failed (offline):', err?.message);
      });
    }, delayMs);
    if (this.syncTimer && typeof this.syncTimer.unref === 'function') {
      this.syncTimer.unref();
    }
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
    this.hasPendingSync = false;
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
      const isTimeout = e?.name === 'AbortError';
      return {
        success: false,
        message: isTimeout
          ? 'Connection timed out while contacting backend server.'
          : e?.message || 'Could not connect to backend server.',
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
      const deletedTaskIds = Array.from(
        new Set(
          allTombstones
            .filter((t) => t.entityType === 'task')
            .map((t) => t.id)
        )
      );
      const deletedIdSet = new Set(deletedTaskIds);
      const activeLocalTasks = allLocalTasks.filter((t) => !deletedIdSet.has(t.id));

      // Clean outgoing payload ensuring no unwhitelisted join properties cause HTTP 400
      const sanitizedUpserts = activeLocalTasks.map((t) => {
        const cleanDate = t.date ? sanitizeDateString(t.date) : '';
        const cleanTitle = t.title ? t.title.trim() : '';
        const finalTitle = cleanTitle || 'Untitled Task';
        const cleanDesc = t.description?.trim();
        const cleanNotes = t.notes?.trim();
        const cleanSeries = t.seriesId?.trim();
        const cleanCategory = t.categoryId?.trim();
        const cleanAccent = t.accentColor?.trim();

        // Clear times if task has no date (backlog)
        const rawStart = cleanDate && t.startTime ? normalizeTimeTo24H(t.startTime) ?? undefined : undefined;
        const rawEnd = cleanDate && t.endTime ? normalizeTimeTo24H(t.endTime) ?? undefined : undefined;
        const cleanEst = sanitizeEstimatedMinutes(t.estimatedMinutes);

        const nowIso = new Date().toISOString();
        const createdAtIso = t.createdAt ? safeIsoDate(t.createdAt, nowIso) : nowIso;
        const updatedAtIso = t.updatedAt ? safeIsoDate(t.updatedAt, createdAtIso) : createdAtIso;

        return {
          id: t.id,
          seriesId: cleanSeries || undefined,
          title: finalTitle,
          description: cleanDesc || undefined,
          date: cleanDate,
          startTime: rawStart,
          endTime: rawEnd,
          priority: normalizePriority(t.priority),
          categoryId: cleanCategory || undefined,
          status: normalizeStatus(t.status),
          recurrenceRule: t.recurrenceRule ?? undefined,
          reminderMinutes: sanitizeReminderMinutes(t.reminderMinutes),
          snoozeUntil: t.snoozeUntil ? safeIsoDate(t.snoozeUntil, '') || undefined : undefined,
          notes: cleanNotes || undefined,
          isLoudAlarm: Boolean(t.isLoudAlarm),
          isOvernight: Boolean(t.isOvernight),
          eisenhowerQuadrant: normalizeQuadrant(t.eisenhowerQuadrant) || undefined,
          accentColor: cleanAccent || undefined,
          estimatedMinutes: cleanEst !== null ? cleanEst : undefined,
          completedAt: t.completedAt ? safeIsoDate(t.completedAt, '') || undefined : undefined,
          createdAt: createdAtIso,
          updatedAt: updatedAtIso,
        };
      });

      const activeUrl = await this.getBackendUrl();
      const rawSince = await this.getLastSyncTimestamp();
      const sinceTimestamp = rawSince ? safeIsoDate(rawSince, '') || undefined : undefined;

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
            since: sinceTimestamp,
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
      const newTimestamp = safeIsoDate(result.timestamp, new Date().toISOString());

      this.notifyStatus(true);

      const db = await getDatabase();
      let changedCount = 0;
      let serverUpsertCount = 0;
      let serverDeleteCount = 0;

      // 1. Clear successfully acknowledged local tombstones
      if (deletedTaskIds.length > 0) {
        await tombstoneRepository.deleteByIds(deletedTaskIds);
      }

      // Re-fetch tombstones to protect tasks deleted locally while fetch was in-flight
      const freshTombstones = await tombstoneRepository.getAll();
      const allKnownDeletedIds = new Set([
        ...deletedTaskIds,
        ...freshTombstones.filter((t) => t.entityType === 'task').map((t) => t.id),
      ]);

      // Pre-fetch all local categories to enable O(1) in-memory foreign key validation
      const localCategories = await categoryRepository.findAll();
      const validCategoryIds = new Set(localCategories.map((c) => c.id));

      // Build an in-memory map of existing local tasks to eliminate redundant SELECT queries
      const localTaskMap = new Map<string, Task>(allLocalTasks.map((t) => [t.id, t]));

      const deletedTaskIdsForNotification: string[] = [];
      const upsertedTasksForNotification: Task[] = [];

      // Perform all ingestion inside an atomic transaction for speed & ACID integrity
      await db.transaction(async (tx) => {
        // 2. Ingest server deletions into local SQLite without recording new tombstones
        const processedServerDeletions = new Set<string>();
        if (result.serverDeletions && Array.isArray(result.serverDeletions) && result.serverDeletions.length > 0) {
          for (const delId of result.serverDeletions) {
            if (!delId || processedServerDeletions.has(delId)) continue;
            processedServerDeletions.add(delId);

            await tx.execute('DELETE FROM tasks WHERE id = ?', [delId]);
            await tx.execute('DELETE FROM sync_tombstones WHERE id = ?', [delId]);
            if (localTaskMap.has(delId)) {
              localTaskMap.delete(delId);
              deletedTaskIdsForNotification.push(delId);
              changedCount++;
            }
            serverDeleteCount++;
          }
        }

        // 3. Ingest server tasks into local SQLite (Two-Way Delta Merge with Last-Write-Wins)
        const processedServerTasks = new Set<string>();
        if (result.serverTasks && Array.isArray(result.serverTasks) && result.serverTasks.length > 0) {
          for (const st of result.serverTasks) {
            if (!st || !st.id || processedServerTasks.has(st.id) || allKnownDeletedIds.has(st.id)) {
              continue;
            }
            processedServerTasks.add(st.id);

            let recurrenceJson: string | null = null;
            let parsedRule: any = null;
            if (st.recurrenceRule) {
              if (typeof st.recurrenceRule === 'object') {
                parsedRule = st.recurrenceRule;
                try {
                  recurrenceJson = JSON.stringify(st.recurrenceRule);
                } catch {
                  recurrenceJson = null;
                }
              } else if (typeof st.recurrenceRule === 'string' && st.recurrenceRule.trim().length > 0) {
                try {
                  const parsed = JSON.parse(st.recurrenceRule.trim());
                  if (parsed && typeof parsed === 'object') {
                    parsedRule = parsed;
                    recurrenceJson = JSON.stringify(parsed);
                  }
                } catch {
                  recurrenceJson = null;
                }
              }
            }

            const existing = localTaskMap.get(st.id);
            const serverUpdated = safeTimestamp(st.updatedAt, st.createdAt);
            const localUpdated = safeTimestamp(existing?.updatedAt, existing?.createdAt);

            // If task does not exist locally or server has newer/equal modification timestamp:
            if (!existing || serverUpdated >= localUpdated) {
              const isLoudAlarmVal = (st.isLoudAlarm !== undefined && st.isLoudAlarm !== null)
                ? (st.isLoudAlarm ? 1 : 0)
                : (parsedRule?.isLoudAlarm ? 1 : 0);
              const isOvernightVal = (st.isOvernight !== undefined && st.isOvernight !== null)
                ? (st.isOvernight ? 1 : 0)
                : (parsedRule?.isOvernight ? 1 : 0);

              const normDate = st.date ? sanitizeDateString(st.date) : '';
              // Clear times if task date is empty (backlog task)
              const normStart = normDate && st.startTime ? (normalizeTimeTo24H(st.startTime) ?? null) : null;
              const normEnd = normDate && st.endTime ? (normalizeTimeTo24H(st.endTime) ?? null) : null;
              const nowIso = new Date().toISOString();

              // Safe Title: Never allow empty or whitespace-only titles
              const rawTitle = st.title ? String(st.title).trim() : '';
              const finalTitle = rawTitle || 'Untitled Task';

              // Foreign key safety for categories via in-memory lookup
              let validCategoryId: string | null = null;
              if (st.categoryId && typeof st.categoryId === 'string') {
                const cleanCat = st.categoryId.trim();
                if (cleanCat.length > 0 && validCategoryIds.has(cleanCat)) {
                  validCategoryId = cleanCat;
                }
              }

              // Validate enums (case-insensitive)
              const validPriority = normalizePriority(st.priority);
              const validStatus = normalizeStatus(st.status);
              const validQuadrant = normalizeQuadrant(st.eisenhowerQuadrant);

              // Ensure completedAt consistency
              const resolvedCompletedAt = validStatus === 'completed'
                ? (st.completedAt ? safeIsoDate(st.completedAt, nowIso) : nowIso)
                : null;

              // Sanitize snoozeUntil
              let validSnooze: string | null = null;
              if (st.snoozeUntil && typeof st.snoozeUntil === 'string') {
                const parsedSnooze = new Date(st.snoozeUntil);
                if (!isNaN(parsedSnooze.getTime())) {
                  validSnooze = parsedSnooze.toISOString();
                }
              }

              // Sanitize integers (supports -1 for disabled reminder)
              const cleanRemMin = sanitizeReminderMinutes(st.reminderMinutes);
              const cleanEstMin = sanitizeEstimatedMinutes(st.estimatedMinutes);

              const cleanSeriesId = st.seriesId ? String(st.seriesId).trim() || null : null;
              const cleanDesc = st.description ? String(st.description).trim() || null : null;
              const cleanNotes = st.notes ? String(st.notes).trim() || null : null;
              const cleanAccent = st.accentColor ? String(st.accentColor).trim() || null : null;

              const createdAtIso = safeIsoDate(st.createdAt, nowIso);
              const updatedAtIso = safeIsoDate(st.updatedAt, nowIso);

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
                  cleanSeriesId,
                  finalTitle,
                  cleanDesc,
                  normDate,
                  normStart,
                  normEnd,
                  validPriority,
                  validCategoryId,
                  validStatus,
                  recurrenceJson,
                  cleanRemMin,
                  validSnooze,
                  cleanNotes,
                  isLoudAlarmVal,
                  isOvernightVal,
                  validQuadrant,
                  cleanAccent,
                  cleanEstMin,
                  createdAtIso,
                  updatedAtIso,
                  resolvedCompletedAt,
                ]
              );

              const updatedLocalTask: Task = {
                id: st.id,
                seriesId: cleanSeriesId ?? undefined,
                title: finalTitle,
                description: cleanDesc ?? undefined,
                date: normDate,
                startTime: normStart ?? undefined,
                endTime: normEnd ?? undefined,
                priority: validPriority,
                categoryId: validCategoryId ?? undefined,
                status: validStatus,
                recurrenceRule: parsedRule ?? undefined,
                reminderMinutes: cleanRemMin,
                snoozeUntil: validSnooze ?? undefined,
                notes: cleanNotes ?? undefined,
                isLoudAlarm: Boolean(isLoudAlarmVal),
                isOvernight: Boolean(isOvernightVal),
                eisenhowerQuadrant: validQuadrant ?? undefined,
                accentColor: cleanAccent ?? undefined,
                estimatedMinutes: cleanEstMin ?? undefined,
                createdAt: createdAtIso,
                updatedAt: updatedAtIso,
                completedAt: resolvedCompletedAt ?? undefined,
              };

              localTaskMap.set(st.id, updatedLocalTask);
              upsertedTasksForNotification.push(updatedLocalTask);

              changedCount++;
              serverUpsertCount++;
            }
          }
        }
      });

      // Update and persist sync timestamp only AFTER local transaction has succeeded
      this.lastSyncTimestamp = newTimestamp;
      try {
        await settingsRepository.set(TaskBackendSyncService.SETTINGS_KEY_LAST_SYNC, newTimestamp);
      } catch (e) {
        console.warn('[TaskBackendSyncService] Failed to persist last sync timestamp:', e);
      }

      // 4. Reconcile notifications for remotely deleted tasks outside transaction
      for (const delId of deletedTaskIdsForNotification) {
        try {
          await notificationService.cancelTaskReminder(delId);
        } catch (e) {
          console.warn('[TaskBackendSyncService] Failed to cancel reminder for deleted task:', delId, e);
        }
      }

      // 5. Reconcile notifications for remotely upserted tasks outside transaction
      for (const task of upsertedTasksForNotification) {
        try {
          if (shouldScheduleReminder(task)) {
            await notificationService.scheduleTaskReminder(task);
          } else {
            await notificationService.cancelTaskReminder(task.id);
          }
        } catch (e) {
          console.warn('[TaskBackendSyncService] Failed to update reminder for upserted task:', task.id, e);
        }
      }

      // 6. Notify UI screens that local SQLite task store has been updated from the cloud
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
      if (this.retryTimer && typeof this.retryTimer.unref === 'function') {
        this.retryTimer.unref();
      }

      const isTimeout = err?.name === 'AbortError';
      return {
        success: false,
        syncedCount: 0,
        message: isTimeout
          ? 'Connection timed out while syncing with backend.'
          : err?.message || 'Network error during backend sync.',
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
