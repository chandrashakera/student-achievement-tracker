/**
 * Student Achievement Tracker — Apps Script backend.
 *
 * Web App endpoint with two JSON-POST actions:
 *   - action "submit" (default, for backward compatibility with Phase 1
 *     payloads that omit "action"): appends a row to the tracker Sheet and
 *     saves the certificate file to Drive.
 *   - action "structure": proxies raw OCR/PDF text to Gemini and returns
 *     structured fields. Added in Phase 2 so the Gemini API key stays in
 *     Script Properties and is never shipped to the browser.
 *
 * ---- submit — wire format (POST body, JSON) ----
 * {
 *   "action": "submit",
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
 * Response: { "success": true, "fileUrl": "https://drive.google.com/..." }
 *        or { "success": false, "error": "..." }
 *
 * ---- structure — wire format (POST body, JSON) ----
 * Either (PDFs — pdf.js already extracted reliable digital text client-side):
 *   { "action": "structure", "text": "<raw PDF text>" }
 * Or (images — sent directly to Gemini's vision input, no client-side OCR;
 * Gemini reads handwriting/decorative fonts far more reliably than
 * Tesseract.js, which is why images skip OCR entirely):
 *   { "action": "structure", "imageBase64": "<base64, no data: prefix>", "mimeType": "image/jpeg" }
 * Response: { "success": true, "fields": { "Name": "...", "Certificate Type": "...",
 *             "Position/Rank": "...", "Event/Course/Activity": "...",
 *             "Issuing Body": "...", "Date": "..." } }
 *        or { "success": false, "error": "..." }
 *
 * ---- ONE-TIME SETUP (before deploying) ----
 * In the script editor: Project Settings (gear icon) > Script Properties > add:
 *   SHEET_ID        - ID of the target Google Sheet (from its URL)
 *   DRIVE_FOLDER_ID - ID of the target Drive folder (from its URL)
 *   GEMINI_API_KEY  - API key from aistudio.google.com
 *   GEMINI_MODEL    - optional; defaults to 'gemini-3.1-flash-lite' if unset
 *                      (see GEMINI_MODEL_DEFAULT below — override here if
 *                      Google renames/retires that model on their free tier;
 *                      check https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY
 *                      and https://aistudio.google.com/rate-limit for what's
 *                      actually live and quota'd for your account)
 * The extraction prompt itself lives in GeminiPrompt.gs, kept separate so it
 * can be tuned without touching request-handling logic. It must be kept in
 * sync with prompts/gemini-extraction-prompt.js (the reviewable draft copy)
 * if edited — Apps Script can't import that file directly.
 * See README.md at the repo root for full deployment steps.
 */

var SHEET_NAME = 'Submissions'; // rename here if your tab uses a different name

var HEADERS = [
  'Roll No.', 'Name', 'Certificate Type', 'Position/Rank',
  'Event/Course/Activity', 'Issuing Body', 'Date', 'File Link', 'Timestamp'
];

// Certificate Type has three fixed categories plus a free-text "Other" case
// (student/Gemini supply their own short phrase, e.g. "Completion",
// "Excellence" — whatever follows "Certificate of ___"). So unlike
// Position/Rank below, it's validated as non-empty only, not against an enum.
var CERT_TYPE_DEFAULT = 'Participation';
var ALLOWED_POSITIONS = ['', 'Winner', 'Runner-up', '1st Position', '2nd Position', '3rd Position'];
var GEMINI_MODEL_DEFAULT = 'gemini-3.1-flash-lite'; // gemini-2.0-flash (retired) and gemini-2.5-flash-lite (early-blocked ahead of its Oct 2026 shutdown) both stopped working; verified against this account's live /v1beta/models listing

function doPost(e) {
  try {
    var body = parseRequestBody_(e);
    var action = body.action || 'submit';

    if (action === 'structure') {
      return jsonResponse_({ success: true, fields: handleStructureRequest_(body) });
    }
    return handleSubmitRequest_(body);
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

function handleSubmitRequest_(body) {
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
}

function handleStructureRequest_(body) {
  if (body.imageBase64) {
    if (!body.mimeType) {
      throw new Error('Missing required field: mimeType');
    }
    return callGeminiForStructuring_({ imageBase64: String(body.imageBase64), mimeType: String(body.mimeType) });
  }
  if (!body.text || !String(body.text).trim()) {
    throw new Error('Missing required field: text (or imageBase64+mimeType)');
  }
  return callGeminiForStructuring_({ text: String(body.text) });
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

// Calls Gemini with the extraction prompt (GeminiPrompt.gs) and either raw
// PDF text or a certificate image, and returns a sanitized fields object
// ready for the confirmation screen. Never throws on a malformed/
// out-of-vocabulary Certificate Type or Position/Rank — it clamps those to
// safe defaults instead, since the confirmation screen is the actual
// data-integrity safeguard and the student can correct anything here.
//
// input is { text } for PDFs or { imageBase64, mimeType } for images.
function callGeminiForStructuring_(input) {
  var apiKey = getRequiredProperty_('GEMINI_API_KEY');
  var model = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || GEMINI_MODEL_DEFAULT;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey);

  var parts;
  if (input.imageBase64) {
    parts = [
      { text: GEMINI_EXTRACTION_PROMPT_IMAGE },
      { inlineData: { mimeType: input.mimeType, data: input.imageBase64 } }
    ];
  } else {
    parts = [{ text: GEMINI_EXTRACTION_PROMPT_TEXT.replace('{{OCR_TEXT}}', input.text) }];
  }

  var payload = {
    contents: [{ parts: parts }],
    generationConfig: { responseMimeType: 'application/json' }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Gemini API error (HTTP ' + status + '): ' + response.getContentText());
  }

  var apiResult = JSON.parse(response.getContentText());
  var candidateText = apiResult
    && apiResult.candidates
    && apiResult.candidates[0]
    && apiResult.candidates[0].content
    && apiResult.candidates[0].content.parts
    && apiResult.candidates[0].content.parts[0]
    && apiResult.candidates[0].content.parts[0].text;

  if (!candidateText) {
    throw new Error('Gemini returned no extractable content.');
  }

  var parsed;
  try {
    parsed = JSON.parse(candidateText);
  } catch (parseErr) {
    throw new Error('Gemini response was not valid JSON: ' + candidateText);
  }

  return sanitizeGeminiFields_(parsed);
}

function sanitizeGeminiFields_(fields) {
  fields = fields || {};
  var certificateType = fields['Certificate Type'] || CERT_TYPE_DEFAULT;
  var positionRank = fields['Position/Rank'];
  if (ALLOWED_POSITIONS.indexOf(positionRank) === -1) {
    positionRank = '';
  }
  return {
    'Name': fields['Name'] || '',
    'Certificate Type': certificateType,
    'Position/Rank': positionRank,
    'Event/Course/Activity': fields['Event/Course/Activity'] || '',
    'Issuing Body': fields['Issuing Body'] || '',
    'Date': fields['Date'] || ''
  };
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
