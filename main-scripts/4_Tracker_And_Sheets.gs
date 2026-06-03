// Everything related to reading/writing to the Google Sheets, lookup tables, formatting output, and logging.
// Unified Tracker Reader
function loadAllTrackerData_(ss) {
  const result = { processedMap: {}, doneKeyMap: {}, failedAttemptsMap: {} };
  const tracker = ss.getSheetByName(CONFIG.trackerSheetName);

  if (!tracker || tracker.getLastRow() <= 1) return result;

  const rowCount = tracker.getLastRow() - 1;
  const maxCol = tracker.getLastColumn();
  // Fetch everything in exactly two API calls
  const displayValues = tracker
    .getRange(2, 1, rowCount, maxCol)
    .getDisplayValues();
  const formulas = tracker.getRange(2, 1, rowCount, maxCol).getFormulas();

  // Find columns dynamically
  let fileNameCol = getColumnIndexByHeader_(tracker, "File Name") - 1;
  let statusCol = getColumnIndexByHeader_(tracker, "Status") - 1;
  let fileLinkCol = getColumnIndexByHeader_(tracker, "File Link") - 1;
  if (fileNameCol < 0) fileNameCol = 1;
  if (statusCol < 0) statusCol = 5;
  if (fileLinkCol < 0) fileLinkCol = 6;

  for (let i = 0; i < rowCount; i++) {
    const fileName = String(displayValues[i][fileNameCol] || "").trim();
    if (!fileName) continue;

    const statusText = displayValues[i][statusCol];
    const status = normalizeStatus_(statusText);
    const linkDisplay = displayValues[i][fileLinkCol];
    const linkFormula = formulas[i][fileLinkCol];
    const fileUrl = extractUrlFromCell_(linkDisplay, linkFormula);

    const fileInfo = {
      name: fileName,
      id: extractDriveIdFromUrl_(fileUrl),
      url: fileUrl,
    };

    // Processed Map
    if (isProcessedStatus_(status)) {
      markProcessedInMap_(result.processedMap, fileInfo);
    }

    // Done Key Map
    if (status === "done") {
      markProcessedInMap_(result.doneKeyMap, fileInfo);
    }

    // Build Failed Attempts Map
    if (isDoneStatus_(status)) {
      result.failedAttemptsMap[fileName] = 0;
    } else if (isFailureStatus_(status)) {
      result.failedAttemptsMap[fileName] =
        (result.failedAttemptsMap[fileName] || 0) + 1;
    }
  }

  return result;
}

function getEnrichmentForRow_(row, lookupMap) {
  var regional = "";
  var cleaned = "";
  var territory = "";
  var wbsVal = row[COL["WBS Element"]];
  var installedKey = normalizeInstalledPlaLookupKey_(
    row[COL["Installed PLA ID"]],
  );
  var found = installedKey ? lookupMap[installedKey] : null;

  if (found) {
    regional = found.regionalArea || "";
    cleaned = found.cleanedSiteName || "";
    territory = found.territory || "";
  }

  if (isMissingOrNaTerritory_(territory)) {
    if (isOpexWbs_(wbsVal)) {
      territory = "OPEX";
    } else if (
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

  var amountForUsd = chooseAmountForUsd_(row);
  var currencyForUsd = inferCurrencyFromRow_(row);
  var usd = toUsdIfPhp_(amountForUsd, currencyForUsd);
  return [regional, cleaned, territory, usd];
}

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

function normalizeInstalledPlaLookupKey_(v) {
  var raw = String(v || "").trim();
  if (!raw) return "";

  var low = raw.toLowerCase();
  if (
    /^\s*(n\/?a|na|#name\?|not mentioned on po|no pla id|no pla|various pla|various site|search ring|searchring|multiple core)\b/i.test(
      low,
    )
  )
    return "";

  var tokens = raw.split(/[\/,:;&\n\r]+/);
  var first = "";
  for (var i = 0; i < tokens.length; i++) {
    var t = String(tokens[i] || "").trim();
    if (t !== "") {
      first = t;
      break;
    }
  }
  if (!first) return "";

  first = first.replace(/^\s*\(+/, "").replace(/\)+\s*$/, "");
  first = first.replace(/^\s*(PLA\s*ID|PLAID|PLA)[:\-\s]*/i, "");
  first = first.replace(/search ring.*$/i, "");

  var m = first.match(/([A-Z]{1,6}\s*\d{1,6})/i);
  var token = m && m[1] ? m[1] : first.split(/\s+/)[0];
  token = String(token || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
  return normalizePlaLookupKey_(token);
}

function isManagedServices_(materialDesc, serviceShortText) {
  var a = String(materialDesc || "").toLowerCase();
  var b = String(serviceShortText || "").toLowerCase();
  return (
    a.indexOf("managed services") !== -1 || b.indexOf("managed services") !== -1
  );
}

function normalizeCurrencyCode_(currencyValue) {
  var c = String(currencyValue || "")
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .trim();
  if (!c) return "";

  if (
    c.indexOf("php") !== -1 ||
    c.indexOf("peso") !== -1 ||
    c.indexOf("philippine peso") !== -1 ||
    c.indexOf("ph peso") !== -1 ||
    c.indexOf("₱") !== -1
  ) {
    return "PHP";
  }
  if (
    c.indexOf("usd") !== -1 ||
    c.indexOf("us dollar") !== -1 ||
    c.indexOf("us dollars") !== -1 ||
    c.indexOf("$") !== -1
  ) {
    return "USD";
  }
  if (
    c.indexOf("eur") !== -1 ||
    c.indexOf("euro") !== -1 ||
    c.indexOf("€") !== -1
  ) {
    return "EUR";
  }
  return "";
}

function isPhpCurrency_(currencyValue) {
  return normalizeCurrencyCode_(currencyValue) === "PHP";
}
function isUsdCurrency_(currencyValue) {
  return normalizeCurrencyCode_(currencyValue) === "USD";
}
function isEurCurrency_(currencyValue) {
  return normalizeCurrencyCode_(currencyValue) === "EUR";
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
  if (!/[0-9]/.test(s)) return NaN;

  var n = Number(s);
  if (isNaN(n)) return NaN;
  return isNegative ? -n : n;
}

function toUsdIfPhp_(amountValue, currencyValue) {
  var amount = parseAmount_(amountValue);
  if (isNaN(amount)) return "";
  var cur =
    normalizeCurrencyCode_(currencyValue) ||
    normalizeCurrencyCode_(amountValue);
  if (cur === "USD") return amount;
  if (cur === "PHP" || cur === "EUR") return amount / CONFIG.usdConversionRate;
  return "";
}

function inferCurrencyFromRow_(row, rowFormats, columnMap) {
  if (!row) return "";
  var headers = ["Currency", "Amount To Billed", "Sub Total", "PO Unit Price"];
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    var idx = COL[header];
    var value = row[idx];
    var code = normalizeCurrencyCode_(value);
    if (code) return code;

    if (rowFormats && columnMap) {
      var srcIdx = columnMap[header];
      if (srcIdx !== undefined) {
        code = normalizeCurrencyCode_(rowFormats[srcIdx]);
        if (code) return code;
      }
    }
  }
  return "";
}

function chooseAmountForUsd_(row) {
  if (!row) return "";
  var amount = row[COL["Amount To Billed"]];
  var amountNum = parseAmount_(amount);
  if (!isNaN(amountNum) && String(amount || "").trim() !== "") return amount;
  var sub = row[COL["Sub Total"]];
  var subNum = parseAmount_(sub);
  if (!isNaN(subNum)) return sub;
  return amount || sub || "";
}

function loadPlaLookupMap_(ss) {
  const sh = ss.getSheetByName(CONFIG.lookupSheetName);
  if (!sh || sh.getLastRow() < 2) return {};

  const headers = sh
    .getRange(1, 1, 1, sh.getLastColumn())
    .getDisplayValues()[0];
  function findHeaderIndex_(candidates) {
    for (var i = 0; i < headers.length; i++) {
      var current = String(headers[i] || "")
        .trim()
        .toLowerCase();
      for (var j = 0; j < candidates.length; j++) {
        if (
          current ===
          String(candidates[j] || "")
            .trim()
            .toLowerCase()
        ) {
          return i;
        }
      }
    }
    return -1;
  }

  const colPla = findHeaderIndex_(["PLA ID"]) + 1;
  const colReg = findHeaderIndex_(["REGION", "Regional Area"]) + 1;
  const colSite = findHeaderIndex_(["SITE NAME"]) + 1;
  const colTerr = findHeaderIndex_(["TERRITORY"]) + 1;

  if (colPla < 1 || colReg < 1 || colSite < 1 || colTerr < 1) {
    throw new Error(
      "PLA Lookup headers missing. Required: PLA ID, SITE NAME, REGION (or Regional Area), TERRITORY",
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
    const keyExtracted = normalizeInstalledPlaLookupKey_(raw);
    if (!keyFull && !keyBase && !keyExtracted) return;

    var obj = {
      regionalArea: String(row[colReg - 1] || "").trim(),
      cleanedSiteName: String(row[colSite - 1] || "").trim(),
      territory: String(row[colTerr - 1] || "").trim(),
    };

    if (keyFull) map[keyFull] = obj;
    if (keyBase) map[keyBase] = obj;
    if (keyExtracted) map[keyExtracted] = obj;
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
    lookup.appendRow([
      "PLA ID",
      "SITE NAME",
      "FORMATTED ADDRESS",
      "REGION",
      "TERRITORY",
    ]);
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
    if (!ss.getSheetByName(sheetName)) ss.insertSheet(sheetName);
  }
  writeConfigMapping_(year, sheetName, spreadsheetId || "");
  return "Year " + year + " added/updated.";
}

function fillCurrencyFromHints_(outRow, rowFormats, columnMap) {
  var cur = inferCurrencyFromRow_(outRow, rowFormats, columnMap);
  if (cur) outRow[21] = cur;
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
  var amt = String(outRow[20] || "").trim();
  var sub = String(outRow[19] || "").trim();
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
    const poUnitCol = getColumnIndexByHeader_(sh, "PO Unit Price");
    const subCol = getColumnIndexByHeader_(sh, "Sub Total");
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
    const poUnitVals =
      poUnitCol > 0
        ? sh.getRange(2, poUnitCol, rowCount, 1).getDisplayValues()
        : [];
    const subVals =
      subCol > 0 ? sh.getRange(2, subCol, rowCount, 1).getDisplayValues() : [];
    const amtVals = sh.getRange(2, amtCol, rowCount, 1).getDisplayValues();
    const curVals = sh.getRange(2, curCol, rowCount, 1).getDisplayValues();

    const colInfo = ensureEnrichmentColumns_(sh);

    const out = [];
    for (var i = 0; i < rowCount; i++) {
      var r = [];
      r[COL["PO Unit Price"]] = poUnitVals.length ? poUnitVals[i][0] : "";
      r[COL["Sub Total"]] = subVals.length ? subVals[i][0] : "";
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
    const poUnitCol = getColumnIndexByHeader_(sh, "PO Unit Price");
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
    const poVals =
      poUnitCol > 0
        ? sh.getRange(2, poUnitCol, rowCount, 1).getDisplayValues()
        : [];
    const colInfo = ensureEnrichmentColumns_(sh);

    const usdOut = [];
    const amtOut = [];
    const curOut = [];
    let repairedAmountCount = 0;
    let repairedCurrencyCount = 0;
    for (var i = 0; i < rowCount; i++) {
      var r = [];
      var amtRaw = amtVals[i][0];
      var subRaw = subVals.length ? subVals[i][0] : "";
      var poRaw = poVals.length ? poVals[i][0] : "";
      var curRaw = curVals[i][0];
      r[COL["PO Unit Price"]] = poRaw;
      r[COL["Sub Total"]] = subRaw;
      r[COL["Amount To Billed"]] = amtRaw;
      r[COL["Currency"]] = curRaw;
      var amtParsed = parseAmount_(amtRaw);
      var subParsed = parseAmount_(subRaw);
      var amtForUsd = amtRaw;
      var inferredCurrency = inferCurrencyFromRow_(r);

      if (isNaN(amtParsed) && !isNaN(subParsed)) {
        amtForUsd = subRaw;
        repairedAmountCount++;
      }

      amtOut.push([amtForUsd]);
      curOut.push([
        inferredCurrency || normalizeCurrencyCode_(curRaw) || curRaw || "",
      ]);
      if (curOut[i][0] !== String(curRaw || "")) repairedCurrencyCount++;
      usdOut.push([toUsdIfPhp_(amtForUsd, curOut[i][0])]);
    }

    if (repairedAmountCount > 0)
      sh.getRange(2, amtCol, rowCount, 1).setValues(amtOut);
    if (repairedCurrencyCount > 0)
      sh.getRange(2, curCol, rowCount, 1).setValues(curOut);

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
    backfillMsg = backfillMissingSourceLinks_(false, { suppressNotify: true });
  }

  let msg =
    "Source File hyperlink conversion complete.\nTotal converted: " +
    totalFixed +
    "\n\n" +
    details.join("\n");
  if (backfillMsg) msg += "\n\n" + backfillMsg;
  notify_(msg);
}

function logToTracker_(ss, fileInfo, result) {
  appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, null);
}

function appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, processedMap) {
  try {
    const fileName = String(fileInfo.name || "").trim();
    const sourceUrl = String(fileInfo.url || "").trim();
    if (isMarkedProcessedInMap_(processedMap, fileInfo)) {
      Logger.log("Tracker append skipped duplicate: " + fileName);
      return false;
    }

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
    "Tracker File Link normalization complete.\nRows scanned: " +
      rowCount +
      "\nRows updated: " +
      changed +
      "\nRecovered by file name match: " +
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
    const sourceFormulas = sh.getRange(2, sourceCol, rowCount, 1).getFormulas();

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
        candidates.sort(function (a, b) {
          return b.matchCount - a.matchCount;
        });
        const top = candidates[0];
        const second = candidates[1];
        const pickTopOnTie = CONFIG.backfillPickTopMatchOnTie !== false;
        const topWins = top.matchCount > (second ? second.matchCount : 0);

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
          sh.getRange(
            2 + write.startRow,
            sourceCol,
            write.formulas.length,
            1,
          ).setFormulas(write.formulas);
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
          if (tokensClean[ti] && fn.indexOf(tokensClean[ti]) !== -1)
            matchCount++;
        }
        if (matchCount > 0)
          candidates.push({ file: filesArr[fI], matchCount: matchCount });
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
  notify_(
    "Backfill diagnostics written to sheet: " +
      diagSheetName +
      " (rows: " +
      (outRows.length - 1) +
      ")",
  );
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
    } catch (e) {}
    try {
      if (gotScriptLock) lock.releaseLock();
    } catch (e) {}
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
    } catch (e) {}
    try {
      lock.releaseLock();
    } catch (e) {}
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
    const year = String(
      display[i][yearCol - 1] || values[i][yearCol - 1] || "",
    );
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
    previewGroups[k] = { keepRowNum: keep.rowNum, duplicates: duplicates };
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
  const result = { deleteRows: [], previewExample: "", warning: "" };

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
  const keepRowNum = keepCandidates.length
    ? keepCandidates[0]
    : matches[0].rowNum;

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
  if (isNaN(n))
    n = Number(
      String(displayValue || "")
        .replace(/,/g, "")
        .replace(/[^0-9.-]/g, ""),
    );
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
  for (let i = 0; i < sorted.length; i++) sheet.deleteRow(sorted[i]);
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

  if (values.length > 0)
    sh.getRange(2, 1, values.length, header.length).setValues(values);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, header.length);
  return name;
}

function findOutputSheetByYear_(ss, year) {
  if (!_CACHE.outputSheets) _CACHE.outputSheets = {};
  if (_CACHE.outputSheets[year]) return _CACHE.outputSheets[year];

  const cfg = getConfigMappingsCached_() || {};
  const mapping = cfg[year] || null;
  const desiredName = getOutputSheetNameForYear(year);

  let targetSheet = null;

  if (mapping && mapping.spreadsheetId) {
    try {
      const targetSs = SpreadsheetApp.openById(mapping.spreadsheetId);
      if (targetSs) {
        const sheetNameToUse =
          mapping.sheetName && mapping.sheetName.trim()
            ? mapping.sheetName
            : desiredName;
        targetSheet =
          targetSs.getSheetByName(sheetNameToUse) ||
          targetSs.getSheetByName(desiredName);

        if (!targetSheet) {
          targetSheet = targetSs.insertSheet(sheetNameToUse);
          if (targetSheet.getLastRow() === 0) {
            targetSheet.appendRow(
              COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
                CONFIG.enrichmentHeaders,
              ),
            );
          }
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

  if (!targetSheet) {
    targetSheet = ss.getSheetByName(desiredName);

    if (!targetSheet) {
      const target = ("gr posted " + year).toLowerCase();
      const sheets = ss.getSheets();
      for (let i = 0; i < sheets.length; i++) {
        const n = String(sheets[i].getName() || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (n === target || n.indexOf(target) !== -1) {
          targetSheet = sheets[i];
          break;
        }
      }
    }

    if (!targetSheet) {
      try {
        targetSheet = ss.insertSheet(desiredName);
        if (targetSheet.getLastRow() === 0) {
          targetSheet.appendRow(
            COLUMN_MAPPING.concat([CONFIG.sourceHeaderName]).concat(
              CONFIG.enrichmentHeaders,
            ),
          );
        }
      } catch (eCreateCtrl) {
        Logger.log(
          "Cannot create output sheet for year " +
            year +
            ": " +
            (eCreateCtrl && eCreateCtrl.message),
        );
      }
    }
  }

  if (targetSheet) _CACHE.outputSheets[year] = targetSheet;
  return targetSheet;
}

function notify_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message);
  }
}
