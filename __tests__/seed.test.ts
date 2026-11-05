import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  DEFAULT_CATEGORY_SEEDS,
  createDefaultCategories,
  createDefaultSettings,
  normalizeCategoryIcon,
  seedCategories,
  seedSettings,
  seedDatabase,
  SeedDatabaseExecutor,
} from '../src/database/seed';
import { SETTINGS_KEYS } from '../src/constants/settingsKeys';
import { DEFAULT_GOOGLE_SHEET_WEBHOOK_URL } from '../src/services/backup/GoogleSheetsSyncService';

describe('Database Seed Module (seed.ts)', () => {
  describe('1. DEFAULT_CATEGORIES & Category Factories', () => {
    it('should export 7 default categories with valid properties', () => {
      expect(Array.isArray(DEFAULT_CATEGORIES)).toBe(true);
      expect(DEFAULT_CATEGORIES.length).toBe(7);

      for (const cat of DEFAULT_CATEGORIES) {
        expect(cat.id).toMatch(/^cat-/);
        expect(cat.name).toBeTruthy();
        expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(cat.createdAt).toBeTruthy();
      }
    });

    it('should use unicode emojis for all category icons instead of legacy text strings', () => {
      const legacyStrings = ['briefcase', 'book-open', 'heart-pulse', 'user', 'users', 'wallet', 'target'];
      for (const cat of DEFAULT_CATEGORIES) {
        expect(legacyStrings).not.toContain(cat.icon);
        expect(cat.icon.length).toBeGreaterThan(0);
      }

      const iconById = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c.icon]));
      expect(iconById['cat-work']).toBe('💼');
      expect(iconById['cat-study']).toBe('📚');
      expect(iconById['cat-health']).toBe('💪');
      expect(iconById['cat-personal']).toBe('👤');
      expect(iconById['cat-family']).toBe('👥');
      expect(iconById['cat-finance']).toBe('💰');
      expect(iconById['cat-goals']).toBe('🎯');
    });

    it('should be frozen to prevent accidental in-memory array mutation', () => {
      expect(Object.isFrozen(DEFAULT_CATEGORIES)).toBe(true);
    });

    it('createDefaultCategories should return fresh category clones with specified timestamp', () => {
      const fixedTime = '2026-11-01T12:00:00.000Z';
      const created = createDefaultCategories(fixedTime);

      expect(created.length).toBe(DEFAULT_CATEGORY_SEEDS.length);
      for (const cat of created) {
        expect(cat.createdAt).toBe(fixedTime);
      }

      // Modifying created array should not affect DEFAULT_CATEGORIES
      created[0].name = 'Modified Category';
      expect(DEFAULT_CATEGORIES[0].name).not.toBe('Modified Category');
    });
  });

  describe('2. Legacy Category Icon Normalization', () => {
    it('should normalize legacy icon text identifiers to clean unicode emojis', () => {
      expect(normalizeCategoryIcon('briefcase')).toBe('💼');
      expect(normalizeCategoryIcon('book-open')).toBe('📚');
      expect(normalizeCategoryIcon('heart-pulse')).toBe('💪');
      expect(normalizeCategoryIcon('user')).toBe('👤');
      expect(normalizeCategoryIcon('users')).toBe('👥');
      expect(normalizeCategoryIcon('wallet')).toBe('💰');
      expect(normalizeCategoryIcon('target')).toBe('🎯');
    });

    it('should preserve existing unicode emojis or custom valid icons', () => {
      expect(normalizeCategoryIcon('⭐')).toBe('⭐');
      expect(normalizeCategoryIcon('🚀')).toBe('🚀');
      expect(normalizeCategoryIcon('💼')).toBe('💼');
    });

    it('should fallback safely on null, undefined, or empty values', () => {
      expect(normalizeCategoryIcon(null)).toBe('🏷️');
      expect(normalizeCategoryIcon(undefined)).toBe('🏷️');
      expect(normalizeCategoryIcon('')).toBe('🏷️');
      expect(normalizeCategoryIcon('   ')).toBe('🏷️');
    });
  });

  describe('3. DEFAULT_SETTINGS & Settings Dictionary', () => {
    it('should be frozen and include all critical system settings', () => {
      expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);

      // Notification settings
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.NOTIFICATIONS_ENABLED]).toBe('true');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.NOTIFICATION_SOUND]).toBe('true');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.NOTIFICATION_SOUND_TONE]).toBe('standard');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.NOTIFICATION_VIBRATION]).toBe('true');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.DEFAULT_REMINDER_MINUTES]).toBe('10');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.DEFAULT_SNOOZE_MINUTES]).toBe('10');

      // Profile & Theme
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.THEME]).toBe('system');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.USER_NAME]).toBe('');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.USER_AVATAR]).toBe('👤');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.BIRTH_DATE]).toBe('');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.BIRTH_TIME]).toBe('');

      // Workspace & UI
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.TODAY_VIEW_MODE]).toBe('timeline');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.EXACT_ALARM_DISMISSED]).toBe('false');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.DEFAULT_WORKSPACE]).toBe('select');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.KEEP_NOTES_VIEW_MODE]).toBe('grid');

      // Battery Guard
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.BATTERY_SOUND]).toBe('true');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.BATTERY_VIBRATION]).toBe('true');

      // Google Sheet Sync
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL]).toBe(DEFAULT_GOOGLE_SHEET_WEBHOOK_URL);
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC]).toBe('true');
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.GOOGLE_SHEET_PENDING_SYNC]).toBe('false');
    });

    it('createDefaultSettings should return a mutable clone', () => {
      const cloned = createDefaultSettings();
      expect(Object.isFrozen(cloned)).toBe(false);

      cloned[SETTINGS_KEYS.USER_NAME] = 'Alice';
      expect(DEFAULT_SETTINGS[SETTINGS_KEYS.USER_NAME]).toBe('');
    });
  });

  describe('4. Seeding Logic (seedCategories & seedSettings)', () => {
    function createMockExecutor(): SeedDatabaseExecutor & {
      queries: { sql: string; params?: any[] }[];
      tables: Record<string, any[]>;
    } {
      const queries: { sql: string; params?: any[] }[] = [];
      const tables: Record<string, any[]> = {
        categories: [],
        settings: [],
      };

      return {
        queries,
        tables,
        async execute(sql: string, params: any[] = []): Promise<{ rows: any[]; rowsAffected?: number }> {
          queries.push({ sql, params });
          const trimmed = sql.trim().toUpperCase();

          if (trimmed.startsWith('SELECT ID, ICON FROM CATEGORIES')) {
            return { rows: [...tables.categories] };
          }
          if (trimmed.startsWith('SELECT KEY, VALUE FROM SETTINGS')) {
            return { rows: [...tables.settings] };
          }
          if (trimmed.startsWith('INSERT INTO CATEGORIES')) {
            const [id, name, color, icon, createdAt] = params;
            tables.categories.push({ id, name, color, icon, createdAt });
            return { rows: [], rowsAffected: 1 };
          }
          if (trimmed.startsWith('UPDATE CATEGORIES SET ICON = ? WHERE ID = ?')) {
            const [icon, id] = params;
            const target = tables.categories.find((c) => c.id === id);
            if (target) target.icon = icon;
            return { rows: [], rowsAffected: 1 };
          }
          if (
            trimmed.startsWith('INSERT INTO SETTINGS') ||
            trimmed.startsWith('INSERT OR REPLACE INTO SETTINGS')
          ) {
            const [key, value, updatedAt] = params;
            const existingIdx = tables.settings.findIndex((s) => s.key === key);
            if (existingIdx >= 0) {
              tables.settings[existingIdx] = { key, value, updatedAt };
            } else {
              tables.settings.push({ key, value, updatedAt });
            }
            return { rows: [], rowsAffected: 1 };
          }
          return { rows: [], rowsAffected: 0 };
        },
      };
    }

    it('seedCategories should populate default categories when table is empty', async () => {
      const executor = createMockExecutor();
      const count = await seedCategories(executor, '2026-11-01T10:00:00.000Z');

      expect(count).toBe(7);
      const insertCalls = executor.queries.filter((q) => q.sql.includes('INSERT INTO categories'));
      expect(insertCalls.length).toBe(7);
      expect(insertCalls[0].params?.[3]).toBe('💼');
    });

    it('seedCategories should upgrade legacy icon strings if categories already exist', async () => {
      const executor = createMockExecutor();
      await executor.execute(
        'INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)',
        ['cat-work', 'Work', '#3B82F6', 'briefcase', '2026-01-01T00:00:00.000Z']
      );
      executor.queries.length = 0;

      const upgraded = await seedCategories(executor);
      expect(upgraded).toBe(1);

      const updateCalls = executor.queries.filter((q) => q.sql.includes('UPDATE categories SET icon'));
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0].params).toEqual(['💼', 'cat-work']);
    });

    it('seedCategories should not upgrade when category icons are already clean emojis', async () => {
      const executor = createMockExecutor();
      await executor.execute(
        'INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)',
        ['cat-work', 'Work', '#3B82F6', '💼', '2026-01-01T00:00:00.000Z']
      );
      executor.queries.length = 0;

      const upgraded = await seedCategories(executor);
      expect(upgraded).toBe(0);

      const updateCalls = executor.queries.filter((q) => q.sql.includes('UPDATE categories SET icon'));
      expect(updateCalls.length).toBe(0);
    });

    it('seedCategories should catch database errors gracefully without throwing', async () => {
      const failingExecutor: SeedDatabaseExecutor = {
        async execute() {
          throw new Error('Database locked');
        },
      };
      const result = await seedCategories(failingExecutor);
      expect(result).toBe(0);
    });

    it('seedSettings should insert all missing settings without overwriting user custom values', async () => {
      const executor = createMockExecutor();
      await executor.execute(
        'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)',
        [SETTINGS_KEYS.THEME, 'dark', '2026-10-15T00:00:00.000Z']
      );
      executor.queries.length = 0;

      const seededCount = await seedSettings(executor, '2026-11-01T10:00:00.000Z');

      const themeInserts = executor.queries.filter(
        (q) => q.sql.includes('INSERT INTO settings') && q.params?.[0] === SETTINGS_KEYS.THEME
      );
      expect(themeInserts.length).toBe(0);
      expect(seededCount).toBe(Object.keys(DEFAULT_SETTINGS).length - 1);
    });

    it('seedSettings should replace deprecated/stale Google Sheet webhook URLs', async () => {
      const executor = createMockExecutor();
      const staleUrl = 'https://script.google.com/macros/s/AKfycbwelZyo3EpfPDgbVb9b_7WWj7spsPp20DZs-4mxC_leoSta3B2VJiuxbgtEfsU50UTVUg/exec';
      await executor.execute(
        'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)',
        [SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL, staleUrl, '2026-01-01T00:00:00.000Z']
      );
      executor.queries.length = 0;

      await seedSettings(executor, '2026-11-01T10:00:00.000Z');

      const savedUrl = executor.tables.settings.find(
        (s) => s.key === SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL
      )?.value;
      expect(savedUrl).toBe(DEFAULT_GOOGLE_SHEET_WEBHOOK_URL);
    });

    it('seedSettings should catch database errors gracefully without throwing', async () => {
      const failingExecutor: SeedDatabaseExecutor = {
        async execute() {
          throw new Error('Disk I/O failure');
        },
      };
      const result = await seedSettings(failingExecutor);
      expect(result).toBe(0);
    });

    it('seedDatabase should run both category and settings seeds cleanly', async () => {
      const executor = createMockExecutor();
      const result = await seedDatabase(executor);

      expect(result.categoriesSeeded).toBe(7);
      expect(result.settingsSeeded).toBeGreaterThanOrEqual(Object.keys(DEFAULT_SETTINGS).length);
    });
  });
});
