# GR Template Automation Consolidator
## Annotated Code Guide & Developer Reference

**Version:** 1.0  
**Language:** Google Apps Script (JavaScript)  
**Lines of Code:** 3000+  
**Entry Point:** `consolidateGRTemplateData()`

---

## Table of Contents

1. [Code Organization](#code-organization)
2. [Configuration & Constants](#configuration--constants)
3. [Architecture Diagram](#architecture-diagram)
4. [Major Code Sections](#major-code-sections)
5. [Data Flow Walkthrough](#data-flow-walkthrough)
6. [Caching & Performance](#caching--performance)
7. [Error Handling Patterns](#error-handling-patterns)
8. [Testing & Debugging](#testing--debugging)
9. [Future Improvements](#future-improvements)

---

## Code Organization

The script is organized into logical sections with clear separation of concerns:

```
TOP LEVEL
├── CONFIG (lines 4–32)
│   └─ Configuration object with all tunable parameters
│
├── COLUMN_MAPPING & COL (lines 35–67)
│   └─ Expected output columns and column index helpers
│
├── CACHE & Cache Functions (lines 70–105)
│   └─ In-memory caching for config and PLA lookup data
│
├── CORE PROCESSING
│   ├── consolidateGRTemplateData (lines 384–559)
│   │   └─ Main orchestrator function
│   ├── processSingleFile_ (lines 1187–1297)
│   │   └─ Per-file processing pipeline
│   └── File conversion, parsing, extraction, enrichment, append
│
├── SHEET MANAGEMENT
│   ├── ensureSheets_ (lines 754–802)
│   ├── findOutputSheetByYear_ (lines 3319–3420)
│   └─ Sheet creation, lookup, header management
│
├── PARSING & EXTRACTION
│   ├── parseConvertedSheet_ (lines 1372–1491)
│   ├── detectHeaderRowAndMap_ (lines 1751–1771)
│   ├── extractRowsWithFilter_ (lines 1643–1710)
│   └─ Header detection, row extraction, filtering
│
├── ENRICHMENT & LOOKUP
│   ├── getEnrichmentForRow_ (lines 129–173)
│   ├── loadPlaLookupMap_ (lines 694–733)
│   ├── toUsdIfPhp_ (lines 661–691)
│   └─ PLA lookup, currency conversion
│
├── TRACKER & LOGGING
│   ├── appendTrackerRowIfNotDuplicate_ (lines 2426–2463)
│   ├── logPerfEntry_ (lines 2520–2538)
│   ├── loadProcessedMap_ (lines 1114–1152)
│   └─ Audit trail, duplicate prevention, performance metrics
│
├── BACKFILL & REPAIR TOOLS
│   ├── backfillMissingSourceLinks_ (lines 2665–2848)
│   ├── fixSourceFileHyperlinksNow (lines 2271–2383)
│   ├── repairMainSiteColumnsNow (lines 2064–2138)
│   └─ Post-processing data repair and enrichment
│
├── AUTOMATION & TRIGGERS
│   ├── setupAutomaticEvery1Min (lines 339–365)
│   ├── stopAutomatic (lines 368–378)
│   └─ Time-based trigger creation/deletion
│
├── ADMIN & DEBUG TOOLS
│   ├── debugTestSingleFile (lines 2989–3051)
│   ├── debugMainSiteSetup (lines 3055–3093)
│   ├── debugAutoProcessingStatus (lines 3213–3316)
│   └─ Diagnostic and troubleshooting helpers
│
└── UI & MENU
    ├── onOpen (lines 279–315)
    ├── showYearPicker (lines 3097–3116)
    └─ Menu building and user interface
```

---

## Configuration & Constants

### CONFIG Object (Lines 4–32)

The CONFIG object is the central control point for all tunable parameters. Users typically only need to edit:
- `sourceFolderName` — Drive folder containing Excel files
- `outputSheets` — Target sheet names by year
- `usdConversionRate` — Exchange rate for currency conversion

**Advanced users may adjust:**
- `maxFilesPerRunTotal`, `maxFilesPerRunPerYear` — Processing batch sizes
- `maxRuntimeMs` — Maximum execution time per run (2 minutes = 120000 ms)
- `headerScanMaxRows` — How many rows to scan when detecting headers
- `minHeaderMatches` — Minimum header columns required to validate a sheet

```javascript
const CONFIG = {
  // Drive folder location (must match exact name)
  sourceFolderName: "GR template with Matdoc Reference: (File responses)",
  
  // Where to store temporary converted sheets
  tempFolderName: "_GR_AUTOMATION_TEMP",
  
  // Tracker sheet name (audit log)
  trackerSheetName: "Processed Files Log",
  
  // Default output sheets per year
  outputSheets: { 2025: "GR Posted 2025", 2026: "GR Posted 2026" },
  
  // Enrichment columns added to output
  enrichmentHeaders: [
    "Regional Area",
    "Cleaned Site Name",
    "Territory",
    "Amount To Billed (USD)",
  ],
  
  // Exchange rate for currency conversion (PHP per USD)
  usdConversionRate: 57,
  
  // Performance and limit settings
  triggerMinutes: 1,           // How often auto-trigger runs
  maxFilesPerRunTotal: 6,      // Max files per run (across all years)
  maxFilesPerRunPerYear: 3,    // Max files per year per run
  maxRuntimeMs: 120000,        // 2 minute timeout per run (6 min is hard limit)
  
  // Header detection tuning
  headerScanMaxRows: 80,       // Scan this many rows to find header
  minHeaderMatches: 3,         // Require at least 3 column matches
  
  // Safety checks
  maxFailedAttemptsPerFile: 5, // Skip files after 5 failed attempts
  onlyIncludeVisibleRows: true, // Ignore hidden/filtered rows
};
```

### COLUMN_MAPPING Array (Lines 35–67)

This array defines the canonical output column structure. Every output sheet must have these columns in this order:

```javascript
const COLUMN_MAPPING = [
  "Acceptance Date (PAC/FAC)",
  "PO No.",
  "PO Item No.",
  // ... 20+ more columns ...
  "Payment Milestone",
];

// Helper: Create an index map for fast column lookups
const COL = (function () {
  const m = {};
  for (var i = 0; i < COLUMN_MAPPING.length; i++) {
    m[COLUMN_MAPPING[i]] = i; // Maps "PO No." → 1, etc.
  }
  return m;
})();
```

**Usage:** `COL["PO No."]` returns the column index, useful for `row[COL["PO No."]]` to access values.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│          GR Consolidation System Architecture               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  INPUT LAYER                                               │
│  ┌──────────────┐                                           │
│  │ Excel Files  │ → (Google Drive folder)                   │
│  │ in Drive     │                                           │
│  └──────────────┘                                           │
│         │                                                   │
│         ↓                                                   │
│  CONVERSION LAYER                                           │
│  ┌──────────────────────────────────────┐                   │
│  │ convertExcelToTempSheet_             │                   │
│  │ (Drive API: convert Excel → Sheets)  │                   │
│  │ Result: temp Google Sheet in Drive   │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                   │
│         ↓                                                   │
│  PARSING LAYER                                              │
│  ┌──────────────────────────────────────┐                   │
│  │ parseConvertedSheet_                 │                   │
│  │ ├─ Detect best sheet/tab             │                   │
│  │ ├─ Find header row                   │                   │
│  │ ├─ Extract data rows                 │                   │
│  │ └─ Apply filters (summaries, etc.)   │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                   │
│         ↓                                                   │
│  ENRICHMENT LAYER                                           │
│  ┌──────────────────────────────────────┐                   │
│  │ getEnrichmentForRow_                 │                   │
│  │ ├─ Lookup PLA data                   │                   │
│  │ ├─ Convert currency to USD           │                   │
│  │ └─ Fill enrichment columns           │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                   │
│         ↓                                                   │
│  OUTPUT LAYER                                               │
│  ┌──────────────────────────────────────┐                   │
│  │ appendRowsWithSourceLink_            │                   │
│  │ ├─ Append to output sheet            │                   │
│  │ ├─ Add source file hyperlink         │                   │
│  │ └─ Apply formatting                  │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                   │
│         ↓                                                   │
│  LOGGING LAYER                                              │
│  ┌──────────────────────────────────────┐                   │
│  │ appendTrackerRowIfNotDuplicate_      │                   │
│  │ logPerfEntry_                        │                   │
│  │ └─ Record in Processed Files Log     │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                   │
│         ↓                                                   │
│  CLEANUP LAYER                                              │
│  ┌──────────────────────────────────────┐                   │
│  │ Delete temp Google Sheet (move to    │                   │
│  │ Trash in Drive)                      │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                   │
│         ↓                                                   │
│  OUTPUT                                                    │
│  ├─ Rows added to "GR Posted 2025/2026"                   │
│  ├─ Processed Files Log updated                           │
│  └─ Performance metrics logged                            │
│                                                              │
│  CONTROL FLOW                                              │
│  ┌──────────────────────┐                                   │
│  │ consolidateGRTemplate │ (main orchestrator)              │
│  │ Called by:           │                                   │
│  │ - Manual click       │                                   │
│  │ - 1-min trigger      │                                   │
│  └──────────────────────┘                                   │
│         │                                                   │
│         ├─→ Lock check (prevent overlaps)                   │
│         ├─→ Scan Drive folder                               │
│         ├─→ Load processedMap (duplicates)                  │
│         ├─→ Build candidate list                            │
│         ├─→ Apply limits (6 total, 3 per year)             │
│         └─→ Loop: processSingleFile_ for each              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Major Code Sections

### Section 1: Main Orchestrator (consolidateGRTemplateData)

**Location:** Lines 384–559  
**Invoked By:** Manual menu click or 1-minute time-based trigger

**Pseudocode:**
```javascript
function consolidateGRTemplateData() {
  1. Try to acquire lock (prevent concurrent runs)
  2. Store run state in Script Properties (started at, status: Processing)
  3. Get bound spreadsheet
  4. Ensure all required sheets exist
  5. Load processed files map (for duplicate detection)
  6. Load failed attempts map (for retry control)
  7. Load source folder
  8. Scan folder for new Excel files → build candidate list
  9. For each candidate:
     - processSingleFile_ (convert, parse, enrich, append, log)
     - Check if runtime exceeded (maxRuntimeMs)
     - If so, stop processing and save state
  10. Update Script Properties (finished at, final status)
  11. Release lock
}
```

**Key Patterns:**
- **Lock management:** Uses `LockService` to prevent overlapping runs
- **Runtime budget:** Checks `Date.now() - startTime` to stop before 6-minute timeout
- **Batch limits:** Respects `maxFilesPerRunTotal` and `maxFilesPerRunPerYear`
- **State persistence:** Updates Script Properties for UI display and resume capability

### Section 2: File Processing Pipeline (processSingleFile_)

**Location:** Lines 1187–1297  
**Called by:** `consolidateGRTemplateData()` for each candidate file

**Pseudocode:**
```javascript
function processSingleFile_(ss, fileInfo, tempFolder) {
  var result = { rowsAdded: 0, status: "Processing", timings: {} };
  
  try {
    // Step 1: Convert Excel to temp Google Sheet
    var convertStart = Date.now();
    var tempSheetId = convertExcelToTempSheet_(fileInfo, tempFolder);
    result.timings.convertMs = Date.now() - convertStart;
    
    // Step 2: Open converted sheet
    var openStart = Date.now();
    var tempSS = openSpreadsheetWithRetry_(tempSheetId, 3, 500);
    result.timings.openMs = Date.now() - openStart;
    
    // Step 3: Parse and extract rows
    var parseStart = Date.now();
    var parsed = parseConvertedSheet_(tempSS, fileInfo.name);
    var rows = parsed.rows;
    result.timings.parseMs = Date.now() - parseStart;
    
    // Step 4: Append rows to output
    var appendStart = Date.now();
    var rowsAdded = appendRowsWithSourceLink_(
      targetSheet, rows, fileInfo, ss
    );
    result.timings.appendMs = Date.now() - appendStart;
    result.rowsAdded = rowsAdded;
    
    // Determine status based on rows added
    if (rowsAdded > 0) {
      result.status = "Done";
    } else {
      result.status = "No data extracted";
    }
    
  } catch (e) {
    result.status = "Error: " + e.message;
  } finally {
    // Always cleanup: delete temp file
    try {
      tempFile.setTrashed(true); // Move to trash
    } catch (e) {
      Logger.log("Cleanup failed: " + e.message);
      // Continue anyway; file can be manually deleted
    }
    
    // Log results
    logToTracker_(ss, fileInfo, result);
    logPerfEntry_(fileInfo, result.timings);
  }
  
  return result;
}
```

**Key Patterns:**
- **Timing instrumentation:** Measures each step (convert, open, parse, append)
- **Try-catch-finally:** Ensures cleanup always runs (temp file deleted)
- **Error handling:** Graceful degradation; logs errors and continues
- **Status determination:** "Done" only if rows added; "No data extracted" if rows empty

### Section 3: Header Detection & Column Mapping

**Location:** Lines 1751–1771, 1774–1826  

**Pseudocode:**
```javascript
function detectHeaderRowAndMap_(values) {
  // Scan rows to find the one with most expected column matches
  var bestMatch = {
    headerRowIndex: -1,
    matchCount: 0,
    columnMap: {},
  };
  
  for (var i = 0; i < Math.min(values.length, CONFIG.headerScanMaxRows); i++) {
    var row = values[i];
    var columnMap = createColumnMapping_(row);
    var matchCount = countMappedHeaders_(columnMap, row);
    
    if (matchCount > bestMatch.matchCount) {
      bestMatch.headerRowIndex = i;
      bestMatch.matchCount = matchCount;
      bestMatch.columnMap = columnMap;
    }
  }
  
  if (bestMatch.matchCount < CONFIG.minHeaderMatches) {
    throw new Error("No valid header found (< " + CONFIG.minHeaderMatches + " matches)");
  }
  
  return bestMatch;
}

function createColumnMapping_(headerRow) {
  // Map each header cell to canonical column name using aliases
  var map = {};
  
  for (var i = 0; i < headerRow.length; i++) {
    var cellValue = normalizeText_(headerRow[i]);
    var canonicalName = HEADER_ALIASES[cellValue] || cellValue;
    
    // Check if this canonical name is in our expected columns
    if (COL[canonicalName] !== undefined) {
      map[canonicalName] = i;
    }
  }
  
  return map;
}
```

**Key Patterns:**
- **Fuzzy matching:** Uses `HEADER_ALIASES` for variations (PO Number → PO No.)
- **Scoring:** Picks sheet/row with most matches (not all-or-nothing)
- **Thresholding:** Requires minimum 3 matches to be considered valid
- **Idempotency:** Deterministic; same input always produces same output

### Section 4: Row Extraction & Filtering

**Location:** Lines 1643–1710  

**Pseudocode:**
```javascript
function extractRowsWithFilter_(startRow, endRow, columnMap, rawValues, sheet) {
  var validRows = [];
  
  for (var rowNum = startRow; rowNum <= endRow && rowNum < rawValues.length; rowNum++) {
    var rawRow = rawValues[rowNum];
    var dispRow = sheet.getRange(rowNum + 1, 1, 1, rawRow.length)
                       .getDisplayValues()[0];
    
    // Apply filters in sequence
    
    // 1. Skip hidden rows if configured
    if (CONFIG.onlyIncludeVisibleRows && !isSheetRowVisible_(sheet, rowNum + 1)) {
      continue;
    }
    
    // 2. Skip summary/footer rows
    if (isSummaryOrFooterRow_(rawRow, dispRow)) {
      continue;
    }
    
    // 3. Skip repeated header rows
    if (isRepeatedHeaderRow_(rawRow)) {
      continue;
    }
    
    // 4. Skip merged-cell artifacts
    if (isLikelyMergedArtifactRow_(rawRow, dispRow)) {
      continue;
    }
    
    // 5. Skip empty rows
    if (isEmptyRow_(rawRow, dispRow)) {
      continue;
    }
    
    // 6. Keep if it looks like data
    if (isLikelyDataRow_(rawRow, dispRow)) {
      validRows.push(rawRow);
    }
  }
  
  return validRows;
}
```

**Filtering Strategy:**
1. **Visibility:** Respect user's hide/filter decisions
2. **Content patterns:** Skip rows containing summary keywords (TOTAL, SUBTOTAL, etc.)
3. **Structure:** Skip repeated headers and merged-cell artifacts
4. **Content presence:** Skip empty rows; keep rows with actual data

**Why sequential filtering?**
- Early filters (visibility, summary) are fast and eliminate obvious junk
- Later filters (merged artifacts, data likelihood) are more complex
- Stops processing once a row fails any filter (short-circuit evaluation)

### Section 5: Enrichment & Currency Conversion

**Location:** Lines 129–173, 661–691, 694–733  

**Pseudocode:**
```javascript
function getEnrichmentForRow_(row, lookupMap) {
  // Extract identifiers from row
  var plaId = normalizePlaLookupKey_(row[COL["PO PLA ID"]]);
  var materialDesc = row[COL["Material Description"]] || "";
  var serviceText = row[COL["PO Service Short Text"]] || "";
  
  // Look up enrichment data
  var lookupData = lookupMap[plaId] || {};
  var regionalArea = lookupData.regionalArea || "";
  var siteName = lookupData.siteName || "";
  var territory = lookupData.territory || "";
  
  // Special handling for OPEX/Managed Services
  if (isManagedServices_(materialDesc, serviceText) || isOpexWbs_(row[COL["WBS Element"]])) {
    territory = ""; // OPEX entries have no territory
  }
  
  // Currency conversion
  var amount = parseAmount_(row[COL["Amount To Billed"]]);
  var currency = row[COL["Currency"]];
  var usdAmount = toUsdIfPhp_(amount, currency);
  
  // Return enriched columns
  return [regionalArea, siteName, territory, usdAmount];
}

function toUsdIfPhp_(amountValue, currencyValue) {
  var amount = parseAmount_(amountValue);
  
  if (isPhpCurrency_(currencyValue) || isEurCurrency_(currencyValue)) {
    // Convert to USD
    return amount / CONFIG.usdConversionRate;
  } else if (isUsdCurrency_(currencyValue)) {
    return amount; // Already USD
  } else {
    return amount; // Unknown currency; return as-is
  }
}
```

**Key Patterns:**
- **PLA lookup:** Uses normalized PLA ID as key for fast dictionary lookup
- **Fallbacks:** If lookup fails, enrichment columns are blank (acceptable)
- **Special cases:** OPEX and Managed Services have different territory logic
- **Currency detection:** Multiple representations (PHP, php, ₱) all recognized

### Section 6: Tracker & Idempotency

**Location:** Lines 1114–1152, 2426–2463  

**Pseudocode:**
```javascript
function loadProcessedMap_(ss) {
  // Read Processed Files Log into memory
  var sheet = ss.getSheetByName(CONFIG.trackerSheetName);
  var data = sheet.getDataRange().getValues();
  var map = {};
  
  // For each row in tracker, generate 6 different matching keys
  for (var i = 1; i < data.length; i++) { // Skip header
    var row = data[i];
    var fileName = row[1]; // Column B: File Name
    var fileId = row[6];   // Column G: extracted from File Link
    var fileUrl = row[6];  // Column G: File Link URL
    
    // Key 1: Raw filename
    map[fileName] = true;
    
    // Key 2: Normalized filename
    map[normalizeFileKey_(fileName)] = true;
    
    // Key 3: Drive ID (prefixed to distinguish)
    map["__ID__" + extractDriveIdFromUrl_(fileUrl)] = true;
    
    // Key 4: Alternative ID format
    map["__SOURCE_ID__" + extractDriveIdFromUrl_(fileUrl)] = true;
    
    // Key 5: Normalized URL
    map["__URL__" + normalizeDriveUrlForKey_(fileUrl)] = true;
    
    // Key 6: URL with host stripped
    map["__URL_ALT__" + normalizeDriveUrlForKey_(fileUrl).replace(/.*\//, "")] = true;
  }
  
  return map;
}

function appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, processedMap) {
  // Generate 6 keys for this file
  var keys = [
    fileInfo.name,
    normalizeFileKey_(fileInfo.name),
    "__ID__" + fileInfo.id,
    "__SOURCE_ID__" + fileInfo.id,
    "__URL__" + normalizeDriveUrlForKey_(fileInfo.url),
    "__URL_ALT__" + normalizeDriveUrlForKey_(fileInfo.url).replace(/.*\//, ""),
  ];
  
  // Check if ANY key already exists in processedMap
  for (var i = 0; i < keys.length; i++) {
    if (processedMap[keys[i]]) {
      // This file was already processed; skip logging
      return false;
    }
  }
  
  // Not a duplicate; log it
  var sheet = ss.getSheetByName(CONFIG.trackerSheetName);
  var trackerRow = [
    new Date(), // Timestamp
    fileInfo.name,
    fileInfo.month || "",
    fileInfo.year,
    result.rowsAdded,
    result.status,
    '=HYPERLINK("' + fileInfo.url + '","Open File")', // Hyperlink formula
  ];
  
  sheet.appendRow(trackerRow);
  
  // Add all keys to processedMap for future checks
  for (var i = 0; i < keys.length; i++) {
    processedMap[keys[i]] = true;
  }
  
  return true;
}
```

**Why 6 different keys?**
- **Handles file renames:** Normalized name key catches "GR_2025.xlsx" and "GR-2025.xlsx"
- **Handles Drive ID changes:** Drive sometimes changes URLs; ID is more stable
- **Handles URL variations:** Drive has multiple URL formats; multiple checks ensure we catch duplicates
- **Prevents false negatives:** If ANY key matches, we consider it a duplicate

---

## Data Flow Walkthrough

Here's a complete example data flow for a single file:

```
USER UPLOADS FILE
  ↓
File: "GR_REQUEST_2025_April.xlsx" (200 KB)
  ├─ Location: Drive folder "GR template with Matdoc Reference: (File responses)"
  ├─ Last modified: April 17, 2026
  └─ Contains: 3 sheets: [Summary], [GR TEMPLATE], [Archive]

USER CLICKS MENU
  ↓
"GR Automation" → "Processing" → "Process All New Files Now"
  ↓
consolidateGRTemplateData() STARTS
  ├─ Acquires lock (prevents concurrent run)
  ├─ Ensures sheets exist (output, tracker, lookup)
  ├─ Loads processedMap from tracker (check for duplicates)
  ├─ Scans Drive folder → finds "GR_REQUEST_2025_April.xlsx"
  ├─ Detects year = 2025 (from filename)
  ├─ Adds to candidate list: {id, name, year, month, url}
  └─ Calls processSingleFile_()

processSingleFile_() PROCESSES THE FILE
  │
  ├─ STEP 1: CONVERSION
  │  ├─ Calls convertExcelToTempSheet_()
  │  ├─ Google Drive API: copy (Excel) → temporary Google Sheet
  │  ├─ Temp file created: "_TEMP_GR_REQUEST_2025_April" (in _GR_AUTOMATION_TEMP folder)
  │  ├─ Temp sheet ID: "1aBcDeF..." (new sheet in Drive)
  │  └─ Time: ~45 seconds
  │
  ├─ STEP 2: OPEN
  │  ├─ Calls openSpreadsheetWithRetry_()
  │  ├─ Opens temp sheet in Apps Script (SpreadsheetApp.openById)
  │  ├─ If fails: retry up to 3 times with backoff
  │  └─ Time: ~5 seconds
  │
  ├─ STEP 3: PARSE & DETECT SHEET
  │  ├─ Calls parseConvertedSheet_(tempSS, "GR_REQUEST_2025_April.xlsx")
  │  ├─ Evaluates all 3 sheets:
  │  │  ├─ [Summary]: Fast-path check; "Summary" ≠ "GR TEMPLATE" → score low
  │  │  ├─ [GR TEMPLATE]: Fast-path match! → skip detailed scoring
  │  │  │  (because CONFIG.preferDirectTemplateTabFastPath = true)
  │  │  └─ [Archive]: Not checked (fast-path already found match)
  │  ├─ Selects: [GR TEMPLATE] sheet
  │  └─ Time: ~3 seconds
  │
  ├─ STEP 4: DETECT HEADER
  │  ├─ Calls detectHeaderRowAndMap_()
  │  ├─ Scans rows [1..80] looking for header
  │  ├─ Row 1: ["Summary", "April", "2025"] → normalizes; matches 0 expected columns
  │  ├─ Row 2: ["Region", "PO No.", "Material"] → normalizes; matches 2 expected columns
  │  ├─ Row 3: ["Region", "PO No.", "Material Desc", ..., "Currency", "Amount"]
  │  │  → normalizes; matches 5 expected columns!
  │  ├─ Row 3 is best match → HEADER FOUND
  │  ├─ Column map: {"PO No." → 1, "Material Description" → 2, ...}
  │  └─ Time: ~2 seconds
  │
  ├─ STEP 5: EXTRACT DATA ROWS
  │  ├─ Calls extractRowsWithFilter_()
  │  ├─ Iterates rows [4..2500] (respecting CONFIG.maxRowsPerSheetScan)
  │  ├─ For each row, applies filters:
  │  │
  │  │  Row 4: ["APAC", "PO-001", "Material X", ..., "PHP", "50000"]
  │  │    ├─ Visible? Yes
  │  │    ├─ Summary row? No (no TOTAL, SUBTOTAL, etc.)
  │  │    ├─ Repeated header? No
  │  │    ├─ Merged artifact? No
  │  │    ├─ Empty? No
  │  │    └─ KEEP THIS ROW ✓
  │  │
  │  │  Row 5: ["TOTAL", "-----", "-----", ..., "-----", "-----"]
  │  │    └─ Summary row? Yes (contains "TOTAL") → SKIP ✗
  │  │
  │  │  Row 6: ["", "", "", ..., "", ""]
  │  │    └─ Empty? Yes → SKIP ✗
  │  │
  │  │  Row 7: ["APAC", "PO-002", "Material Y", ..., "EUR", "1500"]
  │  │    └─ KEEP THIS ROW ✓
  │  │
  │  ├─ Result: 25 valid data rows extracted
  │  └─ Time: ~8 seconds
  │
  ├─ STEP 6: ENRICH ROWS
  │  ├─ Calls getEnrichmentForRow_() for each of 25 rows
  │  ├─ Loads PLA Lookup map (cached from PLA Lookup sheet)
  │  │
  │  │  Row 4 enrichment:
  │  │    ├─ Extract PLA ID: "PH001" (from "PO PLA ID" column)
  │  │    ├─ Lookup "PH001" in map → {regionalArea: "APAC", siteName: "Manila", territory: "Philippines"}
  │  │    ├─ Currency: "PHP" → convert 50000 PHP
  │  │    ├─ USD = 50000 / 57 = 877.19 USD
  │  │    └─ Enriched: ["APAC", "Manila", "Philippines", 877.19]
  │  │
  │  │  Row 7 enrichment:
  │  │    ├─ Extract PLA ID: "SG002"
  │  │    ├─ Lookup → {regionalArea: "APAC", siteName: "Singapore", territory: "Singapore"}
  │  │    ├─ Currency: "EUR" → convert 1500 EUR
  │  │    ├─ USD = 1500 / 57 = 26.32 USD
  │  │    └─ Enriched: ["APAC", "Singapore", "Singapore", 26.32]
  │  │
  │  └─ Time: ~4 seconds
  │
  ├─ STEP 7: APPEND TO OUTPUT
  │  ├─ Calls appendRowsWithSourceLink_()
  │  ├─ Finds output sheet: "GR Posted 2025" (determined by detected year 2025)
  │  ├─ Appends 25 rows with:
  │  │  ├─ All COLUMN_MAPPING data
  │  │  ├─ Source File: =HYPERLINK("https://drive.google.com/file/d/xyz", "GR_REQUEST_2025_April.xlsx")
  │  │  ├─ Regional Area, Cleaned Site Name, Territory (from enrichment)
  │  │  └─ Amount To Billed (USD) (from enrichment)
  │  ├─ Applies formatting:
  │  │  ├─ Dates: formatted as dates
  │  │  ├─ Currency: formatted with $ and decimals
  │  │  └─ Percentages: formatted with %
  │  └─ Time: ~10 seconds
  │
  ├─ STEP 8: LOG TO TRACKER
  │  ├─ Checks if file was already processed (check processedMap)
  │  ├─ Generates 6 matching keys → all unique (new file)
  │  ├─ Appends to "Processed Files Log":
  │  │  ├─ Timestamp: 4/17/2026 10:30 AM
  │  │  ├─ File Name: "GR_REQUEST_2025_April.xlsx"
  │  │  ├─ Month: "April" (extracted from filename or file date)
  │  │  ├─ Year: 2025
  │  │  ├─ Rows Added: 25
  │  │  ├─ Status: "Done"
  │  │  └─ File Link: =HYPERLINK(...)
  │  └─ Time: ~2 seconds
  │
  ├─ STEP 9: LOG PERFORMANCE
  │  ├─ Appends to "GR Automation Perf" sheet:
  │  │  ├─ Timestamp: 4/17/2026 10:30 AM
  │  │  ├─ File Name: "GR_REQUEST_2025_April.xlsx"
  │  │  ├─ Year: 2025
  │  │  ├─ ConvertMs: 45000
  │  │  ├─ OpenMs: 5000
  │  │  ├─ ParseMs: 3000
  │  │  ├─ AppendMs: 10000
  │  │  ├─ TotalMs: 63000 (1 minute 3 seconds)
  │  │  ├─ RowsAdded: 25
  │  │  └─ Status: "Done"
  │  └─ Time: ~1 second
  │
  └─ STEP 10: CLEANUP
     ├─ Deletes temp Google Sheet (move to Drive Trash)
     ├─ File "_TEMP_GR_REQUEST_2025_April" trashed
     └─ Time: ~2 seconds

PROCESSING COMPLETE
  ↓
consolidateGRTemplateData() finishes
  ├─ Updates Script Properties:
  │  ├─ LAST_RUN_STARTED_AT: "4/17/2026 10:30 AM"
  │  ├─ LAST_RUN_FINISHED_AT: "4/17/2026 10:33 AM"
  │  ├─ LAST_RUN_STATUS: "Completed successfully"
  │  ├─ LAST_RUN_FILES_PROCESSED: 1
  │  └─ LAST_RUN_ROWS_ADDED: 25
  ├─ Releases lock
  └─ Shows notification: "Processing completed. 25 rows added to GR Posted 2025."

RESULTS
  ↓
✓ 25 rows in "GR Posted 2025" sheet with:
  ├─ All GR data extracted and normalized
  ├─ Enrichment columns populated (Region, Site, Territory, USD)
  ├─ Source File hyperlinks added (clickable)
  └─ Formatting applied

✓ Tracker entry recorded:
  ├─ File marked as "Done"
  ├─ 25 rows documented
  └─ Performance metrics logged

✓ Temp file cleaned up (Drive Trash)

NEXT RUN (1 minute later)
  ↓
If auto-trigger enabled:
  ├─ consolidateGRTemplateData() runs again
  ├─ Scans for MORE new Excel files
  ├─ Skips "GR_REQUEST_2025_April.xlsx" (already in processedMap)
  └─ Processes next batch (max 6 files, respecting limits)
```

---

## Caching & Performance

The script uses multiple caching strategies to improve performance:

### 1. Configuration Mapping Cache

```javascript
var _CACHE = {
  configMappings: null,           // Cached config from "GR Automation Config" sheet
  plaLookupMapBySsId: {},         // Cached PLA lookups per spreadsheet ID
};

function getConfigMappingsCached_(force) {
  if (!force && _CACHE.configMappings) {
    return _CACHE.configMappings; // Return cached copy
  }
  
  var m = readConfigMappings_();  // Read from sheet (slow)
  _CACHE.configMappings = m || {};
  return _CACHE.configMappings;
}

function clearConfigMappingsCache_() {
  _CACHE.configMappings = null;  // Force reload next time
}
```

**Why cache?**
- Reading a sheet involves `sheet.getDataRange()` which is slow
- Cache avoids repeated sheet reads during a single run
- Cleared between runs to ensure fresh config

### 2. PLA Lookup Cache

```javascript
function getPlaLookupMapCached_(ss, force) {
  if (!ss) return {};
  
  var id = ss.getId ? ss.getId() : String(ss || "");
  if (!force && _CACHE.plaLookupMapBySsId[id]) {
    return _CACHE.plaLookupMapBySsId[id]; // Return cached copy
  }
  
  var m = loadPlaLookupMap_(ss);  // Load from PLA Lookup sheet (slow)
  _CACHE.plaLookupMapBySsId[id] = m || {};
  return _CACHE.plaLookupMapBySsId[id];
}
```

**Why cache per spreadsheet?**
- System can output to multiple spreadsheets (different years)
- Each spreadsheet might have different PLA Lookup data
- Cache keyed by spreadsheet ID to handle multiple targets

### 3. In-Memory Processed Files Map

```javascript
function loadProcessedMap_(ss) {
  // Read Processed Files Log ONCE into memory
  // Return map with 6 keys per file
  // This map is checked for each file in a run
  
  // Performance: O(1) lookup in-memory vs. O(n) sheet scan
}
```

**Why in-memory map?**
- Tracker sheet can have thousands of rows
- Checking Sheet every time is O(n) slow
- In-memory map is O(1) fast for duplicate detection

---

## Error Handling Patterns

### Pattern 1: Try-Catch-Finally with Cleanup

```javascript
function processSingleFile_(ss, fileInfo, tempFolder) {
  var tempFile = null;
  
  try {
    // Main processing steps
    tempFile = convertExcelToTempSheet_(fileInfo, tempFolder);
    // ... do work ...
    return result;
    
  } catch (e) {
    // Handle specific error types
    if (e.message.includes("NON_RETRIABLE_TOO_LARGE")) {
      result.status = "Needs manual check - file too large";
    } else {
      result.status = "Error: " + e.message;
    }
    return result;
    
  } finally {
    // ALWAYS cleanup, even if error occurred
    try {
      if (tempFile) {
        tempFile.setTrashed(true); // Move to trash
      }
    } catch (cleanupError) {
      Logger.log("Cleanup failed (non-fatal): " + cleanupError.message);
      // Continue; file can be manually deleted
    }
  }
}
```

**Key principles:**
- `try`: Main happy-path logic
- `catch`: Convert exceptions to error statuses (don't re-throw; continue processing)
- `finally`: Cleanup always runs (temp file deletion, lock release, etc.)

### Pattern 2: Graceful Degradation

```javascript
function getEnrichmentForRow_(row, lookupMap) {
  var plaId = row[COL["PO PLA ID"]];
  var lookupData = lookupMap[plaId] || {}; // Fallback to empty object
  
  return [
    lookupData.regionalArea || "",  // Fallback to blank
    lookupData.siteName || "",
    lookupData.territory || "",
    usdAmount || 0,
  ];
}
```

**Pattern:**
- If lookup fails, enrichment columns are blank (not error)
- Data is still valid and appended
- Non-critical failures don't block processing

### Pattern 3: Lock-Based Concurrency Control

```javascript
function consolidateGRTemplateData() {
  var lock = LockService.getScriptLock();
  
  if (!lock.tryLock(5000)) {
    // Could not acquire lock within 5 seconds
    // Another run is in progress
    PropertiesService.getScriptProperties()
      .setProperty("LAST_RUN_STATUS", "Skipped (another run in progress)");
    return;
  }
  
  try {
    // Do the work
    // ... process files ...
    
  } finally {
    lock.releaseLock();
  }
}
```

**Why locks?**
- Without locks, overlapping runs could:
  - Process same file twice (duplicate rows)
  - Race conditions in temp folder
  - Corrupt tracker sheet
- Locks ensure only one run at a time

---

## Testing & Debugging

### 1. Debug Tool: Single File Test

```javascript
function debugTestSingleFile() {
  // UI: File picker dialog
  var file = userSelectsFile(); // Modal file picker
  
  // Debug: Process just this file with detailed logging
  var result = processSingleFile_(ss, fileInfo, tempFolder);
  
  // Output detailed debug info
  Logger.log("=== DEBUG: Single File Test ===");
  Logger.log("File: " + fileInfo.name);
  Logger.log("Conversion: " + result.timings.convertMs + "ms");
  Logger.log("Parsing: " + result.timings.parseMs + "ms");
  Logger.log("Rows extracted: " + result.rowsAdded);
  Logger.log("Status: " + result.status);
  Logger.log("Errors: " + (result.errors ? result.errors.join("; ") : "None"));
}
```

### 2. Debug Tool: Setup Verification

```javascript
function debugMainSiteSetup() {
  // Check if all required sheets exist
  var issues = [];
  
  var trackerSheet = ss.getSheetByName(CONFIG.trackerSheetName);
  if (!trackerSheet) {
    issues.push("Tracker sheet missing: " + CONFIG.trackerSheetName);
  } else {
    if (!hasHeaders_(trackerSheet, ["Timestamp", "File Name", "Status"])) {
      issues.push("Tracker sheet missing required headers");
    }
  }
  
  var plaSheet = ss.getSheetByName(CONFIG.lookupSheetName);
  if (!plaSheet) {
    issues.push("PLA Lookup sheet missing: " + CONFIG.lookupSheetName);
  }
  
  // For each configured year:
  var outputSheetNames = Object.values(CONFIG.outputSheets);
  for (var i = 0; i < outputSheetNames.length; i++) {
    var sheetName = outputSheetNames[i];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      issues.push("Output sheet missing: " + sheetName);
    } else {
      if (!hasHeaders_(sheet, COLUMN_MAPPING)) {
        issues.push("Output sheet " + sheetName + " missing required columns");
      }
    }
  }
  
  if (issues.length === 0) {
    SpreadsheetApp.getUi().alert("✓ Setup verified! All sheets and columns are correct.");
  } else {
    SpreadsheetApp.getUi().alert("Issues found:\n" + issues.join("\n"));
  }
}
```

### 3. Logging Best Practices

```javascript
function logPerfEntry_(fileInfo, timings) {
  // Log timing data to perf sheet for analysis
  // Useful for identifying slow files and bottlenecks
  
  var perfSheet = ensurePerfSheetExists_();
  
  perfSheet.appendRow([
    new Date(),                // Timestamp (always include for trending)
    fileInfo.name,
    fileInfo.year,
    timings.convertMs,         // Usually slowest: ~30-60 sec per file
    timings.openMs,
    timings.parseMs,
    timings.appendMs,
    timings.totalMs,           // Total time for this file
    rowsAdded,
    status,
  ]);
  
  // Log to Apps Script console for immediate feedback
  Logger.log(fileInfo.name + " processed in " + timings.totalMs + "ms");
}
```

---

## Future Improvements

Potential enhancements to the system:

### 1. Multi-Sheet Detection Improvement

**Current:** Scores sheets based on header match count

**Future:** Consider sheet size, row count, content patterns (heuristic score)

```javascript
function scoreSheet(sheet) {
  var score = 0;
  
  // Header matching (current method)
  score += countMappedHeaders(...) * 10;
  
  // Sheet size: sheets with 10-1000 rows more likely data
  var rowCount = sheet.getLastRow();
  if (rowCount > 10 && rowCount < 1000) score += 5;
  
  // Content density: sheets with few empty rows
  var density = calculateContentDensity(sheet);
  score += density * 5;
  
  // Sheet name preference: "Data", "Details" more likely than "Summary"
  if (sheet.getName().includes("Data")) score += 3;
  if (sheet.getName().includes("Summary")) score -= 5;
  
  return score;
}
```

### 2. Parallel Processing

**Current:** Processes files sequentially (one at a time)

**Future:** Use Google Apps Script parallel execution (requires architectural changes)

```javascript
// Use ExecutionAPI to submit parallel jobs
// Run 3 files in parallel, wait for all to complete
var jobs = [];
for (var i = 0; i < 3; i++) {
  jobs.push(submitJobAsync_(files[i]));
}
var results = waitForAll(jobs);
```

### 3. Incremental Header Detection Cache

**Current:** Detects header for each file

**Future:** Cache detected headers per source filename pattern

```javascript
var _HEADER_CACHE = {};

function detectHeaderRowCached_(values, fileNameToken) {
  var cacheKey = fileNameToken; // e.g., "GR_REQUEST"
  
  if (_HEADER_CACHE[cacheKey]) {
    return _HEADER_CACHE[cacheKey]; // Reuse detected header from previous run
  }
  
  var result = detectHeaderRowAndMap_(values);
  _HEADER_CACHE[cacheKey] = result;
  return result;
}
```

### 4. Webhook for Real-Time Triggering

**Current:** Time-based 1-minute polling

**Future:** Use Google Cloud Pub/Sub or Drive webhooks for event-driven processing

```javascript
// When file uploaded to Drive folder, immediately trigger processing
function onDriveFileUpload(event) {
  // Called by Drive API webhook when new file appears
  consolidateGRTemplateData(); // Process immediately
}
```

### 5. Data Validation & Quality Checks

**Current:** Minimal validation

**Future:** Add configurable quality checks

```javascript
function validateRow(row) {
  var issues = [];
  
  // Check required fields
  if (!row[COL["PO No."]]) {
    issues.push("Missing PO No.");
  }
  
  // Check data types
  var qty = parseFloat(row[COL["Installed Qty"]]);
  if (isNaN(qty) || qty < 0) {
    issues.push("Invalid quantity: " + row[COL["Installed Qty"]]);
  }
  
  // Check domain values
  var currency = row[COL["Currency"]];
  if (!["USD", "PHP", "EUR"].includes(currency)) {
    issues.push("Unexpected currency: " + currency);
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues,
  };
}
```

### 6. Metrics & Dashboarding

**Current:** Manual tracker sheet review

**Future:** Automated metrics computed by script

```javascript
function computeMetrics() {
  var trackerSheet = ss.getSheetByName(CONFIG.trackerSheetName);
  var data = trackerSheet.getDataRange().getValues();
  
  var metrics = {
    totalFiles: data.length - 1,
    totalRows: 0,
    successCount: 0,
    failureCount: 0,
    successRate: 0,
  };
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    metrics.totalRows += row[4]; // Rows Added column
    if (row[5] === "Done") {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }
  }
  
  metrics.successRate = (metrics.successCount / metrics.totalFiles * 100).toFixed(2) + "%";
  
  return metrics;
}
```

---

## Quick Reference

### Key Files
- **Main script:** `gs-script-v10.gs` (3000+ lines)
- **User manual:** [USER_MANUAL_GR_CONSOLIDATION.md](./USER_MANUAL_GR_CONSOLIDATION.md)
- **Script reference:** [SCRIPT_REFERENCE.csv](./SCRIPT_REFERENCE.csv) — detailed per-function docs

### Key Functions by Category

**Main Orchestration:**
- `consolidateGRTemplateData()` — Main run function
- `processSingleFile_()` — Per-file processing

**File Processing:**
- `convertExcelToTempSheet_()` — Excel → Google Sheets conversion
- `parseConvertedSheet_()` — Parse and extract rows
- `appendRowsWithSourceLink_()` — Write to output sheet

**Enrichment:**
- `getEnrichmentForRow_()` — Add lookup & currency data
- `loadPlaLookupMap_()` — Load PLA lookup sheet

**Tracker & Logs:**
- `appendTrackerRowIfNotDuplicate_()` — Log results
- `loadProcessedMap_()` — Duplicate detection

**Configuration:**
- CONFIG object (lines 4–32)
- COLUMN_MAPPING array (lines 35–67)
- HEADER_ALIASES object (lines 177–245)

### Common Configuration Changes

```javascript
// Change USD conversion rate
usdConversionRate: 58  // was 57

// Increase processing batch
maxFilesPerRunTotal: 10  // was 6
maxFilesPerRunPerYear: 5  // was 3

// Reduce runtime budget (if timing out)
maxRuntimeMs: 90000  // was 120000 (1.5 min instead of 2 min)
```

---

**End of Annotated Code Guide**

For the complete, fully-annotated source code with inline comments for every function, visit:
**[GitHub/Gist Link to Full Annotated Source Code - TBD]**

