/**
 * Vercel Serverless Function: /api/schedule
 * - On-Demand Daily Cache (당일 아침 1회 자동 수합)
 * - Vercel CDN Edge Caching (1시간)
 * - 브라우저 CORS 완벽 지원
 */

const { buildFullSchedule, getKSTDateString } = require('../src/core/kuh-parser');
const { ALL_DEPTS } = require('../src/core/dept-config');

// Serverless 인스턴스 레벨 메모리 캐시
let memoryCache = null;

module.exports = async function handler(req, res) {
  // CORS 프리플라이트 대응
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const kst = getKSTDateString();
  const forceRefresh = req.query && req.query.refresh === 'true';

  // 1. 메모리 캐시 유효성 검사 (오늘 날짜이고, 강제 새로고침이 아닌 경우)
  if (!forceRefresh && memoryCache && memoryCache.updatedDateOnly === kst.dateOnly) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
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
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      ...scheduleData,
      fromCache: false
    });
  } catch (error) {
    console.error('[Vercel-API] 수합 에러:', error);
    // 에러 발생 시 기존 캐시가 있다면 폴백 제공
    if (memoryCache) {
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
