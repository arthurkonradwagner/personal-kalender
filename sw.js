/* Service Worker: App läuft auch offline. Bei Änderungen VERSION erhöhen. */
const VERSION = 'pk-v20';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/firebase-config.js', 'js/util.js', 'js/sound.js', 'js/store.js', 'js/recurrence.js', 'js/holidays.js', 'js/ics.js',
  'js/views.js', 'js/ai.js', 'js/projects.js', 'js/todos.js', 'js/dialogs.js', 'js/subscriptions.js', 'js/sync.js', 'js/app.js',
  'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Firebase-SDK (versioniert) aus dem Cache, Firestore/Auth-Anfragen nie anfassen
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(caches.open(VERSION).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Netz zuerst und am Browser-Zwischenspeicher vorbei (damit Updates sofort ankommen), offline aus dem Cache
  const fresh = e.request.mode === 'navigate' ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(fetch(fresh).then((r) => {
    const copy = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
