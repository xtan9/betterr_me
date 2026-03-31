// public/sw.js — Push notification service worker
// Handles push and notificationclick only. No fetch interception (INFR-08).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch (err) {
    console.error('[sw] Failed to parse push payload:', err);
    data = {};
  }
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
  const targetUrl = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    }).catch((err) => {
      console.error('[sw] notificationclick handler failed, opening new window:', err);
      return clients.openWindow(targetUrl);
    })
  );
});
