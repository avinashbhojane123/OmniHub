import { getDatabase } from '../connection';
import {
  KeepNote,
  KeepColorKey,
  ChecklistItem,
  DrawingStroke,
  KeepNoteFilter,
  CreateKeepNoteDTO,
  UpdateKeepNoteDTO,
} from '../../types';
import { settingsRepository } from './SettingsRepository';
import { tombstoneRepository } from './TombstoneRepository';
import { syncEventBus } from '../../services/backup/SyncEventBus';

export type { KeepNoteFilter };

export class KeepNoteRepository {
  private parseRow(r: any): KeepNote {
    let checklistData: ChecklistItem[] = [];
    try {
      checklistData = r.checklistData ? JSON.parse(r.checklistData) : [];
    } catch {
      checklistData = [];
    }

    let labels: string[] = [];
    try {
      labels = r.labels ? JSON.parse(r.labels) : [];
    } catch {
      labels = [];
    }

    let drawingData: DrawingStroke[] | undefined;
    try {
      drawingData = r.drawingData ? JSON.parse(r.drawingData) : undefined;
    } catch {
      drawingData = undefined;
    }

    const noteType = r.type || 'text';
    // Enforce mutual exclusivity to prevent legacy/stale data from duplicating across content and checklist
    if (noteType === 'text') {
      checklistData = [];
    }
    const noteContent = noteType === 'checklist' ? '' : (r.content || '');

    return {
      id: r.id,
      title: r.title || '',
      content: noteContent,
      type: noteType,
      color: (r.color as KeepColorKey) || 'default',
      isPinned: Boolean(r.isPinned),
      isArchived: Boolean(r.isArchived),
      isTrashed: Boolean(r.isTrashed),
      trashedAt: r.trashedAt || undefined,
      reminderTime: r.reminderTime || undefined,
      labels,
      checklistData,
      drawingData,
      audioUri: r.audioUri || undefined,
      imageUri: r.imageUri || undefined,
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString(),
    };
  }

  async findAll(filter: KeepNoteFilter = {}): Promise<KeepNote[]> {
    const db = await getDatabase();
    const { status = 'active', search, label, color } = filter;

    const listCols = 'id, title, content, type, color, isPinned, isArchived, isTrashed, trashedAt, reminderTime, labels, checklistData, audioUri, imageUri, createdAt, updatedAt';
    let query = `SELECT ${listCols} FROM keep_notes WHERE `;
    const params: any[] = [];

    if (status === 'trash') {
      query += 'isTrashed = 1';
    } else if (status === 'archived') {
      query += 'isTrashed = 0 AND isArchived = 1';
    } else if (status === 'reminders') {
      query += 'isTrashed = 0 AND isArchived = 0 AND reminderTime IS NOT NULL';
    } else {
      // active
      query += 'isTrashed = 0 AND isArchived = 0';
    }

    if (search && search.trim().length > 0) {
      const escaped = search.trim().replace(/([%_\\])/g, '\\$1');
      query += " AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR checklistData LIKE ? ESCAPE '\\' OR labels LIKE ? ESCAPE '\\')";
      const term = `%${escaped}%`;
      params.push(term, term, term, term);
    }

    if (label && label.trim().length > 0) {
      const escaped = label.trim().replace(/([%_\\])/g, '\\$1');
      query += " AND labels LIKE ? ESCAPE '\\'";
      params.push(`%"${escaped}"%`);
    }

    if (color) {
      query += ' AND color = ?';
      params.push(color);
    }

    query += ' ORDER BY isPinned DESC, updatedAt DESC';

    const result = await db.execute(query, params);
    return result.rows.map((row) => this.parseRow(row));
  }

  async findById(id: string): Promise<KeepNote | null> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM keep_notes WHERE id = ? LIMIT 1', [id]);
    if (result.rows.length === 0) return null;
    return this.parseRow(result.rows[0]);
  }

  async create(noteData: CreateKeepNoteDTO): Promise<KeepNote> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = noteData.id || `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newNote: KeepNote = {
      id,
      title: noteData.title || '',
      content: noteData.content || '',
      type: noteData.type || 'text',
      color: noteData.color || 'default',
      isPinned: Boolean(noteData.isPinned),
      isArchived: Boolean(noteData.isArchived),
      isTrashed: false,
      trashedAt: undefined,
      reminderTime: noteData.reminderTime || undefined,
      labels: noteData.labels || [],
      checklistData: noteData.checklistData || [],
      drawingData: noteData.drawingData,
      audioUri: noteData.audioUri || undefined,
      imageUri: noteData.imageUri || undefined,
      createdAt: noteData.createdAt || now,
      updatedAt: noteData.updatedAt || now,
    };

    await db.execute(
      `INSERT INTO keep_notes (
        id, title, content, type, color, isPinned, isArchived, isTrashed,
        trashedAt, reminderTime, labels, checklistData, drawingData,
        audioUri, imageUri, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newNote.id,
        newNote.title,
        newNote.content,
        newNote.type,
        newNote.color,
        newNote.isPinned ? 1 : 0,
        newNote.isArchived ? 1 : 0,
        0,
        null,
        newNote.reminderTime || null,
        JSON.stringify(newNote.labels),
        JSON.stringify(newNote.checklistData),
        newNote.drawingData ? JSON.stringify(newNote.drawingData) : null,
        newNote.audioUri || null,
        newNote.imageUri || null,
        newNote.createdAt,
        newNote.updatedAt,
      ]
    );

    syncEventBus.notifyDataChanged({
      entityType: 'keepNote',
      operation: 'upsert',
      id: newNote.id,
      item: newNote,
    });
    return newNote;
  }

  async update(id: string, updates: UpdateKeepNoteDTO): Promise<KeepNote | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const db = await getDatabase();
    const now = new Date().toISOString();

    const merged: KeepNote = {
      ...existing,
      ...updates,
      trashedAt:
        updates.trashedAt !== undefined ? (updates.trashedAt || undefined) : existing.trashedAt,
      reminderTime:
        updates.reminderTime !== undefined
          ? (updates.reminderTime || undefined)
          : existing.reminderTime,
      audioUri:
        updates.audioUri !== undefined ? (updates.audioUri || undefined) : existing.audioUri,
      imageUri:
        updates.imageUri !== undefined ? (updates.imageUri || undefined) : existing.imageUri,
      updatedAt: updates.updatedAt || now,
    };

    await db.execute(
      `UPDATE keep_notes SET
        title = ?,
        content = ?,
        type = ?,
        color = ?,
        isPinned = ?,
        isArchived = ?,
        isTrashed = ?,
        trashedAt = ?,
        reminderTime = ?,
        labels = ?,
        checklistData = ?,
        drawingData = ?,
        audioUri = ?,
        imageUri = ?,
        updatedAt = ?
      WHERE id = ?`,
      [
        merged.title,
        merged.content,
        merged.type,
        merged.color,
        merged.isPinned ? 1 : 0,
        merged.isArchived ? 1 : 0,
        merged.isTrashed ? 1 : 0,
        merged.trashedAt || null,
        merged.reminderTime || null,
        JSON.stringify(merged.labels),
        JSON.stringify(merged.checklistData),
        merged.drawingData ? JSON.stringify(merged.drawingData) : null,
        merged.audioUri || null,
        merged.imageUri || null,
        merged.updatedAt,
        id,
      ]
    );

    if (merged.isTrashed) {
      syncEventBus.notifyDataChanged({
        entityType: 'keepNote',
        operation: 'delete',
        id,
      });
    } else {
      syncEventBus.notifyDataChanged({
        entityType: 'keepNote',
        operation: 'upsert',
        id,
        item: merged,
      });
    }
    return merged;
  }

  async togglePin(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;
    const nextPinned = !existing.isPinned;
    await this.update(id, { isPinned: nextPinned });
    return nextPinned;
  }

  async setArchived(id: string, isArchived: boolean): Promise<boolean> {
    const updated = await this.update(id, {
      isArchived,
      isPinned: false, // Archiving auto-unpins
    });
    return Boolean(updated);
  }

  async moveToTrash(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    try {
      const { notificationService } = await import('../../services/notifications/NotificationService');
      await notificationService.cancelNoteReminder(id);
    } catch {}
    await tombstoneRepository.recordDeleted(id, 'keepNote');
    const updated = await this.update(id, {
      isTrashed: true,
      trashedAt: now,
      isPinned: false,
    });
    // Explicitly notify sync bus with delete operation to remove row from Google Sheet
    syncEventBus.notifyDataChanged({
      entityType: 'keepNote',
      operation: 'delete',
      id,
    });
    return Boolean(updated);
  }

  async restoreFromTrash(id: string): Promise<boolean> {
    const updated = await this.update(id, {
      isTrashed: false,
      trashedAt: undefined,
    });
    if (updated?.reminderTime) {
      try {
        const { notificationService } = await import('../../services/notifications/NotificationService');
        await notificationService.scheduleNoteReminder(updated);
      } catch {}
    }
    return Boolean(updated);
  }

  async deletePermanently(id: string): Promise<boolean> {
    const db = await getDatabase();
    await tombstoneRepository.recordDeleted(id, 'keepNote');
    try {
      const { notificationService } = await import('../../services/notifications/NotificationService');
      await notificationService.cancelNoteReminder(id);
    } catch {}
    const result = await db.execute('DELETE FROM keep_notes WHERE id = ?', [id]);
    syncEventBus.notifyDataChanged({
      entityType: 'keepNote',
      operation: 'delete',
      id,
    });
    return result.rowsAffected > 0;
  }

  async emptyTrash(): Promise<number> {
    const db = await getDatabase();
    try {
      const { notificationService } = await import('../../services/notifications/NotificationService');
      const trashed = await db.execute('SELECT id FROM keep_notes WHERE isTrashed = 1');
      for (const row of trashed.rows) {
        await tombstoneRepository.recordDeleted(row.id, 'keepNote');
        await notificationService.cancelNoteReminder(row.id);
      }
    } catch {}
    const result = await db.execute('DELETE FROM keep_notes WHERE isTrashed = 1');
    syncEventBus.notifyDataChanged();
    return result.rowsAffected;
  }

  async duplicate(id: string): Promise<KeepNote | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const copyTitle = existing.title ? `${existing.title} (Copy)` : 'Copy';
    return await this.create({
      ...existing,
      id: undefined,
      title: copyTitle,
      isPinned: false,
      isArchived: false,
    });
  }

  async getAllLabels(): Promise<string[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT labels FROM keep_notes WHERE isTrashed = 0');
    const labelSet = new Set<string>();

    // Load any standalone custom labels saved by user
    try {
      const customStr = await settingsRepository.get('keep_notes_custom_labels', '[]');
      const customList = JSON.parse(customStr);
      if (Array.isArray(customList)) {
        customList.forEach((l) => {
          if (typeof l === 'string' && l.trim()) labelSet.add(l.trim());
        });
      }
    } catch {}

    result.rows.forEach((row) => {
      try {
        if (row.labels) {
          const list = JSON.parse(row.labels);
          if (Array.isArray(list)) {
            list.forEach((l) => {
              if (typeof l === 'string' && l.trim()) {
                labelSet.add(l.trim());
              }
            });
          }
        }
      } catch {}
    });

    return Array.from(labelSet).sort();
  }

  async saveCustomLabel(label: string): Promise<void> {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      const existing = await this.getAllLabels();
      if (!existing.includes(trimmed)) {
        const updated = [...existing, trimmed].sort();
        await settingsRepository.set('keep_notes_custom_labels', JSON.stringify(updated));
      }
    } catch {}
  }

  async saveAllCustomLabels(labels: string[]): Promise<void> {
    const clean = Array.from(new Set(labels.map((l) => l.trim()).filter(Boolean))).sort();
    await settingsRepository.set('keep_notes_custom_labels', JSON.stringify(clean));
  }

  async deleteLabel(labelToDelete: string): Promise<void> {
    const trimmed = labelToDelete.trim();
    if (!trimmed) return;
    const db = await getDatabase();

    // 1. Remove from all notes
    const escaped = trimmed.replace(/([%_\\])/g, '\\$1');
    const result = await db.execute(
      "SELECT id, labels FROM keep_notes WHERE labels LIKE ? ESCAPE '\\'",
      [`%"${escaped}"%`]
    );
    for (const row of result.rows) {
      try {
        const labels: string[] = JSON.parse(row.labels || '[]');
        const updated = labels.filter((l) => l !== trimmed);
        await this.update(row.id, { labels: updated });
      } catch {}
    }

    // 2. Remove from custom labels in settings
    try {
      const customStr = await settingsRepository.get('keep_notes_custom_labels', '[]');
      const customList: string[] = JSON.parse(customStr);
      if (Array.isArray(customList)) {
        const filtered = customList.filter((l) => l !== trimmed);
        await settingsRepository.set('keep_notes_custom_labels', JSON.stringify(filtered));
      }
    } catch {}
  }

  async renameLabel(oldLabel: string, newLabel: string): Promise<void> {
    const trimmedOld = oldLabel.trim();
    const trimmedNew = newLabel.trim();
    if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;
    const db = await getDatabase();

    // 1. Rename in all notes
    const escaped = trimmedOld.replace(/([%_\\])/g, '\\$1');
    const result = await db.execute(
      "SELECT id, labels FROM keep_notes WHERE labels LIKE ? ESCAPE '\\'",
      [`%"${escaped}"%`]
    );
    for (const row of result.rows) {
      try {
        const labels: string[] = JSON.parse(row.labels || '[]');
        const updated = labels.map((l) => (l === trimmedOld ? trimmedNew : l));
        const deduplicated = Array.from(new Set(updated));
        await this.update(row.id, { labels: deduplicated });
      } catch {}
    }

    // 2. Rename in custom labels settings
    try {
      const customStr = await settingsRepository.get('keep_notes_custom_labels', '[]');
      const customList: string[] = JSON.parse(customStr);
      if (Array.isArray(customList)) {
        const updated = customList.map((l) => (l === trimmedOld ? trimmedNew : l));
        const deduplicated = Array.from(new Set(updated));
        await settingsRepository.set('keep_notes_custom_labels', JSON.stringify(deduplicated));
      }
    } catch {}
  }

  async cleanupOldTrash(days: number = 30): Promise<number> {
    const db = await getDatabase();
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.execute(
      'DELETE FROM keep_notes WHERE isTrashed = 1 AND trashedAt IS NOT NULL AND trashedAt < ?',
      [cutoffDate]
    );
    return result.rowsAffected;
  }

  async batchPin(ids: string[], isPinned: boolean): Promise<void> {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => this.update(id, { isPinned })));
  }

  async batchArchive(ids: string[], isArchived: boolean): Promise<void> {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => this.setArchived(id, isArchived)));
  }

  async batchTrash(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => this.moveToTrash(id)));
  }

  async batchColor(ids: string[], color: KeepColorKey): Promise<void> {
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => this.update(id, { color })));
  }

  async batchAddLabel(ids: string[], labelToAdd: string): Promise<void> {
    const trimmed = labelToAdd.trim();
    if (!trimmed || ids.length === 0) return;
    await Promise.all(
      ids.map(async (id) => {
        const note = await this.findById(id);
        if (note && !note.labels.includes(trimmed)) {
          await this.update(id, { labels: [...note.labels, trimmed] });
        }
      })
    );
  }

  async batchUpdateLabels(ids: string[], labels: string[]): Promise<void> {
    if (ids.length === 0) return;
    const clean = Array.from(new Set(labels.map((l) => l.trim()).filter(Boolean)));
    await Promise.all(ids.map((id) => this.update(id, { labels: clean })));
  }

  async batchDiffLabels(ids: string[], addedLabels: string[], removedLabels: string[]): Promise<void> {
    if (ids.length === 0) return;
    const addedSet = new Set(addedLabels.map((l) => l.trim()).filter(Boolean));
    const removedSet = new Set(removedLabels.map((l) => l.trim()).filter(Boolean));

    await Promise.all(
      ids.map(async (id) => {
        const note = await this.findById(id);
        if (!note) return;
        let current = [...note.labels];
        if (removedSet.size > 0) {
          current = current.filter((l) => !removedSet.has(l));
        }
        if (addedSet.size > 0) {
          addedSet.forEach((l) => {
            if (!current.includes(l)) current.push(l);
          });
        }
        await this.update(id, { labels: current });
      })
    );
  }

  async batchRemoveLabel(ids: string[], labelToRemove: string): Promise<void> {
    const trimmed = labelToRemove.trim();
    if (!trimmed || ids.length === 0) return;
    await Promise.all(
      ids.map(async (id) => {
        const note = await this.findById(id);
        if (note && note.labels.includes(trimmed)) {
          await this.update(id, { labels: note.labels.filter((l) => l !== trimmed) });
        }
      })
    );
  }
}

export const keepNoteRepository = new KeepNoteRepository();
