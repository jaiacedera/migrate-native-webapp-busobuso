const STATIC_CACHE_NAME = 'busobuso-static-v1';
const PRECACHE_URLS = ['/manifest.webmanifest', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png'];
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'image', 'font']);
const PUBLIC_STATIC_PATHS = new Set(PRECACHE_URLS);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheCoreAssets());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clearOldCaches());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (!isCacheableStaticAsset(request, url)) {
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function precacheCoreAssets() {
  const cache = await caches.open(STATIC_CACHE_NAME);
  await cache.addAll(PRECACHE_URLS);
}

async function clearOldCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName !== STATIC_CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName))
  );
  await self.clients.claim();
}

function isCacheableStaticAsset(request, url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    return false;
  }

  if (url.pathname.startsWith('/api/')) {
    return false;
  }

  if (url.pathname.startsWith('/_expo/')) {
    return CACHEABLE_DESTINATIONS.has(request.destination);
  }

  return PUBLIC_STATIC_PATHS.has(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    void refreshCache(cache, request);
    return cachedResponse;
  }

  return refreshCache(cache, request);
}

async function refreshCache(cache, request) {
  const response = await fetch(request);

  if (
    response.ok &&
    (response.type === 'basic' || response.type === 'default') &&
    request.method === 'GET'
  ) {
    await cache.put(request, response.clone());
  }

  return response;
}
