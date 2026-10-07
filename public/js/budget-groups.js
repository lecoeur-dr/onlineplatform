// 💰 학교본예산 세부사업 → 상위 묶음(정책사업). 엑셀에 '정책사업' 칸이 있으면 그 값을 쓰고,
//   없으면 학교회계 세출 구조의 일반적인 이름으로 묶음 (교육청·학교마다 다를 수 있어 예산 줄의 group 값이 우선)
export const BUDGET_GROUPS = [
  { name: '인적자원운용', icon: '👩‍🏫', re: /교직원|인건비|연수|역량강화|복지비|대체/ },
  { name: '학생복지·교육격차해소', icon: '🍚', re: /급식|보건|위생|안전관리|학생복지|교육격차|교육복지|무상|장학/ },
  { name: '기본적 교육활동', icon: '📚', re: /교과|특수교육|자율|자치|동아리|봉사|진로|현장체험|체험학습|창의적/ },
  { name: '선택적 교육활동', icon: '🎨', re: /방과후|선택적|독서|돌봄|늘봄|영재|캠프/ },
  { name: '교육활동 지원', icon: '🧰', re: /교무|학사|정보화|환경개선|생활|상담|학교폭력|폭력예방|안전교육|평가|교육과정/ },
  { name: '학교 일반운영', icon: '🏫', re: /시설장비|유지|운영위원회|학부모|부서|기본운영|일반운영|공공요금|관리/ },
  { name: '학교시설 확충', icon: '🏗', re: /시설확충|확충|증축|신축|개축/ },
  { name: '예비비 및 기타', icon: '📦', re: /반환|예비비|기타지출/ },
];
export const OTHER_GROUP = { name: '기타', icon: '📁' };

export function groupOfProgram(program, explicit = '') {
  if (explicit) return explicit;
  const p = String(program || '').replace(/\[[^\]]*\]/g, ''); // [국고] 같은 머리표 제외
  const first = ['학교시설 확충', '예비비 및 기타', '학생복지·교육격차해소']; // '학생및교직원보건' 같은 이름이 교직원 묶음으로 가지 않게
  const order = [...first, ...BUDGET_GROUPS.map((g) => g.name).filter((n) => !first.includes(n))];
  for (const n of order) if (BUDGET_GROUPS.find((g) => g.name === n).re.test(p)) return n;
  return OTHER_GROUP.name;
}
export const groupIcon = (name) => (BUDGET_GROUPS.find((g) => g.name === name) || OTHER_GROUP).icon;
export const groupOrder = (name) => { const i = BUDGET_GROUPS.findIndex((g) => g.name === name); return i < 0 ? 99 : i; };

// 예산 줄 중 합계·소계 줄 (예전에 올라간 '[ 세 부 항 목 소 계 ]' 등)
export const isSubtotalRow = (d) => [d?.program, d?.item, d?.category, d?.detail].some((x) => { const t = String(x || '').replace(/[\s[\]()<>【】]/g, ''); return /^(총?합계|소계|총계)$/.test(t) || /(소계|합계|총계)$/.test(t); });
