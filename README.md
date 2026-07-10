# Student Achievement Tracker

Zero-cost PWA for a college department to collect student certificate/achievement
data each semester. Students scan or upload a certificate, OCR + Gemini extract
the fields, the student confirms/corrects them, and the record lands in a
Google Sheet with the file saved to Drive.

Full spec: [claude_code_build_brief.md](claude_code_build_brief.md)

## Status

- **Phase 1 — backend: done, not yet deployed.** Google Apps Script Web App
  that appends rows to a Sheet and saves files to Drive. See
  [backend/](backend/) and the deployment steps below.
- **Phase 2 — frontend: not started.** PWA (scan/upload → OCR → Gemini →
  confirm → submit). Will land in [frontend/](frontend/) once Phase 1 is
  confirmed working end-to-end.

## Repo layout

```
backend/    Google Apps Script Web App (Code.gs, appsscript.json)
frontend/   PWA (Phase 2, not yet built)
prompts/    Gemini extraction prompt, versioned separately for review/tuning
```

## Stack

- Frontend: plain HTML/JS/CSS PWA, installable via "Add to Home Screen"
- Hosting: GitHub Pages or Vercel (free tier)
- PDF text: pdf.js (client-side) | Image OCR: Tesseract.js (client-side)
- Field structuring: Gemini free-tier API
- Backend: Google Apps Script Web App (free, no server)
- Storage: Google Sheets (live database) + Google Drive (file storage)
- Auth: everything runs under one personal Google account; no login for
  students beyond entering their roll no.

## Sheet schema (exact column order)

| Roll No. | Name | Certificate Type | Position/Rank | Event/Course/Activity | Issuing Body | Date | File Link | Timestamp |
|---|---|---|---|---|---|---|---|---|

`Certificate Type` ∈ {Participation, Appreciation, Position}.
`Position/Rank` ∈ {"", Winner, Runner-up, 1st Position, 2nd Position, 3rd Position} —
left blank unless explicitly stated on the certificate; never inferred from
Certificate Type.

## Backend wire format

The frontend will POST a single JSON body (no multipart/form-data — see
"Why base64 JSON" below):

```json
{
  "rollNo": "21A91A0501",
  "name": "Jane Doe",
  "certificateType": "Participation",
  "positionRank": "",
  "event": "National Level Hackathon",
  "issuingBody": "XYZ College",
  "date": "Mar 2026",
  "fileName": "certificate.jpg",
  "mimeType": "image/jpeg",
  "fileBase64": "<base64-encoded file bytes, no data: prefix>"
}
```

Response:

```json
{ "success": true, "fileUrl": "https://drive.google.com/file/d/.../view" }
```

or on error: `{ "success": false, "error": "..." }`

### Why base64 JSON instead of multipart/form-data

Apps Script's parsing of real `multipart/form-data` (as sent by an HTML
`<form>` or `FormData`) is undocumented and unreliable for binary file
payloads. The standard, reliable pattern for Apps Script Web Apps is to
base64-encode the file client-side and send everything — fields and file —
as one JSON body. `doPost` decodes it with `Utilities.base64Decode()` and
writes a Drive blob. This also sidesteps CORS preflight issues, since the
request can be sent as `Content-Type: text/plain;charset=utf-8` (a CORS
"simple request") while the body itself is still parsed as JSON server-side.

## Deploying the backend (Phase 1)

### 1. Create the Sheet and Drive folder

- Create (or pick) a Google Sheet. Copy its **Sheet ID** from the URL:
  `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
- Create (or pick) a Google Drive folder for certificate files. Copy its
  **Folder ID** from the URL:
  `https://drive.google.com/drive/folders/`**`THIS_PART`**
- You don't need to pre-create a header row or tab — the script creates a
  `Submissions` tab and header row automatically on first write if missing.

### 2. Create the Apps Script project

- Go to [script.google.com](https://script.google.com) > New project (a
  standalone project is fine — the script targets the Sheet by ID, so it
  doesn't need to be bound to it).
- Rename the project (e.g. "Achievement Tracker Backend").
- Replace the default `Code.gs` contents with
  [backend/Code.gs](backend/Code.gs).
- Optional: Project Settings (gear icon, left sidebar) > check "Show
  `appsscript.json` manifest file in editor" if you want to inspect/edit
  [backend/appsscript.json](backend/appsscript.json) directly. Not required —
  the Deploy dialog in step 4 sets the same access/execute settings.

### 3. Set Script Properties

Project Settings (gear icon) > **Script Properties** > add:

| Property | Value |
|---|---|
| `SHEET_ID` | the Sheet ID from step 1 |
| `DRIVE_FOLDER_ID` | the Drive folder ID from step 1 |

The script reads these at request time — no IDs are hardcoded in `Code.gs`.

### 4. Deploy as a Web App

- Deploy > New deployment > gear icon next to "Select type" > **Web app**.
- Description: anything (e.g. "v1").
- **Execute as:** Me (your account) — required so the script can write to
  your Sheet/Drive regardless of who calls the endpoint.
- **Who has access:** Anyone — required because students submit without
  logging into Google (per the brief: "no login/auth beyond roll-no entry").
  **Flagging this as a tradeoff, not asking permission to change it**: this
  means the URL, once known, can be POSTed to by anyone, with no built-in
  rate limiting. That matches the brief's "trusted-cohort use case" framing,
  but worth knowing going in.
- Click Deploy. Authorize the requested permissions (Sheets + Drive) when
  prompted — you'll see an "unverified app" warning since this is a personal
  script; click Advanced > Go to (project name) to proceed.
- Copy the **Web app URL** it gives you (ends in `/exec`). That's your
  backend endpoint.

### 5. Redeploying after edits

Any time you change `Code.gs`, existing deployments keep serving the old
code. Deploy > Manage deployments > pencil icon on your deployment > under
"Version" pick **New version** > Deploy. The `/exec` URL stays the same.

## Testing the backend standalone (before any frontend exists)

Use a small test file so the base64 payload is easy to inspect. From a
terminal with `curl` and `base64` available:

```bash
# 1. Base64-encode a small test image/PDF (adjust path as needed)
base64 -w0 test-certificate.jpg > /tmp/cert_b64.txt   # macOS: use `base64 -i test-certificate.jpg`

# 2. Build the JSON payload
cat > /tmp/payload.json <<EOF
{
  "rollNo": "TEST001",
  "name": "Test Student",
  "certificateType": "Participation",
  "positionRank": "",
  "event": "Test Hackathon",
  "issuingBody": "Test College",
  "date": "Jul 2026",
  "fileName": "test-certificate.jpg",
  "mimeType": "image/jpeg",
  "fileBase64": "$(cat /tmp/cert_b64.txt)"
}
EOF

# 3. POST it to your deployment's /exec URL
curl -X POST \
  -H "Content-Type: text/plain;charset=utf-8" \
  --data-binary @/tmp/payload.json \
  "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Expected response:

```json
{"success":true,"fileUrl":"https://drive.google.com/file/d/.../view"}
```

Then verify:

- A new row appeared in the Sheet's `Submissions` tab with all 9 columns
  filled, `Timestamp` auto-populated.
- The file shows up in the Drive folder, named `TEST001_test-certificate.jpg`.

To test validation, POST a payload missing a required field (e.g. drop
`"event"`) and confirm you get back `{"success":false,"error":"Missing
required field: event"}` rather than a stack trace or an HTML error page.

You can also just open the `/exec` URL in a browser (GET request) — it
should return `{"status":"ok","message":"Student Achievement Tracker backend
is running."}`, a quick way to confirm the deployment itself is live before
worrying about POST payloads.

## Gemini extraction prompt (Phase 2, drafted early for review)

The prompt Gemini will use to turn raw OCR/PDF text into structured JSON is
drafted in [prompts/gemini-extraction-prompt.js](prompts/gemini-extraction-prompt.js),
kept separate from pipeline code so it can be reviewed and tuned
independently. It is **not wired into any pipeline yet** — Phase 2 only.
