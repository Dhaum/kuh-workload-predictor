/**
 * 건국대학교병원 외래 일정 정규화 및 집계 파서 (KUH-Parser)
 */

const { fetchDoctorsInDept, fetchDoctorSchedule, mapConcurrent } = require('./kuh-fetcher');
const { ALL_DEPTS, DEPT_MAP_BY_CD } = require('./dept-config');

function getKSTDateString(d = new Date()) {
  // KST: UTC + 9
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 3600000));
  
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, '0');
  const dd = String(kst.getDate()).padStart(2, '0');
  const hh = String(kst.getHours()).padStart(2, '0');
  const min = String(kst.getMinutes()).padStart(2, '0');
  const ss = String(kst.getSeconds()).padStart(2, '0');

  return {
    year: yyyy,
    month: mm,
    day: dd,
    yyyymm: `${yyyy}${mm}`,
    yyyymmdd: `${yyyy}${mm}${dd}`,
    formatted: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`,
    dateOnly: `${yyyy}-${mm}-${dd}`
  };
}

/**
 * 주어진 날짜가 속한 주의 월~금 날짜 목록 반환 (YYYYMMDD 형식)
 * @param {Date} referenceDate 기준 일자
 * @param {number} weekOffset 0: 이번주, 1: 다음주, -1: 지난주
 */
function getWeekDays(referenceDate = new Date(), weekOffset = 0) {
  const utc = referenceDate.getTime() + (referenceDate.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 3600000));
  const day = kst.getDay(); // 0(일) ~ 6(토)
  
  // 이번 주 월요일 계산 (일요일이면 다음날 월요일)
  const diffToMon = day === 0 ? 1 : 1 - day;
  const monday = new Date(kst);
  monday.setDate(kst.getDate() + diffToMon + (weekOffset * 7));

  const days = [];
  const dayNames = ['월', '화', '수', '목', '금'];
  for (let i = 0; i < 5; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    days.push({
      dateStr: `${yyyy}${mm}${dd}`,
      dayName: dayNames[i],
      label: `${dayNames[i]} (${Number(mm)}/${Number(dd)})`
    });
  }
  return days;
}

/**
 * 23개과(또는 지정된 진료과 목록) 전체 스케줄 수합 및 파싱
 */
async function buildFullSchedule(deptList = ALL_DEPTS) {
  const kst = getKSTDateString();
  const yyyymm01 = `${kst.yyyymm}01`;
  const weekDays = getWeekDays(new Date(), 0);
  const nextWeekDays = getWeekDays(new Date(), 1);
  const weekDateSet = new Set(weekDays.map(w => w.dateStr));
  const nextWeekDateSet = new Set(nextWeekDays.map(w => w.dateStr));

  console.log(`[KUH-Parser] 데이터 수합 시작: ${deptList.length}개 진료과 (기준: ${kst.formatted})`);

  // 1. 각 진료과별 의사 sid 목록 수합
  const deptDoctorMap = {};
  for (const dept of deptList) {
    const sids = await fetchDoctorsInDept(dept.cd);
    deptDoctorMap[dept.cd] = {
      dept,
      sids
    };
  }

  // 2. 전체 의사 SID 리스트 생성
  const doctorTasks = [];
  for (const [deptCd, info] of Object.entries(deptDoctorMap)) {
    for (const sid of info.sids) {
      doctorTasks.push({ deptCd, dept: info.dept, sid });
    }
  }

  console.log(`[KUH-Parser] 총 ${doctorTasks.length}명 의료진 스케줄 비동기 조회 (동시 4개 제한)...`);

  // 3. 의사별 스케줄 병렬 수합 (동시 4개)
  const allMonthlySchedules = await mapConcurrent(doctorTasks, async (task) => {
    const res = await fetchDoctorSchedule(task.sid, yyyymm01, kst.month);
    return {
      task,
      res
    };
  }, 4);

  // 4. 데이터 정규화 및 주간/일별 매트릭스 구성 (이번주 + 다음주 동시 지원)
  const weekly = {
    AM: { '월': [], '화': [], '수': [], '목': [], '금': [] },
    PM: { '월': [], '화': [], '수': [], '목': [], '금': [] }
  };
  const nextWeekly = {
    AM: { '월': [], '화': [], '수': [], '목': [], '금': [] },
    PM: { '월': [], '화': [], '수': [], '목': [], '금': [] }
  };
  const daily = {}; // "YYYYMMDD": { AM: [], PM: [] }

  for (const item of allMonthlySchedules) {
    if (!item.res || !item.res.monthlyList) continue;
    const { task, res } = item;
    const monthlyList = res.monthlyList;

    for (const entry of monthlyList) {
      const date = entry.orddd; // YYYYMMDD
      const timeSlot = entry.apflag_nm === '오전' ? 'AM' : 'PM';
      
      // 건국대병원 플래그 실측 분석 반영:
      // '당일마감'(01)은 외래 정상 진료(온라인 예약만 마감).
      // '학회휴진'(02), '정기휴가'(05), '오후반휴'(19) 등은 실제 외래 미진료(휴진).
      const closedCodes = new Set(['02', '03', '04', '05', '06', '19', '20']);
      const isClosed = Boolean(
        (entry.endflag_nm && (entry.endflag_nm.includes('휴진') || entry.endflag_nm.includes('휴가') || entry.endflag_nm.includes('반휴'))) ||
        (entry.endflag_cd && closedCodes.has(entry.endflag_cd))
      );
      const closedReason = isClosed ? (entry.endflag_nm && entry.endflag_nm !== '-' ? entry.endflag_nm : '휴진') : '';
      
      const docRecord = {
        deptKey: task.dept.key,
        deptName: task.dept.name,
        deptCd: task.deptCd,
        chipClass: task.dept.chipClass,
        name: entry.doct_nm || `의사(${task.sid})`,
        sid: task.sid,
        clinicType: entry.ordflag_nm || '일반진료',
        isClosed,
        closedReason
      };

      // 1) 이번주 매트릭스 집계
      if (weekDateSet.has(date)) {
        const dayObj = weekDays.find(w => w.dateStr === date);
        if (dayObj) {
          weekly[timeSlot][dayObj.dayName].push(docRecord);
        }
      }

      // 2) 다음주 매트릭스 집계
      if (nextWeekDateSet.has(date)) {
        const dayObj = nextWeekDays.find(w => w.dateStr === date);
        if (dayObj) {
          nextWeekly[timeSlot][dayObj.dayName].push(docRecord);
        }
      }

      // 3) 일별 출근부 집계
      if (!daily[date]) {
        daily[date] = { AM: [], PM: [] };
      }
      daily[date][timeSlot].push(docRecord);
    }
  }

  const payload = {
    updatedAt: kst.formatted,
    updatedDateOnly: kst.dateOnly,
    weekDays,
    nextWeekDays,
    weekly,
    nextWeekly,
    daily
  };

  console.log(`[KUH-Parser] 스케줄 구성 완료! (주간 데이터 및 ${Object.keys(daily).length}일치 일별 데이터 확보)`);
  return payload;
}

module.exports = {
  getKSTDateString,
  getWeekDays,
  buildFullSchedule
};
