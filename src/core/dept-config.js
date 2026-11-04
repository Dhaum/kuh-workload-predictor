/**
 * 건국대학교병원 23개 외래 진료과 코드 및 티어 매핑 설정
 */

const DEPT_CONFIG = {
  // Tier 1: 고난도 만성질환·다제장기처방 핵심과 (기본 On)
  tier1: [
    { key: 'neuro', cd: '000275', name: '신경과', chipClass: 'chip-neuro' },
    { key: 'endo', cd: '000240', name: '내분비대사내과', chipClass: 'chip-endo' },
    { key: 'cardio', cd: '000204', name: '심장혈관내과', chipClass: 'chip-cardio' },
    { key: 'nephro', cd: '000235', name: '신장내과', chipClass: 'chip-nephro' }
  ],

  // Tier 2: 수술·특수약제 관리 주요과
  tier2: [
    { key: 'onco', cd: '000245', name: '종양혈액내과', chipClass: 'chip-onco' },
    { key: 'pulmo', cd: '000224', name: '호흡기-알레르기내과', chipClass: 'chip-pulmo' },
    { key: 'rheum', cd: '000250', name: '류마티스내과', chipClass: 'chip-rheum' },
    { key: 'ortho', cd: '000312', name: '정형외과', chipClass: 'chip-ortho' },
    { key: 'ns', cd: '000277', name: '신경외과', chipClass: 'chip-ns' },
    { key: 'gi', cd: '000192', name: '소화기내과', chipClass: 'chip-gi' },
    { key: 'cs', cd: '000309', name: '심장혈관흉부외과', chipClass: 'chip-cs' }
  ],

  // Tier 3: 일반 외래 및 단기/국소 처방과
  tier3: [
    { key: 'pain', cd: '000397', name: '마취통증의학과', chipClass: 'chip-pain' },
    { key: 'uro', cd: '000363', name: '비뇨의학과', chipClass: 'chip-uro' },
    { key: 'oph', cd: '000340', name: '안과', chipClass: 'chip-oph' },
    { key: 'ent', cd: '000353', name: '이비인후-두경부외과', chipClass: 'chip-ent' },
    { key: 'derma', cd: '000290', name: '피부과', chipClass: 'chip-derma' },
    { key: 'psych', cd: '000268', name: '정신건강의학과', chipClass: 'chip-psych' },
    { key: 'fm', cd: '000516', name: '가정의학과', chipClass: 'chip-fm' },
    { key: 'gs', cd: '000300', name: '외과', chipClass: 'chip-gs' },
    { key: 'obgy', cd: '000330', name: '산부인과', chipClass: 'chip-obgy' },
    { key: 'pedia', cd: '000260', name: '소아청소년과', chipClass: 'chip-pedia' },
    { key: 'rm', cd: '000374', name: '재활의학과', chipClass: 'chip-rm' },
    { key: 'inf', cd: '000255', name: '감염내과', chipClass: 'chip-inf' }
  ]
};

// 모든 과의 평탄화된 목록
const ALL_DEPTS = [
  ...DEPT_CONFIG.tier1,
  ...DEPT_CONFIG.tier2,
  ...DEPT_CONFIG.tier3
];

// 코드별 맵
const DEPT_MAP_BY_CD = {};
const DEPT_MAP_BY_KEY = {};
ALL_DEPTS.forEach(d => {
  DEPT_MAP_BY_CD[d.cd] = d;
  DEPT_MAP_BY_KEY[d.key] = d;
});

module.exports = {
  DEPT_CONFIG,
  ALL_DEPTS,
  DEPT_MAP_BY_CD,
  DEPT_MAP_BY_KEY
};
