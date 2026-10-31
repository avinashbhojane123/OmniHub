import { BackupData, Task, Habit, HabitLog, KeepNote, CalendarEvent, Category } from '../../types';
import { backupService, RestoreMode } from './BackupService';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { SETTINGS_KEYS } from '../../constants/settingsKeys';
import { getDatabase } from '../../database/connection';
import { syncEventBus, DataMutation } from './SyncEventBus';

export interface GoogleSheetsSyncResult {
  success: boolean;
  message: string;
  details?: {
    tasksCount?: number;
    categoriesCount?: number;
    habitsCount?: number;
    notesCount?: number;
    eventsCount?: number;
    timestamp?: string;
  };
}

export interface RemoteSheetStatus {
  success: boolean;
  message?: string;
  sheetTitle?: string;
  sheetUrl?: string;
  counts?: {
    tasks: number;
    habits: number;
    notes: number;
    events: number;
    categories: number;
    habitLogs: number;
    total: number;
  };
  lastSyncTime?: string;
}

export const DEFAULT_GOOGLE_SHEET_DEPLOYMENT_ID =
  'AKfycbwWSp3Y47KKz4LSJTgGRfUkh0qwDNZnuqSWG2Ud7tBdKmJhBI_bMhh4Lidi9jE5tKzZ';

export const DEFAULT_GOOGLE_SHEET_WEBHOOK_URL =
  `https://script.google.com/macros/s/${DEFAULT_GOOGLE_SHEET_DEPLOYMENT_ID}/exec`;

export class GoogleSheetsSyncService {
  private syncTimer: any = null;
  private deltaTimer: any = null;

  constructor() {
    syncEventBus.subscribeToChanges((mutation) => {
      if (mutation) {
        this.queueDeltaMutation(mutation);
      } else {
        this.queueSilentSync();
      }
    });
  }

  /**
   * Cloud-First on Reinstall:
   * Automatically restores database on first app launch / reinstall if the local database is fresh
   * and the connected Google Sheet contains existing tasks, habits, or notes.
   */
  async autoRestoreIfEmptyOnStartup(): Promise<boolean> {
    try {
      const url = await this.getWebhookUrl();
      if (this.isPlaceholderUrl(url) || !url.startsWith('https://script.google.com/macros/s/')) {
        return false;
      }

      const db = await getDatabase();
      const [tRes, hRes, nRes] = await Promise.all([
        db.execute('SELECT COUNT(*) as count FROM tasks'),
        db.execute('SELECT COUNT(*) as count FROM habits'),
        db.execute('SELECT COUNT(*) as count FROM keep_notes'),
      ]);
      const count =
        Number(tRes.rows[0]?.count || 0) +
        Number(hRes.rows[0]?.count || 0) +
        Number(nRes.rows[0]?.count || 0);

      // If local database has records, local is populated. Flush any queued offline changes.
      if (count > 0) {
        this.flushSyncQueue(2500);
        return false;
      }

      console.log('[GoogleSheetsSync] Fresh install or blank local DB detected. Checking remote Google Sheet status...');
      const statusRes = await this.fetchRemoteStatus(url);

      if (statusRes.success && statusRes.counts && statusRes.counts.total > 0) {
        console.log(`[GoogleSheetsSync] Cloud-First: Google Sheet contains ${statusRes.counts.total} items. Auto-restoring...`);
        const res = await this.pullFromGoogleSheet(url, 'replace');
        if (res.success) {
          syncEventBus.notifyDataRestored();
          console.log('[GoogleSheetsSync] Auto-restore completed successfully:', res.details);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('Google Sheets auto-restore check notice:', err);
      return false;
    }
  }

  /**
   * Fetches lightweight remote statistics from Google Sheet (counts without downloading entire database).
   */
  async fetchRemoteStatus(customUrl?: string, customSecret?: string): Promise<RemoteSheetStatus> {
    const url = (customUrl !== undefined ? customUrl : await this.getWebhookUrl()).trim();
    if (!url || this.isPlaceholderUrl(url)) {
      return { success: false, message: 'Google Sheet Webhook URL is not configured.' };
    }

    const secret = (customSecret !== undefined ? customSecret : await this.getSyncSecret()).trim();
    const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=utf-8' };
    if (secret) headers['X-Sync-Secret'] = secret;

    try {
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'status', ...(secret ? { secret } : {}) }),
        },
        15000
      );

      this.checkHttpStatus(response);
      const res = await this.parseResponse(response);
      if (res && res.success && res.counts) {
        return {
          success: true,
          sheetTitle: res.sheetTitle || 'LifePlanner Database',
          sheetUrl: res.sheetUrl || '',
          counts: res.counts,
          lastSyncTime: res.lastSyncTime || '',
        };
      }

      // Fallback for older script version that only supports ping
      return {
        success: Boolean(res && res.success),
        sheetTitle: res?.sheetTitle || 'LifePlanner Database',
        message: res?.message,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to fetch remote status' };
    }
  }

  /**
   * The Ironclad Blank Device Safety Guard:
   * Prevents a blank/freshly-installed phone (0 items) from overwriting a populated Google Sheet.
   * If local count is 0 and remote has items, it automatically restores instead of pushing.
   */
  async safePushGuard(
    localData: BackupData,
    customUrl?: string,
    customSecret?: string
  ): Promise<{ safe: boolean; restored?: boolean; message?: string }> {
    const localTotal =
      (localData.tasks?.length || 0) +
      (localData.habits?.length || 0) +
      (localData.keepNotes?.length || 0) +
      (localData.calendarEvents?.length || 0);

    // If local device has records, it is safe to sync
    if (localTotal > 0) {
      return { safe: true };
    }

    // Local device is completely empty (0 items). Check remote sheet status before doing anything!
    try {
      const statusRes = await this.fetchRemoteStatus(customUrl, customSecret);
      if (statusRes.success && statusRes.counts && statusRes.counts.total > 0) {
        console.warn(
          `[GoogleSheetsSync] BLANK_DEVICE_GUARD: Phone has 0 items but Google Sheet contains ${statusRes.counts.total} items. Aborting destructive push to prevent wipeout!`
        );

        // Automatically pull and restore to phone
        const restoreRes = await this.pullFromGoogleSheet(customUrl, 'replace', customSecret);
        if (restoreRes.success) {
          syncEventBus.notifyDataRestored();
          return {
            safe: false,
            restored: true,
            message: `Blank device protection activated! Retrieved and restored ${statusRes.counts.total} items from Google Drive.`,
          };
        }

        return {
          safe: false,
          restored: false,
          message: `Blocked overwrite of ${statusRes.counts.total} items in Google Drive by empty device.`,
        };
      }
    } catch (guardErr) {
      console.warn('Blank device safety check notice:', guardErr);
    }

    return { safe: true };
  }

  /**
   * Delta Sync Queue:
   * Queues a granular row-level mutation (upsert/delete) in local SQLite table.
   * Syncs offline changes automatically when connection returns.
   */
  async queueDeltaMutation(mutation: DataMutation): Promise<void> {
    try {
      const db = await getDatabase();
      let tabName = '';
      let rowData: any[] = [];

      switch (mutation.entityType) {
        case 'task':
          tabName = 'Tasks';
          if (mutation.item) rowData = this.buildTaskRow(mutation.item);
          break;
        case 'habit':
          tabName = 'Habits';
          if (mutation.item) rowData = this.buildHabitRow(mutation.item);
          break;
        case 'habitLog':
          tabName = 'Habit_Logs';
          if (mutation.item) rowData = this.buildHabitLogRow(mutation.item);
          break;
        case 'keepNote':
          tabName = 'Keep_Notes';
          if (mutation.item) rowData = this.buildKeepNoteRow(mutation.item);
          break;
        case 'calendarEvent':
          tabName = 'Calendar_Events';
          if (mutation.item) rowData = this.buildCalendarEventRow(mutation.item);
          break;
        case 'category':
          tabName = 'Categories';
          if (mutation.item) rowData = this.buildCategoryRow(mutation.item);
          break;
      }

      if (!tabName) return;

      const qId = `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.execute(
        `INSERT INTO pending_sync_queue (id, tabName, entityType, op, itemId, rowJson, itemJson, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          qId,
          tabName,
          mutation.entityType,
          mutation.operation,
          mutation.id,
          JSON.stringify(rowData),
          mutation.item ? JSON.stringify(mutation.item) : null,
          new Date().toISOString(),
        ]
      );

      this.flushSyncQueue(1500);
    } catch (err) {
      console.warn('Failed to queue delta mutation:', err);
    }
  }

  /**
   * Flushes queued Delta Sync mutations in batch to Google Sheets.
   */
  flushSyncQueue(delayMs = 1500): void {
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer);
    }

    this.deltaTimer = setTimeout(async () => {
      try {
        const url = await this.getWebhookUrl();
        if (this.isPlaceholderUrl(url) || !url.startsWith('https://script.google.com/macros/s/')) {
          return;
        }

        const db = await getDatabase();

        // Ensure any locally trashed notes have delete mutations queued so they are removed from Google Sheets
        try {
          const trashed = await db.execute('SELECT id FROM keep_notes WHERE isTrashed = 1');
          if (trashed.rows && trashed.rows.length > 0) {
            for (const tr of trashed.rows) {
              const check = await db.execute(
                'SELECT id FROM pending_sync_queue WHERE itemId = ? AND op = ?',
                [tr.id, 'delete']
              );
              if (!check.rows || check.rows.length === 0) {
                const qId = `q_trash_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                await db.execute(
                  `INSERT INTO pending_sync_queue (id, tabName, entityType, op, itemId, rowJson, itemJson, createdAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [qId, 'Keep_Notes', 'keepNote', 'delete', tr.id, '[]', null, new Date().toISOString()]
                );
              }
            }
          }
        } catch {}

        const pending = await db.execute(
          'SELECT * FROM pending_sync_queue ORDER BY createdAt ASC LIMIT 40'
        );

        if (!pending.rows || pending.rows.length === 0) {
          await settingsRepository.set('googleSheetPendingSync', 'false');
          return;
        }

        const mutations = pending.rows.map((r: any) => ({
          tabName: r.tabName,
          entityType: r.entityType,
          op: r.op,
          id: r.itemId,
          row: r.rowJson ? JSON.parse(r.rowJson) : [],
          item: r.itemJson ? JSON.parse(r.itemJson) : null,
        }));

        const secret = await this.getSyncSecret();
        const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=utf-8' };
        if (secret) headers['X-Sync-Secret'] = secret;

        const payload = {
          action: 'delta',
          timestamp: new Date().toISOString(),
          ...(secret ? { secret } : {}),
          mutations,
        };

        const response = await this.fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          },
          30000
        );

        this.checkHttpStatus(response);
        const result = await this.parseResponse(response);

        if (result && result.success) {
          const sentIds = pending.rows.map((r: any) => r.id);
          for (const sId of sentIds) {
            await db.execute('DELETE FROM pending_sync_queue WHERE id = ?', [sId]);
          }

          const nowIso = new Date().toISOString();
          await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME, nowIso);
          await settingsRepository.set('googleSheetPendingSync', 'false');

          // Check if more mutations remain
          const remaining = await db.execute('SELECT COUNT(*) as count FROM pending_sync_queue');
          if (Number(remaining.rows[0]?.count || 0) > 0) {
            this.flushSyncQueue(500);
          }
        } else {
          await settingsRepository.set('googleSheetPendingSync', 'true');
        }
      } catch (err) {
        await settingsRepository.set('googleSheetPendingSync', 'true').catch(() => {});
        console.warn('Delta sync flush paused (offline or transient error):', err);
      }
    }, delayMs);
  }

  /**
   * Fallback debounced silent sync for full snapshots if needed.
   */
  queueSilentSync(delayMs = 2500): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(async () => {
      try {
        const url = await this.getWebhookUrl();
        if (this.isPlaceholderUrl(url) || !url.startsWith('https://script.google.com/macros/s/')) return;
        const res = await this.pushToGoogleSheet(url, undefined, false);
        if (res.success) {
          await settingsRepository.set('googleSheetPendingSync', 'false');
        }
      } catch (err) {
        await settingsRepository.set('googleSheetPendingSync', 'true').catch(() => {});
        console.warn('Silent Google Sheets sync skipped:', err);
      }
    }, delayMs);
  }

  /**
   * Retrieves the saved Google Apps Script Webhook URL, or defaults to the built-in webhook.
   */
  async getWebhookUrl(): Promise<string> {
    const saved = (await settingsRepository.get(SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL, '')).trim();
    if (!saved || saved.includes('AKfycbwelZyo3EpfPDgbVb9b_7WWj7spsPp20DZs-4mxC_leoSta3B2VJiuxbgtEfsU50UTVUg')) {
      await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL, DEFAULT_GOOGLE_SHEET_WEBHOOK_URL);
      return DEFAULT_GOOGLE_SHEET_WEBHOOK_URL;
    }
    return saved || DEFAULT_GOOGLE_SHEET_WEBHOOK_URL;
  }

  /**
   * Saves the Google Apps Script Webhook URL.
   */
  async setWebhookUrl(url: string): Promise<void> {
    await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_WEBHOOK_URL, url.trim());
  }

  /**
   * Checks whether auto-sync on app active is enabled.
   */
  async getAutoSync(): Promise<boolean> {
    const val = await settingsRepository.get(SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC, 'false');
    return val === 'true';
  }

  /**
   * Enables or disables auto-sync.
   */
  async setAutoSync(enabled: boolean): Promise<void> {
    await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_AUTO_SYNC, String(enabled));
  }

  /**
   * Returns the ISO timestamp of the last successful sync.
   */
  async getLastSyncTime(): Promise<string | null> {
    const time = await settingsRepository.get(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME, '');
    return time || null;
  }

  /**
   * Retrieves the pre-shared secret token for webhook authentication.
   */
  async getSyncSecret(): Promise<string> {
    return (await settingsRepository.get(SETTINGS_KEYS.GOOGLE_SHEET_SYNC_SECRET, '')).trim();
  }

  /**
   * Saves the pre-shared secret token for webhook authentication.
   */
  async setSyncSecret(secret: string): Promise<void> {
    await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_SYNC_SECRET, secret.trim());
  }

  /**
   * Triggers an auto-sync if enabled or if there are queued offline changes.
   */
  async triggerAutoSyncIfEnabled(): Promise<void> {
    const autoSync = await this.getAutoSync();
    const isPending = (await settingsRepository.get('googleSheetPendingSync', 'false')) === 'true';
    if (!autoSync && !isPending) return;

    const url = await this.getWebhookUrl();
    if (!url) return;

    this.flushSyncQueue(500);
  }

  /**
   * Performs an HTTP fetch with timeout and automatic retry for transient network hiccups and HTTP 429/503.
   */
  private async fetchWithTimeout(url: string, options: any = {}, timeoutMs = 45000, maxRetries = 2): Promise<any> {
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      let hasTimedOut = false;
      const timer = setTimeout(() => {
        hasTimedOut = true;
        try {
          controller.abort();
        } catch { }
      }, timeoutMs);

      try {
        const response = await fetch(url, {
          redirect: 'follow',
          ...options,
          signal: controller.signal,
        });

        if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
          attempt++;
          clearTimeout(timer);
          await new Promise<void>((resolve) => setTimeout(() => resolve(), attempt * 1500));
          continue;
        }

        return response;
      } catch (err: any) {
        if (attempt < maxRetries && !hasTimedOut && err?.name !== 'AbortError') {
          attempt++;
          clearTimeout(timer);
          await new Promise<void>((resolve) => setTimeout(() => resolve(), attempt * 1500));
          continue;
        }

        if (hasTimedOut || err?.name === 'AbortError') {
          throw new Error(
            `Connection timed out (${Math.round(timeoutMs / 1000)}s). Google Sheets took too long to respond. Please check your internet connection speed.`
          );
        }
        if (err?.message === 'Network request failed' || err?.message?.includes('Network request failed')) {
          throw new Error(
            'Network request failed.\n\nPlease check:\n• Your device has active internet access (Wi-Fi or mobile data)\n• Try switching to Wi-Fi if mobile data is slow\n• Disable Private DNS or VPN if blocking script.google.com'
          );
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Safely parses response from Google Apps Script webhook, detecting Google account redirects.
   */
  private async parseResponse(response: any): Promise<any> {
    let result: any = null;
    if (typeof response.text === 'function') {
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch {
        if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('accounts.google.com')) {
          throw new Error(
            'Google Apps Script returned an authorization redirect. Please ensure your deployment is configured with "Who has access: Anyone".'
          );
        }
        throw new Error(`Invalid response from Google Sheets Webhook: ${text.substring(0, 120)}`);
      }
    } else if (typeof response.json === 'function') {
      result = await response.json();
    } else {
      result = response;
    }

    if (result && !result.success && result.error) {
      const errStr = String(result.error);
      if (errStr.includes('Cannot read properties of null') || errStr.includes('getSheetByName') || errStr.includes('getName')) {
        throw new Error(
          'Google Apps Script deployment is running an old version on Google.\n\nQuick 30-second fix:\n1. Open script.google.com\n2. Open your project\n3. Click Deploy > Manage Deployments\n4. Click Edit (pencil icon) > Version: "New version" > Click Deploy.'
        );
      }
    }

    return result;
  }

  /**
   * Checks whether the given URL is empty or matches an inactive placeholder demo URL.
   */
  isPlaceholderUrl(url?: string): boolean {
    if (!url) return true;
    const trimmed = url.trim();
    return (
      !trimmed ||
      trimmed.includes('AKfycbwelZyo3EpfPDgbVb9b_7WWj7spsPp20DZs-4mxC_leoSta3B2VJiuxbgtEfsU50UTVUg') ||
      trimmed.includes('AKfycbwWSp3Y47KKz4LSJTgGRfUkh0qwDNZnuqSWG2Ud7tBdKmJhBI_bMhh4Lidi9jE5tKzZ')
    );
  }

  /**
   * Evaluates HTTP status codes and throws clear diagnostic messages for Google Apps Script responses.
   */
  private checkHttpStatus(response: any): void {
    if (response.ok) return;

    if (response.status === 404) {
      throw new Error(
        'Google Sheet returned HTTP 404 (Not Found).\n\nWhy this happens:\n1. The Webhook URL is invalid or the deployment ID was not found on Google\'s servers.\n2. The default demo webhook URL is inactive.\n3. The Apps Script project was not deployed as a "Web app".\n\nHow to fix:\n1. In Settings, tap "📋 Copy Script Code".\n2. Open https://sheets.new -> Extensions -> Apps Script.\n3. Paste the code and Deploy as Web app (Who has access: "Anyone").\n4. Copy your Web App URL (ends in /exec) and paste it into Settings.'
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Google Sheet returned HTTP ${response.status} (Access Denied).\n\nPlease check your Google Apps Script deployment settings:\n• Set "Who has access" to "Anyone" so mobile devices can write to your sheet without browser cookie authentication.`
      );
    }
    throw new Error(`Google Sheet returned HTTP ${response.status}`);
  }

  /**
   * Tests the connection to the Google Apps Script Webhook URL and retrieves live cloud stats.
   */
  async testConnection(
    customUrl?: string,
    customSecret?: string
  ): Promise<{ success: boolean; message: string; sheetTitle?: string; counts?: any }> {
    const url = (customUrl !== undefined ? customUrl : await this.getWebhookUrl()).trim();
    if (!url) {
      return { success: false, message: 'Please provide a valid Google Sheet Webhook URL.' };
    }
    if (this.isPlaceholderUrl(url)) {
      return {
        success: false,
        message:
          'Webhook URL is not configured yet.\n\nThe default URL is an inactive placeholder. To connect to your private Google Drive:\n\n1. In Settings, tap "📋 Copy Script Code"\n2. Open https://sheets.new in browser\n3. Click Extensions -> Apps Script\n4. Paste the code, Save, and click Deploy -> New deployment -> Web app\n5. Set "Who has access" to "Anyone" and copy the Web App URL\n6. Paste your Web App URL here and tap "Test Link"!',
      };
    }

    const secret = (customSecret !== undefined ? customSecret : await this.getSyncSecret()).trim();
    const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=utf-8' };
    if (secret) {
      headers['X-Sync-Secret'] = secret;
    }

    try {
      let response: any;
      try {
        response = await this.fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'status', ...(secret ? { secret } : {}) }),
          },
          15000
        );
      } catch {
        // Fallback to ping
        response = await this.fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'ping', ...(secret ? { secret } : {}) }),
          },
          15000
        );
      }

      this.checkHttpStatus(response);
      const res = await this.parseResponse(response);

      if (res && res.success) {
        let msg = res.message || 'Connected to Google Sheet successfully!';
        if (res.counts) {
          msg = `Connected to "${res.sheetTitle || 'LifePlanner Database'}"!\nFound ${res.counts.tasks} tasks, ${res.counts.habits} habits & ${res.counts.notes} notes in Google Drive.`;
        }

        return {
          success: true,
          message: msg,
          sheetTitle: res.sheetTitle || 'LifePlanner Database',
          counts: res.counts,
        };
      }

      return {
        success: false,
        message: res.error || res.message || 'Received unexpected response from Google Sheet.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed to connect to Google Sheet. Check the URL and deployment permissions.',
      };
    }
  }

  /**
   * Two-Way Smart Sync:
   * 1. Fetches remote Google Sheet data and timestamp.
   * 2. Merges newer remote modifications into local SQLite (respecting updatedAt timestamps).
   * 3. Pushes the consolidated database back to Google Sheets with new revision timestamp.
   */
  async twoWaySync(customUrl?: string, customSecret?: string): Promise<GoogleSheetsSyncResult> {
    const url = (customUrl !== undefined ? customUrl : await this.getWebhookUrl()).trim();
    if (!url) {
      return { success: false, message: 'Google Sheet Webhook URL is not configured.' };
    }

    const secret = (customSecret !== undefined ? customSecret : await this.getSyncSecret()).trim();
    const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=utf-8' };
    if (secret) {
      headers['X-Sync-Secret'] = secret;
    }

    try {
      // 1. Pull remote state
      const pullResponse = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'pull', ...(secret ? { secret } : {}) }),
        },
        60000
      );
      const pullResult = await pullResponse.json();

      if (pullResult && pullResult.success && pullResult.backupData) {
          const bData = pullResult.backupData;
          bData.version = bData.version || 1;
          bData.tasks = Array.isArray(bData.tasks) ? bData.tasks : [];
          bData.categories = Array.isArray(bData.categories) ? bData.categories : [];
          bData.habits = Array.isArray(bData.habits) ? bData.habits : [];
          bData.habitLogs = Array.isArray(bData.habitLogs) ? bData.habitLogs : [];
          bData.keepNotes = Array.isArray(bData.keepNotes) ? bData.keepNotes : [];
          bData.calendarEvents = Array.isArray(bData.calendarEvents) ? bData.calendarEvents : [];
          await backupService.importBackup(JSON.stringify(bData), 'merge');
        }

      // 2. Export consolidated merged state and push back to Google Sheets
      const pushRes = await this.pushToGoogleSheet(url, secret, true);
      return pushRes;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed during two-way synchronization.',
      };
    }
  }

  /**
   * Pushes all local SQLite data into formatted Google Sheet tabs.
   * Protected by the Ironclad Blank Device Safety Guard to prevent wiping existing cloud sheets.
   */
  async pushToGoogleSheet(customUrl?: string, customSecret?: string, force = false): Promise<GoogleSheetsSyncResult> {
    const url = (customUrl !== undefined ? customUrl : await this.getWebhookUrl()).trim();
    if (!url) {
      return { success: false, message: 'Google Sheet Webhook URL is not configured.' };
    }

    const secret = (customSecret !== undefined ? customSecret : await this.getSyncSecret()).trim();
    const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=utf-8' };
    if (secret) {
      headers['X-Sync-Secret'] = secret;
    }

    try {
      const backupJson = await backupService.exportBackup();
      const backupData: BackupData = JSON.parse(backupJson);

      // BLANK DEVICE SAFETY GUARD:
      // If force is not explicitly true, check if empty phone is attempting to push over a populated sheet.
      if (!force) {
        const guard = await this.safePushGuard(backupData, url, secret);
        if (!guard.safe) {
          return {
            success: true,
            message: guard.message || 'Blank device protection prevented sheet overwrite.',
            details: {
              tasksCount: backupData.tasks.length,
              categoriesCount: backupData.categories?.length || 0,
              habitsCount: backupData.habits.length,
              notesCount: backupData.keepNotes?.length || 0,
              eventsCount: backupData.calendarEvents?.length || 0,
              timestamp: new Date().toISOString(),
            },
          };
        }
      }

      const sheetTabs = this.buildSheetTabs(backupData);

      const payload = {
        action: 'push',
        timestamp: new Date().toISOString(),
        isInitialOrReplace: force,
        force,
        ...(secret ? { secret } : {}),
        backupData,
        sheetTabs,
      };

      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        60000
      );

      this.checkHttpStatus(response);

      const result = await this.parseResponse(response);
      if (!result || !result.success) {
        throw new Error(result.error || result.message || 'Failed to update Google Sheet.');
      }

      const nowIso = new Date().toISOString();
      await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME, nowIso);
      await settingsRepository.set('googleSheetPendingSync', 'false');

      return {
        success: true,
        message: `Synced ${backupData.tasks.length} tasks, ${backupData.categories?.length || 0} categories, ${backupData.habits.length} routines, ${backupData.keepNotes?.length || 0} notes, and ${backupData.calendarEvents?.length || 0} events to Google Sheets.`,
        details: {
          tasksCount: backupData.tasks.length,
          categoriesCount: backupData.categories?.length || 0,
          habitsCount: backupData.habits.length,
          notesCount: backupData.keepNotes?.length || 0,
          eventsCount: backupData.calendarEvents?.length || 0,
          timestamp: nowIso,
        },
      };
    } catch (err: any) {
      await settingsRepository.set('googleSheetPendingSync', 'true').catch(() => { });
      return {
        success: false,
        message: err.message || 'Failed to sync to Google Sheets.',
      };
    }
  }

  /**
   * Pulls data from Google Sheet and restores/merges into local SQLite database.
   */
  async pullFromGoogleSheet(customUrl?: string, mode: RestoreMode = 'merge', customSecret?: string): Promise<GoogleSheetsSyncResult> {
    const url = (customUrl !== undefined ? customUrl : await this.getWebhookUrl()).trim();
    if (!url) {
      return { success: false, message: 'Google Sheet Webhook URL is not configured.' };
    }

    const secret = (customSecret !== undefined ? customSecret : await this.getSyncSecret()).trim();
    const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=utf-8' };
    if (secret) {
      headers['X-Sync-Secret'] = secret;
    }

    try {
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'pull', ...(secret ? { secret } : {}) }),
        },
        60000
      );

      this.checkHttpStatus(response);

      const result = await this.parseResponse(response);
      if (!result || !result.success || !result.backupData) {
        throw new Error(result.error || result.message || 'No backup data found in Google Sheet.');
      }

      const backupData = result.backupData;
      backupData.version = backupData.version || 1;
      backupData.tasks = Array.isArray(backupData.tasks) ? backupData.tasks : [];
      backupData.categories = Array.isArray(backupData.categories) ? backupData.categories : [];
      backupData.habits = Array.isArray(backupData.habits) ? backupData.habits : [];
      backupData.habitLogs = Array.isArray(backupData.habitLogs) ? backupData.habitLogs : [];
      backupData.keepNotes = Array.isArray(backupData.keepNotes) ? backupData.keepNotes : [];
      backupData.calendarEvents = Array.isArray(backupData.calendarEvents) ? backupData.calendarEvents : [];

      const importRes = await backupService.importBackup(JSON.stringify(backupData), mode);
      if (!importRes.success) {
        throw new Error(importRes.message);
      }

      const nowIso = new Date().toISOString();
      await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME, nowIso);

      const tasksCount = result.backupData.tasks?.length || 0;
      const habitsCount = result.backupData.habits?.length || 0;
      const notesCount = result.backupData.keepNotes?.length || 0;
      const eventsCount = result.backupData.calendarEvents?.length || 0;

      return {
        success: true,
        message: `Successfully pulled ${tasksCount} tasks, ${habitsCount} routines, ${notesCount} notes & ${eventsCount} events into local SQLite.`,
        details: {
          tasksCount,
          habitsCount,
          notesCount,
          eventsCount,
          timestamp: nowIso,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed to pull from Google Sheets.',
      };
    }
  }

  private safeCell(val: any, maxLength = 45000): string | number {
    if (val === undefined || val === null) return '';
    if (typeof val === 'number') return val;
    const str = String(val);
    if (str.length > maxLength) {
      return str.substring(0, maxLength) + '... [TRUNCATED]';
    }
    return str;
  }

  /**
   * Formats a single Task entity into Google Sheet cells.
   */
  buildTaskRow(t: Task): any[] {
    const parts = (() => {
      if (!t.recurrenceRule || t.recurrenceRule.type === 'none') return 'None';
      const p = [
        t.recurrenceRule.interval && t.recurrenceRule.interval > 1
          ? `Every ${t.recurrenceRule.interval} ${t.recurrenceRule.type}`
          : t.recurrenceRule.type,
      ];
      if (t.recurrenceRule.daysOfWeek && t.recurrenceRule.daysOfWeek.length > 0) {
        p.push(`[Days: ${t.recurrenceRule.daysOfWeek.join(',')}]`);
      }
      if (t.recurrenceRule.endDate) {
        p.push(`until ${t.recurrenceRule.endDate}`);
      }
      return this.safeCell(p.join(' '));
    })();

    return [
      this.safeCell(t.id),
      this.safeCell(t.seriesId || ''),
      this.safeCell(t.title),
      this.safeCell(t.description),
      this.safeCell(t.date),
      this.safeCell(t.startTime),
      this.safeCell(t.endTime),
      this.safeCell(t.priority || 'medium'),
      this.safeCell(t.status || 'pending'),
      this.safeCell(t.categoryName || t.categoryId),
      this.safeCell(t.eisenhowerQuadrant || t.recurrenceRule?.eisenhowerQuadrant || 'None'),
      t.estimatedMinutes ?? t.recurrenceRule?.estimatedMinutes ?? '',
      this.safeCell(t.accentColor || t.recurrenceRule?.accentColor || ''),
      (t.isOvernight || t.recurrenceRule?.isOvernight) ? 'YES' : 'NO',
      (t.isLoudAlarm || t.recurrenceRule?.isLoudAlarm || t.priority === 'high') ? 'YES' : 'NO',
      parts,
      this.safeCell(t.notes),
      t.reminderMinutes ?? 0,
      this.safeCell(t.completedAt),
      this.safeCell(t.updatedAt || new Date().toISOString()),
    ];
  }

  /**
   * Formats a single Category entity into Google Sheet cells.
   */
  buildCategoryRow(c: Category): any[] {
    return [
      this.safeCell(c.id),
      this.safeCell(c.name),
      this.safeCell(c.color),
      this.safeCell(c.icon),
      this.safeCell(c.createdAt),
    ];
  }

  /**
   * Formats a single Habit entity into Google Sheet cells.
   */
  buildHabitRow(h: Habit): any[] {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const repeatDays =
      h.recurrenceRule?.daysOfWeek && h.recurrenceRule.daysOfWeek.length > 0
        ? h.recurrenceRule.daysOfWeek.map((d: number) => dayNames[d] || d).join(', ')
        : 'Everyday';

    return [
      this.safeCell(h.id),
      this.safeCell(h.name),
      this.safeCell(h.description),
      this.safeCell(h.icon || '🎯'),
      this.safeCell(h.color || '#FF6B00'),
      h.target || 1,
      this.safeCell(h.reminderTime),
      this.safeCell(repeatDays),
      h.archivedAt ? 'YES' : 'NO',
      this.safeCell(h.createdAt),
    ];
  }

  /**
   * Formats a single HabitLog entity into Google Sheet cells.
   */
  buildHabitLogRow(l: HabitLog): any[] {
    return [
      this.safeCell(l.id),
      this.safeCell(l.habitId),
      this.safeCell(l.date),
      l.completed ? 'YES' : 'NO',
      l.value || 1,
      this.safeCell(l.notes),
      this.safeCell(l.createdAt),
    ];
  }

  /**
   * Formats a single KeepNote entity into Google Sheet cells.
   */
  buildKeepNoteRow(n: KeepNote): any[] {
    const isChecklist = n.type === 'checklist';

    const isHeading = (txt: string) => {
      const t = txt.trim();
      return /^[-=_*#]{2,}/.test(t) || /[-=_*#]{2,}$/.test(t) || /^#+\s+/.test(t);
    };

    // If checklist note: store formatted items in Checklist Items column (headings without [ ]), keep Content column empty
    // If text note (e.g. dotted list): store text in Content column, keep Checklist Items column empty
    const checklistStr = isChecklist && n.checklistData
      ? n.checklistData
          .map((item) => {
            if (isHeading(item.text)) {
              return item.text; // Do not attach [ ] checkbox to section headings/dividers
            }
            return `[${item.completed ? 'x' : ' '}] ${item.text}`;
          })
          .join('\n')
      : '';
    const contentStr = isChecklist ? '' : (n.content || '');
    const labelsStr = n.labels ? n.labels.join(', ') : '';

    return [
      this.safeCell(n.id),
      this.safeCell(n.title),
      this.safeCell(contentStr),
      this.safeCell(n.type || 'text'),
      this.safeCell(n.color || 'default'),
      n.isPinned ? 'YES' : 'NO',
      n.isArchived ? 'YES' : 'NO',
      this.safeCell(labelsStr),
      this.safeCell(checklistStr),
      this.safeCell(n.reminderTime),
      this.safeCell(n.updatedAt || new Date().toISOString()),
    ];
  }

  /**
   * Formats a single CalendarEvent entity into Google Sheet cells.
   */
  buildCalendarEventRow(e: CalendarEvent): any[] {
    return [
      this.safeCell(e.id),
      this.safeCell(e.title),
      this.safeCell(e.description),
      this.safeCell(e.date),
      this.safeCell(e.time),
      e.ringAlarm ? 'YES' : 'NO',
      this.safeCell(e.status || 'active'),
      this.safeCell(e.createdAt),
      this.safeCell(e.updatedAt || new Date().toISOString()),
    ];
  }

  /**
   * Transforms SQLite JSON structures into human-readable 2D row matrices for Google Sheets.
   */
  buildSheetTabs(data: BackupData): Record<string, any[][]> {
    const taskHeaders = [
      'Task ID', 'Series ID', 'Title', 'Description', 'Date', 'Start Time', 'End Time',
      'Priority', 'Status', 'Category', 'Eisenhower Quadrant', 'Est. Duration (Mins)',
      'Accent Color', 'Is Overnight', 'Loud Alarm', 'Recurrence', 'Notes', 'Reminder (Mins)',
      'Completed At', 'Updated At',
    ];
    const taskRows = (data.tasks || []).map((t) => this.buildTaskRow(t));

    const categoryHeaders = ['Category ID', 'Name', 'Color', 'Icon', 'Created At'];
    const categoryRows = (data.categories || []).map((c) => this.buildCategoryRow(c));

    const habitHeaders = [
      'Habit ID', 'Name', 'Description', 'Icon', 'Color', 'Target',
      'Reminder Time', 'Repeat Days', 'Archived', 'Created At',
    ];
    const habitRows = (data.habits || []).map((h) => this.buildHabitRow(h));

    const logHeaders = ['Log ID', 'Habit ID', 'Date', 'Completed', 'Value', 'Notes', 'Created At'];
    const logRows = (data.habitLogs || []).map((l) => this.buildHabitLogRow(l));

    const noteHeaders = [
      'Note ID', 'Title', 'Content', 'Type', 'Color', 'Pinned', 'Archived',
      'Labels', 'Checklist Items', 'Reminder Time', 'Updated At',
    ];
    const noteRows = (data.keepNotes || []).map((n) => this.buildKeepNoteRow(n));

    const eventHeaders = [
      'Event ID', 'Title', 'Description', 'Date', 'Time', 'Ring Alarm',
      'Status', 'Created At', 'Updated At',
    ];
    const eventRows = (data.calendarEvents || []).map((e) => this.buildCalendarEventRow(e));

    return {
      Tasks: [taskHeaders, ...taskRows],
      Categories: [categoryHeaders, ...categoryRows],
      Habits: [habitHeaders, ...habitRows],
      Habit_Logs: [logHeaders, ...logRows],
      Keep_Notes: [noteHeaders, ...noteRows],
      Calendar_Events: [eventHeaders, ...eventRows],
    };
  }

  /**
   * Returns the ready-to-paste Google Apps Script code for the user's Google Sheet.
   */
  getGoogleAppsScriptCode(): string {
    return `/**
 * Google Apps Script Webhook for LifePlanner & Tasks (Local-First Real-Time Delta Sync)
 * 
 * Features:
 * 1. Delta Sync: Row-level upsert and delete by item ID (No more sheet.clear() wipeouts!)
 * 2. Cloud-First Safety Guard: Protects populated sheets from blank-device overwrites
 * 3. Fast Status Reporting: Returns live count of tasks, habits, notes & events
 * 4. Lossless Two-Way Restore: Pulls raw state from _SyncState or visual tabs
 * 
 * Setup Instructions:
 * 1. Open Google Sheets (https://sheets.new) or Google Apps Script (https://script.google.com).
 * 2. Paste this entire file into Code.gs (replace any existing code).
 * 3. Click Save (disk icon or Ctrl+S).
 * 4. Click Deploy -> New deployment (or Manage deployments -> Edit -> New version).
 * 5. Configuration:
 *    - Type: Web app
 *    - Description: LifePlanner Delta Sync
 *    - Execute as: Me (your Google email)
 *    - Who has access: Anyone (allows mobile app to sync seamlessly)
 * 6. Click Deploy, authorize access, and copy the Web App URL!
 */

function getOrCreateSpreadsheet(payload) {
  if (payload) {
    if (payload.spreadsheetId) {
      try {
        return SpreadsheetApp.openById(payload.spreadsheetId);
      } catch (e) {}
    }
    if (payload.spreadsheetUrl) {
      try {
        return SpreadsheetApp.openByUrl(payload.spreadsheetUrl);
      } catch (e) {}
    }
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      return ss;
    }
  } catch (e) {}

  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty("LIFEPLANNER_SHEET_ID");
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {}
  }

  var newSheet = SpreadsheetApp.create("LifePlanner Database");
  props.setProperty("LIFEPLANNER_SHEET_ID", newSheet.getId());
  return newSheet;
}

function findRowIndexById(sheet, targetId) {
  if (!sheet || !targetId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(targetId)) {
      return i + 2;
    }
  }
  return -1;
}

function getTabDefaultHeaders(tabName) {
  var headersMap = {
    Tasks: [
      'Task ID', 'Series ID', 'Title', 'Description', 'Date', 'Start Time', 'End Time',
      'Priority', 'Status', 'Category', 'Eisenhower Quadrant', 'Est. Duration (Mins)',
      'Accent Color', 'Is Overnight', 'Loud Alarm', 'Recurrence', 'Notes', 'Reminder (Mins)',
      'Completed At', 'Updated At'
    ],
    Categories: ['Category ID', 'Name', 'Color', 'Icon', 'Created At'],
    Habits: [
      'Habit ID', 'Name', 'Description', 'Icon', 'Color', 'Target',
      'Reminder Time', 'Repeat Days', 'Archived', 'Created At'
    ],
    Habit_Logs: ['Log ID', 'Habit ID', 'Date', 'Completed', 'Value', 'Notes', 'Created At'],
    Keep_Notes: [
      'Note ID', 'Title', 'Content', 'Type', 'Color', 'Pinned', 'Archived',
      'Labels', 'Checklist Items', 'Reminder Time', 'Updated At'
    ],
    Calendar_Events: [
      'Event ID', 'Title', 'Description', 'Date', 'Time', 'Ring Alarm',
      'Status', 'Created At', 'Updated At'
    ]
  };
  return headersMap[tabName] || [];
}

function ensureSheetWithHeader(ss, tabName, customHeaders) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    var headers = customHeaders || getTabDefaultHeaders(tabName);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#8B5CF6");
      headerRange.setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function doPost(e) {
  try {
    var rawText = e.postData.contents;
    var payload = JSON.parse(rawText);
    var action = payload.action;

    var props = PropertiesService.getScriptProperties();
    var savedSecret = props.getProperty("LIFEPLANNER_SYNC_SECRET");
    var clientSecret = payload.secret || (e.parameter && e.parameter.secret) || "";

    if (payload.setSecret !== undefined) {
      if (!savedSecret || clientSecret === savedSecret) {
        props.setProperty("LIFEPLANNER_SYNC_SECRET", payload.setSecret);
        savedSecret = payload.setSecret;
      } else {
        return responseJSON({ success: false, error: "Unauthorized: Invalid existing secret to update." });
      }
    }

    if (savedSecret && savedSecret.trim().length > 0) {
      if (clientSecret !== savedSecret) {
        return responseJSON({
          success: false,
          error: "Unauthorized: Invalid or missing sync secret. Please check your secret in Settings."
        });
      }
    }

    var ss = getOrCreateSpreadsheet(payload);

    if (action === "ping") {
      return responseJSON({
        success: true,
        message: "Connected to Google Sheet successfully!",
        sheetTitle: ss.getName(),
        sheetUrl: ss.getUrl()
      });
    }

    if (action === "status") {
      var tasksSheet = ss.getSheetByName("Tasks");
      var habitsSheet = ss.getSheetByName("Habits");
      var notesSheet = ss.getSheetByName("Keep_Notes");
      var eventsSheet = ss.getSheetByName("Calendar_Events");
      var categoriesSheet = ss.getSheetByName("Categories");
      var logsSheet = ss.getSheetByName("Habit_Logs");

      var tasksCount = tasksSheet ? Math.max(0, tasksSheet.getLastRow() - 1) : 0;
      var habitsCount = habitsSheet ? Math.max(0, habitsSheet.getLastRow() - 1) : 0;
      var notesCount = notesSheet ? Math.max(0, notesSheet.getLastRow() - 1) : 0;
      var eventsCount = eventsSheet ? Math.max(0, eventsSheet.getLastRow() - 1) : 0;
      var categoriesCount = categoriesSheet ? Math.max(0, categoriesSheet.getLastRow() - 1) : 0;
      var logsCount = logsSheet ? Math.max(0, logsSheet.getLastRow() - 1) : 0;
      var total = tasksCount + habitsCount + notesCount + eventsCount;

      var configSheet = ss.getSheetByName("_SyncState");
      var lastSyncTime = "";
      if (configSheet) {
        try { lastSyncTime = configSheet.getRange(1, 2).getValue() || ""; } catch(e) {}
      }

      return responseJSON({
        success: true,
        sheetTitle: ss.getName(),
        sheetUrl: ss.getUrl(),
        counts: {
          tasks: tasksCount,
          habits: habitsCount,
          notes: notesCount,
          events: eventsCount,
          categories: categoriesCount,
          habitLogs: logsCount,
          total: total
        },
        lastSyncTime: lastSyncTime
      });
    }

    if (action === "delta") {
      var mutations = payload.mutations || [];
      if (payload.mutation) mutations = [payload.mutation];

      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        var tabName = mut.tabName;
        var op = mut.op;
        var itemId = String(mut.id || "");
        var rowData = mut.row || [];

        if (!tabName || !itemId) continue;

        var sheet = ensureSheetWithHeader(ss, tabName);

        if (op === "delete") {
          var rowIndex = findRowIndexById(sheet, itemId);
          if (rowIndex > 1) {
            sheet.deleteRow(rowIndex);
          }
        } else if (op === "upsert") {
          if (rowData && rowData.length > 0) {
            var rowIndex = findRowIndexById(sheet, itemId);
            if (rowIndex > 1) {
              sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
            } else {
              sheet.appendRow(rowData);
            }
          }
        }
      }

      try {
        var configSheet = ss.getSheetByName("_SyncState");
        if (configSheet) {
          var numChunksOrData = configSheet.getRange(2, 2).getValue();
          var rawJson = "";
          if (typeof numChunksOrData === "number" && numChunksOrData > 0) {
            for (var c = 0; c < numChunksOrData; c++) {
              rawJson += configSheet.getRange(3 + c, 2).getValue();
            }
          } else if (typeof numChunksOrData === "string" && numChunksOrData.length > 0) {
            rawJson = numChunksOrData;
          }

          if (rawJson) {
            var backupData = JSON.parse(rawJson);
            var entityKeyMap = {
              task: 'tasks',
              habit: 'habits',
              habitLog: 'habitLogs',
              keepNote: 'keepNotes',
              calendarEvent: 'calendarEvents',
              category: 'categories'
            };

            for (var m = 0; m < mutations.length; m++) {
              var mut = mutations[m];
              var key = entityKeyMap[mut.entityType];
              if (!key) continue;

              var list = backupData[key] || [];
              if (mut.op === 'delete') {
                backupData[key] = list.filter(function(i) { return String(i.id) !== String(mut.id); });
              } else if (mut.op === 'upsert' && mut.item) {
                var found = false;
                for (var j = 0; j < list.length; j++) {
                  if (String(list[j].id) === String(mut.id)) {
                    list[j] = mut.item;
                    found = true;
                    break;
                  }
                }
                if (!found) list.push(mut.item);
                backupData[key] = list;
              }
            }

            var updatedJsonStr = JSON.stringify(backupData);
            var chunkSize = 45000;
            var numChunks = Math.ceil(updatedJsonStr.length / chunkSize);
            configSheet.getRange(1, 2).setValue(new Date().toISOString());
            configSheet.getRange(2, 2).setValue(numChunks);
            for (var c = 0; c < numChunks; c++) {
              configSheet.getRange(3 + c, 1).setValue("CHUNK_" + c);
              configSheet.getRange(3 + c, 2).setValue(updatedJsonStr.substring(c * chunkSize, (c + 1) * chunkSize));
            }
          }
        }
      } catch (syncStateErr) {}

      return responseJSON({
        success: true,
        message: "Delta sync applied " + mutations.length + " mutation(s).",
        appliedCount: mutations.length,
        timestamp: new Date().toISOString()
      });
    }

    if (action === "push") {
      var sheetTabs = payload.sheetTabs || {};
      var backupData = payload.backupData || {};

      var isForced = Boolean(payload.force || payload.isInitialOrReplace);
      var tasksSheet = ss.getSheetByName("Tasks");
      var existingTasks = tasksSheet ? Math.max(0, tasksSheet.getLastRow() - 1) : 0;
      var newTasks = (backupData.tasks && Array.isArray(backupData.tasks)) ? backupData.tasks.length : 0;

      if (!isForced && existingTasks > 0 && newTasks === 0) {
        return responseJSON({
          success: false,
          error: "BLANK_DEVICE_SAFETY_BLOCK: The Google Sheet currently contains " + existingTasks +
                 " tasks. A blank phone cannot wipe existing cloud data. Please perform a Pull / Restore first."
        });
      }

      for (var tabName in sheetTabs) {
        var rows = sheetTabs[tabName];
        if (!rows || rows.length === 0) continue;

        var sheet = ss.getSheetByName(tabName);
        if (!sheet) {
          sheet = ss.insertSheet(tabName);
        }
        sheet.clear();

        var numRows = rows.length;
        var numCols = rows[0].length;
        var range = sheet.getRange(1, 1, numRows, numCols);
        range.setValues(rows);

        var headerRange = sheet.getRange(1, 1, 1, numCols);
        headerRange.setFontWeight("bold");
        headerRange.setBackground("#8B5CF6");
        headerRange.setFontColor("#FFFFFF");
        sheet.setFrozenRows(1);
        try {
          sheet.autoResizeColumns(1, numCols);
        } catch(e) {}
      }

      var configSheet = ss.getSheetByName("_SyncState");
      if (!configSheet) {
        configSheet = ss.insertSheet("_SyncState");
      }
      configSheet.clear();
      configSheet.getRange(1, 1).setValue("LAST_SYNC_TIME");
      configSheet.getRange(1, 2).setValue(new Date().toISOString());
      configSheet.getRange(2, 1).setValue("RAW_BACKUP_JSON");

      var jsonStr = JSON.stringify(backupData);
      var chunkSize = 45000;
      var numChunks = Math.ceil(jsonStr.length / chunkSize);
      configSheet.getRange(2, 2).setValue(numChunks);
      for (var c = 0; c < numChunks; c++) {
        configSheet.getRange(3 + c, 1).setValue("CHUNK_" + c);
        configSheet.getRange(3 + c, 2).setValue(jsonStr.substring(c * chunkSize, (c + 1) * chunkSize));
      }

      var defaultSheet = ss.getSheetByName("Sheet1");
      if (defaultSheet && ss.getSheets().length > 1) {
        try { ss.deleteSheet(defaultSheet); } catch(e) {}
      }

      var activeTab = ss.getSheetByName("Tasks") || ss.getSheets()[0];
      if (activeTab) {
        ss.setActiveSheet(activeTab);
      }

      try {
        configSheet.hideSheet();
      } catch(e) {}

      return responseJSON({
        success: true,
        message: "Google Sheet tabs updated successfully!",
        sheetTitle: ss.getName(),
        sheetUrl: ss.getUrl(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === "pull") {
      var configSheet = ss.getSheetByName("_SyncState");
      var rawJson = "";

      if (configSheet) {
        var numChunksOrData = configSheet.getRange(2, 2).getValue();
        if (typeof numChunksOrData === "number" && numChunksOrData > 0) {
          for (var c = 0; c < numChunksOrData; c++) {
            rawJson += configSheet.getRange(3 + c, 2).getValue();
          }
        } else if (typeof numChunksOrData === "string" && numChunksOrData.length > 0) {
          rawJson = numChunksOrData;
        }
      }

      var lastSyncTime = "";
      if (configSheet) {
        try { lastSyncTime = configSheet.getRange(1, 2).getValue() || ""; } catch(e) {}
      }

      if (rawJson) {
        try {
          var parsedBackup = JSON.parse(rawJson);
          return responseJSON({
            success: true,
            backupData: parsedBackup,
            timestamp: lastSyncTime || new Date().toISOString()
          });
        } catch (parseErr) {}
      }

      var fallbackData = {
        version: 1,
        createdAt: new Date().toISOString(),
        tasks: [],
        categories: [],
        habits: [],
        habitLogs: [],
        keepNotes: [],
        calendarEvents: [],
        settings: {}
      };

      var tasksSheet = ss.getSheetByName("Tasks");
      if (tasksSheet && tasksSheet.getLastRow() > 1) {
        var taskValues = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 20).getValues();
        for (var i = 0; i < taskValues.length; i++) {
          var row = taskValues[i];
          if (!row[0] || !row[2]) continue;
          fallbackData.tasks.push({
            id: String(row[0]),
            seriesId: row[1] ? String(row[1]) : undefined,
            title: String(row[2]),
            description: row[3] ? String(row[3]) : undefined,
            date: String(row[4] || ''),
            startTime: row[5] ? String(row[5]) : undefined,
            endTime: row[6] ? String(row[6]) : undefined,
            priority: String(row[7] || 'medium'),
            status: String(row[8] || 'pending'),
            categoryName: row[9] ? String(row[9]) : undefined,
            eisenhowerQuadrant: row[10] ? String(row[10]) : undefined,
            estimatedMinutes: row[11] ? Number(row[11]) : undefined,
            accentColor: row[12] ? String(row[12]) : undefined,
            isOvernight: row[13] === 'YES',
            isLoudAlarm: row[14] === 'YES',
            notes: row[16] ? String(row[16]) : undefined,
            reminderMinutes: row[17] ? Number(row[17]) : 0,
            completedAt: row[18] ? String(row[18]) : undefined,
            updatedAt: row[19] ? String(row[19]) : new Date().toISOString(),
            createdAt: new Date().toISOString()
          });
        }
      }

      var notesSheet = ss.getSheetByName("Keep_Notes");
      if (notesSheet && notesSheet.getLastRow() > 1) {
        var noteValues = notesSheet.getRange(2, 1, notesSheet.getLastRow() - 1, 11).getValues();
        for (var i = 0; i < noteValues.length; i++) {
          var row = noteValues[i];
          if (!row[0]) continue;
          var noteType = String(row[3] || 'text');
          var checklistItems = [];
          if (noteType === 'checklist' && row[8]) {
            var rawLines = String(row[8]).split('\n');
            for (var k = 0; k < rawLines.length; k++) {
              var line = rawLines[k].trim();
              if (!line) continue;
              var isDone = line.indexOf('[x]') === 0 || line.indexOf('[X]') === 0;
              var itemText = line.replace(/^\[[ xX]\]\s*/, '').trim();
              checklistItems.push({
                id: 'item_' + Date.now() + '_' + k,
                text: itemText,
                completed: isDone
              });
            }
          }
          fallbackData.keepNotes.push({
            id: String(row[0]),
            title: String(row[1] || ''),
            content: noteType === 'checklist' ? '' : String(row[2] || ''),
            type: noteType,
            color: String(row[4] || 'default'),
            isPinned: row[5] === 'YES',
            isArchived: row[6] === 'YES',
            labels: row[7] ? String(row[7]).split(',').map(function(s) { return s.trim(); }) : [],
            checklistData: checklistItems,
            reminderTime: row[9] ? String(row[9]) : undefined,
            updatedAt: row[10] ? String(row[10]) : new Date().toISOString(),
            createdAt: new Date().toISOString()
          });
        }
      var categoriesSheet = ss.getSheetByName("Categories");
      if (categoriesSheet && categoriesSheet.getLastRow() > 1) {
        var catValues = categoriesSheet.getRange(2, 1, categoriesSheet.getLastRow() - 1, 5).getValues();
        for (var i = 0; i < catValues.length; i++) {
          var row = catValues[i];
          if (!row[0] || !row[1]) continue;
          fallbackData.categories.push({
            id: String(row[0]),
            name: String(row[1]),
            color: String(row[2] || '#3B82F6'),
            icon: String(row[3] || 'tag'),
            createdAt: row[4] ? String(row[4]) : new Date().toISOString()
          });
        }
      }

      var habitsSheet = ss.getSheetByName("Habits");
      if (habitsSheet && habitsSheet.getLastRow() > 1) {
        var habitValues = habitsSheet.getRange(2, 1, habitsSheet.getLastRow() - 1, 10).getValues();
        for (var i = 0; i < habitValues.length; i++) {
          var row = habitValues[i];
          if (!row[0] || !row[1]) continue;
          fallbackData.habits.push({
            id: String(row[0]),
            name: String(row[1]),
            description: row[2] ? String(row[2]) : undefined,
            icon: String(row[3] || 'flame'),
            color: String(row[4] || '#8B5CF6'),
            target: row[5] ? Number(row[5]) : 1,
            reminderTime: row[6] ? String(row[6]) : undefined,
            recurrenceRule: { type: 'daily' },
            archivedAt: row[8] === 'YES' ? new Date().toISOString() : undefined,
            createdAt: row[9] ? String(row[9]) : new Date().toISOString()
          });
        }
      }

      var logsSheet = ss.getSheetByName("Habit_Logs");
      if (logsSheet && logsSheet.getLastRow() > 1) {
        var logValues = logsSheet.getRange(2, 1, logsSheet.getLastRow() - 1, 7).getValues();
        for (var i = 0; i < logValues.length; i++) {
          var row = logValues[i];
          if (!row[0] || !row[1] || !row[2]) continue;
          fallbackData.habitLogs.push({
            id: String(row[0]),
            habitId: String(row[1]),
            date: String(row[2]),
            completed: String(row[3]) === '1' || row[3] === true || String(row[3]).toUpperCase() === 'YES',
            value: row[4] ? Number(row[4]) : 1,
            notes: row[5] ? String(row[5]) : undefined,
            createdAt: row[6] ? String(row[6]) : new Date().toISOString()
          });
        }
      }

      var eventsSheet = ss.getSheetByName("Calendar_Events");
      if (eventsSheet && eventsSheet.getLastRow() > 1) {
        var eventValues = eventsSheet.getRange(2, 1, eventsSheet.getLastRow() - 1, 9).getValues();
        for (var i = 0; i < eventValues.length; i++) {
          var row = eventValues[i];
          if (!row[0] || !row[1]) continue;
          fallbackData.calendarEvents.push({
            id: String(row[0]),
            title: String(row[1]),
            description: row[2] ? String(row[2]) : undefined,
            date: String(row[3] || ''),
            time: String(row[4] || ''),
            ringAlarm: row[5] === 'YES' || row[5] === true || row[5] === 1,
            status: String(row[6] || 'active'),
            createdAt: row[7] ? String(row[7]) : new Date().toISOString(),
            updatedAt: row[8] ? String(row[8]) : new Date().toISOString()
          });
        }
      }

      return responseJSON({
        success: true,
        backupData: fallbackData,
        timestamp: lastSyncTime || new Date().toISOString()
      });
    }

    return responseJSON({ success: false, error: "Invalid action requested: " + action });

  } catch (err) {
    return responseJSON({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  try {
    var ss = getOrCreateSpreadsheet();
    return responseJSON({
      success: true,
      status: "LifePlanner Delta Sync Webhook is Active",
      sheetTitle: ss.getName(),
      sheetUrl: ss.getUrl()
    });
  } catch (err) {
    return responseJSON({
      success: false,
      status: "LifePlanner Sync Webhook Error",
      error: err.toString()
    });
  }
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
  }
}

export const googleSheetsSyncService = new GoogleSheetsSyncService();
