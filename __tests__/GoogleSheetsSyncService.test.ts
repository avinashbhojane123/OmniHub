import { googleSheetsSyncService, DEFAULT_GOOGLE_SHEET_WEBHOOK_URL } from '../src/services/backup/GoogleSheetsSyncService';
import { settingsRepository } from '../src/database/repositories/SettingsRepository';
import { SETTINGS_KEYS } from '../src/constants/settingsKeys';
import { getDatabase } from '../src/database/connection';

describe('GoogleSheetsSyncService Test Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  beforeEach(async () => {
    // Reset test settings
    await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL, '');
    await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC, 'false');
    await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME, '');
  });

  it('should return default built-in webhook URL when none is explicitly configured', async () => {
    const url = await googleSheetsSyncService.getWebhookUrl();
    expect(url).toBe(DEFAULT_GOOGLE_SHEET_WEBHOOK_URL);
  });

  it('should store and retrieve custom Google Sheet webhook URL and auto-sync setting', async () => {
    const testUrl = 'https://script.google.com/macros/s/AKfycbxTest/exec';
    await googleSheetsSyncService.setWebhookUrl(testUrl);
    const retrieved = await googleSheetsSyncService.getWebhookUrl();
    expect(retrieved).toBe(testUrl);

    await googleSheetsSyncService.setAutoSync(true);
    const autoSync = await googleSheetsSyncService.getAutoSync();
    expect(autoSync).toBe(true);

    await googleSheetsSyncService.setAutoSync(false);
    const autoSyncFalse = await googleSheetsSyncService.getAutoSync();
    expect(autoSyncFalse).toBe(false);

    await googleSheetsSyncService.setSyncSecret('my-ultra-secret-token');
    const secret = await googleSheetsSyncService.getSyncSecret();
    expect(secret).toBe('my-ultra-secret-token');
  });

  it('should generate Google Apps Script code containing doPost, doGet, and sheet tab initializations', () => {
    const script = googleSheetsSyncService.getGoogleAppsScriptCode();
    expect(script).toBeDefined();
    expect(script).toContain('function doPost(e)');
    expect(script).toContain('function doGet(e)');
    expect(script).toContain('LIFEPLANNER_SYNC_SECRET');
    expect(script).toContain('action === "push"');
    expect(script).toContain('action === "pull"');
    expect(script).toContain('action === "ping"');
    expect(script).toContain('sheetTabs');
    expect(script).toContain('_SyncState');
    expect(script).toContain('RAW_BACKUP_JSON');
    expect(script).toContain('SpreadsheetApp.getActiveSpreadsheet()');
  });

  it('should return failure when testing connection with empty URL', async () => {
    const res = await googleSheetsSyncService.testConnection('');
    expect(res.success).toBe(false);
    expect(res.message).toContain('Please provide a valid Google Sheet Webhook URL');
  });

  it('should mock push and pull operations against a mocked fetch endpoint', async () => {
    const originalFetch = (globalThis as any).fetch;
    const testUrl = 'https://script.google.com/macros/s/mock_deployment_id/exec';

    try {
      // Mock successful push
      (globalThis as any).fetch = jest.fn().mockImplementation(async (url: string, options: any) => {
        const body = JSON.parse(options.body);
        if (body.action === 'ping') {
          const data = {
            success: true,
            message: 'Connected to Google Sheet successfully!',
            sheetTitle: 'LifePlanner Database',
          };
          return {
            ok: true,
            status: 200,
            json: async () => data,
            text: async () => JSON.stringify(data),
          };
        }
        if (body.action === 'push') {
          const data = {
            success: true,
            message: 'Google Sheet tabs updated successfully!',
            timestamp: new Date().toISOString(),
          };
          return {
            ok: true,
            status: 200,
            json: async () => data,
            text: async () => JSON.stringify(data),
          };
        }
        if (body.action === 'pull') {
          const data = {
            success: true,
            backupData: {
              version: 1,
              createdAt: new Date().toISOString(),
              tasks: [],
              categories: [],
              habits: [],
              habitLogs: [],
              notes: [],
              keepNotes: [],
              calendarEvents: [],
              settings: {},
            },
          };
          return {
            ok: true,
            status: 200,
            json: async () => data,
            text: async () => JSON.stringify(data),
          };
        }
        return {
          ok: false,
          status: 400,
          json: async () => ({ success: false }),
          text: async () => JSON.stringify({ success: false }),
        };
      }) as any;

      // Test Ping
      const pingRes = await googleSheetsSyncService.testConnection(testUrl);
      expect(pingRes.success).toBe(true);
      expect(pingRes.sheetTitle).toBe('LifePlanner Database');

      // Test Push
      const pushRes = await googleSheetsSyncService.pushToGoogleSheet(testUrl);
      expect(pushRes.success).toBe(true);
      expect(pushRes.details?.timestamp).toBeDefined();

      const lastSync = await googleSheetsSyncService.getLastSyncTime();
      expect(lastSync).not.toBeNull();

      // Test Pull
      const pullRes = await googleSheetsSyncService.pullFromGoogleSheet(testUrl, 'merge');
      expect(pullRes.success).toBe(true);
      expect(pullRes.message).toContain('Successfully pulled');
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
