/**
 * KUH Workload Predictor CLI Runner & Local Dev Server
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { buildFullSchedule, getKSTDateString } = require('./core/kuh-parser');
const { ALL_DEPTS } = require('./core/dept-config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const SCHEDULE_JSON_PATH = path.join(DATA_DIR, 'schedule.json');

async function runFetch() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('====================================================');
  console.log('   건국대병원 외래 일정 수합 및 예측 엔진 가동');
  console.log('====================================================');

  const scheduleData = await buildFullSchedule(ALL_DEPTS);
  fs.writeFileSync(SCHEDULE_JSON_PATH, JSON.stringify(scheduleData, null, 2), 'utf8');

  console.log(`\n✅ 데이터 저장 완료: ${SCHEDULE_JSON_PATH}`);
  console.log(`🕒 최신화 시각: ${scheduleData.updatedAt}`);
  console.log(`📅 대상 주간: ${scheduleData.weekDays.map(w => w.label).join(' | ')}`);
  return scheduleData;
}

function runServer(port = 3000) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.ico': 'image/x-icon'
  };

  const server = http.createServer((req, res) => {
    // API Route simulation for local
    if (req.url === '/api/schedule') {
      if (fs.existsSync(SCHEDULE_JSON_PATH)) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(SCHEDULE_JSON_PATH).pipe(res);
        return;
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '데이터가 없습니다. 먼저 fetch를 실행하세요.' }));
        return;
      }
    }

    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
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
    if (!fs.existsSync(SCHEDULE_JSON_PATH)) {
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
  runServer
};
