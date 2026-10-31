// 소켓 알바 서비스 워커
// 화면·데이터는 저장하지 않고(항상 최신), 인터넷이 끊겼을 때만 안내 화면을 보여 줍니다.
const CACHE = 'alba-offline-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 서비스 워커가 깨어나는 동안 화면 요청을 미리 보내 두어 느려지지 않게
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request))
      } catch {
        return (await caches.match(OFFLINE)) || Response.error()
      }
    })(),
  )
})

// 휴대폰 알림(웹 푸시): 받으면 알림을 띄우고, 누르면 해당 화면을 엶 (이미 열린 창이 있으면 그 창에서)
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || '소켓 알바', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.tag,
      data: { url: d.url || '/me' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/me', self.location.origin).href
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if (new URL(w.url).origin !== self.location.origin) continue
        await w.focus()
        return w.navigate(url).catch(() => self.clients.openWindow(url))
      }
      return self.clients.openWindow(url)
    })(),
  )
})
