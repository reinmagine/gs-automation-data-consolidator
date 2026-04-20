# GR Consolidation Project - Complete Documentation Package
## Getting Started Guide

**Version:** 1.0 | **Date:** April 17, 2026

---

## What You've Received

This is a **complete, production-ready documentation package** for the GR Template Automation Consolidator system. It includes:

### 4 Complete Documentation Files

1. **USER_MANUAL_GR_CONSOLIDATION.md** (80+ pages)
   - For: Non-technical end users, business users, system operators
   - What: Complete step-by-step guide to installing, configuring, and using the system
   - Where: `docs/USER_MANUAL_GR_CONSOLIDATION.md`
   - Best for: Someone new to the system who needs to know "how to click this button"

2. **ANNOTATED_CODE_GUIDE.md** (50+ pages)
   - For: Developers, technical leads, system administrators
   - What: Deep technical explanation of how the script works internally
   - Where: `docs/ANNOTATED_CODE_GUIDE.md`
   - Best for: Someone who needs to understand, modify, or debug the code

3. **SCRIPT_REFERENCE.csv** (Spreadsheet-importable)
   - For: Quick reference for any audience
   - What: Structured per-function documentation (110+ functions)
   - Where: `docs/SCRIPT_REFERENCE.csv`
   - Best for: Quick lookup of a specific function's purpose, inputs, outputs, and common errors
   - How to use: Import into a "Script Reference" sheet in your bound spreadsheet

4. **README_UPDATED.md** (Project Overview)
   - For: Anyone (technical summary)
   - What: Project overview, architecture, quick start, troubleshooting quick reference
   - Where: `README_UPDATED.md`
   - Best for: Getting oriented quickly; links to detailed docs

---

## Quick Navigation

### "I'm an end user. I just want to use this system."
→ **Start with [USER_MANUAL_GR_CONSOLIDATION.md](./docs/USER_MANUAL_GR_CONSOLIDATION.md)**
- Read: "Quick Start" section (5 minutes)
- Then: "Your First Run Walkthrough" (15 minutes)
- Then: "Understanding the GR Automation Menu" (30 minutes)
- Refer to: "Troubleshooting" section as needed

### "I'm a developer. I need to understand the code."
→ **Start with [ANNOTATED_CODE_GUIDE.md](./docs/ANNOTATED_CODE_GUIDE.md)**
- Read: "Code Organization" and "Architecture Diagram"
- Study: "Major Code Sections" with pseudocode
- Follow: "Data Flow Walkthrough" example
- Reference: "Caching & Performance" section for optimization

### "I need to configure/troubleshoot something."
→ **Start with [README_UPDATED.md](./README_UPDATED.md)**
- Check: "Configuration" section
- Review: "Troubleshooting" quick reference table
- Then: Refer to specific section in user manual

### "I need to look up a specific function."
→ **Use [SCRIPT_REFERENCE.csv](./docs/SCRIPT_REFERENCE.csv)**
- Open in spreadsheet
- Search for function name
- Find: Purpose, inputs, outputs, errors, related functions
- Or: Import into "Script Reference" sheet in your bound spreadsheet for in-sheet lookup

---

## Documentation Package Contents

```
docs/
├── USER_MANUAL_GR_CONSOLIDATION.md
│   ├── Table of Contents (15 sections)
│   ├── Quick Start (5 min)
│   ├── Installation & Permissions (detailed steps with image placeholders)
│   ├── Configuration Explained (all CONFIG fields documented)
│   ├── First Run Walkthrough (complete example)
│   ├── Understanding the Menu (every action explained)
│   ├── Processing Files – Step by Step (detailed workflow)
│   ├── Working with Processed Files Log (interpretation guide)
│   ├── Using Backfill & Repair Tools (preview vs apply)
│   ├── Setting Up Automation (auto-triggers & monitoring)
│   ├── Understanding Dashboard (metrics overview)
│   ├── Troubleshooting Common Issues (20+ scenarios with fixes)
│   ├── Maintenance & Cleanup (regular tasks)
│   ├── How the Script Works (technical overview)
│   ├── Appendix: Script Reference & Functions (summary of all functions)
│   └── Appendix: Glossary & Reference (terminology)
│
├── ANNOTATED_CODE_GUIDE.md
│   ├── Code Organization (folder structure)
│   ├── Configuration & Constants (CONFIG, COLUMN_MAPPING, aliases)
│   ├── Architecture Diagram (visual system design)
│   ├── Major Code Sections (organized by function)
│   │   ├── Main Orchestrator (consolidateGRTemplateData)
│   │   ├── File Processing Pipeline (processSingleFile_)
│   │   ├── Header Detection & Mapping
│   │   ├── Row Extraction & Filtering
│   │   ├── Enrichment & Currency Conversion
│   │   └── Tracker & Idempotency
│   ├── Data Flow Walkthrough (complete example with comments)
│   ├── Caching & Performance (optimization strategies)
│   ├── Error Handling Patterns (3 patterns with examples)
│   ├── Testing & Debugging (tools and approaches)
│   ├── Future Improvements (6 enhancement ideas)
│   └── Quick Reference (categories and functions)
│
├── SCRIPT_REFERENCE.csv
│   └── 110+ rows with columns:
│       ├── Function Name
│       ├── Category (Main Processing, File Processing, etc.)
│       ├── Purpose (1 line)
│       ├── Invoked By (menu/function/trigger)
│       ├── Input Parameters (types and meanings)
│       ├── Output/Returns (types and meanings)
│       ├── Side Effects (what changes in the system)
│       ├── Errors & Fixes (common issues and solutions)
│       ├── Related Functions (cross-references)
│       └── Notes (implementation details)
│
└── GETTING_STARTED.md (this file)
    └── Navigation guide, structure explanation
```

---

## How to Use This Documentation

### For Installation & Setup
1. Read: User Manual → "Quick Start" (5 min)
2. Follow: User Manual → "Installation & Permissions" (step-by-step)
3. Verify: User Manual → "Your First Run Walkthrough"
4. Reference: README → "Configuration"

### For Daily Operations
1. Bookmark: User Manual → "Understanding the GR Automation Menu" (all menu actions explained)
2. Reference: User Manual → "Troubleshooting Common Issues" (when something seems wrong)
3. Use: Script Reference CSV (when you need function details)

### For System Administration
1. Study: README → "Processing Details" (how it works)
2. Learn: User Manual → "Setting Up Automation & Auto-Processing" (triggers)
3. Monitor: User Manual → "Understanding the Dashboard Overview"
4. Maintain: User Manual → "Maintenance & Cleanup"

### For Development & Debugging
1. Understand: Annotated Code Guide → "Architecture Diagram"
2. Follow: Annotated Code Guide → "Data Flow Walkthrough" (example)
3. Study: Annotated Code Guide → "Major Code Sections"
4. Reference: Script Reference CSV (function details)
5. Implement: Annotated Code Guide → "Future Improvements"

---

## Key Concepts Explained

### Consolidation Workflow
**File Upload** → **Conversion** → **Parsing** → **Enrichment** → **Append** → **Logging** → **Cleanup**

See: User Manual → "Processing Files – Step by Step" for detailed walkthrough

### What Happens Behind the Scenes
1. Your Excel files are converted to temporary Google Sheets (using Drive API)
2. Headers are detected using fuzzy matching with aliases
3. Rows are extracted with intelligent filtering (removes summaries, merged cells, etc.)
4. Data is enriched by looking up PLA locations and converting currency
5. Rows are appended to output sheets with source file hyperlinks
6. Results are logged in the tracker for audit trail
7. Temporary files are deleted from Drive

See: Annotated Code Guide → "Data Flow Walkthrough" for technical details

### Processing Limits
- Max 6 files per run (across all years)
- Max 3 files per year per run
- Max 2 minutes per run (to avoid 6-minute timeout)
- Skips files >10 MB
- Skips files with >5 failed attempts

Why limits? See: User Manual → "How the Script Works (Technical Overview)"

### Idempotency
The system prevents duplicate processing using 6 different matching keys per file:
1. Raw filename
2. Normalized filename
3. Drive file ID
4. Drive file ID (alternate format)
5. Normalized file URL
6. File URL (query params removed)

See: Annotated Code Guide → "Tracker & Idempotency"

---

## Configuration Examples

### Default Configuration
```javascript
const CONFIG = {
  sourceFolderName: "GR template with Matdoc Reference: (File responses)",
  tempFolderName: "_GR_AUTOMATION_TEMP",
  trackerSheetName: "Processed Files Log",
  outputSheets: { 2025: "GR Posted 2025", 2026: "GR Posted 2026" },
  usdConversionRate: 57,
  maxFilesPerRunTotal: 6,
  maxFilesPerRunPerYear: 3,
  maxRuntimeMs: 120000,
  // ... 10+ more settings
};
```

### Common Changes

**Add a new year:**
```javascript
outputSheets: { 2025: "GR Posted 2025", 2026: "GR Posted 2026", 2027: "GR Posted 2027" }
// Then create a "GR Posted 2027" sheet in your spreadsheet
```

**Update USD conversion rate:**
```javascript
usdConversionRate: 58  // was 57
// Then run: GR Automation → GR Posted Sheets → Recompute USD for All Rows
```

**Increase batch size:**
```javascript
maxFilesPerRunTotal: 10  // was 6
maxFilesPerRunPerYear: 5  // was 3
```

See: User Manual → "Configuration Explained" for all options

---

## Troubleshooting Quick Reference

| Problem | Check | Solution |
|---------|-------|----------|
| Menu not appearing | Installation | Run `onOpen()` in Apps Script |
| "File too large" | File size | Split Excel file (< 10 MB) |
| "No data extracted" | File format | Check headers match expected columns |
| Permission denied | API setup | Enable Google Drive API |
| Blank enrichment | PLA Lookup | Populate PLA Lookup sheet |
| Wrong USD amounts | Rate | Update `CONFIG.usdConversionRate` |
| Slow processing | Performance | Check file count, size limits |

See: User Manual → "Troubleshooting Common Issues" for 20+ detailed scenarios

---

## Recommended Reading Order

### For New Users (Non-Technical)
1. **README_UPDATED.md** — 10 min overview
2. **USER_MANUAL_GR_CONSOLIDATION.md** → Quick Start — 5 min
3. **USER_MANUAL_GR_CONSOLIDATION.md** → Installation & Permissions — 20 min
4. **USER_MANUAL_GR_CONSOLIDATION.md** → Your First Run Walkthrough — 15 min
5. **USER_MANUAL_GR_CONSOLIDATION.md** → Understanding the Menu — 30 min
6. **Bookmark:** Troubleshooting section for reference

**Total Time:** ~1 hour to proficiency

### For Developers/Technical Staff
1. **README_UPDATED.md** → System Architecture — 10 min
2. **ANNOTATED_CODE_GUIDE.md** → Code Organization & Architecture Diagram — 15 min
3. **ANNOTATED_CODE_GUIDE.md** → Data Flow Walkthrough — 20 min
4. **ANNOTATED_CODE_GUIDE.md** → Major Code Sections — 30 min
5. **SCRIPT_REFERENCE.csv** — Import and use for lookup

**Total Time:** ~1.5 hours to deep understanding

### For Administrators (Setup & Operations)
1. **README_UPDATED.md** — 15 min overview
2. **USER_MANUAL_GR_CONSOLIDATION.md** → Configuration Explained — 20 min
3. **USER_MANUAL_GR_CONSOLIDATION.md** → Setting Up Automation — 20 min
4. **USER_MANUAL_GR_CONSOLIDATION.md** → Maintenance & Cleanup — 15 min
5. **USER_MANUAL_GR_CONSOLIDATION.md** → Troubleshooting — 20 min

**Total Time:** ~1.5 hours to operational proficiency

---

## Quick Links

| Document | Location | Use Case |
|----------|----------|----------|
| **User Manual** | `docs/USER_MANUAL_GR_CONSOLIDATION.md` | Complete guide (80+ pages) |
| **Code Guide** | `docs/ANNOTATED_CODE_GUIDE.md` | Technical deep-dive (50+ pages) |
| **Script Reference** | `docs/SCRIPT_REFERENCE.csv` | Function lookup (110+ functions) |
| **Project README** | `README_UPDATED.md` | Overview & quick start |
| **Getting Started** | This file | Navigation & orientation |

---

## What's New in v10

This version introduces several new features and performance improvements:

### New Features

- **Admin → Cleanup Duplicates (Preview/Now)** — Detect and remove duplicate rows across tracker and output sheets. Preview first to verify what would be deleted; then apply (with backup recommended).

- **Processing → Process Files for Year...** — Modal dialog to process only files from a specific year, with option to add new years to the system configuration and create sheets in the bound spreadsheet.

- **GR Automation Config Sheet** (optional) — Advanced feature for routing different years to different spreadsheets (requires manual sheet creation and configuration).

- **Auto-Processing Status Monitoring** — View detailed run state: timestamps, file counts, next run ETA, and processing stage via "Automation → Show Auto Processing Status".

### Performance Improvements

- Reduced default processing limits (max 6 files/run, 3 per year, 120s timeout) for better reliability
- New fast-path for sheets named "GR TEMPLATE" (skips scoring other tabs)
- Respects hidden/filtered rows by default (configurable)
- In-memory caching for config and PLA lookups
- Optimized row scanning (limits: max 2,500 rows, 45 columns per sheet)

See: User Manual → "Configuration Explained" for all new settings

---

## Documentation Checklist

- [x] Installation steps with image placeholders
- [x] Complete menu walkthrough (every button explained)
- [x] Configuration guide (all fields documented)
- [x] First run example walkthrough
- [x] Backfill & repair tools guide
- [x] Automation setup & monitoring
- [x] Dashboard overview
- [x] 20+ troubleshooting scenarios with fixes
- [x] Maintenance procedures
- [x] Technical architecture explanation
- [x] Complete data flow example
- [x] Caching & performance strategies
- [x] Error handling patterns
- [x] 110+ function reference documentation
- [x] Code organization explanation
- [x] Future improvement suggestions

---

## Learning Resources Included

### For Understanding the System
- Architecture diagram (visual)
- Data flow walkthrough (detailed example)
- Step-by-step processing explanation
- Troubleshooting decision tree

### For Using the System
- Installation walkthrough
- Configuration guide
- Menu action guide (every button)
- Common tasks (how-to)
- Backfill & repair tool guide

### For Troubleshooting
- 20+ issue scenarios with solutions
- Diagnostic tools (debug, setup check)
- Error messages explained
- Quick reference table

### For Development
- Code organization guide
- Architecture diagram
- Major functions with pseudocode
- Caching strategies
- Error handling patterns
- Future enhancement ideas

---

## Notes on Image Placeholders

Throughout the User Manual, you'll see placeholders like:

```
[IMAGE PLACEHOLDER: Screenshot of GR Automation menu]
```

**These are intentional.** To add actual screenshots:

1. Capture screenshots as you use the system
2. Save in a folder (e.g., `docs/images/`)
3. Replace placeholders with actual image references
4. If using Google Doc, embed images directly

**Example files to capture:**
- GR Automation menu (dropdown with submenus)
- Apps Script editor with code
- Processed Files Log sheet sample
- GR Posted 2025 sheet sample
- Automation trigger in Apps Script
- Auto-processing status modal
- Backfill preview dialog

---

## Next Steps

### To Deploy This System

1. Read the README (10 min)
2. Read "Quick Start" in User Manual (5 min)
3. Follow "Installation & Permissions" steps (20 min)
4. Complete "Your First Run Walkthrough" (15 min)
5. Test with sample Excel file (15 min)
6. Share User Manual with team
7. Train team on menu actions (30 min)
8. Upload real Excel files and process (30 min)
9. Enable auto-triggers (5 min)
10. Monitor first week of runs

**Total deployment time:** ~2–3 hours

### To Extend/Modify the System

1. Read Annotated Code Guide (1 hour)
2. Review major functions (30 min)
3. Study data flow example (30 min)
4. Identify changes needed
5. Reference Script Reference CSV for functions
6. Implement changes
7. Test thoroughly
8. Update documentation

---

## Support & Help

### Getting Help
1. **Check documentation** (start with "Troubleshooting" section)
2. **Run diagnostics** (Admin → "Check Lookup & Output Setup")
3. **Test single file** (Admin → "Test One Source File (Debug)")
4. **Review logs** (Extensions → Apps Script → Executions)
5. **Contact team lead** with error message and steps

### Reporting Issues
Include:
- Error message (from Executions log)
- File name and size
- Steps to reproduce
- Expected vs. actual result
- Screenshot if applicable

---

## Success Criteria

You'll know the system is working when:
- Menu appears in spreadsheet
- First Excel file processes successfully
- Row appears in Processed Files Log with "Done" status
- Data appears in "GR Posted 2025" (or appropriate year sheet)
- Source File hyperlink is clickable
- Enrichment columns (Region, Territory, USD) are populated
- Auto-trigger runs every minute (if enabled)
- Dashboard shows increasing file count

---

## Documentation Structure Summary

```
Documentation Package
├── README_UPDATED.md (Project overview)
│   └─ Quick ref, architecture, troubleshooting table
│
├── USER_MANUAL_GR_CONSOLIDATION.md (80+ pages)
│   ├─ Quick Start (5 min)
│   ├─ Installation (step-by-step)
│   ├─ Configuration (all fields explained)
│   ├─ First Run (complete walkthrough)
│   ├─ Menu Guide (every button)
│   ├─ Processing (workflow explained)
│   ├─ Tracker (how to read it)
│   ├─ Backfill Tools (before/after)
│   ├─ Automation (triggers & monitoring)
│   ├─ Dashboard (metrics overview)
│   ├─ Troubleshooting (20+ scenarios)
│   ├─ Maintenance (tasks & schedules)
│   ├─ Technical Overview (how it works)
│   └─ Appendix (functions, glossary)
│
├── ANNOTATED_CODE_GUIDE.md (50+ pages)
│   ├─ Code Organization (structure)
│   ├─ Configuration & Constants (what controls what)
│   ├─ Architecture (visual diagram)
│   ├─ Major Sections (organized by category)
│   ├─ Data Flow Example (complete walkthrough)
│   ├─ Caching Strategies (performance)
│   ├─ Error Handling (patterns)
│   ├─ Testing (approaches)
│   ├─ Future Ideas (enhancements)
│   └─ Quick Ref (categories & functions)
│
└── SCRIPT_REFERENCE.csv (110+ functions)
    └─ Name, Purpose, Inputs, Outputs, Errors, Related, Notes
```

---

## by the Numbers

| Metric | Value |
|--------|-------|
| Total Documentation Pages | 150+ |
| User Manual | 80+ pages |
| Code Guide | 50+ pages |
| Functions Documented | 110+ |
| Troubleshooting Scenarios | 20+ |
| Code Examples | 15+ |
| Architecture Diagrams | 2 |
| Menu Actions Explained | 20+ |
| Configuration Options | 15+ |

---

## Final Notes

This documentation package is designed to:

- **Get new users productive in < 1 hour**
- **Help developers understand the codebase in < 2 hours**
- **Provide quick reference for experienced users**
- **Enable troubleshooting independently**
- **Support future development & enhancement**
- **Serve as a knowledge base for the organization**

**Start with the README, then choose your path based on your role.**

---

**Questions?** Refer to the appropriate documentation section or contact your team lead.

**Last Updated:** April 17, 2026  
**Next Review:** October 17, 2026

