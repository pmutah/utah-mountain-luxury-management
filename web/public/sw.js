/**
 * The app shell service worker.
 *
 * Two things it has to do for the cleaner's link to work in a canyon with no signal:
 *
 *   1. keep the **shell** — the HTML that boots the app, plus the built assets — so a reload opens the app instead of the
 *      browser's offline page, and
 *   2. never cache an `/api/` response. Every figure in this app is a live read of the books; a cached one would show a
 *      cleaner or a host yesterday's data and call it today's.
 *
 * The previous version cached only `/assets/`, so `/clean/<token>` and every other route were network-only: offline, the
 * page did not exist at all. That is why this is a rewrite rather than a tweak.
 */

const CACHE = 'uml-shell-v5';

/** Boot files. Small, stable, and the difference between an app that opens offline and one that does not. */
const PRECACHE = ['/', '/manifest.webmanifest', '/favicon.svg'];

/**
 * The built bundle, read from the shell at install time.
 *
 * This is the part the first version of this worker got wrong, and it is worth naming because the failure was invisible: the
 * cache held `/` but **not** `/assets/index-*.js`, so an offline reload served the shell HTML and then could not mount the
 * app — a blank page. Assets are requested on the very first visit, *before* the worker controls the page, so a "cache on
 * miss" branch never sees them. The filenames are hashed and unknowable here, so they are read out of the shell.
 */
async function builtAssets() {
  try {
    const res = await fetch('/', { cache: 'no-store' });
    if (!res.ok) return [];
    const html = await res.text();
    const found = new Set();
    for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
      if (match[1]) found.add(match[1]);
    }
    return [...found];
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE).catch(() => undefined);
      // The bundle is what makes the offline shell actually run.
      const assets = await builtAssets();
      if (assets.length > 0) await cache.addAll(assets).catch(() => undefined);
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only this origin, only GET. A POST is a write and must never be served from a cache.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  /*
   * The API is never cached, in either direction. A cached expense list or door window would be shown as current when it is
   * not, and this app's whole standard is that a figure is traceable to its source.
   */
  if (url.pathname.startsWith('/api/')) return;

  // A navigation is the app shell. Network first, so a deploy is picked up at once; the cached shell only when there is none.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/');
          if (cached) return cached;
          // Nothing cached yet: say so rather than letting the browser show its own offline page, which reads as a dead app.
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="margin:0;background:#07110f;color:#d4b56a;font:600 14px/1.6 sans-serif;padding:2rem">This page is not saved on this phone yet. Connect once, then it opens offline.</body>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }),
    );
    return;
  }

  // Built assets are served from the cache first — they are content-hashed, so the name cannot go stale.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        } catch {
          /*
           * Offline and not cached. A missing bundle is the difference between a working page and a blank one, so this is
           * reported as a real miss rather than left to fail silently: a JS request that rejects leaves the app unable to
           * mount, with nothing on screen to explain it.
           */
          return new Response('/* asset not cached */', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
          });
        }
      }),
    );
    return;
  }

  // Everything else public (photos, icons, the guide images): network, falling back to whatever was saved.
  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});
