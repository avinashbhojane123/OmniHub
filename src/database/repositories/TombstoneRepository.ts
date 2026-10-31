import { getDatabase } from '../connection';
import { SyncTombstone } from '../../types';

export class TombstoneRepository {
  async recordDeleted(id: string, entityType: SyncTombstone['entityType']): Promise<void> {
    try {
      const db = await getDatabase();
      const nowIso = new Date().toISOString();
      await db.execute(
        `INSERT INTO sync_tombstones (id, entityType, deletedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET deletedAt = excluded.deletedAt`,
        [id, entityType, nowIso]
      );
    } catch (e) {
      console.warn('Failed to record tombstone:', e);
    }
  }

  async getAll(): Promise<SyncTombstone[]> {
    try {
      const db = await getDatabase();
      const res = await db.execute('SELECT id, entityType, deletedAt FROM sync_tombstones ORDER BY deletedAt DESC');
      return res.rows.map((r: any) => ({
        id: r.id,
        entityType: r.entityType,
        deletedAt: r.deletedAt,
      }));
    } catch {
      return [];
    }
  }

  async isDeleted(id: string): Promise<boolean> {
    try {
      const db = await getDatabase();
      const res = await db.execute('SELECT id FROM sync_tombstones WHERE id = ?', [id]);
      return res.rows.length > 0;
    } catch {
      return false;
    }
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    try {
      const db = await getDatabase();
      const placeholders = ids.map(() => '?').join(', ');
      await db.execute(`DELETE FROM sync_tombstones WHERE id IN (${placeholders})`, ids);
    } catch (e) {
      console.warn('Failed to delete tombstones:', e);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await getDatabase();
      await db.execute('DELETE FROM sync_tombstones');
    } catch {}
  }
}

export const tombstoneRepository = new TombstoneRepository();
