// 앱처럼 설치(홈 화면 추가)를 위한 최소 서비스 워커
// - 화면 파일(js/css/아이콘)은 저장본을 바로 쓰고 뒤에서 새 버전을 받아 둠. 배포마다 CACHE 이름을 바꿔 예전 것은 지움
// - 로그인·데이터(/api, /auth)는 절대 캐시하지 않음 (학교 정보가 기기에 남지 않도록)
const CACHE = 'gy-shell-v72';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (!/^\/(js|css|icons)\//.test(url.pathname)) return;
  // 저장본이 있으면 바로 쓰고 뒤에서 새로 받아 둠(휴대폰에서 파일마다 서버에 묻지 않도록). 배포 때 CACHE 이름이 바뀌어 예전 저장본은 지워짐
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => cache.match(e.request));
  }));
});

// 휴대폰 알림: 서버는 빈 신호만 보내고, 내용은 알림함에서 가져와 표시
self.addEventListener('push', (e) => {
  e.waitUntil(fetch('/api/inbox/latest', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { title: '새 알림', body: '', url: '/' }))
    .catch(() => ({ title: '새 알림', body: '', url: '/' }))
    .then((n) => self.registration.showNotification(n.title || '새 알림', { body: n.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: n.url || '/' } })));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
