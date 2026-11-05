import {
  SETTINGS_KEYS,
  ALL_SETTINGS_KEYS,
  isSettingsKey,
  getChatDraftKey,
} from '../src/constants/settingsKeys';
import defaultSettingsKeys from '../src/constants/settingsKeys';

describe('Settings Keys Constants Suite (settingsKeys.ts)', () => {
  describe('1. Exports & Object Immutability', () => {
    it('should export identical named and default SETTINGS_KEYS object', () => {
      expect(SETTINGS_KEYS).toBe(defaultSettingsKeys);
      expect(typeof SETTINGS_KEYS).toBe('object');
    });

    it('should be deeply frozen at runtime to prevent accidental mutation', () => {
      expect(Object.isFrozen(SETTINGS_KEYS)).toBe(true);
      const originalTheme = SETTINGS_KEYS.THEME;
      try {
        (SETTINGS_KEYS as any).THEME = 'modified';
      } catch {}
      expect(SETTINGS_KEYS.THEME).toBe(originalTheme);
    });
  });

  describe('2. Key Verification & Domain Coverage', () => {
    it('should define all core user profile keys', () => {
      expect(SETTINGS_KEYS.USER_NAME).toBe('userName');
      expect(SETTINGS_KEYS.USER_AVATAR).toBe('user_avatar');
      expect(SETTINGS_KEYS.BIRTH_DATE).toBe('birthDate');
      expect(SETTINGS_KEYS.BIRTH_TIME).toBe('birthTime');
    });

    it('should define all theme and UI layout keys', () => {
      expect(SETTINGS_KEYS.THEME).toBe('theme');
      expect(SETTINGS_KEYS.TODAY_VIEW_MODE).toBe('today_view_mode');
      expect(SETTINGS_KEYS.DEFAULT_WORKSPACE).toBe('default_workspace');
      expect(SETTINGS_KEYS.KEEP_NOTES_VIEW_MODE).toBe('keep_notes_view_mode');
    });

    it('should define all notification & alarm keys', () => {
      expect(SETTINGS_KEYS.NOTIFICATIONS_ENABLED).toBe('notificationsEnabled');
      expect(SETTINGS_KEYS.NOTIFICATION_SOUND).toBe('notificationSound');
      expect(SETTINGS_KEYS.NOTIFICATION_SOUND_TONE).toBe('notificationSoundTone');
      expect(SETTINGS_KEYS.NOTIFICATION_VIBRATION).toBe('notificationVibration');
      expect(SETTINGS_KEYS.DEFAULT_REMINDER_MINUTES).toBe('defaultReminderMinutes');
      expect(SETTINGS_KEYS.DEFAULT_SNOOZE_MINUTES).toBe('defaultSnoozeMinutes');
      expect(SETTINGS_KEYS.EXACT_ALARM_DISMISSED).toBe('exactAlarmDismissed');
    });

    it('should define all Google Sheets synchronization keys', () => {
      expect(SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL).toBe('googleSheetWebhookUrl');
      expect(SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC).toBe('googleSheetAutoSync');
      expect(SETTINGS_KEYS.GOOGLE_SHEET_PENDING_SYNC).toBe('googleSheetPendingSync');
      expect(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME).toBe('googleSheetLastSyncTime');
      expect(SETTINGS_KEYS.GOOGLE_SHEET_SYNC_SECRET).toBe('googleSheetSyncSecret');
    });

    it('should define all real-time chat keys', () => {
      expect(SETTINGS_KEYS.CHAT_RECENT_ROOMS).toBe('chat_recent_rooms');
      expect(SETTINGS_KEYS.CHAT_SAVED_PASSCODE).toBe('chat_saved_passcode');
      expect(SETTINGS_KEYS.CHAT_SAVED_NICKNAME).toBe('chat_saved_nickname');
      expect(SETTINGS_KEYS.CHAT_SAVED_SERVER_URL).toBe('chat_saved_server_url');
    });

    it('should define all battery guard keys', () => {
      expect(SETTINGS_KEYS.BATTERY_SOUND).toBe('battery_sound');
      expect(SETTINGS_KEYS.BATTERY_VIBRATION).toBe('battery_vibration');
      expect(SETTINGS_KEYS.BATTERY_GUARD_ACTIVE).toBe('batteryGuardActive');
    });

    it('should define all companion sync keys', () => {
      expect(SETTINGS_KEYS.COMPANION_AUTO_SYNC).toBe('companionAutoSync');
      expect(SETTINGS_KEYS.COMPANION_SERVER_URL).toBe('companionServerUrl');
      expect(SETTINGS_KEYS.COMPANION_API_KEY).toBe('companionApiKey');
    });
  });

  describe('3. ALL_SETTINGS_KEYS & Key Validation', () => {
    it('ALL_SETTINGS_KEYS should contain unique frozen keys matching SETTINGS_KEYS values', () => {
      expect(Object.isFrozen(ALL_SETTINGS_KEYS)).toBe(true);
      expect(Array.isArray(ALL_SETTINGS_KEYS)).toBe(true);

      const uniqueSet = new Set(ALL_SETTINGS_KEYS);
      expect(uniqueSet.size).toBe(ALL_SETTINGS_KEYS.length);

      for (const val of Object.values(SETTINGS_KEYS)) {
        expect(ALL_SETTINGS_KEYS).toContain(val);
      }
    });

    it('isSettingsKey should correctly validate setting keys', () => {
      expect(isSettingsKey('theme')).toBe(true);
      expect(isSettingsKey('userName')).toBe(true);
      expect(isSettingsKey('googleSheetWebhookUrl')).toBe(true);
      expect(isSettingsKey('notificationsEnabled')).toBe(true);

      // Invalid keys
      expect(isSettingsKey('non_existent_key')).toBe(false);
      expect(isSettingsKey('')).toBe(false);
      expect(isSettingsKey(null)).toBe(false);
      expect(isSettingsKey(undefined)).toBe(false);
      expect(isSettingsKey(123)).toBe(false);
      expect(isSettingsKey({})).toBe(false);
    });
  });

  describe('4. getChatDraftKey Helper', () => {
    it('should format and normalize dynamic chat draft keys', () => {
      expect(getChatDraftKey('General')).toBe('chat_draft_general');
      expect(getChatDraftKey('  Project_Alpha  ')).toBe('chat_draft_project_alpha');
      expect(getChatDraftKey('ROOM101')).toBe('chat_draft_room101');
    });
  });
});
