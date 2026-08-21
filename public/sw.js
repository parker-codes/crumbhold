// Offline cache for the build. The registration URL carries the build id (see
// vite.config.ts), so each deploy installs under a fresh cache name and the
// activate handler below drops every older one.
const CACHE = `crumbhold-${new URL(self.location.href).searchParams.get('v') ?? 'dev'}`;
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  // Vercel serves analytics and insights from here. Leave them on the network;
  // a build-pinned cache would keep replaying one deploy's copy.
  if (url.pathname.startsWith('/_vercel/')) return;

  // The document must come from the network first. Served cache-first it would
  // pin the deploy that installed this worker: the newer index.html — the only
  // file naming the new bundles and the new build id — would never be fetched,
  // and no later deploy could ever reach a returning player.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Everything else is content-hashed or versioned, so cache-first is safe.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
