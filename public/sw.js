// Shell caching only. The board itself is live data from Supabase and must
// never be served stale, so anything cross-origin goes straight to the network.
const CACHE = 'tgbp-shell-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })()
  )
})

/**
 * Drops cached build output that the current page no longer references.
 * Filenames are content-hashed, so every deploy would otherwise leave its
 * predecessor behind forever.
 */
async function prune(pageResponse) {
  let html
  try {
    html = await pageResponse.text()
  } catch {
    return
  }

  const keep = new Set(
    [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(
      (m) => new URL(m[1], self.location).href
    )
  )
  if (keep.size === 0) return

  const cache = await caches.open(CACHE)
  await Promise.all(
    (await cache.keys())
      .filter((req) => req.url.includes('/assets/') && !keep.has(req.url))
      .map((req) => cache.delete(req))
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Pages: network first, so a deploy is picked up immediately; the cache is
  // only there to open the app without a connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          const cache = await caches.open(CACHE)
          cache.put(request, fresh.clone())
          // The page names every asset this build needs, so it doubles as the
          // keep-list: anything else under /assets/ belongs to an old deploy.
          event.waitUntil(prune(fresh.clone()))
          return fresh
        } catch {
          const cached = await caches.match(request)
          return cached ?? caches.match(new URL('./', self.location).href)
        }
      })()
    )
    return
  }

  // Build output is content-hashed, so a hit is always the right file.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const fresh = await fetch(request)
      if (fresh.ok) {
        const cache = await caches.open(CACHE)
        cache.put(request, fresh.clone())
      }
      return fresh
    })()
  )
})
