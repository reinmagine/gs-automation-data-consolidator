// This file contains the core execution logic and time-based triggers.
// Triggers
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
    } catch (e) {}
    try {
      if (gotScriptLock) lock.releaseLock();
    } catch (e) {}
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

    const trackerData = loadAllTrackerData_(ss);
    const processedMap = trackerData.processedMap;
    const doneKeyMap = trackerData.doneKeyMap;
    const failedAttemptsMap = trackerData.failedAttemptsMap;

    const scanState = listSourceFilesForScan_(sourceFolder, scriptProps);
    scriptProps.setProperty(
      "LAST_RUN_SCAN_MODE",
      scanState.mode +
        (scanState.sinceIso ? " (since " + scanState.sinceIso + ")" : ""),
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
    } catch (e) {}
    if (lock) lock.releaseLock();
  }
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
    } catch (e) {}
    try {
      if (gotScriptLock) lock.releaseLock();
    } catch (e) {}
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

    const trackerData = loadAllTrackerData_(ss);
    const processedMap = trackerData.processedMap;
    const doneKeyMap = trackerData.doneKeyMap;
    const failedAttemptsMap = trackerData.failedAttemptsMap;

    const scanState = listSourceFilesForScan_(sourceFolder, scriptProps, {
      forceFull: true,
    });
    const candidates = listCandidateFilesByYear_(
      scanState.files,
      processedMap,
      failedAttemptsMap,
    );

    if (!candidates || !candidates[year] || candidates[year].length === 0) {
      return (
        "No candidate files found for " +
        year +
        " (scan mode: " +
        scanState.mode +
        ")"
      );
    }

    const toProcess = candidates[year].slice(0, CONFIG.maxFilesPerRunPerYear);
    const tempFolder = getOrCreateTempFolder_();

    let processedCount = 0;
    let totalRowsAdded = 0;

    for (let i = 0; i < toProcess.length; i++) {
      if (Date.now() - startTime > CONFIG.maxRuntimeMs) break;

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
    } catch (e) {}
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

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
      return { rowsAdded: 0, status: timings.status, timings: timings };
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
      msgLower.indexOf("needs manual check - file too large") !== -1 ||
      msgLower.indexOf("request too large") !== -1 ||
      msgLower.indexOf("413") !== -1
    ) {
      timings.status = "Needs manual check - file too large";
      return { rowsAdded: 0, status: timings.status, timings: timings };
    }

    if (
      msgLower.indexOf("needs manual check - unsupported format") !== -1 ||
      msgLower.indexOf("conversion of the uploaded content") !== -1 ||
      (msgLower.indexOf("drive.files.copy") !== -1 &&
        msgLower.indexOf("internal error") !== -1)
    ) {
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
    const trackerData = loadAllTrackerData_(ss);
    const processedMap = trackerData.processedMap;
    const failedAttemptsMap = trackerData.failedAttemptsMap;
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
      } catch (e) {}
    }
  }
}

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
