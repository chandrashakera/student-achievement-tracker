// Minimal app-shell cache so the PWA is installable and its shell loads
// offline. It does NOT cache API calls (Web App/Gemini) or the CDN OCR
// libraries — those need network regardless, and stale-caching a Web App
// response would be actively wrong for a data-submission app.
const CACHE_NAME = 'achievement-tracker-shell-v1';
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
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
