importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js')

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())

firebase.initializeApp({
  apiKey: "AIzaSyAJFqq9jMrc2RgkceappeGt9EJ2bM2xKBI",
  authDomain: "drivepad-86fe1.firebaseapp.com",
  databaseURL: "https://drivepad-86fe1-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "drivepad-86fe1",
  storageBucket: "drivepad-86fe1.firebasestorage.app",
  messagingSenderId: "221725287898",
  appId: "1:221725287898:web:59ee63287a825801104ce3"
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'DrivePad'
  const options = {
    body: payload.notification?.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.data?.tag || 'admin',
    data: payload.data || {}
  }
  self.registration.showNotification(title, options)
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const data = e.notification.data || {}
  const target = data.url || 'https://drivepad-admin.web.app'
  const fullUrl = target.startsWith('http') ? target : ('https://drivepad-admin.web.app' + target)
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith('https://drivepad-admin.web.app') && 'focus' in c) {
          c.focus()
          return c.navigate(fullUrl)
        }
      }
      if (clients.openWindow) return clients.openWindow(fullUrl)
    })
  )
})
