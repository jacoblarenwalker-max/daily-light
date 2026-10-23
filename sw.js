// Daily Light service worker: offline app shell + Web Push. Never caches Supabase API traffic.
const VERSION = 'dl-v3';
const SHELL = ['./', './index.html', './app.js?v=dl3', './styles.css?v=dl3', './theme.js?v=dl1', './config.js',
  './manifest.webmanifest?v=dl1', './icon.svg?v=dl1', './icon-192.png?v=dl1', './apple-touch-icon.png?v=dl1', './favicon-32.png?v=dl1'];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => { for (const k of await caches.keys()) if (k !== VERSION && k.startsWith('dl-')) await caches.delete(k); await self.clients.claim(); })());
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === 'https://cdn.jsdelivr.net') {
    event.respondWith(caches.open(VERSION).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }));
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const c = await caches.open(VERSION);
    try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
    catch { return (await c.match(req)) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error()); }
  })());
});
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Daily Light', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'icon-192.png?v=dl1', badge: 'icon-192.png?v=dl1', data: { url: d.url || './#/today' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './#/today', self.registration.scope);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (win) { win.postMessage({ type: 'open', url: target.href }); return win.focus(); }
    return self.clients.openWindow(target.href);
  })());
});
