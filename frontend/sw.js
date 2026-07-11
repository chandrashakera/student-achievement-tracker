// Minimal app-shell cache so the PWA is installable and its shell loads
// offline. It does NOT cache API calls (Web App/Gemini) or the CDN OCR
// libraries — those need network regardless, and stale-caching a Web App
// response would be actively wrong for a data-submission app.
//
// Network-first, cache-as-fallback (not cache-first): config.js holds
// WEBAPP_URL, which changes whenever a new Apps Script deployment (not just
// a new version) is created. A cache-first strategy would silently keep
// serving a stale WEBAPP_URL to already-installed clients indefinitely,
// with no visible error — bump CACHE_NAME on any shell-file change so
// clients that installed under the old strategy also pick this up.
const CACHE_NAME = 'achievement-tracker-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return; // let CDN/API requests pass straight through
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
