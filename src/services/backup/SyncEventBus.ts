import { SyncEntityType } from '../../types';

export interface DataMutation {
  entityType: SyncEntityType;
  operation: 'upsert' | 'delete';
  id: string;
  item?: any;
  timestamp?: string;
}

export type ChangeListener = (mutation?: DataMutation) => void | Promise<void>;
export type RestoreListener = () => void | Promise<void>;

/**
 * Decoupled event bus to coordinate local SQLite mutations, background sync, and UI reactivity.
 * Prevents circular dependency loops between repositories, backup services, and screens.
 * Features thread-safe listener snapshotting, async error protection, batch coalescing, and entity-level filtering.
 */
export class SyncEventBus {
  private static instance: SyncEventBus;

  public static getInstance(): SyncEventBus {
    if (!SyncEventBus.instance) {
      SyncEventBus.instance = new SyncEventBus();
    }
    return SyncEventBus.instance;
  }

  private changeListeners: Set<ChangeListener> = new Set();
  private restoreListeners: Set<RestoreListener> = new Set();
  private isPaused = false;
  private queuedMutations: (DataMutation | undefined)[] = [];
  private hasPendingRestore = false;

  /**
   * Dispatches event when data is created, updated, or deleted in local SQLite.
   * Auto-stamps ISO timestamp if not present.
   * Takes a defensive snapshot of listeners to prevent skipped notifications if a listener unsubscribes during dispatch.
   * Catches both synchronous errors and unhandled promise rejections on async listeners.
   */
  notifyDataChanged(mutation?: DataMutation): void {
    if (mutation && !mutation.timestamp) {
      mutation.timestamp = new Date().toISOString();
    }

    if (this.isPaused) {
      this.queuedMutations.push(mutation);
      return;
    }

    const listeners = Array.from(this.changeListeners);
    for (const listener of listeners) {
      try {
        const result: any = listener(mutation);
        if (result && typeof result.catch === 'function') {
          result.catch((asyncErr: any) => {
            console.warn('SyncEventBus async change listener error:', asyncErr);
          });
        }
      } catch (err) {
        console.warn('SyncEventBus change listener error:', err);
      }
    }
  }

  /**
   * Subscribes to local data changes (inserts, updates, deletes).
   * Uses Set to guarantee idempotency (preventing duplicate subscriptions).
   * Returns an unsubscribe callback.
   */
  subscribeToChanges(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Subscribes only to mutations for a specific entity type (e.g. 'task', 'keepNote').
   * Prevents unnecessary wakes on unrelated entity changes.
   * Returns an unsubscribe callback.
   */
  subscribeToEntity(
    entityType: SyncEntityType,
    listener: (mutation: DataMutation) => void | Promise<void>
  ): () => void {
    return this.subscribeToChanges((mutation) => {
      if (mutation && mutation.entityType === entityType) {
        return listener(mutation);
      }
    });
  }

  /**
   * Dispatches event when remote data (Google Sheet / Backend) has been restored into SQLite.
   * Takes a defensive snapshot of listeners to prevent skipped notifications if a listener unsubscribes during dispatch.
   * Catches both synchronous errors and unhandled promise rejections on async listeners.
   */
  notifyDataRestored(): void {
    if (this.isPaused) {
      this.hasPendingRestore = true;
      return;
    }

    const listeners = Array.from(this.restoreListeners);
    for (const listener of listeners) {
      try {
        const result: any = listener();
        if (result && typeof result.catch === 'function') {
          result.catch((asyncErr: any) => {
            console.warn('SyncEventBus async restore listener error:', asyncErr);
          });
        }
      } catch (err) {
        console.warn('SyncEventBus restore listener error:', err);
      }
    }
  }

  /**
   * Subscribes to remote data restore events (so active screens refresh automatically).
   * Uses Set to guarantee idempotency (preventing duplicate subscriptions).
   * Returns an unsubscribe callback.
   */
  subscribeToRestore(listener: RestoreListener): () => void {
    this.restoreListeners.add(listener);
    return () => {
      this.restoreListeners.delete(listener);
    };
  }

  /**
   * Pauses event dispatching during bulk batch imports / restores to prevent UI thrashing.
   * Events are queued and will be coalesced and dispatched when resumeNotifications() is called.
   */
  pauseNotifications(): void {
    this.isPaused = true;
  }

  /**
   * Resumes event dispatching and flushes all queued mutations and restore signals.
   * Coalesces duplicate updates for the same entity and ID to avoid notification floods.
   */
  resumeNotifications(): void {
    if (!this.isPaused) return;
    this.isPaused = false;

    const pending = [...this.queuedMutations];
    this.queuedMutations = [];
    const shouldRestore = this.hasPendingRestore;
    this.hasPendingRestore = false;

    // Coalesce mutations by entity and ID to avoid flood of redundant re-renders
    const dedupedMap = new Map<string, DataMutation>();
    let hasGeneralChange = false;

    for (const mutation of pending) {
      if (!mutation || !mutation.id) {
        hasGeneralChange = true;
      } else {
        const key = `${mutation.entityType}_${mutation.id}`;
        dedupedMap.set(key, mutation);
      }
    }

    for (const mutation of dedupedMap.values()) {
      this.notifyDataChanged(mutation);
    }

    if (hasGeneralChange && dedupedMap.size === 0) {
      this.notifyDataChanged();
    }

    if (shouldRestore) {
      this.notifyDataRestored();
    }
  }

  /**
   * Executes a callback within a paused notification scope and automatically resumes notifications.
   * Guaranteed to resume notifications even if the callback throws an error.
   */
  async batch<T>(fn: () => Promise<T> | T): Promise<T> {
    this.pauseNotifications();
    try {
      return await fn();
    } finally {
      this.resumeNotifications();
    }
  }

  /**
   * Returns the count of registered listeners.
   */
  listenerCount(type?: 'change' | 'restore'): number {
    if (type === 'change') return this.changeListeners.size;
    if (type === 'restore') return this.restoreListeners.size;
    return this.changeListeners.size + this.restoreListeners.size;
  }

  /**
   * Clears all registered listeners and resets internal queues.
   * Useful for unit test cleanup and app lifecycle teardown to prevent memory leaks.
   */
  clearAllListeners(): void {
    this.changeListeners.clear();
    this.restoreListeners.clear();
    this.queuedMutations = [];
    this.hasPendingRestore = false;
    this.isPaused = false;
  }
}

export const syncEventBus = SyncEventBus.getInstance();
export default syncEventBus;
