/**
 * 건대외래일정 (KUH Workload Predictor) PWA Service Worker
 * - 버전: v1.4.0
 * - 오프라인 100% 가동 (조제실 음영지역 대응)
 * - 정적 셸(App Shell): Stale-While-Revalidate
 * - 일정 데이터(/api/schedule, /data/schedule.json): Network-First + Cache-Fallback
 */

const CACHE_NAME = 'kuh-schedule-pwa-v1.4.0';
const DATA_CACHE_NAME = 'kuh-schedule-data-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
  '/data/schedule.json'
];

// 1. 설치: 정적 앱 셸 사전 캐싱 및 즉각 활성화
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 정적 자산 사전 캐싱 시작');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. 활성화: 구버전 캐시 정리 및 클라이언트 즉시 제어
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
            console.log('[SW] 구버전 캐시 삭제:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 네트워크 요청 인터셉트 및 지능형 캐싱 라우팅
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GET 요청만 캐싱 대상
  if (req.method !== 'GET') return;

  // A. 외래 일정 API 및 JSON 데이터 (/api/schedule, /data/schedule.json)
  if (url.pathname === '/api/schedule' || url.pathname.endsWith('/data/schedule.json')) {
    event.respondWith(
      (async () => {
        // 강제 새로고침(?refresh=true)이거나 온라인인 경우 우선 네트워크 시도
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4초 타임아웃

        try {
          const networkRes = await fetch(req, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkRes && networkRes.status === 200) {
            const dataCache = await caches.open(DATA_CACHE_NAME);
            dataCache.put(req, networkRes.clone());
            return networkRes;
          }
          throw new Error('API response invalid');
        } catch (err) {
          clearTimeout(timeoutId);
          console.warn('[SW] 네트워크 실패/타임아웃, 캐시 폴백 탐색:', url.pathname);

          // 1차 폴백: 데이터 캐시 탐색
          const dataCache = await caches.open(DATA_CACHE_NAME);
          const cachedRes = await dataCache.match(req);
          if (cachedRes) return cachedRes;

          // 2차 폴백: 정적 사전 수합 데이터(/data/schedule.json) 탐색
          const staticCache = await caches.open(CACHE_NAME);
          const staticSchedule = await staticCache.match('/data/schedule.json');
          if (staticSchedule) return staticSchedule;

          // 3차: 빈 실패 응답 방지
          return new Response(JSON.stringify({ offline: true, error: 'Offline and no cache' }), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }
      })()
    );
    return;
  }

  // B. Tailwind CDN 등 외부 정적 리소스 (Cache-First)
  if (url.hostname.includes('tailwindcss.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // C. 동일 출처 정적 앱 셸 (HTML, 매니페스트, 아이콘): Stale-While-Revalidate
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});
