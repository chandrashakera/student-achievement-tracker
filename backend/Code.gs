/**
 * Student Achievement Tracker — Apps Script backend.
 *
 * Web App endpoint that accepts a single JSON POST containing the student's
 * roll no., the structured certificate fields, and the certificate file
 * (base64-encoded). It appends a row to the tracker Sheet and saves the file
 * to a Drive folder.
 *
 * Wire format (POST body, JSON):
 * {
 *   "rollNo": "21A91A0501",
 *   "name": "...",
 *   "certificateType": "Participation" | "Appreciation" | "Position",
 *   "positionRank": "" | "Winner" | "Runner-up" | "1st Position" | "2nd Position" | "3rd Position",
 *   "event": "...",
 *   "issuingBody": "...",
 *   "date": "...",
 *   "fileName": "certificate.jpg",
 *   "mimeType": "image/jpeg",
 *   "fileBase64": "<base64 string, no data: prefix>"
 * }
 *
 * Response (JSON): { "success": true, "fileUrl": "https://drive.google.com/..." }
 *                or { "success": false, "error": "..." }
 *
 * ---- ONE-TIME SETUP (before deploying) ----
 * In the script editor: Project Settings (gear icon) > Script Properties > add:
 *   SHEET_ID        - ID of the target Google Sheet (from its URL)
 *   DRIVE_FOLDER_ID - ID of the target Drive folder (from its URL)
 * See README.md at the repo root for full deployment steps.
 */

var SHEET_NAME = 'Submissions'; // rename here if your tab uses a different name

var HEADERS = [
  'Roll No.', 'Name', 'Certificate Type', 'Position/Rank',
  'Event/Course/Activity', 'Issuing Body', 'Date', 'File Link', 'Timestamp'
];

var ALLOWED_CERT_TYPES = ['Participation', 'Appreciation', 'Position'];
var ALLOWED_POSITIONS = ['', 'Winner', 'Runner-up', '1st Position', '2nd Position', '3rd Position'];

function doPost(e) {
  try {
    var body = parseRequestBody_(e);
    validatePayload_(body);

    var fileUrl = saveFileToDrive_(body.fileName, body.mimeType, body.fileBase64, body.rollNo);

    appendRow_({
      rollNo: body.rollNo,
      name: body.name,
      certificateType: body.certificateType,
      positionRank: body.positionRank || '',
      event: body.event,
      issuingBody: body.issuingBody,
      date: body.date,
      fileUrl: fileUrl
    });

    return jsonResponse_({ success: true, fileUrl: fileUrl });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

// Lets you sanity-check the deployment URL in a browser (GET request).
function doGet(e) {
  return jsonResponse_({ status: 'ok', message: 'Student Achievement Tracker backend is running.' });
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing request body.');
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (parseErr) {
    throw new Error('Request body is not valid JSON.');
  }
}

function validatePayload_(body) {
  var required = [
    'rollNo', 'name', 'certificateType', 'event',
    'issuingBody', 'date', 'fileBase64', 'fileName', 'mimeType'
  ];
  for (var i = 0; i < required.length; i++) {
    var key = required[i];
    if (!body[key]) {
      throw new Error('Missing required field: ' + key);
    }
  }
  if (ALLOWED_CERT_TYPES.indexOf(body.certificateType) === -1) {
    throw new Error('Invalid Certificate Type: ' + body.certificateType);
  }
  if (body.positionRank && ALLOWED_POSITIONS.indexOf(body.positionRank) === -1) {
    throw new Error('Invalid Position/Rank: ' + body.positionRank);
  }
}

function saveFileToDrive_(fileName, mimeType, base64Data, rollNo) {
  var folder = DriveApp.getFolderById(getRequiredProperty_('DRIVE_FOLDER_ID'));
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, mimeType, fileName);
  blob.setName((rollNo ? rollNo + '_' : '') + fileName);
  var file = folder.createFile(blob);
  return file.getUrl();
}

function appendRow_(fields) {
  getSheet_().appendRow([
    fields.rollNo,
    fields.name,
    fields.certificateType,
    fields.positionRank,
    fields.event,
    fields.issuingBody,
    fields.date,
    fields.fileUrl,
    new Date()
  ]);
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(getRequiredProperty_('SHEET_ID'));
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getRequiredProperty_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error('Missing script property: ' + key + '. Set it in Project Settings > Script Properties.');
  }
  return value;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
