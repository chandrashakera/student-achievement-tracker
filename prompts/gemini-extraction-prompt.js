/**
 * Gemini field-extraction prompt — DRAFT, for review only.
 *
 * NOT wired into any pipeline yet. This is Phase 2 material, kept in its own
 * file so the prompt text can be reviewed and tuned independently of the
 * OCR/Gemini calling code that will eventually import it.
 *
 * Usage (Phase 2, once approved): interpolate the raw OCR/pdf.js text into
 * the {{OCR_TEXT}} placeholder below and send the result as the prompt in
 * the Gemini API request. Every hard requirement below traces back to a
 * specific line in claude_code_build_brief.md:
 *   - Strict JSON, exact field names           -> "Gemini prompt requirements"
 *   - Position/Rank verbatim-only, never inferred -> Sheet schema, Position/Rank row
 *   - Date fallback to month-year granularity   -> Sheet schema, Date row
 */

const GEMINI_EXTRACTION_PROMPT = `You are extracting structured data from the raw text of a scanned student certificate (participation, appreciation, or achievement certificate, or a course completion certificate). The text below was produced by OCR or PDF text extraction and may contain noise, misspellings, broken line breaks, or garbled characters — read past that noise to the underlying certificate content.

Return ONLY a single JSON object. No markdown code fences, no explanation, no leading or trailing text — just the raw JSON object, parseable by JSON.parse().

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

1. "Name" — the student/recipient's name as printed on the certificate. If it truly cannot be found in the text, use an empty string "".

2. "Certificate Type" — classify as exactly one of these three strings: "Participation", "Appreciation", or "Position". Use your judgement based on the certificate's language:
   - "Participation": certifies that the person took part in an event/activity, with no claim of winning or special merit.
   - "Appreciation": thanks or recognizes the person for a contribution, effort, or role (e.g. volunteering, organizing, coordinating), without stating they won a competitive rank.
   - "Position": the certificate states the person achieved a competitive rank or won something (e.g. "1st Prize", "Winner", "Runner-up", "Best Paper Award" implying a competitive placing).
   If genuinely ambiguous, prefer "Participation" as the default.

3. "Position/Rank" — THIS FIELD HAS A STRICT RULE, follow it exactly:
   - Only fill this in if a rank or placing is STATED VERBATIM in the certificate text — e.g. the text literally contains words like "Winner", "Runner-up", "1st Position", "2nd Position", "3rd Position", "1st Prize", "Second Place", etc.
   - If you fill it in, map what you find to exactly ONE of these five strings: "Winner", "Runner-up", "1st Position", "2nd Position", "3rd Position". Choose the closest match (e.g. "1st Prize" or "First Place" -> "1st Position"; "Champion" -> "Winner"; "2nd Runner-up" -> pick the closest of "Runner-up" or "3rd Position" based on context).
   - DO NOT infer, guess, or default a value here just because you classified "Certificate Type" as "Position". Classifying the certificate type as "Position" does NOT by itself justify filling in this field — you still need an explicit, verbatim rank mention in the text.
   - If no explicit rank/placing wording appears in the text, leave this as an empty string "". An empty string is the correct, expected answer most of the time — do not treat it as a failure to find something.

4. "Event/Course/Activity" — the name of the event, competition, workshop, course, or activity the certificate is for (e.g. "National Level Hackathon 2026", "NPTEL Course on Data Structures"). If it truly cannot be found, use an empty string "".

5. "Issuing Body" — the organization, institution, company, or department that issued the certificate (e.g. college name, company name, professional body). If it truly cannot be found, use an empty string "".

6. "Date" — the date associated with the certificate, following this fallback rule:
   - If an exact date is stated (e.g. "15th March 2026" or "15/03/2026"), return it in a clear, human-readable form, e.g. "15 Mar 2026".
   - If the certificate covers a range or duration (common for courses), and exact start/end dates are given, return the range, e.g. "10 Jan 2026 - 28 Feb 2026".
   - If exact day-level dates are NOT given but a month and year are (e.g. only "March 2026" appears, or the certificate implies a period like a semester), fall back to month-year granularity, e.g. "Mar 2026" or a month-year range like "Jan-Mar 2026".
   - If only a year is available, return just the year, e.g. "2026".
   - If no date information at all is present, use an empty string "".
   - Never fabricate a date that isn't supported by the text.

General rules:
- Every value must be a plain string (use "" for unknown/missing, never null, never omit a key).
- Do not add any keys beyond the six listed above.
- Do not wrap the JSON in markdown code fences (no \`\`\`json).
- Base every field strictly on the text provided below — do not use outside knowledge about the event or institution named, and do not infer details that aren't textually supported.

Certificate text (raw OCR/PDF extraction):
"""
{{OCR_TEXT}}
"""`;

// Phase 2 will do: GEMINI_EXTRACTION_PROMPT.replace('{{OCR_TEXT}}', extractedText)
// and send the result as the Gemini request prompt (e.g. via generateContent).

module.exports = { GEMINI_EXTRACTION_PROMPT };
