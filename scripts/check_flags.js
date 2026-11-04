const fs = require('fs');
const path = 'c:/Users/dbswo/Desktop/AI Agents/Antigravity/Apps/kuh-workload-predictor/public/data/schedule.json';

// Let's inspect raw API responses directly
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      const c = [];
      res.on('data', x => c.push(x));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
    }).on('error', reject);
  });
}

async function run() {
  // Let's sample a few doctors from different departments
  const sids = ['20150091', '20050102', '20050324', '20080093', '20060246', '20160123'];
  const flagSet = new Set();
  for (const sid of sids) {
    const raw = await get(`https://www.kuh.ac.kr/doctor/docMonthlyScheduleAjax.do?sdoctcd=${sid}&sdate=20261101&nextMonth=11`);
    const j = JSON.parse(raw);
    for (const item of (j.monthlyList || [])) {
      flagSet.add(`nm: [${item.endflag_nm}] / cd: [${item.endflag_cd}] / ordflag: [${item.ordflag_nm}]`);
    }
  }
  console.log('실제 플래그 패턴들:');
  for (const f of flagSet) console.log(f);
}
run();
