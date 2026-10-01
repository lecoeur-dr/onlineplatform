// 앱처럼 설치(홈 화면 추가)를 위한 최소 서비스 워커
// - 화면 파일(js/css/아이콘)은 항상 새 버전을 먼저 받고, 연결이 끊겼을 때만 저장본 사용
// - 로그인·데이터(/api, /auth)는 절대 캐시하지 않음 (학교 정보가 기기에 남지 않도록)
const CACHE = 'gy-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (!/^\/(js|css|icons)\//.test(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then((cache) => fetch(e.request)
    .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
    .catch(() => cache.match(e.request))));
});
