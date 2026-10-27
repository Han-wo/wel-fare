/* WelfareAI 서비스워커 — PWA 설치 + 웹푸시 수신.
 *
 * 캐싱 전략을 일부러 최소화했다. 이 앱의 화면은 거의 전부 로그인 기반
 * 개인화 데이터라 오프라인 캐시가 득보다 실이 크다(남의 답변이 남거나
 * 만료된 공고가 보이는 사고). 그래서 앱 셸만 폴백으로 두고 나머지는
 * 네트워크를 그대로 통과시킨다.
 */
const SHELL_CACHE = 'welfare-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// 페이지 이동이 네트워크 실패로 끊길 때만 오프라인 화면을 보여준다.
// API·정적 자산은 건드리지 않는다.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'WelfareAI', body: event.data.text() };
  }
  const { title = 'WelfareAI', body = '', url = '/notifications', tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,                 // 같은 tag는 덮어써서 중복 알림이 쌓이지 않는다
      renotify: Boolean(tag),
      icon: '/icons/192.png',
      badge: '/icons/192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열린 탭이 있으면 거기로 이동시킨다(탭을 계속 늘리지 않는다).
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
