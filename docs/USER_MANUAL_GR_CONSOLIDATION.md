# GR Template Automation Consolidator
## Complete User Manual & Guide
**Version:** 1.0 | **Last Updated:** April 17, 2026

---

## Table of Contents

1. [Quick Start (5 minutes)](#quick-start)
2. [Installation & Permissions](#installation--permissions)
3. [Configuration Explained](#configuration-explained)
4. [Your First Run Walkthrough](#your-first-run-walkthrough)
5. [Understanding the GR Automation Menu](#understanding-the-gr-automation-menu)
6. [Processing Files - Step by Step](#processing-files--step-by-step)
7. [Working with the Processed Files Log](#working-with-the-processed-files-log)
8. [Using Backfill & Repair Tools](#using-backfill--repair-tools)
9. [Setting Up Automation & Auto-Processing](#setting-up-automation--auto-processing)
10. [Understanding the Dashboard Overview](#understanding-the-dashboard-overview)
11. [Troubleshooting Common Issues](#troubleshooting-common-issues)
12. [Maintenance & Cleanup](#maintenance--cleanup)
13. [How the Script Works (Technical Overview)](#how-the-script-works-technical-overview)
14. [Appendix: Script Reference & Functions](#appendix-script-reference--functions)
15. [Appendix: Glossary & Reference](#appendix-glossary--reference)

---

## Quick Start

Get the system running in 5 minutes!

### Prerequisites
- Access to the main consolidation spreadsheet
- Excel files containing GR (Goods Receipt) template data in your Drive
- A Google Drive folder ready (you'll point the script to it)

### Steps

1. **Open your main spreadsheet** in Google Sheets (the one where output data should appear)

2. **Paste the script into Apps Script**
   - Click **Extensions** → **Apps Script**
   - Delete any existing code
   - Paste the complete `gs-script-v10.gs` file (from [scripts/gs-script-v10.gs](../scripts/gs-script-v10.gs))
   - Click **Save** (name it "GR Consolidation")

3. **Enable the Drive API** (needed for file conversion)
   - In Apps Script, click the **gear icon** (Project settings)
   - Scroll down to "Google Cloud Platform (GCP) Project"
   - Click the project name link to open Google Cloud Console
   - Go to **APIs & Services** → **Library**
   - Search for "Google Drive API"
   - Click **Enable**
   - Close and return to Apps Script

4. **Authorize the script**
   - Back in Apps Script, run the `onOpen()` function (click **Run**)
   - Grant permissions when prompted (click **Review Permissions** → select your account → **Allow**)

5. **Check your spreadsheet**
   - Refresh your Google Sheet
   - You should now see **GR Automation** menu at the top
   - If you see it, the script installed successfully!

6. **Run your first consolidation**
   - Click **GR Automation** → **Processing** → **Process All New Files Now**
   - The script will begin converting and processing Excel files from your Drive folder
   - Check back in 1–2 minutes

7. **Inspect the results**
   - Click the **Processed Files Log** tab
   - You should see rows with "Done" status showing files that were processed
   - Look at the **GR Posted 2025** or **GR Posted 2026** sheet to see consolidated rows

**That's it!** You now have the system running. Continue reading for detailed walkthroughs and advanced features.

---

## Installation & Permissions

### Detailed Installation Steps

#### Step 1: Access Your Spreadsheet

[IMAGE PLACEHOLDER: Screenshot of Google Sheets main screen]

1. Open the main consolidation spreadsheet in Google Sheets
2. Note the URL — you'll need it to link to output sheets if using multiple target spreadsheets

#### Step 2: Open Apps Script Editor

[IMAGE PLACEHOLDER: Screenshot of Extensions menu → Apps Script]

1. From your spreadsheet, click **Extensions** → **Apps Script**
2. A new tab will open showing the Apps Script editor
3. If there's any existing code, delete it first

#### Step 3: Paste the Complete Script

[IMAGE PLACEHOLDER: Screenshot of Apps Script editor with blank script and paste area]

1. Open the `gs-script-v10.gs` file from the project repository
2. Copy the entire content
3. Paste it into the Apps Script editor
4. Click **Save** at the top (or press Ctrl+S / Cmd+S)
5. A dialog will ask you to name the project — name it **"GR Consolidation"** or similar

#### Step 4: Enable Advanced Google Services (Drive API)

[IMAGE PLACEHOLDER: Screenshot of Project Settings gear icon]

1. In Apps Script, click the **gear icon** in the left sidebar (Project Settings)

[IMAGE PLACEHOLDER: Screenshot of Project Settings page with GCP Project link]

2. Under **Google Cloud Platform (GCP) Project**, you'll see a project name
3. Click on the project name (blue link) to open Google Cloud Console
4. In the new tab, go to **APIs & Services** → **Library**

[IMAGE PLACEHOLDER: Screenshot of Google Cloud Console APIs & Services Library]

5. Search for **"Google Drive API"**
6. Click the result
7. Click **Enable** button
8. Wait a moment for it to enable
9. Return to the Apps Script tab

#### Step 5: Authorize the Script

[IMAGE PLACEHOLDER: Screenshot of Apps Script editor with Run button visible]

1. Back in Apps Script, at the top, find the **Run** button (play icon)
2. Click **Run** to execute the `onOpen()` function
3. A popup will appear asking for permissions

[IMAGE PLACEHOLDER: Screenshot of "Review Permissions" dialog]

4. Click **Review Permissions**
5. Choose your Google account
6. You'll see a warning saying the app is not verified — click **Go to GR Consolidation (unsafe)** (this is normal for custom scripts)

[IMAGE PLACEHOLDER: Screenshot of "Google hasn't verified this app" screen]

7. Click **Allow** at the bottom of the next screen
8. The script will run and create the menu in your spreadsheet

#### Step 6: Verify Installation

[IMAGE PLACEHOLDER: Screenshot of spreadsheet with GR Automation menu visible]

1. Go back to your spreadsheet (refresh if needed)
2. At the top of the sheet, look for the **GR Automation** menu
3. Click it to see the submenu options
   - **Processing**
   - **GR Posted Sheets**
   - **Tracker & Logs**
   - **Automation**
   - **Admin**

✅ **If you see this menu, installation is complete!**

---

### Permissions Explained

The script needs permission to:
- **Read & write to your spreadsheet** — to create sheets, add rows, update tracker
- **Access Google Drive** — to find and convert Excel files to Google Sheets
- **Create time-based triggers** — to set up automatic processing runs (optional)
- **Access script properties** — to store run state and configuration

These permissions are standard for automation scripts. They are only available to you, and the script only accesses files you explicitly point it to.

---

## Configuration Explained

### Where to Configure

The script settings are at the very top of the code. To edit them:

1. Open **Extensions** → **Apps Script**
2. At the top, find the `CONFIG` object (lines 4–32)

[IMAGE PLACEHOLDER: Screenshot of CONFIG object in Apps Script]

### Key Settings You Might Want to Change

#### Source Folder Name
```
sourceFolderName: "GR template with Matdoc Reference: (File responses)"
```
**What it does:** The script looks for Excel files in a Drive folder with this exact name.

**If you need to change it:**
- Find your Drive folder containing Excel files
- Copy its exact name (including special characters)
- Replace the text in quotes above

**Example:**
```
sourceFolderName: "My GR Files 2026"
```

#### Temp Folder Name
```
tempFolderName: "_GR_AUTOMATION_TEMP"
```
**What it does:** When the script converts Excel to Google Sheets, it stores them temporarily in this folder, then deletes them when done.

**Safe to leave as-is:** Yes. The script cleans up automatically.

#### Output Sheet Names (by Year)
```
outputSheets: { 2025: "GR Posted 2025", 2026: "GR Posted 2026" }
```
**What it does:** Files detected as containing 2025 data go to the "GR Posted 2025" sheet, and 2026 files go to "GR Posted 2026".

**If you need to add a new year (e.g., 2027):**
```
outputSheets: { 2025: "GR Posted 2025", 2026: "GR Posted 2026", 2027: "GR Posted 2027" }
```
(Then create a sheet named "GR Posted 2027" in your spreadsheet)

#### USD Conversion Rate
```
usdConversionRate: 57
```
**What it does:** If a row has PHP or EUR currency, the script divides the amount by this number to estimate USD.

**Example:** If a row has 57 PHP, it becomes 1 USD. If you have 114 PHP, it becomes 2 USD.

**If rates change:** Update this number. Current rate is approximately PHP 57–58 per USD.

#### Max Files Per Run
```
maxFilesPerRunTotal: 6,
maxFilesPerRunPerYear: 3,
```
**What it does:**
- `maxFilesPerRunTotal`: Max number of files processed in one run (across all years)
- `maxFilesPerRunPerYear`: Max files from a single year in one run

**Why limits?** Prevents timeouts and keeps Google Drive API requests manageable.

**If you have few files:** Safe to increase (e.g., to 10 and 5).

**If you have many files:** These limits ensure the script completes in time. Use automatic triggers to process files regularly.

#### Max Runtime
```
maxRuntimeMs: 120000
```
**What it does:** Stops processing after 120 seconds (2 minutes) to avoid Google Apps Script timeout (6 minutes).

**Safe to leave as-is:** Yes. Automatic processing in 1-minute intervals handles the queue.

#### Minimum Header Matches
```
minHeaderMatches: 3
```
**What it does:** The script only processes Excel sheets if it finds at least 3 matching header columns from the expected list.

**If headers are very different:** Increase to 4 or 5 after testing.

#### Max Failed Attempts Before Skipping
```
maxFailedAttemptsPerFile: 5
```
**What it does:** If a file fails to extract data 5 times in a row, the script stops retrying it (to prevent getting stuck).

**Safe to leave as-is:** Yes. You can manually requeue files using "Processing" → "Retry Failed Files".

---

## Your First Run Walkthrough

Let's walk through processing one file, step-by-step.

### Preparation

1. **Prepare an Excel file**
   - It should contain GR (Goods Receipt) data with headers like "PO No.", "Material Description", "Installed Qty", etc.
   - Name the file to include the year, e.g., "GR_REQUEST_2025_April.xlsx" or "GR_Template_2026.xlsx"
   - The script uses the year in the filename to decide which output sheet to populate

2. **Upload to your source Drive folder**
   - Open your Drive folder (named in `CONFIG.sourceFolderName`, default: "GR template with Matdoc Reference: (File responses)")
   - Upload the Excel file here

[IMAGE PLACEHOLDER: Screenshot of Drive folder with sample Excel files]

### Run the Consolidation

1. **Open your spreadsheet** and go to the main sheet (not a specific data sheet)

2. **Click the GR Automation menu**

[IMAGE PLACEHOLDER: Screenshot of GR Automation menu dropdown]

3. **Hover over "Processing"** to see submenu options

[IMAGE PLACEHOLDER: Screenshot of Processing submenu]

4. **Click "Process All New Files Now"**
   - A small notification may appear saying "Processing started..."
   - The script will now:
     - Find new Excel files in your Drive folder
     - Convert them to temporary Google Sheets
     - Extract matching rows
     - Append them to the output sheet (e.g., "GR Posted 2025")
     - Log the results in "Processed Files Log"

5. **Wait 1–2 minutes** for processing to complete

### Check the Results

#### In the Processed Files Log Sheet

[IMAGE PLACEHOLDER: Screenshot of Processed Files Log with sample data rows]

1. Click the **Processed Files Log** tab at the bottom
2. You should see a new row with:
   - **Timestamp:** When the file was processed
   - **File Name:** Your Excel filename
   - **Month:** Auto-detected month (if available in filename or file date)
   - **Year:** Detected year
   - **Rows Added:** How many rows were extracted (e.g., 10, 25, etc.)
   - **Status:** 
     - "Done" = successful
     - "No data extracted" = sheet had no matching data rows (check format)
     - "Needs manual check" = file format issue (might be too large or corrupted)
   - **File Link:** A clickable hyperlink to your original Excel file

#### In the Output Sheet

[IMAGE PLACEHOLDER: Screenshot of GR Posted 2025 sheet with data rows and enrichment columns]

1. Click the **GR Posted 2025** or **GR Posted 2026** sheet tab
2. You should see:
   - **Header row** with all column names (PO No., Material Description, etc., plus enrichment columns)
   - **Data rows** with the extracted GR information
   - **Source File column** with hyperlinks to the original Excel files
   - **Enrichment columns** on the right showing Region, Site Name, Territory (if your PLA Lookup has that data)

**If you see data, congratulations! The system is working.**

---

## Understanding the GR Automation Menu

The **GR Automation** menu is your control center. Here's what each section does.

[IMAGE PLACEHOLDER: Screenshot of complete GR Automation menu expanded]

### Processing

This menu is for running the consolidation process.

#### Process All New Files Now
- **What it does:** Scans your source Drive folder, finds all new/unprocessed Excel files, and extracts GR data from them in one run.
- **How long:** 1–3 minutes depending on file count and size.
- **When to use:** After uploading new Excel files; to manually trigger processing instead of waiting for automatic runs.
- **Expected result:** 
  - New rows appear in the Processed Files Log with "Done" status
  - Data appears in the appropriate GR Posted sheet (2025/2026/etc.)

**Steps:**
1. Click **GR Automation** → **Processing** → **Process All New Files Now**
2. A popup will briefly show "Processing started..."
3. Wait 1–3 minutes
4. Refresh the sheet
5. Check the Processed Files Log for results

#### Process Files for Year...
- **What it does:** Lets you pick a specific year (2025, 2026, etc.) and process only files from that year.
- **When to use:** If you want to process only 2025 files or only 2026 files in a single run.
- **How to use:**
  1. Click **GR Automation** → **Processing** → **Process Files for Year...**
  2. A modal/popup will appear with a list of years

[IMAGE PLACEHOLDER: Screenshot of year picker modal]

  3. Click the year you want (e.g., "2026")
  4. Processing starts for only that year
  5. Check results in Processed Files Log

#### Retry Failed Files
- **What it does:** Re-attempts files that previously failed or had "no data extracted" status.
- **When to use:** 
  - You fixed a file format issue and want to retry it
  - A file failed once but you think it might work now
- **How to use:**
  1. Click **GR Automation** → **Processing** → **Retry Failed Files**
  2. The script resets the failed-attempt counter for those files and processes them again
  3. Check the Processed Files Log for results

---

### GR Posted Sheets

This menu contains tools for fixing or enriching data in your output sheets.

#### Backfill Lookup & Territory (existing rows)
- **What it does:** For rows that are already in the output sheet but missing enrichment data (Regional Area, Site Name, Territory), this looks them up from the PLA Lookup sheet and fills them in.
- **When to use:** 
  - You added new rows to "GR Posted 2025" or "GR Posted 2026" manually
  - You updated the PLA Lookup sheet and want existing rows to use the new lookup data
- **How to use:**
  1. Click **GR Automation** → **GR Posted Sheets** → **Backfill Lookup & Territory (existing rows)**
  2. The script scans all rows in output sheets and fills missing enrichment columns
  3. Check the modified sheets to confirm lookups are now populated

#### Recompute USD for All Rows
- **What it does:** If you changed the `usdConversionRate` in the CONFIG, this recalculates the USD amounts for all existing rows.
- **When to use:**
  - Exchange rates changed and you updated `CONFIG.usdConversionRate`
  - You want to recompute USD column across all historical data
- **How to use:**
  1. Edit `CONFIG.usdConversionRate` in Apps Script (e.g., from 57 to 58)
  2. Save the Apps Script
  3. Go to your spreadsheet
  4. Click **GR Automation** → **GR Posted Sheets** → **Recompute USD for All Rows**
  5. Wait a few seconds; the script updates all USD amounts

#### Fix Source File Hyperlinks
- **What it does:** Converts plain text file links in the "Source File" column to clickable hyperlinks (HYPERLINK formulas).
- **When to use:**
  - You manually added rows and forgot to add hyperlinks
  - You imported data from another source and lost the hyperlinks
- **How to use:**
  1. Click **GR Automation** → **GR Posted Sheets** → **Fix Source File Hyperlinks**
  2. The script updates the Source File column, making all links clickable
  3. Test by clicking a link to verify it opens the file

---

### Tracker & Logs

This menu has tools for managing your processing logs and fixing issues.

#### Fix Tracker File Links
- **What it does:** Makes sure all file links in the Processed Files Log are clickable hyperlinks.
- **When to use:**
  - Links in the tracker appear as plain text instead of clickable links
  - You want to standardize tracker formatting
- **How to use:**
  1. Click **GR Automation** → **Tracker & Logs** → **Fix Tracker File Links**
  2. The script updates all links to be clickable
  3. Verify by clicking a link in the Processed Files Log

#### Backfill Missing Months
- **What it does:** If the "Month" column in Processed Files Log has blanks, this tries to extract month from filename or file date.
- **When to use:**
  - You see many blank "Month" cells in the tracker
  - You want to clean up the tracker for reporting
- **How to use:**
  1. Click **GR Automation** → **Tracker & Logs** → **Backfill Missing Months**
  2. Wait a moment; the script fills in month values
  3. Review the Processed Files Log to see results

#### Backfill Source Links (Preview)
- **What it does:** Shows a preview of which output sheet rows can be matched back to their original source files in Drive. **Does NOT make changes** — just previews what would happen.
- **When to use:**
  - You want to see which rows might be missing source file links
  - You want to verify the matching logic before applying changes
- **How to use:**
  1. Click **GR Automation** → **Tracker & Logs** → **Backfill Source Links (Preview)**
  2. A brief notification shows how many rows have potential matches
  3. Check the sheet to see what would be updated
  4. If happy, use "Backfill Source Links (Now)" to apply

#### Backfill Source Links (Now)
- **What it does:** Matches output sheet rows (by PO number or filename tokens) back to their original Excel files and fills the "Source File" column with hyperlinks.
- **When to use:**
  - You ran the Preview and it looked good
  - Many rows have blank source file links
  - You want to establish a complete audit trail
- **How to use:**
  1. (Optionally run "Backfill Source Links (Preview)" first to verify)
  2. Click **GR Automation** → **Tracker & Logs** → **Backfill Source Links (Now)**
  3. Wait a moment (this can take a while for large sheets)
  4. Review the Source File column to confirm links are populated
  5. Test by clicking a link to ensure it opens the correct file

---

### Automation

This menu sets up automatic processing on a schedule.

#### Start Auto Trigger (1 min)
- **What it does:** Creates a time-based trigger that runs "Process All New Files Now" every 1 minute automatically.
- **When to use:**
  - You want the system to continuously process new files as they arrive
  - You don't want to manually click "Process All New Files Now" each time
- **How to use:**
  1. Click **GR Automation** → **Automation** → **Start Auto Trigger (1 min)**
  2. A notification will say "Trigger created. Auto-processing will start in ~1 minute."
  3. The system is now automatic! New files will be processed every 1 minute.

[IMAGE PLACEHOLDER: Screenshot of Apps Script Triggers page showing time-based trigger]

**Behind the scenes:** The script creates a time-driven trigger in Apps Script that calls the main processing function every 1 minute. You can view this trigger:
1. Open **Extensions** → **Apps Script**
2. Click the **Triggers** icon (clock) on the left sidebar
3. You should see an entry like "consolidateGRTemplateData" with "Time-based" type and "Every minute" frequency

#### Stop Auto Trigger
- **What it does:** Removes the automatic 1-minute trigger so processing only happens when you manually click "Process All New Files Now".
- **When to use:**
  - You want to disable automatic processing
  - You need to pause processing for maintenance
  - You want to manually control when files are processed
- **How to use:**
  1. Click **GR Automation** → **Automation** → **Stop Auto Trigger**
  2. A notification will say "Trigger removed."
  3. Automatic processing is now stopped.

**To re-enable:** Click "Start Auto Trigger (1 min)" again.

#### Show Auto Processing Status
- **What it does:** Displays detailed information about the last automatic run, including:
  - When the last run started and finished
  - Current processing stage
  - How many files were processed
  - Any errors or status messages
- **When to use:**
  - You want to check if automatic processing is running
  - You want to see what the script is currently doing
  - You're troubleshooting an issue
- **How to use:**
  1. Click **GR Automation** → **Automation** → **Show Auto Processing Status**
  2. A modal/panel will appear showing detailed status

[IMAGE PLACEHOLDER: Screenshot of auto processing status modal showing run details]

The status includes:
  - **Last run started at:** Timestamp
  - **Last run finished at:** Timestamp
  - **Current status:** "Idle", "Processing", or error message
  - **Rows added in last run:** Count
  - **Files processed in last run:** Count
  - **Next run in:** How many seconds until next automatic run

---

### Admin

This menu has advanced tools for troubleshooting and maintenance.

#### Check Lookup & Output Setup
- **What it does:** Verifies that all required sheets (PLA Lookup, output sheets, tracker) exist and have correct headers. Useful for diagnosing setup issues.
- **When to use:**
  - The script is not finding sheets or creating new ones
  - You want to verify the spreadsheet is correctly configured
  - A user says "the script is not working"
- **How to use:**
  1. Click **GR Automation** → **Admin** → **Check Lookup & Output Setup**
  2. The script runs diagnostics and either:
     - Shows "Setup verified! All sheets and columns are correct."
     - Shows specific issues, e.g., "PLA Lookup sheet missing", "Output sheet GR Posted 2025 not found", etc.
  3. If issues are shown, fix them (create missing sheet, add correct columns) and run again

#### Clean Temp Files
- **What it does:** Deletes temporary Google Sheets files (created during Excel-to-Sheets conversion) from your Drive's temp folder (_GR_AUTOMATION_TEMP).
- **When to use:**
  - The temp folder has accumulated converted files and you want to clean up Drive space
  - Files are cluttering your Drive and you want to remove temporary artifacts
  - Every month as routine maintenance
- **How to use:**
  1. Click **GR Automation** → **Admin** → **Clean Temp Files**
  2. The script moves all temp files to Drive trash
  3. A notification will say "X temp files cleaned up." (or "No temp files found.")
  4. The files are now in your Drive Trash (you can recover them for 30 days if needed)

#### Test One Source File (Debug)
- **What it does:** Lets you pick a single Excel file and run the full processing pipeline on just that file, showing detailed debug output. Useful for troubleshooting why a particular file isn't working.
- **When to use:**
  - A specific file shows "No data extracted" status
  - You want to see detailed logs about what the script is doing with a file
  - You're debugging why headers aren't being detected
- **How to use:**
  1. Click **GR Automation** → **Admin** → **Test One Source File (Debug)**
  2. A modal will appear asking you to select a file

[IMAGE PLACEHOLDER: Screenshot of file picker modal]

  3. Navigate to your source folder and click the Excel file you want to test
  4. Click "Select"
  5. The script will process that one file and show you:
     - Whether the conversion succeeded
     - Headers detected vs. headers expected
     - Number of data rows found
     - Any errors during extraction
  6. This output helps you understand why the file might be failing

---

## Processing Files – Step by Step

This section provides a complete walkthrough of what happens when you click "Process All New Files Now" or run an automatic trigger.

### The Processing Workflow

When you start a processing run, the script follows this workflow:

```
[1] Lock check
   └─→ [2] Scan source folder for new Excel files
       └─→ [3] Group files by year
           └─→ [4] Apply processing limits (max 6 files total, 3 per year)
               └─→ [5] For each selected file:
                   ├─→ Convert Excel to temp Google Sheet
                   ├─→ Open and parse the temp sheet
                   ├─→ Detect header row and match columns
                   ├─→ Extract data rows (with filtering for summaries, merged cells, etc.)
                   ├─→ Look up enrichment data (Region, Site Name, Territory, USD)
                   ├─→ Append rows to the correct output sheet
                   ├─→ Delete temp file
                   └─→ Log results in Processed Files Log
               └─→ [6] Update script properties (run state, counts)
                   └─→ [7] Done! (or continue next automatic run)
```

### Step-by-Step Details

#### 1. Lock Check
- **Purpose:** Prevents two runs from happening at the same time
- **What happens:** If a run is already happening, new attempt waits or exits gracefully
- **You see:** Nothing (this is internal); script prevents overlaps automatically

#### 2. Scan Source Folder
- **Purpose:** Find all Excel files that haven't been processed yet
- **What happens:** Script looks in the Drive folder named `sourceFolderName` (default: "GR template with Matdoc Reference: (File responses)")
- **What it checks:**
  - File type (only .xlsx, .xls, .xlsm)
  - File size (skips files > 10 MB)
  - Whether the file was already processed (checks the Processed Files Log)
  - Whether the file has too many failed attempts (skips if >= 5 failures)

#### 3. Group by Year
- **Purpose:** Organize files by detected year for balanced processing
- **What happens:** Script extracts the year from the filename or file's last-modified date
- **Example:** "GR_REQUEST_2025_April.xlsx" → detected as 2025; "FINAL GR TEMPLATE 2026.xlsx" → detected as 2026
- **If year is ambiguous:** Script uses file's last-modified date as fallback

#### 4. Apply Processing Limits
- **Purpose:** Prevent timeouts and excessive API calls
- **Limits applied:**
  - Max 6 files per run (total)
  - Max 3 files per year per run
  - Max 2 minutes total runtime
- **What happens:** If there are 10 files waiting, only the first 6 (max 3 from each year) are processed in this run; remaining files are processed in the next run
- **Example workflow over multiple runs:**
  - Run 1: processes 3 files from 2025 + 3 files from 2026 (6 total)
  - Run 2 (1 min later): processes 3 files from 2025 + 2 files from 2026 (5 remaining)
  - Run 3 (1 min later): processes last 2 files

#### 5. Process Each File
For each selected file, the script does the following:

##### 5a. Convert Excel to Google Sheet
- **What it does:** Uses Google Drive API to convert the Excel file to a temporary Google Sheet
- **Where it goes:** A temp folder named "_GR_AUTOMATION_TEMP" on your Drive
- **Temp file naming:** Starts with "_TEMP_" (e.g., "_TEMP_GR_REQUEST_2025_April")
- **Why temp?** Google Sheets is easier to parse programmatically than Excel. Script deletes this temp file after extraction.
- **If it fails:** Script notes "Needs manual check - file too large" if > 10 MB, or other error messages

##### 5b. Open and Parse Temp Sheet
- **What it does:** Opens the converted Google Sheet and examines its contents
- **Looks for:**
  - How many sheets/tabs does this spreadsheet have?
  - Which sheet is most likely to contain GR data? (tries "GR TEMPLATE" tabs first)
- **If multiple sheets:** Script scores each sheet and picks the best candidate

##### 5c. Detect Header Row
- **Purpose:** Find which row contains column headers
- **What it does:** Scans the first ~80 rows looking for a row that matches the expected column list
- **Expected columns:** PO No., Material Description, Installed Qty, etc. (full list in COLUMN_MAPPING)
- **Fuzzy matching:** Uses aliases (e.g., "PO Number" = "PO No.", "Qty" = "Installed Qty")
- **Threshold:** Must match at least 3 expected columns to be considered a valid header
- **If found:** Remembers the row number and column positions
- **If not found:** Status becomes "No data extracted" (or "Needs manual check" if format is very unusual)

##### 5d. Extract Data Rows
- **What it does:** Scans rows below the header and extracts valid GR data
- **Filters applied:**
  - Skips summary rows (rows with keywords like "TOTAL", "SUBTOTAL", "Grand Total", "SUMMARY", etc.)
  - Skips footer rows (repeated headers)
  - Skips merged-cell artifacts (rows with unusual formatting indicating merged cells)
  - Skips hidden/filtered rows (if `CONFIG.onlyIncludeVisibleRows` is true)
  - Skips empty rows
  - Keeps only rows with data in key columns (PO No., Material Description, etc.)
- **Limit:** Scans max 2,500 rows per sheet to avoid slowdowns
- **Result:** List of valid data rows with all columns extracted

##### 5e. Look Up Enrichment Data
- **Purpose:** Add extra columns (Region, Site Name, Territory, USD amount)
- **What it does:** For each row, looks up the PLA ID in the "PLA Lookup" sheet
- **Uses:** Looks for matching Region/Territory/Site Name in the lookup
- **Currency conversion:** If the row currency is PHP or EUR, converts to USD using `CONFIG.usdConversionRate`
- **Special handling:** OPEX / Managed Services rows get special treatment (blank territory, etc.)
- **If lookup fails:** Enrichment columns are left blank (data is still valid)

##### 5f. Append Rows to Output Sheet
- **What it does:** Adds the extracted rows to the correct output sheet (GR Posted 2025, GR Posted 2026, etc.)
- **Sheet selection:** Uses the detected year to find the right sheet (e.g., 2025 → "GR Posted 2025")
- **Creates sheet if needed:** If "GR Posted 2026" doesn't exist, script creates it with headers
- **Adds source link:** Each row gets a HYPERLINK formula pointing back to the original Excel file
- **Formatting:** Applies formatting (dates, currency, percentages) as appropriate
- **Result:** Output sheet now contains the new rows

##### 5g. Delete Temp File
- **What it does:** Removes the temporary Google Sheet from Drive (moves to Trash)
- **Why:** Keeps Drive clean; temp files are only needed during processing
- **If deletion fails:** Script logs a warning but continues (file can be manually deleted later)

##### 5h. Log Results
- **What it does:** Adds a row to the Processed Files Log showing results
- **Logged info:**
  - Timestamp (when processing happened)
  - File name
  - Detected month
  - Detected year
  - Number of rows added
  - Status ("Done", "No data extracted", "Error: ...", etc.)
  - Hyperlink to the original Excel file
- **Idempotency check:** Before logging, script checks if this file was already processed (using multiple matching strategies) to avoid duplicate logging
- **If duplicate detected:** Skips logging to avoid clutter

#### 6. Update Script Properties
- **Purpose:** Store state so you can check what happened and resume if needed
- **Properties updated:**
  - `LAST_RUN_STARTED_AT`: Timestamp
  - `LAST_RUN_FINISHED_AT`: Timestamp
  - `LAST_RUN_STATUS`: "Completed successfully" or error message
  - `LAST_RUN_FILES_PROCESSED`: Count
  - `LAST_RUN_ROWS_ADDED`: Total rows added
  - `BOUND_SPREADSHEET_ID`: (if using automatic triggers)
  - `LAST_RUN_CANDIDATES`: (list of files that were in the queue)
- **How to view:** Open Apps Script → **Project Settings** (gear icon) and scroll to **Script properties**

#### 7. Done!
- **Automatic mode:** Waits ~1 minute, then the trigger fires again
- **Manual mode:** You can now review results and run again if there are more files

---

## Working with the Processed Files Log

The **Processed Files Log** is your audit trail and status dashboard. Every file that the script touches gets a row here.

### Accessing the Log

1. Open your main spreadsheet
2. Click the **Processed Files Log** sheet tab at the bottom

[IMAGE PLACEHOLDER: Screenshot of Processed Files Log sheet with multiple rows]

### Understanding the Columns

| Column | Meaning |
|--------|---------|
| **Timestamp** | Date and time when the file was processed (e.g., "4/17/2026 8:30 AM") |
| **File Name** | The original Excel filename as it appears in Drive (e.g., "GR_REQUEST_2026_April.xlsx") |
| **Month** | Extracted month from filename or file date (e.g., "April", "May", or blank if not detected) |
| **Year** | Detected year (e.g., 2025, 2026); determines which output sheet receives the rows |
| **Rows Added** | Number of GR data rows successfully extracted and added to the output sheet (e.g., 10, 25, 0) |
| **Status** | Result code (see Status Codes below) |
| **File Link** | Clickable hyperlink to the original Excel file on Drive |

### Status Codes Explained

#### Done
- **Meaning:** File was successfully processed; all rows extracted and added to output sheet.
- **Rows Added:** Should be > 0
- **What to do:** Nothing! Review the data in the output sheet if desired.

#### No data extracted
- **Meaning:** File was converted and parsed, but no valid GR data rows were found.
- **Possible reasons:**
  - Sheet headers don't match expected column list (wrong format)
  - Rows below header are empty or contain only summary data
  - Expected columns were named differently than the script expects
- **Rows Added:** 0
- **What to do:**
  - Check the file manually to see if it contains valid data
  - Verify column headers match the expected list
  - If headers are different, check if they're in the HEADER_ALIASES list in the script (if not, add them)
  - Use "Admin" → "Test One Source File (Debug)" to see exact errors

#### 🔴 Needs manual check - file too large
- **Meaning:** File was > 10 MB and skipped for performance reasons.
- **Possible reasons:** Large number of rows/columns; complex formatting
- **What to do:**
  - Split the file into smaller chunks (< 10 MB) and upload separately
  - Or, manually extract rows from this file and add them to the output sheet

#### 🔴 Needs manual check - [other error]
- **Meaning:** An unexpected error occurred during processing (e.g., permission denied, malformed Excel, etc.).
- **What to do:**
  - Check the error message in the Status column for clues
  - Try uploading the file again (sometimes Drive API is temporarily unavailable)
  - Use "Admin" → "Test One Source File (Debug)" for detailed error logs
  - Verify file format is valid Excel (.xlsx or .xls)

#### 🔴 Error: [specific error]
- **Meaning:** Script encountered a specific problem (e.g., "Error: timeout", "Error: permission denied").
- **What to do:**
  - Check the specific error message
  - Review the troubleshooting section of this guide
  - Contact support with the error message if you can't resolve it

### Using the Log for Reporting

The Processed Files Log is useful for:
- **Audit trail:** See exactly which files were processed and when
- **Troubleshooting:** Identify files that failed and why
- **Reconciliation:** Count rows added per month/year to verify completeness
- **Dashboard:** Use this data in reports or dashboards to show processing progress

### Filtering and Sorting

Google Sheets filtering works on this sheet:

1. **Filter by status:** Select "Status" column → add filter → select only "Done" to see successful files
2. **Sort by date:** Click "Timestamp" column header → sort by date (newest first) to see recent runs
3. **Filter by year:** Click "Year" column → select 2025 or 2026 to see only files from that year

### Archiving Old Entries

After long periods of use, the log may become very large. You can:
- **Archive:** Copy old rows to another sheet (e.g., "Tracker Archive") and delete from the active log
- **Filter:** Use Views to hide old rows
- **Export:** Download as CSV for recordkeeping

---

## Using Backfill & Repair Tools

The **GR Posted Sheets** and **Tracker & Logs** menus contain tools for fixing data. These are especially useful when:
- You manually added rows to output sheets
- Lookup data changed and you want to recalculate
- Links got corrupted or are missing
- Exchange rates changed

### Backfill Lookup & Territory

[IMAGE PLACEHOLDER: Screenshot of GR Posted 2025 sheet showing enrichment columns before and after backfill]

**What it does:** Fills in missing enrichment columns (Regional Area, Cleaned Site Name, Territory, USD Amount) for existing rows by looking them up from the PLA Lookup sheet.

**When to use:**
- Rows have blank enrichment columns
- You added rows manually without running through the standard processing
- The PLA Lookup sheet was updated and you want existing rows to have the latest data

**How to use:**
1. Open your spreadsheet
2. Click **GR Automation** → **GR Posted Sheets** → **Backfill Lookup & Territory (existing rows)**
3. Wait a moment (this can be slow for large sheets with thousands of rows)
4. The script updates all output sheets
5. Check a few rows to confirm enrichment columns are now populated

**What changes:**
- Regional Area column: Filled with lookup data or left blank if PLA ID not found
- Cleaned Site Name column: Same
- Territory column: Same
- Amount To Billed (USD) column: Recalculated using USD conversion rate

**What doesn't change:**
- Any other columns or data remain unchanged
- Only cells that were previously blank are updated

---

### Recompute USD for All Rows

[IMAGE PLACEHOLDER: Screenshot showing before/after USD amounts after rate change]

**What it does:** Recalculates the USD conversion for all rows in output sheets.

**When to use:**
- You changed `CONFIG.usdConversionRate` (e.g., from 57 to 58 PHP per USD)
- You want to recompute all historical amounts to reflect new rate
- You realized conversion was calculated incorrectly

**How to use:**
1. (Optional but recommended) First, update `CONFIG.usdConversionRate` in Apps Script:
   - Open **Extensions** → **Apps Script**
   - Find the CONFIG object at the top
   - Change `usdConversionRate` value
   - Click **Save**

2. Go to your spreadsheet
3. Click **GR Automation** → **GR Posted Sheets** → **Recompute USD for All Rows**
4. A popup will show "Updating USD amounts..." 
5. Wait a moment to complete
6. Check the "Amount To Billed (USD)" column in output sheets to verify new amounts

**Impact:**
- Only the "Amount To Billed (USD)" enrichment column changes
- All other data and columns remain the same
- Calculation: `Amount To Billed` (original currency) ÷ `usdConversionRate` = USD amount

**Example:**
- Original amount: 10,000 PHP
- Old rate: 57 PHP/USD → 10,000 ÷ 57 = 175.44 USD
- New rate: 58 PHP/USD → 10,000 ÷ 58 = 172.41 USD (now shows this)

---

### Fix Source File Hyperlinks

[IMAGE PLACEHOLDER: Screenshot showing Source File column with hyperlinks]

**What it does:** Converts plain-text file links to clickable HYPERLINK formulas.

**When to use:**
- Source File column shows links as plain text (not clickable)
- You manually added rows and forgot hyperlinks
- Links need to be clickable for easy navigation

**How to use:**
1. Click **GR Automation** → **GR Posted Sheets** → **Fix Source File Hyperlinks**
2. Script processes all output sheets
3. Test by clicking a Source File link; it should now open the Excel file in Drive

**What changes:**
- Plain text links become clickable hyperlinks
- All other data unchanged
- Only "Source File" column affected

---

### Backfill Missing Source Links (Preview vs. Now)

[IMAGE PLACEHOLDER: Screenshot of backfill matching rows with PO numbers]

**Preview Mode:** Shows you what would be matched/updated WITHOUT making changes.

**Now Mode:** Actually applies the updates.

**What it does:** Matches rows in your output sheets back to their original Excel files by comparing PO numbers, filename tokens, and other identifiers. If a match is found, fills the Source File column with a hyperlink.

**When to use:**
- Many rows have blank Source File columns
- You want to establish audit trail linking each row to its source
- You want to verify matching logic before applying

**How to use:**

**Step 1: Preview (optional but recommended)**
1. Click **GR Automation** → **Tracker & Logs** → **Backfill Source Links (Preview)**
2. A notification will show how many rows could be matched
3. The script doesn't change anything; it just shows you the count
4. Example: "20 rows could be matched to source files"

**Step 2: Apply**
1. Click **GR Automation** → **Tracker & Logs** → **Backfill Source Links (Now)**
2. A notification will show "Starting backfill..."
3. Wait a moment to complete (can be slow for large sheets)
4. The script updates rows with matched source file links
5. Verify by checking a few rows to confirm links are clickable

**How matching works:**
- Script looks at each row's PO number, Material Description, and other key fields
- Compares against file names in your source Drive folder
- If a close match is found (same PO number, similar filename tokens), links that row to the source file
- Confidence threshold: Must match multiple fields to be considered a valid match (prevents false positives)

**Edge cases:**
- If multiple source files could match the same row, script picks the most likely one
- If no match is found, row's Source File column remains blank
- This is not 100% accurate; some matches might be incorrect. Always spot-check critical rows.

---

## Setting Up Automation & Auto-Processing

This section explains how to set up the script to run automatically without manual clicks.

### What is Automatic Processing?

Automatic processing means the script runs every 1 minute without you doing anything. New files uploaded to your source Drive folder will be automatically detected and processed.

**Benefits:**
- No manual intervention needed
- New data is processed within ~1 minute of upload
- System runs 24/7 (as long as Google Services are available)

**Trade-offs:**
- Consumes quota (Google has limits on Apps Script execution time per day)
- May add latency if many files are processing at once
- Requires the main spreadsheet to remain shared/accessible

### How to Enable Automatic Processing

[IMAGE PLACEHOLDER: Screenshot of GR Automation menu with Automation submenu expanded]

1. Open your spreadsheet
2. Click **GR Automation** → **Automation** → **Start Auto Trigger (1 min)**

[IMAGE PLACEHOLDER: Screenshot of confirmation popup "Trigger created. Auto-processing will start in ~1 minute."]

3. A popup will confirm the trigger was created
4. **Done!** The system is now automatic.

### Verifying It's Running

1. Click **GR Automation** → **Automation** → **Show Auto Processing Status**
2. A detailed status panel will appear

[IMAGE PLACEHOLDER: Screenshot of auto processing status showing run times and file counts]

The status shows:
- **Last run started at:** [timestamp]
- **Last run finished at:** [timestamp]
- **Status:** "Idle" (waiting for next trigger) or "Processing" (currently running)
- **Rows added in last run:** [count]
- **Files processed in last run:** [count]
- **Next scheduled run in:** ~60 seconds

### How Automatic Triggers Work (Technical)

Google Apps Script allows time-based triggers to run functions automatically. Here's what happens:

- **Trigger type:** Time-driven (every 1 minute)
- **Function called:** `consolidateGRTemplateData()` (the main processing function)
- **Frequency:** Every 1 minute, continuously
- **Limits:**
  - Google limits Apps Script execution to 6 hours per day total per project
  - Max 40 concurrent executions
  - If quota is reached, runs are queued and will execute when quota refreshes
- **Where to view:** 
  - Open **Extensions** → **Apps Script**
  - Click the **Triggers** icon (clock) on the left
  - You should see an entry for `consolidateGRTemplateData` with "Every minute" frequency

### How to Stop Automatic Processing

[IMAGE PLACEHOLDER: Screenshot of GR Automation menu showing Stop Auto Trigger option]

1. Click **GR Automation** → **Automation** → **Stop Auto Trigger**
2. A popup will confirm "Trigger removed."
3. Automatic processing is now stopped.
4. The script will only run when you manually click "Process All New Files Now"

### Monitoring Automatic Runs

To keep tabs on automatic processing:

1. **Check Processed Files Log regularly** — Rows will be added automatically as files are processed
2. **Review Script Properties** — Shows run times and file counts (Extensions → Apps Script → Project Settings)
3. **Check Drive temp folder** — Should be mostly empty if cleanup is working (_GR_AUTOMATION_TEMP folder)
4. **Monitor quota** — Check Extensions → Apps Script → Executions tab to see run history and any errors

### Automatic Run Limits

Remember, automatic processing is still subject to the same limits:
- Max 6 files per run (total)
- Max 3 files per year per run
- Max 2 minutes per run

If you have 100 files waiting, they'll be processed over many 1-minute intervals (10–15 minutes total to clear the queue).

---

## Understanding the Dashboard Overview

If you're using the optional **GR POSTED DATA CONSOLIDATION OVERVIEW** dashboard, here's what each metric means.

[IMAGE PLACEHOLDER: Screenshot of full dashboard from Data Studio]

### Key Metrics

#### Total Files Consolidated
- **Shows:** How many Excel files have been processed overall (e.g., 1,678)
- **Usefulness:** Tracks progress; increasing number means files are being processed

#### Total Data Rows Added
- **Shows:** Total number of GR data rows extracted and added to output sheets (e.g., 30K)
- **Usefulness:** Tracks data volume; helps with resource planning

#### Consolidation Success Rate
- **Shows:** Percentage of files that were successfully processed vs. failed (e.g., 99.70%)
- **Usefulness:** Quality indicator; > 95% is good; < 90% might indicate setup issues

#### Pending Manual Review
- **Shows:** Files with "Needs manual check" or "No data extracted" status (e.g., 5 files)
- **Usefulness:** Action items; these files need human review

#### Last Updated
- **Shows:** When the dashboard was last refreshed (e.g., "Apr 17, 2026, 11:02:46 AM")
- **Usefulness:** Confirms data is current

### Charts

#### Files Consolidated Per Day
- **Type:** Line chart
- **Shows:** Trend of how many files processed each day over time
- **Use for:** Spotting processing issues (should show consistent daily count; drops might indicate problems)

#### Records Added By Year
- **Type:** Bar chart
- **Shows:** Breakdown of rows added by year (2025 vs. 2026)
- **Use for:** Comparing year-to-year volumes; planning for next year's processing

#### Success vs. Manual Review
- **Type:** Pie chart
- **Shows:** Proportion of "Done" files vs. "Needs manual check" files
- **Use for:** Quick visual indicator of quality

#### Total GR Files Per Month
- **Type:** Bar chart
- **Shows:** Files processed per month (January through December)
- **Use for:** Seasonal trends; planning capacity

#### Pending Manual Review (Table)
- **Type:** Data table
- **Shows:** List of files still needing manual review with links
- **Columns:**
  - File Name
  - Link to File
  - Last Attempted On
- **Use for:** Quick navigation to problem files

---

## Troubleshooting Common Issues

This section covers the most common problems and how to fix them.

### "Script not running / Menu doesn't appear"

**Problem:** After installation, the "GR Automation" menu doesn't show up in your spreadsheet.

**Possible causes:**
1. Script didn't save properly
2. onOpen() function never ran
3. Permissions were denied

**Fix:**
1. Open **Extensions** → **Apps Script**
2. Click **Run** to execute the `onOpen()` function manually
3. Grant permissions when prompted
4. Go back to your spreadsheet and refresh the page (Ctrl+R or Cmd+R)
5. The menu should now appear

**If still not there:**
1. Check the Executions log (click the **Executions** icon in Apps Script)
2. Look for errors in the most recent `onOpen` execution
3. Fix the error (usually a typo in CONFIG settings)
4. Save and run again

---

### "File too large" or "Needs manual check - file too large"

**Problem:** A file is skipped with error "file too large".

**Root cause:** File is larger than 10 MB, which can cause Google Drive API conversion to timeout.

**Fix options:**
1. **Split the file:**
   - Open the Excel file
   - Split into two or more smaller files (< 10 MB each)
   - Upload the split files separately
   - Process each one individually

2. **Increase timeout (advanced):**
   - In Apps Script, find `CONFIG.maxRuntimeMs = 120000`
   - Increase to `180000` (3 minutes) or higher
   - Save and retry
   - Note: Very large increases might trigger Google's 6-minute hard timeout

3. **Manual processing:**
   - Extract rows from the large file manually
   - Paste them directly into the output sheet
   - Add source file link manually
   - Add a row to Processed Files Log noting it was manually handled

---

### "No data extracted" status

**Problem:** A file was processed but shows "No data extracted" in Processed Files Log.

**Possible causes:**
1. Excel sheet headers don't match expected column list
2. All rows are summary/total rows (filtered out by script)
3. File has multiple sheets and script picked the wrong one
4. Columns are named differently (aliases not recognized)

**Troubleshooting steps:**

**Step 1:** Use Debug Tool
1. Click **GR Automation** → **Admin** → **Test One Source File (Debug)**
2. Select the problematic file
3. Read the detailed debug output showing:
   - Headers detected vs. expected
   - Number of rows scanned
   - Any filtering applied
   - Exact column matches/mismatches

**Step 2:** Check the File Manually
1. Open the Excel file in Drive
2. Look at the sheet:
   - Is there a header row with column names?
   - Are there data rows below the header?
   - Do any column headers match: PO No., Material Description, Installed Qty, Acceptance Date, etc.?

**Step 3:** Fix Common Issues

**Issue: Headers use different names**
- Example: File has "PO Number" but script expects "PO No."
- Solution: The script has an HEADER_ALIASES list to handle this, but if a column name is very different, you may need to:
  1. Edit the file to rename headers to match expected names, OR
  2. Add new aliases to the script's HEADER_ALIASES object (advanced)
  3. Re-process the file

**Issue: All rows are summaries**
- Example: File has only TOTAL rows, no data rows
- Solution: This file might not have detailed data; check if it's correct file, or manually extract summary data if needed

**Issue: Multiple sheets, wrong one selected**
- Example: File has Sheet1 (summary), Sheet2 (data), and script picked Sheet1
- Solution:
  1. Rename the data sheet to something like "GR TEMPLATE" or "Data"
  2. Re-process the file
  3. Script will detect the renamed sheet and use that

**Issue: Rows are hidden or filtered**
- Solution: 
  1. Open the file and unfilter/unhide rows
  2. Re-save the file
  3. Re-process

**Step 4:** Retry
1. After fixing the file, click **GR Automation** → **Processing** → **Retry Failed Files**
2. Or wait for the next automatic run (if enabled)
3. Check the Processed Files Log for the updated status

---

### "Permission denied" or "Drive API error"

**Problem:** Execution fails with "Permission denied" or "Drive API error".

**Root cause:** 
1. Advanced Drive API not enabled
2. Script properties missing permissions
3. Temporary network/API outage

**Fix:**

**Step 1: Verify Drive API is enabled**
1. Open **Extensions** → **Apps Script**
2. Click the **gear icon** (Project Settings)
3. Under "Google Cloud Platform (GCP) Project", click the project link
4. Go to **APIs & Services** → **Library**
5. Search "Google Drive API"
6. Verify it shows "Enabled" (blue badge)
7. If not, click **Enable**

**Step 2: Clear permissions and re-authorize**
1. In Apps Script, click **Run** on any simple function (e.g., `onOpen`)
2. Grant all requested permissions (click **Review Permissions** → select account → **Allow**)
3. This refreshes the authorization

**Step 3: Retry**
1. Go to spreadsheet
2. Try "Process All New Files Now" again

**Step 4: If still failing**
1. Wait a few minutes (might be Google API temporary issue)
2. Try again
3. If persistent, contact support with the exact error message

---

### "Trigger creation failed"

**Problem:** "Start Auto Trigger" doesn't work; trigger is not created.

**Possible causes:**
1. BOUND_SPREADSHEET_ID not set properly
2. Quota exceeded
3. Permissions issue

**Fix:**
1. Manually check if a trigger already exists:
   - Open **Extensions** → **Apps Script**
   - Click **Triggers** (clock icon)
   - Look for `consolidateGRTemplateData` with "Every minute" frequency
   - If it exists, the auto trigger IS running (nothing to fix)

2. If no trigger exists:
   - Try "Stop Auto Trigger" first (in case of partial state)
   - Wait a moment
   - Try "Start Auto Trigger" again

3. If still failing:
   - Manually create the trigger:
     - Open Apps Script → **Triggers**
     - Click **Create new trigger** (bottom right)
     - Function: `consolidateGRTemplateData`
     - Event type: **Time-driven**
     - Frequency: **Every minute**
     - Click **Save**

---

### "Rows not showing up in output sheet"

**Problem:** Files show "Done" status in Processed Files Log, but rows don't appear in GR Posted 2025/2026 sheet.

**Possible causes:**
1. Output sheet doesn't exist or has wrong name
2. Rows were added to wrong sheet (wrong year detected)
3. Permissions issue on target spreadsheet

**Fix:**

**Step 1: Verify output sheets exist**
1. In your spreadsheet, look at the sheet tabs at the bottom
2. Do you see "GR Posted 2025" and "GR Posted 2026"?
3. If not, create them:
   - Right-click an existing sheet
   - Click **Insert 1 sheet**
   - Name it "GR Posted 2025"
   - Repeat for 2026
4. Add header row (manually or via "Admin" → "Check Lookup & Output Setup")

**Step 2: Check year detection**
1. In Processed Files Log, look at the "Year" column for the processed file
2. Is it correct (2025 or 2026)?
3. If wrong:
   - The filename might be ambiguous (try renaming to include year clearly)
   - File date might be wrong (check file's modification date and fix if needed)

**Step 3: Check if rows are there**
1. Open the appropriate output sheet (GR Posted 2025, etc.)
2. Scroll down; are there any rows beyond the header?
3. Use Ctrl+End (Cmd+End) to jump to the last cell with data

**Step 4: If using multiple target spreadsheets**
1. If you configured different years to go to different spreadsheets (via "GR Automation Config" sheet):
   - Verify that spreadsheet is accessible and the sheet exists there
   - Make sure you have Editor access to that spreadsheet

---

### "Enrichment columns are blank"

**Problem:** Rows appear in output sheet but Regional Area, Cleaned Site Name, Territory columns are empty.

**Possible causes:**
1. PLA Lookup sheet doesn't exist or is empty
2. PLA ID column in source file doesn't have values
3. Lookup data doesn't match (case sensitivity, spaces, etc.)

**Fix:**

**Step 1: Verify PLA Lookup exists**
1. At the bottom of your spreadsheet, look for **PLA Lookup** sheet
2. If missing, create it:
   - Right-click existing sheet → **Insert 1 sheet**
   - Name it "PLA Lookup"
   - Add headers: PLA ID, Regional Area, SITE NAME, Territory
   - Add sample lookup data

**Step 2: Populate PLA Lookup**
1. Click the **PLA Lookup** sheet
2. Verify it has at least these columns: PLA ID, Regional Area, SITE NAME, Territory
3. Add rows with your PLA ID to Region/Site/Territory mappings

**Example PLA Lookup:**
| PLA ID | Regional Area | SITE NAME | Territory |
|--------|---------------|-----------|-----------|
| PH001 | APAC | Manila | Philippines |
| SG002 | APAC | Singapore | Singapore |
| SG003 | APAC | Singapore | Singapore |

**Step 3: Trigger enrichment backfill**
1. Go to spreadsheet
2. Click **GR Automation** → **GR Posted Sheets** → **Backfill Lookup & Territory (existing rows)**
3. Wait for completion
4. Check output sheets; enrichment columns should now be populated

---

### "USD amounts not calculated"

**Problem:** "Amount To Billed (USD)" column is blank or shows incorrect values.

**Possible causes:**
1. Currency column doesn't have currency codes (PHP, EUR, USD, etc.)
2. Amount To Billed column has non-numeric values
3. USD conversion rate is not set correctly

**Fix:**

**Step 1: Check source data**
1. Open the Excel file in Drive
2. Look for "Currency" and "Amount To Billed" columns
3. Verify they have actual values (not blank, not text-only)

**Step 2: Verify USD conversion rate**
1. Open **Extensions** → **Apps Script**
2. Find `CONFIG.usdConversionRate` (around line 17)
3. Current value should be ~57 (PHP per USD)
4. If you need to adjust based on current exchange rate, change it:
   ```javascript
   usdConversionRate: 58  // Updated rate
   ```
5. Save

**Step 3: Recalculate USD**
1. Go to spreadsheet
2. Click **GR Automation** → **GR Posted Sheets** → **Recompute USD for All Rows**
3. Wait for completion
4. Check "Amount To Billed (USD)" column; values should appear

---

### "Script is very slow / timing out"

**Problem:** Processing takes too long or fails with timeout error.

**Possible causes:**
1. Files are too large (> 10 MB)
2. Output sheets have too many rows (> 10K)
3. Too many files waiting to be processed

**Fix:**

**Option 1: Reduce file size**
1. Split large Excel files into smaller chunks
2. Process each chunk separately

**Option 2: Increase runtime limit**
1. Open **Extensions** → **Apps Script**
2. Find `CONFIG.maxRuntimeMs = 120000`
3. Increase to `180000` (3 minutes) or `240000` (4 minutes)
4. Save and retry
5. Note: Don't exceed ~300000 (5 minutes) to leave margin before Google's 6-minute hard limit

**Option 3: Reduce batch size**
1. Open Apps Script
2. Find `CONFIG.maxFilesPerRunTotal = 6`
3. Reduce to `4` or `3` (process fewer files per run)
4. This means automatic processing will take longer overall but each run will complete faster
5. Save

**Option 4: Archive old data**
1. Output sheets with tens of thousands of rows slow down the script
2. Archive old rows to a separate sheet or delete if no longer needed
3. This keeps active sheets fast

---

### "Duplicate rows in output sheet"

**Problem:** Same GR data appears multiple times in the output sheet.

**Possible causes:**
1. File was processed twice (trigger ran while manual processing was happening)
2. Idempotency check failed

**Fix:**

**Option 1: Manual removal (quick)**
1. Open the output sheet
2. Identify and delete duplicate rows manually
3. Keep only one copy of each row

**Option 2: Check Processed Files Log**
1. Click **Processed Files Log** sheet
2. Look for rows with the same "File Name" and "Status" = "Done"
3. If same file appears twice, it was accidentally processed twice
4. You can add a note in the extra row explaining it's a duplicate, or delete the extra row

**Option 3: Prevent future duplicates**
1. Make sure only one of (automatic trigger OR manual processing) is running
2. If automatic trigger is enabled, don't also manually click "Process All New Files Now" at the same time
3. Or, stop auto trigger via "Automation" → "Stop Auto Trigger" if you're doing manual runs

---

### "Temp folder accumulating files"

**Problem:** The "_GR_AUTOMATION_TEMP" folder on Drive has lots of temporary files (not cleaned up).

**Possible causes:**
1. Cleanup failed during processing (rare)
2. Script was interrupted mid-way
3. User hasn't run cleanup recently

**Fix:**
1. Go to your spreadsheet
2. Click **GR Automation** → **Admin** → **Clean Temp Files**
3. A notification will say how many files were deleted
4. Check your Drive _GR_AUTOMATION_TEMP folder; it should now be empty (or nearly empty)
5. Those files are moved to your Drive Trash (recoverable for 30 days if needed)

---

## Maintenance & Cleanup

Keep your system healthy with regular maintenance.

### Weekly Maintenance

- **Review Processed Files Log** — Check for files with "Needs manual check" status
- **Inspect output sheets** — Spot-check a few rows for data quality
- **Monitor Dashboard** — Confirm success rate is > 95%

### Monthly Maintenance

- **Clean Temp Files** — Run "Admin" → "Clean Temp Files" to remove temporary converted sheets
- **Archive Old Tracker Rows** — If Processed Files Log has > 5000 rows, consider archiving old entries
- **Review Failed Files** — Look for patterns; if multiple files of a certain type fail, investigate

### Quarterly Maintenance

- **Update Exchange Rates** — If USD conversion rate changed significantly, update `CONFIG.usdConversionRate` and recompute
- **Verify PLA Lookup** — Ensure PLA Lookup sheet is current and complete
- **Test Debug Tool** — Run "Test One Source File" on a sample file to verify everything still works

### Archiving Historical Data

When output sheets get very large (> 20K rows), performance may degrade:

1. **Create archive sheet:**
   - Right-click output sheet (e.g., "GR Posted 2025")
   - Select "Insert 1 sheet"
   - Name it "GR Posted 2025 Archive"

2. **Move old rows:**
   - In "GR Posted 2025", sort by Timestamp or Year
   - Select rows older than a certain date
   - Cut (Ctrl+X)
   - Go to "GR Posted 2025 Archive"
   - Paste (Ctrl+V)

3. **Update active sheet:**
   - "GR Posted 2025" now has only recent data (faster)
   - "GR Posted 2025 Archive" has historical data (still searchable)

---

## How the Script Works (Technical Overview)

This section explains the technical architecture and workflow for users who want to understand the "why" behind the script's design.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GR Consolidation System                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  INPUT: Excel files in Drive folder                         │
│        ↓                                                     │
│  CONVERSION: Use Drive API to convert Excel → Sheets        │
│        ↓                                                     │
│  PARSING: Open converted sheet; detect headers; find data   │
│        ↓                                                     │
│  ENRICHMENT: Look up PLA; convert currency; fill columns    │
│        ↓                                                     │
│  OUTPUT: Append rows to target sheet; log results           │
│        ↓                                                     │
│  CLEANUP: Delete temp file; record in tracker               │
│                                                              │
│  CONTROL: Time-based trigger runs this every 1 minute       │
│           (or manual clicks run on-demand)                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Why Convert Excel to Google Sheets?
- Excel files on Drive can't be directly parsed via Apps Script
- Converting to Google Sheets allows programmatic access to cell data
- Trade-off: ~30 seconds per conversion, but enables full automation
- Alternative: Manual download + process (slow, error-prone)

#### 2. Why Multiple Processing Runs Instead of One?
- Google Apps Script has a 6-minute max execution time
- Processing large batches in one run can exceed timeout
- Solution: Multiple 1–2-minute runs, with limits (6 files per run, 3 per year)
- Result: More reliable; queue naturally spreads over time

#### 3. Why Caching PLA Lookups?
- PLA Lookup sheet might have 1000+ rows
- Loading it once per file vs. once per run saves time
- In-memory cache (`_CACHE.plaLookupMapBySsId`) reuses data across calls
- Trade-off: If lookup data changes mid-run, cache won't refresh (acceptable for 1-minute runs)

#### 4. Why Multiple Idempotency Checks?
- Prevents duplicate logging of same file
- Uses multiple key types: filename, normalized name, Drive ID, URL variants
- Handles edge cases (filename changed, file moved, etc.)
- Why multiple checks? Drive API sometimes changes URLs; multiple checks ensure we catch duplicates

#### 5. Why Visible-Row-Only Filtering?
- Users sometimes hide rows (filtered data, test rows, etc.)
- Script respects user's visible/hidden state
- Config option: `onlyIncludeVisibleRows: true` (default)
- Set to `false` if you want to include hidden rows

#### 6. Why Aliases for Column Headers?
- Different sources name columns differently ("PO Number" vs. "PO No.", "Qty" vs. "Installed Qty")
- HEADER_ALIASES list maps variations to canonical names
- Improves compatibility; reduces "No data extracted" errors
- Example: `"PO Number": "PO No."` means script treats "PO Number" headers as "PO No."

### Processing Flow (Detailed)

1. **Start trigger/manual click**
   - Apps Script function `consolidateGRTemplateData()` runs
   - Script tries to acquire a lock (prevents overlapping runs)

2. **Scan drive for new files**
   - Reads "Processed Files Log" sheet into memory (processedMap)
   - Scans source Drive folder for Excel files
   - Filters: Skip files already processed, skip failed files (>5 attempts), skip large files (>10MB)
   - Result: Candidate list of new files

3. **Group by year, apply limits**
   - Extracts year from filename (regex) or file date
   - Groups candidates by year
   - Selects up to 6 files total, max 3 per year
   - Remaining files wait for next run

4. **For each selected file**
   - **Convert:** Use Drive API to copy Excel → temporary Google Sheet
   - **Open:** Retrieve temporary sheet (retry 3 times if API errors)
   - **Parse:** Detect best sheet/tab within the converted spreadsheet
   - **Detect headers:** Scan rows looking for one that matches expected columns (min 3 matches)
   - **Extract rows:** Apply filters (summaries, hidden rows, empty rows); collect valid data rows
   - **Enrich:** For each row, lookup enrichment data (Region/Site/Territory/USD)
   - **Append:** Add rows to output sheet (creating sheet if needed)
   - **Log:** Add row to Processed Files Log and Perf Log
   - **Cleanup:** Delete temporary sheet (move to trash)

5. **Update state**
   - Write run state to Script Properties (times, counts, status)
   - Release lock

6. **Wait or repeat**
   - If automatic trigger: wait ~60 seconds, trigger fires again
   - If manual: done; user can inspect results

### Key Algorithms

#### Header Detection
```
For each row in [1 to CONFIG.headerScanMaxRows]:
  Count how many cells in this row match expected column names
  (accounting for aliases)
  If count >= CONFIG.minHeaderMatches:
    This is the header row!
    Record column positions
    Break
If no header found:
  Status = "No data extracted"
  Return empty
```

#### Row Validation
```
For each row below header:
  If row is hidden and CONFIG.onlyIncludeVisibleRows:
    Skip this row
  If row contains summary keywords (TOTAL, SUBTOTAL, etc.):
    Skip this row
  If row has merged cells (detected by unusual patterns):
    Skip this row
  If all key columns are empty:
    Skip this row (likely blank row)
  Otherwise:
    This is a valid data row
    Extract and collect it
```

#### Enrichment & Currency Conversion
```
For each extracted row:
  Get PLA ID from row
  Lookup PLA ID in cached PlaLookupMap:
    Find matching regional area, site name, territory
  Get Currency and Amount from row
  If Currency is PHP or EUR:
    Calculate USD = Amount / CONFIG.usdConversionRate
  Else if Currency is USD:
    USD = Amount
  Else:
    USD = (try to infer, or leave blank)
  Append enrichment values to row
```

#### Idempotency (Duplicate Prevention)
```
When about to log file result:
  Generate multiple matching keys:
    Key1 = raw filename
    Key2 = normalized filename (lowercase, spaces removed)
    Key3 = "__ID__" + DriveFileId
    Key4 = "__SOURCE_ID__" + DriveFileId
    Key5 = "__URL__" + normalizedUrl
    Key6 = "__URL_ALT__" + urlWithHostStripped
  
  If ANY key exists in processedMap:
    This file was already logged
    Skip logging (avoid duplicate)
  Else:
    Log this file result
    Add all keys to processedMap
```

### Performance Characteristics

- **Conversion time:** ~30–60 seconds per file (Google Drive API)
- **Parsing time:** ~10–20 seconds per file (depends on sheet size)
- **Enrichment time:** ~1–5 seconds per file (lookup table speed)
- **Append time:** ~5–15 seconds per file (sheet write speed)
- **Total per file:** ~50–120 seconds

**Throughput:** ~3–6 files per 2-minute run = ~1.5–3 files per minute

**With automatic 1-minute triggers:** ~100–150 files per hour (subject to limits)

---

## Appendix: Script Reference & Functions

This section provides a reference for all major functions in the script. For the complete annotated source code, see the external link at the end.

### Main Public Functions (Called by Menu)

#### `consolidateGRTemplateData()`
**Purpose:** Main processing function; scans Drive folder, converts Excel files, extracts GR data, appends to output sheets, logs results.

**Invoked by:** 
- Manual menu click: "Processing" → "Process All New Files Now"
- Time-based trigger: Every 1 minute (if auto trigger enabled)

**Parameters:** None

**Returns:** None (writes to spreadsheet)

**Side effects:**
- Creates/updates sheets ("GR Posted 2025", "GR Posted 2026", etc.)
- Appends rows to Processed Files Log
- Creates temp files in Drive (then deletes them)
- Updates Script Properties (run state)

**Example flow:**
```
User clicks "GR Automation" → "Processing" → "Process All New Files Now"
  ↓
consolidateGRTemplateData() executes
  ↓
Scans Drive for new Excel files
  ↓
Converts + parses files
  ↓
Appends rows to output sheets
  ↓
Logs results in Processed Files Log
  ↓
Completes (notification shown)
```

---

#### `showYearPicker()`
**Purpose:** Displays a modal dialog letting user select a year, then calls `runConsolidateForYear()` for that year only.

**Invoked by:** Manual menu click: "Processing" → "Process Files for Year..."

**Parameters:** None

**Returns:** None (modal displayed)

**Side effects:** None until user selects a year

**Example:**
```
User clicks "Processing" → "Process Files for Year..."
  ↓
Modal appears with year choices: [2025] [2026]
  ↓
User clicks 2025
  ↓
runConsolidateForYear(2025) called
  ↓
Only 2025 files processed
```

---

#### `runConsolidateForYear(year)`
**Purpose:** Process files from a specific year only (bypass year-detection).

**Invoked by:** `showYearPicker()` after user selects year

**Parameters:** 
- `year` (number): Year to process (e.g., 2025, 2026)

**Returns:** None (writes to spreadsheet)

**Side effects:** Same as `consolidateGRTemplateData()` but filtered to single year

---

#### `setupAutomaticEvery1Min()`
**Purpose:** Create a time-based trigger to run `consolidateGRTemplateData()` every 1 minute.

**Invoked by:** Manual menu click: "Automation" → "Start Auto Trigger (1 min)"

**Parameters:** None

**Returns:** None (trigger created)

**Side effects:**
- Creates time-based trigger in Apps Script
- Stores BOUND_SPREADSHEET_ID in Script Properties
- Automatic processing begins ~1 minute after call

---

#### `stopAutomatic()`
**Purpose:** Remove the automatic 1-minute trigger.

**Invoked by:** Manual menu click: "Automation" → "Stop Auto Trigger"

**Parameters:** None

**Returns:** None (trigger deleted)

**Side effects:** Automatic processing stops

---

#### `debugAutoProcessingStatus()`
**Purpose:** Display detailed status of the last automatic run.

**Invoked by:** Manual menu click: "Automation" → "Show Auto Processing Status"

**Parameters:** None

**Returns:** None (status modal displayed)

**Displays:**
- Last run start/end time
- Current status ("Idle", "Processing", error, etc.)
- Files processed in last run
- Rows added in last run
- Time until next auto run

---

### File Processing Functions

#### `processSingleFile_(ss, fileInfo, tempFolder)`
**Purpose:** Orchestrates all steps for a single file: convert, open, parse, append, cleanup.

**Called by:** `consolidateGRTemplateData()` in a loop for each file

**Parameters:**
- `ss` (Spreadsheet): The bound spreadsheet object
- `fileInfo` (Object): File metadata {id, name, year, month, url}
- `tempFolder` (Folder): Google Drive folder for temp converted sheets

**Returns:** Object `{rowsAdded, status, timings}`
- `rowsAdded` (number): Count of rows added to output sheet
- `status` (string): "Done", "No data extracted", "Error: ...", etc.
- `timings` (Object): {convertMs, openMs, parseMs, appendMs, totalMs}

**Side effects:**
- Creates temp Google Sheet
- Deletes temp Google Sheet (in finally block)
- Appends rows to output sheet
- Updates performance log

---

#### `convertExcelToTempSheet_(fileInfo, tempFolder)`
**Purpose:** Use Google Drive API to convert Excel file to temporary Google Sheet.

**Called by:** `processSingleFile_()`

**Parameters:**
- `fileInfo` (Object): {id, name, url}
- `tempFolder` (Folder): Destination folder for temp file

**Returns:** Object `{sheetId, sheetUrl}` or throws error

**Side effects:**
- Calls Drive API (Drive.Files.copy)
- Creates file in temp folder with "_TEMP_" prefix
- May throw NON_RETRIABLE_TOO_LARGE if file > 10 MB

**Example error handling:**
```javascript
try {
  let converted = convertExcelToTempSheet_(fileInfo, tempFolder);
  // Use converted.sheetId
} catch (e) {
  if (e.message.includes("NON_RETRIABLE_TOO_LARGE")) {
    status = "Needs manual check - file too large";
  } else {
    status = "Error: " + e.message;
  }
}
```

---

#### `parseConvertedSheet_(tempSS, fileName)`
**Purpose:** Find the best sheet/tab within a converted spreadsheet and extract candidate rows.

**Called by:** `processSingleFile_()`

**Parameters:**
- `tempSS` (Spreadsheet): The converted temporary Google Sheet
- `fileName` (string): Original Excel filename (used for scoring)

**Returns:** Object `{rows, columnMap, sheetName}`
- `rows` (Array): Array of row data (each row is Array of cell values)
- `columnMap` (Object): Maps column names to indices
- `sheetName` (string): Which sheet was chosen

**Logic:**
1. Prefer sheets with names like "GR TEMPLATE" (fast path)
2. Fallback: Score all sheets by header match count
3. Pick sheet with highest score
4. Extract rows from chosen sheet

---

#### `extractRowsWithFilter_(startRow, endRow, headerColumnMap, rawValues, sheet)`
**Purpose:** Extract data rows from a sheet, applying all filters (summary, merged cells, hidden rows, empty rows).

**Called by:** `evaluateSheetCandidate_()`

**Parameters:**
- `startRow, endRow` (number): Row range to scan
- `headerColumnMap` (Object): Column name → index mapping
- `rawValues` (Array): 2D array of cell values
- `sheet` (Sheet): The sheet object (for checking hidden rows)

**Returns:** Array of filtered row arrays

**Filters applied (in order):**
1. Skip hidden rows (if `CONFIG.onlyIncludeVisibleRows`)
2. Skip summary/footer rows (keywords: TOTAL, SUBTOTAL, SUMMARY, etc.)
3. Skip repeated header rows
4. Skip merged-cell artifact rows
5. Skip empty rows
6. Keep only rows with data in key columns

**Example:**
```javascript
let validRows = extractRowsWithFilter_(2, 100, colMap, rawData, sheet);
// validRows contains only data rows, all summaries/artifacts removed
```

---

### Enrichment Functions

#### `getEnrichmentForRow_(row, lookupMap)`
**Purpose:** For a data row, look up and compute enrichment columns (Region, Site, Territory, USD).

**Called by:** `appendRowsWithSourceLink_()`

**Parameters:**
- `row` (Array): Row data (all columns)
- `lookupMap` (Object): PLA ID → {regional area, site name, territory} mapping

**Returns:** Array `[regionalArea, siteNameCleaned, territory, usdAmount]`

**Enrichment logic:**
1. Extract PLA ID from row
2. Lookup in PLA Lookup sheet
3. Extract Regional Area, Site Name (cleaned), Territory
4. Extract currency and amount
5. Convert to USD if PHP/EUR
6. Return enriched values

---

#### `toUsdIfPhp_(amountValue, currencyValue)`
**Purpose:** Convert PHP or EUR amounts to USD using configured rate.

**Called by:** `getEnrichmentForRow_()`, `formatCellByHeader_()`

**Parameters:**
- `amountValue` (number or string): Amount to convert
- `currencyValue` (string): Currency code (e.g., "PHP", "EUR", "USD")

**Returns:** Number (USD amount) or original amount if currency is USD or unknown

**Logic:**
```
If currency is PHP or EUR:
  Parse amountValue as number
  Return amountValue / CONFIG.usdConversionRate
Else:
  Return amountValue as-is
```

---

#### `loadPlaLookupMap_(ss)`
**Purpose:** Read the "PLA Lookup" sheet and build an in-memory map for fast lookups.

**Called by:** `getPlaLookupMapCached_()` on first call

**Parameters:**
- `ss` (Spreadsheet): The bound spreadsheet

**Returns:** Object `{plaId → {regionalArea, siteName, territory}}`

**Format returned:**
```javascript
{
  "PH001": {regionalArea: "APAC", siteName: "Manila", territory: "Philippines"},
  "SG002": {regionalArea: "APAC", siteName: "Singapore", territory: "Singapore"},
  ...
}
```

**Caching:** Result is cached in `_CACHE.plaLookupMapBySsId[ssId]` to avoid reloading

---

### Sheet Management Functions

#### `ensureSheets_(ss)`
**Purpose:** Verify all required sheets exist; create them if missing.

**Called by:** `consolidateGRTemplateData()` at start

**Parameters:**
- `ss` (Spreadsheet): The bound spreadsheet

**Returns:** None

**Side effects:**
- Creates "Processed Files Log" if missing
- Creates "PLA Lookup" if missing
- Creates "GR Automation Config" if missing
- Creates output sheets (e.g., "GR Posted 2025", "GR Posted 2026") if missing
- Adds header rows if missing

---

#### `ensureEnrichmentColumns_(sheet)`
**Purpose:** Ensure output sheet has enrichment columns (Regional Area, Cleaned Site Name, Territory, Amount To Billed USD).

**Called by:** `findOutputSheetByYear_()`

**Parameters:**
- `sheet` (Sheet): The output sheet

**Returns:** None

**Side effects:**
- Adds enrichment columns to the right of data columns if missing

---

#### `appendRowsWithSourceLink_(sheet, rows, fileInfo, controllerSs)`
**Purpose:** Append extracted rows to an output sheet, adding Source File hyperlink and enrichment.

**Called by:** `processSingleFile_()`

**Parameters:**
- `sheet` (Sheet): The output sheet (e.g., "GR Posted 2025")
- `rows` (Array): Array of extracted data rows
- `fileInfo` (Object): {id, name, url} of source file
- `controllerSs` (Spreadsheet): The bound spreadsheet (for enrichment lookup)

**Returns:** Number of rows appended

**Side effects:**
- Appends rows to sheet
- Adds Source File HYPERLINK formula for each row
- Looks up enrichment data and fills enrichment columns
- Applies formatting (dates, currency, percentages)

---

### Tracker & Logging Functions

#### `appendTrackerRowIfNotDuplicate_(ss, fileInfo, result, processedMap)`
**Purpose:** Add a result row to Processed Files Log, checking for duplicates first.

**Called by:** `processSingleFile_()` after processing each file

**Parameters:**
- `ss` (Spreadsheet): The bound spreadsheet
- `fileInfo` (Object): {id, name, month, year, url}
- `result` (Object): {rowsAdded, status}
- `processedMap` (Object): In-memory map of already-processed files

**Returns:** Boolean (true if logged, false if skipped as duplicate)

**Duplicate detection:**
- Generates 6 different matching keys (filename, ID, URL variants)
- If ANY key exists in processedMap, skips logging
- Prevents duplicate tracker rows

---

#### `logPerfEntry_(fileInfo, timings)`
**Purpose:** Log performance metrics to "GR Automation Perf" sheet.

**Called by:** `processSingleFile_()` after completing each file

**Parameters:**
- `fileInfo` (Object): {id, name, year}
- `timings` (Object): {convertMs, openMs, parseMs, appendMs, totalMs}

**Returns:** None

**Side effects:**
- Appends row to "GR Automation Perf" sheet with timing data

**Useful for:** Monitoring performance, identifying slow files, debugging

---

### Backfill Functions

#### `backfillMissingSourceLinksPreview()`
**Purpose:** Show preview of how many rows could be matched to source files (without making changes).

**Invoked by:** Manual menu click: "Tracker & Logs" → "Backfill Source Links (Preview)"

**Parameters:** None

**Returns:** None (popup shows count)

**Side effects:** None (read-only)

---

#### `backfillMissingSourceLinksNow()`
**Purpose:** Match output sheet rows to source files and fill Source File column with hyperlinks.

**Invoked by:** Manual menu click: "Tracker & Logs" → "Backfill Source Links (Now)"

**Parameters:** None

**Returns:** None

**Side effects:**
- Updates "Source File" column in all output sheets
- Adds HYPERLINK formulas pointing to matched source files

**Matching logic:**
- Compares PO numbers and filename tokens
- Looks for high-confidence matches
- If multiple matches possible, picks most likely
- If no match, leaves cell blank

---

### Cleanup Functions

#### `cleanupTempFiles()`
**Purpose:** Delete temporary files from the "_GR_AUTOMATION_TEMP" folder (move to Trash).

**Invoked by:** Manual menu click: "Admin" → "Clean Temp Files"

**Parameters:** None

**Returns:** None

**Side effects:**
- Moves all files in temp folder to Drive Trash
- Frees up Drive space

---

### Helper Functions

#### `detectYearFromNameOrFileDate_(file)`
**Purpose:** Extract year from file name (regex) or file modification date.

**Called by:** `listCandidateFilesByYear_()`

**Parameters:**
- `file` (File): Google Drive file object

**Returns:** Number (year, e.g., 2025) or null if undetectable

**Logic:**
1. Try regex on filename: /(\d{4})/ → look for 4-digit number
2. If found and in reasonable range (2000–2099), return it
3. Fallback: Use file's lastModifiedDate year

---

#### `normalizeLookupKey_(v)`
**Purpose:** Normalize text for lookup matching (lowercase, trim, remove extra spaces).

**Called by:** Enrichment and header matching functions

**Parameters:**
- `v` (string): Text to normalize

**Returns:** String (normalized)

**Example:**
```javascript
normalizeLookupKey_("  PO Number  ") → "po number"
```

---

#### `isManagedServices_(materialDesc, serviceShortText)`
**Purpose:** Detect if a row is a Managed Services row (special enrichment handling).

**Called by:** `getEnrichmentForRow_()`

**Parameters:**
- `materialDesc` (string): Material Description column
- `serviceShortText` (string): PO Service Short Text column

**Returns:** Boolean

**Logic:** If text contains keywords like "SERVICE", "MAINTENANCE", "SUPPORT", etc., considers it Managed Services

**Why:** Managed Services rows often have no territory (OPEX), so enrichment is handled differently

---

#### `isOpexWbs_(wbsValue)`
**Purpose:** Detect if WBS Element indicates OPEX (Operational Expenditure).

**Called by:** Enrichment logic

**Parameters:**
- `wbsValue` (string): WBS Element column value

**Returns:** Boolean

**Logic:** If WBS starts with "OPEX" or other patterns, returns true

**Why:** OPEX entries have different territory/site handling

---

#### `formatCellByHeader_(header, rawValue, displayValue)`
**Purpose:** Apply cell formatting (dates, currency, percentages) based on column header.

**Called by:** `appendRowsWithSourceLink_()`

**Parameters:**
- `header` (string): Column header name
- `rawValue` (any): Raw cell value from Excel
- `displayValue` (string): Display representation

**Returns:** Formatted value ready for Google Sheet

**Formatting applied:**
- Date columns: Convert to Google Sheet date format
- Currency columns: Apply currency number format
- Percentage columns: Apply percentage format
- Payment Milestone: If 0–1 range, convert to percentage (e.g., 0.5 → 50%)

---

---

## Appendix: Glossary & Reference

### Key Terminology

**GR (Goods Receipt)**
- Document showing items received into inventory
- Contains PO number, material, quantity, dates, etc.
- Source of truth for this consolidation system

**PLA (Program Location Area)**
- Identifier for a geographic location or business entity
- Used for lookup enrichment (ties location to Region/Territory/Site Name)
- Maintained in "PLA Lookup" sheet

**Enrichment**
- Adding extra columns to data (Region, Territory, USD amount) based on lookups
- Improves data completeness and usability for reporting

**Idempotency**
- Property that running an operation multiple times = running it once
- Script detects and skips duplicate files to avoid duplicate rows in output
- Multiple matching strategies ensure duplicates are caught

**Consolidation**
- Process of combining data from multiple Excel files into a single sheet
- Extracts only relevant columns (output columns specified in COLUMN_MAPPING)
- Standardizes format across all sources

**Tracker (Processed Files Log)**
- Audit log showing every file processed, status, and result count
- Used for monitoring, troubleshooting, and compliance/recordkeeping

---

### File Naming Conventions

**Source Excel files should include:**
- **Year:** e.g., "2025", "2026" in the filename
  - Example: "GR_REQUEST_2025_April.xlsx"
  - Script uses year to route rows to correct output sheet

**Temp converted files:**
- Prefixed with "_TEMP_" in Drive
- Example: "_TEMP_GR_REQUEST_2025_April"
- Automatically deleted after processing

**Output sheet names (default):**
- "GR Posted 2025" for 2025 files
- "GR Posted 2026" for 2026 files
- Can be customized via "GR Automation Config" sheet

---

### Useful Google Sheets Features

**Sorting & Filtering:**
- Click column header → **Create a filter**
- Click filter icon → select/deselect values to show/hide rows
- Useful for reviewing data by status, year, month, or other columns

**Freezing Panes (freeze rows/columns in place):**
- Select a row/column below/right of where you want freeze
- Click **View** → **Freeze** → choose option
- Useful to keep header row visible while scrolling

**Hiding/Unhiding Rows:**
- Right-click row number → **Hide** or **Show**
- Useful for archiving or filtering data

**Grouping Rows:**
- Select rows → **Data** → **Group rows**
- Useful for collapsing/expanding data sections

**Creating Pivot Tables:**
- Click **Data** → **Pivot table**
- Summarize data by Year, Status, Month, etc.
- Great for dashboards and reporting

---

### Troubleshooting Resources

- **Processed Files Log:** First place to check; shows which files succeeded/failed and why
- **GR Automation Perf sheet:** Check timing data to identify slow files
- **Apps Script Executions log:** Open Extensions → Apps Script → Executions tab; see errors
- **Script Properties:** Open Extensions → Apps Script → Project Settings; view run state
- **Drive temp folder:** Check "_GR_AUTOMATION_TEMP" for leftover converted sheets (sign of failed cleanup)

---

### Support & Escalation

If you encounter issues:
1. Check this manual's troubleshooting section
2. Run "Admin" → "Check Lookup & Output Setup" for diagnostics
3. Use "Admin" → "Test One Source File (Debug)" for detailed error logs
4. Review Apps Script Executions log for stack traces
5. Contact your technical support with error messages and file names

---

### Additional Resources

- **Full script source code:** Link to annotated code on GitHub/Gist (see below)
- **Google Apps Script documentation:** https://developers.google.com/apps-script
- **Google Sheets API reference:** https://developers.google.com/sheets/api

---

## External Resources

### Full Annotated Source Code

For developers who need the complete, well-commented source code:

**[Link to GitHub/Gist with full annotated gs-script-v10.gs]**

The external resource includes:
- Complete script with inline comments explaining each section
- Per-function documentation following the template in this manual
- Configuration options and tuning guide
- Known limitations and future improvements

---

### Script Reference Sheet

In your spreadsheet, look for the **"Script Reference"** sheet (tab at bottom). This sheet contains:
- Function names and purposes
- When each function is called (from which menu)
- Input/output parameters
- Common errors and fixes
- Related functions

Use this sheet as a quick lookup while using the system.

---

## Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | April 17, 2026 | Initial complete user manual |

---

**End of User Manual**

---

*This manual is a living document. As new features are added or improvements made, this manual will be updated. Check the Version History above for recent updates.*

