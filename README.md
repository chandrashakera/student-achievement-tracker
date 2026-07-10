# Student Achievement Tracker

Zero-cost PWA for a college department to collect student certificate/achievement
data each semester. Students scan or upload a certificate, OCR + Gemini extract
the fields, the student confirms/corrects them, and the record lands in a
Google Sheet with the file saved to Drive.

Full spec: [claude_code_build_brief.md](claude_code_build_brief.md)

## Status

- **Phase 1 — backend: deployed and confirmed working** (row + file landed
  correctly in testing). See [backend/](backend/).
- **Phase 2 — frontend: built, not yet deployed to GitHub Pages/Vercel.**
  PWA (scan/upload → OCR → Gemini → confirm → submit) lives in
  [frontend/](frontend/). The backend was extended with a `structure` action
  that proxies Gemini calls so the API key never reaches the browser — see
  "Redeploying the backend for Phase 2" below, **required before the app can
  structure certificates.**

## Repo layout

```
backend/    Google Apps Script Web App (Code.gs, GeminiPrompt.gs, appsscript.json)
frontend/   PWA: index.html, app.js, style.css, config.js, manifest, service worker
prompts/    Gemini extraction prompt, reviewable draft copy (see backend/GeminiPrompt.gs for the live one)
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

The Web App handles two JSON-POST actions on the same `/exec` URL (no
multipart/form-data — see "Why base64 JSON" below):

**`action: "submit"`** (default if `action` is omitted, for backward
compatibility with the original Phase 1 payload):

```json
{
  "action": "submit",
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

Response: `{ "success": true, "fileUrl": "https://drive.google.com/file/d/.../view" }`
or on error: `{ "success": false, "error": "..." }`

**`action: "structure"`** (Phase 2, proxies Gemini so the API key stays
server-side):

```json
{ "action": "structure", "text": "<raw OCR/PDF text>" }
```

Response: `{ "success": true, "fields": { "Name": "...", "Certificate Type": "...", "Position/Rank": "...", "Event/Course/Activity": "...", "Issuing Body": "...", "Date": "..." } }`
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

## Gemini extraction prompt

The prompt Gemini uses to turn raw OCR/PDF text into structured JSON is
drafted in [prompts/gemini-extraction-prompt.js](prompts/gemini-extraction-prompt.js)
for review/tuning. The version that actually executes is
[backend/GeminiPrompt.gs](backend/GeminiPrompt.gs) — Apps Script can't
import the `.js` file directly, so if you tune the wording, edit
`GeminiPrompt.gs` and port the same change into the `.js` copy so they don't
drift.

## Redeploying the backend for Phase 2 (required before the app can structure certificates)

Your Phase 1 deployment already works for submissions, but the new
`structure` action needs the Gemini piece added:

1. In the same Apps Script project, add a new script file: `File > New >
   Script`, name it `GeminiPrompt`, paste in
   [backend/GeminiPrompt.gs](backend/GeminiPrompt.gs).
2. Replace `Code.gs` with the updated [backend/Code.gs](backend/Code.gs)
   (adds the `structure` action; the `submit` action is unchanged and still
   backward-compatible with your existing test payload).
3. Get a Gemini API key at [aistudio.google.com](https://aistudio.google.com)
   (free tier).
4. Project Settings > Script Properties > add:

   | Property | Value |
   |---|---|
   | `GEMINI_API_KEY` | the key from step 3 |
   | `GEMINI_MODEL` | optional — only set this if you need to override the default. `Code.gs` currently defaults to `gemini-2.0-flash`; check aistudio.google.com for the current free-tier model name in case Google has renamed/retired it since this was written. |

5. Deploy > Manage deployments > pencil icon > Version: **New version** >
   Deploy. The `/exec` URL stays the same, so the frontend config doesn't
   need to change.

### Testing the `structure` action standalone

```bash
curl -X POST \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"structure","text":"This certificate is awarded to Jane Doe for participation in the National Level Hackathon 2026 organized by XYZ College, held in March 2026."}' \
  "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Expected response (values will vary with the exact text):

```json
{"success":true,"fields":{"Name":"Jane Doe","Certificate Type":"Participation","Position/Rank":"","Event/Course/Activity":"National Level Hackathon 2026","Issuing Body":"XYZ College","Date":"Mar 2026"}}
```

Try a payload whose text includes an explicit rank (e.g. "...awarded 1st
Position to...") and confirm `Position/Rank` only gets filled when the rank
is stated verbatim — and stays `""` for plain participation text even though
its `Certificate Type` may still come back as something other than
"Position".

## Running the frontend locally

The frontend is fully static — no build step. From the repo root:

```bash
npx serve frontend
# or: cd frontend && python -m http.server 8000
```

Open the printed URL, enter a roll no., and try both Scan (needs a device
camera — on a laptop this opens whatever webcam-backed capture the OS
provides) and Upload (any image or PDF) through to the confirmation screen
and submit. Check the Sheet/Drive folder afterward to confirm the row and
file landed.

Note: `frontend/config.js` currently points at the `/exec` URL from your
Phase 1 deployment — if you ever create a new deployment (rather than a new
version of the same one), update `CONFIG.WEBAPP_URL` there.

## Deploying the frontend (GitHub Pages or Vercel, free tier)

- **GitHub Pages:** push this repo to GitHub, then Settings > Pages > Deploy
  from a branch > select the branch and set the folder to `/frontend` (or
  move `frontend/`'s contents to the repo root / a `docs/` folder if Pages
  in your account doesn't support arbitrary subfolders — check the Pages UI).
- **Vercel:** `vercel` CLI or the dashboard, set the project's root directory
  to `frontend/`, no build command needed (static site).

Either way, the deployed site must be served over **HTTPS** for the service
worker (installability) and camera capture to work reliably on mobile —
both GitHub Pages and Vercel give you HTTPS by default.
