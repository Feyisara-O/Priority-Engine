/* ═══════════════════════════════════
   SmartFocus — Service Worker (sw.js)
   Enables full offline support via the Cache API
════════════════════════════════════ */

const CACHE_NAME = 'smartfocus-v3';

const BASE = '/Priority-Engine';

// Every file the app needs to run — cached on first visit
const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/css/style.css`,
  `${BASE}/js/script.js`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;600&family=DM+Serif+Display&family=JetBrains+Mono:wght@700&display=swap',
];

/* Install — cache all assets */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

/* Activate — delete outdated caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Fetch — serve from cache, fall back to network */
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
