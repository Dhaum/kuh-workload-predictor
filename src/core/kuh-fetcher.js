/**
 * 건국대학교병원 서버 통신 모듈 (Safe Throttled Fetcher)
 * - 브라우저 헤더 모방 (User-Agent, Referer)
 * - 동시 요청 4개 제한 큐 (WAF Rate Limiting 방어)
 * - 순수 Node.js https 모듈로 무의존성 구동
 */

const https = require('https');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.kuh.ac.kr/',
  'X-Requested-With': 'XMLHttpRequest'
};

function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: HEADERS }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

// 가벼운 동시성 제어 큐 (최대 4개 동시 실행)
async function mapConcurrent(items, fn, limit = 4) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

/**
 * 1. 진료과 페이지에서 의료진 고유 식별자(dr_sid) 및 기본 정보 추출
 */
async function fetchDoctorsInDept(deptCd) {
  try {
    const url = `https://www.kuh.ac.kr/medical/dept/deptDoctor.do?dept_cd=${deptCd}`;
    const html = await httpsGet(url);
    const matches = [...html.matchAll(/drProfile\s*\(\s*['"]?([0-9]+)['"]?\s*,\s*['"]?([0-9]+)['"]?\s*\)/gi)];
    const uniqueSids = [...new Set(matches.map(m => m[1]))];
    return uniqueSids;
  } catch (err) {
    console.error(`[KUH-Fetcher] 진료과(${deptCd}) 의료진 목록 수합 실패:`, err.message);
    return [];
  }
}

/**
 * 2. 특정 의료진의 월간 스케줄 JSON 호출
 */
async function fetchDoctorSchedule(drSid, yyyymm01, targetMonth) {
  try {
    const url = `https://www.kuh.ac.kr/doctor/docMonthlyScheduleAjax.do?sdoctcd=${drSid}&sdate=${yyyymm01}&nextMonth=${targetMonth}`;
    const raw = await httpsGet(url);
    const json = JSON.parse(raw);
    return json;
  } catch (err) {
    console.error(`[KUH-Fetcher] 의사(${drSid}) 스케줄 수합 실패:`, err.message);
    return null;
  }
}

module.exports = {
  httpsGet,
  mapConcurrent,
  fetchDoctorsInDept,
  fetchDoctorSchedule
};
