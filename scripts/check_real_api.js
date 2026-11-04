const https = require('https');

function httpsGetBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function run() {
  // 김다영 교수(신경과)의 실제 건대병원 스케줄 확인
  const raw = await httpsGetBuffer('https://www.kuh.ac.kr/doctor/docMonthlyScheduleAjax.do?sdoctcd=20150091&sdate=20261101&nextMonth=11');
  const json = JSON.parse(raw);
  console.log('month:', json.month, 'afterMonth:', json.afterMonth);
  console.log('monthlyList length:', json.monthlyList.length);
  console.log('첫 5개 스케줄:', json.monthlyList.slice(0, 5));
}
run();
