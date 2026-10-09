import { Note } from '../../types';
import { getDatabase } from '../connection';

export class NoteRepository {
  async findAll(): Promise<Note[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM notes ORDER BY updatedAt DESC');
    return result.rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId ?? undefined,
      title: r.title ?? undefined,
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findByEntity(entityType: string, entityId?: string): Promise<Note[]> {
    const db = await getDatabase();
    let query = 'SELECT * FROM notes WHERE entityType = ?';
    const params: any[] = [entityType];
    if (entityId) {
      query += ' AND entityId = ?';
      params.push(entityId);
    }
    query += ' ORDER BY updatedAt DESC';

    const result = await db.execute(query, params);
    return result.rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId ?? undefined,
      title: r.title ?? undefined,
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async create(note: Note): Promise<Note> {
    const db = await getDatabase();
    await db.execute(
      'INSERT INTO notes (id, entityType, entityId, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [note.id, note.entityType, note.entityId ?? null, note.title ?? null, note.content, note.createdAt, note.updatedAt]
    );
    return note;
  }

  async update(id: string, content: string, title?: string): Promise<Note | null> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute('UPDATE notes SET content = ?, title = ?, updatedAt = ? WHERE id = ?', [
      content,
      title ?? null,
      now,
      id,
    ]);
    const result = await db.execute('SELECT * FROM notes WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId ?? undefined,
      title: r.title ?? undefined,
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.execute('DELETE FROM notes WHERE id = ?', [id]);
    return result.rowsAffected > 0;
  }
}

export const noteRepository = new NoteRepository();
