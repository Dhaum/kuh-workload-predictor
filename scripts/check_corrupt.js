const fs = require('fs');
const path = 'c:/Users/dbswo/Desktop/AI Agents/Antigravity/Apps/kuh-workload-predictor/public/data/schedule.json';

const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const corrupted = [];

for (const date of Object.keys(data.daily)) {
  for (const slot of ['AM', 'PM']) {
    for (const d of data.daily[date][slot]) {
      if (d.name.includes('\uFFFD') || d.deptName.includes('\uFFFD') || d.clinicType.includes('\uFFFD')) {
        corrupted.push({ date, slot, dept: d.deptName, name: d.name, type: d.clinicType });
      }
    }
  }
}

console.log('실제 깨진(\\uFFFD) 레코드 수:', corrupted.length);
if (corrupted.length > 0) {
  console.log('샘플 깨진 레코드:', corrupted.slice(0, 10));
}
