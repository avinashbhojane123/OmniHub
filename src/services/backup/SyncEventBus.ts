export interface DataMutation {
  entityType: 'task' | 'habit' | 'habitLog' | 'keepNote' | 'calendarEvent' | 'category';
  operation: 'upsert' | 'delete';
  id: string;
  item?: any;
}

export type ChangeListener = (mutation?: DataMutation) => void;
export type RestoreListener = () => void;

/**
 * Decoupled event bus to coordinate local SQLite mutations and silent background cloud sync.
 * Prevents circular dependency loops between repositories and backup services.
 */
class SyncEventBus {
  private changeListeners: ChangeListener[] = [];
  private restoreListeners: RestoreListener[] = [];

  /**
   * Dispatches event when data is created, updated, or deleted in local SQLite.
   * Can optionally include granular mutation details for Delta Sync.
   */
  notifyDataChanged(mutation?: DataMutation): void {
    for (const listener of this.changeListeners) {
      try {
        listener(mutation);
      } catch (err) {
        console.warn('SyncEventBus change listener error:', err);
      }
    }
  }

  /**
   * Subscribes to local data changes (inserts, updates, deletes).
   * Returns an unsubscribe callback.
   */
  subscribeToChanges(listener: ChangeListener): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Dispatches event when remote Google Sheet data has been restored into SQLite.
   */
  notifyDataRestored(): void {
    for (const listener of this.restoreListeners) {
      try {
        listener();
      } catch (err) {
        console.warn('SyncEventBus restore listener error:', err);
      }
    }
  }

  /**
   * Subscribes to remote Google Sheet restore events (so active screens refresh automatically).
   * Returns an unsubscribe callback.
   */
  subscribeToRestore(listener: RestoreListener): () => void {
    this.restoreListeners.push(listener);
    return () => {
      this.restoreListeners = this.restoreListeners.filter((l) => l !== listener);
    };
  }
}

export const syncEventBus = new SyncEventBus();
