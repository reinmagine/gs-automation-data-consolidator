// GR Template Consolidation

// Config
const CONFIG = {
  sourceFolderName: "GR template with Matdoc Reference: (File responses)",
  tempFolderName: "_GR_AUTOMATION_TEMP",
  trackerSheetName: "Processed Files Log",
  outputSheets: { "2025": "GR Posted 2025", "2026": "GR Posted 2026" },
  sourceHeaderName: "Source File",
  triggerMinutes: 1,
  maxFilesPerRunTotal: 16,
  maxFilesPerRunPerYear: 8,
  maxRuntimeMs: 260000,
  headerScanMaxRows: 80,
  openRetryAttempts: 8,
  openRetryDelayMs: 1500,
  minHeaderMatches: 3,
  maxFailedAttemptsPerFile: 5,
  doneStatusText: "Done"
};

// Output columns
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

// Header aliases for flexible matching
const HEADER_ALIASES = {
  "Acceptance Date (PAC/FAC)": [
    "acceptance date (pac/fac)",
    "acceptance date",
    "pac/fac",
    "pac approved date",
    "fac approved date",
    "approved date"
  ],
  "PO No.": ["po no.", "po no", "po number", "purchase order no"],
  "PO Item No.": [
    "po item no.",
    "po item no",
    "po item number",
    "po item no. (ariba)",
    "po item no (ariba)"
  ],
  "PO Service Item No.": [
    "po service item no.",
    "po service item no",
    "service item no",
    "po service item no. sap item no.",
    "po service item no sap item no",
    "sap item no."
  ],
  "Material Description": ["material description", "mat description", "material desc"],
  "PO Service Short Text": ["po service short text", "service short text", "service text"],
  "Material Code": ["material code", "mat code", "material no", "mat no"],
  "Installed Qty": ["installed qty", "installed quantity"],
  "Asset Tag Number": ["asset tag number", "asset tag", "asset tag no"],
  "GR Mat. Doc.": ["gr mat. doc.", "gr mat doc", "gr document", "gr doc", "material document"],
  "WBS Element": ["wbs element", "wbs"],
  "PO Site Name": ["po site name", "site name"],
  "PO PLA ID": ["po pla id", "pla id"],
  "Installed Site Name": ["installed site name", "installed site"],
  "Installed PLA ID": ["installed pla id"],
  "Serial no. (ManufSerialNo.)": ["serial no. (manufserialno.)", "serial no.", "serial number", "manufserialno"],
  "PO Quantity": ["po quantity", "po qty"],
  "UOM": ["uom", "unit of measure", "unit"],
  "PO Unit Price": ["po unit price", "unit price"],
  "Sub Total": ["sub total", "subtotal"],
  "Amount To Billed": ["amount to billed", "amount to be billed", "amount billed"],
  "Currency": ["currency", "curr"],
  "Payment Milestone": ["payment milestone", "milestone"]
};

// Summary/footer keywords to exclude
const SUMMARY_KEYWORDS = [
  "grand total",
  "sub-total",
  "subtotal",
  "p.o amount",
  "po amount",
  "final amount",
  "amount due",
  "prepared by",
  "checked by",
  "approved by",
  "noted by",
  "signature",
  "printed name",
  "remarks:"
];

// Menu actions
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("GR Automation")
    .addItem("Start Automatic (Every 1 min)", "setupAutomaticEvery1Min")
    .addItem("Stop Automatic", "stopAutomatic")
    .addSeparator()
    .addItem("Run Once Now", "consolidateGRTemplateData")
    .addItem("Debug: Test Single File", "debugTestSingleFile")
    .addSeparator()
    .addItem("Requeue No-Data Files", "requeueNoDataFiles")
    .addItem("Cleanup Temp Files", "cleanupTempFiles")
    .addToUi();
}

// Trigger setup and stop
function setupAutomaticEvery1Min() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert("Open the target spreadsheet first, then run setup again.");
    return;
  }

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "consolidateGRTemplateData") {
      ScriptApp.deleteTrigger(t);
    }
  });

  PropertiesService.getScriptProperties().setProperty("BOUND_SPREADSHEET_ID", ss.getId());

  ScriptApp.newTrigger("consolidateGRTemplateData")
    .timeBased()
    .everyMinutes(CONFIG.triggerMinutes)
    .create();

  ss.toast("Trigger started. First batch is running now.", "GR Automation", 8);
  consolidateGRTemplateData();
}

function stopAutomatic() {
  let count = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "consolidateGRTemplateData") {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });

  Logger.log("Removed trigger count: " + count);
  const ss = getSpreadsheet_();
  if (ss) ss.toast("Stopped. Removed " + count + " trigger(s).", "GR Automation", 8);
}

// Main consolidation run
function consolidateGRTemplateData() {
  const startTime = Date.now();
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    Logger.log("Another run is already in progress.");
    return;
  }

  try {
    const ss = getSpreadsheet_();
    if (!ss) {
      Logger.log("Spreadsheet not found. Run setupAutomaticEvery1Min first.");
      return;
    }

    ensureSheets_(ss);

    const sourceFolder = findFolder_(CONFIG.sourceFolderName);
    if (!sourceFolder) {
      Logger.log("Source folder not found: " + CONFIG.sourceFolderName);
      return;
    }

    const processedMap = loadProcessedMap_(ss);
    const failedAttemptsMap = loadFailedAttemptsMap_(ss);
    const candidates = listCandidateFilesByYear_(sourceFolder, processedMap, failedAttemptsMap);

    Logger.log("Candidates - 2025: " + candidates["2025"].length + ", 2026: " + candidates["2026"].length);

    if (candidates["2025"].length === 0 && candidates["2026"].length === 0) {
      Logger.log("No new files to process. Trigger will check again next minute.");
      return;
    }

    const tempFolder = getOrCreateTempFolder_();
    const toProcess = buildProcessList_(candidates);

    let processedCount = 0;
    let totalRowsAdded = 0;

    for (let i = 0; i < toProcess.length; i++) {
      if (Date.now() - startTime > CONFIG.maxRuntimeMs) {
        Logger.log("Stopped early due to runtime limit.");
        break;
      }

      const fileInfo = toProcess[i];
      const result = processSingleFile_(ss, fileInfo, tempFolder);
      logToTracker_(ss, fileInfo, result);

      processedCount++;
      totalRowsAdded += result.rowsAdded;
    }

    Logger.log("Batch done. Files: " + processedCount + ", Rows: " + totalRowsAdded);
  } catch (e) {
    Logger.log("Fatal error: " + e.message + "\n" + e.stack);
  } finally {
    lock.releaseLock();
  }
}

// Spreadsheet helpers
function getSpreadsheet_() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  const id = PropertiesService.getScriptProperties().getProperty("BOUND_SPREADSHEET_ID");
  if (!id) return null;

  try {
    return SpreadsheetApp.openById(id);
  } catch (e2) {
    return null;
  }
}

function ensureSheets_(ss) {
  [CONFIG.outputSheets["2025"], CONFIG.outputSheets["2026"], CONFIG.trackerSheetName].forEach(function(name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });

  ["2025", "2026"].forEach(function(year) {
    const sh = ss.getSheetByName(CONFIG.outputSheets[year]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]));
    }
  });

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (tracker.getLastRow() === 0) {
    tracker.appendRow(["Timestamp", "File Name", "Year", "Rows Added", "Status", "File Link"]);
  }
}

// Folder and file discovery
function findFolder_(name) {
  const iter = DriveApp.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();

  const all = DriveApp.getFolders();
  while (all.hasNext()) {
    const f = all.next();
    if (f.getName() === name) return f;
  }
  return null;
}

function getOrCreateTempFolder_() {
  const iter = DriveApp.getFoldersByName(CONFIG.tempFolderName);
  if (iter.hasNext()) return iter.next();
  return DriveApp.createFolder(CONFIG.tempFolderName);
}

function listCandidateFilesByYear_(sourceFolder, processedMap, failedAttemptsMap) {
  const candidates = { "2025": [], "2026": [] };
  const files = sourceFolder.getFiles();

  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    const lower = name.toLowerCase();

    if (processedMap[name]) continue;
    if ((failedAttemptsMap[name] || 0) >= CONFIG.maxFailedAttemptsPerFile) continue;
    if (lower.indexOf(".xlsx") === -1 && lower.indexOf(".xls") === -1) continue;

    let year = null;
    if (name.indexOf("2025") !== -1) year = "2025";
    else if (name.indexOf("2026") !== -1) year = "2026";
    if (!year) continue;

    candidates[year].push({
      id: f.getId(),
      name: name,
      year: year,
      url: f.getUrl()
    });
  }

  return candidates;
}

function buildProcessList_(candidates) {
  const y25 = candidates["2025"].slice(0, CONFIG.maxFilesPerRunPerYear);
  const y26 = candidates["2026"].slice(0, CONFIG.maxFilesPerRunPerYear);

  const out = [];
  const maxLen = Math.max(y25.length, y26.length);

  for (let i = 0; i < maxLen && out.length < CONFIG.maxFilesPerRunTotal; i++) {
    if (i < y25.length) out.push(y25[i]);
    if (out.length < CONFIG.maxFilesPerRunTotal && i < y26.length) out.push(y26[i]);
  }

  return out;
}

// Tracker state maps
function loadProcessedMap_(ss) {
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return {};

  const map = {};
  const data = tracker.getRange(2, 1, tracker.getLastRow() - 1, 5).getValues();

  data.forEach(function(row) {
    const fileName = String(row[1] || "").trim();
    const status = String(row[4] || "").trim().toLowerCase();
    if (fileName && (status === "ok" || status === "done")) map[fileName] = true;
  });

  return map;
}

function loadFailedAttemptsMap_(ss) {
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return {};

  const map = {};
  const data = tracker.getRange(2, 1, tracker.getLastRow() - 1, 5).getValues();

  data.forEach(function(row) {
    const fileName = String(row[1] || "").trim();
    const status = String(row[4] || "").trim().toLowerCase();
    if (!fileName) return;

    if (status === "done" || status === "ok") {
      map[fileName] = 0;
      return;
    }

    // Count all non-success statuses toward the retry cap
    // (includes "no data extracted", "error:", "needs manual check –")
    if (
      status.indexOf("no data extracted") === 0 ||
      status.indexOf("error:") === 0 ||
      status.indexOf("needs manual check") === 0
    ) {
      map[fileName] = (map[fileName] || 0) + 1;
    }
  });

  return map;
}

// File conversion and single-file processing
function processSingleFile_(ss, fileInfo, tempFolder) {
  let tempFileId = null;

  try {
    tempFileId = convertExcelToTempSheet_(fileInfo, tempFolder);

    const tempSS = openSpreadsheetWithRetry_(
      tempFileId,
      CONFIG.openRetryAttempts,
      CONFIG.openRetryDelayMs
    );

    const rows = parseConvertedSheet_(tempSS, fileInfo.name);

    if (rows.length === 0) {
      return { rowsAdded: 0, status: "No data extracted" };
    }

    const outputSheet = ss.getSheetByName(CONFIG.outputSheets[fileInfo.year]);
    appendRowsWithSourceLink_(outputSheet, rows, fileInfo);

    return { rowsAdded: rows.length, status: CONFIG.doneStatusText };
  } catch (e) {
    const msg = e.message || "";
    // Flag conversion failures clearly for audit/manual review,
    // but still count toward retry cap (not permanently skipped)
    if (msg.toLowerCase().indexOf("conversion of the uploaded content") !== -1) {
      return { rowsAdded: 0, status: "Needs manual check – unsupported format" };
    }
    return { rowsAdded: 0, status: "Error: " + msg };
  } finally {
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); } catch (e2) {}
    }
  }
}

function convertExcelToTempSheet_(fileInfo, tempFolder) {
  const body = {
    title: "_TEMP_" + fileInfo.name,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [{ id: tempFolder.getId() }]
  };

  try {
    return Drive.Files.copy(body, fileInfo.id, { convert: true, supportsAllDrives: true }).id;
  } catch (e) {
    return Drive.Files.copy(body, fileInfo.id, { convert: true }).id;
  }
}

function openSpreadsheetWithRetry_(fileId, attempts, delayMs) {
  let lastErr = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      return SpreadsheetApp.openById(fileId);
    } catch (e) {
      lastErr = e;
      Utilities.sleep(delayMs * i);
    }
  }

  throw new Error("Cannot open converted sheet after retries. " + (lastErr ? lastErr.message : ""));
}

// Sheet parsing and header mapping
function parseConvertedSheet_(tempSS, fileName) {
  const sheets = tempSS.getSheets();
  const preferredCandidates = [];
  const fallbackCandidates = [];

  for (let i = 0; i < sheets.length; i++) {
    const candidate = evaluateSheetCandidate_(sheets[i]);
    if (!candidate) continue;

    if (candidate.preferred) preferredCandidates.push(candidate);
    else fallbackCandidates.push(candidate);
  }

  const bestPreferred = pickBestCandidate_(preferredCandidates);
  const bestFallback = pickBestCandidate_(fallbackCandidates);
  const best = bestPreferred || bestFallback;

  if (!best || best.rows.length === 0) {
    Logger.log("No extractable rows for " + fileName);
    return [];
  }

  Logger.log("Selected '" + best.sheetName + "' with " + best.rows.length + " row(s).");
  return best.rows;
}

function evaluateSheetCandidate_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 3) return null;

  let vals, disp;
  try {
    vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
    disp = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  } catch (e) {
    Logger.log('Skipping sheet "' + sh.getName() + '" (' + e.message + ')');
    return null;
  }

  const h = detectHeaderRowAndMap_(vals);
  if (h.headerRowIndex < 0 || h.matchedCount < CONFIG.minHeaderMatches) return null;

  const hasPoNo = h.columnMap["PO No."] !== undefined;
  const keyHeaderCount = countMappedHeaders_(h.columnMap, [
    "PO No.",
    "Material Description",
    "GR Mat. Doc.",
    "Amount To Billed",
    "Payment Milestone"
  ]);

  if (!hasPoNo || keyHeaderCount < 3) {
    Logger.log("Skipping non-GR-like sheet '" + sh.getName() + "' (missing key headers).");
    return null;
  }

  let rows = extractRowsWithFilter_(vals, disp, h.columnMap, h.headerRowIndex, true);
  if (rows.length === 0) rows = extractRowsWithFilter_(vals, disp, h.columnMap, h.headerRowIndex, false);
  if (rows.length === 0) rows = extractRowsByAnchors_(vals, disp, h.columnMap, h.headerRowIndex);

  Logger.log("Sheet '" + sh.getName() + "' -> headers: " + h.matchedCount + ", rows: " + rows.length);

  if (rows.length === 0) return null;

  return {
    rows: rows,
    h: h,
    sheetName: sh.getName(),
    preferred: isLikelyGRTemplateSheet_(sh.getName()),
    score: (h.matchedCount * 100) + Math.min(rows.length, 50)
  };
}

function pickBestCandidate_(candidates) {
  if (!candidates || candidates.length === 0) return null;

  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!best || c.score > best.score) best = c;
  }
  return best;
}

function isLikelyGRTemplateSheet_(sheetName) {
  const name = normalizeText_(sheetName);
  return (
    name === "gr template" ||
    name.indexOf("gr template") !== -1 ||
    name.indexOf("gr_template") !== -1 ||
    name.indexOf("gr-template") !== -1 ||
    name.indexOf("grtemplate") !== -1
  );
}

function countMappedHeaders_(columnMap, headers) {
  let count = 0;
  for (let i = 0; i < headers.length; i++) {
    if (columnMap[headers[i]] !== undefined) count++;
  }
  return count;
}

function normalizeText_(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectHeaderRowAndMap_(values) {
  let bestRow = -1;
  let bestCount = 0;
  let bestMap = {};
  const scanRows = Math.min(CONFIG.headerScanMaxRows, values.length);

  for (let r = 0; r < scanRows; r++) {
    const result = createColumnMapping_(values[r]);
    if (result.count > bestCount) {
      bestCount = result.count;
      bestRow = r;
      bestMap = result.map;
    }
    if (result.count >= COLUMN_MAPPING.length) break;
  }

  return { headerRowIndex: bestRow, matchedCount: bestCount, columnMap: bestMap };
}

function createColumnMapping_(headerRow) {
  const map = {};
  let count = 0;

  COLUMN_MAPPING.forEach(function(canonical) {
    const aliases = HEADER_ALIASES[canonical] || [canonical];
    const normAliases = aliases.map(function(a) { return normalizeText_(a); });

    for (let c = 0; c < headerRow.length; c++) {
      const cellNorm = normalizeText_(headerRow[c]);
      if (!cellNorm) continue;

      for (let a = 0; a < normAliases.length; a++) {
        const alias = normAliases[a];
        if (cellNorm === alias || cellNorm.indexOf(alias) !== -1 || alias.indexOf(cellNorm) !== -1) {
          map[canonical] = c;
          count++;
          return;
        }
      }
    }
  });

  return { count: count, map: map };
}

// Row validation and extraction
function isCellPresent_(rawValue, displayValue) {
  if (String(displayValue || "").replace(/\u00a0/g, " ").trim() !== "") return true;
  return String(rawValue || "").replace(/\u00a0/g, " ").trim() !== "";
}

function isSummaryOrFooterRow_(rawRow, dispRow) {
  const disp = dispRow || [];

  for (let i = 0; i < rawRow.length; i++) {
    const raw = String(rawRow[i] || "").replace(/\u00a0/g, " ").trim();
    const d = String(disp[i] || "").replace(/\u00a0/g, " ").trim();
    const cell = normalizeText_(d !== "" ? d : raw);
    if (!cell) continue;

    if (cell === "total" || cell === "total:") return true;

    if (i < 8) {
      for (let k = 0; k < SUMMARY_KEYWORDS.length; k++) {
        if (cell.indexOf(SUMMARY_KEYWORDS[k]) !== -1) return true;
      }
    }
  }

  return false;
}

function isLikelyMergedArtifactRow_(rawRow, dispRow) {
  const disp = dispRow || [];
  const freq = {};
  let nonEmpty = 0;

  for (let i = 0; i < rawRow.length; i++) {
    const v = String(disp[i] !== undefined && disp[i] !== "" ? disp[i] : rawRow[i] || "")
      .replace(/\u00a0/g, " ")
      .trim();
    if (!v) continue;

    nonEmpty++;

    const low = v.toLowerCase();
    const isNumericLike = /^[0-9.,%-]+$/.test(v);
    const isShort = v.length <= 2;
    const isCommonToken = low === "n/a" || low === "na" || low === "php" || low === "usd" || low === "lot" || low === "pc";

    if (isNumericLike || isShort || isCommonToken) continue;
    freq[v] = (freq[v] || 0) + 1;
  }

  if (nonEmpty < 8) return false;

  let maxFreq = 0;
  for (var k in freq) {
    if (freq[k] > maxFreq) maxFreq = freq[k];
  }

  return maxFreq >= 6;
}

function extractRowsWithFilter_(values, display, columnMap, headerRowIndex, strict) {
  const rows = [];
  const checkOutputAnchors = columnMap["PO No."] !== undefined || columnMap["Material Description"] !== undefined;

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const rawRow = values[r];
    const dispRow = display[r] || [];

    if (isEmptyRow_(rawRow, dispRow)) continue;
    if (isRepeatedHeaderRow_(rawRow)) continue;
    if (isSummaryOrFooterRow_(rawRow, dispRow)) continue;
    if (isLikelyMergedArtifactRow_(rawRow, dispRow)) continue;
    if (strict && !isLikelyDataRow_(rawRow, dispRow)) continue;
    if (!strict && !isNonTrivialRow_(rawRow, dispRow)) continue;

    const outRow = COLUMN_MAPPING.map(function(col) {
      const idx = columnMap[col];
      if (idx === undefined) return "";
      return formatCellByHeader_(col, rawRow[idx], dispRow[idx]);
    });

    if (checkOutputAnchors) {
      const poVal = String(outRow[1] || "").trim();
      const matVal = String(outRow[4] || "").trim();
      const grDocVal = String(outRow[9] || "").trim();
      const amtVal = String(outRow[20] || "").trim();

      if (!poVal && !matVal && !grDocVal) continue;
      if (poVal && !matVal && !grDocVal && !amtVal) continue;
    }

    rows.push(outRow);
  }

  return rows;
}

function extractRowsByAnchors_(values, display, columnMap, headerRowIndex) {
  const rows = [];
  const anchors = ["PO No.", "Material Description", "Amount To Billed", "Payment Milestone", "GR Mat. Doc."];

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const rawRow = values[r];
    const dispRow = display[r] || [];

    if (isEmptyRow_(rawRow, dispRow)) continue;
    if (isRepeatedHeaderRow_(rawRow)) continue;
    if (isSummaryOrFooterRow_(rawRow, dispRow)) continue;
    if (isLikelyMergedArtifactRow_(rawRow, dispRow)) continue;

    let hasAnchor = false;
    for (let i = 0; i < anchors.length; i++) {
      const idx = columnMap[anchors[i]];
      if (idx === undefined) continue;
      if (isCellPresent_(rawRow[idx], dispRow[idx])) {
        hasAnchor = true;
        break;
      }
    }
    if (!hasAnchor) continue;

    const outRow = COLUMN_MAPPING.map(function(col) {
      const idx = columnMap[col];
      if (idx === undefined) return "";
      return formatCellByHeader_(col, rawRow[idx], dispRow[idx]);
    });

    if (columnMap["PO No."] !== undefined || columnMap["Material Description"] !== undefined) {
      const poVal = String(outRow[1] || "").trim();
      const matVal = String(outRow[4] || "").trim();
      const grDocVal = String(outRow[9] || "").trim();
      const amtVal = String(outRow[20] || "").trim();

      if (!poVal && !matVal && !grDocVal) continue;
      if (poVal && !matVal && !grDocVal && !amtVal) continue;
    }

    rows.push(outRow);
  }

  return rows;
}

function isEmptyRow_(rawRow, dispRow) {
  const disp = dispRow || [];
  for (let i = 0; i < rawRow.length; i++) {
    if (isCellPresent_(rawRow[i], disp[i])) return false;
  }
  return true;
}

function isRepeatedHeaderRow_(row) {
  const first = normalizeText_(row[0] || "");
  return first === "po tagging" || first === "po no." || first === "po no";
}

function isLikelyDataRow_(rawRow, dispRow) {
  const disp = dispRow || [];
  let count = 0;
  for (let i = 0; i < rawRow.length; i++) {
    if (isCellPresent_(rawRow[i], disp[i])) count++;
  }
  return count >= 3;
}

function isNonTrivialRow_(rawRow, dispRow) {
  const disp = dispRow || [];
  let count = 0;
  for (let i = 0; i < rawRow.length; i++) {
    if (isCellPresent_(rawRow[i], disp[i])) count++;
  }
  return count >= 2;
}

// Cell formatting and sheet write
function formatCellByHeader_(header, rawValue, displayValue) {
  if (header === "Payment Milestone") {
    if (typeof rawValue === "number" && rawValue > 0 && rawValue <= 1) {
      return Math.round(rawValue * 100) + "%";
    }
    if (String(displayValue || "").indexOf("%") !== -1) return displayValue;
    return displayValue || rawValue || "";
  }

  if (header === "Acceptance Date (PAC/FAC)" && rawValue instanceof Date) {
    return displayValue || Utilities.formatDate(rawValue, Session.getScriptTimeZone(), "M/d/yyyy");
  }

  const d = String(displayValue || "").trim();
  return d !== "" ? displayValue : rawValue;
}

function appendRowsWithSourceLink_(sheet, rows, fileInfo) {
  if (rows.length === 0) return;

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, COLUMN_MAPPING.length).setValues(rows);

  const linkCol = COLUMN_MAPPING.length + 1;
  sheet.getRange(startRow, linkCol).setFormula(
    '=HYPERLINK("' + fileInfo.url + '","' + fileInfo.name.replace(/"/g, '""') + '")'
  );
}

// Process log and maintenance
function logToTracker_(ss, fileInfo, result) {
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker) return;

  tracker.appendRow([
    new Date(),
    fileInfo.name,
    fileInfo.year,
    result.rowsAdded,
    result.status,
    '=HYPERLINK("' + fileInfo.url + '","' + fileInfo.name.replace(/"/g, '""') + '")'
  ]);
}

function requeueNoDataFiles() {
  const ss = getSpreadsheet_();
  if (!ss) return;

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return;

  const data = tracker.getRange(2, 1, tracker.getLastRow() - 1, 5).getValues();
  let removed = 0;

  for (let i = data.length - 1; i >= 0; i--) {
    const status = String(data[i][4] || "").trim().toLowerCase();
    if (status !== "ok" && status !== "done") {
      tracker.deleteRow(i + 2);
      removed++;
    }
  }

  Logger.log("Removed " + removed + " non-success entries.");
  ss.toast("Requeued " + removed + " file(s) for retry.", "GR Automation", 8);
}

function cleanupTempFiles() {
  const iter = DriveApp.getFoldersByName(CONFIG.tempFolderName);
  if (!iter.hasNext()) return;

  const folder = iter.next();
  const files = folder.getFiles();
  let count = 0;

  while (files.hasNext()) {
    files.next().setTrashed(true);
    count++;
  }

  Logger.log("Temp files cleaned: " + count);
  const ss = getSpreadsheet_();
  if (ss) ss.toast("Cleaned " + count + " temp file(s).", "GR Automation", 8);
}

// Debug tools
function debugTestSingleFile() {
  const sourceFolder = findFolder_(CONFIG.sourceFolderName);
  if (!sourceFolder) {
    SpreadsheetApp.getUi().alert("Source folder not found.");
    return;
  }

  const files = sourceFolder.getFiles();
  let testFile = null;

  while (files.hasNext()) {
    const f = files.next();
    const n = f.getName().toLowerCase();
    if ((n.indexOf("2025") !== -1 || n.indexOf("2026") !== -1) &&
        (n.indexOf(".xlsx") !== -1 || n.indexOf(".xls") !== -1)) {
      testFile = f;
      break;
    }
  }

  if (!testFile) {
    SpreadsheetApp.getUi().alert("No 2025/2026 Excel file found.");
    return;
  }

  let tempFileId = null;
  try {
    const tempFolder = getOrCreateTempFolder_();
    tempFileId = convertExcelToTempSheet_({ id: testFile.getId(), name: testFile.getName() }, tempFolder);
    const tempSS = openSpreadsheetWithRetry_(tempFileId, CONFIG.openRetryAttempts, CONFIG.openRetryDelayMs);
    const rows = parseConvertedSheet_(tempSS, testFile.getName());

    SpreadsheetApp.getUi().alert(
      "Debug Result",
      "File: " + testFile.getName() + "\nRows extracted: " + rows.length + "\nCheck View > Logs for per-tab details.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert("Debug error: " + e.message);
  } finally {
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); } catch (e2) {}
    }
  }
}