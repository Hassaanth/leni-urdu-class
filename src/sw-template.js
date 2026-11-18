/* Leni Urdu Class service worker (generated at build time from src/sw-template.js).
 * - App shell and built assets: precached, cache-first.
 * - Lesson content (content/*.json): network-first, so edited or added lessons show up
 *   without a rebuild; cached copy used offline.
 * - Pages: network-first, falling back to the cached app shell offline.
 * Speech recognition, online voices and the AI tutor are network services and are not cached.
 */
const CACHE = 'bolo-urdu-__CACHE_VERSION__';
const PRECACHE = __PRECACHE_LIST__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bolo-urdu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackUrl ?? request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackUrl ?? request, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Audio streams straight from the network: Safari needs real range (206) responses for media.
  if (url.pathname.endsWith('.mp3')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('./', self.registration.scope).href));
    return;
  }
  if (url.pathname.includes('/content/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
