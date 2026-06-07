// GR Template Automation Consolidator v11

// CONFIGURATIONS AND MENU
// This file contains the global variables, caches, and the UI menu so they load first.

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
  triggerMinutes: 5,
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
  forceFullScanEveryRuns: 999,
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

// Cache
var _CACHE = {
  configMappings: null,
  plaLookupMapBySsId: {},
  outputSheets: {},
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

// UI menu
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
    .addItem("Start Auto Trigger (5 min)", "setupAutomaticEvery5Min")
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
