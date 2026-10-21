import { BackupData, Task, Habit, HabitLog, KeepNote, CalendarEvent } from '../../types';
import { backupService, RestoreMode } from './BackupService';
import { settingsRepository } from '../../database/repositories/SettingsRepository';
import { SETTINGS_KEYS } from '../../constants/settingsKeys';

export interface GoogleSheetsSyncResult {
  success: boolean;
  message: string;
  details?: {
    tasksCount?: number;
    habitsCount?: number;
    notesCount?: number;
    eventsCount?: number;
    timestamp?: string;
  };
}

export const DEFAULT_GOOGLE_SHEET_DEPLOYMENT_ID =
  'AKfycbwWSp3Y47KKz4LSJTgGRfUkh0qwDNZnuqSWG2Ud7tBdKmJhBI_bMhh4Lidi9jE5tKzZ';

export const DEFAULT_GOOGLE_SHEET_WEBHOOK_URL =
  `https://script.google.com/macros/s/${DEFAULT_GOOGLE_SHEET_DEPLOYMENT_ID}/exec`;

export class GoogleSheetsSyncService {
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

    const lastSync = await this.getLastSyncTime();
    if (!isPending && lastSync) {
      const diffMs = Date.now() - new Date(lastSync).getTime();
      if (diffMs < 15000) return;
    }

    const res = await this.pushToGoogleSheet(url);
    if (res.success) {
      await settingsRepository.set('googleSheetPendingSync', 'false');
    }
  }

  /**
   * Performs an HTTP fetch with an explicit timeout and automatic exponential backoff retry for transient network hiccups and HTTP 429/503.
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
   * Tests the connection to the Google Apps Script Webhook URL.
   */
  async testConnection(customUrl?: string, customSecret?: string): Promise<{ success: boolean; message: string; sheetTitle?: string }> {
    const url = (customUrl !== undefined ? customUrl : await this.getWebhookUrl()).trim();
    if (!url) {
      return { success: false, message: 'Please provide a valid Google Sheet Webhook URL.' };
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
            body: JSON.stringify({ action: 'ping', ...(secret ? { secret } : {}) }),
          },
          15000
        );
      } catch {
        // Fallback to GET for Google Apps Script Webhook
        response = await this.fetchWithTimeout(
          url,
          {
            method: 'GET',
          },
          15000
        );
      }

      if (!response.ok) {
        throw new Error(`Google Sheet returned HTTP ${response.status}`);
      }

      const res = await this.parseResponse(response);
      if (res && res.success) {
        return {
          success: true,
          message: res.message || res.status || 'Connected to Google Sheet successfully!',
          sheetTitle: res.sheetTitle || 'LifePlanner_Database',
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
   * Pushes all local SQLite data into formatted Google Sheet tabs.
   */
  async pushToGoogleSheet(customUrl?: string, customSecret?: string): Promise<GoogleSheetsSyncResult> {
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

      const sheetTabs = this.buildSheetTabs(backupData);

      const payload = {
        action: 'push',
        timestamp: new Date().toISOString(),
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

      if (!response.ok) {
        throw new Error(`Google Sheet responded with status ${response.status}`);
      }

      const result = await this.parseResponse(response);
      if (!result || !result.success) {
        throw new Error(result.error || result.message || 'Failed to update Google Sheet.');
      }

      const nowIso = new Date().toISOString();
      await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME, nowIso);
      await settingsRepository.set('googleSheetPendingSync', 'false');

      return {
        success: true,
        message: `Synced ${backupData.tasks.length} tasks, ${backupData.habits.length} routines, and ${backupData.keepNotes?.length || 0} notes to Google Sheets.`,
        details: {
          tasksCount: backupData.tasks.length,
          habitsCount: backupData.habits.length,
          notesCount: backupData.keepNotes?.length || 0,
          eventsCount: backupData.calendarEvents?.length || 0,
          timestamp: nowIso,
        },
      };
    } catch (err: any) {
      await settingsRepository.set('googleSheetPendingSync', 'true').catch(() => {});
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

      if (!response.ok) {
        throw new Error(`Google Sheet returned HTTP ${response.status}`);
      }

      const result = await this.parseResponse(response);
      if (!result || !result.success || !result.backupData) {
        throw new Error(result.error || result.message || 'No backup data found in Google Sheet.');
      }

      const importRes = await backupService.importBackup(JSON.stringify(result.backupData), mode);
      if (!importRes.success) {
        throw new Error(importRes.message);
      }

      const nowIso = new Date().toISOString();
      await settingsRepository.set(SETTINGS_KEYS.GOOGLE_SHEET_LAST_SYNC_TIME, nowIso);

      const tasksCount = result.backupData.tasks?.length || 0;
      const habitsCount = result.backupData.habits?.length || 0;
      const notesCount = result.backupData.keepNotes?.length || 0;

      return {
        success: true,
        message: `Successfully pulled ${tasksCount} tasks & ${habitsCount} habits into local SQLite.`,
        details: {
          tasksCount,
          habitsCount,
          notesCount,
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
   * Transforms SQLite JSON structures into human-readable 2D row matrices for Google Sheets.
   */
  private buildSheetTabs(data: BackupData): Record<string, any[][]> {
    // 1. Tasks Tab
    const taskHeaders = [
      'Task ID',
      'Title',
      'Description',
      'Date',
      'Start Time',
      'End Time',
      'Priority',
      'Status',
      'Notes',
      'Reminder (Mins)',
      'Completed At',
      'Updated At',
    ];
    const taskRows = (data.tasks || []).map((t: Task) => [
      this.safeCell(t.id),
      this.safeCell(t.title),
      this.safeCell(t.description),
      this.safeCell(t.date),
      this.safeCell(t.startTime),
      this.safeCell(t.endTime),
      this.safeCell(t.priority || 'medium'),
      this.safeCell(t.status || 'pending'),
      this.safeCell(t.notes),
      t.reminderMinutes ?? 0,
      this.safeCell(t.completedAt),
      this.safeCell(t.updatedAt),
    ]);

    // 2. Habits Tab
    const habitHeaders = [
      'Habit ID',
      'Name',
      'Description',
      'Icon',
      'Color',
      'Target',
      'Reminder Time',
      'Created At',
    ];
    const habitRows = (data.habits || []).map((h: Habit) => [
      this.safeCell(h.id),
      this.safeCell(h.name),
      this.safeCell(h.description),
      this.safeCell(h.icon || '🎯'),
      this.safeCell(h.color || '#FF6B00'),
      h.target || 1,
      this.safeCell(h.reminderTime),
      this.safeCell(h.createdAt),
    ]);

    // 3. Habit Logs Tab
    const logHeaders = ['Log ID', 'Habit ID', 'Date', 'Completed', 'Value', 'Notes', 'Created At'];
    const logRows = (data.habitLogs || []).map((l: HabitLog) => [
      this.safeCell(l.id),
      this.safeCell(l.habitId),
      this.safeCell(l.date),
      l.completed ? 'YES' : 'NO',
      l.value || 1,
      this.safeCell(l.notes),
      this.safeCell(l.createdAt),
    ]);

    // 4. Keep Notes Tab
    const noteHeaders = [
      'Note ID',
      'Title',
      'Content',
      'Type',
      'Color',
      'Pinned',
      'Archived',
      'Labels',
      'Checklist Items',
      'Reminder Time',
      'Updated At',
    ];
    const noteRows = (data.keepNotes || []).map((n: KeepNote) => {
      const checklistStr = n.checklistData
        ? n.checklistData.map((item) => `[${item.completed ? 'x' : ' '}] ${item.text}`).join('\n')
        : '';
      const labelsStr = n.labels ? n.labels.join(', ') : '';
      return [
        this.safeCell(n.id),
        this.safeCell(n.title),
        this.safeCell(n.content),
        this.safeCell(n.type || 'text'),
        this.safeCell(n.color || 'default'),
        n.isPinned ? 'YES' : 'NO',
        n.isArchived ? 'YES' : 'NO',
        this.safeCell(labelsStr),
        this.safeCell(checklistStr),
        this.safeCell(n.reminderTime),
        this.safeCell(n.updatedAt),
      ];
    });

    // 5. Calendar Events Tab
    const eventHeaders = ['Event ID', 'Title', 'Description', 'Date', 'Time', 'Ring Alarm', 'Status', 'Created At'];
    const eventRows = (data.calendarEvents || []).map((e: CalendarEvent) => [
      this.safeCell(e.id),
      this.safeCell(e.title),
      this.safeCell(e.description),
      this.safeCell(e.date),
      this.safeCell(e.time),
      e.ringAlarm ? 'YES' : 'NO',
      this.safeCell(e.status || 'active'),
      this.safeCell(e.createdAt),
    ]);

    return {
      Tasks: [taskHeaders, ...taskRows],
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
 * Google Apps Script Webhook for LifePlanner & Tasks (Local-First Sync)
 * 
 * Instructions:
 * 1. Open Google Sheets (https://sheets.new) in Google Drive.
 * 2. Click "Extensions" -> "Apps Script".
 * 3. Delete existing code, paste this entire file, and click "Save" (Ctrl+S).
 * 4. Click "Deploy" -> "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "LifePlanner Sync".
 * 7. Set "Execute as": "Me".
 * 8. Set "Who has access": "Anyone" (allows phone to sync without Google Cloud console setup).
 * 9. Click "Deploy", authorize access, and copy the Web App URL!
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

function doPost(e) {
  try {
    var rawText = e.postData.contents;
    var payload = JSON.parse(rawText);
    var action = payload.action;

    // Optional Secret Token Authentication
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

    if (action === "push") {
      var sheetTabs = payload.sheetTabs || {};
      var backupData = payload.backupData || {};

      // 1. Write formatted visual tabs for human spreadsheet view
      for (var tabName in sheetTabs) {
        var rows = sheetTabs[tabName];
        if (!rows || rows.length === 0) continue;

        var sheet = ss.getSheetByName(tabName);
        if (!sheet) {
          sheet = ss.insertSheet(tabName);
        }
        sheet.clear();

        // Write rows
        var numRows = rows.length;
        var numCols = rows[0].length;
        var range = sheet.getRange(1, 1, numRows, numCols);
        range.setValues(rows);

        // Beautify Header Row
        var headerRange = sheet.getRange(1, 1, 1, numCols);
        headerRange.setFontWeight("bold");
        headerRange.setBackground("#8B5CF6");
        headerRange.setFontColor("#FFFFFF");
        sheet.setFrozenRows(1);
        try {
          sheet.autoResizeColumns(1, numCols);
        } catch(e) {}
      }

      // 2. Store lossless raw JSON in dedicated configuration tab for two-way pull
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

      // 3. Remove default empty "Sheet1" and activate "Tasks" tab as primary view
      var defaultSheet = ss.getSheetByName("Sheet1");
      if (defaultSheet && ss.getSheets().length > 1) {
        try { ss.deleteSheet(defaultSheet); } catch(e) {}
      }

      var tasksSheet = ss.getSheetByName("Tasks") || ss.getSheets()[0];
      if (tasksSheet) {
        ss.setActiveSheet(tasksSheet);
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
      if (!configSheet) {
        return responseJSON({
          success: false,
          error: "No sync data found. Please push your app data to this sheet first."
        });
      }

      var numChunksOrData = configSheet.getRange(2, 2).getValue();
      var rawJson = "";
      if (typeof numChunksOrData === "number" && numChunksOrData > 0) {
        for (var c = 0; c < numChunksOrData; c++) {
          rawJson += configSheet.getRange(3 + c, 2).getValue();
        }
      } else if (typeof numChunksOrData === "string" && numChunksOrData.length > 0) {
        rawJson = numChunksOrData;
      }

      if (!rawJson) {
        return responseJSON({
          success: false,
          error: "Empty sync state in Google Sheet."
        });
      }

      var parsedBackup = JSON.parse(rawJson);
      return responseJSON({
        success: true,
        backupData: parsedBackup
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
      status: "LifePlanner Sync Webhook is Active",
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
