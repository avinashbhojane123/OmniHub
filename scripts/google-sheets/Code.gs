/**
 * Google Apps Script Webhook for LifePlanner & Tasks (Local-First Sync)
 * 
 * Works seamlessly as:
 * 1. Container-bound script (opened inside a Google Sheet via Extensions -> Apps Script)
 * 2. Standalone script (created directly at script.google.com) - automatically creates/links "LifePlanner Database"
 * 
 * Setup Instructions:
 * 1. Open Google Sheets (https://sheets.new) or Google Apps Script (https://script.google.com).
 * 2. Paste this entire file into Code.gs.
 * 3. Click Save (disk icon or Ctrl+S).
 * 4. Click Deploy -> New deployment (or Manage deployments -> Edit -> New version).
 * 5. Configuration:
 *    - Type: Web app
 *    - Description: LifePlanner Sync Webhook
 *    - Execute as: Me (your Google email)
 *    - Who has access: Anyone (allows your mobile app to sync seamlessly)
 * 6. Click Deploy, authorize access, and copy the Web App URL!
 */

function getOrCreateSpreadsheet(payload) {
  // 1. If payload explicitly supplies a spreadsheet ID or URL
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

  // 2. If script is container-bound to an active sheet
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      return ss;
    }
  } catch (e) {}

  // 3. If standalone script, check if we previously created/linked a spreadsheet ID
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty("LIFEPLANNER_SHEET_ID");
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {
      // If deleted or inaccessible, re-create below
    }
  }

  // 4. Automatically create a spreadsheet in user's Google Drive
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
