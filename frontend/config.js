// Public runtime config for the frontend.
// No secrets here — the Web App URL is inherently public (the backend is
// deployed with "Anyone" access, per the brief's no-login requirement), and
// the Gemini API key lives server-side only, in Apps Script Script
// Properties (see backend/Code.gs).
const CONFIG = {
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbwFBaqD3bP5IqWn0MWJkSkDKZSO0hF1WWVQdSbT_XNPSLBRu0eeLJ6eeFvhTfwMJP0W0Q/exec'
};
