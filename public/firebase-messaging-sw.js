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
  // Data-only push (без top-level/webpush "notification") — payload.notification
  // тут завжди undefined, тому title/body й досі бралися з нього ніколи не
  // існуюче поле, і фонове сповіщення завжди показувалось порожнім ("DrivePad"
  // без тексту) — саме тому пуші виглядали як "нічого не прийшло".
  const title = payload.data?.title || 'DrivePad'
  const isAlarm = payload.data?.alarm === '1'
  const options = {
    body: payload.data?.body || '',
    // favicon.svg — це фіолетова блискавка: Android малював її значком праворуч у сповіщенні.
    // Велика іконка — логотип DrivePad; маленький монохромний значок у шторці/рядку стану — «DP».
    icon: '/icon-192.png',
    badge: '/badge-dp.png',
    // Без унікального tag кожне наступне сповіщення з тим самим tag (напр.
    // друге повідомлення в чаті поспіль) тихо ЗАМІНЮЄ попереднє на деяких
    // Android/Chrome без нового звуку/вібрації — виглядає, ніби пуш не прийшов.
    tag: payload.data?.tag || ('admin-' + Date.now()),
    data: payload.data || {},
    requireInteraction: isAlarm,
    vibrate: isAlarm ? [400, 200, 400, 200, 400, 200, 400] : undefined,
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
