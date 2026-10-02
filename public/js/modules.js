// 모듈(업무 영역) 정의 — 프론트엔드와 워커가 함께 사용하는 "규격"
//
// scope
//   date   : 날짜가 있는 기록. 학년도 범위(1월 ~ 다음해 2월)로 조회하므로
//            1~2월 기록은 두 해에 자연스럽게 함께 보임
//   year   : 연도별로 따로 관리하는 기록 (시간표, 예산 등). 다음 해로 복사 가능
//   global : 연도와 무관한 기록 (연락처, 위임전결 등)
//
// edit : 수정 가능한 최소 권한 (staff | admin)
// space: school(기본, 학교 공유) | desk(Deskterior 개인 공간, 본인만) | market(Teachshop: 모든 선생님 공유)
// enc  : 필드에 enc:true → 서버에 암호화해 저장 (학생 관련 기록)

export const APP_NAME = 'OnlineFlatform';
export const DESK_NAME = 'Deskterior';
export const SHOP_NAME = 'Teachshop';
export const ROLES = { admin: '관리자', staff: '교직원', viewer: '열람', pending: '승인대기', blocked: '차단' };

// 설정에서 관리하는 목록(드롭다운) 기본값
export const DEFAULT_LISTS = {
  depts: ['교무', '연구', '정보', '예술', '생활', '체육', '수영', '상담', '보건', '영양', '복지', '학맞통', '진로', '학부모회', '과학', '독서', '학력', '특수', '안전', '늘봄', '행정실', '학교장'],
  places: ['체육관', '도서관', 'AI교실', '과학실', '교장실', '각반교실', '운동장', '꿈마루터', '교과연구실', '소리마루'],
  classes: ['1-1', '2-1', '2-2', '3-1', '3-2', '4-1', '5-1', '5-2', '6-1', '6-2', '하나반'],
  programs: ['SW·AI', '국악', '무용', '연극', '음악줄넘기', '기타'],
  meetingTypes: ['전체회의', '월례회의', '부장회의', '학년협의회', '교과협의회', '기타'],
  linkCategories: ['업무 폴더', '교육청·행정', '에듀테크', '신청·설문', '기타'],
  leaveKinds: ['출장', '조퇴', '외출', '지참', '연가', '병가', '공가', '특별휴가', '기타'],
  periods: ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '방과후'],
  resourceCategories: ['공문 서식', '업무 양식', '매뉴얼·지침', '수업 자료', '기타'],
  subjects: ['국어', '수학', '사회', '과학', '영어', '도덕', '실과', '체육', '음악', '미술', '바른 생활', '슬기로운 생활', '즐거운 생활', '창의적 체험활동'],
};

// 평가 단계 체계: 앞쪽일수록 높은 단계
export const EVAL_SCALES = {
  '3단계': ['잘함', '보통', '노력 요함'],
  '4단계': ['매우 잘함', '잘함', '보통', '노력 요함'],
  '상중하': ['상', '중', '하'],
  'A~E': ['A', 'B', 'C', 'D', 'E'],
  '도달/미도달': ['도달', '미도달'],
};
export const scaleOf = (plan) => EVAL_SCALES[plan?.data?.scale] || EVAL_SCALES['3단계'];

// 학사일정 색 분류 (순서 = 범례 순서)
export const CATEGORIES = [
  { name: '전체행사', color: '#3b6fe0' },
  { name: '학급수업', color: '#1f9d55' },
  { name: '특별수업', color: '#8a4fd6' },
  { name: '동료장학', color: '#d6408f' },
  { name: '회의', color: '#0f8f86' },
  { name: '연수', color: '#e07b12' },
  { name: '복무·출장', color: '#9a6b2f' },
  { name: '대회출전', color: '#3949ab' },
  { name: '휴일·방학', color: '#d93b3b' },
  { name: '기타', color: '#7a808c' },
];
export const EVENT_CATEGORIES = CATEGORIES.map((c) => c.name);
export const categoryColor = (name) => (CATEGORIES.find((c) => c.name === name) || CATEGORIES.at(-1)).color;

// v1 분류 → v2 분류
export function normCategory(c) {
  if (!c) return '전체행사';
  if (c === '행사') return '전체행사';
  if (['공휴일', '휴업일', '방학'].includes(c)) return '휴일·방학';
  if (c === '출장') return '복무·출장';
  return EVENT_CATEGORIES.includes(c) ? c : '기타';
}

// 수업일수 계산에서 제외하는 분류
export const NO_SCHOOL_CATEGORIES = ['휴일·방학'];

export const TIMETABLE_KINDS = ['학급', '전담', '특별실', '외부강의', '기타'];

export const MODULES = {
  events: {
    label: '학사일정', icon: '📅', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date', hint: '여러 날 행사일 때만' },
      { key: 'title', label: '행사명', type: 'textarea', required: true },
      { key: 'category', label: '분류', type: 'select', options: EVENT_CATEGORIES },
      { key: 'target', label: '대상', type: 'text', hint: '예) 전교생, 5~6학년, 3-1' },
      { key: 'dept', label: '담당부서', type: 'select', list: 'depts', free: true },
      { key: 'place', label: '장소', type: 'select', list: 'places', free: true },
      { key: 'note', label: '비고', type: 'text' },
      { key: 'dday', label: 'D-Day 표시', type: 'bool', hint: '체크하면 홈에 "D-12"처럼 남은 날을 표시' },
      { key: 'review', label: '확인필요', type: 'bool', hint: '가져오기 때 담당·장소 줄이 맞지 않은 항목' },
      { key: 'source', label: '출처', type: 'text', hint: '"나이스"는 나이스에서 자동으로 가져온 일정 (다시 동기화하면 갱신됨)' },
    ],
  },
  trips: {
    label: '복무·출장', icon: '🚌', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date', hint: '여러 날일 때만' },
      { key: 'kind', label: '구분', type: 'select', list: 'leaveKinds', free: true },
      { key: 'person', label: '교직원', type: 'select', list: 'staff', free: true },
      { key: 'time', label: '시간·교시', type: 'text', hint: '예) 14:00~16:40, 5~6교시' },
      { key: 'title', label: '내용·장소', type: 'textarea', required: true, hint: '예) 교육지원청 협의회 / 연수원' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  substitutes: {
    label: '보결', icon: '🔁', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'period', label: '교시', type: 'select', list: 'periods', free: true, required: true },
      { key: 'className', label: '학급', type: 'select', list: 'classes', free: true },
      { key: 'subject', label: '과목', type: 'text' },
      { key: 'absent', label: '부재 교사', type: 'select', list: 'staff', free: true },
      { key: 'substitute', label: '보결 교사', type: 'select', list: 'staff', free: true, required: true },
      { key: 'reason', label: '사유', type: 'text', hint: '예) 출장, 연가' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  briefings: {
    label: '전달사항', icon: '📣', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'kind', label: '구분', type: 'select', options: ['조례', '종례', '공통'] },
      { key: 'target', label: '대상', type: 'text', hint: '비워 두면 전체. 예) 5~6학년 담임' },
      { key: 'content', label: '전달 내용', type: 'textarea', required: true, hint: '학생에게 전달할 내용 (담임이 그대로 읽어 줄 수 있게)' },
      { key: 'dept', label: '부서', type: 'select', list: 'depts', free: true },
    ],
  },
  reservations: {
    label: '특별실 예약', icon: '🏫', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'place', label: '장소', type: 'select', list: 'places', free: true, required: true },
      { key: 'period', label: '교시', type: 'select', list: 'periods', free: true, required: true },
      { key: 'user', label: '사용 교사', type: 'select', list: 'staff', free: true, required: true },
      { key: 'className', label: '학급', type: 'select', list: 'classes', free: true },
      { key: 'purpose', label: '용도', type: 'text', hint: '예) 과학 실험, 학부모 상담' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  duties: {
    label: '담당 배정', icon: '🧑‍🏫', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'title', label: '행사·업무', type: 'text', required: true, hint: '예) 운동회, 학부모 공개수업' },
      { key: 'role', label: '역할', type: 'text', hint: '예) 진행, 안전 지도, 사진' },
      { key: 'person', label: '담당자', type: 'select', list: 'staff', free: true, required: true },
      { key: 'place', label: '장소', type: 'select', list: 'places', free: true },
      { key: 'time', label: '시간', type: 'text', hint: '예) 09:00~10:30' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  memos: {
    label: '한 줄 메모', icon: '✏️', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'text', label: '메모', type: 'text', required: true, hint: '달력 날짜 칸에 짧게 보이는 메모' },
    ],
  },
  assignments: {
    label: '업무분장', icon: '🧩', scope: 'year', edit: 'staff',
    fields: [
      { key: 'name', label: '이름', type: 'text', required: true },
      { key: 'position', label: '직위', type: 'text', hint: '예) 교감, 부장, 교사, 전담, 실무사' },
      { key: 'dept', label: '부서', type: 'select', list: 'depts', free: true },
      { key: 'homeroom', label: '담임 학급', type: 'select', list: 'classes', free: true },
      { key: 'subject', label: '담당 교과', type: 'text' },
      { key: 'duties', label: '담당 업무', type: 'textarea' },
      { key: 'room', label: '교실·위치', type: 'text' },
      { key: 'phone', label: '내선', type: 'text' },
    ],
  },
  resources: {
    label: '자료실', icon: '📂', scope: 'global', edit: 'staff',
    fields: [
      { key: 'category', label: '분류', type: 'select', list: 'resourceCategories', free: true },
      { key: 'title', label: '자료명', type: 'text', required: true },
      { key: 'url', label: '링크(드라이브 등)', type: 'url', required: true },
      { key: 'dept', label: '부서', type: 'select', list: 'depts', free: true },
      { key: 'note', label: '설명', type: 'text' },
    ],
  },
  collections: {
    label: '수합', icon: '📥', scope: 'year', edit: 'staff',
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true, hint: '예) 학급 교육과정 운영계획 제출' },
      { key: 'due', label: '마감일', type: 'date' },
      { key: 'target', label: '대상', type: 'names', hint: '이름을 쉼표로 구분. 비워 두면 전체 교직원' },
      { key: 'content', label: '안내', type: 'textarea' },
      { key: 'link', label: '제출 링크·폴더', type: 'url' },
      { key: 'done', label: '제출 완료', type: 'names', hint: '각자 [제출 완료] 버튼으로 체크' },
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
  meetings: {
    label: '회의록', icon: '📝', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '회의일', type: 'date', required: true },
      { key: 'meeting', label: '회의명', type: 'select', list: 'meetingTypes', free: true },
      { key: 'agenda', label: '안건', type: 'textarea', required: true },
      { key: 'result', label: '결과', type: 'textarea' },
      { key: 'status', label: '상태', type: 'select', options: ['완료', '재논의', '진행중'] },
    ],
  },
  notices: {
    label: '공지', icon: '📢', scope: 'year', edit: 'staff',
    fields: [
      { key: 'title', label: '제목', type: 'text' },
      { key: 'category', label: '분류', type: 'select', options: ['월별 안내', '부서 안내', '일반'] },
      { key: 'pinned', label: '전체 공지', type: 'bool', hint: '체크하면 홈과 학사일정 달력(해당 월 머리)에 고정' },
      { key: 'month', label: '해당 월', type: 'month', hint: '월별 안내일 때 해당 월' },
      { key: 'dept', label: '부서', type: 'select', list: 'depts', free: true },
      { key: 'content', label: '내용', type: 'textarea', required: true },
      { key: 'schoolDays', label: '수업일수', type: 'text', hint: '월별 안내일 때만 (예: 21일)' },
      { key: 'due', label: '마감일', type: 'date' },
      { key: 'link', label: '링크', type: 'url' },
    ],
  },
  links: {
    label: '바로가기', icon: '🔗', scope: 'global', edit: 'staff',
    fields: [
      { key: 'category', label: '분류', type: 'select', list: 'linkCategories', free: true },
      { key: 'title', label: '이름', type: 'text', required: true },
      { key: 'url', label: '주소', type: 'url', required: true },
      { key: 'note', label: '설명', type: 'text' },
    ],
  },
  timetables: {
    label: '시간표', icon: '🕘', scope: 'year', edit: 'staff', extras: ['grid'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true, hint: '예) 3-1, 과학 전담, AI교실, 국악 강사' },
      { key: 'kind', label: '종류', type: 'select', options: TIMETABLE_KINDS },
      { key: 'semester', label: '학기', type: 'select', options: ['1학기', '2학기', '연간'] },
      { key: 'note', label: '메모', type: 'text' },
    ],
  },
  openClasses: {
    label: '동료장학', icon: '👀', scope: 'year', edit: 'staff',
    fields: [
      { key: 'group', label: '그룹', type: 'text' },
      { key: 'date', label: '공개일', type: 'date' },
      { key: 'period', label: '교시', type: 'text', hint: '예) 2교시' },
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
      { key: 'budget', label: '예산 구분(재원)', type: 'select', list: 'budgetSources', free: true, hint: '예산·공모사업 목록에서 고르면 사용 현황에 반영' },
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
    label: '자유 표', icon: '🧮', scope: 'year', edit: 'staff', extras: ['rows', 'merges'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'note', label: '설명', type: 'text' },
    ],
  },

  // ---------- Deskterior (개인 공간: 본인만 봄) ----------
  students: {
    label: '학생 명단', icon: '🧒', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'num', label: '번호', type: 'number' },
      { key: 'name', label: '이름', type: 'text', required: true },
      { key: 'gender', label: '성별', type: 'select', options: ['남', '여'] },
      { key: 'birthday', label: '생일', type: 'text', hint: '예) 3-15 (월-일, 생일 축하 알림용)' },
      { key: 'guardian', label: '보호자 연락처', type: 'text', enc: true, hint: '암호화 저장' },
      { key: 'health', label: '알레르기·건강', type: 'text', enc: true, hint: '급식 알레르기 등 (암호화 저장)' },
      { key: 'afterschool', label: '방과후·돌봄', type: 'text', hint: '예) 돌봄 2교실, 방과후 축구(화·목)' },
      { key: 'note', label: '특이사항', type: 'textarea', enc: true, hint: '암호화해 저장되며 본인만 봅니다' },
    ],
  },
  seatPlan: {
    label: '자리 배치', icon: '🪑', scope: 'year', edit: 'staff', space: 'desk', extras: ['layout'],
    fields: [
      { key: 'title', label: '이름', type: 'text', required: true, hint: '예) 1학기 1차' },
      { key: 'note', label: '메모', type: 'text' },
    ],
  },
  classRoles: {
    label: '1인 1역', icon: '🧹', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'role', label: '역할', type: 'text', required: true, hint: '예) 칠판 정리, 우유 당번' },
      { key: 'students', label: '맡은 학생', type: 'names', hint: '이름을 쉼표로 구분' },
      { key: 'note', label: '하는 일', type: 'text' },
    ],
  },
  attendance: {
    label: '출결', icon: '🗓', scope: 'date', edit: 'staff', space: 'desk',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'student', label: '학생', type: 'select', list: 'students', free: true, required: true },
      { key: 'type', label: '구분', type: 'select', options: ['결석', '지각', '조퇴', '결과'], required: true },
      { key: 'reason', label: '사유', type: 'select', options: ['질병', '미인정', '출석인정', '기타'] },
      { key: 'doc', label: '증빙서류 제출', type: 'bool' },
      { key: 'note', label: '메모', type: 'text', hint: '예) 독감, 체험학습' },
    ],
  },
  checklists: {
    label: '체크리스트', icon: '☑️', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true, hint: '예) 가정통신문 회신, 수학 익힘책 검사' },
      { key: 'due', label: '기한', type: 'date' },
      { key: 'note', label: '메모', type: 'text' },
      { key: 'done', label: '완료 학생', type: 'names' },
    ],
  },
  points: {
    label: '칭찬 점수', icon: '⭐', scope: 'date', edit: 'staff', space: 'desk',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'student', label: '학생', type: 'select', list: 'students', free: true, required: true },
      { key: 'points', label: '점수', type: 'number', required: true },
      { key: 'reason', label: '이유', type: 'text' },
    ],
  },
  dailyNotes: {
    label: '알림장', icon: '📒', scope: 'date', edit: 'staff', space: 'desk',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'content', label: '알림 내용', type: 'textarea', required: true, hint: '한 줄에 하나씩. 번호는 자동으로 붙습니다' },
      { key: 'supplies', label: '준비물', type: 'text' },
      { key: 'homework', label: '숙제', type: 'text' },
    ],
  },
  weeklyPlans: {
    label: '주간학습안내', icon: '🗒', scope: 'date', edit: 'staff', space: 'desk', extras: ['plan'],
    fields: [
      { key: 'date', label: '주 시작일(월)', type: 'date', required: true },
      { key: 'title', label: '이번 주 주제', type: 'text' },
      { key: 'notice', label: '가정 안내', type: 'textarea', hint: '학부모님께 알릴 내용' },
    ],
  },
  counsels: {
    label: '상담 기록', icon: '💬', scope: 'date', edit: 'staff', space: 'desk',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'student', label: '학생', type: 'select', list: 'students', free: true, required: true },
      { key: 'with', label: '상담 대상', type: 'select', options: ['학생', '보호자', '학생·보호자', '기타'] },
      { key: 'method', label: '방법', type: 'select', options: ['대면', '전화', '문자·메신저', '온라인'] },
      { key: 'topic', label: '주제', type: 'select', options: ['학업', '교우관계', '생활습관', '진로', '건강', '가정', '기타'], free: true },
      { key: 'content', label: '상담 내용', type: 'textarea', required: true, enc: true },
      { key: 'followup', label: '후속 조치', type: 'text', enc: true },
    ],
  },
  remarks: {
    label: '특기사항', icon: '✍️', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'student', label: '학생', type: 'select', list: 'students', free: true, required: true },
      { key: 'area', label: '영역', type: 'select', options: ['교과학습발달상황', '행동특성 및 종합의견', '창체-자율', '창체-동아리', '창체-진로', '기타'], required: true },
      { key: 'subject', label: '과목', type: 'text', hint: '교과학습발달상황일 때' },
      { key: 'content', label: '내용', type: 'textarea', enc: true },
    ],
  },
  myTimetable: {
    label: '내 시간표', icon: '🗓', scope: 'year', edit: 'staff', space: 'desk', extras: ['grid'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'semester', label: '학기', type: 'select', options: ['1학기', '2학기', '연간'] },
      { key: 'note', label: '메모', type: 'text' },
    ],
  },
  progress: {
    label: '진도표', icon: '📘', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'subject', label: '과목', type: 'text', required: true },
      { key: 'date', label: '날짜(예정)', type: 'date' },
      { key: 'unit', label: '단원·차시', type: 'text', required: true, hint: '예) 2. 분수의 나눗셈 (3/8차시)' },
      { key: 'done', label: '완료', type: 'bool' },
      { key: 'note', label: '수업 메모', type: 'textarea' },
    ],
  },
  evalPlans: {
    label: '평가', icon: '📝', scope: 'year', edit: 'staff', space: 'desk', extras: ['scores', 'rubric'],
    fields: [
      { key: 'subject', label: '과목', type: 'select', list: 'subjects', free: true, required: true },
      { key: 'area', label: '영역·단원', type: 'text', hint: '예) 3. 글의 짜임' },
      { key: 'code', label: '성취기준 코드', type: 'text', hint: '예) [6국03-02]' },
      { key: 'standard', label: '성취기준', type: 'textarea' },
      { key: 'element', label: '평가 요소', type: 'text', hint: '예) 글의 짜임을 생각하며 내용 간추리기' },
      { key: 'method', label: '평가 방법', type: 'select', options: ['서술형', '논술형', '구술', '실기', '관찰', '포트폴리오', '프로젝트', '자기평가', '동료평가', '기타'], free: true },
      { key: 'timing', label: '시기', type: 'text', hint: '예) 4월 2주' },
      { key: 'scale', label: '평가 단계', type: 'select', options: ['3단계', '4단계', '상중하', 'A~E', '도달/미도달'] },
    ],
  },
  notes: {
    label: '누가기록', icon: '🗒', scope: 'date', edit: 'staff', space: 'desk',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'student', label: '학생', type: 'select', list: 'students', free: true, required: true },
      { key: 'category', label: '구분', type: 'select', options: ['관찰', '상담', '학습', '생활', '칭찬', '학부모', '기타'] },
      { key: 'content', label: '내용', type: 'textarea', required: true, enc: true, hint: '암호화해 저장되며 본인만 봅니다' },
    ],
  },
  todos: {
    label: '할 일', icon: '✅', scope: 'global', edit: 'staff', space: 'desk',
    fields: [
      { key: 'title', label: '할 일', type: 'text', required: true },
      { key: 'due', label: '날짜', type: 'date' },
      { key: 'repeat', label: '반복', type: 'select', options: ['없음', '매일', '평일', '매주', '매월'] },
      { key: 'done', label: '완료', type: 'bool' },
      { key: 'note', label: '메모', type: 'text' },
    ],
  },
  // ---------- 마켓 (모든 학교 선생님 공유) ----------
  market: {
    label: 'Teachshop', icon: '🧰', scope: 'global', edit: 'staff', space: 'market',
    fields: [
      { key: 'kind', label: '종류', type: 'select', options: ['자료 링크', 'HTML 도구'], hint: 'HTML 도구: 직접 만든(또는 AI로 만든) 한 장짜리 HTML 수업 도구를 붙여넣으면 공방에서 바로 실행됩니다' },
      { key: 'category', label: '분류', type: 'select', options: ['수업 도구', '수업 활동', '학급 운영', '평가', '학습지', '업무 서식', '기타'] },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'icon', label: '아이콘', type: 'text', hint: '이모지 하나 (예: 🧩 🎯 📚 🧪) — 카드 그림으로 쓰입니다' },
      { key: 'grades', label: '학년·과목', type: 'text', hint: '예) 5학년 수학, 전학년' },
      { key: 'desc', label: '설명', type: 'textarea' },
      { key: 'link', label: '자료 링크', type: 'url', hint: '자료 링크일 때: 드라이브·패들렛 등 공유 링크' },
      { key: 'html', label: 'HTML 코드', type: 'textarea', hint: 'HTML 도구일 때: <html>…</html> 전체. 안전 상자(sandbox) 안에서 실행되며, 학생 명단은 선생님이 [명단 보내기]를 눌렀을 때만 전달됩니다 (최대 300KB)' },
      { key: 'likes', label: '좋아요', type: 'names' },
    ],
  },
};

// 왼쪽 메뉴: 업무 영역별 묶음. 각 영역 = 전체 보기(overview) + 세부 탭
export const GROUPS = [
  { id: 'home', label: '홈', icon: '🏠', tabs: [] },
  { id: 'schedule', label: '학사일정', icon: '📅', tabs: [
    { id: 'overview', label: '통합 달력' },
    { id: 'events', label: '일정 목록', module: 'events' },
    { id: 'trips', label: '복무·출장', module: 'trips' },
  ] },
  { id: 'class', label: '수업', icon: '🕘', tabs: [
    { id: 'overview', label: '수업 전체' },
    { id: 'timetables', label: '시간표', module: 'timetables' },
    { id: 'programs', label: '특별수업', module: 'programs' },
    { id: 'openClasses', label: '동료장학', module: 'openClasses' },
    { id: 'substitutes', label: '보결', module: 'substitutes' },
    { id: 'reservations', label: '특별실 예약', module: 'reservations' },
  ] },
  { id: 'notice', label: '공지·업무', icon: '📢', tabs: [
    { id: 'overview', label: '한눈에' },
    { id: 'notices', label: '공지', module: 'notices' },
    { id: 'briefings', label: '전달사항', module: 'briefings' },
    { id: 'collections', label: '수합', module: 'collections' },
    { id: 'duties', label: '담당 배정', module: 'duties' },
    { id: 'meetings', label: '회의록', module: 'meetings' },
  ] },
  { id: 'money', label: '예산·물품', icon: '💰', tabs: [
    { id: 'overview', label: '사용 현황' },
    { id: 'purchases', label: '물품 신청', module: 'purchases' },
    { id: 'budget', label: '예산', module: 'budget' },
    { id: 'contests', label: '공모사업', module: 'contests' },
    { id: 'contestInfo', label: '공모 안내', module: 'contestInfo' },
  ] },
  { id: 'info', label: '학교 정보', icon: '🗂', tabs: [
    { id: 'overview', label: '계정·바로가기' },
    { id: 'assignments', label: '업무분장', module: 'assignments' },
    { id: 'resources', label: '자료실', module: 'resources' },
    { id: 'contacts', label: '내선번호', module: 'contacts' },
    { id: 'rules', label: '위임전결', module: 'rules' },
    { id: 'boards', label: '자유 표', module: 'boards' },
  ] },
];

// Deskterior 메뉴 (tdesk 벤치마킹: 학급 · 수업 · 평가 · 기록 · 마켓)
export const DESK_GROUPS = [
  { id: 'home', label: '내 책상', icon: '🪴', tabs: [] },
  { id: 'class', label: '학급', icon: '🧒', tabs: [
    { id: 'overview', label: '학생 카드' },
    { id: 'attendance', label: '출결', module: 'attendance' },
    { id: 'checklists', label: '체크리스트', module: 'checklists' },
    { id: 'points', label: '칭찬 점수', module: 'points' },
    { id: 'students', label: '명단 관리', module: 'students' },
    { id: 'seats', label: '자리 배치', module: 'seatPlan' },
    { id: 'roles', label: '1인 1역', module: 'classRoles' },
    { id: 'tools', label: '뽑기·타이머' },
  ] },
  { id: 'lesson', label: '수업', icon: '📘', tabs: [
    { id: 'overview', label: '이번 주' },
    { id: 'notes', label: '알림장', module: 'dailyNotes' },
    { id: 'weekly', label: '주간학습안내', module: 'weeklyPlans' },
    { id: 'timetable', label: '내 시간표', module: 'myTimetable' },
    { id: 'progress', label: '진도·시수', module: 'progress' },
  ] },
  { id: 'eval', label: '평가', icon: '📝', tabs: [
    { id: 'overview', label: '평가 현황·기록', module: 'evalPlans' },
    { id: 'students', label: '학생별 결과' },
    { id: 'remarks', label: '특기사항', module: 'remarks' },
  ] },
  { id: 'record', label: '기록', icon: '🗒', tabs: [
    { id: 'overview', label: '누가기록', module: 'notes' },
    { id: 'counsels', label: '상담', module: 'counsels' },
    { id: 'todos', label: '할 일', module: 'todos' },
  ] },
  { id: 'market', label: 'Teachshop', icon: '🧰', tabs: [
    { id: 'overview', label: '공방 둘러보기' },
    { id: 'mine', label: '내가 올린 도구' },
  ] },
];

export const spaceOf = (moduleId) => MODULES[moduleId]?.space || 'school';

// 이름 목록을 각자 켜고 끌 수 있는 칸 (참관 신청, 수합 제출, 마켓 좋아요)
export const SELF_TOGGLE = { openClasses: 'observers', collections: 'done', market: 'likes' };

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
    } else if (f.type === 'month') {
      v = String(v).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(v)) continue;
    } else v = String(v);
    out[f.key] = v;
  }
  for (const f of def.fields) if (f.computed) out[f.key] = f.computed(out);
  // 화면별 부가 데이터(시간표 칸, 자유표 격자)는 그대로 보존
  for (const k of def.extras || []) if (data?.[k] !== undefined) out[k] = data[k];
  return out;
}
