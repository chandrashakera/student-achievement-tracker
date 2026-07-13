/**
 * Gemini field-extraction prompts — reviewable draft copy.
 *
 * WIRED IN as of Phase 2, but not from this file: Apps Script has no
 * import/require, so the live copy that actually gets sent to Gemini lives
 * in backend/GeminiPrompt.gs (executed server-side, proxied from the
 * frontend via the Web App's "structure" action — see Code.gs). This file
 * is kept as the human-reviewable/tunable source; if you change the wording
 * here, port the same change into backend/GeminiPrompt.gs, since only that
 * copy runs.
 *
 * Two variants, sharing the same field-extraction rules:
 *   - GEMINI_EXTRACTION_PROMPT_TEXT  — for PDFs, where pdf.js has already
 *     extracted reliable digital text client-side. Takes raw text via the
 *     {{OCR_TEXT}} placeholder.
 *   - GEMINI_EXTRACTION_PROMPT_IMAGE — for photographed/scanned certificate
 *     images, sent directly as an inlineData part alongside this prompt
 *     (no OCR step). Gemini's vision reads handwriting/decorative fonts far
 *     more reliably than Tesseract.js, which is why images skip OCR
 *     entirely instead of extracting text client-side first.
 *
 * Every hard requirement below traces back to a specific line in
 * claude_code_build_brief.md:
 *   - Strict JSON, exact field names           -> "Gemini prompt requirements"
 *   - Position/Rank verbatim-only, never inferred -> Sheet schema, Position/Rank row
 *   - Date fallback to month-year granularity   -> Sheet schema, Date row
 */

const GEMINI_EXTRACTION_RULES = `Return ONLY a single JSON object. No markdown code fences, no explanation, no leading or trailing text — just the raw JSON object, parseable by JSON.parse().

The JSON object must have exactly these six keys, matching these exact names:

{
  "Name": string,
  "Certificate Type": string,
  "Position/Rank": string,
  "Event/Course/Activity": string,
  "Issuing Body": string,
  "Date": string
}

Field-by-field rules:

1. "Name" — the student/recipient's name as printed (or handwritten) on the certificate. If it truly cannot be found, use an empty string "".

2. "Certificate Type" — try these categories in order, and use the FIRST one that genuinely fits the certificate's language:
   - "Participation": certifies that the person took part in an event/activity, with no claim of winning or special merit.
   - "Appreciation": thanks or recognizes the person for a contribution, effort, or role (e.g. volunteering, organizing, coordinating), without stating they won a competitive rank.
   - "Merit": the certificate recognizes achievement, excellence, or a competitive placing (e.g. "Certificate of Merit", "1st Prize", "Winner", "Best Paper Award", "Certificate of Achievement"). Use this for ANY competitively-earned certificate — the specific rank, if stated verbatim, still goes in the separate "Position/Rank" field below, not here.
   - If it genuinely does not fit any of the three above (e.g. "Certificate of Completion", "Certificate of Excellence", "Certificate of Recognition", "Internship Certificate"), do NOT force it into one of them. Instead return the certificate's own short descriptive type exactly as it would follow "Certificate of ___" — e.g. "Completion", "Excellence", "Recognition", "Internship". Keep it short (a few words), Title Case, and do not include the leading words "Certificate of".
   If genuinely ambiguous between Participation/Appreciation/Merit, prefer "Participation" as the default — only use the free-text fallback when none of the three fixed categories fit at all.

3. "Position/Rank" — THIS FIELD HAS A STRICT RULE, follow it exactly:
   - Only fill this in if a rank or placing is STATED VERBATIM on the certificate — e.g. it literally contains words like "Winner", "Runner-up", "1st Position", "2nd Position", "3rd Position", "1st Prize", "Second Place", etc.
   - If you fill it in, map what you find to exactly ONE of these five strings: "Winner", "Runner-up", "1st Position", "2nd Position", "3rd Position". Choose the closest match (e.g. "1st Prize" or "First Place" -> "1st Position"; "Champion" -> "Winner"; "2nd Runner-up" -> pick the closest of "Runner-up" or "3rd Position" based on context).
   - DO NOT infer, guess, or default a value here just because you classified "Certificate Type" as "Merit". Classifying the certificate type as "Merit" does NOT by itself justify filling in this field — you still need an explicit, verbatim rank mention.
   - If no explicit rank/placing wording appears, leave this as an empty string "". An empty string is the correct, expected answer most of the time — do not treat it as a failure to find something.

4. "Event/Course/Activity" — the name of the event, competition, workshop, course, or activity the certificate is for (e.g. "National Level Hackathon 2026", "NPTEL Course on Data Structures"). If it truly cannot be found, use an empty string "".

5. "Issuing Body" — the organization, institution, company, or department that issued the certificate (e.g. college name, company name, professional body). If it truly cannot be found, use an empty string "".

6. "Date" — the date associated with the certificate, following this fallback rule:
   - If an exact date is stated (e.g. "15th March 2026" or "15/03/2026"), return it in a clear, human-readable form, e.g. "15 Mar 2026".
   - If the certificate covers a range or duration (common for courses), and exact start/end dates are given, return the range, e.g. "10 Jan 2026 - 28 Feb 2026".
   - If exact day-level dates are NOT given but a month and year are (e.g. only "March 2026" appears, or the certificate implies a period like a semester), fall back to month-year granularity, e.g. "Mar 2026" or a month-year range like "Jan-Mar 2026".
   - If only a year is available, return just the year, e.g. "2026".
   - If no date information at all is present, use an empty string "".
   - Never fabricate a date that isn't supported by the certificate.

General rules:
- Every value must be a plain string (use "" for unknown/missing, never null, never omit a key).
- Do not add any keys beyond the six listed above.
- Do not wrap the JSON in markdown code fences (no \`\`\`json).
- CRITICAL: if what was provided does not actually appear to be a real, legible certificate — e.g. it is blank, corrupted, unrelated content, or too illegible to make out any genuine details — return empty strings "" for ALL SIX fields. Do NOT invent or guess plausible-sounding names, institutions, events, or dates just to produce a fuller-looking answer. A response of all empty strings is correct and expected when there is truly nothing legible to extract — it is far better than a fabricated one.
`;

const GEMINI_EXTRACTION_PROMPT_TEXT = `You are extracting structured data from the raw text of a scanned student certificate (participation, appreciation, merit, or achievement certificate, or a course completion certificate). The text below was produced by OCR or PDF text extraction and may contain noise, misspellings, broken line breaks, or garbled characters — read past that noise to the underlying certificate content.

${GEMINI_EXTRACTION_RULES}- Base every field strictly on the text provided below — do not use outside knowledge about the event or institution named, and do not infer details that aren't textually supported.

Certificate text (raw OCR/PDF extraction):
"""
{{OCR_TEXT}}
"""`;

const GEMINI_EXTRACTION_PROMPT_IMAGE = `You are extracting structured data from the attached image of a student certificate (participation, appreciation, merit, or achievement certificate, or a course completion certificate). Read it carefully — certificates often mix printed and handwritten text (the recipient's name especially is often handwritten or in a decorative script), and handwriting is the single most common source of misreads. Look closely at letter shapes, spacing, and context rather than guessing from a quick first impression, particularly for the "Name" and "Event/Course/Activity" fields.

${GEMINI_EXTRACTION_RULES}- Base every field strictly on what is actually visible in the image — do not use outside knowledge about the event or institution named, and do not infer details that aren't visibly supported.
`;

// Phase 2 does:
//   - PDFs:  GEMINI_EXTRACTION_PROMPT_TEXT.replace('{{OCR_TEXT}}', pdfText) as a single text part
//   - Images: GEMINI_EXTRACTION_PROMPT_IMAGE as a text part alongside an inlineData image part
//             (mimeType + base64), no OCR step — see backend/Code.gs callGeminiForStructuring_.

module.exports = { GEMINI_EXTRACTION_RULES, GEMINI_EXTRACTION_PROMPT_TEXT, GEMINI_EXTRACTION_PROMPT_IMAGE };
