const CACHE_NAME = "experience-offline-v1"
const OFFLINE_PAGE = "/experience-offline.html"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_PAGE)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith("experience-offline-") && name !== CACHE_NAME).map((name) => caches.delete(name)))),
    self.clients.claim(),
  ]))
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (event.request.mode !== "navigate" || url.origin !== self.location.origin || !url.pathname.startsWith("/experience/")) return
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE_PAGE)) || Response.error()))
})
