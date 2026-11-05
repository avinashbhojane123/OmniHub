import { Platform } from 'react-native';
import { BackupData, MovieBookmark } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { categoryRepository } from '../../database/repositories/CategoryRepository';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { calendarRepository } from '../../database/repositories/CalendarRepository';
import { movieRepository } from '../../database/repositories/MovieRepository';
import type { BatterySessionRecord } from '../../database/repositories/BatteryRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { tombstoneRepository } from '../../database/repositories/TombstoneRepository';
import { getDatabase } from '../../database/connection';
import { notificationService } from '../notifications/NotificationService';
import { alarmService } from '../alarm/AlarmService';

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../../database/seed';
import { normalizeTimeTo24H } from '../../utils/time';
import { syncEventBus } from './SyncEventBus';

export type RestoreMode = 'replace' | 'merge';

export class BackupService {
  private static instance: BackupService;

  public static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  async exportBackup(): Promise<string> {
    const db = await getDatabase();
    const tasks = await taskRepository.findAll();
    const categories = await categoryRepository.findAll();
    const habits = await habitRepository.findAll();
    const calendarEvents = await calendarRepository.findAll();
    const movieBookmarks = await movieRepository.findAll();

    // Fetch notes directly without synthesizing phantom legacy notes from keep_notes
    const notesResult = await db.execute('SELECT * FROM notes ORDER BY updatedAt DESC');
    const notes = (notesResult.rows || []).map((r) => ({
      id: String(r.id),
      entityType: r.entityType || 'general',
      entityId: r.entityId ?? undefined,
      title: r.title ?? undefined,
      content: r.content || '',
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString(),
    }));

    const rawSettings = await settingsRepository.getAll();
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const [k, v] of Object.entries(rawSettings)) {
      if (v !== undefined && v !== null) {
        settings[k] = String(v);
      }
    }
    if (!settings.notificationsEnabled) {
      settings.notificationsEnabled = 'true';
    }

    // Fetch all habit logs in a single batch query
    const logsResult = await db.execute('SELECT * FROM habit_logs ORDER BY date DESC');
    const habitLogs = (logsResult.rows || []).map((r) => ({
      id: r.id,
      habitId: r.habitId,
      date: r.date,
      completed: Boolean(r.completed),
      value: Number(r.value),
      notes: r.notes ?? undefined,
      createdAt: r.createdAt,
    }));

    // Fetch all keep notes comprehensively (active, archived, trashed, with drawings and checklists)
    const keepNotesResult = await db.execute('SELECT * FROM keep_notes ORDER BY updatedAt DESC');
    const keepNotes = (keepNotesResult.rows || []).map((r) => ({
      id: String(r.id),
      title: r.title || '',
      content: r.type === 'checklist' ? '' : (r.content || ''),
      type: r.type || 'text',
      color: r.color || 'default',
      isPinned: Boolean(r.isPinned),
      isArchived: Boolean(r.isArchived),
      isTrashed: Boolean(r.isTrashed),
      trashedAt: r.trashedAt || undefined,
      reminderTime: r.reminderTime || undefined,
      labels: (() => {
        try {
          if (Array.isArray(r.labels)) return r.labels;
          return r.labels ? JSON.parse(r.labels) : [];
        } catch {
          return [];
        }
      })(),
      checklistData: (() => {
        try {
          if (Array.isArray(r.checklistData)) return r.checklistData;
          return r.checklistData ? JSON.parse(r.checklistData) : [];
        } catch {
          return [];
        }
      })(),
      drawingData: (() => {
        try {
          if (typeof r.drawingData === 'object' && r.drawingData !== null) return r.drawingData;
          return r.drawingData ? JSON.parse(r.drawingData) : undefined;
        } catch {
          return undefined;
        }
      })(),
      audioUri: r.audioUri || undefined,
      imageUri: r.imageUri || undefined,
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString(),
    }));

    // Fetch all battery charging sessions
    const batterySessionsResult = await db.execute(
      'SELECT * FROM battery_sessions ORDER BY startTime DESC'
    );
    const batterySessions = (batterySessionsResult.rows || []) as BatterySessionRecord[];

    const tombstones = await tombstoneRepository.getAll();

    const backup: BackupData = {
      version: 1,
      createdAt: new Date().toISOString(),
      tasks,
      categories,
      habits,
      habitLogs,
      notes,
      keepNotes,
      calendarEvents,
      movieBookmarks,
      batterySessions,
      settings,
      tombstones,
    };

    return JSON.stringify(backup, null, 2);
  }

  async importBackup(
    jsonString: string,
    mode: RestoreMode = 'replace'
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!jsonString || typeof jsonString !== 'string') {
        throw new Error('Invalid backup file format: empty or invalid JSON string');
      }
      const cleanJson = jsonString.trim().replace(/^\uFEFF/, '');
      const data: BackupData = JSON.parse(cleanJson);
      if (!data || typeof data !== 'object' || !data.version || !Array.isArray(data.tasks)) {
        throw new Error('Invalid backup file format: missing version or tasks array');
      }

      if (mode === 'replace') {
        try {
          await notificationService.cancelAllReminders();
          alarmService.stopRinging();
        } catch (alarmCancelErr) {
          console.warn('Pre-restore alarm cancellation notice:', alarmCancelErr);
        }
      }

      const db = await getDatabase();

      // Disable foreign keys outside transaction for bulk restore
      await db.execute('PRAGMA foreign_keys = OFF;').catch(() => {});

      let result: { success: boolean; message: string };
      try {
        result = await db.transaction(async (tx) => {
          if (mode === 'replace') {
            // Clear existing records safely in order (children before parents)
            await tx.execute('DELETE FROM reminders');
            await tx.execute('DELETE FROM habit_logs');
            await tx.execute('DELETE FROM tasks');
            await tx.execute('DELETE FROM habits');
            await tx.execute('DELETE FROM categories');
            await tx.execute('DELETE FROM notes');
            await tx.execute('DELETE FROM keep_notes');
            await tx.execute('DELETE FROM calendar_events');
            await tx.execute('DELETE FROM notification_schedules');
            await tx.execute('DELETE FROM sync_tombstones');
            await tx.execute('DELETE FROM pending_sync_queue');
            await tx.execute('DELETE FROM movie_bookmarks');
            await tx.execute('DELETE FROM battery_sessions');

            if (data.tombstones && Array.isArray(data.tombstones)) {
              for (const ts of data.tombstones) {
                if (!ts || !ts.id) continue;
                await tx.execute(
                  'INSERT OR REPLACE INTO sync_tombstones (id, entityType, deletedAt) VALUES (?, ?, ?)',
                  [ts.id, ts.entityType, ts.deletedAt]
                );
              }
            }
          } else {
            // mode === 'merge': apply remote tombstones and delete corresponding local items
            if (data.tombstones && Array.isArray(data.tombstones)) {
              for (const ts of data.tombstones) {
                if (!ts || !ts.id) continue;
                await tx.execute(
                  `INSERT INTO sync_tombstones (id, entityType, deletedAt)
                   VALUES (?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET deletedAt = CASE WHEN excluded.deletedAt > sync_tombstones.deletedAt THEN excluded.deletedAt ELSE sync_tombstones.deletedAt END`,
                  [ts.id, ts.entityType, ts.deletedAt]
                );
                if (ts.entityType === 'task') {
                  await tx.execute('DELETE FROM reminders WHERE taskId = ?', [ts.id]);
                  await tx.execute('DELETE FROM tasks WHERE id = ? AND updatedAt <= ?', [ts.id, ts.deletedAt]);
                } else if (ts.entityType === 'keepNote') {
                  await tx.execute('DELETE FROM keep_notes WHERE id = ? AND updatedAt <= ?', [ts.id, ts.deletedAt]);
                } else if (ts.entityType === 'habit') {
                  await tx.execute(
                    'DELETE FROM habit_logs WHERE habitId = ? AND EXISTS (SELECT 1 FROM habits WHERE id = ? AND createdAt <= ?)',
                    [ts.id, ts.id, ts.deletedAt]
                  );
                  await tx.execute('DELETE FROM habits WHERE id = ? AND createdAt <= ?', [ts.id, ts.deletedAt]);
                } else if (ts.entityType === 'calendarEvent') {
                  await tx.execute('DELETE FROM calendar_events WHERE id = ? AND updatedAt <= ?', [ts.id, ts.deletedAt]);
                } else if (ts.entityType === 'note') {
                  await tx.execute('DELETE FROM notes WHERE id = ? AND updatedAt <= ?', [ts.id, ts.deletedAt]);
                } else if (ts.entityType === 'movieBookmark') {
                  await tx.execute(
                    'DELETE FROM movie_bookmarks WHERE (id = ? OR id = ?) AND savedAt <= ?',
                    [ts.id, `bm_${ts.id}`, ts.deletedAt]
                  );
                }
              }
            }
          }

          const tombstoneMap = new Map<string, string>();
          if (mode === 'merge') {
            const tombstonesRes = await tx.execute('SELECT id, deletedAt FROM sync_tombstones');
            for (const r of tombstonesRes.rows) {
              if (r.id) {
                tombstoneMap.set(String(r.id), String(r.deletedAt));
              }
            }
          }

          // 1. Ensure system default categories always exist
          for (const defCat of DEFAULT_CATEGORIES) {
            await tx.execute(
              `INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO NOTHING`,
              [defCat.id, defCat.name, defCat.color, defCat.icon, defCat.createdAt]
            );
          }

          // 2. Restore custom or imported categories
          if (data.categories && Array.isArray(data.categories)) {
            for (const cat of data.categories) {
              if (!cat || !cat.id) continue;
              await tx.execute(
                `INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, icon = excluded.icon`,
                [
                  cat.id,
                  cat.name || 'General',
                  cat.color || '#3B82F6',
                  cat.icon || 'tag',
                  cat.createdAt || new Date().toISOString(),
                ]
              );
            }
          }

          // 3. Cache valid category IDs and names to guarantee foreign key integrity
          const catRows = await tx.execute('SELECT id, name FROM categories');
          const validCategoryIds = new Set<string>();
          const categoryNameToId = new Map<string, string>();
          for (const r of catRows.rows) {
            if (r.id) {
              validCategoryIds.add(String(r.id));
            }
            if (r.name) {
              categoryNameToId.set(String(r.name).trim().toLowerCase(), String(r.id));
            }
          }

          const resolveTaskCategoryId = async (
            rawCatId?: string | null,
            rawCatName?: string | null
          ): Promise<string | null> => {
            const trimmedId = rawCatId && String(rawCatId).trim() ? String(rawCatId).trim() : null;
            const trimmedName = rawCatName && String(rawCatName).trim() ? String(rawCatName).trim() : null;

            if (trimmedId && validCategoryIds.has(trimmedId)) {
              return trimmedId;
            }
            if (trimmedId && categoryNameToId.has(trimmedId.toLowerCase())) {
              return categoryNameToId.get(trimmedId.toLowerCase())!;
            }
            if (trimmedName && categoryNameToId.has(trimmedName.toLowerCase())) {
              return categoryNameToId.get(trimmedName.toLowerCase())!;
            }
            if (trimmedName || (trimmedId && trimmedId.length < 50)) {
              const nameToCreate = trimmedName || trimmedId!;
              const newId = trimmedId || `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
              try {
                await tx.execute(
                  `INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO NOTHING`,
                  [newId, nameToCreate, '#6366F1', 'tag', new Date().toISOString()]
                );
                validCategoryIds.add(newId);
                categoryNameToId.set(nameToCreate.toLowerCase(), newId);
                return newId;
              } catch {
                return null;
              }
            }
            return null;
          };

          // 4. Restore tasks with timestamp conflict resolution & safe category mapping
          if (data.tasks && Array.isArray(data.tasks)) {
            for (const task of data.tasks) {
              if (!task || !task.id) continue;
              if (mode === 'merge') {
                const deletedAt = tombstoneMap.get(task.id);
                if (deletedAt && deletedAt >= (task.updatedAt || '')) {
                  continue;
                }
                if (deletedAt && (task.updatedAt || '') > deletedAt) {
                  await tx.execute('DELETE FROM sync_tombstones WHERE id = ?', [task.id]);
                  tombstoneMap.delete(task.id);
                }
              }
              const resolvedCatId = await resolveTaskCategoryId(task.categoryId, task.categoryName);
              const recurrenceJson = task.recurrenceRule
                ? (typeof task.recurrenceRule === 'string' ? task.recurrenceRule : JSON.stringify(task.recurrenceRule))
                : null;
              const isLoudVal = (task.isLoudAlarm ?? task.recurrenceRule?.isLoudAlarm) ? 1 : 0;
              const isOvernightVal = (task.isOvernight ?? task.recurrenceRule?.isOvernight) ? 1 : 0;
              const quadVal = task.eisenhowerQuadrant || task.recurrenceRule?.eisenhowerQuadrant || null;
              const accentVal = task.accentColor || task.recurrenceRule?.accentColor || null;
              const estMinVal = task.estimatedMinutes ?? task.recurrenceRule?.estimatedMinutes ?? null;

              const createdAtVal = task.createdAt || new Date().toISOString();
              const updatedAtVal = task.updatedAt || createdAtVal;
              const titleVal = task.title || 'Untitled Task';
              const priorityVal = task.priority || 'medium';
              const statusVal = task.status || 'pending';

              if (mode === 'merge') {
                await tx.execute(
                  `INSERT INTO tasks (
                    id, seriesId, title, description, date, startTime, endTime,
                    priority, categoryId, status, recurrenceRule,
                    reminderMinutes, snoozeUntil, notes, isLoudAlarm, isOvernight, eisenhowerQuadrant, accentColor, estimatedMinutes,
                    createdAt, updatedAt, completedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    seriesId = excluded.seriesId,
                    title = excluded.title,
                    description = excluded.description,
                    date = excluded.date,
                    startTime = excluded.startTime,
                    endTime = excluded.endTime,
                    priority = excluded.priority,
                    categoryId = excluded.categoryId,
                    status = excluded.status,
                    recurrenceRule = excluded.recurrenceRule,
                    reminderMinutes = excluded.reminderMinutes,
                    snoozeUntil = excluded.snoozeUntil,
                    notes = excluded.notes,
                    isLoudAlarm = excluded.isLoudAlarm,
                    isOvernight = excluded.isOvernight,
                    eisenhowerQuadrant = excluded.eisenhowerQuadrant,
                    accentColor = excluded.accentColor,
                    estimatedMinutes = excluded.estimatedMinutes,
                    updatedAt = excluded.updatedAt,
                    completedAt = excluded.completedAt
                  WHERE excluded.updatedAt >= tasks.updatedAt`,
                  [
                    task.id,
                    task.seriesId ?? null,
                    titleVal,
                    task.description ?? null,
                    task.date ?? null,
                    task.startTime ? (normalizeTimeTo24H(task.startTime) ?? null) : null,
                    task.endTime ? (normalizeTimeTo24H(task.endTime) ?? null) : null,
                    priorityVal,
                    resolvedCatId,
                    statusVal,
                    recurrenceJson,
                    task.reminderMinutes ?? 0,
                    task.snoozeUntil ?? null,
                    task.notes ?? null,
                    isLoudVal,
                    isOvernightVal,
                    quadVal,
                    accentVal,
                    estMinVal,
                    createdAtVal,
                    updatedAtVal,
                    task.completedAt ?? null,
                  ]
                );
              } else {
                await tx.execute(
                  `INSERT OR REPLACE INTO tasks (
                    id, seriesId, title, description, date, startTime, endTime,
                    priority, categoryId, status, recurrenceRule,
                    reminderMinutes, snoozeUntil, notes, isLoudAlarm, isOvernight, eisenhowerQuadrant, accentColor, estimatedMinutes,
                    createdAt, updatedAt, completedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    task.id,
                    task.seriesId ?? null,
                    titleVal,
                    task.description ?? null,
                    task.date ?? null,
                    task.startTime ? (normalizeTimeTo24H(task.startTime) ?? null) : null,
                    task.endTime ? (normalizeTimeTo24H(task.endTime) ?? null) : null,
                    priorityVal,
                    resolvedCatId,
                    statusVal,
                    recurrenceJson,
                    task.reminderMinutes ?? 0,
                    task.snoozeUntil ?? null,
                    task.notes ?? null,
                    isLoudVal,
                    isOvernightVal,
                    quadVal,
                    accentVal,
                    estMinVal,
                    createdAtVal,
                    updatedAtVal,
                    task.completedAt ?? null,
                  ]
                );
              }
            }
          }

          // 5. Restore habits
          const validHabitIds = new Set<string>();
          if (data.habits && Array.isArray(data.habits)) {
            for (const h of data.habits) {
              if (!h || !h.id) continue;
              const hCreatedAt = h.createdAt || new Date().toISOString();
              if (mode === 'merge') {
                const deletedAt = tombstoneMap.get(h.id);
                if (deletedAt && deletedAt >= hCreatedAt) {
                  continue;
                }
                if (deletedAt && hCreatedAt > deletedAt) {
                  await tx.execute('DELETE FROM sync_tombstones WHERE id = ?', [h.id]);
                  tombstoneMap.delete(h.id);
                }
              }
              validHabitIds.add(String(h.id));
              let recJson: string;
              if (typeof h.recurrenceRule === 'object' && h.recurrenceRule !== null) {
                recJson = JSON.stringify(h.recurrenceRule);
              } else if (typeof h.recurrenceRule === 'string') {
                try {
                  JSON.parse(h.recurrenceRule);
                  recJson = h.recurrenceRule;
                } catch {
                  recJson = JSON.stringify({ type: h.recurrenceRule || 'daily' });
                }
              } else {
                recJson = JSON.stringify({ type: 'daily' });
              }

              if (mode === 'merge') {
                await tx.execute(
                  `INSERT INTO habits (
                    id, name, description, icon, color, recurrenceRule,
                    target, reminderTime, createdAt, archivedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    icon = excluded.icon,
                    color = excluded.color,
                    recurrenceRule = excluded.recurrenceRule,
                    target = excluded.target,
                    reminderTime = excluded.reminderTime,
                    archivedAt = excluded.archivedAt`,
                  [
                    h.id,
                    h.name || 'Habit',
                    h.description ?? null,
                    h.icon || 'check',
                    h.color || '#10B981',
                    recJson,
                    h.target ?? 1,
                    h.reminderTime ?? null,
                    hCreatedAt,
                    h.archivedAt ?? null,
                  ]
                );
              } else {
                await tx.execute(
                  `INSERT OR REPLACE INTO habits (
                    id, name, description, icon, color, recurrenceRule,
                    target, reminderTime, createdAt, archivedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    h.id,
                    h.name || 'Habit',
                    h.description ?? null,
                    h.icon || 'check',
                    h.color || '#10B981',
                    recJson,
                    h.target ?? 1,
                    h.reminderTime ?? null,
                    hCreatedAt,
                    h.archivedAt ?? null,
                  ]
                );
              }
            }
          }

          if (mode === 'merge') {
            const hRes = await tx.execute('SELECT id FROM habits');
            for (const r of hRes.rows) {
              if (r.id) validHabitIds.add(String(r.id));
            }
          }

          // 6. Restore habit logs (only for existing habits to preserve integrity)
          if (data.habitLogs && Array.isArray(data.habitLogs)) {
            for (const hl of data.habitLogs) {
              if (!hl || !hl.habitId || !validHabitIds.has(String(hl.habitId)) || !hl.date) {
                continue;
              }
              const logDate = String(hl.date).split('T')[0];
              await tx.execute(
                `INSERT INTO habit_logs (
                  id, habitId, date, completed, value, notes, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(habitId, date) DO UPDATE SET
                  completed = excluded.completed,
                  value = excluded.value,
                  notes = excluded.notes`,
                [
                  hl.id || `hl_${hl.habitId}_${logDate}`,
                  hl.habitId,
                  logDate,
                  hl.completed ? 1 : 0,
                  hl.value ?? 1,
                  hl.notes ?? null,
                  hl.createdAt || new Date().toISOString(),
                ]
              );
            }
          }

          // 7. Restore notes
          if (data.notes && Array.isArray(data.notes)) {
            for (const n of data.notes) {
              if (!n || !n.id) continue;
              const nCreatedAt = n.createdAt || new Date().toISOString();
              const nUpdatedAt = n.updatedAt || nCreatedAt;
              if (mode === 'merge') {
                const deletedAt = tombstoneMap.get(n.id);
                if (deletedAt && deletedAt >= nUpdatedAt) {
                  continue;
                }
                if (deletedAt && nUpdatedAt > deletedAt) {
                  await tx.execute('DELETE FROM sync_tombstones WHERE id = ?', [n.id]);
                  tombstoneMap.delete(n.id);
                }
                await tx.execute(
                  `INSERT INTO notes (id, entityType, entityId, title, content, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     title = excluded.title, content = excluded.content, updatedAt = excluded.updatedAt
                   WHERE excluded.updatedAt >= notes.updatedAt`,
                  [
                    n.id,
                    n.entityType || 'general',
                    n.entityId ?? null,
                    n.title ?? null,
                    n.content || '',
                    nCreatedAt,
                    nUpdatedAt,
                  ]
                );
              } else {
                await tx.execute(
                  `INSERT OR REPLACE INTO notes (id, entityType, entityId, title, content, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [
                    n.id,
                    n.entityType || 'general',
                    n.entityId ?? null,
                    n.title ?? null,
                    n.content || '',
                    nCreatedAt,
                    nUpdatedAt,
                  ]
                );
              }
            }
          }

          // 8. Restore keep notes
          if (data.keepNotes && Array.isArray(data.keepNotes)) {
            for (const kn of data.keepNotes) {
              if (!kn || !kn.id) continue;
              if (mode === 'merge') {
                const deletedAt = tombstoneMap.get(kn.id);
                if (deletedAt && deletedAt >= (kn.updatedAt || '')) {
                  continue;
                }
                if (deletedAt && (kn.updatedAt || '') > deletedAt) {
                  await tx.execute('DELETE FROM sync_tombstones WHERE id = ?', [kn.id]);
                  tombstoneMap.delete(kn.id);
                }
              }
              const labelsJson = typeof kn.labels === 'string' ? kn.labels : JSON.stringify(kn.labels || []);
              const checklistJson = typeof kn.checklistData === 'string' ? kn.checklistData : JSON.stringify(kn.checklistData || []);
              const drawingJson = kn.drawingData
                ? (typeof kn.drawingData === 'string' ? kn.drawingData : JSON.stringify(kn.drawingData))
                : null;
              const knCreatedAt = kn.createdAt || new Date().toISOString();
              const knUpdatedAt = kn.updatedAt || knCreatedAt;

              if (mode === 'merge') {
                await tx.execute(
                  `INSERT INTO keep_notes (
                    id, title, content, type, color, isPinned, isArchived,
                    isTrashed, trashedAt, reminderTime, labels, checklistData,
                    drawingData, audioUri, imageUri, createdAt, updatedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    content = excluded.content,
                    type = excluded.type,
                    color = excluded.color,
                    isPinned = excluded.isPinned,
                    isArchived = excluded.isArchived,
                    isTrashed = excluded.isTrashed,
                    trashedAt = excluded.trashedAt,
                    reminderTime = excluded.reminderTime,
                    labels = excluded.labels,
                    checklistData = excluded.checklistData,
                    drawingData = excluded.drawingData,
                    audioUri = excluded.audioUri,
                    imageUri = excluded.imageUri,
                    updatedAt = excluded.updatedAt
                  WHERE excluded.updatedAt >= keep_notes.updatedAt`,
                  [
                    kn.id,
                    kn.title || '',
                    kn.content || '',
                    kn.type || 'text',
                    kn.color || 'default',
                    kn.isPinned ? 1 : 0,
                    kn.isArchived ? 1 : 0,
                    kn.isTrashed ? 1 : 0,
                    kn.trashedAt ?? null,
                    kn.reminderTime ?? null,
                    labelsJson,
                    checklistJson,
                    drawingJson,
                    kn.audioUri ?? null,
                    kn.imageUri ?? null,
                    knCreatedAt,
                    knUpdatedAt,
                  ]
                );
              } else {
                await tx.execute(
                  `INSERT OR REPLACE INTO keep_notes (
                    id, title, content, type, color, isPinned, isArchived,
                    isTrashed, trashedAt, reminderTime, labels, checklistData,
                    drawingData, audioUri, imageUri, createdAt, updatedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    kn.id,
                    kn.title || '',
                    kn.content || '',
                    kn.type || 'text',
                    kn.color || 'default',
                    kn.isPinned ? 1 : 0,
                    kn.isArchived ? 1 : 0,
                    kn.isTrashed ? 1 : 0,
                    kn.trashedAt ?? null,
                    kn.reminderTime ?? null,
                    labelsJson,
                    checklistJson,
                    drawingJson,
                    kn.audioUri ?? null,
                    kn.imageUri ?? null,
                    knCreatedAt,
                    knUpdatedAt,
                  ]
                );
              }
            }
          }

          // 9. Restore calendar events
          if (data.calendarEvents && Array.isArray(data.calendarEvents)) {
            for (const ev of data.calendarEvents) {
              if (!ev || !ev.id) continue;
              if (mode === 'merge') {
                const deletedAt = tombstoneMap.get(ev.id);
                if (deletedAt && deletedAt >= (ev.updatedAt || '')) {
                  continue;
                }
                if (deletedAt && (ev.updatedAt || '') > deletedAt) {
                  await tx.execute('DELETE FROM sync_tombstones WHERE id = ?', [ev.id]);
                  tombstoneMap.delete(ev.id);
                }
              }
              const ringVal = ev.ringAlarm === undefined ? 1 : (ev.ringAlarm ? 1 : 0);
              const evCreatedAt = ev.createdAt || new Date().toISOString();
              const evUpdatedAt = ev.updatedAt || evCreatedAt;

              if (mode === 'merge') {
                await tx.execute(
                  `INSERT INTO calendar_events (
                    id, title, description, date, time, ringAlarm, status, createdAt, updatedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    date = excluded.date,
                    time = excluded.time,
                    ringAlarm = excluded.ringAlarm,
                    status = excluded.status,
                    updatedAt = excluded.updatedAt
                  WHERE excluded.updatedAt >= calendar_events.updatedAt`,
                  [
                    ev.id,
                    ev.title || 'Event',
                    ev.description ?? null,
                    ev.date || new Date().toISOString().split('T')[0],
                    ev.time || '00:00',
                    ringVal,
                    ev.status || 'active',
                    evCreatedAt,
                    evUpdatedAt,
                  ]
                );
              } else {
                await tx.execute(
                  `INSERT OR REPLACE INTO calendar_events (
                    id, title, description, date, time, ringAlarm, status, createdAt, updatedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    ev.id,
                    ev.title || 'Event',
                    ev.description ?? null,
                    ev.date || new Date().toISOString().split('T')[0],
                    ev.time || '00:00',
                    ringVal,
                    ev.status || 'active',
                    evCreatedAt,
                    evUpdatedAt,
                  ]
                );
              }
            }
          }

          // 10. Restore movie bookmarks
          if (data.movieBookmarks && Array.isArray(data.movieBookmarks)) {
            for (const bm of data.movieBookmarks) {
              if (!bm || !bm.tmdbId) continue;
              const bmId = bm.id || `bm_${bm.tmdbId}_${bm.isTv ? 1 : 0}`;
              const savedAtVal = bm.savedAt || new Date().toISOString();
              if (mode === 'merge') {
                const deletedAt = tombstoneMap.get(bmId) || tombstoneMap.get(`movie_${bm.tmdbId}_${bm.isTv ? 1 : 0}`);
                if (deletedAt && deletedAt >= savedAtVal) {
                  continue;
                }
                if (deletedAt && savedAtVal > deletedAt) {
                  await tx.execute('DELETE FROM sync_tombstones WHERE id = ? OR id = ?', [bmId, `movie_${bm.tmdbId}_${bm.isTv ? 1 : 0}`]);
                  tombstoneMap.delete(bmId);
                  tombstoneMap.delete(`movie_${bm.tmdbId}_${bm.isTv ? 1 : 0}`);
                }
              }
              const genresStr = typeof bm.genres === 'string' ? bm.genres : JSON.stringify(bm.genres || []);

              if (mode === 'merge') {
                const existingRes = await tx.execute(
                  'SELECT id, savedAt FROM movie_bookmarks WHERE tmdbId = ? AND isTv = ?',
                  [bm.tmdbId, bm.isTv ? 1 : 0]
                );
                if (existingRes.rows && existingRes.rows.length > 0) {
                  const existingRow = existingRes.rows[0];
                  if (savedAtVal >= (existingRow.savedAt || '')) {
                    await tx.execute(
                      `UPDATE movie_bookmarks SET
                        title = ?,
                        overview = ?,
                        posterPath = ?,
                        backdropPath = ?,
                        voteAverage = ?,
                        releaseDate = ?,
                        genres = ?,
                        runtime = ?,
                        isWatched = ?,
                        savedAt = ?
                      WHERE id = ?`,
                      [
                        bm.title || 'Untitled',
                        bm.overview ?? null,
                        bm.posterPath ?? null,
                        bm.backdropPath ?? null,
                        bm.voteAverage ?? 0,
                        bm.releaseDate ?? null,
                        genresStr,
                        bm.runtime ?? 0,
                        bm.isWatched ? 1 : 0,
                        savedAtVal,
                        existingRow.id,
                      ]
                    );
                  }
                } else {
                  await tx.execute(
                    `INSERT OR REPLACE INTO movie_bookmarks (
                      id, tmdbId, title, overview, posterPath, backdropPath,
                      voteAverage, releaseDate, genres, runtime, isWatched, isTv, savedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      bmId,
                      bm.tmdbId,
                      bm.title || 'Untitled',
                      bm.overview ?? null,
                      bm.posterPath ?? null,
                      bm.backdropPath ?? null,
                      bm.voteAverage ?? 0,
                      bm.releaseDate ?? null,
                      genresStr,
                      bm.runtime ?? 0,
                      bm.isWatched ? 1 : 0,
                      bm.isTv ? 1 : 0,
                      savedAtVal,
                    ]
                  );
                }
              } else {
                await tx.execute(
                  `INSERT OR REPLACE INTO movie_bookmarks (
                    id, tmdbId, title, overview, posterPath, backdropPath,
                    voteAverage, releaseDate, genres, runtime, isWatched, isTv, savedAt
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    bmId,
                    bm.tmdbId,
                    bm.title || 'Untitled',
                    bm.overview ?? null,
                    bm.posterPath ?? null,
                    bm.backdropPath ?? null,
                    bm.voteAverage ?? 0,
                    bm.releaseDate ?? null,
                    genresStr,
                    bm.runtime ?? 0,
                    bm.isWatched ? 1 : 0,
                    bm.isTv ? 1 : 0,
                    savedAtVal,
                  ]
                );
              }
            }
          }

          // 11. Restore battery charging sessions
          if (data.batterySessions && Array.isArray(data.batterySessions)) {
            for (const bs of data.batterySessions) {
              if (!bs || !bs.startTime) continue;
              const bsId = bs.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              if (mode === 'merge') {
                await tx.execute(
                  `INSERT INTO battery_sessions (
                    id, startTime, endTime, startLevel, endLevel, gained,
                    durationMinutes, chargingType, peakTemperature, peakWattage, avgSpeedPerHour, completed
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    endTime = excluded.endTime,
                    endLevel = excluded.endLevel,
                    gained = excluded.gained,
                    durationMinutes = excluded.durationMinutes,
                    chargingType = excluded.chargingType,
                    peakTemperature = excluded.peakTemperature,
                    peakWattage = excluded.peakWattage,
                    avgSpeedPerHour = excluded.avgSpeedPerHour,
                    completed = excluded.completed`,
                  [
                    bsId,
                    bs.startTime,
                    bs.endTime ?? null,
                    bs.startLevel ?? 0,
                    bs.endLevel ?? null,
                    bs.gained ?? 0,
                    bs.durationMinutes ?? 0,
                    bs.chargingType || 'AC',
                    bs.peakTemperature ?? 0,
                    bs.peakWattage ?? 0,
                    bs.avgSpeedPerHour ?? 0,
                    bs.completed ?? 1,
                  ]
                );
              } else {
                await tx.execute(
                  `INSERT OR REPLACE INTO battery_sessions (
                    id, startTime, endTime, startLevel, endLevel, gained,
                    durationMinutes, chargingType, peakTemperature, peakWattage, avgSpeedPerHour, completed
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    bsId,
                    bs.startTime,
                    bs.endTime ?? null,
                    bs.startLevel ?? 0,
                    bs.endLevel ?? null,
                    bs.gained ?? 0,
                    bs.durationMinutes ?? 0,
                    bs.chargingType || 'AC',
                    bs.peakTemperature ?? 0,
                    bs.peakWattage ?? 0,
                    bs.avgSpeedPerHour ?? 0,
                    bs.completed ?? 1,
                  ]
                );
              }
            }
          }

          // 12. Restore settings (in merge mode, do not overwrite companion server credentials)
          if (data.settings && typeof data.settings === 'object' && data.settings !== null) {
            const now = new Date().toISOString();
            for (const [k, v] of Object.entries(data.settings)) {
              if (v !== undefined && v !== null) {
                if (mode === 'merge' && (k === 'companionServerUrl' || k === 'companionApiKey')) {
                  continue;
                }
                const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
                await tx.execute(
                  `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
                  [k, valStr, now]
                );
              }
            }
          }

          const modeDescription = mode === 'merge' ? 'merged with existing data' : 'restored cleanly';
          return {
            success: true,
            message: `Successfully ${modeDescription} (${data.tasks.length} tasks processed).`,
          };
        });
      } finally {
        await db.execute('PRAGMA foreign_keys = ON;').catch(() => {});
      }

      // Synchronize all alarms and reminders with the newly imported database
      try {
        await notificationService.restoreAllReminders();
        await alarmService.restoreAllHabitAlarms();
        await alarmService.restoreAllEventAlarms();
        await alarmService.restoreAllTaskAlarms();
      } catch (err) {
        console.warn('Failed to reschedule triggers after backup restore:', err);
      }

      // Notify active screens to immediately re-render with fresh data
      try {
        syncEventBus.notifyDataRestored();
      } catch (busErr) {
        console.warn('Failed to notify data restored event:', busErr);
      }

      return result;
    } catch (e: any) {
      return { success: false, message: e.message || 'Import failed due to corrupt data.' };
    }
  }

  private normalizeUrl(url: string): string {
    let clean = url.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    const hostPart = clean.replace(/^https?:\/\//i, '');
    if (!hostPart.includes(':')) {
      clean = `${clean}:3030`;
    }
    return clean;
  }

  private async resolveCompanionServerUrl(serverUrl?: string): Promise<string> {
    if (serverUrl && serverUrl.trim().length > 0) {
      return this.normalizeUrl(serverUrl);
    }
    const saved = await settingsRepository.get('companionServerUrl', '');
    if (saved && saved.trim().length > 0) {
      return this.normalizeUrl(saved);
    }
    return Platform.OS === 'android' ? 'http://10.0.2.2:3030' : 'http://localhost:3030';
  }

  private async fetchWithTimeout(url: string, options: any = {}, timeoutMs = 7000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw new Error(`Connection timed out after ${timeoutMs / 1000}s. Check server IP and port.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async clearAllData(): Promise<void> {
    try {
      await notificationService.cancelAllReminders();
      alarmService.stopRinging();
    } catch (purgeErr) {
      console.warn('clearAllData reminder cancellation notice:', purgeErr);
    }
    const db = await getDatabase();
    await db.execute('PRAGMA foreign_keys = OFF;').catch(() => {});
    try {
      await db.transaction(async (tx) => {
        await tx.execute('DELETE FROM reminders');
        await tx.execute('DELETE FROM habit_logs');
        await tx.execute('DELETE FROM tasks');
        await tx.execute('DELETE FROM habits');
        await tx.execute('DELETE FROM categories');
        await tx.execute('DELETE FROM notes');
        await tx.execute('DELETE FROM keep_notes');
        await tx.execute('DELETE FROM calendar_events');
        await tx.execute('DELETE FROM notification_schedules');
        await tx.execute('DELETE FROM sync_tombstones');
        await tx.execute('DELETE FROM pending_sync_queue');
        await tx.execute('DELETE FROM movie_bookmarks');
        await tx.execute('DELETE FROM battery_sessions');

        // Always restore system default categories so the app is not left in a broken zero-category state
        for (const defCat of DEFAULT_CATEGORIES) {
          await tx.execute(
            `INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
            [defCat.id, defCat.name, defCat.color, defCat.icon, defCat.createdAt]
          );
        }
      });
    } finally {
      await db.execute('PRAGMA foreign_keys = ON;').catch(() => {});
    }

    // Synchronize alarm caches and notify all active UI screens
    try {
      await alarmService.restoreAllHabitAlarms();
      await alarmService.restoreAllEventAlarms();
      await alarmService.restoreAllTaskAlarms();
      syncEventBus.notifyDataRestored();
    } catch (e) {
      console.warn('Post-clearAllData alarm/event refresh notice:', e);
    }
  }

  async pingCompanionServer(serverUrl?: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
    try {
      const targetUrl = await this.resolveCompanionServerUrl(serverUrl);
      const key = apiKey ?? (await settingsRepository.get('companionApiKey', ''));
      const headers: Record<string, string> = {};
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await this.fetchWithTimeout(`${targetUrl}/backup`, { method: 'GET', headers }, 4000);
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: 'Server reached, but API key is invalid or unauthorized.' };
      }
      if (!res.ok) {
        return { success: false, message: `Server responded with status HTTP ${res.status}` };
      }
      return { success: true, message: 'Connected to companion server successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Could not reach server.' };
    }
  }

  async syncToCompanionServer(serverUrl?: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
    try {
      const targetUrl = await this.resolveCompanionServerUrl(serverUrl);
      const key = apiKey ?? (await settingsRepository.get('companionApiKey', ''));
      const jsonStr = await this.exportBackup();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await this.fetchWithTimeout(`${targetUrl}/backup`, {
        method: 'POST',
        headers,
        body: jsonStr,
      });
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: 'Unauthorized: Invalid companion API key.' };
      }
      if (!res.ok) {
        throw new Error(`Companion server returned status ${res.status}`);
      }
      return { success: true, message: 'Backup successfully sent to companion server.' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to reach companion server.' };
    }
  }

  async restoreFromCompanionServer(
    serverUrl?: string,
    apiKey?: string,
    mode: RestoreMode = 'replace'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const targetUrl = await this.resolveCompanionServerUrl(serverUrl);
      const key = apiKey ?? (await settingsRepository.get('companionApiKey', ''));
      const headers: Record<string, string> = {};
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await this.fetchWithTimeout(`${targetUrl}/backup/latest`, { headers });
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: 'Unauthorized: Invalid companion API key.' };
      }
      if (res.status === 404) {
        return { success: false, message: 'No backup found on companion server.' };
      }
      if (!res.ok) {
        throw new Error(`Companion server returned status ${res.status}`);
      }
      const rawText = await res.text();
      if (!rawText || rawText.trim().length === 0) {
        return { success: false, message: 'Companion server returned an empty backup file.' };
      }
      return await this.importBackup(rawText, mode);
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to retrieve backup from companion server.' };
    }
  }
}

export const backupService = BackupService.getInstance();
