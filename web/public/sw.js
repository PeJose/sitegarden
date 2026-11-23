// Cache-first for immutable files (rendered tiles, previews, world JSON, built assets); network-first with a short timeout for the
// release manifest and the page itself, so a revisit with no network still shows the last map.
const CACHE = 'sitegarden-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

const put = async (req, res) => { if (res.ok) (await caches.open(CACHE)).put(req, res.clone()); return res }
const cacheFirst = async (req) => (await caches.match(req)) ?? put(req, await fetch(req))
const networkFirst = async (req) => {
  const net = fetch(req).then((res) => put(req, res))
  const slow = new Promise((r) => setTimeout(r, 2000)).then(() => caches.match(req).then((c) => c ?? net))
  return Promise.race([net, slow]).catch(() => caches.match(req))
}

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  if (u.pathname.startsWith('/a/') || u.pathname.startsWith('/assets/')) e.respondWith(cacheFirst(e.request))
  else if (u.pathname === '/api/release' || e.request.mode === 'navigate') e.respondWith(networkFirst(e.request))
})
