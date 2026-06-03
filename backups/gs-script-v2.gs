
// GR TEMPLATE CONSOLIDATION - SINGLE LOG, DUAL YEAR, IMPROVED EXTRACTION
// Requires Advanced Service: Drive API

const CONFIG = {
  sourceFolderName: "GR template with Matdoc Reference: (File responses)",
  tempFolderName: "_GR_AUTOMATION_TEMP",
  trackerSheetName: "Processed Files Log",
  outputSheets: {
    "2025": "GR Posted 2025",
    "2026": "GR Posted 2026"
  },
  sourceHeaderName: "Source File", // Column X
  triggerMinutes: 1,
  maxFilesPerRunTotal: 16,
  maxFilesPerRunPerYear: 8,
  maxRuntimeMs: 260000,
  headerScanMaxRows: 80
};

const COLUMN_MAPPING = [
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
  "Payment Milestone": ["Payment Milestone", "Milestone"]
};

const NUMERIC_HEADERS = {
  "Installed Qty": true,
  "PO Quantity": true,
  "PO Unit Price": true,
  "Sub Total": true,
  "Amount To Billed": true
};

// ========================= MENU =========================

function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    PropertiesService.getScriptProperties().setProperty("BOUND_SPREADSHEET_ID", ss.getId());
  }

  SpreadsheetApp.getUi()
    .createMenu("GR Consolidation")
    .addItem("Consolidate Now (Manual)", "consolidateGRTemplateData")
    .addSeparator()
    .addItem("Start Automatic (Every 1 min)", "setupAutomaticEvery1Min")
    .addItem("Stop Automatic", "removeTrigger")
    .addSeparator()
    .addItem("View Processing Log", "showProcessingLog")
    .addItem("Requeue No Data Files", "requeueNoDataFiles")
    .addItem("Cleanup Temp Files", "cleanupTempFiles")
    .addToUi();
}

function showProcessingLog() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(CONFIG.trackerSheetName);
  if (sh) ss.setActiveSheet(sh);
}

// ========================= MAIN =========================

function consolidateGRTemplateData() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("Another run is active. Skipping.");
    return;
  }

  const startedAt = Date.now();

  try {
    const ss = getSpreadsheet_();
    const tracker = getOrCreateTrackerSheet_(ss, CONFIG.trackerSheetName);
    const out2025 = getOrCreateOutputSheet_(ss, CONFIG.outputSheets["2025"]);
    const out2026 = getOrCreateOutputSheet_(ss, CONFIG.outputSheets["2026"]);

    const processedMap = getProcessedMap_(tracker);
    const sourceFolder = findFolderByName_(CONFIG.sourceFolderName);

    if (!sourceFolder) {
      logInfo_("Source folder not found: " + CONFIG.sourceFolderName);
      return;
    }

    const tempFolder = getOrCreateTempFolder_();
    const buckets = listCandidateFilesByYear_(sourceFolder);
    const files2025 = buckets["2025"];
    const files2026 = buckets["2026"];

    Logger.log("Candidates - 2025: " + files2025.length + ", 2026: " + files2026.length);

    let idx25 = 0;
    let idx26 = 0;
    let done25 = 0;
    let done26 = 0;
    let totalDone = 0;
    let rowsAdded = 0;
    let failed = 0;
    let noData = 0;

    while (true) {
      if (Date.now() - startedAt > CONFIG.maxRuntimeMs) break;
      if (totalDone >= CONFIG.maxFilesPerRunTotal) break;

      let worked = false;

      if (done25 < CONFIG.maxFilesPerRunPerYear) {
        const next25 = nextUnprocessedFile_(files2025, idx25, processedMap);
        idx25 = next25.nextIndex;

        if (next25.file) {
          const stat25 = processSingleFile_(next25.file, "2025", out2025, tracker, tempFolder.getId());
          processedMap[next25.file.getId()] = true;
          done25++;
          totalDone++;
          worked = true;
          rowsAdded += stat25.rowsAdded;
          failed += stat25.failed ? 1 : 0;
          noData += stat25.noData ? 1 : 0;
        }
      }

      if (Date.now() - startedAt > CONFIG.maxRuntimeMs) break;
      if (totalDone >= CONFIG.maxFilesPerRunTotal) break;

      if (done26 < CONFIG.maxFilesPerRunPerYear) {
        const next26 = nextUnprocessedFile_(files2026, idx26, processedMap);
        idx26 = next26.nextIndex;

        if (next26.file) {
          const stat26 = processSingleFile_(next26.file, "2026", out2026, tracker, tempFolder.getId());
          processedMap[next26.file.getId()] = true;
          done26++;
          totalDone++;
          worked = true;
          rowsAdded += stat26.rowsAdded;
          failed += stat26.failed ? 1 : 0;
          noData += stat26.noData ? 1 : 0;
        }
      }

      if (!worked) break;
    }

    logInfo_(
      "Run done. Files processed: " + totalDone +
      " (2025: " + done25 + ", 2026: " + done26 + ")" +
      ", Rows added: " + rowsAdded +
      ", No data: " + noData +
      ", Failed: " + failed
    );

  } finally {
    lock.releaseLock();
  }
}

function processSingleFile_(file, year, outputSheet, trackerSheet, tempFolderId) {
  const fileId = file.getId();
  const fileName = file.getName();
  let tempSheetId = null;

  try {
    Logger.log("Processing " + year + ": " + fileName);

    tempSheetId = convertExcelToTempSheet_(fileId, tempFolderId);
    if (!tempSheetId) throw new Error("Conversion failed");

    const parsed = parseConvertedSheet_(tempSheetId);

    if (!parsed || !parsed.rows || parsed.rows.length === 0) {
      markInTracker_(trackerSheet, fileId, fileName, year, "No data extracted", 0, parsed ? parsed.headerRow : "");
      return { rowsAdded: 0, failed: false, noData: true };
    }

    const appendStat = appendRowsWithSourceLink_(outputSheet, parsed.rows, fileId, fileName);
    markInTracker_(trackerSheet, fileId, fileName, year, "Processed", appendStat.rowCount, parsed.headerRow);
    return { rowsAdded: appendStat.rowCount, failed: false, noData: false };

  } catch (e) {
    markInTracker_(trackerSheet, fileId, fileName, year, "Failed: " + String(e).substring(0, 120), 0, "");
    return { rowsAdded: 0, failed: true, noData: false };
  } finally {
    if (tempSheetId) trashFileQuiet_(tempSheetId);
  }
}

// ========================= PARSING =========================

function parseConvertedSheet_(tempSheetId) {
  const ss = SpreadsheetApp.openById(tempSheetId);
  const sh = findGRTemplateSheet_(ss);
  if (!sh) return { rows: [], headerRow: "" };

  const range = sh.getDataRange();
  const values = range.getValues();
  const display = range.getDisplayValues();

  if (!values || values.length === 0) return { rows: [], headerRow: "" };

  const headerInfo = detectHeaderRowAndMap_(display);
  if (!headerInfo || headerInfo.matchedCount < 7) {
    Logger.log("Header detection weak. matched=" + (headerInfo ? headerInfo.matchedCount : 0));
    return { rows: [], headerRow: "" };
  }

  let rows = extractRowsWithFilter_(values, display, headerInfo.map, headerInfo.rowIndex, true);

  // Fallback: relaxed filter if strict returns none
  if (rows.length === 0) {
    rows = extractRowsWithFilter_(values, display, headerInfo.map, headerInfo.rowIndex, false);
  }

  return {
    rows: rows,
    headerRow: headerInfo.rowIndex + 1
  };
}

function extractRowsWithFilter_(values, display, map, headerRowIndex, strictMode) {
  const outRows = [];

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const rawRow = values[r] || [];
    const disRow = display[r] || [];
    const out = [];

    for (let i = 0; i < COLUMN_MAPPING.length; i++) {
      const header = COLUMN_MAPPING[i];
      const col = map[header];

      if (col === undefined) {
        out.push("");
      } else {
        const raw = col < rawRow.length ? rawRow[col] : "";
        const dis = col < disRow.length ? disRow[col] : "";
        out.push(formatCellByHeader_(header, raw, dis));
      }
    }

    if (isLikelyHeaderOrMetaRow_(out)) continue;

    if (strictMode) {
      if (!isLikelyDataRow_(out)) continue;
    } else {
      if (!isNonTrivialRow_(out)) continue;
    }

    outRows.push(out);
  }

  return outRows;
}

function findGRTemplateSheet_(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const n = sheets[i].getName().toLowerCase();
    if (n.indexOf("gr template") !== -1) return sheets[i];
  }
  return sheets.length > 0 ? sheets[0] : null;
}

function detectHeaderRowAndMap_(displayValues) {
  const scanLimit = Math.min(displayValues.length, CONFIG.headerScanMaxRows);
  let best = { rowIndex: -1, matchedCount: -1, map: {} };

  for (let r = 0; r < scanLimit; r++) {
    const row = displayValues[r] || [];
    const m = createColumnMapping_(row);
    const cnt = Object.keys(m).length;
    if (cnt > best.matchedCount) {
      best = { rowIndex: r, matchedCount: cnt, map: m };
    }
  }

  return best;
}

function createColumnMapping_(headerRow) {
  const map = {};
  const normalized = [];

  for (let c = 0; c < headerRow.length; c++) {
    normalized[c] = normalizeText_(headerRow[c]);
  }

  for (let i = 0; i < COLUMN_MAPPING.length; i++) {
    const canonical = COLUMN_MAPPING[i];
    const aliases = HEADER_ALIASES[canonical] || [canonical];
    let found = -1;

    for (let c = 0; c < normalized.length; c++) {
      const cell = normalized[c];
      if (!cell) continue;

      for (let a = 0; a < aliases.length; a++) {
        const alias = normalizeText_(aliases[a]);
        if (!alias) continue;

        if (cell === alias || cell.indexOf(alias) !== -1 || alias.indexOf(cell) !== -1) {
          found = c;
          break;
        }
      }

      if (found !== -1) break;
    }

    if (found !== -1) map[canonical] = found;
  }

  return map;
}

function formatCellByHeader_(header, raw, display) {
  if (header === "Payment Milestone") {
    const d = String(display || "").trim();
    if (d !== "") return d;

    if (typeof raw === "number") {
      if (raw >= 0 && raw <= 1) return toPercentText_(raw);
      return raw;
    }

    return raw || "";
  }

  if (header === "Acceptance Date (PAC/FAC)") {
    if (raw instanceof Date) return raw;
    if (String(display || "").trim() !== "") return display;
    return raw || "";
  }

  if (NUMERIC_HEADERS[header]) {
    if (raw !== "" && raw !== null && raw !== undefined) return raw;
    return display || "";
  }

  if (String(display || "").trim() !== "") return display;
  return raw || "";
}

function toPercentText_(n) {
  const v = n * 100;
  let s = v.toFixed(6);
  s = s.replace(/\.?0+$/, "");
  return s + "%";
}

function isLikelyHeaderOrMetaRow_(row) {
  const txt = normalizeText_(row.slice(0, 10).join(" "));
  if (!txt) return true;

  const bad = [
    "acceptancedate", "potagging", "vendor", "forequipment", "forservices",
    "poitemno", "pono", "materialdescription", "paymentmilestone", "domainname"
  ];

  for (let i = 0; i < bad.length; i++) {
    if (txt.indexOf(bad[i]) !== -1) return true;
  }

  return false;
}

function isLikelyDataRow_(row) {
  let nonEmpty = 0;
  for (let i = 0; i < row.length; i++) {
    if (String(row[i] || "").trim() !== "") nonEmpty++;
  }
  if (nonEmpty < 2) return false;

  const poNo = String(row[1] || "").trim();
  const matDesc = String(row[4] || "").trim();
  const svc = String(row[5] || "").trim();
  const grDoc = String(row[9] || "").trim();
  const amount = String(row[20] || "").trim();

  return !!(poNo || matDesc || svc || grDoc || amount);
}

function isNonTrivialRow_(row) {
  let nonEmpty = 0;
  for (let i = 0; i < row.length; i++) {
    if (String(row[i] || "").trim() !== "") nonEmpty++;
  }
  return nonEmpty >= 3;
}

// ========================= APPEND =========================

function appendRowsWithSourceLink_(sheet, rows, fileId, fileName) {
  const startRow = sheet.getLastRow() + 1;
  const totalCols = COLUMN_MAPPING.length + 1;
  const fileUrl = "https://drive.google.com/open?id=" + fileId;
  const safeLabel = String(fileName).replace(/"/g, "'");
  const formula = '=HYPERLINK("' + fileUrl + '","' + safeLabel + '")';

  const payload = [];
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i].slice();
    x.push("");
    payload.push(x);
  }

  if (payload.length > 0) {
    payload[0][COLUMN_MAPPING.length] = formula; // only first row of each file block
    sheet.getRange(startRow, 1, payload.length, totalCols).setValues(payload);
  }

  return { startRow: startRow, rowCount: payload.length };
}

// ========================= SHEETS =========================

function getOrCreateOutputSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, COLUMN_MAPPING.length + 1).setValues([
      COLUMN_MAPPING.concat([CONFIG.sourceHeaderName])
    ]);
    sh.getRange(1, 1, 1, COLUMN_MAPPING.length + 1).setFontWeight("bold");
  } else {
    const current = sh.getRange(1, 1, 1, COLUMN_MAPPING.length + 1).getValues()[0];
    if (current[COLUMN_MAPPING.length] !== CONFIG.sourceHeaderName) {
      sh.getRange(1, 1, 1, COLUMN_MAPPING.length + 1).setValues([
        COLUMN_MAPPING.concat([CONFIG.sourceHeaderName])
      ]);
      sh.getRange(1, 1, 1, COLUMN_MAPPING.length + 1).setFontWeight("bold");
    }
  }
  return sh;
}

function getOrCreateTrackerSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 8).setValues([[
      "File ID",
      "File Name",
      "Year",
      "Processed Date",
      "Status",
      "Link to File",
      "Rows Added",
      "Header Row"
    ]]);
    sh.getRange(1, 1, 1, 8).setFontWeight("bold");
  }
  return sh;
}

function getProcessedMap_(trackerSheet) {
  const vals = trackerSheet.getDataRange().getValues();
  const map = {};
  for (let r = 1; r < vals.length; r++) {
    const id = vals[r][0];
    if (id) map[id] = true;
  }
  return map;
}

function markInTracker_(trackerSheet, fileId, fileName, year, status, rowsAdded, headerRow) {
  const url = "https://drive.google.com/open?id=" + fileId;
  const linkFormula = '=HYPERLINK("' + url + '","View File")';

  trackerSheet.appendRow([
    fileId,
    fileName,
    year || "",
    new Date(),
    status || "",
    "",
    rowsAdded || 0,
    headerRow || ""
  ]);

  const lastRow = trackerSheet.getLastRow();
  trackerSheet.getRange(lastRow, 6).setFormula(linkFormula);
}

// ========================= FILES =========================

function listCandidateFilesByYear_(folder) {
  const y25 = [];
  const y26 = [];
  const it = folder.getFiles();

  while (it.hasNext()) {
    const f = it.next();
    const mime = f.getMimeType();
    const name = f.getName();
    const upper = name.toUpperCase();

    const isExcel = (
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel"
    );

    if (!isExcel) continue;
    if (!(upper.indexOf("GR TEMPLATE") !== -1 || upper.indexOf("GRD_EFB") !== -1)) continue;

    if (name.indexOf("2025") !== -1) y25.push(f);
    if (name.indexOf("2026") !== -1) y26.push(f);
  }

  y25.sort(function(a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
  y26.sort(function(a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });

  return { "2025": y25, "2026": y26 };
}

function nextUnprocessedFile_(list, startIndex, processedMap) {
  let i = startIndex;
  while (i < list.length) {
    const f = list[i];
    i++;
    if (!processedMap[f.getId()]) {
      return { file: f, nextIndex: i };
    }
  }
  return { file: null, nextIndex: i };
}

// ========================= DRIVE =========================

function findFolderByName_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function getOrCreateTempFolder_() {
  const it = DriveApp.getFoldersByName(CONFIG.tempFolderName);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(CONFIG.tempFolderName);
}

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
    Logger.log("Could not trash temp file: " + fileId + " | " + e);
  }
}

// ========================= TRIGGERS =========================

function setupAutomaticEvery1Min() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    PropertiesService.getScriptProperties().setProperty("BOUND_SPREADSHEET_ID", ss.getId());
  }

  removeTrigger_(false);

  ScriptApp.newTrigger("consolidateGRTemplateData")
    .timeBased()
    .everyMinutes(CONFIG.triggerMinutes)
    .create();

  logInfo_("Automatic trigger started (every 1 minute). Running first batch now.");
  consolidateGRTemplateData();
}

function removeTrigger() {
  removeTrigger_(true);
}

function removeTrigger_(notify) {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "consolidateGRTemplateData") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  if (notify) logInfo_("Automatic trigger removed.");
}

// ========================= MAINTENANCE =========================

function requeueNoDataFiles() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!sh) return;

  const vals = sh.getDataRange().getValues();
  let removed = 0;

  for (let r = vals.length; r >= 2; r--) {
    const status = String(vals[r - 1][4] || "");
    if (status.indexOf("No data extracted") !== -1) {
      sh.deleteRow(r);
      removed++;
    }
  }

  logInfo_("Requeued No data extracted rows removed: " + removed);
}

function cleanupTempFiles() {
  const temp = getOrCreateTempFolder_();
  const it = temp.getFiles();
  let count = 0;

  while (it.hasNext()) {
    it.next().setTrashed(true);
    count++;
  }

  logInfo_("Temp files moved to trash: " + count);
}

// ========================= UTIL =========================

function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const id = PropertiesService.getScriptProperties().getProperty("BOUND_SPREADSHEET_ID");
  if (!id) throw new Error("BOUND_SPREADSHEET_ID not set");
  return SpreadsheetApp.openById(id);
}

function normalizeText_(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9()./%-]/g, "");
}

function logInfo_(msg) {
  Logger.log(msg);
  try {
    getSpreadsheet_().toast(msg, "GR Consolidation", 5);
  } catch (e) {}
}