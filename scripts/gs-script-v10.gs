// GR Template Consolidation

// Config
const CONFIG = {
  sourceFolderName: "GR template with Matdoc Reference: (File responses)",
  tempFolderName: "_GR_AUTOMATION_TEMP",
  trackerSheetName: "Processed Files Log",
  outputSheets: { 2025: "GR Posted 2025", 2026: "GR Posted 2026" },
  sourceHeaderName: "Source File",
  lookupSheetName: "PLA Lookup",
  enrichmentHeaders: [
    "Regional Area",
    "Cleaned Site Name",
    "Territory",
    "Amount To Billed (USD)",
  ],
  usdConversionRate: 57,
  triggerMinutes: 1,
  maxFilesPerRunTotal: 16,
  maxFilesPerRunPerYear: 8,
  maxRuntimeMs: 260000,
  headerScanMaxRows: 80,
  openRetryAttempts: 8,
  openRetryDelayMs: 1500,
  minHeaderMatches: 3,
  maxFailedAttemptsPerFile: 5,
  doneStatusText: "Done",
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
  "Payment Milestone",
];

// Header aliases for flexible matching
const HEADER_ALIASES = {
  "Acceptance Date (PAC/FAC)": [
    "acceptance date (pac/fac)",
    "acceptance date",
    "pac/fac",
    "pac approved date",
    "fac approved date",
    "approved date",
  ],
  "PO No.": ["po no.", "po no", "po number", "purchase order no"],
  "PO Item No.": [
    "po item no.",
    "po item no",
    "po item number",
    "po item no. (ariba)",
    "po item no (ariba)",
  ],
  "PO Service Item No.": [
    "po service item no.",
    "po service item no",
    "service item no",
    "po service item no. sap item no.",
    "po service item no sap item no",
    "sap item no.",
  ],
  "Material Description": [
    "material description",
    "mat description",
    "material desc",
  ],
  "PO Service Short Text": [
    "po service short text",
    "service short text",
    "service text",
  ],
  "Material Code": ["material code", "mat code", "material no", "mat no"],
  "Installed Qty": ["installed qty", "installed quantity"],
  "Asset Tag Number": ["asset tag number", "asset tag", "asset tag no"],
  "GR Mat. Doc.": [
    "gr mat. doc.",
    "gr mat doc",
    "gr document",
    "gr doc",
    "material document",
  ],
  "WBS Element": ["wbs element", "wbs"],
  "PO Site Name": ["po site name", "site name"],
  "PO PLA ID": ["po pla id", "pla id"],
  "Installed Site Name": ["installed site name", "installed site"],
  "Installed PLA ID": ["installed pla id"],
  "Serial no. (ManufSerialNo.)": [
    "serial no. (manufserialno.)",
    "serial no.",
    "serial number",
    "manufserialno",
  ],
  "PO Quantity": ["po quantity", "po qty"],
  UOM: ["uom", "unit of measure", "unit"],
  "PO Unit Price": ["po unit price", "unit price"],
  "Sub Total": ["sub total", "subtotal"],
  "Amount To Billed": [
    "amount to billed",
    "amount to be billed",
    "amount billed",
    "amount to gr",
    "amount to g/r",
  ],
  Currency: ["currency", "curr"],
  "Payment Milestone": ["payment milestone", "milestone"],
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
  "remarks:",
];

// Menu actions
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("GR Automation")
    .addItem("Start Auto Processing (Every 1 min)", "setupAutomaticEvery1Min")
    .addItem("Stop Auto Processing", "stopAutomatic")
    .addSeparator()
    .addItem("Process New Files Now", "consolidateGRTemplateData")
    .addItem("Test One Source File (Debug)", "debugTestSingleFile")
    .addSeparator()
    .addItem("Check Lookup & Output Setup", "debugMainSiteSetup")
    .addItem("Fill Lookup Fields (Existing Rows)", "repairMainSiteColumnsNow")
    .addItem(
      "Recompute USD Column (Existing Rows)",
      "convertAmountToUsdForAllData",
    )
    .addSeparator()
    .addItem("Retry Failed Files", "requeueNoDataFiles")
    .addItem("Delete Temporary Converted Files", "cleanupTempFiles")
    .addToUi();
}

// Trigger setup and stop
function setupAutomaticEvery1Min() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert(
      "Open the target spreadsheet first, then run setup again.",
    );
    return;
  }

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "consolidateGRTemplateData") {
      ScriptApp.deleteTrigger(t);
    }
  });

  PropertiesService.getScriptProperties().setProperty(
    "BOUND_SPREADSHEET_ID",
    ss.getId(),
  );

  ScriptApp.newTrigger("consolidateGRTemplateData")
    .timeBased()
    .everyMinutes(CONFIG.triggerMinutes)
    .create();

  ss.toast("Trigger started. First batch is running now.", "GR Automation", 8);
  consolidateGRTemplateData();
}

function stopAutomatic() {
  let count = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "consolidateGRTemplateData") {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });

  Logger.log("Removed trigger count: " + count);
  const ss = getSpreadsheet_();
  if (ss)
    ss.toast("Stopped. Removed " + count + " trigger(s).", "GR Automation", 8);
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
    const candidates = listCandidateFilesByYear_(
      sourceFolder,
      processedMap,
      failedAttemptsMap,
    );

    Logger.log(
      "Candidates - 2025: " +
        candidates["2025"].length +
        ", 2026: " +
        candidates["2026"].length,
    );

    if (candidates["2025"].length === 0 && candidates["2026"].length === 0) {
      Logger.log(
        "No new files to process. Trigger will check again next minute.",
      );
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

    Logger.log(
      "Batch done. Files: " + processedCount + ", Rows: " + totalRowsAdded,
    );
  } catch (e) {
    Logger.log("Fatal error: " + e.message + "\n" + e.stack);
  } finally {
    lock.releaseLock();
  }
}

// Spreadsheet helpers
function normalizeLookupKey_(v) {
  return String(v || "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .trim();
}

function normalizePlaLookupKey_(v) {
  var s = String(v || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
  if (!s) return "";
  if (s.indexOf("-") !== -1) s = s.split("-")[0];
  return s;
}

function isManagedServices_(materialDesc, serviceShortText) {
  var a = String(materialDesc || "").toLowerCase();
  var b = String(serviceShortText || "").toLowerCase();
  return (
    a.indexOf("managed services") !== -1 || b.indexOf("managed services") !== -1
  );
}

function isPhpCurrency_(currencyValue) {
  var c = String(currencyValue || "")
    .toLowerCase()
    .trim();
  return (
    c === "php" ||
    c === "peso" ||
    c === "pesos" ||
    c === "₱" ||
    c === "philippine peso" ||
    c === "philippine pesos"
  );
}

function isUsdCurrency_(currencyValue) {
  var c = String(currencyValue || "")
    .toLowerCase()
    .trim();
  return c === "usd" || c === "us dollar" || c === "us dollars" || c === "$";
}

function isEurCurrency_(currencyValue) {
  var c = String(currencyValue || "")
    .toLowerCase()
    .trim();
  return c === "eur" || c === "euro" || c === "euros" || c === "€";
}

function parseAmount_(v) {
  if (typeof v === "number") return v;
  var s = String(v || "").trim();
  if (!s) return NaN;

  var isNegative = false;
  if (s.charAt(0) === "(" && s.charAt(s.length - 1) === ")") {
    isNegative = true;
    s = s.substring(1, s.length - 1);
  }

  // Reject non-monetary tokens
  var normalized = s.toLowerCase();
  normalized = normalized
    .replace(/us\s*dollars?/g, "")
    .replace(/philippine\s*pesos?/g, "")
    .replace(/pesos?/g, "")
    .replace(/euros?/g, "")
    .replace(/usd/g, "")
    .replace(/php/g, "")
    .replace(/eur/g, "")
    .replace(/[\s,.$₱€()\-]/g, "");

  if (/[^0-9]/.test(normalized)) return NaN;

  s = s
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/\$/g, "")
    .replace(/₱/g, "")
    .replace(/€/g, "")
    .replace(/usd/gi, "")
    .replace(/php/gi, "")
    .replace(/eur/gi, "")
    .replace(/pesos?/gi, "")
    .replace(/euros?/gi, "")
    .replace(/us\s*dollars?/gi, "")
    .replace(/philippine\s*pesos?/gi, "");

  s = s.replace(/[^0-9.-]/g, "");

  var n = Number(s);
  if (isNaN(n)) return NaN;
  return isNegative ? -n : n;
}

function toUsdIfPhp_(amountValue, currencyValue) {
  var amount = parseAmount_(amountValue);
  if (isNaN(amount)) return "";

  var cur = String(currencyValue || "")
    .toLowerCase()
    .trim();
  var amtText = String(amountValue || "").toLowerCase();

  if (
    isUsdCurrency_(cur) ||
    amtText.indexOf("$") !== -1 ||
    amtText.indexOf("usd") !== -1
  ) {
    return amount;
  }

  if (
    isPhpCurrency_(cur) ||
    isEurCurrency_(cur) ||
    amtText.indexOf("₱") !== -1 ||
    amtText.indexOf("php") !== -1 ||
    amtText.indexOf("peso") !== -1 ||
    amtText.indexOf("€") !== -1 ||
    amtText.indexOf("eur") !== -1 ||
    amtText.indexOf("euro") !== -1
  ) {
    return amount / CONFIG.usdConversionRate;
  }

  return "";
}

function loadPlaLookupMap_(ss) {
  const sh = ss.getSheetByName(CONFIG.lookupSheetName);
  if (!sh || sh.getLastRow() < 2) return {};

  const headers = sh
    .getRange(1, 1, 1, sh.getLastColumn())
    .getDisplayValues()[0];
  const colPla = headers.indexOf("PLA ID") + 1;
  const colReg = headers.indexOf("Regional Area") + 1;
  const colSite = headers.indexOf("SITE NAME") + 1;
  const colTerr = headers.indexOf("Territory") + 1;

  if (colPla < 1 || colReg < 1 || colSite < 1 || colTerr < 1) {
    throw new Error(
      "PLA Lookup headers missing. Required: PLA ID, Regional Area, SITE NAME, Territory",
    );
  }

  const data = sh
    .getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn())
    .getDisplayValues();
  const map = {};

  data.forEach(function (row) {
    const raw = row[colPla - 1];
    const keyFull = normalizeLookupKey_(raw);
    const keyBase = normalizePlaLookupKey_(raw);
    if (!keyFull && !keyBase) return;

    var obj = {
      regionalArea: String(row[colReg - 1] || "").trim(),
      cleanedSiteName: String(row[colSite - 1] || "").trim(),
      territory: String(row[colTerr - 1] || "").trim(),
    };

    if (keyFull) map[keyFull] = obj;
    if (keyBase) map[keyBase] = obj;
  });

  return map;
}

function getSpreadsheet_() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  const id = PropertiesService.getScriptProperties().getProperty(
    "BOUND_SPREADSHEET_ID",
  );
  if (!id) return null;

  try {
    return SpreadsheetApp.openById(id);
  } catch (e2) {
    return null;
  }
}

function ensureSheets_(ss) {
  [
    CONFIG.outputSheets["2025"],
    CONFIG.outputSheets["2026"],
    CONFIG.trackerSheetName,
    CONFIG.lookupSheetName,
  ].forEach(function (name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });

  ["2025", "2026"].forEach(function (year) {
    const sh = ss.getSheetByName(CONFIG.outputSheets[year]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(
        COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
          CONFIG.enrichmentHeaders,
        ),
      );
    } else {
      ensureEnrichmentColumns_(sh);
    }
  });

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (tracker.getLastRow() === 0) {
    tracker.appendRow([
      "Timestamp",
      "File Name",
      "Year",
      "Rows Added",
      "Status",
      "File Link",
    ]);
  }

  const lookup = ss.getSheetByName(CONFIG.lookupSheetName);
  if (lookup.getLastRow() === 0) {
    lookup.appendRow(["PLA ID", "Regional Area", "SITE NAME", "Territory"]);
  }
}

function getColumnIndexByHeader_(sheet, headerName) {
  if (!sheet || sheet.getLastRow() < 1) return -1;
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (
      String(headers[i] || "")
        .trim()
        .toLowerCase() ===
      String(headerName || "")
        .trim()
        .toLowerCase()
    ) {
      return i + 1;
    }
  }
  return -1;
}

function ensureEnrichmentColumns_(sheet) {
  const sourceCol = getColumnIndexByHeader_(sheet, CONFIG.sourceHeaderName);
  const baseCol = sourceCol > 0 ? sourceCol + 1 : sheet.getLastColumn() + 1;

  for (var i = 0; i < CONFIG.enrichmentHeaders.length; i++) {
    sheet.getRange(1, baseCol + i).setValue(CONFIG.enrichmentHeaders[i]);
  }

  return {
    regionalAreaCol: baseCol,
    cleanedSiteNameCol: baseCol + 1,
    territoryCol: baseCol + 2,
    usdCol: baseCol + 3,
  };
}

function isMissingOrNaTerritory_(v) {
  var t = String(v || "")
    .trim()
    .toUpperCase();
  return t === "" || t === "N/A" || t === "NA";
}

function isOpexWbs_(wbsValue) {
  var w = String(wbsValue || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
  if (!w) return false;
  if (w.indexOf("I-NT") === 0) return false; // explicitly exclude I-NT...
  return w.indexOf("NT") === 0; // NT..., NT9-C, NT7-D9, etc.
}

function fillCurrencyFromHints_(outRow, rowFormats, columnMap) {
  var cur = String(outRow[21] || "").trim();
  if (cur) return;

  var textHint = [outRow[18], outRow[19], outRow[20]]
    .map(function (v) {
      return String(v || "").toLowerCase();
    })
    .join(" ");

  if (textHint.indexOf("$") !== -1 || textHint.indexOf("usd") !== -1) {
    outRow[21] = "USD";
    return;
  }
  if (
    textHint.indexOf("€") !== -1 ||
    textHint.indexOf("eur") !== -1 ||
    textHint.indexOf("euro") !== -1
  ) {
    outRow[21] = "EUR";
    return;
  }
  if (
    textHint.indexOf("₱") !== -1 ||
    textHint.indexOf("php") !== -1 ||
    textHint.indexOf("peso") !== -1
  ) {
    outRow[21] = "PHP";
    return;
  }

  function fmtFor(header) {
    var idx = columnMap[header];
    if (idx === undefined || !rowFormats || !rowFormats.length) return "";
    return String(rowFormats[idx] || "").toLowerCase();
  }

  var fmtHint = [
    fmtFor("PO Unit Price"),
    fmtFor("Sub Total"),
    fmtFor("Amount To Billed"),
  ].join(" ");

  if (fmtHint.indexOf("$") !== -1 || fmtHint.indexOf("usd") !== -1) {
    outRow[21] = "USD";
  } else if (
    fmtHint.indexOf("€") !== -1 ||
    fmtHint.indexOf("eur") !== -1 ||
    fmtHint.indexOf("euro") !== -1
  ) {
    outRow[21] = "EUR";
  } else if (
    fmtHint.indexOf("₱") !== -1 ||
    fmtHint.indexOf("php") !== -1 ||
    fmtHint.indexOf("peso") !== -1
  ) {
    outRow[21] = "PHP";
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

function listCandidateFilesByYear_(
  sourceFolder,
  processedMap,
  failedAttemptsMap,
) {
  const candidates = { 2025: [], 2026: [] };
  const files = sourceFolder.getFiles();

  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    const lower = name.toLowerCase();

    if (processedMap[name]) continue;
    if ((failedAttemptsMap[name] || 0) >= CONFIG.maxFailedAttemptsPerFile)
      continue;
    if (lower.indexOf(".xlsx") === -1 && lower.indexOf(".xls") === -1) continue;

    let year = null;
    if (name.indexOf("2025") !== -1) year = "2025";
    else if (name.indexOf("2026") !== -1) year = "2026";
    if (!year) continue;

    candidates[year].push({
      id: f.getId(),
      name: name,
      year: year,
      url: f.getUrl(),
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
    if (out.length < CONFIG.maxFilesPerRunTotal && i < y26.length)
      out.push(y26[i]);
  }

  return out;
}

// Tracker state maps
function loadProcessedMap_(ss) {
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return {};

  const map = {};
  const data = tracker.getRange(2, 1, tracker.getLastRow() - 1, 5).getValues();

  data.forEach(function (row) {
    const fileName = String(row[1] || "").trim();
    const status = String(row[4] || "")
      .trim()
      .toLowerCase();
    if (fileName && (status === "ok" || status === "done"))
      map[fileName] = true;
  });

  return map;
}

function loadFailedAttemptsMap_(ss) {
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return {};

  const map = {};
  const data = tracker.getRange(2, 1, tracker.getLastRow() - 1, 5).getValues();

  data.forEach(function (row) {
    const fileName = String(row[1] || "").trim();
    const status = String(row[4] || "")
      .trim()
      .toLowerCase();
    if (!fileName) return;

    if (status === "done" || status === "ok") {
      map[fileName] = 0;
      return;
    }

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
      CONFIG.openRetryDelayMs,
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
    if (
      msg.toLowerCase().indexOf("conversion of the uploaded content") !== -1
    ) {
      return {
        rowsAdded: 0,
        status: "Needs manual check - unsupported format",
      };
    }
    return { rowsAdded: 0, status: "Error: " + msg };
  } finally {
    if (tempFileId) {
      try {
        DriveApp.getFileById(tempFileId).setTrashed(true);
      } catch (e2) {}
    }
  }
}

function convertExcelToTempSheet_(fileInfo, tempFolder) {
  const body = {
    title: "_TEMP_" + fileInfo.name,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [{ id: tempFolder.getId() }],
  };

  try {
    return Drive.Files.copy(body, fileInfo.id, {
      convert: true,
      supportsAllDrives: true,
    }).id;
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

  throw new Error(
    "Cannot open converted sheet after retries. " +
      (lastErr ? lastErr.message : ""),
  );
}

// Sheet parsing and header mapping
function parseConvertedSheet_(tempSS, fileName) {
  const preferredCandidates = [];
  const fallbackCandidates = [];
  const seenNames = {};

  // Try likely GR template names first then compressed or conflicting column headers
  const directNames = [
    "GR TEMPLATE",
    "GR Template",
    "GR template",
    "GRTEMPLATE",
    "GR TEMPLATE ",
  ];
  for (let i = 0; i < directNames.length; i++) {
    try {
      const sh = tempSS.getSheetByName(directNames[i]);
      if (!sh) continue;
      const nm = sh.getName();
      if (seenNames[nm]) continue;
      seenNames[nm] = true;
      const candidate = evaluateSheetCandidate_(sh);
      if (!candidate) continue;
      if (candidate.preferred) preferredCandidates.push(candidate);
      else fallbackCandidates.push(candidate);
    } catch (e) {
      Logger.log(
        "Direct-name check failed for " +
          directNames[i] +
          " (" +
          e.message +
          ")",
      );
    }
  }

  // Fallback: iterate all sheets, but guard failures
  try {
    const sheets = tempSS.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      let sh = sheets[i];
      let nm = "";
      try {
        nm = sh.getName();
      } catch (eName) {
        Logger.log("Skipping unnamed/problem sheet (" + eName.message + ")");
        continue;
      }
      if (seenNames[nm]) continue;
      seenNames[nm] = true;

      let candidate = null;
      try {
        candidate = evaluateSheetCandidate_(sh);
      } catch (eEval) {
        Logger.log(
          'Skipping sheet "' + nm + '" in parse loop (' + eEval.message + ")",
        );
        continue;
      }

      if (!candidate) continue;
      if (candidate.preferred) preferredCandidates.push(candidate);
      else fallbackCandidates.push(candidate);
    }
  } catch (eSheets) {
    Logger.log(
      "Could not enumerate all sheets for " +
        fileName +
        " (" +
        eSheets.message +
        ")",
    );
  }

  const bestPreferred = pickBestCandidate_(preferredCandidates);
  const bestFallback = pickBestCandidate_(fallbackCandidates);
  const best = bestPreferred || bestFallback;

  if (!best || best.rows.length === 0) {
    Logger.log("No extractable rows for " + fileName);
    return [];
  }

  Logger.log(
    "Selected '" + best.sheetName + "' with " + best.rows.length + " row(s).",
  );
  return best.rows;
}

function evaluateSheetCandidate_(sh) {
  try {
    if (typeof sh.getType === "function") {
      var sheetType = String(sh.getType());
      if (sheetType !== "GRID") {
        Logger.log(
          "Skipping non-grid sheet '" + sh.getName() + "' type=" + sheetType,
        );
        return null;
      }
    }

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 3) return null;

    let vals, disp, fmts;
    try {
      vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
      disp = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
      fmts = sh.getRange(1, 1, lastRow, lastCol).getNumberFormats();
    } catch (e) {
      Logger.log('Skipping sheet "' + sh.getName() + '" (' + e.message + ")");
      return null;
    }

    const h = detectHeaderRowAndMap_(vals);
    if (h.headerRowIndex < 0 || h.matchedCount < CONFIG.minHeaderMatches)
      return null;

    const hasPoNo = h.columnMap["PO No."] !== undefined;
    const keyHeaderCount = countMappedHeaders_(h.columnMap, [
      "PO No.",
      "Material Description",
      "GR Mat. Doc.",
      "Amount To Billed",
      "Payment Milestone",
    ]);

    if (!hasPoNo || keyHeaderCount < 3) {
      Logger.log(
        "Skipping non-GR-like sheet '" +
          sh.getName() +
          "' (missing key headers).",
      );
      return null;
    }

    let rows = extractRowsWithFilter_(
      vals,
      disp,
      fmts,
      h.columnMap,
      h.headerRowIndex,
      true,
    );
    if (rows.length === 0)
      rows = extractRowsWithFilter_(
        vals,
        disp,
        fmts,
        h.columnMap,
        h.headerRowIndex,
        false,
      );
    if (rows.length === 0)
      rows = extractRowsByAnchors_(
        vals,
        disp,
        fmts,
        h.columnMap,
        h.headerRowIndex,
      );

    Logger.log(
      "Sheet '" +
        sh.getName() +
        "' -> headers: " +
        h.matchedCount +
        ", rows: " +
        rows.length,
    );

    if (rows.length === 0) return null;

    return {
      rows: rows,
      h: h,
      sheetName: sh.getName(),
      preferred: isLikelyGRTemplateSheet_(sh.getName()),
      score: h.matchedCount * 100 + Math.min(rows.length, 50),
    };
  } catch (e) {
    Logger.log(
      'Skipping sheet "' + sh.getName() + '" due to error: ' + e.message,
    );
    return null;
  }
}

function extractRowsWithFilter_(
  values,
  display,
  formats,
  columnMap,
  headerRowIndex,
  strictMode,
) {
  const rows = [];
  const anchors = [
    "PO No.",
    "Material Description",
    "Amount To Billed",
    "Payment Milestone",
    "GR Mat. Doc.",
  ];

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const rawRow = values[r];
    const dispRow = display[r] || [];

    if (isEmptyRow_(rawRow, dispRow)) continue;
    if (isRepeatedHeaderRow_(rawRow)) continue;
    if (isSummaryOrFooterRow_(rawRow, dispRow)) continue;
    if (isLikelyMergedArtifactRow_(rawRow, dispRow)) continue;
    if (!isLikelyDataRow_(rawRow, dispRow)) continue;

    let anchorHits = 0;
    for (let i = 0; i < anchors.length; i++) {
      const idx = columnMap[anchors[i]];
      if (idx === undefined) continue;
      if (isCellPresent_(rawRow[idx], dispRow[idx])) anchorHits++;
    }

    if (strictMode && anchorHits < 2) continue;
    if (!strictMode && anchorHits < 1) continue;

    const outRow = COLUMN_MAPPING.map(function (col) {
      const idx = columnMap[col];
      if (idx === undefined) return "";
      return formatCellByHeader_(col, rawRow[idx], dispRow[idx]);
    });

    applyAmountFallback_(outRow);

    const rowFormats = formats && formats[r] ? formats[r] : [];
    fillCurrencyFromHints_(outRow, rowFormats, columnMap);

    const poVal = String(outRow[1] || "").trim();
    const matVal = String(outRow[4] || "").trim();
    const svcVal = String(outRow[5] || "").trim();
    const grDocVal = String(outRow[9] || "").trim();
    const amtVal = String(outRow[20] || "").trim();

    if (!poVal && !matVal && !grDocVal) continue;
    if (poVal && !matVal && !grDocVal && !amtVal) continue;

    const isManaged = isManagedServices_(matVal, svcVal);
    if (isManaged && !amtVal && !grDocVal) continue;

    rows.push(outRow);
  }

  return rows;
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

  return {
    headerRowIndex: bestRow,
    matchedCount: bestCount,
    columnMap: bestMap,
  };
}

function createColumnMapping_(headerRow) {
  function compact(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  const map = {};
  let count = 0;

  COLUMN_MAPPING.forEach(function (canonical) {
    const aliases = HEADER_ALIASES[canonical] || [canonical];

    const normAliases = aliases.map(function (a) {
      return normalizeText_(a);
    });
    const compactAliases = aliases.map(function (a) {
      return compact(a);
    });

    for (let c = 0; c < headerRow.length; c++) {
      const cellNorm = normalizeText_(headerRow[c]);
      const cellCompact = compact(headerRow[c]);
      if (!cellNorm && !cellCompact) continue;

      for (let a = 0; a < normAliases.length; a++) {
        const aliasNorm = normAliases[a];
        const aliasCompact = compactAliases[a];

        const normMatch =
          cellNorm === aliasNorm ||
          (cellNorm.length >= 5 &&
            aliasNorm.length >= 5 &&
            (cellNorm.indexOf(aliasNorm) !== -1 ||
              aliasNorm.indexOf(cellNorm) !== -1));

        const compactMatch =
          cellCompact === aliasCompact ||
          (cellCompact.length >= 5 &&
            aliasCompact.length >= 5 &&
            (cellCompact.indexOf(aliasCompact) !== -1 ||
              aliasCompact.indexOf(cellCompact) !== -1));

        if (normMatch || compactMatch) {
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
  if (
    String(displayValue || "")
      .replace(/\u00a0/g, " ")
      .trim() !== ""
  )
    return true;
  return (
    String(rawValue || "")
      .replace(/\u00a0/g, " ")
      .trim() !== ""
  );
}

function isSummaryOrFooterRow_(rawRow, dispRow) {
  const disp = dispRow || [];

  for (let i = 0; i < rawRow.length; i++) {
    const raw = String(rawRow[i] || "")
      .replace(/\u00a0/g, " ")
      .trim();
    const d = String(disp[i] || "")
      .replace(/\u00a0/g, " ")
      .trim();
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
    const v = String(
      disp[i] !== undefined && disp[i] !== "" ? disp[i] : rawRow[i] || "",
    )
      .replace(/\u00a0/g, " ")
      .trim();
    if (!v) continue;

    nonEmpty++;

    const low = v.toLowerCase();
    const isNumericLike = /^[0-9.,%-]+$/.test(v);
    const isShort = v.length <= 2;
    const isCommonToken =
      low === "n/a" ||
      low === "na" ||
      low === "php" ||
      low === "usd" ||
      low === "lot" ||
      low === "pc";

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

function extractRowsByAnchors_(
  values,
  display,
  formats,
  columnMap,
  headerRowIndex,
) {
  const rows = [];
  const anchors = [
    "PO No.",
    "Material Description",
    "Amount To Billed",
    "Payment Milestone",
    "GR Mat. Doc.",
  ];

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

    const outRow = COLUMN_MAPPING.map(function (col) {
      const idx = columnMap[col];
      if (idx === undefined) return "";
      return formatCellByHeader_(col, rawRow[idx], dispRow[idx]);
    });

    applyAmountFallback_(outRow);

    const rowFormats = formats && formats[r] ? formats[r] : [];
    fillCurrencyFromHints_(outRow, rowFormats, columnMap);

    if (
      columnMap["PO No."] !== undefined ||
      columnMap["Material Description"] !== undefined
    ) {
      const poVal = String(outRow[1] || "").trim();
      const matVal = String(outRow[4] || "").trim();
      const grDocVal = String(outRow[9] || "").trim();
      const amtVal = String(outRow[20] || "").trim();
      const svcVal = String(outRow[5] || "").trim();

      if (!poVal && !matVal && !grDocVal) continue;
      if (poVal && !matVal && !grDocVal && !amtVal) continue;

      const isManaged = isManagedServices_(matVal, svcVal);
      if (isManaged && !amtVal && !grDocVal) continue;
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
    return (
      displayValue ||
      Utilities.formatDate(rawValue, Session.getScriptTimeZone(), "M/d/yyyy")
    );
  }

  const d = String(displayValue || "").trim();
  return d !== "" ? displayValue : rawValue;
}

function applyAmountFallback_(outRow) {
  var amt = String(outRow[20] || "").trim(); // Amount To Billed
  var sub = String(outRow[19] || "").trim(); // Sub Total
  var amtNum = parseAmount_(amt);
  var subNum = parseAmount_(sub);

  if ((!amt || isNaN(amtNum)) && !isNaN(subNum)) {
    outRow[20] = outRow[19];
  }
}

function repairMainSiteColumnsNow() {
  const ss = getSpreadsheet_();
  if (!ss) {
    notify_("No spreadsheet found from getSpreadsheet_.");
    return;
  }

  const lookupMap = loadPlaLookupMap_(ss);
  let totalUpdated = 0;
  let details = [];

  ["2025", "2026"].forEach(function (year) {
    const sh = findOutputSheetByYear_(ss, year);
    if (!sh) {
      details.push(year + ": target sheet not found");
      return;
    }

    const plaCol = getColumnIndexByHeader_(sh, "Installed PLA ID");
    const matCol = getColumnIndexByHeader_(sh, "Material Description");
    const svcCol = getColumnIndexByHeader_(sh, "PO Service Short Text");
    const amtCol = getColumnIndexByHeader_(sh, "Amount To Billed");
    const subCol = getColumnIndexByHeader_(sh, "Sub Total");
    const curCol = getColumnIndexByHeader_(sh, "Currency");
    if (amtCol < 1 || curCol < 1) {
      details.push(year + ": Amount To Billed/Currency header not found");
      return;
    }

    const lastRow = sh.getLastRow();
    const rowCount = lastRow - 1;

    const wbsCol = getColumnIndexByHeader_(sh, "WBS Element");
    const wbsVals =
      wbsCol > 0 ? sh.getRange(2, wbsCol, rowCount, 1).getDisplayValues() : [];

    const plaVals = sh.getRange(2, plaCol, rowCount, 1).getDisplayValues();
    const matVals = sh.getRange(2, matCol, rowCount, 1).getDisplayValues();
    const svcVals = sh.getRange(2, svcCol, rowCount, 1).getDisplayValues();
    const amtVals = sh.getRange(2, amtCol, rowCount, 1).getDisplayValues();
    const curVals = sh.getRange(2, curCol, rowCount, 1).getDisplayValues();

    const colInfo = ensureEnrichmentColumns_(sh);

    const out = [];
    for (var i = 0; i < rowCount; i++) {
      const key = normalizePlaLookupKey_(plaVals[i][0]);
      const found = lookupMap[key];

      var regional = found ? found.regionalArea || "" : "";
      var cleaned = found ? found.cleanedSiteName || "" : "";
      var territory = found ? found.territory || "" : "";

      if (isMissingOrNaTerritory_(territory)) {
        if (isManagedServices_(matVals[i][0], svcVals[i][0])) {
          territory = "Managed Services";
        } else if (isOpexWbs_(wbsVals.length ? wbsVals[i][0] : "")) {
          territory = "OPEX";
        } else {
          territory = "N/A";
        }
      }

      const usd = toUsdIfPhp_(amtVals[i][0], curVals[i][0]);
      out.push([regional, cleaned, territory, usd]);
    }

    sh.getRange(2, colInfo.regionalAreaCol, rowCount, 4).setValues(out);
    totalUpdated += rowCount;
    details.push(year + ": updated " + rowCount + " row(s)");
  });

  notify_(
    "Lookup + USD update complete.\nTotal rows updated: " +
      totalUpdated +
      "\n\n" +
      details.join("\n"),
  );
}

function backfillMainInstalledSiteForExistingData() {
  repairMainSiteColumnsNow();
}

function appendRowsWithSourceLink_(sheet, rows, fileInfo) {
  if (rows.length === 0) return;

  const startRow = sheet.getLastRow() + 1;
  sheet
    .getRange(startRow, 1, rows.length, COLUMN_MAPPING.length)
    .setValues(rows);

  const sourceCol = getColumnIndexByHeader_(sheet, CONFIG.sourceHeaderName);
  if (sourceCol > 0) {
    const linkFormula =
      '=HYPERLINK("' +
      fileInfo.url +
      '","' +
      fileInfo.name.replace(/"/g, '""') +
      '")';
    const linkFormulas = Array.from({ length: rows.length }, function () {
      return [linkFormula];
    });
    sheet
      .getRange(startRow, sourceCol, rows.length, 1)
      .setFormulas(linkFormulas);
  }

  const ss = sheet.getParent();
  const lookupMap = loadPlaLookupMap_(ss);
  const colInfo = ensureEnrichmentColumns_(sheet);

  const enrich = rows.map(function (r) {
    // r[14] Installed PLA ID, r[4] Material Description, r[5] PO Service Short Text
    // r[20] Amount To Billed, r[21] Currency
    const key = normalizePlaLookupKey_(r[14]);
    const found = lookupMap[key];

    var regional = "";
    var cleaned = "";
    var territory = "";
    if (found) {
      regional = found.regionalArea || "";
      cleaned = found.cleanedSiteName || "";
      territory = found.territory || "";
    }

    if (isMissingOrNaTerritory_(territory)) {
      if (isManagedServices_(r[4], r[5])) {
        territory = "Managed Services";
      } else if (isOpexWbs_(r[10])) {
        // WBS Element index in COLUMN_MAPPING
        territory = "OPEX";
      } else {
        territory = "N/A";
      }
    }

    const usd = toUsdIfPhp_(r[20], r[21]);
    return [regional, cleaned, territory, usd];
  });

  sheet
    .getRange(startRow, colInfo.regionalAreaCol, rows.length, 4)
    .setValues(enrich);
}

function convertAmountToUsdForAllData() {
  const ss = getSpreadsheet_();
  if (!ss) return;
  let total = 0;
  let notes = [];

  ["2025", "2026"].forEach(function (year) {
    const sh = findOutputSheetByYear_(ss, year);
    if (!sh) {
      notes.push(year + ": target sheet not found");
      return;
    }

    const amtCol = getColumnIndexByHeader_(sh, "Amount To Billed");
    const curCol = getColumnIndexByHeader_(sh, "Currency");
    const subCol = getColumnIndexByHeader_(sh, "Sub Total");
    if (amtCol < 1 || curCol < 1) {
      notes.push(year + ": Amount To Billed/Currency header not found");
      return;
    }

    const lastRow = sh.getLastRow();
    if (lastRow < 2) {
      notes.push(year + ": no data rows");
      return;
    }

    const rowCount = lastRow - 1;
    const amtVals = sh.getRange(2, amtCol, rowCount, 1).getDisplayValues();
    const subVals =
      subCol > 0 ? sh.getRange(2, subCol, rowCount, 1).getDisplayValues() : [];
    const curVals = sh.getRange(2, curCol, rowCount, 1).getDisplayValues();
    const colInfo = ensureEnrichmentColumns_(sh);

    const usdOut = [];
    const amtOut = [];
    let repairedAmountCount = 0;
    for (var i = 0; i < rowCount; i++) {
      var amtRaw = amtVals[i][0];
      var subRaw = subVals.length ? subVals[i][0] : "";
      var amtParsed = parseAmount_(amtRaw);
      var subParsed = parseAmount_(subRaw);
      var amtForUsd = amtRaw;

      if (isNaN(amtParsed) && !isNaN(subParsed)) {
        amtForUsd = subRaw;
        repairedAmountCount++;
      }

      amtOut.push([amtForUsd]);
      usdOut.push([toUsdIfPhp_(amtForUsd, curVals[i][0])]);
    }

    if (repairedAmountCount > 0) {
      sh.getRange(2, amtCol, rowCount, 1).setValues(amtOut);
    }

    const usdRange = sh.getRange(2, colInfo.usdCol, rowCount, 1);
    usdRange.setValues(usdOut);
    usdRange.setNumberFormat("#,##0.00");

    total += rowCount;
    notes.push(
      year +
        ": USD recomputed for " +
        rowCount +
        " row(s), Amount repaired: " +
        repairedAmountCount,
    );
  });

  notify_(
    "USD conversion done (rate = 57).\nTotal rows processed: " +
      total +
      "\n\n" +
      notes.join("\n"),
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
    '=HYPERLINK("' +
      fileInfo.url +
      '","' +
      fileInfo.name.replace(/"/g, '""') +
      '")',
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
    const status = String(data[i][4] || "")
      .trim()
      .toLowerCase();
    if (status !== "ok" && status !== "done") {
      tracker.deleteRow(i + 2);
      removed++;
    }
  }

  Logger.log("Removed " + removed + " non-success entries.");
  const ss2 = getSpreadsheet_();
  if (ss2)
    ss2.toast(
      "Requeued " + removed + " file(s) for retry.",
      "GR Automation",
      8,
    );
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

// Notification helper
function notify_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message);
  }
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
    if (
      (n.indexOf("2025") !== -1 || n.indexOf("2026") !== -1) &&
      (n.indexOf(".xlsx") !== -1 || n.indexOf(".xls") !== -1)
    ) {
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
    tempFileId = convertExcelToTempSheet_(
      { id: testFile.getId(), name: testFile.getName() },
      tempFolder,
    );
    const tempSS = openSpreadsheetWithRetry_(
      tempFileId,
      CONFIG.openRetryAttempts,
      CONFIG.openRetryDelayMs,
    );
    const rows = parseConvertedSheet_(tempSS, testFile.getName());

    SpreadsheetApp.getUi().alert(
      "Debug Result",
      "File: " +
        testFile.getName() +
        "\nRows extracted: " +
        rows.length +
        "\nCheck View > Logs for per-tab details.",
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert("Debug error: " + e.message);
  } finally {
    if (tempFileId) {
      try {
        DriveApp.getFileById(tempFileId).setTrashed(true);
      } catch (e2) {}
    }
  }
}

// Diagnostic checking
function debugMainSiteSetup() {
  const ss = getSpreadsheet_();
  if (!ss) {
    notify_("No spreadsheet found from getSpreadsheet_.");
    return;
  }

  const allNames = ss.getSheets().map(function (s) {
    return s.getName();
  });
  const sh2025 = findOutputSheetByYear_(ss, "2025");
  const sh2026 = findOutputSheetByYear_(ss, "2026");

  let msg = [];
  msg.push("All sheets: " + allNames.join(" | "));
  msg.push("Detected 2025 sheet: " + (sh2025 ? sh2025.getName() : "NOT FOUND"));
  msg.push("Detected 2026 sheet: " + (sh2026 ? sh2026.getName() : "NOT FOUND"));

  if (sh2025) {
    msg.push(
      "2025 Installed PLA ID col: " +
        getColumnIndexByHeader_(sh2025, "Installed PLA ID"),
    );
    msg.push(
      "2025 Regional Area col: " +
        getColumnIndexByHeader_(sh2025, "Regional Area"),
    );
    msg.push(
      "2025 Cleaned Site Name col: " +
        getColumnIndexByHeader_(sh2025, "Cleaned Site Name"),
    );
    msg.push(
      "2025 Territory col: " + getColumnIndexByHeader_(sh2025, "Territory"),
    );
  }
  if (sh2026) {
    msg.push(
      "2026 Installed PLA ID col: " +
        getColumnIndexByHeader_(sh2026, "Installed PLA ID"),
    );
    msg.push(
      "2026 Regional Area col: " +
        getColumnIndexByHeader_(sh2026, "Regional Area"),
    );
    msg.push(
      "2026 Cleaned Site Name col: " +
        getColumnIndexByHeader_(sh2026, "Cleaned Site Name"),
    );
    msg.push(
      "2026 Territory col: " + getColumnIndexByHeader_(sh2026, "Territory"),
    );
  }

  notify_(msg.join("\n"));
}

function findOutputSheetByYear_(ss, year) {
  const exact = ss.getSheetByName(CONFIG.outputSheets[year]);
  if (exact) return exact;

  const target = ("gr posted " + year).toLowerCase();
  const sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    const n = String(sheets[i].getName() || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (n === target || n.indexOf(target) !== -1) return sheets[i];
  }
  return null;
}
