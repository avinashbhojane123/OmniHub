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

export class SyncEventBus {
  private static instance: SyncEventBus;

  public static getInstance(): SyncEventBus {
    if (!SyncEventBus.instance) SyncEventBus.instance = new SyncEventBus();
    return SyncEventBus.instance;
  }

  private changeListeners = new Set<ChangeListener>();
  private restoreListeners = new Set<RestoreListener>();
  private isPaused = false;
  private queuedMutations: (DataMutation | undefined)[] = [];
  private hasPendingRestore = false;

  notifyDataChanged(mutation?: DataMutation): void {
    if (mutation && !mutation.timestamp) mutation.timestamp = new Date().toISOString();
    if (this.isPaused) {
      this.queuedMutations.push(mutation);
      return;
    }
    for (const listener of Array.from(this.changeListeners)) {
      try {
        const res = listener(mutation);
        if (res && typeof (res as any).catch === 'function') (res as any).catch(() => {});
      } catch {}
    }
  }

  subscribeToChanges(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  subscribeToEntity(
    entityType: SyncEntityType,
    listener: (mutation: DataMutation) => void | Promise<void>
  ): () => void {
    return this.subscribeToChanges((mutation) => {
      if (mutation && mutation.entityType === entityType) return listener(mutation);
    });
  }

  notifyDataRestored(): void {
    if (this.isPaused) {
      this.hasPendingRestore = true;
      return;
    }
    for (const listener of Array.from(this.restoreListeners)) {
      try {
        const res = listener();
        if (res && typeof (res as any).catch === 'function') (res as any).catch(() => {});
      } catch {}
    }
  }

  subscribeToRestore(listener: RestoreListener): () => void {
    this.restoreListeners.add(listener);
    return () => this.restoreListeners.delete(listener);
  }

  pauseNotifications(): void {
    this.isPaused = true;
  }

  resumeNotifications(): void {
    if (!this.isPaused) return;
    this.isPaused = false;

    const pending = [...this.queuedMutations];
    this.queuedMutations = [];
    const shouldRestore = this.hasPendingRestore;
    this.hasPendingRestore = false;

    const dedupedMap = new Map<string, DataMutation>();
    let hasGeneral = false;
    for (const m of pending) {
      if (!m || !m.id) hasGeneral = true;
      else dedupedMap.set(`${m.entityType}_${m.id}`, m);
    }

    for (const m of dedupedMap.values()) this.notifyDataChanged(m);
    if (hasGeneral && dedupedMap.size === 0) this.notifyDataChanged();
    if (shouldRestore) this.notifyDataRestored();
  }

  async batch<T>(fn: () => Promise<T> | T): Promise<T> {
    this.pauseNotifications();
    try {
      return await fn();
    } finally {
      this.resumeNotifications();
    }
  }

  listenerCount(type?: 'change' | 'restore'): number {
    if (type === 'change') return this.changeListeners.size;
    if (type === 'restore') return this.restoreListeners.size;
    return this.changeListeners.size + this.restoreListeners.size;
  }

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
