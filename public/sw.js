const CACHE_NAME = 'vibriona-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './site.webmanifest',
  './favicon.ico',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('SW: Pre-cache failed:', err);
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Bypass cache for browser extensions and non-get requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;
      return fetch(event.request).then(networkResponse => {
          // Don't cache big assets or API calls here, just return
          return networkResponse;
      });
    }).catch(() => fetch(event.request))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});
