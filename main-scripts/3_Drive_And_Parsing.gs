// DRIVE AND PARSING
// Everything related to fetching files, checking permissions, and extracting data from sheets.

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
      if (typeof Drive !== "undefined" && Drive && Drive.Permissions) {
        var permsResp = Drive.Permissions.list(folder.getId());
        var items =
          (permsResp && permsResp.items) ||
          (permsResp && permsResp.permissions) ||
          [];
        var removed = 0;
        for (var pi = 0; pi < items.length; pi++) {
          var p = items[pi];
          if (!p || !p.type) continue;
          if (
            p.type === "anyone" ||
            p.type === "anyoneWithLink" ||
            (p.type === "domain" && p.role === "reader")
          ) {
            try {
              Drive.Permissions.remove(folder.getId(), p.id);
              removed++;
            } catch (e) {}
          }
        }
        if (removed > 0)
          Logger.log("Temp folder permissions cleaned: removed " + removed);
      }
    } catch (e) {}

    try {
      var fviewers = folder.getViewers();
      for (var vi = 0; vi < fviewers.length; vi++) {
        try {
          folder.removeViewer(fviewers[vi]);
        } catch (e) {}
      }
      var feditors = folder.getEditors();
      for (var ei = 0; ei < feditors.length; ei++) {
        try {
          folder.removeEditor(feditors[ei]);
        } catch (e) {}
      }
      try {
        folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      } catch (e) {}
    } catch (e) {}
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
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
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
    if (typeof file.getLastUpdated === "function")
      return toValidDate_(file.getLastUpdated());
  } catch (e) {}
  return toValidDate_(file.modifiedDate || file.modifiedTime || null);
}

function getFileDateCreatedSafe_(file) {
  if (!file) return null;
  try {
    if (typeof file.getDateCreated === "function")
      return toValidDate_(file.getDateCreated());
  } catch (e) {}
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
  for (var yi = 0; yi < years.length; yi++) yearsSet[years[yi]] = true;

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

// 🚀 INDESTRUCTIBLE WRAPPER: Handles API v3, v2, and Native DriveApp without crashing
function fetchDriveFilesWrapper_(folderId, sinceDate, maxLimit) {
  const allFiles = [];
  let success = false;

  if (typeof Drive !== "undefined" && Drive && Drive.Files) {
    let v3Query = "'" + folderId + "' in parents and trashed = false";
    let v2Query = v3Query;

    if (sinceDate instanceof Date && !isNaN(sinceDate.getTime())) {
      const dateString = Utilities.formatDate(
        sinceDate,
        "GMT",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
      );
      v3Query += " and modifiedTime >= '" + dateString + "'";
      v2Query += " and modifiedDate >= '" + dateString + "'";
    }

    let pageToken = null;
    let useV3 = true;

    do {
      let resp;
      if (useV3) {
        try {
          const params = {
            q: v3Query,
            pageSize: 1000,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            fields:
              "nextPageToken, files(id, name, modifiedTime, createdTime, webViewLink, alternateLink)",
          };
          if (pageToken) params.pageToken = pageToken;
          resp = Drive.Files.list(params); // Intentionally omitted orderBy to prevent Shared Drive bug
          const items = resp.files || [];
          for (let i = 0; i < items.length; i++) {
            allFiles.push(normalizeDriveApiFileItem_(items[i]));
            if (maxLimit && allFiles.length >= maxLimit) return allFiles;
          }
          pageToken = resp.nextPageToken;
          success = true;
        } catch (e) {
          useV3 = false;
          pageToken = null;
          allFiles.length = 0;
        }
      }

      if (!useV3 && !success) {
        try {
          const params = {
            q: v2Query,
            maxResults: 1000,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          };
          if (pageToken) params.pageToken = pageToken;
          resp = Drive.Files.list(params); // Intentionally omitted orderBy to prevent Shared Drive bug
          const items = resp.items || [];
          for (let i = 0; i < items.length; i++) {
            allFiles.push(normalizeDriveApiFileItem_(items[i]));
            if (maxLimit && allFiles.length >= maxLimit) return allFiles;
          }
          pageToken = resp.nextPageToken;
          success = true;
        } catch (e2) {
          success = false;
          break; // Break loop to force native fallback
        }
      }
    } while (pageToken);

    if (success)
      return allFiles.filter(function (f) {
        return f && f.id;
      });
  }

  // Native DriveApp Fallback
  Logger.log("Drive API failed. Falling back to native fast-search.");
  try {
    const folder = DriveApp.getFolderById(folderId);
    let query = "trashed = false";
    if (sinceDate instanceof Date && !isNaN(sinceDate.getTime())) {
      const dateString = Utilities.formatDate(
        sinceDate,
        "GMT",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
      );
      query += " and modifiedDate >= '" + dateString + "'";
    }
    const files = folder.searchFiles(query);
    while (files.hasNext()) {
      const f = files.next();
      allFiles.push({
        id: f.getId(),
        name: f.getName(),
        url: f.getUrl(),
        createdDate: f.getDateCreated(),
        modifiedDate: f.getLastUpdated(),
      });
      if (maxLimit && allFiles.length >= maxLimit) break;
    }
  } catch (e3) {
    Logger.log("Native DriveApp fallback failed: " + e3.message);
  }

  return allFiles;
}

function listSourceFilesFull_(sourceFolder) {
  if (!sourceFolder) return [];
  const maxInspect = Math.max(0, Number(CONFIG.fullScanMaxFilesToInspect) || 0);
  const limit = maxInspect > 0 ? maxInspect : null;
  const files = fetchDriveFilesWrapper_(sourceFolder.getId(), null, limit);

  // Sort in memory to bypass Google API sorting bugs
  files.sort(function (a, b) {
    const tA = a.modifiedDate ? a.modifiedDate.getTime() : 0;
    const tB = b.modifiedDate ? b.modifiedDate.getTime() : 0;
    return tB - tA;
  });
  return files;
}

function listSourceFilesIncremental_(sourceFolder, sinceDate) {
  if (!sourceFolder) return [];
  const maxInspect = Math.max(
    1,
    Number(CONFIG.incrementalScanMaxFilesToInspect) || 2000,
  );
  const files = fetchDriveFilesWrapper_(
    sourceFolder.getId(),
    sinceDate,
    maxInspect,
  );

  // Sort in memory to bypass Google API sorting bugs
  files.sort(function (a, b) {
    const tA = a.modifiedDate ? a.modifiedDate.getTime() : 0;
    const tB = b.modifiedDate ? b.modifiedDate.getTime() : 0;
    return tB - tA;
  });
  return files;
}

function hasSourceChanged_(sourceFolder, sinceDate) {
  if (!sourceFolder) return true;
  try {
    const files = fetchDriveFilesWrapper_(sourceFolder.getId(), sinceDate, 1);
    return files.length > 0;
  } catch (e) {
    Logger.log("hasSourceChanged_ error: " + e.message);
    return true; // Fail safe
  }
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
  const fullEveryRuns = Math.max(
    1,
    Number(CONFIG.forceFullScanEveryRuns) || 30,
  );
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
    if (!sinceDate)
      sinceDate = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
    sinceDate = new Date(sinceDate.getTime() - overlapMinutes * 60 * 1000);

    try {
      const changed = hasSourceChanged_(sourceFolder, sinceDate);
      if (!changed) {
        mode = "incremental-skip";
        files = [];
      } else {
        files = listSourceFilesIncremental_(sourceFolder, sinceDate);
      }
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
      DriveApp.getFileById(copied.id).moveTo(tempFolder);
    } catch (e) {}
    try {
      ensureFileRestricted_(copied.id);
    } catch (e) {}
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
        DriveApp.getFileById(copiedFallback.id).moveTo(tempFolder);
      } catch (e) {}
      try {
        ensureFileRestricted_(copiedFallback.id);
      } catch (e) {}
      return copiedFallback.id;
    } catch (e2) {
      const errMsg2 = ((e2 && e2.message) || "").toLowerCase();
      if (
        errMsg2.indexOf("request too large") !== -1 ||
        errMsg2.indexOf("413") !== -1
      )
        throw new Error("NON_RETRIABLE_TOO_LARGE: Request Too Large");
      if (
        errMsg2.indexOf("internal error") !== -1 ||
        (errMsg2.indexOf("drive.files.copy") !== -1 &&
          errMsg2.indexOf("failed") !== -1)
      )
        throw new Error("Needs manual check - unsupported format");
      throw e2;
    }
  }
}

function ensureFileRestricted_(fileId) {
  if (!fileId) return;
  try {
    if (typeof Drive !== "undefined" && Drive && Drive.Permissions) {
      var permsResp = Drive.Permissions.list(fileId);
      var items =
        (permsResp && permsResp.items) ||
        (permsResp && permsResp.permissions) ||
        [];
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
          } catch (e) {}
        }
      }
      if (removed > 0)
        Logger.log("Temp file permissions cleaned: removed " + removed);
    }
  } catch (e) {}

  try {
    var f = DriveApp.getFileById(fileId);
    var viewers = [];
    var editors = [];
    try {
      viewers = f.getViewers();
      editors = f.getEditors();
    } catch (e) {}
    for (var vi = 0; vi < viewers.length; vi++) {
      try {
        f.removeViewer(viewers[vi]);
      } catch (e) {}
    }
    for (var ei = 0; ei < editors.length; ei++) {
      try {
        f.removeEditor(editors[ei]);
      } catch (e) {}
    }
    try {
      f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    } catch (e) {}
  } catch (e) {}
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
      } catch (e) {
        Logger.log("Skipping unnamed/problem sheet (" + e.message + ")");
        continue;
      }
      if (seenNames[nm]) continue;
      seenNames[nm] = true;
      let candidate = null;
      try {
        candidate = evaluateSheetCandidate_(sh, fileName, false);
      } catch (e) {
        Logger.log(
          'Skipping sheet "' + nm + '" in parse loop (' + e.message + ")",
        );
        continue;
      }
      if (!candidate) continue;
      if (candidate.preferred) preferredCandidates.push(candidate);
      else fallbackCandidates.push(candidate);
    }
  } catch (e) {
    Logger.log(
      "Could not enumerate all sheets for " + fileName + " (" + e.message + ")",
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
      if (CONFIG.useNumberFormatCurrencyHints)
        fmts = sh.getRange(1, 1, lastRow, lastCol).getNumberFormats();
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
  const scanLimit = Math.min(rawRow.length, 4);

  for (let i = 0; i < scanLimit; i++) {
    const raw = String(rawRow[i] || "")
      .replace(/\u00a0/g, " ")
      .trim();
    const d = String(disp[i] || "")
      .replace(/\u00a0/g, " ")
      .trim();
    const cell = normalizeText_(d !== "" ? d : raw);

    if (!cell) continue;
    if (cell === "total" || cell === "total:") return true;

    for (let k = 0; k < SUMMARY_KEYWORDS.length; k++) {
      if (cell.indexOf(SUMMARY_KEYWORDS[k]) !== -1) return true;
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
  } catch (e) {}
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
