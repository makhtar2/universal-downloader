const CACHE_NAME = 'omnidownloader-v1';
const ASSETS = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/icon.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  // Let the browser handle non-GET requests (like API calls)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
