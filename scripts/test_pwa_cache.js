/**
 * PWA 매니페스트, 서비스 워커 캐시 및 오프라인 무결성 종합 테스트
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

const BASE_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function testManifest() {
  console.log('\n[1] PWA manifest.json 검증');
  const manifestPath = path.join(PUBLIC_DIR, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'manifest.json 파일 존재');

  const content = fs.readFileSync(manifestPath, 'utf8');
  let json;
  try {
    json = JSON.parse(content);
    assert(true, 'manifest.json 유효한 JSON 구문');
  } catch (e) {
    assert(false, `manifest.json JSON 파싱 실패: ${e.message}`);
    return;
  }

  assert(json.name && json.name.includes('건대외래일정'), `name 규격 확인: "${json.name}"`);
  assert(json.short_name === '건대외래일정', `short_name 규격 확인: "${json.short_name}"`);
  assert(json.display === 'standalone', 'display: standalone 모드 (주소창 없는 네이티브 앱)');
  assert(json.start_url === '/', 'start_url: "/" 루트 지정');

  assert(Array.isArray(json.icons) && json.icons.length > 0, '아이콘 목록 정의 확인');
  for (const ic of json.icons || []) {
    const iconLocalPath = path.join(PUBLIC_DIR, ic.src.replace(/^\//, ''));
    const exists = fs.existsSync(iconLocalPath);
    const size = exists ? fs.statSync(iconLocalPath).size : 0;
    assert(exists && size > 1000, `아이콘 파일 실측 존재: ${ic.src} (${size} bytes)`);
  }
}

async function testServiceWorker() {
  console.log('\n[2] PWA Service Worker (sw.js) 검증');
  const swPath = path.join(PUBLIC_DIR, 'sw.js');
  assert(fs.existsSync(swPath), 'public/sw.js 파일 존재');

  const content = fs.readFileSync(swPath, 'utf8');
  assert(content.includes('CACHE_NAME'), 'CACHE_NAME 버전 관리 변수 존재');
  assert(content.includes('DATA_CACHE_NAME'), 'DATA_CACHE_NAME 데이터 전용 캐시 분리');
  assert(content.includes("addEventListener('install'"), 'install 이벤트 리스너 등록');
  assert(content.includes("addEventListener('activate'"), 'activate 이벤트 리스너 등록');
  assert(content.includes("addEventListener('fetch'"), 'fetch 이벤트 리스너 등록');
  assert(content.includes('skipWaiting'), '설치 즉시 활성화(skipWaiting) 지원');
  assert(content.includes('clients.claim'), '새 버전 즉시 클라이언트 제어(clients.claim) 지원');
  assert(content.includes('/api/schedule'), '외래 일정 API 인터셉트 및 오프라인 폴백 탑재');
  assert(
    content.includes('createFallbackResponse') && content.includes('new Headers(') && content.includes('X-KUH-Fallback'),
    '불변 Response.headers 복제(createFallbackResponse + new Headers + X-KUH-Fallback) 적용'
  );
  assert(
    /status:\s*503/.test(content) && content.includes("'X-KUH-Fallback': 'offline'"),
    '3차 오프라인 무캐시 폴백 HTTP 503 및 X-KUH-Fallback: offline 명시'
  );
  assert(
    content.includes("url.pathname === '/' || url.pathname === '/index.html'") && content.includes('1500'),
    'App Shell HTML(/, /index.html) 1.5초 타임아웃 Network-First 라우팅 적용'
  );

  try {
    new vm.Script(content, { filename: 'sw.js' });
    assert(true, 'sw.js JavaScript 구문 유효성 검증 통과');
  } catch (e) {
    assert(false, `sw.js JavaScript 구문 에러: ${e.message}`);
  }

  // STATIC_ASSETS 파일 실존 대조
  const matchAssets = content.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  assert(Boolean(matchAssets), 'STATIC_ASSETS 배열 선언 확인');

  if (matchAssets) {
    const rawList = matchAssets[1]
      .split('\n')
      .map(s => s.trim().replace(/[',"]/g, ''))
      .filter(s => s.startsWith('/'));
    
    for (const item of rawList) {
      const relPath = item === '/' ? 'index.html' : item.replace(/^\//, '');
      const itemPath = path.join(PUBLIC_DIR, relPath);
      assert(fs.existsSync(itemPath), `사전 캐싱 대상 실존 확인: ${item} -> ${relPath}`);
    }
  }
}

async function testFrontendIntegrity() {
  console.log('\n[2-1] 프론트엔드(index.html) KST 날짜 엄격 검증 & 스크립트 구문 점검');
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  assert(fs.existsSync(indexPath), 'public/index.html 파일 존재');

  const html = fs.readFileSync(indexPath, 'utf8');
  assert(!html.includes('w.dayName === todayDayName'), '주간 헤더 요일명 폴백(w.dayName === todayDayName) 제거');
  assert(html.includes('w.dateStr === todayStr'), '주간 헤더 오늘 날짜(w.dateStr === todayStr) 엄격 일치 적용');
  assert(html.includes('isScheduleCurrentWeek'), '이번주 데이터 유효성 검증(isScheduleCurrentWeek) 탑재');
  assert(html.includes('hydrateScheduleData'), '슬림 페이로드 동적 하이드레이션(hydrateScheduleData) 탑재');
  assert(html.includes('saturdayModalBackdrop') && html.includes('openSaturdayModal'), '토요일 외래 온디맨드 팝업 모달 탑재');
  assert(html.includes('size: A4 portrait') && html.includes('printWeeklyPortrait'), 'A4 세로(portrait) 모바일형 주간 인쇄 레이아웃 탑재');
  assert(html.includes('kuh-schedule-data-v2'), '신규 데이터 캐시(kuh-schedule-data-v2) 동기화');
  assert(!html.includes('kuh-schedule-data-v1'), '구버전 데이터 캐시(kuh-schedule-data-v1) 참조 제거');

  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptCount = 0;
  let syntaxOk = true;
  while ((match = scriptRegex.exec(html)) !== null) {
    scriptCount++;
    try {
      new vm.Script(match[1], { filename: `index.html#script-${scriptCount}` });
    } catch (e) {
      syntaxOk = false;
      assert(false, `index.html 인라인 <script> #${scriptCount} 문법 오류: ${e.message}`);
    }
  }
  assert(scriptCount > 0 && syntaxOk, `index.html 인라인 <script> ${scriptCount}개 구문 파싱 무결성 통과`);
}

async function testOfflineFallbackData() {
  console.log('\n[3] 2순위 오프라인 폴백 데이터 (schedule.json) 검증');
  const dataPath = path.join(PUBLIC_DIR, 'data', 'schedule.json');
  assert(fs.existsSync(dataPath), 'public/data/schedule.json 파일 실존');

  const content = fs.readFileSync(dataPath, 'utf8');
  let data;
  try {
    data = JSON.parse(content);
    assert(true, 'schedule.json 유효한 JSON 형식');
  } catch (e) {
    assert(false, `schedule.json 파싱 실패: ${e.message}`);
    return;
  }

  assert(Boolean(data.updatedAt), `최신화 일시 기록 확인: ${data.updatedAt}`);
  assert(Array.isArray(data.weekDays) && data.weekDays.length === 5, '이번주 월~금 5일 매트릭스 존재');
  assert(Array.isArray(data.nextWeekDays) && data.nextWeekDays.length === 5, '다음주 월~금 5일 매트릭스 존재');
  assert(Boolean(data.weekSaturday && data.weekSaturday.dayName === '토'), '이번주 토요일 메타데이터(weekSaturday) 존재');
  assert(Boolean(data.nextWeekSaturday && data.nextWeekSaturday.dayName === '토'), '다음주 토요일 메타데이터(nextWeekSaturday) 존재');
  assert(Boolean(data.weekly && data.weekly.AM && data.weekly.PM), '오전/오후 weekly 스케줄 매트릭스 존재');
  assert(Array.isArray(data.weekly.AM['토']) && Array.isArray(data.nextWeekly.AM['토']), '이번주/다음주 토요일 오전 슬롯 존재');
  assert(!data.daily, '중복 daily 페이로드 제거(슬림화) 확인');
  assert(content.length < 300 * 1024, `schedule.json 슬림화 용량 상한(300KB 미만) 통과: ${(content.length / 1024).toFixed(1)} KB`);
  
  let docCount = 0;
  for (const slot of ['AM', 'PM']) {
    for (const d of ['월', '화', '수', '목', '금']) {
      docCount += (data.weekly[slot][d] || []).length;
    }
  }
  assert(docCount > 100, `주간 총 진료 세션 건수 정상치: ${docCount}건`);
}

async function testHttpPreviewServer() {
  console.log('\n[4] 로컬 프리뷰 서버 및 MIME 타입 무결성 검증');
  const port = 3456;
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/api/schedule') {
      const dataPath = path.join(PUBLIC_DIR, 'data', 'schedule.json');
      if (fs.existsSync(dataPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        fs.createReadStream(dataPath).pipe(res);
        return;
      }
    }

    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  await new Promise((resolve) => server.listen(port, resolve));

  const endpoints = [
    { url: '/', expStatus: 200, expType: 'text/html' },
    { url: '/sw.js', expStatus: 200, expType: 'application/javascript' },
    { url: '/manifest.json', expStatus: 200, expType: 'application/json' },
    { url: '/icon.png', expStatus: 200, expType: 'image/png' },
    { url: '/api/schedule', expStatus: 200, expType: 'application/json' }
  ];

  for (const ep of endpoints) {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${ep.url}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });

    assert(res.status === ep.expStatus, `엔드포인트 [${ep.url}] HTTP ${ep.expStatus} 응답`);
    assert(res.headers['content-type'] && res.headers['content-type'].includes(ep.expType), `[${ep.url}] 올바른 MIME 타입 (${ep.expType})`);
  }

  await new Promise((resolve) => server.close(resolve));
  console.log('  테스트 서버 정상 종료');
}

async function run() {
  console.log('====================================================');
  console.log('   건대외래일정 PWA 캐시 & 오프라인 무결성 종합 테스트');
  console.log('====================================================');

  await testManifest();
  await testServiceWorker();
  await testFrontendIntegrity();
  await testOfflineFallbackData();
  await testHttpPreviewServer();

  console.log('\n====================================================');
  console.log(`최종 결과: ${passedTests}/${totalTests} 통과 (${passedTests === totalTests ? '전원 합격 🎉' : '일부 실패 ⚠️'})`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('테스트 실행 에러:', err);
  process.exit(1);
});
