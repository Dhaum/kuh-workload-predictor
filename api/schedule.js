/**
 * Vercel Serverless Function: /api/schedule
 * - On-Demand Daily Cache (당일 아침 1회 자동 수합)
 * - Vercel CDN Edge Caching (KST 자정 경계 동적 s-maxage, 최대 1시간)
 * - 브라우저 CORS 완벽 지원
 */

const { buildFullSchedule, getKSTDateString, getWeekDays } = require('../src/core/kuh-parser');
const { ALL_DEPTS } = require('../src/core/dept-config');

// Serverless 인스턴스 레벨 메모리 캐시
let memoryCache = null;

/**
 * KST 자정 경계를 넘기지 않도록 동적 Cache-Control 헤더 생성
 * @param {boolean} forceRefresh
 * @returns {string}
 */
function getDynamicCacheControl(forceRefresh) {
  if (forceRefresh === true) {
    return 'no-store, no-cache, must-revalidate';
  }

  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 3600000));
  const kstMidnight = new Date(Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + 1,
    0, 0, 0, 0
  ));

  const secondsToMidnight = Math.max(60, Math.floor((kstMidnight.getTime() - kstNow.getTime()) / 1000));
  const sMaxAge = Math.min(3600, secondsToMidnight);
  return `s-maxage=${sMaxAge}, stale-while-revalidate=60`;
}

module.exports = async function handler(req, res) {
  // CORS 프리플라이트 대응
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = new Date();
  const kst = getKSTDateString(now);
  const currentMondayStr = getWeekDays(now, 0)[0].dateStr;
  const forceRefresh = Boolean(req.query && req.query.refresh === 'true');

  // 1. 메모리 캐시 유효성 검사 (오늘 날짜 + 동일 주차 월요일 + 강제 새로고침 아님)
  const isSameDay = Boolean(memoryCache && memoryCache.updatedDateOnly === kst.dateOnly);
  const isSameWeek = Boolean(
    memoryCache &&
    Array.isArray(memoryCache.weekDays) &&
    memoryCache.weekDays[0] &&
    memoryCache.weekDays[0].dateStr === currentMondayStr
  );

  if (!forceRefresh && isSameDay && isSameWeek) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', getDynamicCacheControl(forceRefresh));
    return res.status(200).json({
      ...memoryCache,
      fromCache: true
    });
  }

  // 2. 당일 아침 첫 접속이거나 강제 새로고침인 경우: 건대병원 API 수합 실행
  try {
    console.log(`[Vercel-API] 당일 외래 일정 신규 수합 실행 (기준: ${kst.formatted})`);
    const scheduleData = await buildFullSchedule(ALL_DEPTS);
    memoryCache = scheduleData;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', getDynamicCacheControl(forceRefresh));
    return res.status(200).json({
      ...scheduleData,
      fromCache: false
    });
  } catch (error) {
    console.error('[Vercel-API] 수합 에러:', error);
    res.setHeader('Cache-Control', 'no-store');
    // 에러 발생 시 기존 캐시가 있다면 폴백 제공
    if (memoryCache) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        ...memoryCache,
        fallback: true,
        error: error.message
      });
    }
    return res.status(500).json({
      error: '건국대학교병원 외래 일정 수합 중 오류가 발생했습니다.',
      details: error.message
    });
  }
};
