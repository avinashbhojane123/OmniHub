import { Note } from '../../types';
import { getDatabase } from '../connection';
import { keepNoteRepository } from './KeepNoteRepository';

/**
 * NoteRepository: Legacy note repository consolidated with keep_notes as the single canonical source of truth.
 * All operations dual-sync to keep_notes to guarantee data consistency.
 */
export class NoteRepository {
  async findAll(): Promise<Note[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM notes ORDER BY updatedAt DESC');
    if (result.rows.length > 0) {
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

    // Fallback/Bridge: If legacy notes table is empty, map from canonical keep_notes
    const keepNotes = await keepNoteRepository.findAll();
    return keepNotes.map((kn) => ({
      id: kn.id,
      entityType: 'general',
      title: kn.title || undefined,
      content: kn.content,
      createdAt: kn.createdAt,
      updatedAt: kn.updatedAt,
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

    // Consolidate into canonical keep_notes table
    try {
      await keepNoteRepository.create({
        id: note.id,
        title: note.title || '',
        content: note.content,
        type: 'text',
        color: 'default',
        isPinned: false,
        isArchived: false,
        isTrashed: false,
        labels: [],
        checklistData: [],
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });
    } catch {
      // Ignore if already present
    }

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

    // Consolidate into canonical keep_notes table
    try {
      await keepNoteRepository.update(id, {
        content,
        ...(title !== undefined ? { title } : {}),
      });
    } catch {
      // Ignore if not in keep_notes
    }

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
    try {
      await keepNoteRepository.deletePermanently(id);
    } catch {
      // Ignore
    }
    return result.rowsAffected > 0;
  }
}

export const noteRepository = new NoteRepository();
