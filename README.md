# GR Template Automation Consolidator

**Version:** 1.0.1 | **Last Updated:** May 5, 2026

A Google Apps Script automation system for consolidating Goods Receipt (GR) data from multiple Excel files into unified, Google Sheets.

## Overview

This project automates the processing of GR (Goods Receipt) templates from a Drive folder, extracting data into consolidated sheets with automatic enrichment (PLA lookup, currency conversion, territory mapping).

**Features:**
- Batch conversion of Excel files to Google Sheets
- Intelligent header detection and column mapping (with aliases)
- Advanced row filtering (skips summaries, merged cells, hidden rows)
- PLA-based enrichment (Regional Area, Site Name, Territory)
- Automatic currency conversion (PHP/EUR → USD)
- Complete audit trail (Processed Files Log)
- One-minute automatic processing (time-based triggers)
- Idempotent processing (duplicate prevention)
- Performance monitoring (conversion/parse/append timing)
- Backfill & repair tools (source links, enrichment, USD recalculation)
- Comprehensive admin/debug tools

## Quick Start

### Installation (5 minutes)

1. **Open your main consolidation spreadsheet** in Google Sheets

2. **Paste the script:**
   - Click **Extensions** → **Apps Script**
   - Delete any existing code
   - Copy-paste the full content of `scripts/gs-script-v10.gs`
   - Click **Save**

3. **Enable Drive API:**
   - In Apps Script, click **Project Settings** (gear icon)
   - Find "Google Cloud Platform (GCP) Project" and click the project link
   - Go to **APIs & Services** → **Library**
   - Search and enable **Google Drive API**
   - Return to Apps Script

4. **Run the authorization:**
   - In Apps Script, click **Run** (play icon) at top
   - Grant permissions when prompted

5. **Test the menu:**
   - Refresh your spreadsheet
   - You should see **GR Automation** menu at the top
   - Installation complete!

6. **Run first consolidation:**
   - Click **GR Automation** → **Processing** → **Process All New Files Now**
   - Check **Processed Files Log** sheet for results in 1-2 minutes

## Documentation

This project includes comprehensive documentation at multiple levels:

### For End Users (Non-Technical)
**[USER_MANUAL_GR_CONSOLIDATION.md](./docs/USER_MANUAL_GR_CONSOLIDATION.md)** (80+ pages)

Complete step-by-step guide including:
- Installation & permissions setup
- Configuration explained
- First run walkthrough
- Menu walkthrough (every button, click-by-click)
- Working with the Processed Files Log
- Using backfill & repair tools
- Setting up automation
- Dashboard overview
- Troubleshooting common issues
- Maintenance & cleanup
- Technical overview of how it works
- Function reference & glossary

**Start here** if you're new to the system!

### For Developers (Technical)
**[ANNOTATED_CODE_GUIDE.md](./docs/ANNOTATED_CODE_GUIDE.md)** (50+ pages)

In-depth technical documentation including:
- Code organization & structure
- Configuration & constants
- Architecture diagrams
- Major code sections with pseudocode
- Complete data flow walkthrough (example)
- Caching & performance strategies
- Error handling patterns
- Testing & debugging approaches
- Future improvement suggestions
- Quick reference

**Start here** if you need to understand or modify the code!

### Function Reference (Spreadsheet)
**[SCRIPT_REFERENCE.csv](./docs/SCRIPT_REFERENCE.csv)**

Structured function reference with columns:
- Function name & category
- Purpose (1-line summary)
- Invoked by (menu/UI/other function)
- Input parameters & types
- Output/return values
- Side effects
- Common errors & fixes
- Related functions
- Implementation notes

**Import into a "Script Reference" sheet** in your bound spreadsheet for quick in-sheet lookup!

### Project Files

```
gs-automation-consolidator/
├── README.md                           ← You are here
├── scripts/
│   ├── gs-script-v10.gs               ← Main Apps Script (3000+ lines)
│   ├── gs-script-v9.gs                ← Previous version
│   └── gs-script-v1.gs ... v8.gs      ← Version history
├── docs/
│   ├── USER_MANUAL_GR_CONSOLIDATION.md    ← User guide (80+ pages)
│   ├── ANNOTATED_CODE_GUIDE.md            ← Developer guide (50+ pages)
│   ├── SCRIPT_REFERENCE.csv               ← Function reference
│   └── README.md                          ← This file
└── backups/
    ├── gs-script-v10-backup.gs
    └── gs-script-v10-backup-v2.gs
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│        INPUT: Excel Files in Drive Folder                   │
│        (e.g., "GR template with Matdoc Reference...")       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│      CONVERSION: Excel → Temporary Google Sheet             │
│      (uses Google Drive API)                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│      PARSING: Detect header, extract data rows              │
│      (filters summaries, merged cells, hidden rows)         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│      ENRICHMENT: PLA lookup, currency conversion            │
│      (Regional Area, Site Name, Territory, USD)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│      OUTPUT: Append rows to target sheets                   │
│      ("GR Posted 2025", "GR Posted 2026", etc.)            │
│      + Add source file hyperlinks                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│      LOGGING: Record in "Processed Files Log"               │
│      + Performance metrics                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│      CLEANUP: Delete temporary files                        │
│      (Move temp sheet to Drive Trash)                       │
└─────────────────────┬───────────────────────────────────────┘
```

CONTROL:
- Manual: Click "Process All New Files Now"
- Automatic: 1-minute time-based trigger
- Per-year: Click "Process Files for Year..."

## Configuration

All settings are in the `CONFIG` object at the top of `gs-script-v10.gs`:

### Key Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `sourceFolderName` | "GR template with..." | Drive folder containing Excel files |
| `tempFolderName` | "_GR_AUTOMATION_TEMP" | Temp folder for converted sheets |
| `trackerSheetName` | "Processed Files Log" | Audit log sheet name |
| `outputSheets` | `{2025: "GR Posted 2025", 2026: "GR Posted 2026"}` | Year → output sheet mapping |
| `usdConversionRate` | 57 | PHP/USD exchange rate |
| `maxFilesPerRunTotal` | 6 | Max files per run (across years) |
| `maxFilesPerRunPerYear` | 3 | Max files per year per run |
| `maxRuntimeMs` | 120000 | Max runtime per run (2 minutes) |
| `minHeaderMatches` | 3 | Min columns to consider header valid |
| `maxFailedAttemptsPerFile` | 5 | Fail-after count before skipping |
| `maxRowsPerSheetScan` | 2500 | Max rows to scan per sheet (performance limit) |
| `maxColsPerSheetScan` | 45 | Max columns to scan per sheet (performance limit) |
| `preferDirectTemplateTabFastPath` | true | Prioritize "GR TEMPLATE" tabs for speed |
| `useNumberFormatCurrencyHints` | false | Use number format hints for currency detection |
| `onlyIncludeVisibleRows` | true | Skip hidden/filtered rows during parsing |
| `triggerMinutes` | 1 | Interval (minutes) for automatic processing (1–60) |

### How to Change Settings

1. Open **Extensions** → **Apps Script**
2. Find the `CONFIG` object (lines 4–32)
3. Edit desired values
4. Click **Save**
5. Settings take effect on next run

**Example: Change USD conversion rate**
```javascript
usdConversionRate: 58  // was 57
```

## Output Sheets

The script creates and populates these sheets:

### 1. GR Posted 2025 / GR Posted 2026 (main output)
Contains consolidated GR data with columns:
- Standard columns: Acceptance Date, PO No., Material Description, Installed Qty, etc.
- Enrichment columns: Regional Area, Cleaned Site Name, Territory, Amount To Billed (USD)
- Source File: Hyperlink to original file

### 2. Processed Files Log (audit trail)
Tracks every file processed:
- Timestamp, File Name, Month, Year
- Rows Added, Status (Done / No data extracted / Error / Needs manual check)
- File Link (hyperlink to source)

### 3. PLA Lookup (enrichment data)
Contains location/territory mappings:
- PLA ID, Regional Area, Site Name, Territory
- Used to enrich output rows automatically

### 4. GR Automation Config (optional)
For multi-spreadsheet setup (routes output to different spreadsheets by year):
- **When to use:** If consolidation results should go to external spreadsheets instead of the main one
- **Columns:** Year | Output Sheet Name | Target Spreadsheet ID
- **Example:** 2025 | GR Posted 2025 | `1a2B3c4D5e6F...`
- **Note:** The "GR Automation Config" sheet is created in the main bound spreadsheet; it controls where output data is appended for each year

### 5. GR Automation Perf (diagnostics)
Performance metrics for each processed file:
- File Name, Year, Conversion Time, Open Time, Parse Time, Append Time, Total Time
- Rows Added, Status
- Useful for identifying slow files and bottlenecks

## Menu Actions

### Processing
- **Process All New Files Now** — Run consolidation immediately
- **Process Files for Year...** — Process only a specific year
- **Retry Failed Files** — Reprocess files that previously failed

### GR Posted Sheets
- **Backfill Lookup & Territory** — Fill missing enrichment columns
- **Recompute USD for All Rows** — Recalculate USD if rate changed
- **Fix Source File Hyperlinks** — Convert links to clickable formulas

### Tracker & Logs
- **Fix Tracker File Links** — Make tracker links clickable
- **Backfill Missing Months** — Fill blank Month column
- **Backfill Source Links (Preview)** — Preview row-to-file matching
- **Backfill Source Links (Now)** — Apply source link matching

### Automation
- **Start Auto Trigger (1 min)** — Enable 1-minute automatic processing
- **Stop Auto Trigger** — Disable automatic processing
- **Show Auto Processing Status** — View last run details

### Admin
- **Cleanup Duplicates (Preview)** — Show duplicate detection results (read-only; safe to run)
- **Cleanup Duplicates (Now)** — Permanently delete detected duplicates (with backup recommendation)
- **Check Lookup & Output Setup** — Verify all sheets/columns exist
- **Clean Temp Files** — Delete temporary converted sheets
- **Test One Source File (Debug)** — Debug a specific file

## Processing Details

### How It Works (High Level)

1. **Scan:** Look for new Excel files in source Drive folder
2. **Convert:** Use Drive API to convert Excel → temporary Google Sheet
3. **Parse:** Open temp sheet, detect header row, extract data rows
4. **Filter:** Remove summaries, merged cells, hidden rows
5. **Enrich:** Look up PLA data, convert currency to USD
6. **Append:** Add rows to output sheet with source hyperlink
7. **Log:** Record in Processed Files Log and performance sheet
8. **Cleanup:** Delete temporary sheet from Drive

### Processing Limits

- **Max 6 files per run** (total across all years)
- **Max 3 files per year per run** (balanced processing)
- **Max 2 minutes per run** (prevents 6-minute timeout)
- **Skips files >10 MB** (prevents Drive API timeout)
- **Skips files >5 failed attempts** (prevents wasting time on broken files)

### Idempotency

The system prevents duplicate processing using 6 different matching keys:
1. Raw filename
2. Normalized filename
3. Drive file ID
4. Drive file ID (alternate format)
5. Normalized file URL
6. File URL (query params removed)

If **any** key matches a previous entry, the file is skipped (no duplicate rows).

## Performance

Typical processing time per file:

| Step | Time |
|------|------|
| Convert Excel → Sheets | 30–60 sec |
| Open sheet (with retries) | 5 sec |
| Parse & detect headers | 3 sec |
| Extract rows (filter) | 8 sec |
| Enrich (PLA lookup) | 4 sec |
| Append to output | 10 sec |
| Log to tracker & perf | 2 sec |
| Cleanup (delete temp) | 2 sec |
| **TOTAL per file** | **64–89 sec** |

**Throughput:** ~3–6 files per 2-minute run = ~1.5–3 files/min

With 1-minute automatic triggers: ~90–180 files per hour

## Troubleshooting

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Menu doesn't appear | Script not saved | Run `onOpen()` in Apps Script |
| "File too large" | >10 MB file | Split file and retry |
| "No data extracted" | Headers don't match | Check file format; use debug tool |
| Permission denied | Drive API not enabled | Enable Google Drive API in project settings |
| Blank enrichment columns | PLA Lookup sheet empty | Populate PLA Lookup with location data |
| USD amounts wrong | Conversion rate outdated | Update `CONFIG.usdConversionRate` and re-run |
| Duplicate rows | File processed twice | Check tracker for duplicates; use backfill tools |

**For detailed troubleshooting, see [USER_MANUAL_GR_CONSOLIDATION.md](./docs/USER_MANUAL_GR_CONSOLIDATION.md#troubleshooting-common-issues)**

## Testing

### Manual Test (5 minutes)

1. Create a sample Excel file with GR template headers:
   - PO No., Material Description, Installed Qty, Acceptance Date, Currency, Amount, etc.
   - Add 5–10 sample data rows
   - Include year in filename (e.g., "Test_GR_2025.xlsx")

2. Upload to source Drive folder

3. Run "Process All New Files Now"

4. Check results:
   - Row appears in "GR Posted 2025" sheet
   - Entry appears in "Processed Files Log" with "Done" status
   - Hyperlink in "Source File" column points to original file

### Automated Testing

```javascript
// Add this function to test script on deployed version
function runTests() {
  // Test 1: Header detection
  var testHeader = ["PO No.", "Material Desc", "Qty"];
  var map = createColumnMapping_(testHeader);
  assert(map["PO No."] === 0, "Test 1 Failed");
  
  // Test 2: Currency conversion
  var usd = toUsdIfPhp_(5700, "PHP");
  assert(usd === 100, "Test 2 Failed");
  
  // Test 3: Summary row detection
  var summaryRow = ["TOTAL", "100", "1000"];
  assert(isSummaryOrFooterRow_(summaryRow), "Test 3 Failed");
  
  Logger.log("✓ All tests passed");
}
```

## Dashboard & Reporting

If using Google Data Studio (optional):
- **Input:** "Processed Files Log" and "GR Automation Perf" sheets
- **Metrics:** Total files processed, success rate, records per month, performance trends
- **Link:** (Dashboard URL from user)

For quick stats, check "Processed Files Log" sheet:
- Filter by Status = "Done" to see successful files
- Sort by Timestamp to see recent activity
- Group by Year to compare volumes

## Permissions & Security

This script requires these permissions:
- **Spreadsheet access:** Read/write to bound spreadsheet and configured target spreadsheets
- **Drive access:** Read/convert/delete files in source and temp folders
- **Script execution:** Run Apps Script functions and time-based triggers

**Data safety:**
- Temp files are automatically deleted (moved to Trash, recoverable for 30 days)
- Script only accesses files you explicitly point it to
- No data is shared with external services
- Audit trail (tracker) records all processing

## Support

### Getting Help

1. **Check the User Manual:** [USER_MANUAL_GR_CONSOLIDATION.md](./docs/USER_MANUAL_GR_CONSOLIDATION.md)
   - 80+ pages of step-by-step instructions
   - Troubleshooting section with common issues and fixes

2. **Run Diagnostics:**
   - Click **GR Automation** → **Admin** → **Check Lookup & Output Setup**
   - Suggests specific fixes needed

3. **Test Single File:**
   - Click **GR Automation** → **Admin** → **Test One Source File (Debug)**
   - Shows detailed logs for why file failed

4. **Check Logs:**
   - Open **Extensions** → **Apps Script** → **Executions** tab
   - See errors from recent runs

5. **Review Documentation:**
   - **User Manual:** For how-to and troubleshooting
   - **Code Guide:** For technical deep-dives
   - **Script Reference:** For function details

### Reporting Issues

When reporting a problem, include:
- Exact error message (from Executions log)
- File name and size (from Processed Files Log)
- Screenshot of the issue
- Steps to reproduce
- Expected vs. actual result

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Apr 17, 2026 | Initial production release |
| 0.9 | Apr 10, 2026 | Beta testing with select users |
| 0.8 | Apr 1, 2026 | Added backfill/repair tools |
| ... | ... | (See scripts/ folder for full history) |

## Resources

- **[User Manual](./docs/USER_MANUAL_GR_CONSOLIDATION.md)** — Guide
- **[Code Guide](./docs/ANNOTATED_CODE_GUIDE.md)** — Devs
- **[Script Reference](./docs/SCRIPT_REFERENCE.csv)** — Per-function documentation
- **[Google Apps Script Documentation](https://developers.google.com/apps-script)**
- **[Google Sheets API Reference](https://developers.google.com/sheets/api)**

## License

All rights reserved.

---

**For detailed documentation, start with the [USER_MANUAL_GR_CONSOLIDATION.md](./docs/USER_MANUAL_GR_CONSOLIDATION.md)**

---
