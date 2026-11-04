const fs = require('fs');
const path = 'c:/Users/dbswo/Desktop/AI Agents/Antigravity/Apps/kuh-workload-predictor/public/data/schedule.json';

const data = JSON.parse(fs.readFileSync(path, 'utf8'));

// 주간 매트릭스 전체에서 동일 의사가 같은 요일 같은 타임에 중복 등장하는지 확인
let totalDups = 0;
for (const slot of ['AM', 'PM']) {
  for (const day of ['월', '화', '수', '목', '금']) {
    const list = data.weekly[slot][day];
    const map = {};
    for (const doc of list) {
      const key = `${doc.deptKey}_${doc.name}`;
      if (map[key]) {
        console.warn(`[주간 중복] ${slot} ${day}: ${doc.deptName} ${doc.name} 중복! (기존: ${map[key].clinicType}, 신규: ${doc.clinicType})`);
        totalDups++;
      } else {
        map[key] = doc;
      }
    }
  }
}
console.log('주간 테이블 총 중복 건수:', totalDups);
