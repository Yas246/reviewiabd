// ============================================
// SERVICE WORKER
// Caches static assets for offline use
// ============================================

const CACHE_NAME = "review-iabd-v2.1.0";
const STATIC_CACHE = "review-iabd-static-v2.1.0";
const RUNTIME_CACHE = "review-iabd-runtime-v2.1.0";

// Assets to cache on install (core HTML pages)
const urlsToCache = [
  "/",
  "/onboarding",
  "/practice",
  "/exam",
  "/quiz",
  "/favorites",
  "/offline",
  "/exams",
  "/settings",
  "/manifest.json",
];

// Install event - cache core pages
self.addEventListener("install", (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching core pages');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Listen for messages from clients (e.g., to skip waiting)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log('[SW] Received SKIP_WAITING message, activating immediately');
    self.skipWaiting();
  }
});

// Helper: Determine request type
function getRequestType(request) {
  const url = new URL(request.url);

  // API requests
  if (url.pathname.startsWith('/api/') || url.host.includes('openrouter.ai')) {
    return 'api';
  }

  // Google Fonts - cache them!
  if (url.host.includes('fonts.googleapis.com') || url.host.includes('fonts.gstatic.com')) {
    return 'font';
  }

  // Next.js static assets
  if (url.pathname.includes('/_next/static/')) {
    return 'static';
  }

  // Static assets (CSS, JS, images, fonts)
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return 'static';
  }

  // HTML documents and Next.js RSC requests
  if (request.headers.get('accept')?.includes('text/html') || url.searchParams.has('_rsc')) {
    return 'document';
  }

  return 'other';
}

// Helper: Create an offline response
function createOfflineResponse() {
  return new Response('Offline - No cache available', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({ 'Content-Type': 'text/plain' })
  });
}

// Fetch event - serve from cache with appropriate strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestType = getRequestType(request);

  // Don't intercept non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Don't cache API requests - let them fail naturally
  if (requestType === 'api') {
    return;
  }

  // Static assets - Cache First (for offline support)
  if (requestType === 'static') {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            console.log('[SW] Cache hit (static):', request.url);
            return response;
          }

          console.log('[SW] Cache miss (static), fetching:', request.url);
          return fetch(request).then((response) => {
            // Check if we got a valid response
            if (!response || response.status >= 400) {
              console.error('[SW] Invalid response for:', request.url, response?.status);
              return response;
            }

            // Clone the response before caching
            const responseToCache = response.clone();
            cache.put(request, responseToCache).catch((err) => {
              console.warn('[SW] Failed to cache:', request.url, err);
            });
            return response;
          }).catch((error) => {
            console.error('[SW] Fetch failed for static asset:', request.url, error);
            return createOfflineResponse();
          });
        });
      })
    );
    return;
  }

  // Fonts - Cache First (critical for text display)
  if (requestType === 'font') {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            console.log('[SW] Cache hit (font):', request.url);
            return response;
          }

          console.log('[SW] Cache miss (font), fetching:', request.url);
          return fetch(request).then((response) => {
            // Check if we got a valid response
            if (!response || response.status >= 400) {
              console.error('[SW] Invalid response for font:', request.url, response?.status);
              return response;
            }

            // Clone the response before caching
            const responseToCache = response.clone();
            cache.put(request, responseToCache).catch((err) => {
              console.warn('[SW] Failed to cache font:', request.url, err);
            });
            return response;
          }).catch((error) => {
            console.error('[SW] Fetch failed for font:', request.url, error);
            return new Response('', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
      })
    );
    return;
  }

  // HTML documents and Next.js RSC requests - Network First, fallback to Cache
  if (requestType === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the response
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache).catch(() => {
              // Cache might be full, ignore error
            });
          });
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          console.log('[SW] Network failed, trying cache for:', request.url);
          return caches.match(request).then((response) => {
            if (response) {
              console.log('[SW] Serving from cache:', request.url);
              return response;
            }
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/offline').then((offlineResponse) => {
                return offlineResponse || createOfflineResponse();
              });
            }
            // For RSC prefetch requests, just return an offline response
            return createOfflineResponse();
          });
        })
    );
    return;
  }

  // Other requests - Network First
  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => caches.match(request).then((response) => response || createOfflineResponse()))
  );
});
