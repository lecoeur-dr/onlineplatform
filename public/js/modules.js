// 모듈(업무 영역) 정의 — 프론트엔드와 워커가 함께 사용하는 "규격"
//
// scope
//   date   : 날짜가 있는 기록. 학년도 범위(1월 ~ 다음해 2월)로 조회하므로
//            1~2월 기록은 두 해에 자연스럽게 함께 보임
//   year   : 연도별로 따로 관리하는 기록 (시간표, 예산 등). 다음 해로 복사 가능
//   global : 연도와 무관한 기록 (연락처, 위임전결 등)
//
// edit : 수정 가능한 최소 권한 (staff | admin)

export const ROLES = { admin: '관리자', staff: '교직원', viewer: '열람', pending: '승인대기', blocked: '차단' };

// 설정에서 관리하는 목록(드롭다운) 기본값
export const DEFAULT_LISTS = {
  depts: ['교무', '연구', '정보', '예술', '생활', '체육', '수영', '상담', '보건', '영양', '복지', '학맞통', '진로', '학부모회', '과학', '독서', '학력', '특수', '안전', '늘봄', '행정실', '학교장'],
  places: ['체육관', '도서관', 'AI교실', '과학실', '교장실', '각반교실', '운동장', '꿈마루터', '교과연구실', '소리마루'],
  classes: ['1-1', '2-1', '2-2', '3-1', '3-2', '4-1', '5-1', '5-2', '6-1', '6-2', '하나반'],
  programs: ['SW·AI', '국악', '무용', '연극', '음악줄넘기', '기타'],
  eventCategories: ['행사', '특별수업', '회의', '연수', '공휴일', '휴업일', '방학', '기타'],
};

// 수업일수 계산에서 제외하는 분류
export const NO_SCHOOL_CATEGORIES = ['공휴일', '휴업일', '방학'];

export const MODULES = {
  events: {
    label: '학사일정', icon: '📅', scope: 'date', edit: 'staff', view: 'calendar',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date', hint: '여러 날 행사일 때만' },
      { key: 'title', label: '행사명', type: 'textarea', required: true },
      { key: 'category', label: '분류', type: 'select', list: 'eventCategories' },
      { key: 'dept', label: '담당부서', type: 'select', list: 'depts', free: true },
      { key: 'place', label: '장소', type: 'select', list: 'places', free: true },
      { key: 'note', label: '비고', type: 'text' },
      { key: 'review', label: '확인필요', type: 'bool', hint: '가져오기 때 담당·장소 줄이 맞지 않은 항목' },
    ],
  },
  trips: {
    label: '출장', icon: '🚌', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date' },
      { key: 'title', label: '출장 내용', type: 'textarea', required: true, hint: '출장명/이름/시각/장소' },
      { key: 'person', label: '출장자', type: 'text' },
    ],
  },
  programs: {
    label: '특별수업', icon: '🎨', scope: 'date', edit: 'staff',
    fields: [
      { key: 'program', label: '프로그램', type: 'select', list: 'programs', free: true, required: true },
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'content', label: '반·교시', type: 'textarea', hint: '예) (4-1) 1-2교시' },
      { key: 'place', label: '장소', type: 'select', list: 'places', free: true },
      { key: 'status', label: '상태', type: 'select', options: ['예정', '변경', '취소'] },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  monthNotes: {
    label: '월별 안내', icon: '🗓️', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '월(1일)', type: 'date', required: true, hint: '해당 월 1일' },
      { key: 'content', label: '교육과정 주요 안내', type: 'textarea' },
      { key: 'schoolDays', label: '수업일수', type: 'text' },
    ],
  },
  meetings: {
    label: '회의록', icon: '📝', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '회의일', type: 'date', required: true },
      { key: 'agenda', label: '안건', type: 'textarea', required: true },
      { key: 'result', label: '결과', type: 'textarea' },
      { key: 'status', label: '상태', type: 'select', options: ['완료', '재논의', '진행중'] },
    ],
  },
  notices: {
    label: '안내사항', icon: '📢', scope: 'year', edit: 'staff',
    fields: [
      { key: 'dept', label: '부서', type: 'select', list: 'depts', free: true },
      { key: 'content', label: '내용', type: 'textarea', required: true },
      { key: 'due', label: '마감일', type: 'date' },
      { key: 'link', label: '링크', type: 'url' },
    ],
  },
  links: {
    label: '바로가기', icon: '🔗', scope: 'global', edit: 'staff',
    fields: [
      { key: 'title', label: '이름', type: 'text', required: true },
      { key: 'url', label: '주소', type: 'url', required: true },
      { key: 'note', label: '설명', type: 'text' },
    ],
  },
  timetables: {
    label: '시간표', icon: '🕘', scope: 'year', edit: 'staff', view: 'timetable',
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true, hint: '예) 과학 전담, 3-1' },
      { key: 'kind', label: '종류', type: 'select', options: ['전담', '학급', '기타'] },
      { key: 'semester', label: '학기', type: 'select', options: ['1학기', '2학기', '연간'] },
      { key: 'note', label: '메모', type: 'text' },
    ],
  },
  openClasses: {
    label: '동료장학', icon: '👀', scope: 'year', edit: 'staff', view: 'openClasses',
    fields: [
      { key: 'group', label: '그룹', type: 'text' },
      { key: 'openDate', label: '공개일', type: 'text', hint: '예) 9.22(화) 2교시' },
      { key: 'className', label: '학급', type: 'text' },
      { key: 'teacher', label: '수업교사', type: 'text', required: true },
      { key: 'subject', label: '과목', type: 'text' },
      { key: 'room', label: '교실', type: 'text' },
      { key: 'pre', label: '수업설계(선협의)', type: 'text' },
      { key: 'post', label: '수업성찰(후협의)', type: 'text' },
      { key: 'observers', label: '참관 신청', type: 'names', hint: '참관 버튼으로 신청' },
    ],
  },
  purchases: {
    label: '물품 신청', icon: '🛒', scope: 'year', edit: 'staff',
    fields: [
      { key: 'budget', label: '예산 구분', type: 'text' },
      { key: 'requester', label: '신청자', type: 'text', required: true },
      { key: 'item', label: '품목', type: 'textarea', required: true },
      { key: 'price', label: '단가', type: 'money' },
      { key: 'qty', label: '수량', type: 'number' },
      { key: 'amount', label: '금액', type: 'money', computed: (d) => (Number(d.price) || 0) * (Number(d.qty) || 0), sum: true },
      { key: 'link', label: '구매링크', type: 'url' },
      { key: 'received', label: '수령', type: 'bool' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  contests: {
    label: '공모사업', icon: '🏆', scope: 'year', edit: 'staff',
    fields: [
      { key: 'applicant', label: '신청자', type: 'text' },
      { key: 'name', label: '공모사업명', type: 'text', required: true },
      { key: 'grades', label: '운영 대상 학년', type: 'text' },
      { key: 'budget', label: '받은 예산', type: 'money', sum: true },
    ],
  },
  contestInfo: {
    label: '공모 안내', icon: '📬', scope: 'year', edit: 'staff',
    fields: [
      { key: 'topic', label: '주제', type: 'text' },
      { key: 'content', label: '내용', type: 'text', required: true },
      { key: 'period', label: '기간', type: 'text' },
      { key: 'amount', label: '금액', type: 'text' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  budget: {
    label: '예산', icon: '💰', scope: 'year', edit: 'staff',
    fields: [
      { key: 'program', label: '세부사업', type: 'text' },
      { key: 'item', label: '세부항목', type: 'text' },
      { key: 'category', label: '원가통계비목', type: 'text' },
      { key: 'detail', label: '산출내역', type: 'text' },
      { key: 'formula', label: '산출식', type: 'text' },
      { key: 'amount', label: '금액', type: 'money', sum: true },
      { key: 'consult', label: '협의', type: 'text' },
      { key: 'label', label: '항목', type: 'text' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  rules: {
    label: '위임전결', icon: '📖', scope: 'global', edit: 'admin',
    fields: [
      { key: 'section', label: '영역', type: 'text' },
      { key: 'group', label: '구분', type: 'text' },
      { key: 'rule', label: '규정', type: 'text' },
      { key: 'detail', label: '시간·세부', type: 'text' },
      { key: 'process', label: '절차', type: 'textarea' },
    ],
  },
  contacts: {
    label: '내선번호', icon: '☎️', scope: 'global', edit: 'staff',
    fields: [
      { key: 'dept', label: '부서·장소', type: 'text' },
      { key: 'name', label: '사용자', type: 'text' },
      { key: 'phone', label: '번호', type: 'text' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  secrets: {
    label: '계정·비밀번호', icon: '🔐', scope: 'global', edit: 'admin',
    fields: [
      { key: 'category', label: '구분', type: 'text' },
      { key: 'site', label: '사이트·장소', type: 'text', required: true },
      { key: 'account', label: '아이디', type: 'text' },
      { key: 'password', label: '비밀번호', type: 'secret' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  boards: {
    label: '자유 표', icon: '🧮', scope: 'year', edit: 'staff', view: 'board',
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'note', label: '설명', type: 'text' },
    ],
  },
};

// 메뉴 순서
export const MENU = [
  { id: 'dashboard', label: '대시보드', icon: '🏠' },
  { id: 'events' }, { id: 'programs' }, { id: 'trips' }, { id: 'monthNotes' },
  { id: 'timetables' }, { id: 'meetings' }, { id: 'notices' }, { id: 'links' },
  { id: 'openClasses' }, { id: 'purchases' }, { id: 'contests' }, { id: 'contestInfo' }, { id: 'budget' },
  { id: 'rules' }, { id: 'contacts' }, { id: 'secrets' }, { id: 'boards' },
];

// 학년도 Y의 범위: Y-01-01 ~ (Y+1)-02-말일
export function yearRange(year) {
  const y = Number(year);
  const end = new Date(Date.UTC(y + 1, 2, 0)); // 다음해 3월 0일 = 2월 말일
  return { from: `${y}-01-01`, to: `${y + 1}-02-${String(end.getUTCDate()).padStart(2, '0')}` };
}

// 학년도 Y의 월 목록 (14개월)
export function yearMonths(year) {
  const y = Number(year);
  const list = [];
  for (let i = 0; i < 14; i++) list.push({ y: y + Math.floor(i / 12), m: (i % 12) + 1 });
  return list;
}

// 필드 값 정리: computed 적용, 숫자형 변환, 정의되지 않은 키 제거
export function normalizeData(moduleId, data) {
  const def = MODULES[moduleId];
  const out = {};
  for (const f of def.fields) {
    let v = data?.[f.key];
    if (f.computed) continue;
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'money' || f.type === 'number') {
      const n = Number(String(v).replace(/[,원\s]/g, ''));
      v = Number.isFinite(n) ? n : String(v);
    } else if (f.type === 'bool') v = v === true || v === 'true' || v === 1;
    else if (f.type === 'names') v = Array.isArray(v) ? v.map(String).filter(Boolean) : String(v).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'date') {
      v = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    } else v = String(v);
    out[f.key] = v;
  }
  for (const f of def.fields) if (f.computed) out[f.key] = f.computed(out);
  // 화면별 부가 데이터(시간표 칸, 자유표 격자)는 그대로 보존
  if (def.view === 'timetable' && data?.grid) out.grid = data.grid;
  if (def.view === 'board' && data?.rows) { out.rows = data.rows; if (data.merges) out.merges = data.merges; }
  return out;
}
