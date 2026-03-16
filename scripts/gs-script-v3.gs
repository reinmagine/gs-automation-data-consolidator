
// GR TEMPLATE CONSOLIDATION

const CONFIG = {
  sourceFolderName: "GR template with Matdoc Reference: (File responses)",
  tempFolderName: "_GR_AUTOMATION_TEMP",
  trackerSheetName: "Processed Files Log",
  outputSheets: {
    "2025": "GR Posted 2025",
    "2026": "GR Posted 2026"
  },
  sourceFileHeader: "Source File",
  maxFilesPerRun: 8,
  maxRuntimeMs: 240000,
  triggerMinutes: 1
};

const REQUIRED_HEADERS = [
  "Acceptance Date (PAC/FAC)",
  "PO No.",
  "PO Item No.",
  "PO Service Item No.",
  "Material Description",
  "PO Service Short Text",
  "Material Code",
  "Installed Qty",
  "Asset Tag Number",
  "GR Mat. Doc.",
  "WBS Element",
  "PO Site Name",
  "PO PLA ID",
  "Installed Site Name",
  "Installed PLA ID",
  "Serial no. (ManufSerialNo.)",
  "PO Quantity",
  "UOM",
  "PO Unit Price",
  "Sub Total",
  "Amount To Billed",
  "Currency",
  "Payment Milestone"
];

const HEADER_ALIASES = {
  "Acceptance Date (PAC/FAC)": ["Acceptance Date (PAC/FAC)", "Acceptance Date", "PAC/FAC"],
  "PO No.": ["PO No.", "PO No", "PO Number"],
  "PO Item No.": ["PO Item No.", "PO Item No", "PO Item"],
  "PO Service Item No.": ["PO Service Item No.", "PO Service Item No", "PO Service Item"],
  "Material Description": ["Material Description"],
  "PO Service Short Text": ["PO Service Short Text", "Service Short Text"],
  "Material Code": ["Material Code"],
  "Installed Qty": ["Installed Qty", "Installed Quantity"],
  "Asset Tag Number": ["Asset Tag Number", "Asset Tag No.", "Asset Tag No"],
  "GR Mat. Doc.": ["GR Mat. Doc.", "GR Mat Doc", "GR Material Doc", "GR Material Document"],
  "WBS Element": ["WBS Element"],
  "PO Site Name": ["PO Site Name"],
  "PO PLA ID": ["PO PLA ID"],
  "Installed Site Name": ["Installed Site Name"],
  "Installed PLA ID": ["Installed PLA ID"],
  "Serial no. (ManufSerialNo.)": ["Serial no. (ManufSerialNo.)", "Serial no.", "ManufSerialNo."],
  "PO Quantity": ["PO Quantity"],
  "UOM": ["UOM"],
  "PO Unit Price": ["PO Unit Price", "Unit Price"],
  "Sub Total": ["Sub Total", "Subtotal"],
  "Amount To Billed": ["Amount To Billed", "Amount To Bill"],
  "Currency": ["Currency"],
  "Payment Milestone": ["Payment Milestone"]
};

// ========================= MENU =========================

function onOpen() {
  storeBoundSpreadsheetId_();

  SpreadsheetApp.getUi()
    .createMenu("GR Consolidation")
    .addItem("Consolidate Now (Manual)", "consolidateGRTemplateData")
    .addSeparator()
    .addItem("Start Automatic (Every 1 min)", "setupAutomaticEvery1Min")
    .addItem("Stop Automatic", "removeAutomaticTrigger")
    .addSeparator()
    .addItem("View Processing Log", "viewProcessingLog")
    .addItem("Cleanup Temp Files", "cleanupTempFolderFiles")
    .addToUi();
}

function viewProcessingLog() {
  const ss = getBoundSpreadsheet_();
  const sh = ss.getSheetByName(CONFIG.trackerSheetName);
  if (sh) {
    ss.setActiveSheet(sh);
  }
}

// ========================= MAIN =========================

function consolidateGRTemplateData() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("Another run is already in progress. Skipping.");
    return;
  }

  const startedAt = Date.now();

  try {
    const ss = getBoundSpreadsheet_();
    const trackerSheet = getOrCreateTrackerSheet_(ss);
    getOrCreateOutputSheet_(ss, CONFIG.outputSheets["2025"]);
    getOrCreateOutputSheet_(ss, CONFIG.outputSheets["2026"]);

    const sourceFolder = findFolderByName_(CONFIG.sourceFolderName);
    if (!sourceFolder) {
      logOnly_("Source folder not found: " + CONFIG.sourceFolderName);
      return;
    }

    const tempFolder = getOrCreateTempFolder_();
    const processedIdMap = getProcessedIdMap_(trackerSheet);
    const files = listCandidateExcelFiles_(sourceFolder);

    Logger.log("Candidate files: " + files.length);

    let processedCount = 0;
    let rowsAdded = 0;
    let failedCount = 0;

    for (let i = 0; i < files.length; i++) {
      if (Date.now() - startedAt > CONFIG.maxRuntimeMs) {
        Logger.log("Stopping: runtime guard reached.");
        break;
      }

      if (processedCount >= CONFIG.maxFilesPerRun) {
        Logger.log("Stopping: batch limit reached.");
        break;
      }

      const file = files[i];
      const fileId = file.getId();
      const fileName = file.getName();

      if (processedIdMap[fileId]) {
        continue;
      }

      Logger.log("Processing: " + fileName);

      let tempSheetId = null;

      try {
        tempSheetId = convertExcelToTempSheet_(fileId, tempFolder.getId());

        if (!tempSheetId) {
          throw new Error("Failed to convert Excel file");
        }

        const parsed = parseConvertedSpreadsheet_(tempSheetId);
        const year = detectYear_(fileName, parsed ? parsed.rows : null);

        if (year !== "2025" && year !== "2026") {
          markFileAsProcessed_(
            ss,
            fileId,
            fileName,
            "",
            "Skipped: year not found",
            0,
            parsed ? parsed.headerRowIndex : ""
          );
          processedCount++;
          continue;
        }

        if (!parsed || !parsed.rows || parsed.rows.length === 0) {
          markFileAsProcessed_(
            ss,
            fileId,
            fileName,
            year,
            "No data extracted",
            0,
            parsed ? parsed.headerRowIndex : ""
          );
          processedCount++;
          continue;
        }

        const outputSheet = ss.getSheetByName(CONFIG.outputSheets[year]);
        const appendResult = appendRowsWithSourceLink_(outputSheet, parsed.rows, fileId, fileName);

        rowsAdded += appendResult.rowCount;
        processedCount++;

        markFileAsProcessed_(
          ss,
          fileId,
          fileName,
          year,
          "Processed",
          appendResult.rowCount,
          parsed.headerRowIndex
        );

      } catch (err) {
        Logger.log("Processing failed for " + fileName + ": " + err);
        failedCount++;

        markFileAsProcessed_(
          ss,
          fileId,
          fileName,
          detectYear_(fileName, null),
          "Failed: " + String(err).substring(0, 120),
          0,
          ""
        );
      } finally {
        if (tempSheetId) {
          trashFileQuiet_(tempSheetId);
        }
      }
    }

    logOnly_(
      "Run complete. Files processed: " +
      processedCount +
      ", rows added: " +
      rowsAdded +
      ", failed: " +
      failedCount
    );

  } finally {
    lock.releaseLock();
  }
}

// ========================= APPEND =========================

function appendRowsWithSourceLink_(sheet, rows, fileId, fileName) {
  const startRow = sheet.getLastRow() + 1;
  const totalCols = REQUIRED_HEADERS.length + 1;
  const fileUrl = "https://drive.google.com/open?id=" + fileId;
  const safeLabel = String(fileName).replace(/"/g, "'");
  const linkFormula = '=HYPERLINK("' + fileUrl + '","' + safeLabel + '")';

  const payload = [];

  for (let i = 0; i < rows.length; i++) {
    const outRow = rows[i].slice();
    outRow.push("");
    payload.push(outRow);
  }

  if (payload.length > 0) {
    payload[0][REQUIRED_HEADERS.length] = linkFormula;
    sheet.getRange(startRow, 1, payload.length, totalCols).setValues(payload);
  }

  return {
    startRow: startRow,
    rowCount: payload.length
  };
}

// ========================= PARSING =========================

function parseConvertedSpreadsheet_(tempSheetId) {
  const ss = SpreadsheetApp.openById(tempSheetId);
  const targetSheet = findGRTemplateSheet_(ss);

  if (!targetSheet) {
    return { rows: [], headerRowIndex: "" };
  }

  const values = targetSheet.getDataRange().getValues();
  if (!values || values.length === 0) {
    return { rows: [], headerRowIndex: "" };
  }

  const headerInfo = detectHeaderRowInfo_(values);
  if (!headerInfo || headerInfo.matchedCount < 10) {
    Logger.log("Header row could not be detected reliably.");
    return { rows: [], headerRowIndex: "" };
  }

  const rows = [];
  const headerMap = headerInfo.headerMap;

  for (let r = headerInfo.rowIndex + 1; r < values.length; r++) {
    const sourceRow = values[r] || [];
    const extracted = [];

    for (let h = 0; h < REQUIRED_HEADERS.length; h++) {
      const headerName = REQUIRED_HEADERS[h];
      const colIndex = headerMap[headerName];
      extracted.push(colIndex === undefined ? "" : safeCell_(sourceRow, colIndex));
    }

    if (isLikelyHeaderOrMetaRow_(extracted)) {
      continue;
    }

    if (!isLikelyDataRow_(extracted)) {
      continue;
    }

    rows.push(extracted);
  }

  return {
    rows: rows,
    headerRowIndex: headerInfo.rowIndex + 1
  };
}

function findGRTemplateSheet_(spreadsheet) {
  const sheets = spreadsheet.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName().toLowerCase();
    if (name.indexOf("gr template") !== -1) {
      return sheets[i];
    }
  }

  return sheets.length > 0 ? sheets[0] : null;
}

function detectHeaderRowInfo_(values) {
  const scanLimit = Math.min(values.length, 25);
  let best = {
    rowIndex: -1,
    matchedCount: -1,
    headerMap: {}
  };

  for (let r = 0; r < scanLimit; r++) {
    const row = values[r] || [];
    const map = createHeaderMapFromRow_(row);
    const matchedCount = Object.keys(map).length;

    if (matchedCount > best.matchedCount) {
      best = {
        rowIndex: r,
        matchedCount: matchedCount,
        headerMap: map
      };
    }
  }

  return best;
}

function createHeaderMapFromRow_(row) {
  const normalizedCells = [];
  const map = {};

  for (let c = 0; c < row.length; c++) {
    normalizedCells[c] = normalizeText_(row[c]);
  }

  for (let i = 0; i < REQUIRED_HEADERS.length; i++) {
    const canonical = REQUIRED_HEADERS[i];
    const aliases = HEADER_ALIASES[canonical] || [canonical];
    let foundCol = -1;

    for (let c = 0; c < normalizedCells.length; c++) {
      const cell = normalizedCells[c];
      if (!cell) continue;

      for (let a = 0; a < aliases.length; a++) {
        const alias = normalizeText_(aliases[a]);
        if (!alias) continue;

        if (cell === alias || cell.indexOf(alias) !== -1 || alias.indexOf(cell) !== -1) {
          foundCol = c;
          break;
        }
      }

      if (foundCol !== -1) {
        break;
      }
    }

    if (foundCol !== -1) {
      map[canonical] = foundCol;
    }
  }

  return map;
}

function isLikelyHeaderOrMetaRow_(row) {
  const sample = normalizeText_(row.slice(0, 10).join(" "));
  if (!sample) return true;

  const badTokens = [
    "acceptancedate",
    "potagging",
    "vendor",
    "forequipment",
    "forservices",
    "pono",
    "poitemno",
    "materialdescription",
    "paymentmilestone",
    "total"
  ];

  for (let i = 0; i < badTokens.length; i++) {
    if (sample.indexOf(badTokens[i]) !== -1) {
      return true;
    }
  }

  return false;
}

function isLikelyDataRow_(row) {
  let nonEmpty = 0;
  for (let i = 0; i < row.length; i++) {
    if (String(row[i] || "").trim() !== "") {
      nonEmpty++;
    }
  }

  if (nonEmpty < 2) return false;

  const poNo = String(row[1] || "").trim();
  const materialDescription = String(row[4] || "").trim();
  const serviceText = String(row[5] || "").trim();
  const grMatDoc = String(row[9] || "").trim();

  if (poNo || grMatDoc) return true;
  if (materialDescription || serviceText) return true;

  return false;
}

// ========================= CONVERSION =========================

function convertExcelToTempSheet_(fileId, tempFolderId) {
  const resource = {
    title: "TMP_" + new Date().getTime() + "_" + Utilities.getUuid().substring(0, 8),
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [{ id: tempFolderId }]
  };

  const converted = Drive.Files.copy(resource, fileId, { convert: true });
  return converted && converted.id ? converted.id : null;
}

function trashFileQuiet_(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    Logger.log("Could not trash file " + fileId + ": " + e);
  }
}

// ========================= FILE/FOLDER HELPERS =========================

function listCandidateExcelFiles_(folder) {
  const files = [];
  const it = folder.getFiles();

  while (it.hasNext()) {
    const file = it.next();
    const mime = file.getMimeType();
    const name = file.getName();
    const upper = name.toUpperCase();

    const isExcel =
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel";

    if (!isExcel) continue;
    if (!(upper.indexOf("GR TEMPLATE") !== -1 || upper.indexOf("GRD_EFB") !== -1)) continue;
    if (!(name.indexOf("2025") !== -1 || name.indexOf("2026") !== -1)) continue;

    files.push(file);
  }

  files.sort(function(a, b) {
    return a.getDateCreated().getTime() - b.getDateCreated().getTime();
  });

  return files;
}

function findFolderByName_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function getOrCreateTempFolder_() {
  const it = DriveApp.getFoldersByName(CONFIG.tempFolderName);
  if (it.hasNext()) {
    return it.next();
  }
  return DriveApp.createFolder(CONFIG.tempFolderName);
}

// ========================= SHEETS =========================

function getOrCreateOutputSheet_(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet
      .getRange(1, 1, 1, REQUIRED_HEADERS.length + 1)
      .setValues([REQUIRED_HEADERS.concat([CONFIG.sourceFileHeader])]);
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length + 1).setFontWeight("bold");
  }

  return sheet;
}

function getOrCreateTrackerSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.trackerSheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.trackerSheetName);
    sheet.getRange(1, 1, 1, 8).setValues([[
      "File ID",
      "File Name",
      "Year",
      "Processed Date",
      "Status",
      "Link to File",
      "Rows Added",
      "Header Row"
    ]]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
  }

  return sheet;
}

function getProcessedIdMap_(trackerSheet) {
  const values = trackerSheet.getDataRange().getValues();
  const map = {};

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0];
    if (id) {
      map[id] = true;
    }
  }

  return map;
}

function markFileAsProcessed_(spreadsheet, fileId, fileName, year, status, rowsAdded, headerRow) {
  const sheet = spreadsheet.getSheetByName(CONFIG.trackerSheetName);
  const fileUrl = "https://drive.google.com/open?id=" + fileId;
  const linkFormula = '=HYPERLINK("' + fileUrl + '","View File")';

  sheet.appendRow([
    fileId,
    fileName,
    year || "",
    new Date(),
    status || "",
    "",
    rowsAdded || 0,
    headerRow || ""
  ]);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 6).setFormula(linkFormula);
}

// ========================= TRIGGERS =========================

function setupAutomaticEvery1Min() {
  storeBoundSpreadsheetId_();
  removeAutomaticTrigger_(false);

  ScriptApp.newTrigger("consolidateGRTemplateData")
    .timeBased()
    .everyMinutes(CONFIG.triggerMinutes)
    .create();

  logOnly_("Automatic consolidation started. Running first batch now.");
  consolidateGRTemplateData();
}

function removeAutomaticTrigger() {
  removeAutomaticTrigger_(true);
}

function removeAutomaticTrigger_(notify) {
  const triggers = ScriptApp.getProjectTriggers();

  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "consolidateGRTemplateData") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  if (notify) {
    logOnly_("Automatic trigger removed.");
  }
}

// ========================= CLEANUP =========================

function cleanupTempFolderFiles() {
  const tempFolder = getOrCreateTempFolder_();
  const files = tempFolder.getFiles();
  let count = 0;

  while (files.hasNext()) {
    files.next().setTrashed(true);
    count++;
  }

  logOnly_("Temp files moved to trash: " + count);
}

// ========================= UTIL =========================

function getBoundSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty("BOUND_SPREADSHEET_ID");

  if (!spreadsheetId) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (!active) {
      throw new Error("BOUND_SPREADSHEET_ID is not set.");
    }
    spreadsheetId = active.getId();
    props.setProperty("BOUND_SPREADSHEET_ID", spreadsheetId);
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function storeBoundSpreadsheetId_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    PropertiesService.getScriptProperties().setProperty("BOUND_SPREADSHEET_ID", active.getId());
  }
}

function detectYear_(fileName, rows) {
  const m = String(fileName || "").match(/20(25|26)/);
  if (m && m[0]) return m[0];

  if (rows && rows.length > 0) {
    const firstCell = rows[0][0];
    if (firstCell instanceof Date) {
      return String(firstCell.getFullYear());
    }
    const m2 = String(firstCell || "").match(/20(25|26)/);
    if (m2 && m2[0]) return m2[0];
  }

  return "";
}

function safeCell_(row, index) {
  return index >= 0 && index < row.length ? row[index] : "";
}

function normalizeText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9()./]/g, "");
}

function logOnly_(message) {
  Logger.log(message);
  try {
    getBoundSpreadsheet_().toast(message, "GR Consolidation", 5);
  } catch (e) {}
}