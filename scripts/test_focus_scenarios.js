/**
 * 17:00 이후 익일 외래 자동 포커스 및 요일 계산 정밀 검증 스크립트
 */

const { getWeekDays, getWeekSaturday, hydrateDailyFromWeekly } = require('../src/core/kuh-parser');

function calculateFocusState(kst) {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayIdx = kst.getDay();
  const dayName = dayNames[dayIdx];
  const hour = kst.getHours();

  // 실제 오늘 진료 요일 (주말은 가장 최근 진료일인 금요일 기준)
  const realTodayDayName = ['월', '화', '수', '목', '금'].includes(dayName) ? dayName : '금';

  let selectedDay;
  let tomorrowDay;
  let weekOffset;
  let isTomorrowAutoActive;
  let autoNoticeMessage = '';
  let autoRevertButtonText = '';

  // 1) 평일 월~목 17:00 이후 -> 내일 외래 자동 포커스
  if (hour >= 17 && dayIdx >= 1 && dayIdx <= 4) {
    tomorrowDay = dayNames[dayIdx + 1];
    selectedDay = tomorrowDay;
    weekOffset = 0;
    isTomorrowAutoActive = true;
    autoNoticeMessage = `내일(${tomorrowDay}) 외래 일정 자동 표시 중`;
    autoRevertButtonText = `오늘(${realTodayDayName}) 외래 보기`;
  }
  // 2) 금요일 17:00 이후 -> 다음주 월요일 미리보기 자동 포커스
  else if (hour >= 17 && dayIdx === 5) {
    selectedDay = '월';
    tomorrowDay = '월';
    weekOffset = 1;
    isTomorrowAutoActive = true;
    autoNoticeMessage = '다음주 월요일 외래 일정 자동 표시 중';
    autoRevertButtonText = '금요일(오늘) 외래 보기';
  }
  // 3) 주말 (토, 일) -> 다음주 월요일 미리보기 자동 포커스
  else if (dayIdx === 6 || dayIdx === 0) {
    selectedDay = '월';
    tomorrowDay = '월';
    weekOffset = 1;
    isTomorrowAutoActive = true;
    autoNoticeMessage = '다음주 월요일 외래 일정 자동 표시 중';
    autoRevertButtonText = '이번주 외래 보기';
  }
  // 4) 평일 주간 (00:00 ~ 16:59) -> 당일 외래 정상 포커스
  else {
    selectedDay = realTodayDayName;
    tomorrowDay = '';
    weekOffset = 0;
    isTomorrowAutoActive = false;
  }

  return {
    dayName,
    hour,
    selectedDay,
    tomorrowDay,
    weekOffset,
    isTomorrowAutoActive,
    autoNoticeMessage,
    autoRevertButtonText,
    realTodayDayName
  };
}

function runFocusTests() {
  console.log('====================================================');
  console.log('   17:00 이후 외래 자동 포커스 시나리오 전수 검증');
  console.log('====================================================\n');

  const testCases = [
    { name: '월요일 09:00 주간 외래', date: '2026-11-02T09:00:00+09:00', expDay: '월', expOffset: 0, expAuto: false },
    { name: '월요일 16:59 마감 직전', date: '2026-11-02T16:59:00+09:00', expDay: '월', expOffset: 0, expAuto: false },
    { name: '월요일 17:00 익일 전환', date: '2026-11-02T17:00:00+09:00', expDay: '화', expOffset: 0, expAuto: true },
    { name: '화요일 17:00 익일 전환', date: '2026-11-03T17:00:00+09:00', expDay: '수', expOffset: 0, expAuto: true },
    { name: '수요일 17:00 익일 전환', date: '2026-11-04T17:00:00+09:00', expDay: '목', expOffset: 0, expAuto: true },
    { name: '목요일 17:00 익일 전환', date: '2026-11-05T17:00:00+09:00', expDay: '금', expOffset: 0, expAuto: true },
    { name: '금요일 10:00 주간 외래', date: '2026-11-06T10:00:00+09:00', expDay: '금', expOffset: 0, expAuto: false },
    { name: '금요일 16:59 마감 직전', date: '2026-11-06T16:59:00+09:00', expDay: '금', expOffset: 0, expAuto: false },
    { name: '금요일 17:00 다음주 월 전환', date: '2026-11-06T17:00:00+09:00', expDay: '월', expOffset: 1, expAuto: true },
    { name: '토요일 14:00 주말 대기', date: '2026-11-07T14:00:00+09:00', expDay: '월', expOffset: 1, expAuto: true },
    { name: '일요일 11:00 주말 대기', date: '2026-11-08T11:00:00+09:00', expDay: '월', expOffset: 1, expAuto: true },
    { name: '일요일 20:30 야간 대기', date: '2026-11-08T20:30:00+09:00', expDay: '월', expOffset: 1, expAuto: true }
  ];

  let passed = 0;
  for (const tc of testCases) {
    const d = new Date(tc.date);
    const res = calculateFocusState(d);

    const dayMatch = res.selectedDay === tc.expDay;
    const offsetMatch = res.weekOffset === tc.expOffset;
    const autoMatch = res.isTomorrowAutoActive === tc.expAuto;

    if (dayMatch && offsetMatch && autoMatch) {
      console.log(`✅ [PASS] ${tc.name} -> 요일: ${res.selectedDay}, 오프셋: ${res.weekOffset}, 자동포커스: ${res.isTomorrowAutoActive}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${tc.name}`);
      console.error(`   기대치: 요일=${tc.expDay}, 오프셋=${tc.expOffset}, 자동=${tc.expAuto}`);
      console.error(`   실제치: 요일=${res.selectedDay}, 오프셋=${res.weekOffset}, 자동=${res.isTomorrowAutoActive}`);
    }
  }

  console.log(`\n결과: ${passed}/${testCases.length} 통과 (${passed === testCases.length ? '전원 합격 🎉' : '실패 항목 존재 ⚠️'})\n`);
  if (passed !== testCases.length) process.exit(1);
}

function runWeekBoundaryTests() {
  console.log('====================================================');
  console.log('   getWeekDays 월말/월초 주간 경계 정밀 검증');
  console.log('====================================================\n');

  const boundaryCases = [
    {
      name: '2026-11-16 (평범한 주중)',
      date: '2026-11-16T09:00:00+09:00',
      check: (thisWeek, nextWeek) => ({
        ok:
          thisWeek[0].dateStr === '20261116' &&
          nextWeek[0].dateStr === '20261123',
        detail: `이번주 월=${thisWeek[0].dateStr}, 다음주 월=${nextWeek[0].dateStr}`
      })
    },
    {
      name: '2026-11-23 (다음주 월말-월초 교차)',
      date: '2026-11-23T09:00:00+09:00',
      check: (thisWeek, nextWeek) => ({
        ok:
          thisWeek[0].dateStr === '20261123' &&
          nextWeek[0].dateStr === '20261130' &&
          nextWeek[4].dateStr === '20261204',
        detail: `이번주 월=${thisWeek[0].dateStr}, 다음주 월=${nextWeek[0].dateStr}, 다음주 금=${nextWeek[4].dateStr}`
      })
    },
    {
      name: '2026-12-02 (월초 주중: 월요일 전월 귀속)',
      date: '2026-12-02T09:00:00+09:00',
      check: (thisWeek, nextWeek) => {
        const yyyymm = thisWeek[0].dateStr.slice(0, 6);
        return {
          ok:
            thisWeek[0].dateStr === '20261130' &&
            yyyymm === '202611' &&
            thisWeek[4].dateStr === '20261204',
          detail: `이번주 월=${thisWeek[0].dateStr} (YYYYMM=${yyyymm}), 이번주 금=${thisWeek[4].dateStr}`
        };
      }
    }
  ];

  let passed = 0;
  for (const bc of boundaryCases) {
    const refDate = new Date(bc.date);
    const thisWeek = getWeekDays(refDate, 0);
    const nextWeek = getWeekDays(refDate, 1);
    const res = bc.check(thisWeek, nextWeek);

    if (res.ok) {
      console.log(`✅ [PASS] ${bc.name} -> ${res.detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${bc.name} -> ${res.detail}`);
    }
  }

  console.log(`\n경계 검증 결과: ${passed}/${boundaryCases.length} 통과 (${passed === boundaryCases.length ? '전원 합격 🎉' : '실패 항목 존재 ⚠️'})\n`);
  if (passed !== boundaryCases.length) process.exit(1);
}

function runSaturdayTests() {
  console.log('====================================================');
  console.log('   getWeekSaturday & 슬림 데이터 복원 정밀 검증');
  console.log('====================================================\n');

  const satCases = [
    {
      name: '2026-11-21 (토요일 당일 접속)',
      date: '2026-11-21T09:00:00+09:00',
      expThisSat: '20261121',
      expNextSat: '20261128'
    },
    {
      name: '2026-11-30 (월말 -> 다음달 토요일 교차)',
      date: '2026-11-30T10:00:00+09:00',
      expThisSat: '20261205',
      expNextSat: '20261212'
    },
    {
      name: '2026-12-28 (연말 -> 신년 토요일 교차)',
      date: '2026-12-28T10:00:00+09:00',
      expThisSat: '20270102',
      expNextSat: '20270109'
    }
  ];

  let passed = 0;
  for (const sc of satCases) {
    const ref = new Date(sc.date);
    const thisSat = getWeekSaturday(ref, 0);
    const nextSat = getWeekSaturday(ref, 1);
    const hydrated = hydrateDailyFromWeekly({
      weekDays: getWeekDays(ref, 0),
      nextWeekDays: getWeekDays(ref, 1),
      weekSaturday: thisSat,
      nextWeekSaturday: nextSat,
      weekly: { AM: { '토': [{ name: '송기호' }] }, PM: { '토': [] } },
      nextWeekly: { AM: { '토': [{ name: '김동욱' }] }, PM: { '토': [] } }
    });
    const ok =
      thisSat.dateStr === sc.expThisSat &&
      nextSat.dateStr === sc.expNextSat &&
      thisSat.dayName === '토' &&
      Object.keys(hydrated).length === 12 &&
      hydrated[sc.expThisSat].AM[0].name === '송기호' &&
      hydrated[sc.expNextSat].AM[0].name === '김동욱';

    if (ok) {
      console.log(`✅ [PASS] ${sc.name} -> 이번주 토=${thisSat.dateStr}, 다음주 토=${nextSat.dateStr}, 복원 일수=12일`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${sc.name}`);
    }
  }

  console.log(`\n토요일 검증 결과: ${passed}/${satCases.length} 통과 (${passed === satCases.length ? '전원 합격 🎉' : '실패 항목 존재 ⚠️'})\n`);
  if (passed !== satCases.length) process.exit(1);
}

runFocusTests();
runWeekBoundaryTests();
runSaturdayTests();
