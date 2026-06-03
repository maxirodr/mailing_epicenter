importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// PWA caching (merged with OneSignal service worker)
const CACHE_NAME = 'nexomail-v1';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.url.includes('/api/') || request.url.includes('/broadcasting/') || request.url.includes('onesignal')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  if (request.url.includes('/assets/') || request.url.includes('.svg') || request.url.includes('.png')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
