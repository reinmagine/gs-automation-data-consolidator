# GR Template Automation Consolidator

**Version:** 1.0.1 | **Last Updated:** May 29, 2026

A Google Apps Script automation system for consolidating Goods Receipt (GR) data from multiple Excel files into unified, Google Sheets.

## Recent changes

- Refactored repository: legacy single-file scripts were moved into `backups/` and the active codebase was split into four modular files under the `main-scripts/` directory.
- Added CLI deployment configuration for Google Apps Script using `clasp`. The project is configured to sync `main-scripts/` with the Apps Script project `scriptId: 1GO8CYqTAtwPMgVCxFn7lbeVr1nP3ZYSQU8XiVdPKHBcmwWENdvpWf6t4`.
- Added `appsscript.json` (minimal manifest), `.clasp.json`, `.claspignore`, and `package.json` with `@google/clasp` dev tooling. These files allow pushing and pulling source to the Apps Script editor without manual copy/paste.

This README retains the original project overview and documentation links below. See `docs/` for full user and developer guides.

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
   - Copy-paste the full content of `scripts/gs-script-v11.gs`
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

# GR Template Automation Consolidator

Lightweight portfolio summary for the consolidation project.

Summary

- Purpose: Consolidate GR (Goods Receipt) Excel templates from a Drive folder into Google Sheets.
- Implementation: Google Apps Script split into modular files under the `main-scripts/` folder.
- Sync: Configured for `clasp` with `main-scripts` as the local root; manifest preserved in `main-scripts/appsscript.json`.

Key files

- main-scripts/1_Config_And_Menu.gs
- main-scripts/2_Main_Triggers.gs
- main-scripts/3_Drive_And_Parsing.gs
- main-scripts/4_Tracker_And_Sheets.gs
- backups/ (legacy single-file scripts kept for reference)

Quick notes for developers

- To work locally: run

```powershell
npm install
npx @google/clasp login
npx @google/clasp push
```

- `main-scripts/` is the `clasp` root; push/pull will sync with the Apps Script project.
- Recent change (2026-06-03): added an early-exit optimization to skip incremental scanning when no new/modified source files are detected.

If you want me to run the `clasp` push or open the Apps Script project, tell me and I will continue.
