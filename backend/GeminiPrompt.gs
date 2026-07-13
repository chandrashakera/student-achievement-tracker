/**
 * Gemini field-extraction prompts — canonical, executable copy.
 *
 * This is the version Code.gs actually sends to Gemini. Apps Script has no
 * import/require, so it can't reuse prompts/gemini-extraction-prompt.js
 * directly — that file is the human-reviewable draft copy for tuning outside
 * the Apps Script editor. If you edit the prompt wording, update BOTH files
 * so they stay in sync; only this one is live.
 *
 * Two variants, sharing the same field-extraction rules:
 *   - GEMINI_EXTRACTION_PROMPT_TEXT  — for PDFs, where pdf.js has already
 *     extracted reliable digital text client-side. Takes raw text via the
 *     {{OCR_TEXT}} placeholder.
 *   - GEMINI_EXTRACTION_PROMPT_IMAGE — for photographed/scanned certificate
 *     images, sent directly as an inlineData part alongside this prompt
 *     (no OCR step). Gemini's vision reads handwriting/decorative fonts far
 *     more reliably than Tesseract.js, which is why images skip OCR
 *     entirely now instead of extracting text client-side first.
 *
 * See prompts/gemini-extraction-prompt.js for the full rationale/comments
 * behind each rule. Kept terser here to reduce noise in the Apps Script
 * editor, but the extraction rules themselves are identical.
 */

var GEMINI_EXTRACTION_RULES =
  'Return ONLY a single JSON object. No markdown code fences, no explanation, no leading or trailing text — just the raw JSON object, parseable by JSON.parse().\n\n' +
  'The JSON object must have exactly these six keys, matching these exact names:\n\n' +
  '{\n' +
  '  "Name": string,\n' +
  '  "Certificate Type": string,\n' +
  '  "Position/Rank": string,\n' +
  '  "Event/Course/Activity": string,\n' +
  '  "Issuing Body": string,\n' +
  '  "Date": string\n' +
  '}\n\n' +
  'Field-by-field rules:\n\n' +
  '1. "Name" — the student/recipient\'s name as printed (or handwritten) on the certificate. If it truly cannot be found, use an empty string "".\n\n' +
  '2. "Certificate Type" — try these categories in order, and use the FIRST one that genuinely fits the certificate\'s language:\n' +
  '   - "Participation": certifies that the person took part in an event/activity, with no claim of winning or special merit.\n' +
  '   - "Appreciation": thanks or recognizes the person for a contribution, effort, or role (e.g. volunteering, organizing, coordinating), without stating they won a competitive rank.\n' +
  '   - "Merit": the certificate recognizes achievement, excellence, or a competitive placing (e.g. "Certificate of Merit", "1st Prize", "Winner", "Best Paper Award", "Certificate of Achievement"). Use this for ANY competitively-earned certificate — the specific rank, if stated verbatim, still goes in the separate "Position/Rank" field below, not here.\n' +
  '   - If it genuinely does not fit any of the three above (e.g. "Certificate of Completion", "Certificate of Excellence", "Certificate of Recognition", "Internship Certificate"), do NOT force it into one of them. Instead return the certificate\'s own short descriptive type exactly as it would follow "Certificate of ___" — e.g. "Completion", "Excellence", "Recognition", "Internship". Keep it short (a few words), Title Case, and do not include the leading words "Certificate of".\n' +
  '   If genuinely ambiguous between Participation/Appreciation/Merit, prefer "Participation" as the default — only use the free-text fallback when none of the three fixed categories fit at all.\n\n' +
  '3. "Position/Rank" — THIS FIELD HAS A STRICT RULE, follow it exactly:\n' +
  '   - Only fill this in if a rank or placing is STATED VERBATIM on the certificate — e.g. it literally contains words like "Winner", "Runner-up", "1st Position", "2nd Position", "3rd Position", "1st Prize", "Second Place", etc.\n' +
  '   - If you fill it in, map what you find to exactly ONE of these five strings: "Winner", "Runner-up", "1st Position", "2nd Position", "3rd Position". Choose the closest match (e.g. "1st Prize" or "First Place" -> "1st Position"; "Champion" -> "Winner"; "2nd Runner-up" -> pick the closest of "Runner-up" or "3rd Position" based on context).\n' +
  '   - DO NOT infer, guess, or default a value here just because you classified "Certificate Type" as "Merit". Classifying the certificate type as "Merit" does NOT by itself justify filling in this field — you still need an explicit, verbatim rank mention.\n' +
  '   - If no explicit rank/placing wording appears, leave this as an empty string "". An empty string is the correct, expected answer most of the time — do not treat it as a failure to find something.\n\n' +
  '4. "Event/Course/Activity" — the name of the event, competition, workshop, course, or activity the certificate is for (e.g. "National Level Hackathon 2026", "NPTEL Course on Data Structures"). If it truly cannot be found, use an empty string "".\n\n' +
  '5. "Issuing Body" — the organization, institution, company, or department that issued the certificate (e.g. college name, company name, professional body). If it truly cannot be found, use an empty string "".\n\n' +
  '6. "Date" — the date associated with the certificate, following this fallback rule:\n' +
  '   - If an exact date is stated (e.g. "15th March 2026" or "15/03/2026"), return it in a clear, human-readable form, e.g. "15 Mar 2026".\n' +
  '   - If the certificate covers a range or duration (common for courses), and exact start/end dates are given, return the range, e.g. "10 Jan 2026 - 28 Feb 2026".\n' +
  '   - If exact day-level dates are NOT given but a month and year are (e.g. only "March 2026" appears, or the certificate implies a period like a semester), fall back to month-year granularity, e.g. "Mar 2026" or a month-year range like "Jan-Mar 2026".\n' +
  '   - If only a year is available, return just the year, e.g. "2026".\n' +
  '   - If no date information at all is present, use an empty string "".\n' +
  '   - Never fabricate a date that isn\'t supported by the certificate.\n\n' +
  'General rules:\n' +
  '- Every value must be a plain string (use "" for unknown/missing, never null, never omit a key).\n' +
  '- Do not add any keys beyond the six listed above.\n' +
  '- Do not wrap the JSON in markdown code fences (no ```json).\n';

var GEMINI_EXTRACTION_PROMPT_TEXT = 'You are extracting structured data from the raw text of a scanned student certificate (participation, appreciation, merit, or achievement certificate, or a course completion certificate). The text below was produced by OCR or PDF text extraction and may contain noise, misspellings, broken line breaks, or garbled characters — read past that noise to the underlying certificate content.\n\n' +
  GEMINI_EXTRACTION_RULES +
  '- Base every field strictly on the text provided below — do not use outside knowledge about the event or institution named, and do not infer details that aren\'t textually supported.\n\n' +
  'Certificate text (raw OCR/PDF extraction):\n' +
  '"""\n' +
  '{{OCR_TEXT}}\n' +
  '"""';

var GEMINI_EXTRACTION_PROMPT_IMAGE = 'You are extracting structured data from the attached image of a student certificate (participation, appreciation, merit, or achievement certificate, or a course completion certificate). Read it carefully — certificates often mix printed and handwritten text (the recipient\'s name especially is often handwritten or in a decorative script), and handwriting is the single most common source of misreads. Look closely at letter shapes, spacing, and context rather than guessing from a quick first impression, particularly for the "Name" and "Event/Course/Activity" fields.\n\n' +
  GEMINI_EXTRACTION_RULES +
  '- Base every field strictly on what is actually visible in the image — do not use outside knowledge about the event or institution named, and do not infer details that aren\'t visibly supported.\n';
