// ============================================
// SERVICE WORKER
// Caches static assets for offline use
// ============================================

const CACHE_NAME = "review-iabd-v2.3.0";
const STATIC_CACHE = "review-iabd-static-v2.3.0";
const RUNTIME_CACHE = "review-iabd-runtime-v2.3.0";

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

// Listen for messages from clients (e.g., to skip waiting, show notification)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log('[SW] Received SKIP_WAITING message, activating immediately');
    self.skipWaiting();
  } else if (event.data && event.data.type === "CLAIM_CLIENTS") {
    console.log('[SW] Received CLAIM_CLIENTS message, claiming all clients');
    self.clients.claim();
  } else if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    console.log('[SW] Received SHOW_NOTIFICATION message:', event.data);
    showNotification(event.data.payload);
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log('[SW] Notification clicked:', event.notification.data);
  event.notification.close();

  // Extract data from notification
  const data = event.notification.data || {};

  // If there's a URL to open, open it
  if (data.url) {
    event.waitUntil(
      clients.openWindow(data.url)
    );
  }
});

/**
 * Show a notification to the user
 * @param {Object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {string} payload.icon - Notification icon URL
 * @param {string} payload.url - URL to open when clicked
 * @param {string} payload.tag - Notification tag (to replace previous notifications)
 */
function showNotification(payload) {
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/badge-72.png',
    tag: payload.tag || 'quiz-notification',
    data: {
      url: payload.url || '/',
      ...payload.data
    },
    requireInteraction: false,
    silent: false
  };

  self.registration.showNotification(payload.title || 'Quiz prêt !', options)
    .then(() => {
      console.log('[SW] Notification shown successfully');
    })
    .catch((error) => {
      console.error('[SW] Failed to show notification:', error);
    });
}

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

  // HTML documents
  if (request.headers.get('accept')?.includes('text/html')) {
    return 'document';
  }

  // Next.js RSC prefetch requests - DO NOT intercept these offline!
  // Let them fail silently, don't cache them
  if (url.searchParams.has('_rsc')) {
    return 'rsc-prefetch';
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

// Helper: Check if request is a prefetch request
function isPrefetchRequest(request) {
  return request.mode === 'navigate' && request.headers.get('purpose') === 'prefetch';
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

  // HTML documents - Network First, fallback to Cache
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

            // For quiz pages with session parameters, try to serve the base /quiz page
            const url = new URL(request.url);
            if (url.pathname === '/quiz' && url.searchParams.has('session')) {
              console.log('[SW] Quiz page with session not cached, trying base /quiz page');
              return caches.match('/quiz').then((quizResponse) => {
                if (quizResponse) {
                  console.log('[SW] Serving base /quiz page for session request');
                  return quizResponse;
                }
                // If no base quiz page either, go to offline
                if (request.mode === 'navigate') {
                  return caches.match('/offline').then((offlineResponse) => {
                    return offlineResponse || createOfflineResponse();
                  });
                }
                return createOfflineResponse();
              });
            }

            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/offline').then((offlineResponse) => {
                return offlineResponse || createOfflineResponse();
              });
            }
            // For other requests, return offline response
            return createOfflineResponse();
          });
        })
    );
    return;
  }

  // Next.js RSC prefetch requests - DO NOT intercept offline
  // Let them fail silently so they don't affect navigation
  if (requestType === 'rsc-prefetch') {
    // Don't call event.respondWith() - let the request fail naturally
    console.log('[SW] Ignoring RSC prefetch request (will fail silently if offline):', request.url);
    return;
  }

  // Other requests - Network First
  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => caches.match(request).then((response) => response || createOfflineResponse()))
  );
});
