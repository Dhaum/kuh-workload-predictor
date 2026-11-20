/**
 * KUH Workload Predictor CLI Runner & Local Dev Server
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { buildFullSchedule, getKSTDateString, getWeekDays } = require('./core/kuh-parser');
const { ALL_DEPTS } = require('./core/dept-config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const SCHEDULE_JSON_PATH = path.join(DATA_DIR, 'schedule.json');

let activeFetchPromise = null;

/**
 * 디스크의 schedule.json이 존재하고 파싱 가능하며 이번주 월요일 기준 최신 데이터인지 확인
 * @returns {boolean}
 */
function isDiskScheduleCurrent() {
  if (!fs.existsSync(SCHEDULE_JSON_PATH)) {
    return false;
  }
  try {
    const raw = fs.readFileSync(SCHEDULE_JSON_PATH, 'utf8');
    const data = JSON.parse(raw);
    const currentMondayStr = getWeekDays(new Date(), 0)[0].dateStr;
    return data?.weekDays?.[0]?.dateStr === currentMondayStr;
  } catch (err) {
    return false;
  }
}

async function runFetch() {
  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      console.log('====================================================');
      console.log('   건국대병원 외래 일정 수합 및 예측 엔진 가동');
      console.log('====================================================');

      const scheduleData = await buildFullSchedule(ALL_DEPTS);
      fs.writeFileSync(SCHEDULE_JSON_PATH, JSON.stringify(scheduleData), 'utf8');

      console.log(`\n✅ 데이터 저장 완료: ${SCHEDULE_JSON_PATH}`);
      console.log(`🕒 최신화 시각: ${scheduleData.updatedAt}`);
      console.log(`📅 대상 주간: ${scheduleData.weekDays.map(w => w.label).join(' | ')}`);
      return scheduleData;
    } finally {
      activeFetchPromise = null;
    }
  })();

  return activeFetchPromise;
}

function runServer(port = 3000) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json'
  };

  const server = http.createServer(async (req, res) => {
    const [reqPath, queryString = ''] = (req.url || '/').split('?');

    // API Route simulation for local
    if (reqPath === '/api/schedule') {
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
      }

      try {
        const searchParams = new URLSearchParams(queryString);
        const forceRefresh = searchParams.get('refresh') === 'true';

        if (forceRefresh || !isDiskScheduleCurrent()) {
          await runFetch();
        }

        if (fs.existsSync(SCHEDULE_JSON_PATH)) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          fs.createReadStream(SCHEDULE_JSON_PATH).pipe(res);
          return;
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '데이터가 없습니다. 먼저 fetch를 실행하세요.' }));
          return;
        }
      } catch (err) {
        console.error('[Local-API] /api/schedule 처리 실패:', err);
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
          error: '건국대학교병원 외래 일정 수합 중 오류가 발생했습니다.',
          details: err.message
        }));
        return;
      }
    }

    let filePath = path.join(PUBLIC_DIR, reqPath === '/' ? 'index.html' : reqPath);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
        } else {
          res.writeHead(500);
          res.end(`Server Error: ${err.code}`);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  server.listen(port, () => {
    console.log(`\n🚀 로컬 프리뷰 서버 실행 중: http://localhost:${port}`);
    console.log(`   (브라우저에서 접속하여 확인하실 수 있습니다)`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--serve')) {
    if (!fs.existsSync(SCHEDULE_JSON_PATH) || !isDiskScheduleCurrent()) {
      await runFetch();
    }
    runServer(3000);
  } else {
    await runFetch();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('실행 에러:', err);
    process.exit(1);
  });
}

module.exports = {
  runFetch,
  runServer,
  isDiskScheduleCurrent
};
