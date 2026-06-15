// ============================================================
//  Pickleball Trivia Challenge — Service Worker
//  Version: 1.0.0
//  Strategy: Cache-First for all assets (full offline support)
// ============================================================

const CACHE_NAME = 'pickleball-trivia-v1';

// All files to cache on install
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  // Google Fonts (cached on first load)
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700;800;900&display=swap'
];

// ── INSTALL: cache all core assets ──────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing Pickleball Trivia v1...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching core assets');
        // Cache local assets strictly; fonts best-effort
        const localAssets = ASSETS_TO_CACHE.filter(url => !url.startsWith('http'));
        const externalAssets = ASSETS_TO_CACHE.filter(url => url.startsWith('http'));
        return cache.addAll(localAssets).then(() => {
          // Cache external (fonts) with best-effort — don't fail install if offline
          return Promise.allSettled(
            externalAssets.map(url =>
              fetch(url, { mode: 'no-cors' })
                .then(res => cache.put(url, res))
                .catch(() => console.log('[SW] Could not cache external:', url))
            )
          );
        });
      })
      .then(() => {
        console.log('[SW] Install complete — taking control immediately');
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: clean up old caches ───────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Now controlling all clients');
      return self.clients.claim();
    })
  );
});

// ── FETCH: Cache-First strategy ─────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and non-http requests
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // ✅ Cache hit — return immediately (works offline)
        if (cachedResponse) {
          // Background refresh for HTML to stay up to date
          if (event.request.destination === 'document') {
            const fetchPromise = fetch(event.request)
              .then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                  const responseClone = networkResponse.clone();
                  caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                  });
                }
                return networkResponse;
              })
              .catch(() => cachedResponse);
            // Return cached version immediately, refresh in background
            return cachedResponse;
          }
          return cachedResponse;
        }

        // ❌ Not in cache — fetch from network and cache it
        return fetch(event.request)
          .then(networkResponse => {
            // Don't cache bad responses or opaque responses for local assets
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });

            return networkResponse;
          })
          .catch(() => {
            // Offline fallback — return the main app shell
            console.log('[SW] Offline — serving cached app shell');
            return caches.match('/index.html');
          });
      })
  );
});

// ── MESSAGE: handle skip-waiting from app ───────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
