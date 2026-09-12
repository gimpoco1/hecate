const CACHE = 'hecate-shell-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

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

  // Map requests are streamed through Hecate's same-origin /map proxy. Keep
  // both those and any native-app cross-origin requests outside the app shell
  // cache so the service worker cannot strand MapLibre in a pending state.
  if (
    event.request.method !== 'GET'
    || requestUrl.origin !== self.location.origin
    || requestUrl.pathname.startsWith('/map/')
  ) return

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
