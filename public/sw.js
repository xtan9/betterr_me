// public/sw.js — Push notification service worker
// Handles push and notificationclick only. No fetch interception (INFR-08).

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const { title, body, icon, url, tag } = data;
  event.waitUntil(
    self.registration.showNotification(title || 'BetterR.Me', {
      body: body || '',
      icon: icon || '/icon-192.png',
      tag: tag || undefined,
      data: { url: url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
