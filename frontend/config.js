// Public runtime config for the frontend.
// No secrets here — the Web App URL is inherently public (the backend is
// deployed with "Anyone" access, per the brief's no-login requirement), and
// the Gemini API key lives server-side only, in Apps Script Script
// Properties (see backend/Code.gs).
const CONFIG = {
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbzB30G0ayV_29ZPHSUcQXtTLInV-V3yIP3Ow4xKVYKIsMKKlErvbhdDalGyxPHDR8Pl_A/exec'
};
