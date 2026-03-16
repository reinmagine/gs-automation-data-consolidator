// GR TEMPLATE CONSOLIDATION - VERSION 1

const CONFIG = {
  folderName: "GR template with Matdoc Reference: (File responses)",
  trackerSheetName: "Processed Files Log",
  outputSheets: {
    2025: "GR Posted 2025",
    2026: "GR Posted 2026"
  }
};

const COLUMN_MAPPING = [
  "B", "J", "K", "L", "M", "N", "O", "P", "T", "U", "W", "X", "Y", "Z", 
  "AA", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ"
];

function consolidateGRTemplateData() {
  Logger.log("Starting consolidation...");
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    getOrCreateTrackerSheet(spreadsheet);
    
    for (const year in CONFIG.outputSheets) {
      getOrCreateOutputSheet(spreadsheet, CONFIG.outputSheets[year]);
    }
    
    const processedFiles = getProcessedFiles(spreadsheet);
    Logger.log("Already processed: " + processedFiles.length);
    
    const folder = findFolder(CONFIG.folderName);
    if (!folder) {
      showError("Folder not found: " + CONFIG.folderName);
      return;
    }
    
    const allFiles = [];
    const iterator = folder.getFilesByType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    while (iterator.hasNext()) {
      allFiles.push(iterator.next());
    }
    
    Logger.log("Total files: " + allFiles.length);
    
    const filteredFiles = allFiles.filter(file => {
      const name = file.getName();
      return (name.toUpperCase().includes("GR TEMPLATE") || name.toUpperCase().includes("GRD_EFB")) &&
             (name.includes("2025") || name.includes("2026"));
    });
    
    Logger.log("Files to process: " + filteredFiles.length);
    
    let totalRows = 0;
    let filesProcessed = 0;
    let filesFailed = 0;
    
    for (let i = 0; i < filteredFiles.length; i++) {
      const file = filteredFiles[i];
      const fileId = file.getId();
      const fileName = file.getName();
      
      if (processedFiles.includes(fileId)) {
        continue;
      }
      
      Logger.log("Processing " + (i+1) + "/" + filteredFiles.length + ": " + fileName.substring(0, 60));
      
      try {
        const year = fileName.includes("2026") ? 2026 : 2025;
        const sheetName = CONFIG.outputSheets[year];
        const outputSheet = spreadsheet.getSheetByName(sheetName);
        
        // Extract data from Excel file
        const data = extractExcelData(file);
        
        if (data && data.length > 0) {
          for (let j = 0; j < data.length; j++) {
            outputSheet.appendRow(data[j]);
          }
          totalRows += data.length;
          filesProcessed++;
          markFileAsProcessed(spreadsheet, fileId, fileName, year);
          Logger.log("Added " + data.length + " rows");
        } else {
          Logger.log("No data extracted");
          filesFailed++;
        }
        
      } catch (error) {
        Logger.log("Error: " + error.toString());
        filesFailed++;
      }
      
      Utilities.sleep(1200);
    }
    
    const message = "Consolidation Complete!\nFiles processed: " + filesProcessed + "\nRows added: " + totalRows + "\nFailed: " + filesFailed;
    Logger.log(message);
    showAlert(message);
    
  } catch (error) {
    Logger.log("Fatal: " + error.toString());
    showError(error.toString());
  }
}

/**
 * Extract data from Excel file by converting to Google Sheets
 * Skip rows 1-4, start from row 5 (index 4)
 */
function extractExcelData(excelFile) {
  let tempSheetId = null;
  
  try {
    Logger.log("Converting Excel to Google Sheets...");
    
    // Use Drive API to convert Excel file to Google Sheets
    const mimeType = "application/vnd.google-apps.spreadsheet";
    const tempResource = {
      title: "TEMP_" + Date.now(),
      mimeType: mimeType
    };
    
    // Convert the file
    const converted = Drive.Files.copy(tempResource, excelFile.getId());
    tempSheetId = converted.id;
    
    Logger.log("Converted to Google Sheets: " + tempSheetId);
    
    // Open the converted Google Sheet
    const tempSheet = SpreadsheetApp.openById(tempSheetId);
    
    // Find the "GR Template" sheet
    let grSheet = null;
    const sheets = tempSheet.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().toLowerCase().includes("gr template")) {
        grSheet = sheets[i];
        Logger.log("Found GR Template sheet");
        break;
      }
    }
    
    if (!grSheet) {
      Logger.log("GR Template sheet not found");
      // Delete temp sheet via Drive
      DriveApp.getFileById(tempSheetId).setTrashed(true);
      return null;
    }
    
    // Get all data
    const dataRange = grSheet.getDataRange();
    const values = dataRange.getValues();
    
    Logger.log("Total rows in sheet: " + values.length);
    
    if (values.length < 5) {
      Logger.log("Not enough rows");
      DriveApp.getFileById(tempSheetId).setTrashed(true);
      return null;
    }
    
    // Extract required columns
    // Start from row 5 (index 4), skip rows 1-4
    const extractedRows = [];
    
    for (let rowIndex = 4; rowIndex < values.length; rowIndex++) {
      const row = values[rowIndex];
      const extractedRow = [];
      
      // Extract each required column
      for (let c = 0; c < COLUMN_MAPPING.length; c++) {
        const colLetter = COLUMN_MAPPING[c];
        const colIndex = getColumnIndex(colLetter);
        
        const value = (colIndex < row.length) ? row[colIndex] : "";
        extractedRow.push(value);
      }
      
      // Only add rows with data
      const hasData = extractedRow.some(cell => cell !== null && cell !== undefined && cell !== "");
      if (hasData) {
        extractedRows.push(extractedRow);
      }
    }
    
    Logger.log("Extracted " + extractedRows.length + " data rows");
    
    // Delete temp sheet via Drive API
    DriveApp.getFileById(tempSheetId).setTrashed(true);
    Logger.log("Cleaned up temp sheet");
    
    return extractedRows.length > 0 ? extractedRows : null;
    
  } catch (error) {
    Logger.log("Error in extractExcelData: " + error.toString());
    
    // Cleanup on error
    if (tempSheetId) {
      try {
        DriveApp.getFileById(tempSheetId).setTrashed(true);
      } catch (e) {
        Logger.log("Cleanup error: " + e.toString());
      }
    }
    
    return null;
  }
}

/**
 * Convert column letter to index (A=0, B=1, etc.)
 */
function getColumnIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1;
}

function getOrCreateOutputSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    const headers = [
      "Acceptance Date (PAC/FAC)", "PO No.", "PO Item No.", "PO Service Item No.",
      "Material Description", "PO Service Short Text", "Material Code", "Installed Qty",
      "Asset Tag Number", "GR Mat. Doc.", "WBS Element", "PO Site Name", "PO PLA ID",
      "Installed Site Name", "Installed PLA ID", "Serial no. (ManufSerialNo.)",
      "PO Quantity", "UOM", "PO Unit Price", "Sub Total", "Amount To Billed",
      "Currency", "Payment Milestone"
    ];
    sheet.appendRow(headers);
  }
  return sheet;
}

function getOrCreateTrackerSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.trackerSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.trackerSheetName);
    sheet.appendRow(["File ID", "File Name", "Year", "Processed Date", "Status", "Link to File"]);
  }
  return sheet;
}

function findFolder(name) {
  try {
    const folders = DriveApp.searchFolders("trashed=false");
    while (folders.hasNext()) {
      const f = folders.next();
      if (f.getName() === name) return f;
    }
  } catch (e) {
    Logger.log("Search error: " + e.toString());
  }
  return null;
}

function getProcessedFiles(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.trackerSheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const ids = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) ids.push(values[i][0]);
  }
  return ids;
}

function markFileAsProcessed(spreadsheet, fileId, fileName, year) {
  const sheet = spreadsheet.getSheetByName(CONFIG.trackerSheetName);
  
  // Create a hyperlink formula to the Excel file
  const fileUrl = 'https://drive.google.com/open?id=' + fileId;
  const linkFormula = '=HYPERLINK("' + fileUrl + '", "View File")';
  
  // Add row with file info
  sheet.appendRow([fileId, fileName, year, new Date().toLocaleString(), "Processed"]);
  
  // Set the file link in the last row, column F (column 6)
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 6).setFormula(linkFormula);
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('GR Consolidation')
    .addItem('Consolidate 2025-2026', 'consolidateGRTemplateData')
    .addToUi();
}

function showAlert(msg) {
  SpreadsheetApp.getUi().alert(msg);
}

function showError(msg) {
  SpreadsheetApp.getUi().alert("Error: " + msg);
}