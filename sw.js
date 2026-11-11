const CACHE = 'redline-static-v5-drawer-responsive';
const ASSETS = ['/', '/index.html', '/styles.css', '/src/main.js', '/src/utils.js', '/src/store.js', '/src/files.js', '/config.js', '/manifest.webmanifest', '/assets/icons/redline-racing.svg', '/assets/icons/redline-192.png', '/assets/icons/redline-512.png', '/assets/vehicles/racecar.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Non memorizzare API, identità, documenti o dati personali.
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
