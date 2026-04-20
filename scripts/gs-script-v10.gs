// GR Template Automation Consolidator

// Configuration
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
  maxFilesPerRunTotal: 6,
  maxFilesPerRunPerYear: 3,
  maxRuntimeMs: 120000,
  headerScanMaxRows: 80,
  maxRowsPerSheetScan: 2500,
  maxColsPerSheetScan: 45,
  preferDirectTemplateTabFastPath: true,
  useNumberFormatCurrencyHints: false,
  openRetryAttempts: 3,
  openRetryDelayMs: 500,
  minHeaderMatches: 3,
  maxFailedAttemptsPerFile: 5,
  onlyIncludeVisibleRows: true,
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

// Column index map
const COL = (function () {
  const m = {};
  for (var i = 0; i < COLUMN_MAPPING.length; i++) {
    m[COLUMN_MAPPING[i]] = i;
  }
  return m;
})();

// Cache for config and lookups
var _CACHE = {
  configMappings: null,
  plaLookupMapBySsId: {},
};

function getConfigMappingsCached_(force) {
  if (!force && _CACHE.configMappings) return _CACHE.configMappings;
  var m = readConfigMappings_();
  _CACHE.configMappings = m || {};
  return _CACHE.configMappings;
}

function clearConfigMappingsCache_() {
  _CACHE.configMappings = null;
}

function getPlaLookupMapCached_(ss, force) {
  if (!ss) return {};
  var id = ss.getId ? ss.getId() : String(ss || "");
  if (!force && _CACHE.plaLookupMapBySsId[id])
    return _CACHE.plaLookupMapBySsId[id];
  var m = loadPlaLookupMap_(ss);
  _CACHE.plaLookupMapBySsId[id] = m || {};
  return _CACHE.plaLookupMapBySsId[id];
}

function clearPlaLookupMapCache_(ss) {
  if (!ss) {
    _CACHE.plaLookupMapBySsId = {};
    return;
  }
  var id = ss.getId ? ss.getId() : String(ss || "");
  delete _CACHE.plaLookupMapBySsId[id];
}

function getConfiguredYears_() {
  // Load years from config
  const cfg = getConfigMappingsCached_() || {};
  const cfgYears = Object.keys(cfg || {})
    .map(function (k) {
      return String(k || "").trim();
    })
    .filter(function (y) {
      return y !== "";
    });
  if (cfgYears.length > 0) {
    return cfgYears.sort();
  }
  return Object.keys(CONFIG.outputSheets || {})
    .map(function (k) {
      return String(k);
    })
    .sort();
}

// Add enrichment columns (territory, USD, etc)
function getEnrichmentForRow_(row, lookupMap) {
  var regional = "";
  var cleaned = "";
  var territory = "";

  // Skip PLA for OPEX
  var wbsVal = row[COL["WBS Element"]];
  if (isOpexWbs_(wbsVal)) {
    territory = "OPEX";
    var usdShort = toUsdIfPhp_(
      row[COL["Amount To Billed"]],
      row[COL["Currency"]],
    );
    return [regional, cleaned, territory, usdShort];
  }

  // Try Installed PLA ID first
  var installedKey = normalizePlaLookupKey_(row[COL["Installed PLA ID"]]);
  var found = installedKey ? lookupMap[installedKey] : null;
  if (!found) {
    var poKey = normalizePlaLookupKey_(row[COL["PO PLA ID"]]);
    if (poKey) found = lookupMap[poKey];
  }

  if (found) {
    regional = found.regionalArea || "";
    cleaned = found.cleanedSiteName || "";
    territory = found.territory || "";
  }

  if (isMissingOrNaTerritory_(territory)) {
    if (
      isManagedServices_(
        row[COL["Material Description"]],
        row[COL["PO Service Short Text"]],
      )
    ) {
      territory = "Managed Services";
    } else {
      territory = "N/A";
    }
  }

  var usd = toUsdIfPhp_(row[COL["Amount To Billed"]], row[COL["Currency"]]);
  return [regional, cleaned, territory, usd];
}

// Header aliases
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

// Summary keywords
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
  const ui = SpreadsheetApp.getUi();
  const main = ui.createMenu("GR Automation");

  const processing = ui
    .createMenu("Processing")
    .addItem("Process All New Files Now", "consolidateGRTemplateData")
    .addItem("Process Files for Year...", "showYearPicker")
    .addItem("Retry Failed Files", "requeueNoDataFiles");

  const posted = ui
    .createMenu("GR Posted Sheets")
    .addItem(
      "Backfill Lookup & Territory (existing rows)",
      "repairMainSiteColumnsNow",
    )
    .addItem("Recompute USD for All Rows", "convertAmountToUsdForAllData")
    .addItem("Fix Source File Hyperlinks", "fixSourceFileHyperlinksNow");

  const logs = ui
    .createMenu("Tracker & Logs")
    .addItem("Fix Tracker File Links", "normalizeTrackerFileLinkColumnNow")
    .addItem("Backfill Missing Months", "backfillTrackerMonthsNow");

  logs
    .addSeparator()
    .addItem(
      "Backfill Source Links (Preview)",
      "backfillMissingSourceLinksPreview",
    )
    .addItem("Backfill Source Links (Now)", "backfillMissingSourceLinksNow");

  const automation = ui
    .createMenu("Automation")
    .addItem("Start Auto Trigger (1 min)", "setupAutomaticEvery1Min")
    .addItem("Stop Auto Trigger", "stopAutomatic")
    .addItem("Show Auto Processing Status", "debugAutoProcessingStatus");

  const admin = ui
    .createMenu("Admin")
    .addItem("Check Lookup & Output Setup", "debugMainSiteSetup")
    .addItem("Clean Temp Files", "cleanupTempFiles")
    .addSeparator()
    .addItem("Cleanup Duplicates (Preview)", "cleanupDuplicatesPreview")
    .addItem("Cleanup Duplicates (Now)", "cleanupDuplicatesNow")
    .addSeparator()
    .addItem("Test One Source File (Debug)", "debugTestSingleFile");

  main
    .addSubMenu(processing)
    .addSubMenu(posted)
    .addSubMenu(logs)
    .addSubMenu(automation)
    .addSubMenu(admin)
    .addToUi();
}

function openPlaLookupSheet() {
  const ss = getSpreadsheet_();
  if (!ss) {
    try {
      SpreadsheetApp.getUi().alert("No spreadsheet found.");
    } catch (e) {}
    return;
  }
  const sh = ss.getSheetByName(CONFIG.lookupSheetName);
  if (!sh) {
    try {
      SpreadsheetApp.getUi().alert("PLA Lookup sheet not found.");
    } catch (e) {}
    return;
  }
  ss.setActiveSheet(sh);
}

// Trigger setup
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

// Main consolidation
function consolidateGRTemplateData() {
  const startTime = Date.now();
  const lock = LockService.getScriptLock();
  const docLock =
    typeof LockService.getDocumentLock === "function"
      ? LockService.getDocumentLock()
      : null;
  const scriptProps = PropertiesService.getScriptProperties();

  const gotScriptLock = lock.tryLock(5000);
  const gotDocLock = !docLock || docLock.tryLock(5000);
  if (!gotScriptLock || !gotDocLock) {
    try {
      if (gotDocLock && docLock) docLock.releaseLock();
    } catch (eDocLockAcquire) {}
    try {
      if (gotScriptLock) lock.releaseLock();
    } catch (eLock) {}
    Logger.log("Another run is already in progress.");
    scriptProps.setProperty("LAST_RUN_STARTED_AT", new Date().toString());
    scriptProps.setProperty("LAST_RUN_FINISHED_AT", new Date().toString());
    scriptProps.setProperty(
      "LAST_RUN_STATUS",
      "Skipped: another run in progress",
    );
    scriptProps.setProperty(
      "LAST_RUN_STAGE",
      "Waiting for current run to finish",
    );
    scriptProps.setProperty("LAST_RUN_ACTIVE_FILE", "");
    scriptProps.setProperty("LAST_RUN_ACTIVE_YEAR", "");
    return;
  }

  try {
    scriptProps.setProperty("LAST_RUN_STARTED_AT", new Date().toString());
    scriptProps.setProperty("LAST_RUN_STATUS", "Running");
    scriptProps.setProperty("LAST_RUN_STAGE", "Preparing run");

    const ss = getSpreadsheet_();
    if (!ss) {
      Logger.log("Spreadsheet not found. Run setupAutomaticEvery1Min first.");
      scriptProps.setProperty(
        "LAST_RUN_STATUS",
        "Stopped: spreadsheet not found (run setup first)",
      );
      scriptProps.setProperty("LAST_RUN_FINISHED_AT", new Date().toString());
      return;
    }

    ensureSheets_(ss);
    scriptProps.setProperty("LAST_RUN_STAGE", "Scanning source folder");

    const sourceFolder = findFolder_(CONFIG.sourceFolderName);
    if (!sourceFolder) {
      Logger.log("Source folder not found: " + CONFIG.sourceFolderName);
      scriptProps.setProperty(
        "LAST_RUN_STATUS",
        "Stopped: source folder not found",
      );
      scriptProps.setProperty("LAST_RUN_FINISHED_AT", new Date().toString());
      return;
    }

    const processedMap = loadProcessedMap_(ss);
    const doneKeyMap = buildTrackerExactDoneKeyMap_(ss);
    const failedAttemptsMap = loadFailedAttemptsMap_(ss);
    const candidates = listCandidateFilesByYear_(
      sourceFolder,
      processedMap,
      failedAttemptsMap,
    );

    const years = getConfiguredYears_();
    const yearCounts = years
      .map(function (y) {
        return y + "=" + ((candidates[y] && candidates[y].length) || 0);
      })
      .join(", ");
    Logger.log("Candidates - " + yearCounts);
    scriptProps.setProperty("LAST_RUN_CANDIDATES", yearCounts);

    let anyCandidates = false;
    years.forEach(function (y) {
      if (candidates[y] && candidates[y].length > 0) anyCandidates = true;
    });
    if (!anyCandidates) {
      Logger.log(
        "No new files to process. Trigger will check again next minute.",
      );
      scriptProps.setProperty("LAST_RUN_STATUS", "Idle: no new files");
      scriptProps.setProperty("LAST_RUN_STAGE", "Idle");
      scriptProps.setProperty("LAST_RUN_ACTIVE_FILE", "");
      scriptProps.setProperty("LAST_RUN_ACTIVE_YEAR", "");
      scriptProps.setProperty("LAST_RUN_FINISHED_AT", new Date().toString());
      return;
    }

    const tempFolder = getOrCreateTempFolder_();
    const toProcess = buildProcessList_(candidates);

    let processedCount = 0;
    let totalRowsAdded = 0;

    for (let i = 0; i < toProcess.length; i++) {
      if (Date.now() - startTime > CONFIG.maxRuntimeMs) {
        Logger.log("Stopped early due to runtime limit.");
        scriptProps.setProperty(
          "LAST_RUN_STATUS",
          "Stopped early: runtime limit reached",
        );
        scriptProps.setProperty("LAST_RUN_STAGE", "Runtime limit reached");
        break;
      }

      const fileInfo = toProcess[i];
      if (isMarkedProcessedInMap_(processedMap, fileInfo)) {
        Logger.log("Skipping already processed file: " + fileInfo.name);
        continue;
      }

      if (hasAnyProcessingKeyMatch_(doneKeyMap, fileInfo)) {
        markProcessedInMap_(processedMap, fileInfo);
        Logger.log(
          "Skipping file already present in tracker log: " + fileInfo.name,
        );
        continue;
      }

      scriptProps.setProperty("LAST_RUN_ACTIVE_FILE", fileInfo.name);
      scriptProps.setProperty("LAST_RUN_ACTIVE_YEAR", fileInfo.year);
      scriptProps.setProperty("LAST_RUN_STAGE", "Processing " + fileInfo.name);

      // Skip files over 10 MB
      try {
        const file = DriveApp.getFileById(fileInfo.id);
        if (shouldSkipFileForPerformance_(file)) {
          Logger.log("Skipping file (>10 MB): " + fileInfo.name);
          continue;
        }
      } catch (e) {
        Logger.log(
          "Could not retrieve file for size check: " + (e && e.message),
        );
      }

      const result = processSingleFile_(ss, fileInfo, tempFolder);
      appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, processedMap);

      if (isDoneStatus_(result.status)) {
        markProcessedInMap_(processedMap, fileInfo);
      }

      processedCount++;
      totalRowsAdded += result.rowsAdded;
    }

    Logger.log(
      "Batch done. Files: " + processedCount + ", Rows: " + totalRowsAdded,
    );
    scriptProps.setProperty(
      "LAST_RUN_STATUS",
      "Done: files=" + processedCount + ", rows=" + totalRowsAdded,
    );
    scriptProps.setProperty("LAST_RUN_STAGE", "Idle");
    scriptProps.setProperty("LAST_RUN_ACTIVE_FILE", "");
    scriptProps.setProperty("LAST_RUN_ACTIVE_YEAR", "");
    scriptProps.setProperty("LAST_RUN_FINISHED_AT", new Date().toString());
  } catch (e) {
    Logger.log("Fatal error: " + e.message + "\n" + e.stack);
    scriptProps.setProperty("LAST_RUN_STATUS", "Error: " + e.message);
    scriptProps.setProperty("LAST_RUN_STAGE", "Error");
    scriptProps.setProperty("LAST_RUN_FINISHED_AT", new Date().toString());
  } finally {
    try {
      if (docLock) docLock.releaseLock();
    } catch (eDocLock) {}
    if (lock) lock.releaseLock();
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
  const years = getConfiguredYears_();

  years.forEach(function (year) {
    try {
      const sh = findOutputSheetByYear_(ss, year);
      if (!sh) return;

      if (sh.getLastRow() === 0) {
        sh.appendRow(
          COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
            CONFIG.enrichmentHeaders,
          ),
        );
      } else {
        // Check for Source File header
        const sourceCol = getColumnIndexByHeader_(sh, CONFIG.sourceHeaderName);
        if (sourceCol < 1) {
          const lastCol = sh.getLastColumn();
          sh.getRange(1, lastCol + 1).setValue(CONFIG.sourceHeaderName);
        }
        ensureEnrichmentColumns_(sh);
      }
    } catch (e) {
      Logger.log("ensureSheets_ year " + year + " error: " + (e && e.message));
    }
  });

  [CONFIG.trackerSheetName, CONFIG.lookupSheetName].forEach(function (name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (tracker.getLastRow() === 0) {
    tracker.appendRow([
      "Timestamp",
      "File Name",
      "Month",
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
  if (w.indexOf("I-NT") === 0) return false;
  return w.indexOf("NT") === 0;
}

// Config sheet helpers
function ensureConfigSheetExists_() {
  const ss = getSpreadsheet_();
  if (!ss) return null;
  const name = "GR Automation Config";
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(["Year", "Sheet Name", "Spreadsheet ID"]);
  }
  return sh;
}

function readConfigMappings_() {
  const ss = getSpreadsheet_();
  if (!ss) return {};
  const sh = ss.getSheetByName("GR Automation Config");
  if (!sh || sh.getLastRow() < 2) return {};
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  const map = {};
  data.forEach(function (row) {
    const y = String(row[0] || "").trim();
    const sheetName = String(row[1] || "").trim();
    const ssid = String(row[2] || "").trim();
    if (!y) return;
    map[y] = { sheetName: sheetName, spreadsheetId: ssid };
  });
  return map;
}

function writeConfigMapping_(year, sheetName, spreadsheetId) {
  const ss = getSpreadsheet_();
  if (!ss) return false;
  const sh = ensureConfigSheetExists_();
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === String(year)) {
      sh.getRange(2 + i, 2, 1, 2).setValues([[sheetName, spreadsheetId || ""]]);
      clearConfigMappingsCache_();
      return true;
    }
  }
  sh.appendRow([String(year), sheetName || "", spreadsheetId || ""]);
  clearConfigMappingsCache_();
  return true;
}

function getOutputSheetNameForYear(year) {
  const cfg = readConfigMappings_();
  if (cfg[year] && cfg[year].sheetName) return cfg[year].sheetName;
  if (CONFIG.outputSheets && CONFIG.outputSheets[year])
    return CONFIG.outputSheets[year];
  return "GR Posted " + year;
}

function addConfiguredYear(year, sheetName, spreadsheetId, createSheet) {
  year = String(year || "").trim();
  if (!/^[0-9]{4}$/.test(year)) return "Invalid year format.";
  sheetName = String(sheetName || "GR Posted " + year).trim();
  const ss = getSpreadsheet_();
  if (!ss) return "Bound spreadsheet not found.";
  if (createSheet && !spreadsheetId) {
    // Create sheet if missing
    if (!ss.getSheetByName(sheetName)) ss.insertSheet(sheetName);
  }
  writeConfigMapping_(year, sheetName, spreadsheetId || "");
  return "Year " + year + " added/updated.";
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

// Find and list files
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

function isTempArtifactName_(name) {
  return (
    String(name || "")
      .toUpperCase()
      .indexOf("_TEMP_") === 0
  );
}

function detectYearFromNameOrFileDate_(file) {
  const name = String(file.getName() || "");
  const years = getConfiguredYears_();

  for (var i = 0; i < years.length; i++) {
    if (name.indexOf(years[i]) !== -1) return years[i];
  }

  let d = null;
  try {
    d = file.getDateCreated();
  } catch (e) {}

  if (d instanceof Date) {
    const y = String(d.getFullYear());
    for (var j = 0; j < years.length; j++) {
      if (y === years[j]) return years[j];
    }
  }

  return null;
}

function listCandidateFilesByYear_(
  sourceFolder,
  processedMap,
  failedAttemptsMap,
) {
  const years = getConfiguredYears_();
  const candidates = {};
  years.forEach(function (y) {
    candidates[y] = [];
  });

  const files = sourceFolder.getFiles();
  const maxPerYear = CONFIG.maxFilesPerRunPerYear;
  const maxTotal = CONFIG.maxFilesPerRunTotal;

  while (files.hasNext()) {
    // Check files per year limit
    var totalNow = 0;
    for (var k in candidates) totalNow += candidates[k].length;
    if (totalNow >= maxTotal) break;

    const f = files.next();
    const name = f.getName();
    const fileId = f.getId();
    const fileUrl = f.getUrl();
    const lower = name.toLowerCase();
    const candidateInfo = { name: name, id: fileId, url: fileUrl };

    if (isTempArtifactName_(name)) continue;
    if (isMarkedProcessedInMap_(processedMap, candidateInfo)) continue;
    if ((failedAttemptsMap[name] || 0) >= CONFIG.maxFailedAttemptsPerFile)
      continue;
    if (lower.indexOf(".xlsx") === -1 && lower.indexOf(".xls") === -1) continue;

    const year = detectYearFromNameOrFileDate_(f);
    if (!year || !candidates.hasOwnProperty(year)) continue;
    if (candidates[year].length >= maxPerYear) continue;

    candidates[year].push({
      id: fileId,
      name: name,
      year: year,
      url: fileUrl,
      dateCreated: f.getDateCreated(),
    });
  }

  return candidates;
}

function buildProcessList_(candidates) {
  const years = getConfiguredYears_();
  const perYearLists = years.map(function (y) {
    return (candidates[y] || []).slice(0, CONFIG.maxFilesPerRunPerYear);
  });

  const out = [];
  let idx = 0;
  while (out.length < CONFIG.maxFilesPerRunTotal) {
    let added = false;
    for (let yi = 0; yi < perYearLists.length; yi++) {
      if (perYearLists[yi][idx]) {
        out.push(perYearLists[yi][idx]);
        added = true;
        if (out.length >= CONFIG.maxFilesPerRunTotal) break;
      }
    }
    if (!added) break;
    idx++;
  }

  return out;
}

// Load tracker state
function loadProcessedMap_(ss) {
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return {};

  const map = {};
  const rowCount = tracker.getLastRow() - 1;
  let fileNameCol = getColumnIndexByHeader_(tracker, "File Name");
  let statusCol = getColumnIndexByHeader_(tracker, "Status");
  let fileLinkCol = getColumnIndexByHeader_(tracker, "File Link");
  if (fileNameCol < 1) fileNameCol = 2;
  if (statusCol < 1) statusCol = 6;
  if (fileLinkCol < 1) fileLinkCol = 7;

  const fileNames = tracker
    .getRange(2, fileNameCol, rowCount, 1)
    .getDisplayValues();
  const statuses = tracker
    .getRange(2, statusCol, rowCount, 1)
    .getDisplayValues();
  const linkRange = tracker.getRange(2, fileLinkCol, rowCount, 1);
  const linkValues = linkRange.getDisplayValues();
  const linkFormulas = linkRange.getFormulas();

  for (var i = 0; i < rowCount; i++) {
    const status = normalizeStatus_(statuses[i][0]);
    if (!isProcessedStatus_(status)) continue;

    const fileName = String(fileNames[i][0] || "").trim();
    const fileUrl = extractUrlFromCell_(linkValues[i][0], linkFormulas[i][0]);

    markProcessedInMap_(map, {
      name: fileName,
      id: extractDriveIdFromUrl_(fileUrl),
      url: fileUrl,
    });
  }

  return map;
}

function loadFailedAttemptsMap_(ss) {
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return {};

  const map = {};
  const rowCount = tracker.getLastRow() - 1;
  let fileNameCol = getColumnIndexByHeader_(tracker, "File Name");
  let statusCol = getColumnIndexByHeader_(tracker, "Status");
  if (fileNameCol < 1) fileNameCol = 2;
  if (statusCol < 1) statusCol = 6;

  const fileNames = tracker
    .getRange(2, fileNameCol, rowCount, 1)
    .getDisplayValues();
  const statuses = tracker
    .getRange(2, statusCol, rowCount, 1)
    .getDisplayValues();

  for (var i = 0; i < rowCount; i++) {
    const fileName = String(fileNames[i][0] || "").trim();
    const status = normalizeStatus_(statuses[i][0]);
    if (!fileName) continue;

    if (isDoneStatus_(status)) {
      map[fileName] = 0;
      continue;
    }

    if (isFailureStatus_(status)) {
      map[fileName] = (map[fileName] || 0) + 1;
    }
  }

  return map;
}

// Convert and process files
function processSingleFile_(ss, fileInfo, tempFolder) {
  let tempFileId = null;
  const t0 = Date.now();
  const timings = {
    convertMs: 0,
    openMs: 0,
    parseMs: 0,
    appendMs: 0,
    totalMs: 0,
  };

  try {
    const tConvertStart = Date.now();
    tempFileId = convertExcelToTempSheet_(fileInfo, tempFolder);
    timings.convertMs = Date.now() - tConvertStart;

    const tOpenStart = Date.now();
    const tempSS = openSpreadsheetWithRetry_(
      tempFileId,
      CONFIG.openRetryAttempts,
      CONFIG.openRetryDelayMs,
    );
    timings.openMs = Date.now() - tOpenStart;

    const tParseStart = Date.now();
    const rows = parseConvertedSheet_(tempSS, fileInfo.name);
    timings.parseMs = Date.now() - tParseStart;

    if (rows.length === 0) {
      timings.totalMs = Date.now() - t0;
      timings.rowsAdded = 0;
      timings.status = "No data extracted";
      return { rowsAdded: 0, status: "No data extracted", timings: timings };
    }

    let outputSheet = null;
    try {
      outputSheet = findOutputSheetByYear_(ss, fileInfo.year);
    } catch (eFind) {
      Logger.log("findOutputSheetByYear_ error: " + (eFind && eFind.message));
      outputSheet = null;
    }

    if (!outputSheet) {
      const outputSheetName = getOutputSheetNameForYear(fileInfo.year);
      try {
        outputSheet =
          ss.getSheetByName(outputSheetName) || ss.insertSheet(outputSheetName);
        if (outputSheet.getLastRow() === 0) {
          outputSheet.appendRow(
            COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
              CONFIG.enrichmentHeaders,
            ),
          );
        }
      } catch (eCreate) {
        Logger.log(
          "Could not create output sheet for year " +
            fileInfo.year +
            " (" +
            (eCreate && eCreate.message) +
            ")",
        );
        throw eCreate;
      }
    }

    if (outputSheetHasSourceFile_(outputSheet, fileInfo)) {
      Logger.log(
        "Skipping append; source already exists in output: " + fileInfo.name,
      );
      timings.totalMs = Date.now() - t0;
      timings.rowsAdded = 0;
      timings.status = CONFIG.doneStatusText + " (already in output)";
      return {
        rowsAdded: 0,
        status: timings.status,
        timings: timings,
      };
    }

    const tAppendStart = Date.now();
    appendRowsWithSourceLink_(outputSheet, rows, fileInfo, ss);
    timings.appendMs = Date.now() - tAppendStart;

    timings.totalMs = Date.now() - t0;
    timings.rowsAdded = rows.length;
    timings.status = CONFIG.doneStatusText;

    return {
      rowsAdded: rows.length,
      status: CONFIG.doneStatusText,
      timings: timings,
    };
  } catch (e) {
    const msg = e.message || "";
    timings.totalMs = Date.now() - t0;
    timings.rowsAdded = 0;
    const msgLower = String(msg).toLowerCase();

    if (
      msgLower.indexOf("needs manual check") !== -1 ||
      msgLower.indexOf("request too large") !== -1 ||
      msgLower.indexOf("413") !== -1
    ) {
      timings.status = "Needs manual check - file too large";
      return { rowsAdded: 0, status: timings.status, timings: timings };
    }

    if (msgLower.indexOf("conversion of the uploaded content") !== -1) {
      return {
        rowsAdded: 0,
        status: "Needs manual check - unsupported format",
        timings: timings,
      };
    }
    timings.status = "Error: " + (msg || String(e));
    return { rowsAdded: 0, status: timings.status, timings: timings };
  } finally {
    if (tempFileId) {
      try {
        DriveApp.getFileById(tempFileId).setTrashed(true);
      } catch (e2) {}
    }
  }
}

// Convert Excel to temp sheet
function convertExcelToTempSheet_(fileInfo, tempFolder) {
  const body = {
    title: "_TEMP_" + fileInfo.name,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [{ id: tempFolder.getId() }],
  };

  try {
    const copied = Drive.Files.copy(body, fileInfo.id, {
      convert: true,
      supportsAllDrives: true,
    });

    try {
      const createdFile = DriveApp.getFileById(copied.id);
      createdFile.moveTo(tempFolder);
    } catch (eMove) {}

    return copied.id;
  } catch (e) {
    const errMsg = ((e && e.message) || "").toLowerCase();
    if (
      errMsg.indexOf("request too large") !== -1 ||
      errMsg.indexOf("413") !== -1
    ) {
      throw new Error("Needs manual check - file too large");
    }

    try {
      const copiedFallback = Drive.Files.copy(body, fileInfo.id, {
        convert: true,
      });

      try {
        const createdFallback = DriveApp.getFileById(copiedFallback.id);
        createdFallback.moveTo(tempFolder);
      } catch (eMove2) {}

      return copiedFallback.id;
    } catch (e2) {
      const errMsg2 = ((e2 && e2.message) || "").toLowerCase();
      if (
        errMsg2.indexOf("request too large") !== -1 ||
        errMsg2.indexOf("413") !== -1
      ) {
        throw new Error("NON_RETRIABLE_TOO_LARGE: Request Too Large");
      }
      throw e2;
    }
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

// Parse sheet and map headers
function parseConvertedSheet_(tempSS, fileName) {
  const preferredCandidates = [];
  const fallbackCandidates = [];
  const directPreferredCandidates = [];
  const directFallbackCandidates = [];
  const seenNames = {};

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
      const candidate = evaluateSheetCandidate_(sh, fileName, true);
      if (!candidate) continue;
      if (candidate.preferred) {
        preferredCandidates.push(candidate);
        directPreferredCandidates.push(candidate);
      } else {
        fallbackCandidates.push(candidate);
        directFallbackCandidates.push(candidate);
      }
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

  if (CONFIG.preferDirectTemplateTabFastPath) {
    const fastDirect =
      pickBestCandidate_(directPreferredCandidates) ||
      pickBestCandidate_(directFallbackCandidates);
    if (fastDirect && fastDirect.rows && fastDirect.rows.length > 0) {
      Logger.log(
        "Fast-path selected '" +
          fastDirect.sheetName +
          "' with " +
          fastDirect.rows.length +
          " row(s).",
      );
      return fastDirect.rows;
    }
  }

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
        candidate = evaluateSheetCandidate_(sh, fileName, false);
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

  const bestDirect =
    pickBestCandidate_(directPreferredCandidates) ||
    pickBestCandidate_(directFallbackCandidates);
  if (bestDirect && bestDirect.rows && bestDirect.rows.length > 0) {
    Logger.log(
      "Selected '" +
        bestDirect.sheetName +
        "' with " +
        bestDirect.rows.length +
        " row(s).",
    );
    return bestDirect.rows;
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

function evaluateSheetCandidate_(sh, fileName, isDirectName) {
  try {
    if (typeof sh.getType === "function") {
      const sheetType = String(sh.getType());
      if (sheetType !== "GRID") return null;
    }

    const lastRow = Math.min(sh.getLastRow(), CONFIG.maxRowsPerSheetScan);
    const lastCol = Math.min(sh.getLastColumn(), CONFIG.maxColsPerSheetScan);
    if (lastRow < 2 || lastCol < 3) return null;

    let vals, disp;
    let fmts = [];
    try {
      vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
      disp = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
      if (CONFIG.useNumberFormatCurrencyHints) {
        fmts = sh.getRange(1, 1, lastRow, lastCol).getNumberFormats();
      }
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
      sh,
    );
    if (rows.length === 0)
      rows = extractRowsWithFilter_(
        vals,
        disp,
        fmts,
        h.columnMap,
        h.headerRowIndex,
        false,
        sh,
      );
    if (rows.length === 0)
      rows = extractRowsByAnchors_(
        vals,
        disp,
        fmts,
        h.columnMap,
        h.headerRowIndex,
        sh,
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
      score:
        h.matchedCount * 100 +
        Math.min(rows.length, 50) +
        (isDirectName ? 1000 : 0) +
        computePoHintMatchScore_(rows, fileName),
    };
  } catch (e) {
    Logger.log(
      'Skipping sheet "' + sh.getName() + '" due to error: ' + e.message,
    );
    return null;
  }
}

function normalizeFileKey_(name) {
  return String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function extractDriveIdFromUrl_(url) {
  const m = String(url || "").match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m && m[1] ? m[1] : "";
}

function normalizeDriveUrlForKey_(url) {
  const id = extractDriveIdFromUrl_(url);
  if (id) return "id:" + id;
  return String(url || "")
    .replace(/\?.*$/, "")
    .trim();
}

function normalizeStatus_(statusText) {
  return String(statusText || "")
    .trim()
    .toLowerCase();
}

function isFailureStatus_(statusText) {
  const s = normalizeStatus_(statusText);
  return (
    s.indexOf("no data extracted") === 0 ||
    s.indexOf("error:") === 0 ||
    s.indexOf("needs manual check") === 0
  );
}

function isProcessedStatus_(statusText) {
  const s = normalizeStatus_(statusText);
  if (!s) return false;
  return !isFailureStatus_(s);
}

function isDoneStatus_(statusText) {
  const s = normalizeStatus_(statusText);
  return s === "done" || s === "ok" || s.indexOf("done") === 0;
}

function normalizeUrlAltKey_(url) {
  return String(url || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\?.*$/, "")
    .trim()
    .toLowerCase();
}

function buildFileProcessingKeys_(fileInfo) {
  const keys = [];
  if (!fileInfo) return keys;

  const fileName = String(fileInfo.name || "").trim();
  if (fileName) {
    keys.push(fileName);
    const normalizedName = normalizeFileKey_(fileName);
    if (normalizedName) keys.push(normalizedName);
  }

  const sourceUrl = String(fileInfo.url || "").trim();
  const sourceId = String(fileInfo.id || "").trim() || extractDriveIdFromUrl_(sourceUrl);
  if (sourceId) {
    keys.push("__ID__" + sourceId);
    keys.push("__SOURCE_ID__" + sourceId);
  }

  if (sourceUrl) {
    keys.push("__URL__" + normalizeDriveUrlForKey_(sourceUrl));
    const alt = normalizeUrlAltKey_(sourceUrl);
    if (alt) keys.push("__URL_ALT__" + alt);
  }

  return keys;
}

function markProcessedInMap_(processedMap, fileInfo) {
  if (!processedMap || !fileInfo) return;
  const keys = buildFileProcessingKeys_(fileInfo);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i]) processedMap[keys[i]] = true;
  }
}

function isMarkedProcessedInMap_(processedMap, fileInfo) {
  if (!processedMap || !fileInfo) return false;
  const keys = buildFileProcessingKeys_(fileInfo);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] && processedMap[keys[i]]) return true;
  }
  return false;
}

function extractUrlFromCell_(displayValue, formulaValue) {
  const fromFormula = extractUrlFromHyperlinkFormula_(formulaValue);
  if (fromFormula) return fromFormula;

  const text = String(displayValue || "").trim();
  if (/^https?:\/\//i.test(text)) return text;
  return "";
}

function hasAnyProcessingKeyMatch_(targetKeyMap, fileInfo) {
  if (!targetKeyMap || !fileInfo) return false;
  const keys = buildFileProcessingKeys_(fileInfo);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] && targetKeyMap[keys[i]]) return true;
  }
  return false;
}

function buildTrackerExactDoneKeyMap_(ss) {
  if (!ss) return {};

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return {};

  const rowCount = tracker.getLastRow() - 1;
  let fileNameCol = getColumnIndexByHeader_(tracker, "File Name");
  let statusCol = getColumnIndexByHeader_(tracker, "Status");
  let fileLinkCol = getColumnIndexByHeader_(tracker, "File Link");
  if (fileNameCol < 1) fileNameCol = 2;
  if (statusCol < 1) statusCol = 6;
  if (fileLinkCol < 1) fileLinkCol = 7;

  const fileNames = tracker
    .getRange(2, fileNameCol, rowCount, 1)
    .getDisplayValues();
  const statuses = tracker
    .getRange(2, statusCol, rowCount, 1)
    .getDisplayValues();
  const linkRange = tracker.getRange(2, fileLinkCol, rowCount, 1);
  const linkValues = linkRange.getDisplayValues();
  const linkFormulas = linkRange.getFormulas();

  const doneKeyMap = {};
  for (var i = 0; i < rowCount; i++) {
    const status = normalizeStatus_(statuses[i][0]);
    if (status !== "done") continue;

    const rowUrl = extractUrlFromCell_(linkValues[i][0], linkFormulas[i][0]);
    markProcessedInMap_(doneKeyMap, {
      name: String(fileNames[i][0] || "").trim(),
      id: extractDriveIdFromUrl_(rowUrl),
      url: rowUrl,
    });
  }

  return doneKeyMap;
}

function trackerHasExactDoneEntry_(ss, fileInfo, doneKeyMap) {
  if (!ss || !fileInfo) return false;
  const keyMap = doneKeyMap || buildTrackerExactDoneKeyMap_(ss);
  return hasAnyProcessingKeyMatch_(keyMap, fileInfo);
}

function trackerHasProcessedEntry_(ss, fileInfo) {
  if (!ss || !fileInfo) return false;

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return false;

  const rowCount = tracker.getLastRow() - 1;
  let fileNameCol = getColumnIndexByHeader_(tracker, "File Name");
  let statusCol = getColumnIndexByHeader_(tracker, "Status");
  let fileLinkCol = getColumnIndexByHeader_(tracker, "File Link");
  if (fileNameCol < 1) fileNameCol = 2;
  if (statusCol < 1) statusCol = 6;
  if (fileLinkCol < 1) fileLinkCol = 7;

  const fileNames = tracker
    .getRange(2, fileNameCol, rowCount, 1)
    .getDisplayValues();
  const statuses = tracker
    .getRange(2, statusCol, rowCount, 1)
    .getDisplayValues();
  const linkRange = tracker.getRange(2, fileLinkCol, rowCount, 1);
  const linkValues = linkRange.getDisplayValues();
  const linkFormulas = linkRange.getFormulas();

  const targetKeyMap = {};
  buildFileProcessingKeys_(fileInfo).forEach(function (k) {
    if (k) targetKeyMap[k] = true;
  });

  for (var i = 0; i < rowCount; i++) {
    const status = normalizeStatus_(statuses[i][0]);
    if (!isProcessedStatus_(status)) continue;

    const rowUrl = extractUrlFromCell_(linkValues[i][0], linkFormulas[i][0]);
    const rowFileInfo = {
      name: String(fileNames[i][0] || "").trim(),
      id: extractDriveIdFromUrl_(rowUrl),
      url: rowUrl,
    };

    if (hasAnyProcessingKeyMatch_(targetKeyMap, rowFileInfo)) return true;
  }

  return false;
}

function outputSheetHasSourceFile_(sheet, fileInfo) {
  if (!sheet || !fileInfo || sheet.getLastRow() <= 1) return false;

  const sourceCol = getColumnIndexByHeader_(sheet, CONFIG.sourceHeaderName);
  if (sourceCol < 1) return false;

  const rowCount = sheet.getLastRow() - 1;
  const sourceRange = sheet.getRange(2, sourceCol, rowCount, 1);
  const sourceValues = sourceRange.getDisplayValues();
  const sourceFormulas = sourceRange.getFormulas();

  const targetKeyMap = {};
  buildFileProcessingKeys_(fileInfo).forEach(function (k) {
    if (k) targetKeyMap[k] = true;
  });

  for (var i = 0; i < rowCount; i++) {
    const sourceText = String(sourceValues[i][0] || "").trim();
    const sourceUrl = extractUrlFromCell_(sourceText, sourceFormulas[i][0]);
    const existing = {
      name: sourceText,
      id: extractDriveIdFromUrl_(sourceUrl),
      url: sourceUrl,
    };
    if (hasAnyProcessingKeyMatch_(targetKeyMap, existing)) return true;
  }

  return false;
}

function extractPoHintFromFileName_(fileName) {
  const s = String(fileName || "");
  const m = s.match(/(45\d{8,})/);
  return m && m[1] ? m[1] : "";
}

function computePoHintMatchScore_(rows, fileName) {
  const poHint = extractPoHintFromFileName_(fileName);
  if (!poHint || !rows || rows.length === 0) return 0;

  let matchCount = 0;
  const sampleSize = Math.min(rows.length, 50);
  for (let i = 0; i < sampleSize; i++) {
    const po = String(rows[i][1] || "").replace(/\D/g, ""); // PO No.
    if (!po) continue;
    if (po === poHint) matchCount++;
  }

  if (matchCount === 0) return -400;
  return 200 + matchCount * 50;
}

function extractRowsWithFilter_(
  values,
  display,
  formats,
  columnMap,
  headerRowIndex,
  strictMode,
  sheet,
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
    if (CONFIG.onlyIncludeVisibleRows && !isSheetRowVisible_(sheet, r + 1))
      continue;

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

// Row validation
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
  sheet,
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
    if (CONFIG.onlyIncludeVisibleRows && !isSheetRowVisible_(sheet, r + 1))
      continue;

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

function isSheetRowVisible_(sheet, rowNumber) {
  if (!sheet || rowNumber <= 0) return true;

  try {
    if (typeof sheet.isRowHiddenByFilter === "function") {
      if (sheet.isRowHiddenByFilter(rowNumber)) return false;
    }
  } catch (e) {}

  try {
    if (typeof sheet.isRowHiddenByUser === "function") {
      if (sheet.isRowHiddenByUser(rowNumber)) return false;
    }
  } catch (e2) {}

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

// Format cells
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

  const lookupMap = getPlaLookupMapCached_(ss);
  let totalUpdated = 0;
  let details = [];

  const years = getConfiguredYears_();
  years.forEach(function (year) {
    const sh = findOutputSheetByYear_(ss, year);
    if (!sh) {
      details.push(year + ": target sheet not found");
      return;
    }

    const plaCol = getColumnIndexByHeader_(sh, "Installed PLA ID");
    const matCol = getColumnIndexByHeader_(sh, "Material Description");
    const svcCol = getColumnIndexByHeader_(sh, "PO Service Short Text");
    const amtCol = getColumnIndexByHeader_(sh, "Amount To Billed");
    const curCol = getColumnIndexByHeader_(sh, "Currency");
    if (amtCol < 1 || curCol < 1) {
      details.push(year + ": Amount To Billed/Currency header not found");
      return;
    }

    const lastRow = sh.getLastRow();
    const rowCount = lastRow - 1;
    if (rowCount <= 0) {
      details.push(year + ": no data rows");
      return;
    }

    const wbsCol = getColumnIndexByHeader_(sh, "WBS Element");
    const wbsVals =
      wbsCol > 0 ? sh.getRange(2, wbsCol, rowCount, 1).getDisplayValues() : [];

    const plaVals =
      plaCol > 0 ? sh.getRange(2, plaCol, rowCount, 1).getDisplayValues() : [];
    const matVals =
      matCol > 0 ? sh.getRange(2, matCol, rowCount, 1).getDisplayValues() : [];
    const svcVals =
      svcCol > 0 ? sh.getRange(2, svcCol, rowCount, 1).getDisplayValues() : [];
    const amtVals = sh.getRange(2, amtCol, rowCount, 1).getDisplayValues();
    const curVals = sh.getRange(2, curCol, rowCount, 1).getDisplayValues();

    const colInfo = ensureEnrichmentColumns_(sh);

    const out = [];
    for (var i = 0; i < rowCount; i++) {
      var r = [];
      r[COL["Installed PLA ID"]] = plaVals[i] ? plaVals[i][0] : "";
      r[COL["WBS Element"]] = wbsVals.length ? wbsVals[i][0] : "";
      r[COL["Material Description"]] = matVals[i] ? matVals[i][0] : "";
      r[COL["PO Service Short Text"]] = svcVals[i] ? svcVals[i][0] : "";
      r[COL["Amount To Billed"]] = amtVals[i] ? amtVals[i][0] : "";
      r[COL["Currency"]] = curVals[i] ? curVals[i][0] : "";

      out.push(getEnrichmentForRow_(r, lookupMap));
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

function appendRowsWithSourceLink_(sheet, rows, fileInfo, controllerSs) {
  if (rows.length === 0) return;
  controllerSs = controllerSs || getSpreadsheet_();

  // Add header row if sheet is new
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(
      COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
        CONFIG.enrichmentHeaders,
      ),
    );
  }

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

  const lookupMap = getPlaLookupMapCached_(controllerSs);
  const colInfo = ensureEnrichmentColumns_(sheet);

  const enrich = rows.map(function (r) {
    return getEnrichmentForRow_(r, lookupMap);
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

  getConfiguredYears_().forEach(function (year) {
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

// Hyperlink formulas
function fixSourceFileHyperlinksNow() {
  const ss = getSpreadsheet_();
  if (!ss) {
    notify_("No spreadsheet found.");
    return;
  }

  let totalFixed = 0;
  let details = [];

  getConfiguredYears_().forEach(function (year) {
    const sh = findOutputSheetByYear_(ss, year);
    if (!sh) {
      details.push(year + ": target sheet not found");
      return;
    }

    const sourceCol = getColumnIndexByHeader_(sh, CONFIG.sourceHeaderName);
    if (sourceCol < 1) {
      details.push(year + ": Source File column not found");
      return;
    }

    const lastRow = sh.getLastRow();
    if (lastRow < 2) {
      details.push(year + ": no data rows");
      return;
    }

    const rowCount = lastRow - 1;
    const range = sh.getRange(2, sourceCol, rowCount, 1);
    const values = range.getDisplayValues();
    const formulas = range.getFormulas();

    // Build file name map
    const sourceFolder = findFolder_(CONFIG.sourceFolderName);
    const fileMaps = sourceFolder
      ? buildFileUrlMapByName_(sourceFolder)
      : { byName: {}, byNorm: {}, filesArr: [] };
    const urlByName = fileMaps.byName || {};
    const urlByNorm = fileMaps.byNorm || {};
    const filesArr = fileMaps.filesArr || [];

    let fixed = 0;
    const newFormulas = [];

    for (let i = 0; i < values.length; i++) {
      const cellValue = String(values[i][0] || "").trim();
      const cellFormula = String(formulas[i][0] || "").trim();

      if (cellFormula && cellFormula.indexOf("=") === 0) {
        newFormulas.push([cellFormula]);
        continue;
      }

      if (cellValue.indexOf("=HYPERLINK") === 0) {
        newFormulas.push([cellValue]);
        fixed++;
        continue;
      }

      let matchedUrl = null;
      if (cellValue) {
        if (urlByName[cellValue]) {
          matchedUrl = urlByName[cellValue];
        } else {
          const nk = normalizeFileKey_(cellValue);
          if (nk && urlByNorm[nk] && urlByNorm[nk].length === 1) {
            matchedUrl = urlByNorm[nk][0];
          } else {
            const m = cellValue.match(/\((\d{4,})\)/);
            if (m && m[1]) {
              const token = m[1];
              const found = filesArr.filter(function (f) {
                return f.nameLower.indexOf(token) !== -1;
              });
              if (found.length === 1) matchedUrl = found[0].url;
            }
          }
        }
      }

      if (matchedUrl) {
        const linkFormula =
          '=HYPERLINK("' +
          matchedUrl.replace(/"/g, '""') +
          '","' +
          cellValue.replace(/"/g, '""') +
          '")';
        newFormulas.push([linkFormula]);
        fixed++;
      } else {
        newFormulas.push([cellValue]);
      }
    }

    if (fixed > 0) {
      range.setFormulas(newFormulas);
      totalFixed += fixed;
      details.push(
        year + ": converted " + fixed + " filename(s) to hyperlink formula(s)",
      );
    } else {
      details.push(year + ": no text hyperlinks found to convert");
    }
  });

  notify_(
    "Source File hyperlink conversion complete.\nTotal converted: " +
      totalFixed +
      "\n\n" +
      details.join("\n"),
  );
}

// Logging and maintenance
function logToTracker_(ss, fileInfo, result) {
  appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, null);
}

// Append tracker row
function appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, processedMap) {
  try {
    const fileName = String(fileInfo.name || "").trim();
    const sourceUrl = String(fileInfo.url || "").trim();
    if (isMarkedProcessedInMap_(processedMap, fileInfo)) {
      Logger.log("Tracker append skipped duplicate: " + fileName);
      return false;
    }

    // Use processedMap fast path; fall back to tracker scan for standalone calls
    if (!processedMap && trackerHasProcessedEntry_(ss, fileInfo)) {
      Logger.log("Tracker append skipped (already logged): " + fileName);
      return false;
    }

    const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
    if (!tracker) return false;
    const month = extractMonthFromDate_(fileInfo.dateCreated);
    tracker.appendRow([
      new Date(),
      fileInfo.name,
      month,
      fileInfo.year,
      result.rowsAdded,
      result.status,
      sourceUrl,
    ]);
    if (isDoneStatus_(result.status)) {
      markProcessedInMap_(processedMap, fileInfo);
    }
    return true;
  } catch (e) {
    Logger.log("appendTrackerRowIfNotDuplicate_ error: " + (e && e.message));
    return false;
  }
}

// Get month name from date
function extractMonthFromDate_(dateObj) {
  if (!dateObj) return "";
  const date = new Date(dateObj);
  const monthIndex = date.getMonth();
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return monthNames[monthIndex] || "";
}

// Skip files over 10 MB
function shouldSkipFileForPerformance_(file) {
  if (!file) return false;
  const fileSizeLimit = 10 * 1024 * 1024; // 10 MB in bytes
  const fileSize = file.getSize();
  return fileSize > fileSizeLimit;
}

// Perf logging
function ensurePerfSheetExists_() {
  const ss = getSpreadsheet_();
  if (!ss) return null;
  const name = "GR Automation Perf";
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow([
      "Timestamp",
      "File Name",
      "Year",
      "ConvertMs",
      "OpenMs",
      "ParseMs",
      "AppendMs",
      "TotalMs",
      "RowsAdded",
      "Status",
    ]);
  }
  return sh;
}

function logPerfEntry_(fileInfo, timings) {
  try {
    const sh = ensurePerfSheetExists_();
    if (!sh) return;
    sh.appendRow([
      new Date(),
      fileInfo.name,
      fileInfo.year,
      timings.convertMs || 0,
      timings.openMs || 0,
      timings.parseMs || 0,
      timings.appendMs || 0,
      timings.totalMs || 0,
      timings.rowsAdded || 0,
      timings.status || "",
    ]);
  } catch (e) {
    Logger.log("logPerfEntry_ error: " + (e && e.message));
  }
}

function normalizeTrackerFileLinkColumnNow() {
  const ss = getSpreadsheet_();
  if (!ss) return;

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() < 2) {
    notify_("No tracker rows found.");
    return;
  }

  const fileLinkCol = getColumnIndexByHeader_(tracker, "File Link");
  if (fileLinkCol < 1) {
    notify_("File Link column not found in tracker.");
    return;
  }

  const fileNameCol = getColumnIndexByHeader_(tracker, "File Name");
  if (fileNameCol < 1) {
    notify_("File Name column not found in tracker.");
    return;
  }

  const rowCount = tracker.getLastRow() - 1;
  const linkRange = tracker.getRange(2, fileLinkCol, rowCount, 1);
  const links = linkRange.getDisplayValues();
  const formulas = linkRange.getFormulas();
  const fileNames = tracker
    .getRange(2, fileNameCol, rowCount, 1)
    .getDisplayValues();

  const sourceFolder = findFolder_(CONFIG.sourceFolderName);
  const fileMaps = sourceFolder
    ? buildFileUrlMapByName_(sourceFolder)
    : { byName: {}, byNorm: {}, filesArr: [] };
  const urlByName = fileMaps.byName || {};
  const urlByNorm = fileMaps.byNorm || {};
  const filesArr = fileMaps.filesArr || [];

  let changed = 0;
  let recoveredByName = 0;
  const out = [];

  for (var i = 0; i < rowCount; i++) {
    const current = String(links[i][0] || "").trim();
    const formula = String(formulas[i][0] || "").trim();
    const fileName = String(fileNames[i][0] || "").trim();

    var finalUrl = "";

    if (formula) {
      finalUrl = extractUrlFromHyperlinkFormula_(formula);
    }

    if (!finalUrl && /^https?:\/\//i.test(current)) {
      finalUrl = current;
    }

    if (!finalUrl && fileName && urlByName[fileName]) {
      finalUrl = urlByName[fileName];
      recoveredByName++;
    }

    // Try normalized key
    if (!finalUrl && fileName) {
      const nk = normalizeFileKey_(fileName);
      if (nk && urlByNorm[nk] && urlByNorm[nk].length === 1) {
        finalUrl = urlByNorm[nk][0];
        recoveredByName++;
      }
    }

    const next = finalUrl || current;
    if (next !== current || formula) changed++;

    out.push([next]);
  }

  linkRange.setValues(out);

  notify_(
    "Tracker File Link normalization complete.\n" +
      "Rows scanned: " +
      rowCount +
      "\n" +
      "Rows updated: " +
      changed +
      "\n" +
      "Recovered by file name match: " +
      recoveredByName,
  );
}

function extractUrlFromHyperlinkFormula_(formula) {
  const m = String(formula || "").match(/=\s*HYPERLINK\(\s*"([^"]+)"/i);
  return m && m[1] ? m[1] : "";
}

function buildFileUrlMapByName_(folder) {
  const byName = {};
  const byNorm = {};
  const filesArr = [];
  const files = folder.getFiles();

  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    const url = f.getUrl();
    const id = f.getId();
    filesArr.push({
      name: name,
      nameLower: String(name).toLowerCase(),
      url: url,
      id: id,
    });
    if (!byName[name]) byName[name] = url;
    const key = normalizeFileKey_(name);
    if (!byNorm[key]) byNorm[key] = [];
    byNorm[key].push(url);
  }

  return { byName: byName, byNorm: byNorm, filesArr: filesArr };
}

// Backfill Source links
function backfillMissingSourceLinks_(dryRun) {
  const ss = getSpreadsheet_();
  if (!ss) return "Bound spreadsheet not found.";

  const sourceFolder = findFolder_(CONFIG.sourceFolderName);
  if (!sourceFolder)
    return "Source folder not found: " + CONFIG.sourceFolderName;

  const filesArr = [];
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    filesArr.push({
      name: String(f.getName() || ""),
      nameLower: String(f.getName() || "").toLowerCase(),
      url: f.getUrl(),
      id: f.getId(),
    });
  }

  const years = getConfiguredYears_();
  let totalScanned = 0,
    totalUpdated = 0,
    totalAmbiguous = 0,
    totalNoMatch = 0;
  const notes = [];

  years.forEach(function (year) {
    const sh = findOutputSheetByYear_(ss, year);
    if (!sh) {
      notes.push(year + ": sheet not found");
      return;
    }

    const lastRow = sh.getLastRow();
    if (lastRow < 2) {
      notes.push(year + ": no data rows");
      return;
    }

    const sourceCol = getColumnIndexByHeader_(sh, CONFIG.sourceHeaderName);
    if (sourceCol < 1) {
      notes.push(year + ": Source File column not found");
      return;
    }

    const poCol = getColumnIndexByHeader_(sh, "PO No.");
    const grCol = getColumnIndexByHeader_(sh, "GR Mat. Doc.");
    const wbsCol = getColumnIndexByHeader_(sh, "WBS Element");
    const poPlaCol = getColumnIndexByHeader_(sh, "PO PLA ID");
    const instPlaCol = getColumnIndexByHeader_(sh, "Installed PLA ID");

    const rowCount = lastRow - 1;
    const maxCol = Math.max(sh.getLastColumn(), sourceCol);
    const data = sh.getRange(2, 1, rowCount, maxCol).getDisplayValues();

    const outSources = [];
    let scanned = 0,
      updated = 0,
      ambiguous = 0,
      nomatch = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const existing = String(row[sourceCol - 1] || "").trim();
      scanned++;
      if (existing) {
        outSources.push([existing]);
        continue;
      }

      const tokens = [];
      if (poCol > 0) tokens.push(String(row[poCol - 1] || "").trim());
      if (grCol > 0) tokens.push(String(row[grCol - 1] || "").trim());
      if (wbsCol > 0) tokens.push(String(row[wbsCol - 1] || "").trim());
      if (poPlaCol > 0) tokens.push(String(row[poPlaCol - 1] || "").trim());
      if (instPlaCol > 0) tokens.push(String(row[instPlaCol - 1] || "").trim());

      const tokensClean = tokens
        .filter(function (t) {
          return t && String(t).trim() !== "";
        })
        .map(function (t) {
          return String(t).toLowerCase();
        });

      if (tokensClean.length === 0) {
        outSources.push([""]);
        nomatch++;
        continue;
      }

      const candidates = [];
      for (let fI = 0; fI < filesArr.length; fI++) {
        const fn = filesArr[fI].nameLower;
        let matchCount = 0;
        for (let ti = 0; ti < tokensClean.length; ti++) {
          if (tokensClean[ti] && fn.indexOf(tokensClean[ti]) !== -1)
            matchCount++;
        }
        if (matchCount > 0)
          candidates.push({ file: filesArr[fI], matchCount: matchCount });
      }

      if (candidates.length === 1) {
        const f = candidates[0].file;
        const formula =
          '=HYPERLINK("' +
          f.url.replace(/"/g, '""') +
          '","' +
          f.name.replace(/"/g, '""') +
          '")';
        outSources.push([formula]);
        updated++;
      } else if (candidates.length > 1) {
        // Sort by match count desc
        candidates.sort(function (a, b) {
          return b.matchCount - a.matchCount;
        });
        if (
          candidates[0].matchCount >
          (candidates[1] ? candidates[1].matchCount : 0)
        ) {
          const f = candidates[0].file;
          const formula =
            '=HYPERLINK("' +
            f.url.replace(/"/g, '""') +
            '","' +
            f.name.replace(/"/g, '""') +
            '")';
          outSources.push([formula]);
          updated++;
        } else {
          outSources.push([""]);
          ambiguous++;
        }
      } else {
        outSources.push([""]);
        nomatch++;
      }
    }

    if (!dryRun) {
      try {
        sh.getRange(2, sourceCol, outSources.length, 1).setValues(outSources);
      } catch (e) {
        notes.push(
          year + ": error writing Source File column (" + e.message + ")",
        );
      }
    }

    totalScanned += scanned;
    totalUpdated += updated;
    totalAmbiguous += ambiguous;
    totalNoMatch += nomatch;
    notes.push(
      year +
        ": scanned=" +
        scanned +
        ", updated=" +
        updated +
        ", ambiguous=" +
        ambiguous +
        ", no match=" +
        nomatch +
        (dryRun ? " (dry run)" : ""),
    );
  });

  const msg =
    "Backfill complete. Scanned: " +
    totalScanned +
    ", updated: " +
    totalUpdated +
    ", ambiguous: " +
    totalAmbiguous +
    ", no match: " +
    totalNoMatch +
    "\n\n" +
    notes.join("\n");

  if (!dryRun) notify_(msg);
  return msg;
}

function backfillMissingSourceLinksPreview() {
  return backfillMissingSourceLinks_(true);
}

function backfillMissingSourceLinksNow() {
  return backfillMissingSourceLinks_(false);
}

function backfillTrackerMonthsNow() {
  const ss = getSpreadsheet_();
  if (!ss) {
    notify_("No spreadsheet found.");
    return;
  }

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() < 2) {
    notify_("No tracker rows found.");
    return;
  }

  const fileNameCol = getColumnIndexByHeader_(tracker, "File Name");
  const monthCol = getColumnIndexByHeader_(tracker, "Month");

  if (fileNameCol < 1 || monthCol < 1) {
    notify_("File Name or Month column not found in tracker.");
    return;
  }

  const sourceFolder = findFolder_(CONFIG.sourceFolderName);
  if (!sourceFolder) {
    notify_("Source folder not found.");
    return;
  }

  // Build file name map
  const fileMap = {};
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    fileMap[f.getName()] = f;
  }

  const rowCount = tracker.getLastRow() - 1;
  const fileNames = tracker
    .getRange(2, fileNameCol, rowCount, 1)
    .getDisplayValues();
  const months = [];
  let found = 0;

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = String(fileNames[i][0] || "").trim();
    let month = "";

    // Get file creation date
    if (fileName && fileMap[fileName]) {
      try {
        const file = fileMap[fileName];
        const dateCreated = file.getDateCreated();
        month = extractMonthFromDate_(dateCreated);
        found++;
      } catch (e) {
        Logger.log("Could not get date for file: " + fileName);
      }
    }

    months.push([month]);
  }

  tracker.getRange(2, monthCol, rowCount, 1).setValues(months);

  notify_(
    "Month backfill complete. Updated " +
      rowCount +
      " row(s), matched " +
      found +
      " file(s).",
  );
}

function requeueNoDataFiles() {
  const ss = getSpreadsheet_();
  if (!ss) return;

  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!tracker || tracker.getLastRow() <= 1) return;

  let statusCol = getColumnIndexByHeader_(tracker, "Status");
  if (statusCol < 1) statusCol = 6;
  const data = tracker
    .getRange(2, statusCol, tracker.getLastRow() - 1, 1)
    .getDisplayValues();
  let removed = 0;

  for (let i = data.length - 1; i >= 0; i--) {
    const status = normalizeStatus_(data[i][0]);
    if (!isDoneStatus_(status)) {
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

function cleanupDuplicatesPreview() {
  return cleanupDuplicates_(true);
}

function cleanupDuplicatesNow() {
  try {
    const ui = SpreadsheetApp.getUi();
    const r = ui.alert(
      "Cleanup Duplicates",
      "This will remove duplicate rows from the tracker and output sheets. Continue?",
      ui.ButtonSet.YES_NO,
    );
    if (r !== ui.Button.YES) {
      const msg = "Cleanup cancelled.";
      notify_(msg);
      return msg;
    }
  } catch (eUi) {}

  return cleanupDuplicates_(false);
}

function cleanupDuplicates_(dryRun) {
  const ss = getSpreadsheet_();
  if (!ss) {
    const msg = "No spreadsheet found.";
    notify_(msg);
    return msg;
  }

  const lock = LockService.getScriptLock();
  const docLock =
    typeof LockService.getDocumentLock === "function"
      ? LockService.getDocumentLock()
      : null;

  const gotScriptLock = lock.tryLock(5000);
  const gotDocLock = !docLock || docLock.tryLock(5000);
  if (!gotScriptLock || !gotDocLock) {
    try {
      if (gotDocLock && docLock) docLock.releaseLock();
    } catch (eDocLockAcquire) {}
    try {
      if (gotScriptLock) lock.releaseLock();
    } catch (eLockAcquire) {}
    const msg =
      "Another run is active. Please retry cleanup after current processing completes.";
    notify_(msg);
    return msg;
  }

  try {
    const notes = [];
    let trackerPlan = {
      duplicateGroupCount: 0,
      deleteRows: [],
      previewExamples: [],
    };
    const doneTrackerKeyMap = buildTrackerExactDoneKeyMap_(ss);

    const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
    if (tracker && tracker.getLastRow() > 1) {
      trackerPlan = buildTrackerDuplicateCleanupPlan_(tracker);
    } else {
      notes.push("Tracker not found or has no data rows.");
    }

    const years = getConfiguredYears_();
    const outputPlans = [];
    let outputGroupCount = 0;
    let outputDeleteCount = 0;

    years.forEach(function (year) {
      const sh = findOutputSheetByYear_(ss, year);
      if (!sh || sh.getLastRow() <= 1) {
        notes.push(String(year) + ": skipped (sheet missing or empty).");
        return;
      }

      const plan = buildOutputDuplicateCleanupPlan_(
        ss,
        sh,
        year,
        doneTrackerKeyMap,
      );
      outputPlans.push(plan);
      outputGroupCount += plan.duplicateGroupCount;
      outputDeleteCount += plan.deleteRows.length;
    });

    let removedTracker = 0;
    let removedOutput = 0;
    if (!dryRun) {
      removedTracker = deleteRowsInReverse_(tracker, trackerPlan.deleteRows);
      outputPlans.forEach(function (plan) {
        plan.deletedCount = deleteRowsInReverse_(plan.sheet, plan.deleteRows);
        removedOutput += plan.deletedCount;
      });
    }

    notes.push(
      "Tracker duplicates: groups=" +
        trackerPlan.duplicateGroupCount +
        ", rows " +
        (dryRun ? "to remove=" : "removed=") +
        (dryRun ? trackerPlan.deleteRows.length : removedTracker),
    );

    if (dryRun && trackerPlan.previewExamples.length > 0) {
      notes.push("Tracker examples (keep row -> remove rows):");
      trackerPlan.previewExamples.forEach(function (line) {
        notes.push("  " + line);
      });
    }

    notes.push(
      "Output duplicates: groups=" +
        outputGroupCount +
        ", rows " +
        (dryRun ? "to remove=" : "removed=") +
        (dryRun ? outputDeleteCount : removedOutput),
    );

    outputPlans.forEach(function (plan) {
      notes.push(
        plan.sheet.getName() +
          ": groups=" +
          plan.duplicateGroupCount +
          ", rows " +
          (dryRun ? "to remove=" : "removed=") +
          (dryRun ? plan.deleteRows.length : plan.deletedCount || 0),
      );

      if (dryRun && plan.previewExamples && plan.previewExamples.length > 0) {
        notes.push(plan.sheet.getName() + " examples (keep row -> remove rows):");
        plan.previewExamples.forEach(function (line) {
          notes.push("  " + line);
        });
      }
    });

    if (!dryRun) {
      notes.push(
        "Total rows removed: " + String(removedTracker + removedOutput) + ".",
      );
    } else {
      notes.push(
        "Total rows to remove: " +
          String(trackerPlan.deleteRows.length + outputDeleteCount) +
          ".",
      );
    }

    const header = dryRun
      ? "Duplicate cleanup preview complete."
      : "Duplicate cleanup complete.";
    const summary = header + "\n\n" + notes.join("\n");
    notify_(summary);
    return summary;
  } catch (e) {
    const msg = "Duplicate cleanup failed: " + e.message;
    notify_(msg);
    throw e;
  } finally {
    try {
      if (docLock) docLock.releaseLock();
    } catch (eDocLock) {}
    try {
      lock.releaseLock();
    } catch (eLock) {}
  }
}

function buildTrackerDuplicateCleanupPlan_(tracker) {
  const rowCount = tracker.getLastRow() - 1;
  const lastCol = Math.max(7, tracker.getLastColumn());
  const values = tracker.getRange(2, 1, rowCount, lastCol).getValues();
  const display = tracker.getRange(2, 1, rowCount, lastCol).getDisplayValues();
  const formulas = tracker.getRange(2, 1, rowCount, lastCol).getFormulas();

  let tsCol = getColumnIndexByHeader_(tracker, "Timestamp");
  let fileNameCol = getColumnIndexByHeader_(tracker, "File Name");
  let fileLinkCol = getColumnIndexByHeader_(tracker, "File Link");
  let statusCol = getColumnIndexByHeader_(tracker, "Status");
  if (tsCol < 1) tsCol = 1;
  if (fileNameCol < 1) fileNameCol = 2;
  if (fileLinkCol < 1) fileLinkCol = 7;
  if (statusCol < 1) statusCol = 6;

  const groups = {};
  for (let i = 0; i < rowCount; i++) {
    const status = normalizeStatus_(display[i][statusCol - 1]);
    if (status !== "done") continue;

    const rowNum = i + 2;
    const fileName = String(display[i][fileNameCol - 1] || "").trim();
    const linkText = String(display[i][fileLinkCol - 1] || "").trim();
    const linkFormula = formulas[i][fileLinkCol - 1];
    const linkUrl = extractUrlFromCell_(linkText, linkFormula);
    const key = buildTrackerDuplicateKey_(fileName, linkUrl);
    if (!key) continue;

    const tsMs = toTimestampMs_(values[i][tsCol - 1], display[i][tsCol - 1]);
    if (!groups[key]) groups[key] = { doneRows: [] };
    groups[key].doneRows.push({
      rowNum: rowNum,
      rowDisplay: display[i],
      tsMs: tsMs,
    });
  }

  const deleteRows = [];
  let duplicateGroupCount = 0;
  const previewGroups = {};

  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    const doneRows = g.doneRows || [];
    if (doneRows.length <= 1) return;

    let keep = doneRows[0];
    for (let i = 1; i < doneRows.length; i++) {
      const row = doneRows[i];
      if (
        shouldKeepNewTrackerRow_(keep.rowNum, keep.tsMs, row.rowNum, row.tsMs)
      ) {
        keep = row;
      }
    }

    const duplicates = [];
    doneRows.forEach(function (row) {
      if (row.rowNum === keep.rowNum) return;
      deleteRows.push(row.rowNum);
      duplicates.push({
        rowNum: row.rowNum,
        rowDisplay: row.rowDisplay,
      });
    });

    if (duplicates.length === 0) return;
    duplicateGroupCount++;
    previewGroups[k] = {
      keepRowNum: keep.rowNum,
      duplicates: duplicates,
    };
  });

  const previewExamples = buildDuplicatePreviewExamples_(previewGroups, 5, 8);

  return {
    duplicateGroupCount: duplicateGroupCount,
    deleteRows: deleteRows,
    previewExamples: previewExamples,
  };
}

function buildOutputDuplicateCleanupPlan_(ss, sheet, year, doneTrackerKeyMap) {
  const sourceCol = getColumnIndexByHeader_(sheet, CONFIG.sourceHeaderName);
  if (sourceCol < 1) {
    return {
      year: year,
      sheet: sheet,
      duplicateGroupCount: 0,
      deleteRows: [],
      previewExamples: [],
    };
  }

  const rowCount = sheet.getLastRow() - 1;
  const lastCol = sheet.getLastColumn();
  const display = sheet.getRange(2, 1, rowCount, lastCol).getDisplayValues();
  const formulas = sheet.getRange(2, 1, rowCount, lastCol).getFormulas();

  const groups = {};
  for (let i = 0; i < rowCount; i++) {
    const rowNum = i + 2;
    const sourceText = String(display[i][sourceCol - 1] || "").trim();
    const sourceUrl = extractUrlFromCell_(sourceText, formulas[i][sourceCol - 1]);
    const key = buildSourceDuplicateKey_(sourceText, sourceUrl);
    if (!key) continue;

    const existing = groups[key];
    if (!existing) {
      groups[key] = {
        keepRowNum: rowNum,
        keepIndex: i,
        duplicates: [],
        sourceText: sourceText,
        sourceUrl: sourceUrl,
      };
      continue;
    }

    if (!existing.sourceText && sourceText) existing.sourceText = sourceText;
    if (!existing.sourceUrl && sourceUrl) existing.sourceUrl = sourceUrl;

    existing.duplicates.push({
      rowNum: existing.keepRowNum,
      rowDisplay: display[existing.keepIndex],
    });
    existing.keepRowNum = rowNum;
    existing.keepIndex = i;
  }

  const deleteRows = [];
  let duplicateGroupCount = 0;
  const previewGroups = {};

  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    if (!g.duplicates || g.duplicates.length === 0) return;

    const fileInfo = {
      name: String(g.sourceText || "").trim(),
      id: extractDriveIdFromUrl_(g.sourceUrl),
      url: String(g.sourceUrl || "").trim(),
    };
    if (!trackerHasExactDoneEntry_(ss, fileInfo, doneTrackerKeyMap)) return;

    duplicateGroupCount++;
    g.duplicates.forEach(function (d) {
      deleteRows.push(d.rowNum);
    });

    previewGroups[k] = {
      keepRowNum: g.keepRowNum,
      duplicates: g.duplicates,
    };
  });

  const previewExamples = buildDuplicatePreviewExamples_(previewGroups, 5, 8);

  return {
    year: year,
    sheet: sheet,
    duplicateGroupCount: duplicateGroupCount,
    deleteRows: deleteRows,
    previewExamples: previewExamples,
  };
}

function buildDuplicatePreviewExamples_(groups, groupLimit, rowLimit) {
  const examples = [];
  const keys = Object.keys(groups || {});

  for (let i = 0; i < keys.length; i++) {
    if (examples.length >= groupLimit) break;

    const key = keys[i];
    const g = groups[key];
    if (!g || !g.duplicates || g.duplicates.length === 0) continue;

    const rows = g.duplicates
      .map(function (d) {
        return Number(d.rowNum);
      })
      .filter(function (n) {
        return !isNaN(n) && n >= 2;
      })
      .sort(function (a, b) {
        return a - b;
      });

    if (rows.length === 0) continue;

    const shown = rows.slice(0, rowLimit);
    let removeRowsText = shown.join(", ");
    if (rows.length > rowLimit) removeRowsText += ", ...";

    examples.push(
      "keep row " +
        g.keepRowNum +
        " -> remove rows " +
        removeRowsText +
        " (key " +
        shortenPreviewKey_(key, 48) +
        ")",
    );
  }

  return examples;
}

function shortenPreviewKey_(key, maxLen) {
  const s = String(key || "");
  const n = Number(maxLen) || 48;
  if (s.length <= n) return s;
  if (n <= 3) return s.substring(0, n);
  return s.substring(0, n - 3) + "...";
}

function buildTrackerDuplicateKey_(fileName, fileUrl) {
  const fileId = extractDriveIdFromUrl_(fileUrl);
  if (fileId) return "id:" + fileId;

  const normalizedName = normalizeFileKey_(fileName);
  if (normalizedName) return "name:" + normalizedName;

  const normalizedUrl = normalizeDriveUrlForKey_(fileUrl);
  if (normalizedUrl) return "url:" + normalizedUrl;

  return "";
}

function buildSourceDuplicateKey_(sourceText, sourceUrl) {
  const sourceId = extractDriveIdFromUrl_(sourceUrl);
  if (sourceId) return "id:" + sourceId;

  const normalizedUrl = normalizeDriveUrlForKey_(sourceUrl);
  if (normalizedUrl) return "url:" + normalizedUrl;

  const normalizedName = normalizeFileKey_(sourceText);
  if (normalizedName) return "name:" + normalizedName;

  return "";
}

function toTimestampMs_(value, displayValue) {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (!isNaN(ms)) return ms;
  }

  const parsed = Date.parse(String(displayValue || value || ""));
  return isNaN(parsed) ? NaN : parsed;
}

function shouldKeepNewTrackerRow_(keepRowNum, keepTsMs, rowNum, tsMs) {
  const keepHasTs = typeof keepTsMs === "number" && !isNaN(keepTsMs);
  const rowHasTs = typeof tsMs === "number" && !isNaN(tsMs);
  if (keepHasTs && rowHasTs) {
    if (tsMs === keepTsMs) return rowNum > keepRowNum;
    return tsMs > keepTsMs;
  }
  return rowNum > keepRowNum;
}

function deleteRowsInReverse_(sheet, rows) {
  if (!sheet || !rows || rows.length === 0) return 0;

  const unique = {};
  for (let i = 0; i < rows.length; i++) {
    const r = Number(rows[i]);
    if (r >= 2) unique[r] = true;
  }

  const sorted = Object.keys(unique)
    .map(function (k) {
      return Number(k);
    })
    .sort(function (a, b) {
      return b - a;
    });

  for (let i = 0; i < sorted.length; i++) {
    sheet.deleteRow(sorted[i]);
  }

  return sorted.length;
}

function writeCleanupBackupSheet_(ss, records) {
  if (!ss || !records || records.length === 0) return "";

  const tz = Session.getScriptTimeZone() || "GMT";
  const stamp = Utilities.formatDate(new Date(), tz, "yyyyMMdd-HHmmss");
  const baseName = "Duplicate Cleanup Backup " + stamp;

  let name = baseName;
  let suffix = 2;
  while (ss.getSheetByName(name)) {
    name = baseName + "-" + suffix;
    suffix++;
  }

  const sh = ss.insertSheet(name);
  const header = [
    "Source Sheet",
    "Original Row",
    "Duplicate Key",
    "Kept Row",
    "Row Snapshot",
  ];
  sh.getRange(1, 1, 1, header.length).setValues([header]);

  const values = records.map(function (r) {
    return [
      r.sourceSheet || "",
      r.rowNumber || "",
      r.duplicateKey || "",
      r.keptRowNumber || "",
      (r.rowDisplay || [])
        .map(function (c) {
          return String(c || "");
        })
        .join(" | "),
    ];
  });

  if (values.length > 0) {
    sh.getRange(2, 1, values.length, header.length).setValues(values);
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, header.length);

  return name;
}

// Notification
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

  const years = getConfiguredYears_();
  while (files.hasNext()) {
    const f = files.next();
    const n = f.getName().toLowerCase();
    const hasYear = years.some(function (y) {
      return n.indexOf(y) !== -1;
    });
    if (hasYear && (n.indexOf(".xlsx") !== -1 || n.indexOf(".xls") !== -1)) {
      testFile = f;
      break;
    }
  }

  if (!testFile) {
    SpreadsheetApp.getUi().alert(
      "No Excel file found for configured years: " +
        getConfiguredYears_().join(", "),
    );
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
  let msg = [];
  msg.push("All sheets: " + allNames.join(" | "));
  const years = getConfiguredYears_();
  years.forEach(function (y) {
    const sh = findOutputSheetByYear_(ss, y);
    msg.push("Detected " + y + " sheet: " + (sh ? sh.getName() : "NOT FOUND"));
    if (sh) {
      msg.push(
        y +
          " Installed PLA ID col: " +
          getColumnIndexByHeader_(sh, "Installed PLA ID"),
      );
      msg.push(
        y +
          " Regional Area col: " +
          getColumnIndexByHeader_(sh, "Regional Area"),
      );
      msg.push(
        y +
          " Cleaned Site Name col: " +
          getColumnIndexByHeader_(sh, "Cleaned Site Name"),
      );
      msg.push(
        y + " Territory col: " + getColumnIndexByHeader_(sh, "Territory"),
      );
    }
  });

  notify_(msg.join("\n"));
}

// Year picker modal
function showYearPicker() {
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family: Arial, sans-serif; padding:12px;">' +
      '<label for="yearSelect">Select existing year to process:</label><br/>' +
      '<select id="yearSelect" style="width:100%; margin-top:8px; margin-bottom:8px;"></select>' +
      '<div style="margin-top:6px; margin-bottom:6px;">OR enter a new year to add and process:</div>' +
      '<input id="newYear" placeholder="e.g. 2027" style="width:48%; margin-right:4%;">' +
      '<input id="newSheet" placeholder="Sheet name (optional)" style="width:48%;"><br/>' +
      '<label style="font-size:90%;"><input type="checkbox" id="createSheet" checked> Create sheet in this spreadsheet if missing</label>' +
      '<div style="text-align:right; margin-top:10px;"><button id="startBtn" onclick="startProcess()">Start</button> <button onclick="google.script.host.close()">Cancel</button></div>' +
      "<script>" +
      'function populate(years){ var sel = document.getElementById("yearSelect"); sel.innerHTML = ""; years.forEach(function(y){ var o = document.createElement("option"); o.value = y; o.text = y; sel.appendChild(o); }); }' +
      'function startProcess(){ var newY = document.getElementById("newYear").value.trim(); var sheetName = document.getElementById("newSheet").value.trim(); var create = document.getElementById("createSheet").checked; var sel = document.getElementById("yearSelect"); var y = sel.value; document.getElementById("startBtn").disabled = true; if(newY){ if(!/^[0-9]{4}$/.test(newY)){ alert("Enter a valid 4-digit year."); document.getElementById("startBtn").disabled = false; return; } google.script.run.withSuccessHandler(function(msg){ alert(msg); google.script.run.withSuccessHandler(function(msg2){ alert(msg2); google.script.host.close(); }).runConsolidateForYear(newY); }).addConfiguredYear(newY, sheetName, "", create); } else { if(!y){ alert("Please select a year or enter a new one."); document.getElementById("startBtn").disabled = false; return; } google.script.run.withSuccessHandler(function(msg){ alert(msg); google.script.host.close(); }).runConsolidateForYear(y); } }' +
      "google.script.run.withSuccessHandler(populate).getConfiguredYearsForUi();" +
      "</script>" +
      "</div>",
  )
    .setWidth(520)
    .setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, "Process Year");
}

function getConfiguredYearsForUi() {
  return getConfiguredYears_();
}

function runConsolidateForYear(year) {
  const startTime = Date.now();
  const lock = LockService.getScriptLock();
  const docLock =
    typeof LockService.getDocumentLock === "function"
      ? LockService.getDocumentLock()
      : null;
  const gotScriptLock = lock.tryLock(5000);
  const gotDocLock = !docLock || docLock.tryLock(5000);
  if (!gotScriptLock || !gotDocLock) {
    try {
      if (gotDocLock && docLock) docLock.releaseLock();
    } catch (eDocLockAcquire) {}
    try {
      if (gotScriptLock) lock.releaseLock();
    } catch (eLock) {}
    return "Another run is already in progress. Try again later.";
  }
  try {
    const ss = getSpreadsheet_();
    if (!ss) return "Target spreadsheet not found. Run setup first.";
    ensureSheets_(ss);

    const sourceFolder = findFolder_(CONFIG.sourceFolderName);
    if (!sourceFolder)
      return "Source folder not found: " + CONFIG.sourceFolderName;

    const processedMap = loadProcessedMap_(ss);
    const doneKeyMap = buildTrackerExactDoneKeyMap_(ss);
    const failedAttemptsMap = loadFailedAttemptsMap_(ss);
    const candidates = listCandidateFilesByYear_(
      sourceFolder,
      processedMap,
      failedAttemptsMap,
    );

    if (!candidates || !candidates[year] || candidates[year].length === 0) {
      return "No candidate files found for " + year;
    }

    const toProcess = candidates[year].slice(0, CONFIG.maxFilesPerRunPerYear);
    const tempFolder = getOrCreateTempFolder_();

    let processedCount = 0;
    let totalRowsAdded = 0;

    for (let i = 0; i < toProcess.length; i++) {
      if (Date.now() - startTime > CONFIG.maxRuntimeMs) {
        break;
      }

      const fileInfo = toProcess[i];
      if (isMarkedProcessedInMap_(processedMap, fileInfo)) {
        Logger.log("Skipping already processed file: " + fileInfo.name);
        continue;
      }

      if (hasAnyProcessingKeyMatch_(doneKeyMap, fileInfo)) {
        markProcessedInMap_(processedMap, fileInfo);
        Logger.log(
          "Skipping file already present in tracker log: " + fileInfo.name,
        );
        continue;
      }

      const result = processSingleFile_(ss, fileInfo, tempFolder);
      appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, processedMap);

      const st = normalizeStatus_(result.status);
      if (isDoneStatus_(st) || st.indexOf("needs manual check") === 0) {
        markProcessedInMap_(processedMap, fileInfo);
      }

      processedCount++;
      totalRowsAdded += result.rowsAdded;
    }

    return "Done: files=" + processedCount + ", rows=" + totalRowsAdded;
  } catch (e) {
    Logger.log("runConsolidateForYear error: " + (e && e.message));
    return "Error: " + (e && e.message ? e.message : String(e));
  } finally {
    try {
      if (docLock) docLock.releaseLock();
    } catch (er2) {}
    try {
      lock.releaseLock();
    } catch (er) {}
  }
}

function debugAutoProcessingStatus() {
  const ss = getSpreadsheet_();
  if (!ss) {
    notify_("No spreadsheet found from getSpreadsheet_.");
    return;
  }

  const scriptProps = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "consolidateGRTemplateData";
  });

  let totalExcel = 0;
  let withYear = 0;
  let noYear = 0;
  let alreadyDone = 0;
  let blockedByFailedAttempts = 0;
  let pending = 0;
  const sampleNoYear = [];

  const sourceFolder = findFolder_(CONFIG.sourceFolderName);
  if (sourceFolder) {
    const processedMap = loadProcessedMap_(ss);
    const failedAttemptsMap = loadFailedAttemptsMap_(ss);
    const files = sourceFolder.getFiles();

    while (files.hasNext()) {
      const f = files.next();
      const name = f.getName();
      const lower = name.toLowerCase();
      const isExcel =
        lower.indexOf(".xlsx") !== -1 || lower.indexOf(".xls") !== -1;
      if (!isExcel) continue;

      totalExcel++;

      const years = getConfiguredYears_();
      const hasYear = years.some(function (y) {
        return name.indexOf(y) !== -1;
      });
      if (!hasYear) {
        noYear++;
        if (sampleNoYear.length < 5) sampleNoYear.push(name);
        continue;
      }

      withYear++;

      if (processedMap[name]) {
        alreadyDone++;
        continue;
      }

      if ((failedAttemptsMap[name] || 0) >= CONFIG.maxFailedAttemptsPerFile) {
        blockedByFailedAttempts++;
        continue;
      }

      pending++;
    }
  }

  const msg = [
    "Auto Processing Status",
    "",
    "Trigger active count: " + triggers.length,
    "Last run started: " +
      (scriptProps.getProperty("LAST_RUN_STARTED_AT") || "N/A"),
    "Last run finished: " +
      (scriptProps.getProperty("LAST_RUN_FINISHED_AT") || "N/A"),
    "Last run status: " + (scriptProps.getProperty("LAST_RUN_STATUS") || "N/A"),
    "Last active file: " +
      (scriptProps.getProperty("LAST_RUN_ACTIVE_FILE") || "N/A"),
    "Last active year: " +
      (scriptProps.getProperty("LAST_RUN_ACTIVE_YEAR") || "N/A"),
    "Last stage: " + (scriptProps.getProperty("LAST_RUN_STAGE") || "N/A"),
    "Last candidate counts: " +
      (scriptProps.getProperty("LAST_RUN_CANDIDATES") || "N/A"),
    "",
    "Source folder stats",
    "Excel files total: " + totalExcel,
    "Excel files with " +
      getConfiguredYears_().join("/") +
      " in name: " +
      withYear,
    "Excel files skipped (missing year in file name): " + noYear,
    "Already done: " + alreadyDone,
    "Blocked by failed-attempt limit: " + blockedByFailedAttempts,
    "Pending for next runs: " + pending,
  ];

  if (sampleNoYear.length) {
    msg.push("");
    msg.push(
      "Sample skipped files (missing " +
        getConfiguredYears_().join("/") +
        " in filename):",
    );
    sampleNoYear.forEach(function (n) {
      msg.push("- " + n);
    });
  }

  notify_(msg.join("\n"));
}

function findOutputSheetByYear_(ss, year) {
  const cfg = getConfigMappingsCached_() || {};
  const mapping = cfg[year] || null;
  const desiredName = getOutputSheetNameForYear(year);

  if (mapping && mapping.spreadsheetId) {
    try {
      let targetSs = null;
      try {
        targetSs = SpreadsheetApp.openById(mapping.spreadsheetId);
      } catch (eOpen) {
        Logger.log(
          "Cannot open mapped spreadsheet for year " +
            year +
            ": " +
            (eOpen && eOpen.message),
        );
        targetSs = null;
      }

      if (targetSs) {
        const sheetNameToUse =
          mapping.sheetName && mapping.sheetName.trim()
            ? mapping.sheetName
            : desiredName;
        let sh =
          targetSs.getSheetByName(sheetNameToUse) ||
          targetSs.getSheetByName(desiredName);
        if (sh) return sh;

        try {
          sh = targetSs.insertSheet(sheetNameToUse);
          if (sh.getLastRow() === 0) {
            sh.appendRow(
              COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
                CONFIG.enrichmentHeaders,
              ),
            );
          }
          return sh;
        } catch (eCreate) {
          Logger.log(
            "Cannot create sheet in mapped spreadsheet for year " +
              year +
              ": " +
              (eCreate && eCreate.message),
          );
        }
      }
    } catch (e) {
      Logger.log(
        "Error handling mapped spreadsheet for year " +
          year +
          ": " +
          (e && e.message),
      );
    }
  }

  try {
    const exact = ss.getSheetByName(desiredName);
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

    // Create sheet if missing
    try {
      const created = ss.insertSheet(desiredName);
      if (created.getLastRow() === 0) {
        created.appendRow(
          COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
            CONFIG.enrichmentHeaders,
          ),
        );
      }
      return created;
    } catch (eCreateCtrl) {
      Logger.log(
        "Cannot create output sheet for year " +
          year +
          " in controller: " +
          (eCreateCtrl && eCreateCtrl.message),
      );
      return null;
    }
  } catch (eAll) {
    Logger.log(
      "findOutputSheetByYear_ fallback error for year " +
        year +
        ": " +
        (eAll && eAll.message),
    );
    return null;
  }
}
