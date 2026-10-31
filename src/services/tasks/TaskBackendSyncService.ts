import { Platform } from 'react-native';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { tombstoneRepository } from '../../database/repositories/TombstoneRepository';
import { Task } from '../../types';
import { syncEventBus } from '../backup/SyncEventBus';

export interface TaskSyncResult {
  success: boolean;
  syncedCount: number;
  message: string;
}

export class TaskBackendSyncService {
  private static instance: TaskBackendSyncService;
  // Default to NestJS backend port 10000 (with Android emulator 10.0.2.2 support)
  private backendUrl: string =
    Platform.OS === 'android' ? 'http://10.0.2.2:10000' : 'http://localhost:10000';
  private isSyncing = false;
  private isConnected = false;
  private lastSyncTimestamp: string | null = null;
  private listeners: Set<(connected: boolean) => void> = new Set();

  public static getInstance(): TaskBackendSyncService {
    if (!TaskBackendSyncService.instance) {
      TaskBackendSyncService.instance = new TaskBackendSyncService();
    }
    return TaskBackendSyncService.instance;
  }

  constructor() {
    // Listen to local task changes and trigger background sync to NestJS backend
    syncEventBus.subscribeToChanges((mutation) => {
      if (mutation && mutation.entityType === 'task') {
        this.scheduleSync(2500);
      }
    });
  }

  public subscribeStatus(listener: (connected: boolean) => void) {
    this.listeners.add(listener);
    listener(this.isConnected);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  private notifyStatus(connected: boolean) {
    this.isConnected = connected;
    this.listeners.forEach((fn) => fn(connected));
  }

  private syncTimer: any = null;
  public scheduleSync(delayMs = 2500) {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncWithBackend().catch((err) => {
        console.warn('[TaskBackendSyncService] Sync failed (offline):', err?.message);
      });
    }, delayMs);
  }

  public setBackendUrl(url: string) {
    if (url) {
      this.backendUrl = url.replace(/\/+$/, '');
    }
  }

  public async syncWithBackend(): Promise<TaskSyncResult> {
    if (this.isSyncing) {
      return { success: false, syncedCount: 0, message: 'Sync already in progress' };
    }
    this.isSyncing = true;

    try {
      const allLocalTasks = await taskRepository.findAll();
      const allTombstones = await tombstoneRepository.getAll();
      const deletedTaskIds = allTombstones
        .filter((t) => t.entityType === 'task')
        .map((t) => t.id);

      const response = await fetch(`${this.backendUrl}/api/tasks/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': Platform.OS,
        },
        body: JSON.stringify({
          upserts: allLocalTasks,
          deletedIds: deletedTaskIds,
          since: this.lastSyncTimestamp || undefined,
        }),
      });

      if (!response.ok) {
        this.notifyStatus(false);
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();
      this.lastSyncTimestamp = result.timestamp || new Date().toISOString();
      this.notifyStatus(true);

      // 1. Clear successfully synced tombstones
      if (deletedTaskIds.length > 0) {
        await tombstoneRepository.deleteByIds(deletedTaskIds);
      }

      // 2. Ingest server deletions into local SQLite
      if (result.serverDeletions && Array.isArray(result.serverDeletions) && result.serverDeletions.length > 0) {
        for (const delId of result.serverDeletions) {
          await taskRepository.delete(delId);
        }
      }

      // 3. Ingest server tasks into local SQLite (two-way merge)
      if (result.serverTasks && Array.isArray(result.serverTasks) && result.serverTasks.length > 0) {
        for (const st of result.serverTasks) {
          const existing = await taskRepository.findById(st.id);
          const recurrenceParsed =
            st.recurrenceRule && typeof st.recurrenceRule === 'string'
              ? JSON.parse(st.recurrenceRule)
              : st.recurrenceRule ?? undefined;

          if (!existing) {
            await taskRepository.create({
              id: st.id,
              seriesId: st.seriesId ?? undefined,
              title: st.title,
              description: st.description ?? undefined,
              date: st.date ?? '',
              startTime: st.startTime ?? undefined,
              endTime: st.endTime ?? undefined,
              priority: st.priority ?? 'medium',
              categoryId: st.categoryId ?? undefined,
              status: st.status ?? 'pending',
              recurrenceRule: recurrenceParsed,
              reminderMinutes: st.reminderMinutes ?? 0,
              snoozeUntil: st.snoozeUntil ?? undefined,
              notes: st.notes ?? undefined,
              isLoudAlarm: Boolean(st.isLoudAlarm),
              isOvernight: Boolean(st.isOvernight),
              eisenhowerQuadrant: st.eisenhowerQuadrant ?? undefined,
              accentColor: st.accentColor ?? undefined,
              estimatedMinutes: st.estimatedMinutes ?? undefined,
              completedAt: st.completedAt ?? undefined,
              createdAt: st.createdAt ? new Date(st.createdAt).toISOString() : new Date().toISOString(),
              updatedAt: st.updatedAt ? new Date(st.updatedAt).toISOString() : new Date().toISOString(),
            });
          }
        }
      }

      return {
        success: true,
        syncedCount: allLocalTasks.length,
        message: 'Tasks synchronized successfully with NestJS backend.',
      };
    } catch (err: any) {
      this.notifyStatus(false);
      return {
        success: false,
        syncedCount: 0,
        message: err?.message || 'Network error during backend sync.',
      };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const taskBackendSyncService = TaskBackendSyncService.getInstance();
