/* Leni Urdu Class service worker (generated at build time from src/sw-template.js).
 * - App shell and built assets: precached, cache-first.
 * - Lesson content (content/*.json): network-first, so edited or added lessons show up
 *   without a rebuild; cached copy used offline.
 * - Pages: network-first, falling back to the cached app shell offline.
 * Speech recognition, online voices and the AI tutor are network services and are not cached.
 */
const CACHE = 'bolo-urdu-5ef0263189';
const PRECACHE = ["./","./assets/noto-nastaliq-urdu-arabic-400-normal-Cc9vMttM.woff2","./assets/nunito-vietnamese-wght-normal-B55YuedR.woff2","./assets/nunito-latin-ext-wght-normal-DcJfvmGA.woff2","./assets/nunito-cyrillic-wght-normal-C3IBG1kp.woff2","./assets/nunito-latin-wght-normal-BaTF6Vo7.woff2","./assets/nunito-cyrillic-ext-wght-normal-BWI5zH9R.woff2","./assets/noto-nastaliq-urdu-arabic-400-normal-CL74E2ac.woff","./assets/index-D4Eiw6y1.css","./assets/index-ZCC5KOI6.js","./content/audio/index.json","./content/characters.json","./content/conversations.json","./content/course.json","./content/glossary.json","./content/pronunciation.json","./content/speaking.json","./content/units/bb1-first-words.json","./content/units/bb2-everyday.json","./content/units/bb3-actions.json","./content/units/u1-greetings.json","./content/units/u2-basics.json","./content/units/u3-everyday.json","./content/units/u4-getting-around.json","./content/units/u5-sentences.json","./content/units/u6-social.json","./content/units/u7-real-world.json","./content/units/u8-advanced.json","./content/units/wp1-word-pairs.json","./content/units/wu1-first-words.json","./content/units/wu2-food.json","./content/units/wu3-people.json","./content/units/wu4-numbers.json","./content/units/wu5-feelings-questions.json","./content/units/wu6-glue-actions.json","./content/units/wu7-everyday.json","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/icon.svg","./manifest.webmanifest"];

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
