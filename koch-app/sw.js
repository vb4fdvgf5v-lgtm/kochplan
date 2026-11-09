// Offline-Cache für die App-Dateien. Bei Änderungen VERSION hochzählen.
// Eigener Name (kochplan-…), weil der Putzplan unter derselben Adresse eigene Caches hat.
const VERSION = 'kochplan-v9';
const FONTS = 'kochplan-fonts-v2';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png',
  'js/app.js', 'js/logic.js', 'js/seed.js', 'js/import.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Nur eigene alte Caches löschen, die des Putzplans nicht anfassen
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('kochplan-') && k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Eigene Dateien: erst Netz (damit Updates sofort ankommen), sonst Cache.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(e.request).then(hit => hit ?? fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
