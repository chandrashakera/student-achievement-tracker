# Build: Student Achievement Tracker (PWA + OCR)

## Objective
Zero-cost PWA for a college department to collect student certificate/achievement
data each semester. Student enters roll no., scans/uploads a certificate, app
extracts fields via OCR + LLM, student confirms, data lands in a Google Sheet.

**Constraint: zero cost, end to end.**

## Stack (locked — do not deviate without flagging)
- **Frontend:** PWA — plain HTML/JS/CSS, installable via "Add to Home Screen"
  (no app store, no build framework required unless you have a strong reason)
- **Hosting:** GitHub Pages or Vercel (free tier)
- **PDF text extraction:** pdf.js (client-side)
- **Image OCR:** Tesseract.js (client-side)
- **Field structuring:** Gemini free-tier API — converts raw OCR/PDF text into
  structured JSON (API key supplied separately by user)
- **Backend:** Google Apps Script Web App (free, no server)
- **Storage:** Google Sheets (acts as the live database, exports to .xlsx) +
  Google Drive (certificate file storage)
- **Auth context:** everything (Apps Script, Sheet, Drive) runs under the
  user's own personal Google account — single auth context, no domain/admin
  restrictions

## Build order
1. **Apps Script backend first** (testable standalone via curl/Postman before
   any frontend exists):
   - Web App endpoint that accepts a POST (roll no. + structured fields + file)
   - Appends a row to the Sheet using the schema below
   - Saves the uploaded file to a Drive folder, returns the Drive URL
2. **PWA frontend second**, once backend is confirmed working.

## UI Flow
1. **Home screen:** Roll No. input + two buttons: **Scan Certificate** (opens
   camera) and **Upload Certificate** (file picker, accepts PDF or image)
2. **Capture/upload → preview screen** with **Retake** and **Proceed** buttons.
   No automated blur/quality check — student judges the capture visually and
   decides.
3. **On Proceed:**
   - Detect file type (PDF vs image)
   - PDF → pdf.js text extraction | Image → Tesseract.js OCR (show a loading
     state — OCR can take several seconds on mobile)
   - Raw extracted text → Gemini API → structured JSON
4. **Editable confirmation screen:** pre-filled fields shown, student can
   correct any value before submitting (OCR/LLM misreads occasionally — this
   is the data-integrity safeguard, don't skip it)
5. **Submit:** POST to Apps Script Web App → appends row to Sheet + saves file
   to Drive

## Sheet schema (exact columns, in order)
| Column | Notes |
|---|---|
| Roll No. | Student-entered |
| Name | Extracted via OCR/Gemini |
| Certificate Type | One of: Participation / Appreciation / Position |
| Position/Rank | One of: Winner / Runner-up / 1st Position / 2nd Position / 3rd Position — **leave blank unless explicitly stated on the certificate.** Never infer this from Certificate Type. |
| Event/Course/Activity | Extracted via OCR/Gemini |
| Issuing Body | Extracted via OCR/Gemini |
| Date | Issue date, or a duration for courses. If exact dates aren't given, fall back to month-year granularity (e.g. "Jan–Mar 2026") |
| File Link | Drive URL of the uploaded/scanned file |
| Timestamp | Auto-generated on submit |

## Gemini prompt requirements
The Gemini call must return strict JSON matching the schema fields above
(Name, Certificate Type, Position/Rank, Event/Course/Activity, Issuing Body,
Date). Instruct it explicitly: leave Position/Rank empty if not stated
verbatim on the certificate; do not guess or infer.

## Open items to ask the user for (don't invent placeholder values)
- Gemini API key (they'll generate this at aistudio.google.com)
- Target Google Sheet ID / name
- Target Drive folder ID for certificate storage

## Out of scope for v1
- No blur/image-quality auto-detection
- No admin dashboard beyond the raw Sheet
- No login/auth beyond roll-no entry (trusted-cohort use case)
