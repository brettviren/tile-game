// Service worker for the installed (PWA) version.
//
// All paths here are relative to the worker's own location, so the same file
// works whether the app is served from the site root (local `deno task serve`
// and the Capacitor webview) or from a subpath such as /tile-game on GitHub
// Pages.

const CACHE_NAME = "exponentile-cache-v3"

// The shell to keep for offline use. Kept deliberately small: the hashed build
// assets under _next are cached on demand instead, since their names change
// with every build.
const urlsToCache = ["./", "./manifest.json", "./exponentile/"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // One missing entry must not fail the whole install.
      .then((cache) =>
        Promise.allSettled(urlsToCache.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  // Pages are fetched from the network first. A cache-first shell would go on
  // serving an old page that points at build assets which no longer exist,
  // which shows up as a blank screen after a rebuild.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match("./")),
        ),
    )
    return
  }

  // Everything else is content addressed by build hash, so the cache can be
  // trusted; anything new is fetched and kept for offline use.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
