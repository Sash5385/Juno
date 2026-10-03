importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js')

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())

// Конфіг Firebase-проєкту Juno приходить у query при реєстрації (src/salon/push.js) — у файлі нічого не зашито.
let cfg = null
try { cfg = JSON.parse(new URL(self.location.href).searchParams.get('c') || 'null') } catch { cfg = null }
if (cfg) {
  firebase.initializeApp(cfg)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    // Data-only push (без top-level/webpush "notification") — title/body лежать у payload.data.
    const title = payload.data?.title || 'Juno'
    const isAlarm = payload.data?.alarm === '1'
    const options = {
      body: payload.data?.body || '',
      icon: '/icon-192.png',
      badge: '/badge-dp.png',
      // Унікальний tag, щоб наступне сповіщення не заміняло попереднє мовчки.
      tag: payload.data?.tag || ('admin-' + Date.now()),
      data: payload.data || {},
      requireInteraction: isAlarm,
      vibrate: isAlarm ? [400, 200, 400, 200, 400, 200, 400] : undefined,
    }
    self.registration.showNotification(title, options)
  })
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const data = e.notification.data || {}
  const origin = self.location.origin
  const target = data.url || origin
  const fullUrl = target.startsWith('http') ? target : (origin + target)
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(origin) && 'focus' in c) {
          c.focus()
          return c.navigate(fullUrl)
        }
      }
      if (clients.openWindow) return clients.openWindow(fullUrl)
    })
  )
})
