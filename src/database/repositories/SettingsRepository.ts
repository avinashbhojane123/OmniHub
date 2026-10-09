import { getDatabase } from '../connection';

export class SettingsRepository {
  async get(key: string, defaultValue = ''): Promise<string> {
    const db = await getDatabase();
    const result = await db.execute('SELECT value FROM settings WHERE key = ?', [key]);
    if (result.rows.length === 0) return defaultValue;
    return result.rows[0].value ?? defaultValue;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      [key, value, now]
    );
  }

  async getAll(): Promise<Record<string, string>> {
    const db = await getDatabase();
    const result = await db.execute('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const r of result.rows) {
      settings[r.key] = r.value;
    }
    return settings;
  }
}

export const settingsRepository = new SettingsRepository();
