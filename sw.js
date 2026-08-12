const CACHE_NAME = 'zweicheck-phase3-v16';
const SHELL = [
  '/',
  '/index.html',
  '/app.css?v=2',
  '/app.js?v=7',
  '/deep-link.js?v=1',
  '/push-client.js?v=1',
  '/activity-center.css?v=2',
  '/activity-center.js?v=2',
  '/trust-routing.css?v=1',
  '/trust-routing.js?v=3',
  '/escalation.css?v=2',
  '/escalation-client.js?v=4',
  '/account.css?v=2',
  '/account-client.js?v=2',
  '/privacy',
  '/privacy-choices',
  '/support',
  '/manifest.webmanifest',
  '/assets/brand/zweicheck-mark.svg',
  '/assets/brand/zweicheck-logo-horizontal.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'ZweiCheck', body: event.data?.text() || 'Es gibt eine neue Benachrichtigung.' };
  }

  const title = data.title || 'ZweiCheck';
  const options = {
    body: data.body || 'Es gibt eine neue Benachrichtigung.',
    icon: '/assets/brand/zweicheck-mark.svg',
    badge: '/assets/brand/zweicheck-mark.svg',
    tag: data.tag || 'zweicheck-notification',
    renotify: true,
    data: {
      url: data.url || '/',
      checkId: data.checkId || null,
      eventType: data.eventType || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requested = event.notification.data?.url || '/';
  let targetUrl = new URL('/', self.location.origin).href;

  try {
    const parsed = new URL(requested, self.location.origin);
    if (parsed.origin === self.location.origin) targetUrl = parsed.href;
  } catch {
    // Ungültige Ziele führen sicher zur Startseite.
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(targetUrl);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
