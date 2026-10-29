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
