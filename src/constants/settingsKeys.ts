/**
 * Canonical centralized repository of all settings keys stored in the settings SQLite table.
 * Using these constants prevents typos, key collisions, and eases refactoring across app modules.
 */
export const SETTINGS_KEYS = Object.freeze({
  // User Profile
  USER_NAME: 'userName',
  USER_AVATAR: 'user_avatar',
  BIRTH_DATE: 'birthDate',
  BIRTH_TIME: 'birthTime',

  // Appearance & Theme
  THEME: 'theme',

  // Notifications & Reminders
  NOTIFICATIONS_ENABLED: 'notificationsEnabled',
  NOTIFICATION_SOUND: 'notificationSound',
  NOTIFICATION_SOUND_TONE: 'notificationSoundTone',
  NOTIFICATION_VIBRATION: 'notificationVibration',
  DEFAULT_REMINDER_MINUTES: 'defaultReminderMinutes',
  DEFAULT_SNOOZE_MINUTES: 'defaultSnoozeMinutes',
  EXACT_ALARM_DISMISSED: 'exactAlarmDismissed',
  APP_DND_ENABLED: 'app_dnd_enabled',

  // Today & Workspace UI Modes
  TODAY_VIEW_MODE: 'today_view_mode',
  TODAY_DISMISSED_OVERDUE_DATE: 'today_dismissed_overdue_date',
  TODAY_DISMISSED_OVERDUE_COUNT: 'today_dismissed_overdue_count',
  DEFAULT_WORKSPACE: 'default_workspace',
  KEEP_NOTES_VIEW_MODE: 'keep_notes_view_mode',

  // Battery Guard & Notifications
  BATTERY_SOUND: 'battery_sound',
  BATTERY_VIBRATION: 'battery_vibration',
  BATTERY_GUARD_ACTIVE: 'batteryGuardActive',
  BATTERY_FULL_ENABLED: 'battery_full_enabled',
  BATTERY_FULL_TARGET: 'battery_full_target',
  BATTERY_OVERCHARGE_100: 'battery_overcharge_100',
  BATTERY_LOW_ENABLED: 'battery_low_enabled',
  BATTERY_LOW_TARGET: 'battery_low_target',
  BATTERY_CRITICAL_LOW_5: 'battery_critical_low_5',
  BATTERY_TEMP_ENABLED: 'battery_temp_enabled',
  BATTERY_TEMP_TARGET: 'battery_temp_target',
  BATTERY_PLUGGED_ALERT: 'battery_plugged_alert',
  BATTERY_UNPLUGGED_ALERT: 'battery_unplugged_alert',
  BATTERY_CONTINUOUS_RING: 'battery_continuous_ring',
  BATTERY_AUTO_REPEAT: 'battery_auto_repeat',

  // Google Sheets Cloud Backup & Sync
  GOOGLE_SHEET_WEBHOOK_URL: 'googleSheetWebhookUrl',
  GOOGLE_SHEET_AUTO_SYNC: 'googleSheetAutoSync',
  GOOGLE_SHEET_PENDING_SYNC: 'googleSheetPendingSync',
  GOOGLE_SHEET_LAST_SYNC_TIME: 'googleSheetLastSyncTime',
  GOOGLE_SHEET_SYNC_SECRET: 'googleSheetSyncSecret',

  // Real-time Chat
  CHAT_RECENT_ROOMS: 'chat_recent_rooms',
  CHAT_SAVED_PASSCODE: 'chat_saved_passcode',
  CHAT_SAVED_NICKNAME: 'chat_saved_nickname',
  CHAT_SAVED_SERVER_URL: 'chat_saved_server_url',

  // Companion Synchronization
  COMPANION_AUTO_SYNC: 'companionAutoSync',
  COMPANION_SERVER_URL: 'companionServerUrl',
  COMPANION_API_KEY: 'companionApiKey',
} as const);

/**
 * Identifier name of a setting constant property (e.g. 'THEME', 'USER_NAME').
 */
export type SettingsKeyName = keyof typeof SETTINGS_KEYS;

/**
 * Valid string value of a setting key (e.g. 'theme', 'userName').
 */
export type SettingsKey = (typeof SETTINGS_KEYS)[SettingsKeyName];

/**
 * Readonly immutable list of all known registered setting key strings.
 */
export const ALL_SETTINGS_KEYS: readonly SettingsKey[] = Object.freeze(
  Object.values(SETTINGS_KEYS) as SettingsKey[]
);

/**
 * Type guard verifying if an arbitrary value is a recognized SettingsKey.
 */
export function isSettingsKey(val: unknown): val is SettingsKey {
  return typeof val === 'string' && (ALL_SETTINGS_KEYS as readonly string[]).includes(val);
}

/**
 * Generates the standardized dynamic settings key for saving chat draft text per room.
 */
export function getChatDraftKey(roomKey: string): string {
  return `chat_draft_${roomKey.trim().toLowerCase()}`;
}

export default SETTINGS_KEYS;
