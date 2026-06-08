/* public/sw.js
 *
 * HireVan 알림 Service Worker.
 *
 * - 백그라운드 푸시 수신 → showNotification
 * - 노티 클릭 → 동일 origin 윈도우에 postMessage({ type: 'NAVIGATE', deepLink })
 *   (lib/notifications.ts 가 message 이벤트를 받아 router.push)
 * - 외부 origin 클릭 시 새 창으로 deepLink 열기
 */

// push 이벤트: 백그라운드 도착한 푸시
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }
  const title = (data.notification && data.notification.title) || 'HireVan'
  const body = (data.notification && data.notification.body) || ''
  const deepLink = data.deep_link || '/chat'
  const chatRoomId = data.chat_room_id || 'general'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { ...data, deep_link: deepLink, chat_room_id: chatRoomId },
      tag: 'chat:' + chatRoomId, // 같은 방 푸시는 합치기
      renotify: true,
    })
  )
})

// 클릭 시 라우팅
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const deepLink = (event.notification.data && event.notification.data.deep_link) || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            await client.focus()
            client.postMessage({ type: 'NAVIGATE', deepLink: deepLink })
            return
          }
        }
        return self.clients.openWindow(deepLink)
      })
  )
})
