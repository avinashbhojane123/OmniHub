import { Category } from '../types';
import { SETTINGS_KEYS, DEFAULT_GOOGLE_SHEET_WEBHOOK_URL } from '../constants/settingsKeys';

/**
 * Minimal database executor contract to avoid circular dependencies with DatabaseAdapter.
 */
export interface SeedDatabaseExecutor {
  execute(query: string, params?: any[]): Promise<{ rows: any[]; rowsAffected?: number }>;
}

/**
 * Canonical default category blueprints with unicode emoji icons.
 * Aligns with CreateCategoryModal and TasksScreen emoji chips.
 */
export const DEFAULT_CATEGORY_SEEDS = [
  {
    id: 'cat-work',
    name: 'Work',
    color: '#3B82F6', // Blue
    icon: '💼',
  },
  {
    id: 'cat-study',
    name: 'Study',
    color: '#8B5CF6', // Purple
    icon: '📚',
  },
  {
    id: 'cat-health',
    name: 'Health',
    color: '#10B981', // Emerald
    icon: '💪',
  },
  {
    id: 'cat-personal',
    name: 'Personal',
    color: '#F59E0B', // Amber
    icon: '👤',
  },
  {
    id: 'cat-family',
    name: 'Family',
    color: '#EC4899', // Pink
    icon: '👥',
  },
  {
    id: 'cat-finance',
    name: 'Finance',
    color: '#14B8A6', // Teal
    icon: '💰',
  },
  {
    id: 'cat-goals',
    name: 'Goals',
    color: '#6366F1', // Indigo
    icon: '🎯',
  },
] as const;

/**
 * Factory creating default categories with fresh ISO timestamps.
 * Eliminates static/frozen module evaluation timestamps and mutation hazards.
 */
export function createDefaultCategories(now: string = new Date().toISOString()): Category[] {
  return DEFAULT_CATEGORY_SEEDS.map((cat) => ({
    id: cat.id,
    name: cat.name,
    color: cat.color,
    icon: cat.icon,
    createdAt: now,
  }));
}

/**
 * Frozen immutable array of default categories for backward-compatibility.
 */
export const DEFAULT_CATEGORIES: Category[] = Object.freeze(
  createDefaultCategories()
) as unknown as Category[];

/**
 * Legacy category icon text to unicode emoji mapping.
 * Upgrades legacy seed strings (e.g. 'briefcase') to clean emojis.
 */
export const LEGACY_CATEGORY_ICON_MAP: Record<string, string> = {
  briefcase: '💼',
  'book-open': '📚',
  'heart-pulse': '💪',
  user: '👤',
  users: '👥',
  wallet: '💰',
  target: '🎯',
};

/**
 * Normalizes legacy text icon representations to modern unicode emojis.
 */
export function normalizeCategoryIcon(icon?: string | null): string {
  if (!icon || typeof icon !== 'string') return '🏷️';
  const trimmed = icon.trim();
  return LEGACY_CATEGORY_ICON_MAP[trimmed] || trimmed || '🏷️';
}

/**
 * Strongly typed interface for all known application settings defaults.
 */
export interface DefaultSettingsSchema {
  readonly [SETTINGS_KEYS.NOTIFICATIONS_ENABLED]: string;
  readonly [SETTINGS_KEYS.NOTIFICATION_SOUND]: string;
  readonly [SETTINGS_KEYS.NOTIFICATION_SOUND_TONE]: string;
  readonly [SETTINGS_KEYS.NOTIFICATION_VIBRATION]: string;
  readonly [SETTINGS_KEYS.DEFAULT_REMINDER_MINUTES]: string;
  readonly [SETTINGS_KEYS.DEFAULT_SNOOZE_MINUTES]: string;
  readonly [SETTINGS_KEYS.THEME]: string;
  readonly [SETTINGS_KEYS.USER_NAME]: string;
  readonly [SETTINGS_KEYS.USER_AVATAR]: string;
  readonly [SETTINGS_KEYS.BIRTH_DATE]: string;
  readonly [SETTINGS_KEYS.BIRTH_TIME]: string;
  readonly [SETTINGS_KEYS.TODAY_VIEW_MODE]: string;
  readonly [SETTINGS_KEYS.EXACT_ALARM_DISMISSED]: string;
  readonly [SETTINGS_KEYS.BATTERY_SOUND]: string;
  readonly [SETTINGS_KEYS.BATTERY_VIBRATION]: string;
  readonly [SETTINGS_KEYS.DEFAULT_WORKSPACE]: string;
  readonly [SETTINGS_KEYS.KEEP_NOTES_VIEW_MODE]: string;
  readonly [SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL]: string;
  readonly [SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC]: string;
  readonly [SETTINGS_KEYS.GOOGLE_SHEET_PENDING_SYNC]: string;
  readonly [key: string]: string;
}

/**
 * Comprehensive, canonical default settings dictionary.
 * Maps every setting key cleanly using SETTINGS_KEYS constants.
 */
export const DEFAULT_SETTINGS: DefaultSettingsSchema = Object.freeze({
  [SETTINGS_KEYS.NOTIFICATIONS_ENABLED]: 'true',
  [SETTINGS_KEYS.NOTIFICATION_SOUND]: 'true',
  [SETTINGS_KEYS.NOTIFICATION_SOUND_TONE]: 'standard',
  [SETTINGS_KEYS.NOTIFICATION_VIBRATION]: 'true',
  [SETTINGS_KEYS.DEFAULT_REMINDER_MINUTES]: '10',
  [SETTINGS_KEYS.DEFAULT_SNOOZE_MINUTES]: '10',
  [SETTINGS_KEYS.THEME]: 'system',
  [SETTINGS_KEYS.USER_NAME]: '',
  [SETTINGS_KEYS.USER_AVATAR]: '👤',
  [SETTINGS_KEYS.BIRTH_DATE]: '',
  [SETTINGS_KEYS.BIRTH_TIME]: '',
  [SETTINGS_KEYS.TODAY_VIEW_MODE]: 'timeline',
  [SETTINGS_KEYS.EXACT_ALARM_DISMISSED]: 'false',
  [SETTINGS_KEYS.BATTERY_SOUND]: 'true',
  [SETTINGS_KEYS.BATTERY_VIBRATION]: 'true',
  [SETTINGS_KEYS.DEFAULT_WORKSPACE]: 'select',
  [SETTINGS_KEYS.KEEP_NOTES_VIEW_MODE]: 'grid',
  [SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL]: DEFAULT_GOOGLE_SHEET_WEBHOOK_URL,
  [SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC]: 'true',
  [SETTINGS_KEYS.GOOGLE_SHEET_PENDING_SYNC]: 'false',
});

/**
 * Returns a mutable cloned dictionary of default settings.
 */
export function createDefaultSettings(): Record<string, string> {
  return { ...DEFAULT_SETTINGS };
}

/**
 * Seeds default categories into the database if not present, and upgrades
 * legacy string icons into clean unicode emojis.
 *
 * @param db Database executor instance
 * @param now Optional ISO timestamp for creation records
 * @returns Number of categories created or upgraded
 */
export async function seedCategories(
  db: SeedDatabaseExecutor,
  now: string = new Date().toISOString()
): Promise<number> {
  try {
    const existing = await db.execute('SELECT id, icon FROM categories');
    const rows = existing?.rows || [];

    if (rows.length === 0) {
      const categoriesToSeed = createDefaultCategories(now);
      for (const cat of categoriesToSeed) {
        await db.execute(
          'INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)',
          [cat.id, cat.name, cat.color, cat.icon, cat.createdAt]
        );
      }
      return categoriesToSeed.length;
    }

    // Upgrade legacy text icons to unicode emojis if present
    let upgradedCount = 0;
    for (const row of rows) {
      if (row && row.id && row.icon) {
        const normalized = normalizeCategoryIcon(row.icon);
        if (normalized !== row.icon) {
          await db.execute('UPDATE categories SET icon = ? WHERE id = ?', [normalized, row.id]);
          upgradedCount++;
        }
      }
    }
    return upgradedCount;
  } catch (err) {
    console.warn('[seedCategories] Execution warning:', err);
    return 0;
  }
}

/**
 * Seeds missing default settings into the database without overwriting
 * existing user configurations.
 *
 * @param db Database executor instance
 * @param now Optional ISO timestamp for updated records
 * @returns Number of missing setting keys populated
 */
export async function seedSettings(
  db: SeedDatabaseExecutor,
  now: string = new Date().toISOString()
): Promise<number> {
  try {
    const existing = await db.execute('SELECT key, value FROM settings');
    const rows = existing?.rows || [];
    const existingMap = new Map<string, string>();
    for (const row of rows) {
      if (row && typeof row.key === 'string') {
        existingMap.set(row.key, row.value ?? '');
      }
    }

    let seededCount = 0;
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
      if (!existingMap.has(key)) {
        await db.execute(
          'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)',
          [key, defaultValue, now]
        );
        seededCount++;
      }
    }

    // Ensure default Google Sheet Webhook is populated if missing, empty, or stale
    const sheetKey = SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL;
    const currentSheetVal = existingMap.get(sheetKey);
    const isStaleUrl =
      Boolean(currentSheetVal) &&
      currentSheetVal!.includes(
        'AKfycbwelZyo3EpfPDgbVb9b_7WWj7spsPp20DZs-4mxC_leoSta3B2VJiuxbgtEfsU50UTVUg'
      );
    if (currentSheetVal === undefined || currentSheetVal.trim() === '' || isStaleUrl) {
      await db.execute(
        'INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)',
        [sheetKey, DEFAULT_GOOGLE_SHEET_WEBHOOK_URL, now]
      );
    }

    return seededCount;
  } catch (err) {
    console.warn('[seedSettings] Execution warning:', err);
    return 0;
  }
}

/**
 * Orchestrates complete database seeding: categories and settings.
 *
 * @param db Database executor instance
 * @param now Optional ISO timestamp
 */
export async function seedDatabase(
  db: SeedDatabaseExecutor,
  now: string = new Date().toISOString()
): Promise<{ categoriesSeeded: number; settingsSeeded: number }> {
  const categoriesSeeded = await seedCategories(db, now);
  const settingsSeeded = await seedSettings(db, now);
  return { categoriesSeeded, settingsSeeded };
}

export default {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  DEFAULT_CATEGORY_SEEDS,
  createDefaultCategories,
  createDefaultSettings,
  normalizeCategoryIcon,
  seedCategories,
  seedSettings,
  seedDatabase,
};
