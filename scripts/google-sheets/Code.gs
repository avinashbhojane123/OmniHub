/**
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
      return i + 2; // 1-indexed row number
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

    // 1. PING ACTION
    if (action === "ping") {
      return responseJSON({
        success: true,
        message: "Connected to Google Sheet successfully!",
        sheetTitle: ss.getName(),
        sheetUrl: ss.getUrl()
      });
    }

    // 2. STATUS ACTION (Cloud-First fast stats check)
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

    // 3. DELTA SYNC ACTION (Granular row-level upsert & delete without wipeouts)
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

      // Keep _SyncState updated with raw JSON if mutations contain items
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
      } catch (syncStateErr) {
        // Delta row updates succeeded even if JSON cache failed
      }

      return responseJSON({
        success: true,
        message: "Delta sync applied " + mutations.length + " mutation(s).",
        appliedCount: mutations.length,
        timestamp: new Date().toISOString()
      });
    }

    // 4. PUSH ACTION (Full snapshot with Blank-Device Safety Guard)
    if (action === "push") {
      var sheetTabs = payload.sheetTabs || {};
      var backupData = payload.backupData || {};

      // BLANK-DEVICE SAFETY GUARD:
      // If the sheet already contains tasks/notes, but the incoming push is empty (0 tasks & 0 habits)
      // and force/replace wasn't explicitly flagged, REFUSE the destructive wipe!
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

      // Write formatted visual tabs for human spreadsheet view
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

      // Store lossless raw JSON in configuration tab
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

    // 5. PULL ACTION (Cloud-First Restore)
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

      // If lossless JSON exists in _SyncState, return it
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

      // Fallback: Synthesize backupData directly from visible rows
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
