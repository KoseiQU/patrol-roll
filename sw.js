/* パとるロール — Service Worker (P1) */
const V = "pr-v1";
const TILE_CACHE = V + "-tiles";
const TILE_MAX = 150;

const SAME_ORIGIN_PATHS = [
  "/", "/index.html",
  "/manifest.webmanifest",
  "/css/theme.css", "/css/app.css",
  "/js/store.js", "/js/ai.js", "/js/seed.js",
  "/js/ui.js", "/js/map.js", "/js/post.js",
  "/js/detail.js", "/js/profile.js", "/js/onboarding.js",
  "/js/notify.js", "/js/dashboard.js", "/js/settings.js",
  "/js/selftest.js", "/js/app.js",
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"
];

const CDN_ORIGINS = [
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

const TILE_ORIGIN = "basemap.cartocdn.com";

/* ── install: pre-cache static assets ──────────────── */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V).then(c => c.addAll(SAME_ORIGIN_PATHS.filter(p => p !== "/css/app.css")))
      .catch(() => {}) // ignore missing files during dev
      .then(() => self.skipWaiting())
  );
});

/* ── activate: purge old caches ────────────────────── */
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== V && k !== TILE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── fetch ──────────────────────────────────────────── */
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // tile: cache-first + 150 cap
  if (url.hostname === TILE_ORIGIN) {
    e.respondWith(tileFirst(e.request));
    return;
  }

  // CDN: cache-first
  if (CDN_ORIGINS.includes(url.hostname)) {
    e.respondWith(cacheFirst(e.request, V));
    return;
  }

  // same-origin: network-first, fallback cache
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(e.request, V));
    return;
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function tileFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      // enforce 150-tile cap
      const keys = await cache.keys();
      if (keys.length >= TILE_MAX) {
        // delete oldest TILE_MAX/10 entries
        const toDelete = keys.slice(0, Math.floor(TILE_MAX / 10));
        await Promise.all(toDelete.map(k => cache.delete(k)));
      }
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response("", { status: 503 });
  }
}
