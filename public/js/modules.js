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

export const APP_NAME = 'OnlinePlatform';
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
  specialists: [],
  budgetCategories: ['일반수용비', '운영수당', '강사수당', '여비', '업무추진비', '임차료', '일반용역비', '자산취득비', '도서구입비', '기타'],
  subjects: ['국어', '수학', '사회', '과학', '영어', '도덕', '실과', '체육', '음악', '미술', '바른 생활', '슬기로운 생활', '즐거운 생활', '창의적 체험활동'],
};

// 평가 수준(단계) 체계: 앞쪽일수록 높은 수준. 수준 수·이름은 계획마다 바꿀 수 있음(levels)
export const EVAL_SCALES = {
  '3단계': ['잘함', '보통', '노력 요함'],
  '4단계': ['매우 잘함', '잘함', '보통', '노력 요함'],
  '상중하': ['상', '중', '하'],
  '우수·보통·미흡': ['우수', '보통', '미흡'],
  'A~E': ['A', 'B', 'C', 'D', 'E'],
  '도달/미도달': ['도달', '미도달'],
};
const asLevels = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,/·]/)).map((x) => String(x).trim()).filter(Boolean);
export const scaleOf = (plan) => { const own = asLevels(plan?.data?.levels); return own.length >= 2 ? own : EVAL_SCALES[plan?.data?.scale] || EVAL_SCALES['3단계']; };
export const EVAL_METHODS = ['실험 보고서', '조사 보고서', '탐구 보고서', '보고서', '실기·실습 평가', '토의·토론 평가', '프로젝트 평가', '서술형', '논술형', '구술', '관찰', '포트폴리오', '자기평가', '동료평가'];
export const GRADES = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'];
// 학년 → 성취기준 학년군 (코드 앞 숫자: 2=1~2학년, 4=3~4학년, 6=5~6학년)
export const bandOf = (grade) => { const g = Number(String(grade || '').match(/\d/)?.[0]); return g ? `${Math.ceil(g / 2) * 2 - 1}~${Math.ceil(g / 2) * 2}학년` : ''; };

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
    label: '학사일정', icon: '📅', scope: 'date', edit: 'staff', extras: ['noticeId'],
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date', hint: '여러 날 행사일 때만' },
      { key: 'title', label: '행사명', type: 'textarea', required: true },
      { key: 'category', label: '분류', type: 'select', options: EVENT_CATEGORIES },
      { key: 'target', label: '대상', type: 'text', hint: '예) 전교생, 5~6학년, 3-1' },
      { key: 'dept', label: '담당부서', type: 'select', list: 'depts', free: true },
      { key: 'place', label: '장소', type: 'select', list: 'places', free: true },
      { key: 'note', label: '비고', type: 'text' },
      { key: 'onCalendar', label: '학사일정 주요 안내에 표시', type: 'bool', hint: '그 달 학사일정 달력 위 "주요 안내"에 이 일정이 나옵니다' },
      { key: 'toNotice', label: '공지사항에도 올리기', type: 'bool', hint: '저장하면 [공지·업무 → 공지]에 같은 내용이 올라가고, 일정을 고치면 공지도 함께 고쳐집니다' },
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
      { key: 'onCalendar', label: '학사일정 주요 안내에 표시', type: 'bool', hint: '그 달 학사일정 달력 위 "주요 안내"와 날짜 칸에 나옵니다' },
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
  // 📥 취합: 확인 · 제출 · 참석 조사 · 선택(정원) · 설문. 응답은 responses 표, 집계는 tally, 응답한 사람은 done
  collections: {
    label: '취합', icon: '📥', scope: 'year', edit: 'staff', extras: ['questions', 'tally', 'noticeId', 'meetingId'],
    fields: [
      { key: 'kind', label: '유형', type: 'select', options: ['확인', '제출', '참석 조사', '선택', '설문'], hint: '확인: 체크만 · 제출: 링크 받기 · 참석 조사: 참석/불참 · 선택: 보기에서 고르기(정원) · 설문: 여러 문항' },
      { key: 'title', label: '제목', type: 'text', required: true, hint: '예) 학급 교육과정 운영계획 제출' },
      { key: 'due', label: '마감일', type: 'date' },
      { key: 'target', label: '대상', type: 'names', pick: 'staff', hint: '비워 두면 전체 교직원' },
      { key: 'content', label: '안내', type: 'textarea' },
      { key: 'link', label: '링크 (폴더·구글폼 등)', type: 'url', hint: '구글폼이나 드라이브 폴더 주소. 제출 유형에서 링크를 걸어 두면 각자 그곳에 낸 뒤 [제출 완료]만 눌러도 됩니다' },
      { key: 'allowEdit', label: '마감 전 응답 수정 허용', type: 'bool' },
      { key: 'showResults', label: '결과를 대상자 모두에게 공개', type: 'bool', hint: '끄면 만든 사람과 관리자만 결과를 봅니다 (선택 유형의 보기별 인원·정원은 항상 보임)' },
      { key: 'toNotice', label: '공지에도 올리기', type: 'bool', hint: '마감일이 지나면 공지도 자동으로 내려갑니다' },
      { key: 'done', label: '응답·제출 완료', type: 'names', hint: '응답하면 자동으로 채워집니다' },
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
    label: '회의록', icon: '📝', scope: 'date', edit: 'staff', extras: ['planId'],
    fields: [
      { key: 'date', label: '회의일', type: 'date', required: true },
      { key: 'meeting', label: '회의명', type: 'select', list: 'meetingTypes', free: true },
      { key: 'agenda', label: '안건', type: 'textarea', required: true },
      { key: 'result', label: '결과', type: 'textarea' },
      { key: 'status', label: '상태', type: 'select', options: ['완료', '재논의', '진행중'] },
    ],
  },
  // 회의 예정: 저장하면 학사일정(회의)·공지에 자동 등록 (eventId·noticeId 로 연결, 고치면 함께 고쳐짐)
  meetingPlans: {
    label: '회의', icon: '🗓', scope: 'date', edit: 'staff', extras: ['eventId', 'noticeId', 'collectionId'],
    fields: [
      { key: 'date', label: '회의일', type: 'date', required: true },
      { key: 'time', label: '시간', type: 'text', hint: '예) 15:00, 7교시 후' },
      { key: 'meeting', label: '회의명', type: 'select', list: 'meetingTypes', free: true, required: true },
      { key: 'title', label: '주제', type: 'text', hint: '예) 2학기 학예회 운영 협의' },
      { key: 'place', label: '장소', type: 'select', list: 'places', free: true },
      { key: 'dept', label: '주관 부서', type: 'select', list: 'depts', free: true },
      { key: 'attendees', label: '참석 대상', type: 'names', pick: 'staff', hint: '비워 두면 전체 교직원' },
      { key: 'agenda', label: '안건 (미리)', type: 'textarea', hint: '한 줄에 안건 하나 — 회의록을 쓸 때 그대로 불러옵니다' },
      { key: 'note', label: '준비물·안내', type: 'textarea' },
      { key: 'toCalendar', label: '학사일정에 등록', type: 'bool', hint: '체크하면 통합 달력에 "회의"로 올라갑니다' },
      { key: 'toNotice', label: '공지에 등록', type: 'bool', hint: '체크하면 공지·업무 → 공지에 안내가 올라갑니다' },
      { key: 'askAttend', label: '참석 여부 받기', type: 'bool', hint: '체크하면 참석 대상에게 참석/불참을 묻는 취합이 자동으로 만들어집니다' },
    ],
  },
  notices: {
    label: '공지', icon: '📢', scope: 'year', edit: 'staff',
    fields: [
      { key: 'title', label: '제목', type: 'text' },
      { key: 'category', label: '분류', type: 'select', options: ['월별 안내', '부서 안내', '일반'] },
      { key: 'pinned', label: '전체 공지', type: 'bool', hint: '체크하면 홈에 고정' },
      { key: 'onCalendar', label: '학사일정 주요 안내에 표시', type: 'bool', hint: '해당 월(또는 마감일의 달) 학사일정 달력 위 "주요 안내"에 나옵니다' },
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
    label: '시간표', icon: '🕘', scope: 'year', edit: 'staff', extras: ['grid', 'start', 'end', 'excludes'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true, hint: '예) 3-1, 과학 전담, AI교실, 국악 강사' },
      { key: 'kind', label: '종류', type: 'select', options: TIMETABLE_KINDS },
      { key: 'semester', label: '적용 기간', type: 'select', options: ['1년', '1학기', '2학기', '직접 지정'], hint: '아래에서 시작·끝 날짜와 빠지는 날을 정합니다' },
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
  // 구매신청 건: 한 번의 신청(예: ○○ 운영물품 구입 신청)에 여러 선생님이 품목을 담음
  purchaseRequests: {
    label: '구매신청 건', icon: '🗂', scope: 'year', edit: 'staff',
    fields: [
      { key: 'title', label: '신청 건명', type: 'text', required: true, hint: '예) AI 디지털 활용 선도학교 운영물품 구입 신청' },
      { key: 'program', label: '사업(재원)', type: 'select', list: 'budgetPrograms', free: true },
      { key: 'due', label: '신청 마감일', type: 'date' },
      { key: 'manager', label: '담당자', type: 'select', list: 'staff', free: true },
      { key: 'open', label: '신청 받는 중', type: 'bool' },
      { key: 'audience', label: '공개 범위', type: 'select', options: ['권한자만', '전체 교직원', '지정한 사람'], hint: '권한자만: 구매신청 권한이 있는 사람만 / 전체 교직원·지정한 사람: 이 건만 열려서 자기 품목을 담을 수 있음' },
      { key: 'members', label: '신청할 수 있는 사람', type: 'names', pick: 'staff', hint: '공개 범위가 "지정한 사람"일 때 — 체크한 선생님에게만 이 건이 열립니다' },
      { key: 'note', label: '안내', type: 'textarea', hint: '예) 1인 10만 원 이내, 쇼핑몰 링크 필수' },
    ],
  },
  purchases: {
    label: '구매신청', icon: '🛒', scope: 'year', edit: 'staff', extras: ['requestId'],
    fields: [
      { key: 'date', label: '신청일', type: 'date' },
      { key: 'budget', label: '사업(재원)', type: 'select', list: 'budgetPrograms', free: true, hint: '학교본예산 세부사업 또는 공모사업명' },
      { key: 'requester', label: '신청자', type: 'select', list: 'staff', free: true, required: true },
      { key: 'item', label: '품목', type: 'textarea', required: true },
      { key: 'spec', label: '규격', type: 'text' },
      { key: 'price', label: '단가', type: 'money' },
      { key: 'qty', label: '수량', type: 'number' },
      { key: 'amount', label: '금액', type: 'money', computed: (d) => (Number(d.price) || 0) * (Number(d.qty) || 0), sum: true },
      { key: 'link', label: '구매링크', type: 'url' },
      { key: 'received', label: '수령', type: 'bool' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  contests: {
    label: '공모사업', icon: '🏆', scope: 'year', edit: 'admin',
    fields: [
      { key: 'name', label: '공모사업명', type: 'text', required: true },
      { key: 'applicant', label: '신청자', type: 'text' },
      { key: 'managers', label: '담당자 (관리자가 지정)', type: 'names', pick: 'staff', hint: '체크한 선생님과 관리자만 이 공모사업을 보고 예산·집행을 입력' },
      { key: 'grades', label: '운영 대상 학년', type: 'text' },
      { key: 'budget', label: '받은 예산', type: 'money', sum: true },
      { key: 'period', label: '운영 기간', type: 'text', hint: '예) 2026.4.~2027.2.' },
      { key: 'agency', label: '주관 기관', type: 'text' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  // 기한 안내: 공모 신청·정산·보고·공문 제출 등 마감 기한 (달력·한눈에에도 표시)
  deadlines: {
    label: '기한 안내', icon: '⏰', scope: 'date', edit: 'staff',
    fields: [
      { key: 'date', label: '기한', type: 'date', required: true },
      { key: 'title', label: '내용', type: 'text', required: true, hint: '예) ○○ 공모사업 결과보고서 제출' },
      { key: 'category', label: '구분', type: 'select', options: ['공모 신청', '정산·결과 보고', '예산 집행', '공문 제출', '기타'], free: true },
      { key: 'dept', label: '부서', type: 'select', list: 'depts', free: true },
      { key: 'person', label: '담당', type: 'select', list: 'staff', free: true },
      { key: 'link', label: '링크', type: 'url' },
      { key: 'note', label: '비고', type: 'text' },
      { key: 'done', label: '완료', type: 'bool' },
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
    label: '예산 입력', icon: '💰', scope: 'year', edit: 'staff',
    fields: [
      { key: 'source', label: '재원', type: 'select', options: ['학교본예산', '공모사업'], hint: '비우면 학교본예산' },
      { key: 'program', label: '세부사업·공모사업명', type: 'select', list: 'budgetPrograms', free: true },
      { key: 'item', label: '세부항목', type: 'text' },
      { key: 'category', label: '비목', type: 'select', list: 'budgetCategories', free: true, hint: '원가통계비목 (예: 일반수용비)' },
      { key: 'detail', label: '산출내역', type: 'text' },
      { key: 'formula', label: '산출식', type: 'text', hint: '예) 5,000원 × 20명 × 3회 → 금액 자동 계산' },
      { key: 'amount', label: '금액', type: 'money', sum: true },
      { key: 'consult', label: '협의', type: 'text' },
      { key: 'label', label: '항목', type: 'text' },
      { key: 'note', label: '비고', type: 'text' },
    ],
  },
  // 집행(사용) 내역: 날짜별로 입력하면 재원·사업·비목별 대시보드에 반영
  spending: {
    label: '집행내역', icon: '🧾', scope: 'date', edit: 'staff', extras: ['purchaseId'],
    fields: [
      { key: 'date', label: '집행일', type: 'date', required: true },
      { key: 'source', label: '재원', type: 'select', options: ['학교본예산', '공모사업'], required: true },
      { key: 'program', label: '세부사업·공모사업명', type: 'select', list: 'budgetPrograms', free: true, required: true },
      { key: 'category', label: '비목', type: 'select', list: 'budgetCategories', free: true, required: true },
      { key: 'content', label: '내용', type: 'text', required: true, hint: '예) 수학 교구 구입' },
      { key: 'amount', label: '금액', type: 'money', sum: true, required: true },
      { key: 'person', label: '담당', type: 'select', list: 'staff', free: true },
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
      { key: 'visibility', label: '공개 범위', type: 'select', options: ['전체 공개', '나만 보기'] },
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
    label: '평가', icon: '📝', scope: 'year', edit: 'staff', space: 'desk', extras: ['scores', 'rubric', 'levels', 'criteria', 'chips'],
    fields: [
      { key: 'subject', label: '과목', type: 'select', list: 'subjects', free: true, required: true },
      { key: 'semester', label: '학기', type: 'select', options: ['1학기', '2학기'] },
      { key: 'grade', label: '학년', type: 'select', options: GRADES, free: true },
      { key: 'timing', label: '시기', type: 'text', hint: '예) 9월 3주, 12~14차시' },
      { key: 'unit', label: '단원명', type: 'text', hint: '예) 1. 혼합물의 분리' },
      { key: 'content', label: '교수학습 내용', type: 'textarea' },
      { key: 'element', label: '평가 요소', type: 'text', hint: '예) 알갱이의 크기가 다른 고체 혼합물 분리하기' },
      { key: 'area', label: '평가 영역', type: 'text', hint: '예) 물질 (교육과정 영역)' },
      { key: 'method', label: '평가 방법', type: 'select', options: EVAL_METHODS, free: true },
      { key: 'standard', label: '성취기준', type: 'textarea', hint: '한 줄에 하나: [6과05-01] 성취기준 문장' },
      { key: 'code', label: '성취기준 코드', type: 'text', hint: '비워 두면 성취기준 칸의 [코드]를 씀' },
      { key: 'scale', label: '평가 수준', type: 'select', options: Object.keys(EVAL_SCALES) },
    ],
  },
  // 학생 참여 활동(로그인 없이 링크로 제출): 서·논술형 답안 · 클래스 보드. 제출물은 submissions 표에 암호화
  activities: {
    label: '학생 활동', icon: '🔗', scope: 'year', edit: 'staff', space: 'desk', extras: ['token', 'planId', 'questions'],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'kind', label: '종류', type: 'select', options: ['서·논술형', '클래스 보드', '실시간 퀴즈'], required: true },
      { key: 'subject', label: '과목', type: 'select', list: 'subjects', free: true },
      { key: 'question', label: '문항·안내', type: 'textarea', hint: '학생 화면에 그대로 보입니다' },
      { key: 'open', label: '제출 받는 중', type: 'bool' },
      { key: 'showNames', label: '보드에서 이름 보이기', type: 'bool' },
      { key: 'limit', label: '글자 수 제한', type: 'number', hint: '비우면 서·논술형 2000자, 보드 300자' },
    ],
  },
  // 포트폴리오: 학생 작품·산출물 기록 (링크·메모)
  portfolios: {
    label: '포트폴리오', icon: '🗂', scope: 'date', edit: 'staff', space: 'desk',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'student', label: '학생', type: 'select', list: 'students', free: true, required: true },
      { key: 'subject', label: '과목·활동', type: 'select', list: 'subjects', free: true },
      { key: 'title', label: '작품·활동명', type: 'text', required: true },
      { key: 'kind', label: '종류', type: 'select', options: ['글', '그림', '사진', '영상', '프로젝트', '실험·관찰', '기타'] },
      { key: 'link', label: '파일·사진 링크', type: 'url', hint: '구글 드라이브·패들렛 등 링크' },
      { key: 'note', label: '관찰·성장 메모', type: 'textarea', enc: true },
    ],
  },
  // 진로·진학: 희망 진로·관심 분야·진학 정보 (중·고는 진학, 초등은 진로 탐색)
  careers: {
    label: '진로·진학', icon: '🧭', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'student', label: '학생', type: 'select', list: 'students', free: true, required: true },
      { key: 'hope', label: '희망 진로', type: 'text' },
      { key: 'parentHope', label: '보호자 희망', type: 'text' },
      { key: 'interest', label: '관심 분야·강점', type: 'text' },
      { key: 'school', label: '진학 예정·희망 학교', type: 'text' },
      { key: 'activity', label: '진로 활동', type: 'textarea' },
      { key: 'note', label: '상담 메모', type: 'textarea', enc: true },
    ],
  },
  // 학습지: 문제 + 정답 (빈칸은 {정답} 으로) → 학생용·정답지 인쇄
  worksheets: {
    label: '학습지', icon: '📄', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'subject', label: '과목', type: 'select', list: 'subjects', free: true },
      { key: 'unit', label: '단원·차시', type: 'text' },
      { key: 'content', label: '내용', type: 'textarea', required: true, hint: '빈칸으로 만들 말은 {중괄호}로: 식물은 {광합성}으로 양분을 만든다. 문제는 한 줄에 하나' },
      { key: 'memo', label: '메모', type: 'text' },
    ],
  },
  // Deskterior 설정 (한 사람당 하나): 내 책상 카드 구성, 내 교실 화면 구성
  deskSettings: {
    label: '내 설정', icon: '⚙', scope: 'global', edit: 'staff', space: 'desk', extras: ['home', 'screen'],
    fields: [{ key: 'name', label: '이름', type: 'text' }],
  },
  // 성취기준 DB: 과목·학년군마다 한 묶음(items: [{area, code, text}]). 평가계획 가져오기·교육과정 문서 붙여넣기로 채움
  standards: {
    label: '성취기준', icon: '🎯', scope: 'global', edit: 'staff', space: 'desk', extras: ['items'],
    fields: [
      { key: 'subject', label: '과목', type: 'select', list: 'subjects', free: true, required: true },
      { key: 'band', label: '학년군', type: 'select', options: ['1~2학년', '3~4학년', '5~6학년'], free: true },
      { key: 'curriculum', label: '교육과정', type: 'select', options: ['2022 개정', '2015 개정'], free: true },
      { key: 'source', label: '출처', type: 'text', hint: '예) 국가교육과정정보센터 교육과정 문서, 학교 평가계획' },
    ],
  },
  // 우리 반 정보 (학년·반·학기): 평가계획서 머리글과 성취기준 학년군에 쓰임
  myClass: {
    label: '우리 반', icon: '🏫', scope: 'year', edit: 'staff', space: 'desk',
    fields: [
      { key: 'grade', label: '학년', type: 'select', options: GRADES, required: true },
      { key: 'room', label: '반', type: 'text', hint: '예) 2반' },
      { key: 'semester', label: '현재 학기', type: 'select', options: ['1학기', '2학기'] },
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
    { id: 'review', label: '확인 필요', module: 'events' },
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
    { id: 'collections', label: '취합', module: 'collections' },
    { id: 'duties', label: '담당 배정', module: 'duties' },
    { id: 'meetingPlans', label: '회의', module: 'meetingPlans' },
    { id: 'meetings', label: '회의록', module: 'meetings' },
  ] },
  // 행정·예산: 공모 안내·기한 안내는 모두에게, 나머지는 관리자 + 학교 관리 → 권한에서 탭별로 연 사람만 (access 키)
  { id: 'money', label: '행정·예산', icon: '💰', tabs: [
    { id: 'contestInfo', label: '공모 안내', module: 'contestInfo' },
    { id: 'deadlines', label: '기한 안내', module: 'deadlines' },
    { id: 'overview', label: '예산 대시보드', access: 'overview' },
    { id: 'school', label: '학교본예산', module: 'budget', access: 'school' },
    { id: 'contests', label: '공모사업', module: 'contests', access: 'contests' },
    { id: 'spend', label: '집행내역', module: 'spending', access: 'spend' },
    { id: 'purchases', label: '구매신청', module: 'purchases', access: 'purchases' },
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
    { id: 'portfolio', label: '포트폴리오', module: 'portfolios' },
    { id: 'career', label: '진로·진학', module: 'careers' },
    { id: 'tools', label: '뽑기·타이머' },
  ] },
  { id: 'lesson', label: '수업', icon: '📘', tabs: [
    { id: 'overview', label: '이번 주' },
    { id: 'notes', label: '알림장', module: 'dailyNotes' },
    { id: 'weekly', label: '주간학습안내', module: 'weeklyPlans' },
    { id: 'board', label: '클래스 보드', module: 'activities' },
    { id: 'quiz', label: '실시간 퀴즈', module: 'activities' },
    { id: 'worksheets', label: '학습지', module: 'worksheets' },
    { id: 'timetable', label: '내 시간표', module: 'myTimetable' },
    { id: 'progress', label: '진도·시수', module: 'progress' },
  ] },
  { id: 'eval', label: '평가', icon: '📝', tabs: [
    { id: 'overview', label: '평가 현황·기록', module: 'evalPlans' },
    { id: 'tools', label: '평가 도구' },
    { id: 'plan', label: '평가계획서', module: 'evalPlans' },
    { id: 'standards', label: '성취기준 DB', module: 'standards' },
    { id: 'students', label: '학생별 결과' },
    { id: 'remarks', label: '교과발달·특기사항', module: 'remarks' },
  ] },
  { id: 'record', label: '기록', icon: '🗒', tabs: [
    { id: 'overview', label: '누가기록', module: 'notes' },
    { id: 'counsels', label: '상담', module: 'counsels' },
    { id: 'todos', label: '할 일', module: 'todos' },
  ] },
  { id: 'market', label: 'Teachshop', icon: '🧰', tabs: [
    { id: 'overview', label: '공방 둘러보기' },
    { id: 'mine', label: '내가 올린 도구' },
    { id: 'classroom', label: '내 교실' },
  ] },
];

export const spaceOf = (moduleId) => MODULES[moduleId]?.space || 'school';

// 이름 목록을 각자 켜고 끌 수 있는 칸 (참관 신청, 취합 확인, 마켓 좋아요)
// 행정·예산 권한 칸 (학교 관리 → 권한)
export const MONEY_ACCESS = [
  { id: 'overview', label: '예산 대시보드', hint: '학교본예산 합계·집행률 보기(읽기 전용)' },
  { id: 'school', label: '학교본예산', hint: '학교본예산 예산 입력·집행내역 입력' },
  { id: 'contests', label: '공모사업', hint: '모든 공모사업 편성·집행 입력 (사업 담당자는 권한 없이도 자기 사업만 봄)' },
  { id: 'spend', label: '집행내역', hint: '학교본예산 집행내역 입력' },
  { id: 'purchases', label: '구매신청', hint: '모든 구매신청 건 보기·건 만들기·처리 (권한이 없어도 건 설정에서 공개한 건은 그 사람에게 열림)' },
];

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
