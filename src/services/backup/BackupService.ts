import { BackupData } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { categoryRepository } from '../../database/repositories/CategoryRepository';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { noteRepository } from '../../database/repositories/NoteRepository';
import { keepNoteRepository } from '../../database/repositories/KeepNoteRepository';
import { calendarRepository } from '../../database/repositories/CalendarRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { tombstoneRepository } from '../../database/repositories/TombstoneRepository';
import { getDatabase } from '../../database/connection';
import { notificationService } from '../notifications/NotificationService';
import { alarmService } from '../alarm/AlarmService';

import { DEFAULT_SETTINGS } from '../../database/seed';
import { normalizeTimeTo24H } from '../../utils/time';

export type RestoreMode = 'replace' | 'merge';

export class BackupService {
  async exportBackup(): Promise<string> {
    const tasks = await taskRepository.findAll();
    const categories = await categoryRepository.findAll();
    const habits = await habitRepository.findAll();
    const notes = await noteRepository.findAll();
    const keepNotes = await keepNoteRepository.findAll();
    const calendarEvents = await calendarRepository.findAll();
    const rawSettings = await settingsRepository.getAll();
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const [k, v] of Object.entries(rawSettings)) {
      if (v !== undefined && v !== null) {
        settings[k] = v;
      }
    }
    if (!settings.notificationsEnabled) {
      settings.notificationsEnabled = 'true';
    }

    // Fetch all habit logs in a single batch query
    const db = await getDatabase();
    const logsResult = await db.execute('SELECT * FROM habit_logs ORDER BY date DESC');
    const habitLogs = logsResult.rows.map((r) => ({
      id: r.id,
      habitId: r.habitId,
      date: r.date,
      completed: Boolean(r.completed),
      value: Number(r.value),
      notes: r.notes ?? undefined,
      createdAt: r.createdAt,
    }));

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
      const data: BackupData = JSON.parse(jsonString);
      if (!data.version || !Array.isArray(data.tasks)) {
        throw new Error('Invalid backup file format: missing version or tasks array');
      }

      const db = await getDatabase();

      const result = await db.transaction(async (tx) => {
        if (mode === 'replace') {
          // Clear existing records safely within transaction
          await tx.execute('DELETE FROM habit_logs');
          await tx.execute('DELETE FROM habits');
          await tx.execute('DELETE FROM tasks');
          await tx.execute('DELETE FROM categories');
          await tx.execute('DELETE FROM notes');
          await tx.execute('DELETE FROM keep_notes');
          await tx.execute('DELETE FROM calendar_events');
          await tx.execute('DELETE FROM sync_tombstones');

          if (data.tombstones && Array.isArray(data.tombstones)) {
            for (const ts of data.tombstones) {
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
              await tx.execute(
                `INSERT INTO sync_tombstones (id, entityType, deletedAt)
                 VALUES (?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET deletedAt = CASE WHEN excluded.deletedAt > sync_tombstones.deletedAt THEN excluded.deletedAt ELSE sync_tombstones.deletedAt END`,
                [ts.id, ts.entityType, ts.deletedAt]
              );
              if (ts.entityType === 'task') {
                await tx.execute('DELETE FROM tasks WHERE id = ? AND updatedAt <= ?', [ts.id, ts.deletedAt]);
              } else if (ts.entityType === 'keepNote') {
                await tx.execute('DELETE FROM keep_notes WHERE id = ? AND updatedAt <= ?', [ts.id, ts.deletedAt]);
              } else if (ts.entityType === 'habit') {
                await tx.execute('DELETE FROM habits WHERE id = ?', [ts.id]);
                await tx.execute('DELETE FROM habit_logs WHERE habitId = ?', [ts.id]);
              } else if (ts.entityType === 'calendarEvent') {
                await tx.execute('DELETE FROM calendar_events WHERE id = ? AND updatedAt <= ?', [ts.id, ts.deletedAt]);
              }
            }
          }
        }

        const tombstoneMap = new Map<string, string>();
        if (mode === 'merge') {
          const tombstonesRes = await tx.execute('SELECT id, deletedAt FROM sync_tombstones');
          for (const r of tombstonesRes.rows) {
            tombstoneMap.set(r.id, r.deletedAt);
          }
        }

        // Restore categories
        if (data.categories) {
          for (const cat of data.categories) {
            await tx.execute(
              `INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, icon = excluded.icon`,
              [cat.id, cat.name, cat.color, cat.icon, cat.createdAt]
            );
          }
        }

        // Restore tasks with timestamp conflict resolution
        if (data.tasks) {
          for (const task of data.tasks) {
            if (mode === 'merge') {
              const deletedAt = tombstoneMap.get(task.id);
              if (deletedAt && deletedAt >= task.updatedAt) {
                continue;
              }
            }
            const recurrenceJson = task.recurrenceRule ? JSON.stringify(task.recurrenceRule) : null;
            const isLoudVal = task.recurrenceRule?.isLoudAlarm ? 1 : 0;
            const quadVal = task.recurrenceRule?.eisenhowerQuadrant || null;
            const accentVal = task.recurrenceRule?.accentColor || null;
            const estMinVal = task.recurrenceRule?.estimatedMinutes ?? null;

            if (mode === 'merge') {
              await tx.execute(
                `INSERT INTO tasks (
                  id, seriesId, title, description, date, startTime, endTime,
                  priority, categoryId, status, recurrenceRule,
                  reminderMinutes, snoozeUntil, notes, isLoudAlarm, eisenhowerQuadrant, accentColor, estimatedMinutes,
                  createdAt, updatedAt, completedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                  eisenhowerQuadrant = excluded.eisenhowerQuadrant,
                  accentColor = excluded.accentColor,
                  estimatedMinutes = excluded.estimatedMinutes,
                  updatedAt = excluded.updatedAt,
                  completedAt = excluded.completedAt
                WHERE excluded.updatedAt >= tasks.updatedAt`,
                [
                  task.id,
                  task.seriesId ?? null,
                  task.title,
                  task.description ?? null,
                  task.date,
                  task.startTime ? (normalizeTimeTo24H(task.startTime) ?? null) : null,
                  task.endTime ? (normalizeTimeTo24H(task.endTime) ?? null) : null,
                  task.priority,
                  task.categoryId ?? null,
                  task.status,
                  recurrenceJson,
                  task.reminderMinutes ?? 0,
                  task.snoozeUntil ?? null,
                  task.notes ?? null,
                  isLoudVal,
                  quadVal,
                  accentVal,
                  estMinVal,
                  task.createdAt,
                  task.updatedAt,
                  task.completedAt ?? null,
                ]
              );
            } else {
              await tx.execute(
                `INSERT INTO tasks (
                  id, seriesId, title, description, date, startTime, endTime,
                  priority, categoryId, status, recurrenceRule,
                  reminderMinutes, snoozeUntil, notes, isLoudAlarm, eisenhowerQuadrant, accentColor, estimatedMinutes,
                  createdAt, updatedAt, completedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  task.id,
                  task.seriesId ?? null,
                  task.title,
                  task.description ?? null,
                  task.date,
                  task.startTime ? (normalizeTimeTo24H(task.startTime) ?? null) : null,
                  task.endTime ? (normalizeTimeTo24H(task.endTime) ?? null) : null,
                  task.priority,
                  task.categoryId ?? null,
                  task.status,
                  recurrenceJson,
                  task.reminderMinutes ?? 0,
                  task.snoozeUntil ?? null,
                  task.notes ?? null,
                  isLoudVal,
                  quadVal,
                  accentVal,
                  estMinVal,
                  task.createdAt,
                  task.updatedAt,
                  task.completedAt ?? null,
                ]
              );
            }
          }
        }

        // Restore habits
        if (data.habits) {
          for (const h of data.habits) {
            if (mode === 'merge') {
              const deletedAt = tombstoneMap.get(h.id);
              if (deletedAt) {
                continue;
              }
            }
            const recJson = typeof h.recurrenceRule === 'object' ? JSON.stringify(h.recurrenceRule) : h.recurrenceRule;
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
                  h.name,
                  h.description ?? null,
                  h.icon,
                  h.color,
                  recJson,
                  h.target,
                  h.reminderTime ?? null,
                  h.createdAt,
                  h.archivedAt ?? null,
                ]
              );
            } else {
              await tx.execute(
                `INSERT INTO habits (
                  id, name, description, icon, color, recurrenceRule,
                  target, reminderTime, createdAt, archivedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  h.id,
                  h.name,
                  h.description ?? null,
                  h.icon,
                  h.color,
                  recJson,
                  h.target,
                  h.reminderTime ?? null,
                  h.createdAt,
                  h.archivedAt ?? null,
                ]
              );
            }
          }
        }

        // Restore habit logs
        if (data.habitLogs) {
          for (const hl of data.habitLogs) {
            await tx.execute(
              `INSERT INTO habit_logs (
                id, habitId, date, completed, value, notes, createdAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(habitId, date) DO UPDATE SET
                completed = excluded.completed,
                value = excluded.value,
                notes = excluded.notes`,
              [
                hl.id,
                hl.habitId,
                hl.date,
                hl.completed ? 1 : 0,
                hl.value ?? 1,
                hl.notes ?? null,
                hl.createdAt,
              ]
            );
          }
        }

        // Restore notes
        if (data.notes) {
          for (const n of data.notes) {
            await tx.execute(
              `INSERT INTO notes (id, entityType, entityId, title, content, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title, content = excluded.content, updatedAt = excluded.updatedAt
               WHERE excluded.updatedAt >= notes.updatedAt`,
              [n.id, n.entityType, n.entityId ?? null, n.title ?? null, n.content, n.createdAt, n.updatedAt]
            );
          }
        }

        // Restore keep notes
        if (data.keepNotes && Array.isArray(data.keepNotes)) {
          for (const kn of data.keepNotes) {
            if (mode === 'merge') {
              const deletedAt = tombstoneMap.get(kn.id);
              if (deletedAt && deletedAt >= kn.updatedAt) {
                continue;
              }
            }
            const labelsJson = JSON.stringify(kn.labels || []);
            const checklistJson = JSON.stringify(kn.checklistData || []);
            const drawingJson = kn.drawingData ? JSON.stringify(kn.drawingData) : null;
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
                  kn.createdAt,
                  kn.updatedAt,
                ]
              );
            } else {
              await tx.execute(
                `INSERT INTO keep_notes (
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
                  kn.createdAt,
                  kn.updatedAt,
                ]
              );
            }
          }
        }

        // Restore calendar events
        if (data.calendarEvents) {
          for (const ev of data.calendarEvents) {
            if (mode === 'merge') {
              const deletedAt = tombstoneMap.get(ev.id);
              if (deletedAt && deletedAt >= ev.updatedAt) {
                continue;
              }
            }
            const ringVal = ev.ringAlarm === undefined ? 1 : (ev.ringAlarm ? 1 : 0);
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
                  ev.title,
                  ev.description ?? null,
                  ev.date,
                  ev.time,
                  ringVal,
                  ev.status || 'active',
                  ev.createdAt,
                  ev.updatedAt,
                ]
              );
            } else {
              await tx.execute(
                `INSERT INTO calendar_events (
                  id, title, description, date, time, ringAlarm, status, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  ev.id,
                  ev.title,
                  ev.description ?? null,
                  ev.date,
                  ev.time,
                  ringVal,
                  ev.status || 'active',
                  ev.createdAt,
                  ev.updatedAt,
                ]
              );
            }
          }
        }

        // Restore settings (in merge mode, do not overwrite companion server credentials)
        if (data.settings && typeof data.settings === 'object') {
          const now = new Date().toISOString();
          for (const [k, v] of Object.entries(data.settings)) {
            if (typeof v === 'string') {
              if (mode === 'merge' && (k === 'companionServerUrl' || k === 'companionApiKey')) {
                continue;
              }
              await tx.execute(
                `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
                [k, v, now]
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

      // Synchronize alarms and reminders with the newly imported database
      try {
        await notificationService.restoreAllReminders();
        await alarmService.restoreAllHabitAlarms();
        await alarmService.restoreAllEventAlarms();
      } catch (err) {
        console.warn('Failed to reschedule triggers after backup restore:', err);
      }

      return result;
    } catch (e: any) {
      return { success: false, message: e.message || 'Import failed due to corrupt data.' };
    }
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
    const db = await getDatabase();
    await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM habit_logs');
      await tx.execute('DELETE FROM habits');
      await tx.execute('DELETE FROM tasks');
      await tx.execute('DELETE FROM notes');
      await tx.execute('DELETE FROM keep_notes');
      await tx.execute('DELETE FROM calendar_events');
      await tx.execute('DELETE FROM reminders');
      await tx.execute('DELETE FROM notification_schedules');
    });
  }

  async pingCompanionServer(serverUrl?: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
    try {
      const targetUrl = serverUrl || (await settingsRepository.get('companionServerUrl', 'http://10.0.2.2:3030'));
      const key = apiKey ?? (await settingsRepository.get('companionApiKey', ''));
      const headers: Record<string, string> = {};
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await this.fetchWithTimeout(`${targetUrl.replace(/\/+$/, '')}/backup`, { method: 'GET', headers }, 4000);
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
      const targetUrl = serverUrl || (await settingsRepository.get('companionServerUrl', 'http://10.0.2.2:3030'));
      const key = apiKey ?? (await settingsRepository.get('companionApiKey', ''));
      const jsonStr = await this.exportBackup();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await this.fetchWithTimeout(`${targetUrl.replace(/\/+$/, '')}/backup`, {
        method: 'POST',
        headers,
        body: jsonStr,
      });
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
      const targetUrl = serverUrl || (await settingsRepository.get('companionServerUrl', 'http://10.0.2.2:3030'));
      const key = apiKey ?? (await settingsRepository.get('companionApiKey', ''));
      const headers: Record<string, string> = {};
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await this.fetchWithTimeout(`${targetUrl.replace(/\/+$/, '')}/backup/latest`, { headers });
      if (!res.ok) {
        throw new Error(`Companion server returned status ${res.status}`);
      }
      const rawText = await res.text();
      return await this.importBackup(rawText, mode);
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to retrieve backup from companion server.' };
    }
  }
}

export const backupService = new BackupService();
