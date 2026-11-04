const fs = require('fs');
const path = 'c:/Users/dbswo/Desktop/AI Agents/Antigravity/Apps/kuh-workload-predictor/public/data/schedule.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== 이번 주 휴진 교수진 전수 실사 ===');
let closedCount = 0;
for (const slot of ['AM', 'PM']) {
  for (const day of ['월', '화', '수', '목', '금']) {
    const closed = data.weekly[slot][day].filter(d => d.isClosed);
    if (closed.length > 0) {
      closedCount += closed.length;
      console.log(day + ' ' + slot + ' (' + closed.length + '명): ' + closed.map(d => d.deptName + ' ' + d.name + '[' + d.closedReason + ']').join(', '));
    }
  }
}
console.log('총 휴진 건수:', closedCount);
