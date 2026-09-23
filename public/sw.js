const CACHE = 'hecate-shell-v5'
const SHELL = ['/', '/leaderboard', '/manifest.webmanifest', '/icon.svg?v=2']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url)

  // Let the browser fetch map styles, tiles, glyphs, and sprites directly.
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
