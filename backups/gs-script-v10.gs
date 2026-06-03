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
  maxFilesPerRunTotal: 12,
  maxFilesPerRunPerYear: 6,
  maxRuntimeMs: 240000,
  preferLastUpdatedForYearFallback: true,
  allowDateYearFallbackWhenNameMissing: true,
  useIncrementalSourceScan: true,
  incrementalScanLookbackHours: 24,
  incrementalScanOverlapMinutes: 15,
  incrementalScanPageSize: 250,
  incrementalScanMaxFilesToInspect: 2000,
  forceFullScanEveryRuns: 30,
  fullScanMaxFilesToInspect: 0,
  headerScanMaxRows: 80,
  maxRowsPerSheetScan: 2500,
  maxColsPerSheetScan: 45,
  preferDirectTemplateTabFastPath: true,
  useNumberFormatCurrencyHints: false,
  openRetryAttempts: 3,
  openRetryDelayMs: 500,
  minHeaderMatches: 3,
  maxFailedAttemptsPerFile: 1,
  onlyIncludeVisibleRows: true,
  doneStatusText: "Done",
  backfillMissingSourceFilesWhenFixing: true,
  backfillPickTopMatchOnTie: false,
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

    const scanState = listSourceFilesForScan_(sourceFolder, scriptProps);
    scriptProps.setProperty(
      "LAST_RUN_SCAN_MODE",
      scanState.mode + (scanState.sinceIso ? " (since " + scanState.sinceIso + ")" : ""),
    );

    const candidates = listCandidateFilesByYear_(
      scanState.files,
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
  const name = CONFIG.tempFolderName;
  const iter = DriveApp.getFoldersByName(name);
  var folder = null;
  if (iter.hasNext()) {
    folder = iter.next();
    try {
      // Remove broad/link permissions via Advanced Drive API if available
      if (typeof Drive !== "undefined" && Drive && Drive.Permissions) {
        var permsResp = Drive.Permissions.list(folder.getId());
        var items = (permsResp && permsResp.items) || (permsResp && permsResp.permissions) || [];
        var removed = 0;
        for (var pi = 0; pi < items.length; pi++) {
          var p = items[pi];
          if (!p || !p.type) continue;
          if (p.type === "anyone" || p.type === "anyoneWithLink" || (p.type === "domain" && p.role === "reader")) {
            try {
              Drive.Permissions.remove(folder.getId(), p.id);
              removed++;
            } catch (ePermRemove) {}
          }
        }
        if (removed > 0) {
          Logger.log("Temp folder permissions cleaned: removed " + removed);
        }
      }
    } catch (ePermList) {}

    // Also attempt DriveApp-level cleanup to remove explicit viewers/editors
    try {
      var fviewers = folder.getViewers();
      for (var vi = 0; vi < fviewers.length; vi++) {
        try {
          folder.removeViewer(fviewers[vi]);
        } catch (eRemoveV) {}
      }
      var feditors = folder.getEditors();
      for (var ei = 0; ei < feditors.length; ei++) {
        try {
          folder.removeEditor(feditors[ei]);
        } catch (eRemoveE) {}
      }
      try {
        folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      } catch (eSet) {}
    } catch (eDriveApp) {}
    return folder;
  }

  folder = DriveApp.createFolder(name);
  try {
    folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  } catch (e) {}
  return folder;
}

function isTempArtifactName_(name) {
  return (
    String(name || "")
      .toUpperCase()
      .indexOf("_TEMP_") === 0
  );
}

function getConfiguredYearFromDate_(dateObj, yearsSet) {
  if (!(dateObj instanceof Date)) return null;
  const y = String(dateObj.getFullYear());
  return yearsSet[y] ? y : null;
}

function toValidDate_(value) {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function getFileNameSafe_(file) {
  if (!file) return "";
  try {
    if (typeof file.getName === "function") return String(file.getName() || "");
  } catch (e) {}
  if (file.name !== undefined) return String(file.name || "");
  if (file.title !== undefined) return String(file.title || "");
  return "";
}

function getFileIdSafe_(file) {
  if (!file) return "";
  try {
    if (typeof file.getId === "function") return String(file.getId() || "");
  } catch (e) {}
  return String(file.id || "");
}

function getFileUrlSafe_(file) {
  if (!file) return "";
  try {
    if (typeof file.getUrl === "function") return String(file.getUrl() || "");
  } catch (e) {}

  if (file.url !== undefined && file.url !== null) return String(file.url);
  if (file.alternateLink) return String(file.alternateLink);
  if (file.webViewLink) return String(file.webViewLink);

  const id = getFileIdSafe_(file);
  return id ? "https://drive.google.com/open?id=" + id : "";
}

function getFileLastUpdatedSafe_(file) {
  if (!file) return null;
  try {
    if (typeof file.getLastUpdated === "function") {
      return toValidDate_(file.getLastUpdated());
    }
  } catch (e) {
    // Continue to property fallback.
  }
  return toValidDate_(file.modifiedDate || file.modifiedTime || null);
}

function getFileDateCreatedSafe_(file) {
  if (!file) return null;
  try {
    if (typeof file.getDateCreated === "function") {
      return toValidDate_(file.getDateCreated());
    }
  } catch (e) {
    // Continue to property fallback.
  }
  return toValidDate_(file.createdDate || file.createdTime || null);
}

function getBestFileDateForMetadata_(file) {
  return getFileLastUpdatedSafe_(file) || getFileDateCreatedSafe_(file);
}

function normalizeDriveApiFileItem_(item) {
  if (!item) return null;

  const id = String(item.id || "");
  const name = String(item.title || item.name || "");
  const url = String(
    item.alternateLink ||
      item.webViewLink ||
      (id ? "https://drive.google.com/open?id=" + id : ""),
  );

  return {
    id: id,
    name: name,
    url: url,
    createdDate: toValidDate_(item.createdDate || item.createdTime),
    modifiedDate: toValidDate_(item.modifiedDate || item.modifiedTime),
  };
}

function detectYearFromNameOrFileDate_(file) {
  const name = getFileNameSafe_(file);
  const years = getConfiguredYears_();
  const yearsSet = {};
  for (var yi = 0; yi < years.length; yi++) {
    yearsSet[years[yi]] = true;
  }

  for (var i = 0; i < years.length; i++) {
    if (name.indexOf(years[i]) !== -1) return years[i];
  }

  if (CONFIG.allowDateYearFallbackWhenNameMissing === false) return null;

  var primaryDate =
    CONFIG.preferLastUpdatedForYearFallback === false
      ? getFileDateCreatedSafe_(file)
      : getFileLastUpdatedSafe_(file);
  var secondaryDate =
    CONFIG.preferLastUpdatedForYearFallback === false
      ? getFileLastUpdatedSafe_(file)
      : getFileDateCreatedSafe_(file);

  var y = getConfiguredYearFromDate_(primaryDate, yearsSet);
  if (y) return y;

  return getConfiguredYearFromDate_(secondaryDate, yearsSet);
}

function listSourceFilesFull_(sourceFolder) {
  const out = [];
  if (!sourceFolder) return out;

  const maxInspect = Math.max(0, Number(CONFIG.fullScanMaxFilesToInspect) || 0);
  const files = sourceFolder.getFiles();

  while (files.hasNext()) {
    const f = files.next();
    out.push({
      id: getFileIdSafe_(f),
      name: getFileNameSafe_(f),
      url: getFileUrlSafe_(f),
      createdDate: getFileDateCreatedSafe_(f),
      modifiedDate: getFileLastUpdatedSafe_(f),
    });

    if (maxInspect > 0 && out.length >= maxInspect) break;
  }

  return out;
}

function listSourceFilesIncremental_(sourceFolder, sinceDate) {
  const out = [];
  if (!sourceFolder) return out;

  const folderId = sourceFolder.getId();
  const pageSize = Math.max(
    50,
    Math.min(1000, Number(CONFIG.incrementalScanPageSize) || 250),
  );
  const maxInspect = Math.max(
    1,
    Number(CONFIG.incrementalScanMaxFilesToInspect) || 2000,
  );

  const qParts = ["'" + folderId + "' in parents", "trashed = false"];
  if (sinceDate instanceof Date && !isNaN(sinceDate.getTime())) {
    qParts.push("modifiedDate >= '" + sinceDate.toISOString() + "'");
  }
  const query = qParts.join(" and ");

  let pageToken = null;
  do {
    const resp = Drive.Files.list({
      q: query,
      maxResults: pageSize,
      pageToken: pageToken,
      orderBy: "modifiedDate desc",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const items = resp && resp.items ? resp.items : [];
    for (let i = 0; i < items.length; i++) {
      const normalized = normalizeDriveApiFileItem_(items[i]);
      if (!normalized || !normalized.id || !normalized.name) continue;
      out.push(normalized);
      if (out.length >= maxInspect) break;
    }

    if (out.length >= maxInspect) break;
    pageToken = resp && resp.nextPageToken ? resp.nextPageToken : null;
  } while (pageToken);

  return out;
}

function listSourceFilesForScan_(sourceFolder, scriptProps, options) {
  scriptProps = scriptProps || PropertiesService.getScriptProperties();
  options = options || {};

  const now = new Date();
  const runCountKey = "SOURCE_SCAN_RUN_COUNT";
  const lastAtKey = "SOURCE_SCAN_LAST_AT";

  let runCount = Number(scriptProps.getProperty(runCountKey) || "0");
  runCount++;
  scriptProps.setProperty(runCountKey, String(runCount));

  const useIncremental = CONFIG.useIncrementalSourceScan !== false;
  const forceFullByOption = options.forceFull === true;
  const fullEveryRuns = Math.max(1, Number(CONFIG.forceFullScanEveryRuns) || 30);
  const shouldUseFull =
    forceFullByOption || !useIncremental || runCount % fullEveryRuns === 0;

  let mode = "full";
  let sinceDate = null;
  let files = [];

  if (!shouldUseFull) {
    mode = "incremental";

    const lookbackHours = Math.max(
      1,
      Number(CONFIG.incrementalScanLookbackHours) || 24,
    );
    const overlapMinutes = Math.max(
      0,
      Number(CONFIG.incrementalScanOverlapMinutes) || 15,
    );

    sinceDate = toValidDate_(scriptProps.getProperty(lastAtKey));
    if (!sinceDate) {
      sinceDate = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
    }
    sinceDate = new Date(sinceDate.getTime() - overlapMinutes * 60 * 1000);

    try {
      files = listSourceFilesIncremental_(sourceFolder, sinceDate);
    } catch (eInc) {
      Logger.log(
        "Incremental scan failed, fallback to full scan: " +
          (eInc && eInc.message),
      );
      mode = "full-fallback";
      files = listSourceFilesFull_(sourceFolder);
    }
  } else {
    files = listSourceFilesFull_(sourceFolder);
  }

  scriptProps.setProperty(lastAtKey, now.toISOString());
  scriptProps.setProperty("SOURCE_SCAN_LAST_MODE", mode);
  scriptProps.setProperty("SOURCE_SCAN_LAST_FILE_COUNT", String(files.length));
  if (sinceDate) {
    scriptProps.setProperty("SOURCE_SCAN_LAST_SINCE", sinceDate.toISOString());
  } else {
    scriptProps.deleteProperty("SOURCE_SCAN_LAST_SINCE");
  }

  return {
    files: files,
    mode: mode,
    sinceIso: sinceDate ? sinceDate.toISOString() : "",
  };
}

function listCandidateFilesByYear_(
  sourceFiles,
  processedMap,
  failedAttemptsMap,
) {
  const years = getConfiguredYears_();
  const candidates = {};
  years.forEach(function (y) {
    candidates[y] = [];
  });

  const files = Array.isArray(sourceFiles) ? sourceFiles : [];
  const maxPerYear = CONFIG.maxFilesPerRunPerYear;
  const maxTotal = CONFIG.maxFilesPerRunTotal;
  let totalNow = 0;

  for (let idx = 0; idx < files.length && totalNow < maxTotal; idx++) {
    const f = files[idx];
    const name = getFileNameSafe_(f);
    const fileId = getFileIdSafe_(f);
    const fileUrl = getFileUrlSafe_(f);
    if (!name || !fileId) continue;

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
      dateCreated: getBestFileDateForMetadata_(f),
    });
    totalNow++;
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
      timings.status = CONFIG.doneStatusText;
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

    try {
      ensureFileRestricted_(copied.id);
    } catch (eEnsure) {}

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

      try {
        ensureFileRestricted_(copiedFallback.id);
      } catch (eEnsure2) {}

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

function ensureFileRestricted_(fileId) {
  if (!fileId) return;

  // Remove broad/link permissions via Advanced Drive API when available
  try {
    if (typeof Drive !== "undefined" && Drive && Drive.Permissions) {
      var permsResp = Drive.Permissions.list(fileId);
      var items =
        (permsResp && permsResp.items) || (permsResp && permsResp.permissions) || [];
      var removed = 0;
      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        if (!p || !p.type) continue;
        if (
          p.type === "anyone" ||
          p.type === "anyoneWithLink" ||
          (p.type === "domain" && p.role === "reader")
        ) {
          try {
            Drive.Permissions.remove(fileId, p.id);
            removed++;
          } catch (ePermRemove) {}
        }
      }
      if (removed > 0) {
        Logger.log("Temp file permissions cleaned: removed " + removed);
      }
    }
  } catch (ePermList) {}

  // Fallback: remove viewers/editors and force private
  try {
    var f = DriveApp.getFileById(fileId);
    var viewers = [];
    var editors = [];
    try {
      viewers = f.getViewers();
      editors = f.getEditors();
    } catch (eLists) {}

    for (var vi = 0; vi < viewers.length; vi++) {
      try {
        f.removeViewer(viewers[vi]);
      } catch (eRemoveV) {}
    }
    for (var ei = 0; ei < editors.length; ei++) {
      try {
        f.removeEditor(editors[ei]);
      } catch (eRemoveE) {}
    }
    try {
      f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    } catch (eSet) {}
  } catch (eFallback) {}
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
  const sourceId =
    String(fileInfo.id || "").trim() || extractDriveIdFromUrl_(sourceUrl);
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

  let backfillMsg = "";
  if (CONFIG.backfillMissingSourceFilesWhenFixing) {
    backfillMsg = backfillMissingSourceLinks_(false, {
      suppressNotify: true,
    });
  }

  let msg =
    "Source File hyperlink conversion complete.\nTotal converted: " +
    totalFixed +
    "\n\n" +
    details.join("\n");
  if (backfillMsg) msg += "\n\n" + backfillMsg;
  notify_(msg);
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
function backfillMissingSourceLinks_(dryRun, options) {
  options = options || {};
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
    const sourceFormulas = sh
      .getRange(2, sourceCol, rowCount, 1)
      .getFormulas();

    const pendingWrites = [];
    let scanned = 0,
      updated = 0,
      ambiguous = 0,
      nomatch = 0;

    let runStart = null;
    let runFormulas = [];

    function flushRun() {
      if (runStart === null) return;
      pendingWrites.push({ startRow: runStart, formulas: runFormulas });
      runStart = null;
      runFormulas = [];
    }

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const existingDisplay = String(row[sourceCol - 1] || "").trim();
      const existingFormula = String(sourceFormulas[i][0] || "").trim();
      scanned++;
      if (existingFormula && existingFormula.indexOf("=") === 0) {
        flushRun();
        continue;
      }
      if (existingDisplay) {
        flushRun();
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
        flushRun();
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

      let formulaToWrite = "";
      if (candidates.length === 1) {
        const f = candidates[0].file;
        formulaToWrite =
          '=HYPERLINK("' +
          f.url.replace(/"/g, '""') +
          '","' +
          f.name.replace(/"/g, '""') +
          '")';
        updated++;
      } else if (candidates.length > 1) {
        // Sort by match count desc
        candidates.sort(function (a, b) {
          return b.matchCount - a.matchCount;
        });
        const top = candidates[0];
        const second = candidates[1];
        const pickTopOnTie = CONFIG.backfillPickTopMatchOnTie !== false;
        const topWins =
          top.matchCount > (second ? second.matchCount : 0);

        if (topWins || pickTopOnTie) {
          const f = top.file;
          formulaToWrite =
            '=HYPERLINK("' +
            f.url.replace(/"/g, '""') +
            '","' +
            f.name.replace(/"/g, '""') +
            '")';
          updated++;
        } else {
          ambiguous++;
        }
      } else {
        nomatch++;
      }

      if (formulaToWrite) {
        if (runStart === null) {
          runStart = i;
          runFormulas = [[formulaToWrite]];
        } else if (i === runStart + runFormulas.length) {
          runFormulas.push([formulaToWrite]);
        } else {
          flushRun();
          runStart = i;
          runFormulas = [[formulaToWrite]];
        }
      } else {
        flushRun();
      }
    }

    flushRun();

    if (!dryRun && pendingWrites.length > 0) {
      for (let w = 0; w < pendingWrites.length; w++) {
        const write = pendingWrites[w];
        try {
          sh
            .getRange(2 + write.startRow, sourceCol, write.formulas.length, 1)
            .setFormulas(write.formulas);
        } catch (e) {
          notes.push(
            year + ": error writing Source File column (" + e.message + ")",
          );
          break;
        }
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

  if (!dryRun && !options.suppressNotify) notify_(msg);
  return msg;
}

function backfillMissingSourceLinksPreview() {
  return backfillMissingSourceLinks_(true);
}

function backfillMissingSourceLinksNow() {
  return backfillMissingSourceLinks_(false);
}

function exportBackfillAmbiguousExamplesNow() {
  const ss = getSpreadsheet_();
  if (!ss) {
    notify_("No spreadsheet found.");
    return;
  }

  const sourceFolder = findFolder_(CONFIG.sourceFolderName);
  if (!sourceFolder) {
    notify_("Source folder not found: " + CONFIG.sourceFolderName);
    return;
  }

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
  const diagSheetName = "Backfill Diagnostics";
  var diagSh = ss.getSheetByName(diagSheetName);
  if (diagSh) {
    diagSh.clear();
  } else {
    diagSh = ss.insertSheet(diagSheetName);
  }

  const header = [
    "Year",
    "Sheet",
    "Row",
    "PO No.",
    "GR Mat. Doc.",
    "WBS Element",
    "PO PLA ID",
    "Installed PLA ID",
    "Tokens",
    "CandidateCount",
    "TopCandidates",
  ];

  const outRows = [header];

  years.forEach(function (year) {
    const sh = findOutputSheetByYear_(ss, year);
    if (!sh) return;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;

    const sourceCol = getColumnIndexByHeader_(sh, CONFIG.sourceHeaderName);
    if (sourceCol < 1) return;

    const poCol = getColumnIndexByHeader_(sh, "PO No.");
    const grCol = getColumnIndexByHeader_(sh, "GR Mat. Doc.");
    const wbsCol = getColumnIndexByHeader_(sh, "WBS Element");
    const poPlaCol = getColumnIndexByHeader_(sh, "PO PLA ID");
    const instPlaCol = getColumnIndexByHeader_(sh, "Installed PLA ID");

    const rowCount = lastRow - 1;
    const maxCol = Math.max(sh.getLastColumn(), sourceCol);
    const data = sh.getRange(2, 1, rowCount, maxCol).getDisplayValues();
    const sourceFormulas = sh.getRange(2, sourceCol, rowCount, 1).getFormulas();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const existingDisplay = String(row[sourceCol - 1] || "").trim();
      const existingFormula = String(sourceFormulas[i][0] || "").trim();
      if (existingFormula && existingFormula.indexOf("=") === 0) continue;
      if (existingDisplay) continue;

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

      if (tokensClean.length === 0) continue;

      const candidates = [];
      for (let fI = 0; fI < filesArr.length; fI++) {
        const fn = filesArr[fI].nameLower;
        let matchCount = 0;
        for (let ti = 0; ti < tokensClean.length; ti++) {
          if (tokensClean[ti] && fn.indexOf(tokensClean[ti]) !== -1) matchCount++;
        }
        if (matchCount > 0) candidates.push({ file: filesArr[fI], matchCount: matchCount });
      }

      if (candidates.length > 1) {
        candidates.sort(function (a, b) {
          return b.matchCount - a.matchCount;
        });
        const top = candidates[0];
        const second = candidates[1];
        const pickTopOnTie = CONFIG.backfillPickTopMatchOnTie !== false;
        const topWins = top.matchCount > (second ? second.matchCount : 0);
        if (!topWins && !pickTopOnTie) {
          const topList = candidates
            .slice(0, 5)
            .map(function (c) {
              return c.matchCount + ":" + c.file.name + " (" + c.file.id + ")";
            })
            .join(" | ");

          outRows.push([
            year,
            sh.getName(),
            2 + i,
            poCol > 0 ? row[poCol - 1] : "",
            grCol > 0 ? row[grCol - 1] : "",
            wbsCol > 0 ? row[wbsCol - 1] : "",
            poPlaCol > 0 ? row[poPlaCol - 1] : "",
            instPlaCol > 0 ? row[instPlaCol - 1] : "",
            tokensClean.join(" | "),
            candidates.length,
            topList,
          ]);
        }
      }
    }
  });

  if (outRows.length <= 1) {
    notify_("No ambiguous backfill rows found.");
    diagSh.clear();
    diagSh.getRange(1, 1, 1, header.length).setValues([header]);
    return;
  }

  diagSh.getRange(1, 1, outRows.length, outRows[0].length).setValues(outRows);
  notify_("Backfill diagnostics written to sheet: " + diagSheetName + " (rows: " + (outRows.length - 1) + ")");
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
      duplicateRuns: [],
    };

    const tracker = ss.getSheetByName(CONFIG.trackerSheetName);
    if (tracker && tracker.getLastRow() > 1) {
      trackerPlan = buildTrackerDuplicateCleanupPlan_(tracker);
    } else {
      notes.push("Tracker not found or has no data rows.");
    }

    const outputPlans = buildOutputDuplicateCleanupPlansFromTracker_(
      ss,
      trackerPlan,
    );
    let outputGroupCount = 0;
    let outputDeleteCount = 0;
    outputPlans.forEach(function (plan) {
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

    const trackerRunsWithRows = (trackerPlan.duplicateRuns || []).filter(
      function (run) {
        return Number(run.rowsAdded || 0) > 0;
      },
    ).length;
    notes.push(
      "Tracker duplicate run entries with Rows Added > 0: " +
        trackerRunsWithRows +
        ".",
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
        (dryRun ? outputDeleteCount : removedOutput) +
        " (safe match: source + row signature)",
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
        notes.push(
          plan.sheet.getName() + " examples (keep row -> remove rows):",
        );
        plan.previewExamples.forEach(function (line) {
          notes.push("  " + line);
        });
      }

      if (plan.warnings && plan.warnings.length > 0) {
        notes.push(plan.sheet.getName() + " warnings:");
        plan.warnings.forEach(function (line) {
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
  let yearCol = getColumnIndexByHeader_(tracker, "Year");
  let rowsAddedCol = getColumnIndexByHeader_(tracker, "Rows Added");
  if (tsCol < 1) tsCol = 1;
  if (fileNameCol < 1) fileNameCol = 2;
  if (fileLinkCol < 1) fileLinkCol = 7;
  if (statusCol < 1) statusCol = 6;
  if (yearCol < 1) yearCol = 4;
  if (rowsAddedCol < 1) rowsAddedCol = 5;

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
    const year = String(display[i][yearCol - 1] || values[i][yearCol - 1] || "");
    const rowsAdded = toNonNegativeInt_(
      values[i][rowsAddedCol - 1],
      display[i][rowsAddedCol - 1],
    );
    if (!groups[key]) groups[key] = { doneRows: [] };
    groups[key].doneRows.push({
      rowNum: rowNum,
      rowDisplay: display[i],
      tsMs: tsMs,
      fileName: fileName,
      fileUrl: linkUrl,
      year: year,
      rowsAdded: rowsAdded,
    });
  }

  const deleteRows = [];
  let duplicateGroupCount = 0;
  const previewGroups = {};
  const duplicateRuns = [];

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
        rowsAdded: row.rowsAdded,
      });
      duplicateRuns.push({
        duplicateKey: k,
        trackerRowNum: row.rowNum,
        keepTrackerRowNum: keep.rowNum,
        fileName: row.fileName,
        fileUrl: row.fileUrl,
        year: String(row.year || "").trim(),
        rowsAdded: row.rowsAdded,
        tsMs: row.tsMs,
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
    duplicateRuns: duplicateRuns,
  };
}

function buildOutputDuplicateCleanupPlansFromTracker_(ss, trackerPlan) {
  const runs =
    trackerPlan && trackerPlan.duplicateRuns ? trackerPlan.duplicateRuns : [];

  const groupedBySource = {};
  runs.forEach(function (run) {
    const rowsAdded = Number(run.rowsAdded || 0);
    const year = String(run.year || "").trim();
    const sourceKey = buildSourceDuplicateKey_(run.fileName, run.fileUrl);
    if (!year || rowsAdded <= 0 || !sourceKey) return;

    const groupKey = year + "|" + sourceKey;
    if (!groupedBySource[groupKey]) {
      groupedBySource[groupKey] = {
        year: year,
        sourceKey: sourceKey,
        sourceText: String(run.fileName || "").trim(),
        sourceUrl: String(run.fileUrl || "").trim(),
        rowsToDelete: 0,
      };
    }
    groupedBySource[groupKey].rowsToDelete += rowsAdded;
  });

  const plansBySheet = {};
  Object.keys(groupedBySource).forEach(function (groupKey) {
    const g = groupedBySource[groupKey];
    const sh = findOutputSheetByYear_(ss, g.year);
    if (!sh || sh.getLastRow() <= 1) return;

    const sourcePlan = buildOutputDuplicateRowsForSource_(
      sh,
      g.sourceText,
      g.sourceUrl,
      g.rowsToDelete,
    );

    const sheetName = sh.getName();
    if (!plansBySheet[sheetName]) {
      plansBySheet[sheetName] = {
        year: g.year,
        sheet: sh,
        duplicateGroupCount: 0,
        deleteRows: [],
        previewExamples: [],
        warnings: [],
      };
    }

    const plan = plansBySheet[sheetName];
    if (sourcePlan.deleteRows.length > 0) {
      plan.duplicateGroupCount++;
      plan.deleteRows = plan.deleteRows.concat(sourcePlan.deleteRows);
      if (sourcePlan.previewExample) {
        plan.previewExamples.push(sourcePlan.previewExample);
      }
    }
    if (sourcePlan.warning) plan.warnings.push(sourcePlan.warning);
  });

  return Object.keys(plansBySheet).map(function (sheetName) {
    const plan = plansBySheet[sheetName];
    const uniqueRows = {};
    plan.deleteRows.forEach(function (r) {
      const n = Number(r);
      if (!isNaN(n) && n >= 2) uniqueRows[n] = true;
    });
    plan.deleteRows = Object.keys(uniqueRows)
      .map(function (k) {
        return Number(k);
      })
      .sort(function (a, b) {
        return a - b;
      });
    return plan;
  });
}

function buildOutputDuplicateRowsForSource_(
  sheet,
  sourceText,
  sourceUrl,
  rowsToDeleteTarget,
) {
  const result = {
    deleteRows: [],
    previewExample: "",
    warning: "",
  };

  const targetCount = Math.max(0, Number(rowsToDeleteTarget) || 0);
  if (targetCount < 1 || !sheet || sheet.getLastRow() <= 1) return result;

  const sourceCol = getColumnIndexByHeader_(sheet, CONFIG.sourceHeaderName);
  if (sourceCol < 1) {
    result.warning =
      "Source File column not found for " + sheet.getName() + ".";
    return result;
  }

  const targetKey = buildSourceDuplicateKey_(sourceText, sourceUrl);
  if (!targetKey) return result;

  const rowCount = sheet.getLastRow() - 1;
  const lastCol = sheet.getLastColumn();
  const display = sheet.getRange(2, 1, rowCount, lastCol).getDisplayValues();
  const formulas = sheet.getRange(2, 1, rowCount, lastCol).getFormulas();

  const matches = [];
  for (let i = 0; i < rowCount; i++) {
    const sourceCellText = String(display[i][sourceCol - 1] || "").trim();
    const sourceCellUrl = extractUrlFromCell_(
      sourceCellText,
      formulas[i][sourceCol - 1],
    );
    const sourceKey = buildSourceDuplicateKey_(sourceCellText, sourceCellUrl);
    if (sourceKey !== targetKey) continue;

    matches.push({
      rowNum: i + 2,
      signature: buildOutputRowSignature_(display[i]),
    });
  }

  if (matches.length <= 1) return result;

  const signatureRows = {};
  matches.forEach(function (m) {
    if (!signatureRows[m.signature]) signatureRows[m.signature] = [];
    signatureRows[m.signature].push(m.rowNum);
  });

  Object.keys(signatureRows).forEach(function (sig) {
    signatureRows[sig].sort(function (a, b) {
      return a - b;
    });
  });

  const latestFirst = matches.slice().sort(function (a, b) {
    return b.rowNum - a.rowNum;
  });

  const deleteRows = [];
  for (let i = 0; i < latestFirst.length; i++) {
    if (deleteRows.length >= targetCount) break;

    const row = latestFirst[i];
    const sigList = signatureRows[row.signature] || [];
    if (sigList.length <= 1) continue;

    const idx = sigList.lastIndexOf(row.rowNum);
    if (idx <= 0) continue;

    sigList.splice(idx, 1);
    deleteRows.push(row.rowNum);
  }

  if (deleteRows.length === 0) {
    result.warning =
      "No safe duplicate rows found for key " +
      shortenPreviewKey_(targetKey, 48) +
      ".";
    return result;
  }

  const sortedDeleteRows = deleteRows.slice().sort(function (a, b) {
    return a - b;
  });
  result.deleteRows = sortedDeleteRows;

  const shown = sortedDeleteRows.slice(0, 8);
  let removeRowsText = shown.join(", ");
  if (sortedDeleteRows.length > 8) removeRowsText += ", ...";

  const keepCandidates = matches
    .map(function (m) {
      return m.rowNum;
    })
    .filter(function (n) {
      return sortedDeleteRows.indexOf(n) === -1;
    })
    .sort(function (a, b) {
      return a - b;
    });
  const keepRowNum = keepCandidates.length ? keepCandidates[0] : matches[0].rowNum;

  result.previewExample =
    "keep row " +
    keepRowNum +
    " -> remove rows " +
    removeRowsText +
    " (key " +
    shortenPreviewKey_(targetKey, 48) +
    ")";

  if (sortedDeleteRows.length < targetCount) {
    result.warning =
      "Requested remove=" +
      targetCount +
      " but only " +
      sortedDeleteRows.length +
      " safe duplicate row(s) matched for key " +
      shortenPreviewKey_(targetKey, 36) +
      ".";
  }

  return result;
}

function buildOutputRowSignature_(rowDisplay) {
  const row = rowDisplay || [];
  const coreLen = Math.min(COLUMN_MAPPING.length, row.length);
  const parts = [];
  for (let i = 0; i < coreLen; i++) {
    parts.push(
      String(row[i] || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    );
  }
  return parts.join("|");
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

function toNonNegativeInt_(value, displayValue) {
  let n = Number(value);
  if (isNaN(n)) {
    n = Number(
      String(displayValue || "")
        .replace(/,/g, "")
        .replace(/[^0-9.-]/g, ""),
    );
  }
  if (isNaN(n) || n < 0) return 0;
  return Math.floor(n);
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
    if (tsMs === keepTsMs) return rowNum < keepRowNum;
    return tsMs < keepTsMs;
  }
  return rowNum < keepRowNum;
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
    const scriptProps = PropertiesService.getScriptProperties();
    ensureSheets_(ss);

    const sourceFolder = findFolder_(CONFIG.sourceFolderName);
    if (!sourceFolder)
      return "Source folder not found: " + CONFIG.sourceFolderName;

    const processedMap = loadProcessedMap_(ss);
    const doneKeyMap = buildTrackerExactDoneKeyMap_(ss);
    const failedAttemptsMap = loadFailedAttemptsMap_(ss);

    const scanState = listSourceFilesForScan_(sourceFolder, scriptProps, {
      forceFull: true,
    });

    const candidates = listCandidateFilesByYear_(
      scanState.files,
      processedMap,
      failedAttemptsMap,
    );

    if (!candidates || !candidates[year] || candidates[year].length === 0) {
      return "No candidate files found for " + year + " (scan mode: " + scanState.mode + ")";
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

    return (
      "Done: files=" +
      processedCount +
      ", rows=" +
      totalRowsAdded +
      " (scan mode: " +
      scanState.mode +
      ")"
    );
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
  const years = getConfiguredYears_();

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

      const fileId = f.getId();
      const fileUrl = f.getUrl();
      const detectedYear = detectYearFromNameOrFileDate_(f);
      if (!detectedYear) {
        noYear++;
        if (sampleNoYear.length < 5) sampleNoYear.push(name);
        continue;
      }

      withYear++;

      const fileInfo = { name: name, id: fileId, url: fileUrl };

      if (isMarkedProcessedInMap_(processedMap, fileInfo)) {
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
    "Last scan mode: " +
      (scriptProps.getProperty("LAST_RUN_SCAN_MODE") ||
        scriptProps.getProperty("SOURCE_SCAN_LAST_MODE") ||
        "N/A"),
    "Last scanned file list size: " +
      (scriptProps.getProperty("SOURCE_SCAN_LAST_FILE_COUNT") || "N/A"),
    "Last incremental since: " +
      (scriptProps.getProperty("SOURCE_SCAN_LAST_SINCE") || "N/A"),
    "",
    "Source folder stats",
    "Excel files total: " + totalExcel,
    "Excel files mapped to " +
      getConfiguredYears_().join("/") +
      " (name/date fallback): " +
      withYear,
    "Excel files skipped (cannot map to configured years): " + noYear,
    "Already done: " + alreadyDone,
    "Blocked by failed-attempt limit: " + blockedByFailedAttempts,
    "Pending for next runs: " + pending,
  ];

  if (sampleNoYear.length) {
    msg.push("");
    msg.push(
      "Sample skipped files (cannot map to " +
        getConfiguredYears_().join("/") +
        " via name/date):",
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

