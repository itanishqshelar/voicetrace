const CACHE_NAME = "voicetrace-v1";
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Network-first for navigation, fallback to cached offline page.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request);
          if (cachedPage) return cachedPage;
          const offline = await caches.match(OFFLINE_URL);
          return offline || Response.error();
        }),
    );
    return;
  }

  // Stale-while-revalidate for static assets.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
