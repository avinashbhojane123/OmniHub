import { BackupData } from '../../types';
import { taskRepository } from '../../database/repositories/TaskRepository';
import { categoryRepository } from '../../database/repositories/CategoryRepository';
import { calendarRepository } from '../../database/repositories/CalendarRepository';
import { habitRepository } from '../../database/repositories/HabitRepository';
import { goalRepository } from '../../database/repositories/GoalRepository';
import { noteRepository } from '../../database/repositories/NoteRepository';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { getDatabase } from '../../database/connection';

export class BackupService {
  async exportBackup(): Promise<string> {
    const tasks = await taskRepository.findAll();
    const categories = await categoryRepository.findAll();
    const calendarEvents = await calendarRepository.findAll();
    const habits = await habitRepository.findAll();
    const goals = await goalRepository.findAll();
    const notes = await noteRepository.findByEntity('general');
    const settings = await settingsRepository.getAll();

    // Fetch all habit logs
    const habitLogs: any[] = [];
    for (const h of habits) {
      const logs = await habitRepository.getLogsForHabit(h.id);
      habitLogs.push(...logs);
    }

    const backup: BackupData = {
      version: 1,
      createdAt: new Date().toISOString(),
      tasks,
      categories,
      calendarEvents,
      habits,
      habitLogs,
      goals,
      notes,
      settings,
    };

    return JSON.stringify(backup, null, 2);
  }

  async importBackup(jsonString: string): Promise<{ success: boolean; message: string }> {
    let rollbackBackup: string | null = null;
    try {
      const data: BackupData = JSON.parse(jsonString);
      if (!data.version || !Array.isArray(data.tasks)) {
        throw new Error('Invalid backup file format');
      }

      // Snapshot current data for atomic rollback in case of restore failure
      try {
        rollbackBackup = await this.exportBackup();
      } catch {}

      const db = await getDatabase();

      return await db.transaction(async (tx) => {
        // Clear existing records safely within transaction
        await tx.execute('DELETE FROM goal_tasks');
        await tx.execute('DELETE FROM goals');
        await tx.execute('DELETE FROM habit_logs');
        await tx.execute('DELETE FROM habits');
        await tx.execute('DELETE FROM calendar_events');
        await tx.execute('DELETE FROM tasks');
        await tx.execute('DELETE FROM categories');
        await tx.execute('DELETE FROM notes');

        // Restore categories
        if (data.categories) {
          for (const cat of data.categories) {
            await categoryRepository.create(cat);
          }
        }

        // Restore tasks
        if (data.tasks) {
          for (const task of data.tasks) {
            await taskRepository.create(task);
          }
        }

        // Restore calendar events
        if (data.calendarEvents) {
          for (const ev of data.calendarEvents) {
            await calendarRepository.create(ev);
          }
        }

        // Restore habits
        if (data.habits) {
          for (const h of data.habits) {
            await habitRepository.create(h);
          }
        }

        // Restore habit logs
        if (data.habitLogs) {
          for (const l of data.habitLogs) {
            await habitRepository.logHabit(l.habitId, l.date, Boolean(l.completed), l.notes);
          }
        }

        // Restore goals
        if (data.goals) {
          for (const g of data.goals) {
            await goalRepository.create(g);
          }
        }

        // Restore notes
        if (data.notes) {
          for (const n of data.notes) {
            await noteRepository.create(n);
          }
        }

        // Restore settings
        if (data.settings && typeof data.settings === 'object') {
          for (const [k, v] of Object.entries(data.settings)) {
            if (typeof v === 'string') {
              await settingsRepository.set(k, v);
            }
          }
        }

        return { success: true, message: `Successfully restored ${data.tasks.length} tasks and productivity data.` };
      });
    } catch (e: any) {
      // If a failure occurred and we took a rollback snapshot, attempt to re-restore the snapshot
      if (rollbackBackup) {
        try {
          const prevData: BackupData = JSON.parse(rollbackBackup);
          for (const cat of prevData.categories || []) await categoryRepository.create(cat);
          for (const task of prevData.tasks || []) await taskRepository.create(task);
          for (const h of prevData.habits || []) await habitRepository.create(h);
        } catch {}
      }
      return { success: false, message: e.message || 'Import failed due to corrupt data.' };
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
      const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/backup`, {
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

  async restoreFromCompanionServer(serverUrl?: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
    try {
      const targetUrl = serverUrl || (await settingsRepository.get('companionServerUrl', 'http://10.0.2.2:3030'));
      const key = apiKey ?? (await settingsRepository.get('companionApiKey', ''));
      const headers: Record<string, string> = {};
      if (key) {
        headers['x-api-key'] = key;
      }
      const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/backup/latest`, { headers });
      if (!res.ok) {
        throw new Error(`Companion server returned status ${res.status}`);
      }
      const data = await res.json();
      return await this.importBackup(JSON.stringify(data));
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to retrieve backup from companion server.' };
    }
  }
}

export const backupService = new BackupService();
