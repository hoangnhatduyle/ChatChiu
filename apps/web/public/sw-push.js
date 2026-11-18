// Push notification worker (SPEC-NT-001). Registered at scope /sw-push/ so it never replaces the app's own
// worker at /. Push events go to the registration that made the subscription, whatever pages it controls.
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
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: data.tag || 'inventory-expiration',
      data: { url: data.url || '/stock' },
    }),
  )
})

// Only a page of this app can be opened: a payload url on another origin falls back to the stock list.
function targetUrl(value) {
  const fallback = new URL('/stock', self.location.origin)
  try {
    const url = new URL(value || '/stock', self.location.origin)
    return (url.origin === self.location.origin ? url : fallback).href
  } catch {
    return fallback.href
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = targetUrl(event.notification.data && event.notification.data.url)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const app = windows.find((w) => 'focus' in w)
      if (app) {
        // navigate() only works for pages this worker controls (it controls none: its scope is /sw-push/),
        // so a refusal falls through to opening the page.
        try {
          const moved = await app.navigate(url)
          if (moved) return moved.focus()
        } catch {
          /* open it below */
        }
      }
      return clients.openWindow ? clients.openWindow(url) : undefined
    }),
  )
})
