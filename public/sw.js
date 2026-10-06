// ============================================
// SERVICE WORKER
// Caches static assets for offline use
// ============================================

const CACHE_NAME = "review-iabd-v3.6.2";
const STATIC_CACHE = "review-iabd-static-v3.6.2";
const RUNTIME_CACHE = "review-iabd-runtime-v3.6.2";
const RUNTIMES_CACHE = "review-iabd-runtimes-v3.6.2";

// Assets to cache on install (core HTML pages)
const urlsToCache = [
  "/",
  "/onboarding",
  "/practice",
  "/exam",
  "/quiz",
  "/favorites",
  "/exams",
  "/mistakes",
  "/import",
  "/mock-exams",
  "/settings",
  "/manifest.json",
];

// Install event - cache core pages + their JS/CSS chunks
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(urlsToCache);

      // Pré-cache aussi les chunks JS/CSS de chaque page : le HTML seul ne
      // suffit pas hors ligne, sans ses chunks la page plante (erreur client).
      try {
        const chunkUrls = new Set();
        for (const url of urlsToCache) {
          const res = await cache.match(url);
          if (!res) continue;
          const type = res.headers.get("content-type") || "";
          if (!type.includes("text/html")) continue;
          const html = await res.text();
          const refs = html.match(/\/_next\/static\/[^"'\s\\]+?\.(?:js|css)/g) || [];
          refs.forEach((u) => chunkUrls.add(u));
        }
        if (chunkUrls.size > 0) {
          console.log("[SW] Precaching " + chunkUrls.size + " route chunks...");
          await cache.addAll([...chunkUrls]);
          console.log("[SW] Route chunks precached.");
        }
      } catch (err) {
        console.warn("[SW] Chunk precache warning (non fatal):", err);
      }
    })()
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME &&
            cacheName !== STATIC_CACHE &&
            cacheName !== RUNTIME_CACHE &&
            cacheName !== RUNTIMES_CACHE
          ) {
            console.log("[SW] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

// Listen for messages from clients (e.g., to skip waiting, show notification)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log("[SW] Received SKIP_WAITING message, activating immediately");
    self.skipWaiting();
  } else if (event.data && event.data.type === "CLAIM_CLIENTS") {
    console.log("[SW] Received CLAIM_CLIENTS message, claiming all clients");
    self.clients.claim();
  } else if (event.data && event.data.type === "PRECACHE_URLS") {
    // Pré-téléchargement des runtimes depuis le contexte du SW : les gros
    // fichiers (.wasm, .zip, .whl) sont récupérés ICI et mis dans
    // RUNTIMES_CACHE, sans passer par un téléchargement visible côté page.
    const port = event.ports && event.ports[0];
    const urls = (event.data.urls || []);
    event.waitUntil(
      (async () => {
        const cache = await caches.open(RUNTIMES_CACHE);
        let done = 0;
        for (const u of urls) {
          try {
            let res = await fetch(u);
            if (res && res.status < 400) {
              await cache.put(u, res.clone());
            } else {
              if (port) port.postMessage({ stage: `échec ${u} (${res ? res.status : "?"})` });
            }
          } catch (e) {
            if (port) port.postMessage({ stage: `échec ${u} : ${String(e).slice(0, 80)}` });
          }
          done++;
          if (port) port.postMessage({ stage: `préchargé ${done}/${urls.length}` });
        }
        if (port) port.postMessage({ stage: "OK", done });
      })()
    );
  } else if (event.data && event.data.type === "REQLOG") {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ reqlog: REQ_LOG.slice(), controlled: self.crossOriginIsolated });
  } else if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    console.log("[SW] Received SHOW_NOTIFICATION message:", event.data);
    showNotification(event.data.payload);
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.notification.data);
  event.notification.close();

  // Extract data from notification
  const data = event.notification.data || {};

  // If there's a URL to open, open it
  if (data.url) {
    event.waitUntil(clients.openWindow(data.url));
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
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "quiz-notification",
    data: {
      url: payload.url || "/",
      ...payload.data,
    },
    requireInteraction: false,
    silent: false,
  };

  self.registration
    .showNotification(payload.title || "Quiz prêt !", options)
    .then(() => {
      console.log("[SW] Notification shown successfully");
    })
    .catch((error) => {
      console.error("[SW] Failed to show notification:", error);
    });
}

// Journal des requêtes runtime (diagnostic hors ligne)
const REQ_LOG = [];
function logRequest(url) {
  if (REQ_LOG.length > 80) REQ_LOG.shift();
  REQ_LOG.push(url);
}

// Helper: Determine request type
function getRequestType(request) {
  const url = new URL(request.url);

  // API requests
  if (url.pathname.startsWith("/api/") || url.host.includes("openrouter.ai")) {
    return "api";
  }

  // Google Fonts - cache them!
  if (
    url.host.includes("fonts.googleapis.com") ||
    url.host.includes("fonts.gstatic.com")
  ) {
    return "font";
  }

  // Runtimes WASM, workers, banque de questions et épreuves réelles :
  // cache-first dans un cache dédié (gros fichiers, stables)
  if (
    url.pathname.startsWith("/runtimes/") ||
    url.pathname.startsWith("/questions/") ||
    url.pathname.startsWith("/exams/")
  ) {
    return "runtime-asset";
  }

  // Fiches cheat sheets : Network First (petits fichiers qu'on enrichit),
  // secours cache hors ligne.
  if (url.pathname.startsWith("/cheatsheets/")) {
    return "worker-script";
  }

  // Scripts de workers : Network First (fichiers minuscules) pour qu'une mise
  // à jour de l'app rafraîchisse toujours le code des workers ; le cache sert
  // de secours hors ligne.
  if (url.pathname.startsWith("/workers/")) {
    return "worker-script";
  }

  // Next.js static assets
  if (url.pathname.includes("/_next/static/")) {
    return "static";
  }

  // Static assets (CSS, JS, images, fonts)
  if (
    url.pathname.match(
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/,
    )
  ) {
    return "static";
  }

  // HTML documents
  if (request.headers.get("accept")?.includes("text/html")) {
    return "document";
  }

  // Next.js RSC prefetch requests - DO NOT intercept these offline!
  // Let them fail silently, don't cache them
  if (url.searchParams.has("_rsc")) {
    return "rsc-prefetch";
  }

  return "other";
}

// Helper: Create an offline response
function createOfflineResponse() {
  return new Response("Offline - No cache available", {
    status: 503,
    statusText: "Service Unavailable",
    headers: new Headers({ "Content-Type": "text/plain" }),
  });
}

// Helper: Check if request is a prefetch request
function isPrefetchRequest(request) {
  return (
    request.mode === "navigate" && request.headers.get("purpose") === "prefetch"
  );
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
  if (requestType === "api") {
    return;
  }

  // Runtimes / banque / épreuves : Cache First (offline critique)
  if (requestType === "runtime-asset") {
    logRequest(request.url);
    event.respondWith(
      caches.open(RUNTIMES_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((response) => {
              if (response && response.status < 400) {
                const responseToCache = response.clone();
                cache.put(request, responseToCache).catch(() => {});
              }
              return response;
            })
            .catch(() => createOfflineResponse());
        });
      }),
    );
    return;
  }

  // Worker scripts : Network First (fraîcheur) avec secours cache
  if (requestType === "worker-script") {
    logRequest(request.url);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status < 400) {
            const clone = response.clone();
            caches.open(RUNTIMES_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || createOfflineResponse())
        ),
    );
    return;
  }

  // Static assets - Cache First (for offline support)
  if (requestType === "static") {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            console.log("[SW] Cache hit (static):", request.url);
            return response;
          }

          console.log("[SW] Cache miss (static), fetching:", request.url);
          return fetch(request)
            .then((response) => {
              // Check if we got a valid response
              if (!response || response.status >= 400) {
                console.error(
                  "[SW] Invalid response for:",
                  request.url,
                  response?.status,
                );
                return response;
              }

              // Clone the response before caching
              const responseToCache = response.clone();
              cache.put(request, responseToCache).catch((err) => {
                console.warn("[SW] Failed to cache:", request.url, err);
              });
              return response;
            })
            .catch((error) => {
              console.error(
                "[SW] Fetch failed for static asset:",
                request.url,
                error,
              );
              return createOfflineResponse();
            });
        });
      }),
    );
    return;
  }

  // Fonts - Cache First (critical for text display)
  if (requestType === "font") {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            console.log("[SW] Cache hit (font):", request.url);
            return response;
          }

          console.log("[SW] Cache miss (font), fetching:", request.url);
          return fetch(request)
            .then((response) => {
              // Check if we got a valid response
              if (!response || response.status >= 400) {
                console.error(
                  "[SW] Invalid response for font:",
                  request.url,
                  response?.status,
                );
                return response;
              }

              // Clone the response before caching
              const responseToCache = response.clone();
              cache.put(request, responseToCache).catch((err) => {
                console.warn("[SW] Failed to cache font:", request.url, err);
              });
              return response;
            })
            .catch((error) => {
              console.error("[SW] Fetch failed for font:", request.url, error);
              return new Response("", {
                status: 503,
                statusText: "Service Unavailable",
              });
            });
        });
      }),
    );
    return;
  }

  // HTML documents - Network First, fallback to Cache
  if (requestType === "document") {
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
          console.log("[SW] Network failed, trying cache for:", request.url);
          return caches.match(request).then((response) => {
            if (response) {
              console.log("[SW] Serving from cache:", request.url);
              return response;
            }

            // For quiz pages with session parameters, try to serve the base /quiz page
            const url = new URL(request.url);
            if (url.pathname === "/quiz" && url.searchParams.has("session")) {
              console.log(
                "[SW] Quiz page with session not cached, trying base /quiz page",
              );
              return caches.match("/quiz").then((quizResponse) => {
                if (quizResponse) {
                  console.log(
                    "[SW] Serving base /quiz page for session request",
                  );
                  return quizResponse;
                }
                // If no base quiz page either, go to the home page
                if (request.mode === "navigate") {
                  return caches.match("/").then((homeResponse) => {
                    return homeResponse || createOfflineResponse();
                  });
                }
                return createOfflineResponse();
              });
            }

            // Return the cached home page for navigation requests
            if (request.mode === "navigate") {
              return caches.match("/").then((homeResponse) => {
                return homeResponse || createOfflineResponse();
              });
            }
            // For other requests, return offline response
            return createOfflineResponse();
          });
        }),
    );
    return;
  }

  // Next.js RSC prefetch requests - DO NOT intercept offline
  // Let them fail silently so they don't affect navigation
  if (requestType === "rsc-prefetch") {
    // Don't call event.respondWith() - let the request fail naturally
    console.log(
      "[SW] Ignoring RSC prefetch request (will fail silently if offline):",
      request.url,
    );
    return;
  }

  // Other requests - Network First
  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() =>
        caches
          .match(request)
          .then((response) => response || createOfflineResponse()),
      ),
  );
});

// ============================================
// BACKGROUND FETCH (Android - continues fetch when app is backgrounded)
// ============================================

if ("backgroundfetch" in self) {
  // Background Fetch succeeded
  self.addEventListener("backgroundfetchsuccess", (event) => {
    console.log("[SW] Background fetch succeeded:", event.registration.id);

    event.waitUntil(
      (async () => {
        try {
          const records = await event.registration.matchAll();

          for (const record of records) {
            const response = await record.responseReady;
            if (!response) continue;

            const responseText = await response.text();

            // Extract session info from the fetch ID
            // Format: quiz-batch-{sessionId}-batch{batchIndex}
            const fetchId = event.registration.id;
            const batchMatch = fetchId.match(/quiz-batch-(.+)-batch(\d+)/);

            if (batchMatch) {
              const sessionId = batchMatch[1];
              const batchIndex = parseInt(batchMatch[2], 10);

              console.log("[SW] Background fetch complete for session:", sessionId, "batch:", batchIndex);

              // Notify all clients about the completed batch
              const allClients = await self.clients.matchAll();
              allClients.forEach((client) => {
                client.postMessage({
                  type: "BACKGROUND_BATCH_COMPLETE",
                  sessionId,
                  batchIndex,
                  responseData: responseText,
                });
              });
            }
          }

          // Show completion notification
          self.registration.showNotification("Quiz prêt !", {
            body: "La génération de questions s'est terminée en arrière-plan.",
            icon: "/icon-192.png",
            tag: "bg-fetch-complete",
          });
        } catch (error) {
          console.error("[SW] Background fetch success handler error:", error);
        }
      })()
    );
  });

  // Background Fetch failed
  self.addEventListener("backgroundfetchfail", (event) => {
    console.error("[SW] Background fetch failed:", event.registration.id);

    event.waitUntil(
      (async () => {
        const fetchId = event.registration.id;
        const batchMatch = fetchId.match(/quiz-batch-(.+)-batch(\d+)/);

        if (batchMatch) {
          const sessionId = batchMatch[1];

          // Notify clients about the failure
          const allClients = await self.clients.matchAll();
          allClients.forEach((client) => {
            client.postMessage({
              type: "BACKGROUND_BATCH_FAILED",
              sessionId,
              fetchId,
            });
          });
        }
      })()
    );
  });

  // Background Fetch click (user tapped the UI)
  self.addEventListener("backgroundfetchclick", (event) => {
    console.log("[SW] Background fetch clicked:", event.registration.id);

    event.waitUntil(
      (async () => {
        const allClients = await self.clients.matchAll({ type: "window" });
        if (allClients.length > 0) {
          // Focus existing window
          allClients[0].focus();
        } else {
          // Open new window
          self.clients.openWindow("/practice");
        }
      })()
    );
  });
}
