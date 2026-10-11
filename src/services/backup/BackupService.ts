import { BackupData } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { categoryRepository } from '../../database/repositories/CategoryRepository';
import { calendarRepository } from '../../database/repositories/CalendarRepository';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { goalRepository } from '../../database/repositories/GoalRepository';
import { noteRepository } from '../../database/repositories/NoteRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { getDatabase } from '../../database/connection';
import { notificationService } from '../notifications/NotificationService';
import { alarmService } from '../alarm/AlarmService';

export type RestoreMode = 'replace' | 'merge';

export class BackupService {
  async exportBackup(): Promise<string> {
    const tasks = await taskRepository.findAll();
    const categories = await categoryRepository.findAll();
    const calendarEvents = await calendarRepository.findAll();
    const habits = await habitRepository.findAll();
    const goals = await goalRepository.findAll();
    const goalTasks = await goalRepository.getAllLinks();
    const notes = await noteRepository.findAll();
    const settings = await settingsRepository.getAll();

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

    const backup: BackupData = {
      version: 1,
      createdAt: new Date().toISOString(),
      tasks,
      categories,
      calendarEvents,
      habits,
      habitLogs,
      goals,
      goalTasks,
      notes,
      settings,
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
          await tx.execute('DELETE FROM goal_tasks');
          await tx.execute('DELETE FROM goals');
          await tx.execute('DELETE FROM habit_logs');
          await tx.execute('DELETE FROM habits');
          await tx.execute('DELETE FROM calendar_events');
          await tx.execute('DELETE FROM tasks');
          await tx.execute('DELETE FROM categories');
          await tx.execute('DELETE FROM notes');
        }

        const insertPrefix = mode === 'merge' ? 'INSERT OR IGNORE INTO' : 'INSERT INTO';

        // Restore categories
        if (data.categories) {
          for (const cat of data.categories) {
            await tx.execute(
              `${insertPrefix} categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)`,
              [cat.id, cat.name, cat.color, cat.icon, cat.createdAt]
            );
          }
        }

        // Restore tasks
        if (data.tasks) {
          for (const task of data.tasks) {
            const recurrenceJson = task.recurrenceRule ? JSON.stringify(task.recurrenceRule) : null;
            await tx.execute(
              `${insertPrefix} tasks (
                id, title, description, date, startTime, endTime,
                priority, categoryId, status, recurrenceRule,
                reminderMinutes, snoozeUntil, notes, createdAt, updatedAt, completedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                task.id,
                task.title,
                task.description ?? null,
                task.date,
                task.startTime ?? null,
                task.endTime ?? null,
                task.priority,
                task.categoryId ?? null,
                task.status,
                recurrenceJson,
                task.reminderMinutes ?? 0,
                task.snoozeUntil ?? null,
                task.notes ?? null,
                task.createdAt,
                task.updatedAt,
                task.completedAt ?? null,
              ]
            );
          }
        }

        // Restore calendar events
        if (data.calendarEvents) {
          for (const ev of data.calendarEvents) {
            await tx.execute(
              `${insertPrefix} calendar_events (
                id, externalId, calendarId, title, description,
                startTime, endTime, location, source, isAllDay,
                createdAt, updatedAt, syncedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                ev.id,
                ev.externalId ?? null,
                ev.calendarId ?? null,
                ev.title,
                ev.description ?? null,
                ev.startTime,
                ev.endTime,
                ev.location ?? null,
                ev.source || 'local',
                ev.isAllDay ? 1 : 0,
                ev.createdAt,
                ev.updatedAt,
                ev.syncedAt ?? null,
              ]
            );
          }
        }

        // Restore habits
        if (data.habits) {
          for (const h of data.habits) {
            const recJson = typeof h.recurrenceRule === 'object' ? JSON.stringify(h.recurrenceRule) : h.recurrenceRule;
            await tx.execute(
              `${insertPrefix} habits (
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

        // Restore habit logs
        if (data.habitLogs) {
          for (const hl of data.habitLogs) {
            await tx.execute(
              `${insertPrefix} habit_logs (
                id, habitId, date, completed, value, notes, createdAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

        // Restore goals
        if (data.goals) {
          for (const g of data.goals) {
            await tx.execute(
              `${insertPrefix} goals (
                id, title, description, deadline, progress,
                color, category, createdAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                g.id,
                g.title,
                g.description ?? null,
                g.deadline ?? null,
                g.progress || 0,
                g.color ?? null,
                g.category ?? null,
                g.createdAt,
                g.updatedAt,
              ]
            );
          }
        }

        // Restore goal-task links
        if (data.goalTasks) {
          for (const gt of data.goalTasks) {
            const id = gt.id || `gt_${gt.goalId}_${gt.taskId}`;
            await tx.execute(
              `${insertPrefix} goal_tasks (id, goalId, taskId) VALUES (?, ?, ?)`,
              [id, gt.goalId, gt.taskId]
            );
          }
        }

        // Restore notes
        if (data.notes) {
          for (const n of data.notes) {
            await tx.execute(
              `${insertPrefix} notes (id, entityType, entityId, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [n.id, n.entityType, n.entityId ?? null, n.title ?? null, n.content, n.createdAt, n.updatedAt]
            );
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
      const payload = JSON.parse(jsonStr);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await this.fetchWithTimeout(`${targetUrl.replace(/\/+$/, '')}/backup`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
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
      const data = await res.json();
      return await this.importBackup(JSON.stringify(data), mode);
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to retrieve backup from companion server.' };
    }
  }
}

export const backupService = new BackupService();
