/**
 * 건대외래일정 (KUH Workload Predictor) PWA Service Worker
 * - 버전: v1.5.0
 * - 오프라인 100% 가동 (조제실 음영지역 대응)
 * - App Shell HTML(/, /index.html): 1.5초 Network-First + 상호 Cache-Fallback
 * - 기타 정적 셸: Stale-While-Revalidate
 * - 일정 데이터(/api/schedule, /data/schedule.json): Network-First(25s~30s) + Cache-Fallback
 */

const CACHE_NAME = 'kuh-schedule-pwa-v1.6.0';
const DATA_CACHE_NAME = 'kuh-schedule-data-v2';
const CANONICAL_DATA_URL = '/api/schedule';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
  '/data/schedule.json'
];

// CacheStorage의 불변(immutable) Response.headers 직접 수정 시 TypeError 방지용 복제 헬퍼
async function createFallbackResponse(cachedRes, fallbackSource) {
  const body = await cachedRes.text();
  const headers = new Headers(cachedRes.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-KUH-Fallback', fallbackSource);
  return new Response(body, {
    status: cachedRes.status,
    statusText: cachedRes.statusText,
    headers
  });
}

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
  if (url.origin === location.origin && (url.pathname === '/api/schedule' || url.pathname.endsWith('/data/schedule.json'))) {
    event.respondWith(
      (async () => {
        const isRefresh = url.searchParams.get('refresh') === 'true';
        const timeoutMs = isRefresh ? 30000 : 25000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const networkRes = await fetch(req, {
            signal: controller.signal,
            cache: isRefresh ? 'no-store' : 'default'
          });
          clearTimeout(timeoutId);

          if (networkRes && networkRes.status === 200) {
            const dataCache = await caches.open(DATA_CACHE_NAME);
            await dataCache.put(url.pathname === '/api/schedule' ? CANONICAL_DATA_URL : req, networkRes.clone());
            return networkRes;
          }
          throw new Error('API response invalid');
        } catch (err) {
          clearTimeout(timeoutId);
          console.warn('[SW] 네트워크 실패/타임아웃, 캐시 폴백 탐색:', url.pathname);

          // 1차 폴백: 데이터 캐시 탐색
          const dataCache = await caches.open(DATA_CACHE_NAME);
          const cachedRes = (await dataCache.match(CANONICAL_DATA_URL)) || (await dataCache.match(req));
          if (cachedRes) return createFallbackResponse(cachedRes, 'cache');

          // 2차 폴백: 정적 사전 수합 데이터(/data/schedule.json) 탐색
          const staticCache = await caches.open(CACHE_NAME);
          const staticSchedule = await staticCache.match('/data/schedule.json');
          if (staticSchedule) return createFallbackResponse(staticSchedule, 'static');

          // 3차: 오프라인 무캐시 응답 명시 (503)
          return new Response(JSON.stringify({ offline: true, error: 'Offline and no cache' }), {
            status: 503,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'X-KUH-Fallback': 'offline'
            }
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

  // C. App Shell HTML ('/', '/index.html'): 1.5초 타임아웃 Network-First
  if (url.origin === location.origin && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        try {
          const networkRes = await fetch(req, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkRes && networkRes.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(url.search ? url.pathname : req, networkRes.clone());
            return networkRes;
          }
          throw new Error('App Shell response invalid');
        } catch (err) {
          clearTimeout(timeoutId);
          const cache = await caches.open(CACHE_NAME);
          const altPath = url.pathname === '/' ? '/index.html' : '/';
          const cached =
            (await cache.match(req)) ||
            (await cache.match(url.pathname)) ||
            (await cache.match(altPath)) ||
            (await caches.match(req));
          if (cached) return cached;
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      })()
    );
    return;
  }

  // D. 나머지 동일 출처 정적 자산(/manifest.json, /icon.png 등): Stale-While-Revalidate
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
