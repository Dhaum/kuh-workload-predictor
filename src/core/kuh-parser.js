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
  
  // 이번 주 월요일 계산 (월요일 기준 주간: 일요일은 해당 주의 마지막 날이므로 -6일 보정)
  const diffToMon = day === 0 ? -6 : 1 - day;
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
 * 주어진 날짜가 속한 주의 토요일 메타데이터 반환 (YYYYMMDD 형식)
 * @param {Date} referenceDate 기준 일자
 * @param {number} weekOffset 0: 이번주, 1: 다음주
 */
function getWeekSaturday(referenceDate = new Date(), weekOffset = 0) {
  const utc = referenceDate.getTime() + (referenceDate.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 3600000));
  const day = kst.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const sat = new Date(kst);
  sat.setDate(kst.getDate() + diffToMon + (weekOffset * 7) + 5);

  const yyyy = sat.getFullYear();
  const mm = String(sat.getMonth() + 1).padStart(2, '0');
  const dd = String(sat.getDate()).padStart(2, '0');
  return {
    dateStr: `${yyyy}${mm}${dd}`,
    dayName: '토',
    label: `토 (${Number(mm)}/${Number(dd)})`
  };
}

/**
 * 주간 매트릭스(weekly/nextWeekly)로부터 일별(daily) 맵을 동적 복원
 * (페이로드 중복 제거 및 하위 호환 유틸리티)
 */
function hydrateDailyFromWeekly(payload) {
  if (!payload || payload.daily) return payload?.daily || {};
  const daily = {};
  const attachWeek = (days, sat, matrix) => {
    if (!matrix) return;
    const allDays = [...(days || []), ...(sat ? [sat] : [])];
    for (const d of allDays) {
      daily[d.dateStr] = {
        AM: (matrix.AM && matrix.AM[d.dayName]) || [],
        PM: (matrix.PM && matrix.PM[d.dayName]) || []
      };
    }
  };
  attachWeek(payload.weekDays, payload.weekSaturday, payload.weekly);
  attachWeek(payload.nextWeekDays, payload.nextWeekSaturday, payload.nextWeekly);
  return daily;
}

/**
 * 23개과(또는 지정된 진료과 목록) 전체 스케줄 수합 및 파싱
 */
async function buildFullSchedule(deptList = ALL_DEPTS) {
  const now = new Date();
  const kst = getKSTDateString(now);
  const weekDays = getWeekDays(now, 0);
  const nextWeekDays = getWeekDays(now, 1);
  const weekSaturday = getWeekSaturday(now, 0);
  const nextWeekSaturday = getWeekSaturday(now, 1);
  const baseYearMonth = weekDays[0].dateStr.slice(0, 6); // YYYYMM
  const baseMonth = baseYearMonth.slice(4, 6); // MM
  const yyyymm01 = `${baseYearMonth}01`;

  const thisWeekDayByDate = new Map([...weekDays, weekSaturday].map(w => [w.dateStr, w.dayName]));
  const nextWeekDayByDate = new Map([...nextWeekDays, nextWeekSaturday].map(w => [w.dateStr, w.dayName]));

  console.log(`[KUH-Parser] 데이터 수합 시작: ${deptList.length}개 진료과 (기준: ${kst.formatted})`);

  // 1. 각 진료과별 의사 sid 목록 수합 (동시 4개 제한)
  const deptResults = await mapConcurrent(deptList, async (dept) => {
    const sids = await fetchDoctorsInDept(dept.cd);
    return { dept, sids };
  }, 4);

  const deptDoctorMap = {};
  for (const { dept, sids } of deptResults) {
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
    const res = await fetchDoctorSchedule(task.sid, yyyymm01, baseMonth);
    return {
      task,
      res
    };
  }, 4);

  // 4. 데이터 정규화 및 주간 매트릭스 구성 (이번주 + 다음주 월~토, 중복 daily 제거로 페이로드 90%+ 경량화)
  const createEmptyWeekMatrix = () => ({
    AM: { '월': [], '화': [], '수': [], '목': [], '금': [], '토': [] },
    PM: { '월': [], '화': [], '수': [], '목': [], '금': [], '토': [] }
  });
  const weekly = createEmptyWeekMatrix();
  const nextWeekly = createEmptyWeekMatrix();
  const seenSlots = new Set();

  for (const item of allMonthlySchedules) {
    if (!item.res || !item.res.monthlyList) continue;
    const { task, res } = item;
    const monthlyList = res.monthlyList;

    for (const entry of monthlyList) {
      const date = entry.orddd; // YYYYMMDD
      const thisDayName = thisWeekDayByDate.get(date);
      const nextDayName = nextWeekDayByDate.get(date);
      if (!thisDayName && !nextDayName) continue; // 이번주/다음주(월~토) 외 불필요한 미래/과거 데이터 제외

      const timeSlot = entry.apflag_nm === '오전' ? 'AM' : 'PM';
      const slotKey = `${task.deptCd}_${task.sid}_${date}_${timeSlot}`;
      if (seenSlots.has(slotKey)) continue;
      seenSlots.add(slotKey);
      
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

      // 1) 이번주 (월~토) 매트릭스 집계
      if (thisDayName) {
        weekly[timeSlot][thisDayName].push(docRecord);
      }

      // 2) 다음주 (월~토) 매트릭스 집계
      if (nextDayName) {
        nextWeekly[timeSlot][nextDayName].push(docRecord);
      }
    }
  }

  const payload = {
    updatedAt: kst.formatted,
    updatedDateOnly: kst.dateOnly,
    weekStartDate: weekDays[0].dateStr,
    weekDays,
    nextWeekDays,
    weekSaturday,
    nextWeekSaturday,
    weekly,
    nextWeekly
  };

  console.log(`[KUH-Parser] 경량 스케줄 구성 완료! (이번주+다음주 월~토 12일 매트릭스, 토요일 오전 이번주 ${weekly.AM['토'].length}명 / 다음주 ${nextWeekly.AM['토'].length}명)`);
  return payload;
}

module.exports = {
  getKSTDateString,
  getWeekDays,
  getWeekSaturday,
  hydrateDailyFromWeekly,
  buildFullSchedule
};
