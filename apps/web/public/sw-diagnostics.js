// Dev-only service worker for /diagnostics (roadmap 0.6). Replaced by the app's real worker in 3.3/5.8.
// iOS requires every push to show a notification, so this always does.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Chắt Chiu', {
      body: data.body || '',
      tag: data.tag || 'diagnostics',
      icon: '/icons/icon-192x192.png',
      data: { url: data.url || '/diagnostics' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/diagnostics'
  event.waitUntil(self.clients.openWindow(url))
})
