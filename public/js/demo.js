// 👀 체험 모드: 로그인 없이 가상 학교·가상 학급으로 둘러보기
//   - 서버에 아무것도 보내지 않음. 모든 요청을 브라우저 안의 가짜 서버가 처리
//   - 가상 데이터는 오늘 날짜를 기준으로 만들어지고, 이 탭(sessionStorage)에만 잠시 남음
//   - 등장하는 학교·사람·학생 이름은 모두 지어낸 것
import { MODULES, DEFAULT_LISTS, SELF_TOGGLE, yearRange, normalizeData, spaceOf } from './modules.js';

const KEY = 'gy_demo_db';
const FLAG = 'gy_demo';
const MASK = '••••••';
const SCHOOL = '하늘초등학교(체험)';
const ME = { email: 'demo@example.com', name: '김민지', dept: '교무' };

export const isDemo = () => { try { return sessionStorage.getItem(FLAG) === '1'; } catch { return false; } };
export function startDemo() { try { sessionStorage.setItem(FLAG, '1'); } catch { /* 무시 */ } location.href = '/#/home/'; location.reload(); }
export function exitDemo() { try { sessionStorage.removeItem(FLAG); sessionStorage.removeItem(KEY); } catch { /* 무시 */ } location.href = '/'; }
export function resetDemo() { try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ } location.reload(); }

// ---------- 날짜 도구 ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = ymd(new Date());
const add = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
const dow = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const weekday = (s, dir = 1) => { let x = s; while ([0, 6].includes(dow(x))) x = add(x, dir); return x; };
const wd = (n) => { let x = TODAY; let k = 0; const step = n >= 0 ? 1 : -1; while (k !== n) { x = add(x, step); if (![0, 6].includes(dow(x))) k += step; } return weekday(x); };
const monday = add(TODAY, dow(TODAY) === 0 ? 1 : 1 - dow(TODAY));
const YEAR = (() => { const [y, m] = TODAY.split('-').map(Number); return m <= 2 ? y - 1 : y; })();
const Y = (md) => (Number(md.slice(0, 2)) <= 2 ? `${YEAR + 1}-${md}` : `${YEAR}-${md}`);
const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------- 가상 사람들 ----------
const STAFF = [
  ['김민지', '교무'], ['이서준', '연구'], ['박지우', '1학년'], ['최하은', '2학년'], ['정도윤', '3학년'], ['강서연', '4학년'],
  ['조하준', '5학년'], ['윤지아', '6학년'], ['장시우', '과학 전담'], ['임예린', '영어 전담'], ['한유찬', '체육 전담'], ['오수아', '보건'], ['서지호', '행정실'],
];
const STUDENTS = ['강다온', '김가람', '김나래', '노을빛', '류하늘', '문별님', '박새롬', '배단비', '서누리', '송한결', '신바름', '안솔빛', '양초롱', '엄다솜', '오가온', '유보람', '이슬기', '전아라', '정해솔', '최미르'];

function seed() {
  const db = { seq: 1, records: [], members: [], inbox: [], audit: [], subs: {}, settings: { currentYear: YEAR, schoolName: SCHOOL, lists: { ...DEFAULT_LISTS, classes: ['1-1', '2-1', '3-1', '4-1', '5-1', '6-1'], specialists: ['과학 전담'] } }, name: ME.name };
  const put = (module, data, extra = {}) => {
    const scope = MODULES[module].scope;
    const clean = normalizeData(module, data);
    const rec = {
      id: `d${db.seq++}`, module, data: clean, version: 1, sort: db.seq,
      year: scope === 'year' ? (extra.year || YEAR) : null, date: scope === 'date' ? clean.date : null,
      owner: spaceOf(module) === 'school' ? null : (extra.owner || ME.email), author: extra.author,
      updatedBy: extra.by || ME.email, updatedAt: nowStamp(),
    };
    db.records.push(rec);
    return rec;
  };
  db.members = STAFF.map(([name, dept], i) => ({ email: i === 0 ? ME.email : `t${i}@example.com`, name, dept, role: i === 0 ? 'admin' : 'staff', created_at: `${YEAR}-03-02 08:30:00`, last_login: i < 8 ? `${TODAY} 08:${pad(10 + i)}:00` : null }));
  db.members.push({ email: 'new1@example.com', name: '백새봄', dept: '', role: 'pending', created_at: `${TODAY} 07:50:00`, last_login: `${TODAY} 07:50:00` });

  // ----- 학사일정 (1년 + 오늘 주변) -----
  const ev = (date, title, category, more = {}) => put('events', { date, title, category, ...more });
  ev(Y('03-02'), '입학식 및 시업식', '전체행사', { dept: '교무', place: '체육관', target: '전교생' });
  ev(Y('03-11'), '학부모 총회', '전체행사', { dept: '교무', place: '시청각실' });
  ev(Y('04-20'), '과학의 날 행사', '전체행사', { dept: '과학', target: '3~6학년' });
  ev(Y('05-05'), '어린이날', '휴일·방학');
  ev(Y('11-12'), '진로 체험의 날', '전체행사', { dept: '보건', place: '', review: true, note: '가져오기: 담당 줄이 어긋남' });
  ev(Y('11-26'), '독서 골든벨', '전체행사', { dept: '', place: '도서실', review: true });
  ev(Y('05-15'), '스승의 날', '기타');
  ev(Y('06-03'), '현장체험학습', '전체행사', { target: '전교생', dept: '교무' });
  ev(Y('07-24'), '여름방학', '휴일·방학', { endDate: Y('08-18') });
  ev(Y('08-19'), '2학기 개학식', '전체행사');
  ev(Y('10-09'), '한글날', '휴일·방학');
  ev(Y('11-13'), '학예회', '전체행사', { place: '체육관', dept: '예술', dday: true });
  ev(Y('12-24'), '학생자치회 선거', '전체행사', { dept: '생활' });
  ev(Y('01-08'), '겨울방학', '휴일·방학', { endDate: Y('02-28') });
  ev(wd(0), '교직원 협의회', '회의', { place: '교무실', note: '15:00' });
  ev(wd(0), '5학년 생존수영', '학급수업', { target: '5학년', place: '시립수영장' });
  ev(wd(1), '학교폭력 예방교육', '연수', { target: '전교생', dept: '생활' });
  ev(wd(2), '독서의 날', '전체행사', { dept: '독서' });
  ev(wd(3), '공개수업 (3-1)', '동료장학', { dept: '연구' });
  ev(wd(5), '운동회', '전체행사', { place: '운동장', dept: '체육', dday: true });
  ev(wd(7), '안전교육의 날', '연수', { dept: '안전' });
  ev(wd(-2), '부장회의', '회의', { place: '교장실' });
  // ----- 복무·출장 -----
  put('trips', { date: wd(0), kind: '출장', person: '조하준', time: '14:00~16:40', title: '교육지원청 업무협의회' });
  put('trips', { date: wd(0), kind: '조퇴', person: '최하은', time: '15:00', title: '병원 진료' });
  put('trips', { date: wd(1), kind: '연가', person: '정도윤', title: '개인 사정' });
  put('trips', { date: wd(3), endDate: wd(4), kind: '출장', person: '이서준', title: '수업 나눔 연수 / 교육연수원' });
  // ----- 보결 -----
  put('substitutes', { date: wd(0), period: '5교시', className: '5-1', subject: '국어', absent: '조하준', substitute: ME.name, reason: '출장' });
  put('substitutes', { date: wd(0), period: '6교시', className: '5-1', subject: '사회', absent: '조하준', substitute: '장시우', reason: '출장' });
  put('substitutes', { date: wd(1), period: '2교시', className: '3-1', subject: '수학', absent: '정도윤', substitute: '임예린', reason: '연가' });
  // ----- 전달사항 -----
  put('briefings', { date: wd(0), kind: '조례', content: '오늘 3교시에 소방 대피 훈련이 있습니다.\n실내화를 신고 선생님 안내에 따라 이동합니다.', dept: '안전', onCalendar: true });
  put('briefings', { date: wd(0), kind: '종례', content: '내일까지 현장체험학습 동의서를 제출해 주세요.', dept: '교무' });
  put('briefings', { date: wd(1), kind: '조례', content: '도서관 신간 도서 대출이 시작되었습니다.', dept: '독서' });
  // ----- 공지 · 회의 · 수합 · 담당 -----
  const ym = TODAY.slice(0, 7);
  put('notices', { title: `${Number(ym.slice(5))}월 교육과정 주요 안내`, category: '월별 안내', pinned: true, month: ym, content: '1. 학부모 상담 주간 운영\n2. 운동회 준비 (담당 배정 확인)\n3. 학교폭력 예방교육 실시', schoolDays: '20일', dept: '교무' }, { year: YEAR });
  put('notices', { title: '복무 신청은 하루 전까지', category: '부서 안내', content: '연가·조퇴는 하루 전까지 나이스 신청 후 교무실에 알려 주세요.', dept: '교무' }, { year: YEAR });
  put('notices', { title: '방과후 강사 출입 안내', category: '일반', content: '방과후 강사님은 행정실에서 출입증을 받아 주세요.', dept: '방과후', due: wd(4) }, { year: YEAR });
  put('meetings', { date: wd(-2), meeting: '부장회의', agenda: '운동회 운영 계획', result: '종목·담당 확정, 우천 시 체육관', status: '완료' });
  put('meetings', { date: wd(-2), meeting: '부장회의', agenda: '2학기 공개수업 일정', result: '다음 회의에서 재논의', status: '재논의' });
  put('meetings', { date: wd(-7), meeting: '전체회의', agenda: '학예회 프로그램 구성', result: '학년별 1작품', status: '완료' });
  put('collections', { title: '학급 교육과정 운영 실적 제출', due: wd(2), content: '양식에 맞춰 공유 폴더에 올려 주세요.', done: ['박지우', '최하은', '윤지아'] }, { year: YEAR });
  put('collections', { title: '운동회 학급 응원 도구 수요 조사', due: wd(4), target: ['박지우', '최하은', '정도윤', '강서연', '조하준', '윤지아'], done: ['강서연'] }, { year: YEAR });
  for (const [role, person, place] of [['총괄 진행', '한유찬', '운동장'], ['방송·음향', '이서준', '방송실'], ['안전 지도', '오수아', '보건실 앞'], ['사진 촬영', ME.name, '운동장'], ['시상', '김민지', '본부석']]) put('duties', { date: wd(5), title: '운동회', role, person, place, time: '09:00~12:10' });
  put('memos', { date: wd(5), text: '우천 시 체육관' });
  put('memos', { date: wd(2), text: '급식실 소독' });
  // ----- 수업 -----
  put('reservations', { date: wd(0), place: '과학실', period: '3교시', user: '장시우', className: '5-1', purpose: '전기 회로 실험' });
  put('reservations', { date: wd(1), place: '체육관', period: '2교시', user: '한유찬', className: '4-1' });
  put('reservations', { date: wd(1), place: 'AI교실', period: '5교시', user: ME.name, className: '6-1', purpose: '코딩 수업' });
  for (let i = -5; i <= 10; i += 3) put('programs', { program: ['SW·AI', '국악', '연극'][Math.abs(i) % 3], date: wd(i), content: `(${['4-1', '5-1', '6-1'][Math.abs(i) % 3]}) 1~2교시`, place: 'AI교실', status: '예정' });
  const grid = (cells) => ({ days: ['월', '화', '수', '목', '금'], periods: ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'], cells });
  put('timetables', { title: '6-1', kind: '학급', semester: '1년', grid: grid([['국어', '수학', '국어', '사회', '과학'], ['수학', '국어', '영어', '수학', '국어'], ['사회', '과학', '체육', '국어', '음악'], ['체육', '미술', '수학', '과학', '수학'], ['음악', '미술', '창체', '체육', '사회'], ['', '실과', '', '영어', '']]) }, { year: YEAR });
  put('timetables', { title: '5-1', kind: '학급', semester: '1년', grid: grid([['수학', '국어', '사회', '국어', '수학'], ['국어', '과학', '수학', '영어', '국어'], ['과학', '체육', '국어', '수학', '미술'], ['영어', '음악', '체육', '사회', '미술'], ['사회', '수학', '창체', '과학', '체육'], ['실과', '', '', '음악', '']]) }, { year: YEAR });
  put('timetables', { title: '과학 전담', kind: '전담', semester: '1년', grid: grid([['5-1', '', '6-1', '', '5-1'], ['', '6-1', '', '5-1', ''], ['3-1', '', '4-1', '', '6-1'], ['4-1', '3-1', '', '6-1', ''], ['', '', '', '', ''], ['', '', '', '', '']]) }, { year: YEAR });
  put('openClasses', { group: '1그룹', date: wd(3), period: '3교시', className: '3-1', teacher: '정도윤', subject: '수학', room: '3-1 교실', observers: ['김민지', '박지우'] }, { year: YEAR });
  put('openClasses', { group: '1그룹', date: wd(8), period: '2교시', className: '5-1', teacher: '조하준', subject: '국어', room: '5-1 교실' }, { year: YEAR });
  // ----- 예산·물품 -----
  // 예산 (가상): 학교본예산 · 공모사업 편성 + 날짜별 집행
  [['기초학력 지원', '학습 자료', '일반수용비', 3000000], ['기초학력 지원', '협력강사', '강사수당', 4800000], ['학생 자치 활동', '운영비', '일반수용비', 1500000], ['학생 자치 활동', '리더십 캠프', '임차료', 900000], ['교원 연수', '전문적 학습공동체', '운영수당', 1200000], ['교원 연수', '연수 출장', '여비', 800000]]
    .forEach(([program, item, category, amount]) => put('budget', { source: '학교본예산', program, item, category, amount, ...(category === '강사수당' ? { detail: '협력강사 수당', formula: '40,000원 × 4시간 × 30회' } : category === '여비' ? { detail: '관외 출장', formula: '40,000원 × 20회' } : {}) }, { year: YEAR }));
  put('contests', { applicant: '이서준', managers: ['이서준'], name: 'AI 디지털 선도학교', grades: '5~6학년', budget: 8000000, agency: '교육청(가상)', period: `${YEAR}.4.~${YEAR + 1}.2.` }, { year: YEAR });
  put('contests', { applicant: '김민지', managers: [ME.name], name: '생태전환 교육 공모', grades: '전학년', budget: 3000000, agency: '교육청(가상)', period: `${YEAR}.5.~${YEAR}.12.` }, { year: YEAR });
  [['AI 디지털 선도학교', '일반수용비', 5000000], ['AI 디지털 선도학교', '강사수당', 2000000], ['AI 디지털 선도학교', '운영수당', 1000000], ['생태전환 교육 공모', '일반수용비', 2000000], ['생태전환 교육 공모', '강사수당', 1000000]]
    .forEach(([program, category, amount]) => put('budget', { source: '공모사업', program, category, amount }, { year: YEAR }));
  [[`${YEAR}-03-20`, '학교본예산', '기초학력 지원', '일반수용비', '학습 자료 구입', 820000], [`${YEAR}-04-15`, '학교본예산', '기초학력 지원', '강사수당', '협력강사 3·4월분', 1600000], [`${YEAR}-05-08`, '학교본예산', '학생 자치 활동', '일반수용비', '자치회 물품', 430000], [`${YEAR}-05-21`, '공모사업', 'AI 디지털 선도학교', '일반수용비', '코딩 교구 구입', 2100000], [`${YEAR}-06-12`, '공모사업', 'AI 디지털 선도학교', '강사수당', 'AI 캠프 강사', 600000], [`${YEAR}-06-25`, '학교본예산', '교원 연수', '운영수당', '전학공 운영 1학기', 600000], [`${YEAR}-07-10`, '공모사업', '생태전환 교육 공모', '일반수용비', '텃밭 상자·모종', 780000], [`${YEAR}-09-05`, '학교본예산', '기초학력 지원', '강사수당', '협력강사 9월분', 800000], [`${YEAR}-09-18`, '공모사업', 'AI 디지털 선도학교', '운영수당', '선도학교 협의회', 400000], [`${YEAR}-09-30`, '학교본예산', '교원 연수', '여비', '연수 출장', 230000]]
    .forEach(([date, source, program, category, content, amount]) => put('spending', { date, source, program, category, content, amount, person: ME.name }));
  put('purchases', { date: `${YEAR}-09-14`, budget: '기초학력 지원', requester: '박지우', item: '보드게임형 수학 교구', spec: '4인용', price: 32000, qty: 6, received: true }, { year: YEAR });
  put('purchases', { budget: '생태전환 교육 공모', requester: '김민지', item: '모종삽 세트', price: 12000, qty: 15 }, { year: YEAR });
  const pr = put('purchaseRequests', { title: 'AI 디지털 선도학교 2학기 운영물품 구입 신청', program: 'AI 디지털 선도학교', due: wd(5), manager: '이서준', open: true, note: '1인 15만 원 이내, 구매 링크를 꼭 넣어 주세요.' }, { year: YEAR });
  [[ME.name, '코딩 로봇 키트', 89000, 1, wd(-3)], [ME.name, '센서 확장 보드', 15000, 2, wd(-3)], ['박지우', '태블릿 거치대', 12000, 5, wd(-2)], ['정도윤', '블록 코딩 카드', 9000, 6, wd(-1)], ['정도윤', 'USB 허브', 18000, 2, wd(-1)]]
    .forEach(([requester, item, price, qty, date]) => put('purchases', { requestId: pr.id, budget: 'AI 디지털 선도학교', requester, item, price, qty, date }, { year: YEAR }));
  [[wd(-2), '생태전환 교육 공모 중간 정산', '정산·결과 보고', '김민지'], [wd(2), '2027 AI 선도학교 공모 신청서 제출', '공모 신청', '이서준'], [wd(9), '학교본예산 2차 추경 요구서', '예산 집행', '박지우'], [wd(20), '방과후 운영 결과 보고 공문', '공문 제출', '최하은']]
    .forEach(([date, title, category, person]) => put('deadlines', { date, title, category, person }));
  put('purchases', { budget: '학생 자치 활동', requester: '윤지아', item: '선거 투표함', price: 45000, qty: 2 }, { year: YEAR });
  put('contestInfo', { topic: '디지털', content: '에듀테크 수업 나눔 공모', period: '다음 달 말까지', amount: '300만 원' }, { year: YEAR });
  // ----- 학교 정보 -----
  for (const [dept, name, phone] of [['교무실', '김민지', '201'], ['행정실', '서지호', '210'], ['보건실', '오수아', '230'], ['과학실', '장시우', '241'], ['도서관', '', '250']]) put('contacts', { dept, name, phone });
  put('rules', { section: '복무', group: '연가', rule: '교감 전결', detail: '1일 이내', process: '나이스 신청 → 교감 결재' });
  put('rules', { section: '복무', group: '출장', rule: '교감 전결', detail: '관내 출장', process: '나이스 신청 → 교감 결재' });
  put('links', { category: '교육청·행정', title: '나이스(예시)', url: 'https://www.example.com/neis' });
  put('links', { category: '에듀테크', title: '학급 홈페이지(예시)', url: 'https://www.example.com/class' });
  put('secrets', { category: '교무', site: '학교 공용 계정(예시)', account: 'school-demo', password: 'demo-1234' });
  put('resources', { category: '업무 양식', title: '출장 신청서 양식(예시)', url: 'https://www.example.com/form', dept: '교무' });
  put('resources', { category: '매뉴얼·지침', title: '학교폭력 사안 처리 안내(예시)', url: 'https://www.example.com/guide', dept: '생활' });
  put('boards', { title: '학년별 담임 배정', rows: [['학년', '반', '담임'], ['1', '1', '박지우'], ['2', '1', '최하은'], ['3', '1', '정도윤'], ['4', '1', '강서연'], ['5', '1', '조하준'], ['6', '1', '윤지아']], merges: [] }, { year: YEAR });

  // ----- Deskterior: 6-1 담임 김민지의 학급 -----
  STUDENTS.forEach((name, i) => put('students', {
    num: i + 1, name, gender: i % 2 ? '남' : '여',
    birthday: i === 4 ? `${Number(TODAY.slice(5, 7))}-${Number(TODAY.slice(8))}` : `${(i % 12) + 1}-${(i * 3) % 27 + 1}`,
    health: i === 2 ? '우유 알레르기' : i === 11 ? '천식(흡입기 소지)' : '', afterschool: i % 5 === 0 ? '방과후 축구(화·목)' : '',
  }));
  put('attendance', { date: wd(0), student: '김나래', type: '결석', reason: '질병', note: '감기' });
  put('attendance', { date: wd(0), student: '서누리', type: '지각', reason: '기타' });
  put('attendance', { date: wd(-3), student: '김나래', type: '조퇴', reason: '질병', doc: true });
  put('attendance', { date: wd(-6), student: '양초롱', type: '결석', reason: '출석인정', note: '체험학습', doc: true });
  put('dailyNotes', { date: wd(0), content: '수학 익힘책 34쪽 풀기\n현장체험학습 동의서 내일까지 제출\n내일 체육복 입고 등교', supplies: '색연필, 가위', homework: '일기 쓰기' });
  put('dailyNotes', { date: wd(-1), content: '독서록 1편 쓰기\n우산 챙기기', supplies: '리코더' });
  put('checklists', { title: '현장체험학습 동의서', due: wd(1), done: STUDENTS.slice(0, 13) }, { year: YEAR });
  put('checklists', { title: '수학 익힘책 검사', due: wd(0), done: STUDENTS.filter((_, i) => i % 3) }, { year: YEAR });
  STUDENTS.forEach((s, i) => { for (let k = 0; k < (i * 7) % 5; k++) put('points', { date: wd(-k), student: s, points: 1, reason: ['발표', '도움', '정리정돈', '배려'][k % 4] }); });
  put('myTimetable', { title: '6-1 시간표', semester: '연간', grid: grid([['국어', '수학', '국어', '사회', '과학'], ['수학', '국어', '영어', '수학', '국어'], ['사회', '과학', '체육', '국어', '음악'], ['체육', '미술', '수학', '과학', '수학'], ['음악', '미술', '창체', '체육', '사회'], ['', '실과', '', '영어', '']]) }, { year: YEAR });
  [['수학', '3. 소수의 나눗셈 (1/8차시)', -2, true], ['수학', '3. 소수의 나눗셈 (2/8차시)', 0, false], ['수학', '3. 소수의 나눗셈 (3/8차시)', 1, false], ['국어', '4. 글의 짜임 (3/10차시)', 0, false], ['국어', '4. 글의 짜임 (2/10차시)', -1, true], ['사회', '2. 우리나라의 민주주의 (4/9차시)', 2, false]]
    .forEach(([subject, unit, d, done]) => put('progress', { subject, unit, date: wd(d), done }, { year: YEAR }));
  const sc = (pattern) => Object.fromEntries(STUDENTS.map((s, i) => [s, pattern(i)]).filter(([, v]) => v));
  put('myClass', { grade: '6학년', room: '1반', semester: '2학기' }, { year: YEAR });
  // 성취기준 DB 체험용: 실제 교육과정 문장이 아닌 예시 (코드의 '예' = 예시)
  put('standards', { subject: '과학', band: '5~6학년', curriculum: '체험용 예시', source: '체험용 예시 — 실제 교육과정 성취기준이 아닙니다', items: [
    { area: '물질', code: '[6예01-01]', text: '여러 가지 혼합물을 관찰하고 성질을 이용해 분리하는 방법을 탐구할 수 있다.' },
    { area: '물질', code: '[6예01-02]', text: '물질이 탈 때 나타나는 현상을 관찰하고 안전하게 실험할 수 있다.' },
    { area: '지구와 우주', code: '[6예02-01]', text: '하루 동안 그림자의 길이 변화를 측정하고 규칙을 찾을 수 있다.' },
    { area: '지구와 우주', code: '[6예02-02]', text: '우리 지역의 날씨를 조사하고 생활에 주는 영향을 설명한다.' },
    { area: '운동과 에너지', code: '[6예03-01]', text: '전기 회로를 꾸미고 전구의 밝기를 비교할 수 있다.' },
    { area: '과학과 사회', code: '[6예04-01]', text: '생활 속 자원을 조사하고 아껴 쓰는 방법을 실천하려는 태도를 기른다.' },
  ] });
  put('evalPlans', { subject: '과학', grade: '6학년', semester: '2학기', timing: '10월 3주', unit: '2. 혼합물의 분리', content: '혼합물의 성질을 살펴보고 알맞은 분리 방법을 정해 실험을 수행한 뒤 결과를 정리함.', element: '혼합물의 성질을 이용해 분리하기', area: '물질', method: '실험 보고서',
    standard: '[6예01-01] 여러 가지 혼합물을 관찰하고 성질을 이용해 분리하는 방법을 탐구할 수 있다.', code: '[6예01-01]', scale: '4단계', levels: ['매우 잘함', '잘함', '보통', '노력 요함'],
    rubric: { '매우 잘함': '혼합물의 성질을 정확히 파악하여 알맞은 분리 방법을 스스로 정하고 실험 결과를 근거를 들어 설명할 수 있다.', '잘함': '혼합물의 성질을 알고 알맞은 방법으로 분리하는 실험을 바르게 수행할 수 있다.', '보통': '안내에 따라 혼합물을 분리하는 실험을 수행할 수 있다.', '노력 요함': '혼합물을 분리하는 실험 활동에 참여한다.' },
    criteria: [
      { name: '분리 방법 정하기', rubric: { '매우 잘함': '혼합물의 성질을 근거로 알맞은 분리 방법을 스스로 정하고 이유를 설명할 수 있다.', '잘함': '혼합물의 성질에 맞는 분리 방법을 정할 수 있다.', '보통': '안내를 받아 분리 방법을 정할 수 있다.', '노력 요함': '예시를 보고 분리 방법을 따라 정한다.' } },
      { name: '실험 수행', rubric: { '매우 잘함': '실험 과정을 안전하고 능숙하게 수행한다.', '잘함': '실험 과정을 바르게 수행한다.', '보통': '모둠원의 도움을 받아 실험을 수행한다.', '노력 요함': '교사의 안내에 따라 실험에 참여한다.' } },
      { name: '결과 정리', rubric: { '매우 잘함': '실험 결과를 표와 그림으로 정리하고 원리와 관련지어 설명한다.', '잘함': '실험 결과를 표로 정리한다.', '보통': '실험 결과를 간단히 기록한다.', '노력 요함': '도움을 받아 결과를 기록한다.' } },
    ],
    chips: { good: ['스스로 끝까지 해결함', '근거를 들어 설명함', '친구와 협력하여 활동함', '결과를 꼼꼼하게 정리함', '창의적인 방법을 제안함'], need: ['근거를 들어 설명하는 연습', '결과를 정리하는 습관', '과정을 스스로 점검하는 태도'] },
    scores: sc((i) => {
      if (i >= 18) return null;
      const L = ['매우 잘함', '잘함', '보통', '노력 요함'];
      const c = [L[i % 3], L[(i + 1) % 3], L[(i * 2) % 4]];
      const crit = { '분리 방법 정하기': c[0], '실험 수행': c[1], '결과 정리': c[2] };
      const avg = Math.round((L.indexOf(c[0]) + L.indexOf(c[1]) + L.indexOf(c[2])) / 3);
      return { level: L[avg], crit, good: i % 2 ? ['친구와 협력하여 활동함'] : ['근거를 들어 설명함'], need: i % 4 === 3 ? ['결과를 정리하는 습관'] : [], evidence: i === 0 ? '자석으로 철가루를 먼저 분리하자고 제안함' : i === 1 ? '실험 결과를 표로 깔끔하게 정리함' : '' };
    }) }, { year: YEAR });
  put('evalPlans', { subject: '체육', grade: '6학년', semester: '2학기', unit: '3. 뜀틀 운동', area: '운동', code: '[6체02-03]', standard: '[6체02-03] 뜀틀 운동의 기본 동작을 익혀 자신 있게 넘는다.', element: '뜀틀 넘기 기본 동작', method: '실기·실습 평가', timing: '10월 2주', scale: '3단계',
    rubric: { '잘함': '도움닫기·구름판 딛기·착지를 자연스럽게 연결하여 뜀틀을 자신 있게 넘음', '보통': '뜀틀 넘기의 기본 동작을 알고 안전하게 넘을 수 있음', '노력 요함': '뜀틀 넘기에 자신감을 기르기 위해 단계별 연습이 필요함' },
    scores: sc((i) => (i < 14 ? { level: ['잘함', '보통', '잘함', '노력 요함'][i % 4], note: i === 0 ? '착지 자세가 안정적임' : i === 3 ? '높이에 대한 두려움이 있으나 끝까지 도전함' : '' } : null)) }, { year: YEAR });
  put('evalPlans', { subject: '국어', grade: '6학년', semester: '2학기', unit: '4. 글의 짜임', area: '쓰기', code: '[6국03-02]', standard: '목적이나 주제에 따라 알맞은 내용과 매체를 선정하여 글을 쓴다.', element: '글의 짜임을 생각하며 내용 간추리기', method: '서술형', timing: '11월 1주', scale: '4단계', scores: {}, rubric: {} }, { year: YEAR });
  put('evalPlans', { subject: '수학', grade: '6학년', semester: '2학기', unit: '3. 소수의 나눗셈', area: '수와 연산', code: '[6수01-11]', standard: '(소수)÷(자연수)의 계산 원리를 이해하고 그 계산을 할 수 있다.', element: '소수의 나눗셈 계산', method: '서술형', timing: '10월 4주', scale: '3단계', scores: sc((i) => (i < 8 ? { level: ['잘함', '보통'][i % 2] } : null)), rubric: {} }, { year: YEAR });
  put('notes', { date: wd(0), student: '강다온', category: '칭찬', content: '모둠 토의에서 친구들의 의견을 정리해 발표함' });
  put('notes', { date: wd(-1), student: '노을빛', category: '관찰', content: '쉬는 시간에 혼자 책을 읽는 모습이 자주 보임' });
  put('notes', { date: wd(-2), student: '김가람', category: '학습', content: '소수의 나눗셈에서 자릿값을 헷갈려 함 → 개별 지도' });
  put('counsels', { date: wd(-1), student: '노을빛', with: '보호자', method: '전화', topic: '교우관계', content: '최근 친구 관계에 대한 고민을 보호자와 나눔', followup: '짝 활동 늘리고 2주 뒤 다시 연락' });
  put('remarks', { student: '강다온', area: '행동특성 및 종합의견', content: '배려심이 깊고 모둠 활동에서 친구들의 의견을 조율하는 능력이 뛰어남.' }, { year: YEAR });
  // 학생 참여 활동 (체험용 가상 답안·글)
  const sciPlan = db.records.find((r) => r.module === 'evalPlans' && r.data.subject === '과학');
  const essay = put('activities', { title: '혼합물 분리 방법 설명하기', kind: '서·논술형', subject: '과학', question: '모래, 소금, 철가루가 섞인 혼합물을 분리하는 방법을 순서대로 쓰고, 각 방법을 쓴 까닭을 설명하세요.', open: true, token: 'demo0essay0000000000000', planId: sciPlan?.id || '' }, { year: YEAR });
  const ans = ['먼저 자석으로 철가루를 분리합니다. 철은 자석에 붙기 때문입니다. 그다음 물에 녹여 거름종이로 모래를 거르고, 남은 소금물을 증발시켜 소금을 얻습니다.', '물에 넣고 거르면 모래가 남아요. 소금물은 끓이면 소금이 나와요.', '자석으로 철을 빼고 체로 거른다.', '철가루는 자석, 모래는 거름, 소금은 증발. 알갱이 크기와 녹는 성질이 다르기 때문이다.'];
  db.subs = { [essay.id]: STUDENTS.slice(0, 4).map((name, i) => ({ id: i + 1, num: String(i + 1), name, body: ans[i], hidden: false, createdAt: `${YEAR}-10-02 10:0${i}:00`, updatedAt: `${YEAR}-10-02 10:0${i}:00` })) };
  const board = put('activities', { title: '오늘 배운 점 한 줄', kind: '클래스 보드', question: '오늘 과학 시간에 새롭게 안 것은 무엇인가요?', open: true, showNames: true, token: 'demo0board0000000000000' }, { year: YEAR });
  db.subs[board.id] = ['자석으로 철을 분리할 수 있다는 것!', '소금물을 증발시키면 소금이 남아요', '거름종이는 물은 통과시키고 모래는 막아요', '혼합물은 성질을 이용해서 분리한다'].map((body, i) => ({ id: 100 + i, num: String(i + 5), name: STUDENTS[i + 4], body, hidden: false, createdAt: `${YEAR}-10-02 11:0${i}:00` }));
  const quiz = put('activities', { title: '혼합물 분리 확인 퀴즈', kind: '실시간 퀴즈', subject: '과학', open: true, token: 'demo0quiz00000000000000', questions: [
    { q: '철가루를 분리할 때 쓰는 도구는?', choices: ['자석', '거름종이', '체', '알코올램프'], answer: '1' },
    { q: '소금물에서 소금을 얻는 방법은?', choices: ['거르기', '증발시키기', '자석 쓰기', '흔들기'], answer: '2' },
    { q: '물에 녹지 않는 모래를 분리하는 방법을 쓰세요.', choices: [], answer: '거르기,거름' },
  ] }, { year: YEAR });
  db.subs[quiz.id] = [['1', '2', '거르기'], ['1', '2', '체'], ['1', '1', '거름'], ['3', '2', '거르기'], ['1', '2', '거르기']].map((a, i) => ({ id: 200 + i, num: String(i + 1), name: STUDENTS[i], body: JSON.stringify(a), hidden: false, createdAt: `${YEAR}-10-02 12:0${i}:00` }));
  put('portfolios', { date: wd(-3), student: '강다온', subject: '미술', title: '가을 풍경 수채화', kind: '그림', link: 'https://www.example.com/art', note: '번지기 기법을 스스로 탐구함' });
  put('portfolios', { date: wd(-1), student: '김가람', subject: '과학', title: '전기 회로 탐구 보고서', kind: '실험·관찰', link: '', note: '직렬·병렬 차이를 그림으로 정리' });
  put('careers', { student: '강다온', hope: '수의사', parentHope: '본인 희망 존중', interest: '동물·생명과학', activity: '동물 보호 캠페인 포스터 제작' }, { year: YEAR });
  put('worksheets', { title: '혼합물의 분리', subject: '과학', unit: '4. 혼합물의 분리', content: '철가루는 {자석}을 이용해 분리한다.\n물에 녹지 않는 모래는 {거름종이}로 거른다.\n소금물을 {증발}시키면 소금이 남는다.' }, { year: YEAR });
  put('classRoles', { role: '칠판 정리', students: ['강다온', '김가람'] }, { year: YEAR });
  put('classRoles', { role: '우유 당번', students: ['김나래', '노을빛'] }, { year: YEAR });
  put('classRoles', { role: '화분 물 주기', students: ['류하늘'] }, { year: YEAR });
  put('seatPlan', { title: '2학기 1차', layout: { rows: 4, cols: 6, seats: STUDENTS.slice() } }, { year: YEAR });
  put('todos', { title: '학부모 상담 일정 안내 보내기', due: wd(0), repeat: '없음' });
  put('todos', { title: '출석부 정리', due: wd(0), repeat: '매주' });
  put('todos', { title: '학예회 반 작품 정하기', due: wd(3), repeat: '없음' });
  const wp = { cells: grid([]).periods.map(() => Array(5).fill('')) };
  ['국어\n글의 짜임 알기', '수학\n소수의 나눗셈', '사회\n민주주의의 의미', '과학\n전기 회로', '음악\n리코더 합주'].forEach((c, i) => { wp.cells[0][i] = c; });
  put('weeklyPlans', { date: monday, title: '함께 만드는 우리 반', notice: '이번 주 금요일은 운동회입니다. 체육복을 입고 등교해 주세요.', plan: wp });
  put('market', { kind: '자료 링크', category: '학급 운영', title: '1인 1역 역할 카드 (예시)', grades: '전 학년', desc: '교실 게시용 역할 카드 템플릿', link: 'https://www.example.com/roles', likes: ['t1@example.com', 't2@example.com'] }, { owner: 't1@example.com', author: '이서준' });
  put('market', { kind: 'HTML 도구', category: '수업 활동', title: '이름 카드 뒤집기 (예시)', grades: '전 학년', desc: '학생 이름 카드를 하나씩 뒤집으며 발표자를 정하는 놀이', html: "<!doctype html><html><body style=\"font-family:sans-serif;text-align:center;padding:30px;background:#fff8ef\"><h2>🃏 이름 카드 뒤집기</h2><div id=g style=\"display:flex;flex-wrap:wrap;gap:10px;justify-content:center\"></div><p id=m>[학생 명단 보내기]를 눌러 주세요</p><script>window.addEventListener('message',e=>{if(e.data&&e.data.type==='roster'){m.textContent=e.data.students.length+'명';g.innerHTML='';e.data.students.forEach(s=>{const b=document.createElement('button');b.textContent='?';b.style.cssText='width:90px;height:60px;font-size:18px;border-radius:10px;border:0;background:#e07b39;color:#fff';b.onclick=()=>{b.textContent=s.name;b.style.background='#30a46c'};g.append(b)})}})</script></body></html>", likes: ['t3@example.com', 't4@example.com', 't5@example.com'] }, { owner: 't3@example.com', author: '박지우' });
  put('market', { kind: '자료 링크', category: '학습지', title: '소수의 나눗셈 놀이 활동지 (예시)', grades: '6학년 수학', desc: '모둠별 카드 게임으로 익히는 소수 나눗셈', link: 'https://www.example.com/math', likes: [] }, { owner: ME.email, author: ME.name });

  db.inbox = [
    { id: 3, title: '🔁 보결 배정', body: `5교시 5-1 국어 (조하준 출장)`, url: '/#/class/substitutes', read: 0, created_at: `${TODAY} 08:05:00`, school_name: SCHOOL },
    { id: 2, title: '📣 조례 전달사항', body: '오늘 3교시에 소방 대피 훈련이 있습니다.', url: '/#/notice/briefings', read: 0, created_at: `${TODAY} 07:58:00`, school_name: SCHOOL },
    { id: 1, title: '🙋 학교 가입 요청', body: '백새봄 선생님이 가입을 요청했습니다.', url: '/#/admin', read: 0, created_at: `${TODAY} 07:50:00`, school_name: SCHOOL },
  ];
  db.audit = [{ id: 3, at: `${TODAY} 08:20:00`, email: 't1@example.com', name: '이서준', action: 'update', module: 'events', record_id: 'd3', detail: null }, { id: 2, at: `${TODAY} 08:10:00`, email: 't3@example.com', name: '박지우', action: 'create', module: 'purchases', record_id: 'd2', detail: null }, { id: 1, at: `${TODAY} 08:00:00`, email: ME.email, name: ME.name, action: 'create', module: 'briefings', record_id: 'd1', detail: null }];
  return db;
}

// ---------- 가짜 서버 ----------
let db = null;
const load = () => {
  if (db) return db;
  try { db = JSON.parse(sessionStorage.getItem(KEY)); } catch { db = null; }
  if (!db) { db = seed(); save(); }
  return db;
};
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 용량 초과 시 저장 생략 */ } };
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const clone = (x) => JSON.parse(JSON.stringify(x));

function toClient(r) {
  const data = clone(r.data);
  for (const f of MODULES[r.module].fields) if (f.type === 'secret' && data[f.key]) data[f.key] = MASK;
  const out = { id: r.id, year: r.year, date: r.date, sort: r.sort, version: r.version, data, updatedBy: r.updatedBy, updatedAt: r.updatedAt };
  if (r.module === 'market') { out.owner = r.owner; out.author = r.author || ME.name; }
  return out;
}

function list(m, year) {
  const scope = MODULES[m].scope;
  const { from, to } = yearRange(year);
  return load().records.filter((r) => r.module === m && (scope !== 'date' || (r.date >= from && r.date <= to)) && (scope !== 'year' || r.year === Number(year)))
    .sort((a, b) => (scope === 'date' ? String(a.date).localeCompare(String(b.date)) : 0) || (m === 'market' ? b.sort - a.sort : a.sort - b.sort))
    .map(toClient);
}

function clash(m, data, id) {
  if (m !== 'reservations') return;
  const x = load().records.find((r) => r.module === 'reservations' && r.id !== id && r.date === data.date && r.data.place === data.place && r.data.period === data.period);
  if (x) fail(409, `이미 예약되어 있습니다: ${data.place} ${data.period} (${x.data.user || ''})`);
}

function meals(from, to) {
  const menu = [['잡곡밥', '미역국', '닭갈비', '배추김치', '요구르트'], ['카레라이스', '어묵국', '계란말이', '깍두기', '사과'], ['볶음밥', '짜장소스', '군만두', '단무지', '바나나'], ['쌀밥', '된장찌개', '불고기', '시금치나물', '배추김치'], ['비빔밥', '맑은국', '떡갈비', '열무김치', '우유']];
  const out = {};
  for (let d = from; d <= to; d = add(d, 1)) if (![0, 6].includes(dow(d))) out[d] = [{ meal: '중식', dishes: menu[dow(d) - 1], kcal: '650 Kcal' }];
  return out;
}

export async function demoApi(path, { method = 'GET', body } = {}) {
  await new Promise((r) => setTimeout(r, 60)); // 실제처럼 아주 잠깐 기다림
  const u = new URL(path, location.origin);
  const p = u.pathname;
  const q = (k) => u.searchParams.get(k);
  const d = load();
  const year = Number(q('year')) || d.settings.currentYear;
  const write = (fn) => { const r = fn(); save(); return r; };
  let m;

  if (p === '/auth/logout') { exitDemo(); return { ok: true }; }
  if (p === '/api/me' && method === 'GET') {
    return { user: { email: ME.email, name: d.name, picture: '', super: false }, schools: [{ id: 'demo', name: d.settings.schoolName, status: 'active', role: 'admin' }],
      member: { schoolId: 'demo', role: 'admin', name: d.name, dept: ME.dept, schoolName: d.settings.schoolName },
      settings: { ...d.settings, neis: { name: d.settings.schoolName, demo: true }, neisKey: true }, push: null };
  }
  if (p === '/api/me' && method === 'PUT') return write(() => { d.name = body.name; return { ok: true }; });
  m = p.match(/^\/api\/activities\/([^/]+)\/submissions(?:\/(\d+)\/hide)?$/);
  if (m) {
    d.subs ||= {};
    const list = d.subs[m[1]] ||= [];
    if (method === 'GET') return list;
    if (method === 'DELETE') return write(() => { d.subs[m[1]] = []; return { ok: true }; });
    return write(() => { const x = list.find((s) => s.id === Number(m[2])); if (x) x.hidden = body?.hidden !== false; return { ok: true }; });
  }
  if (p === '/api/staff') {
    const out = d.members.filter((x) => x.role !== 'pending').map(({ name, dept }) => ({ name, dept }));
    for (const r of d.records) if (r.module === 'assignments' && r.data.name && !out.some((x) => x.name === r.data.name)) out.push({ name: r.data.name, dept: r.data.dept || '' });
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
  if (p === '/api/bundle') { const out = {}; for (const x of String(q('modules') || '').split(',')) if (MODULES[x]) out[x] = list(x, year); return out; }
  if (p === '/api/changes') return { now: nowStamp(), items: [] };
  if (p === '/api/inbox') return { items: d.inbox, unread: d.inbox.filter((x) => !x.read).length };
  if (p === '/api/inbox/read') return write(() => { d.inbox.forEach((x) => { x.read = 1; }); return { ok: true }; });
  if (p === '/api/neis/meals') return { configured: true, meals: meals(q('from'), q('to') || q('from')) };
  if (p === '/api/neis/timetable') {
    const tt = d.records.find((r) => r.module === 'timetables' && r.data.title === q('cls'));
    const rows = [];
    if (tt) for (let i = 0; i < 5; i++) { const day = add(q('from'), i); tt.data.grid.cells.forEach((row, pi) => { if (row[i]) rows.push({ date: day, period: pi + 1, subject: row[i] }); }); }
    return { configured: true, rows };
  }
  if (p === '/api/neis/timetable-day') {
    const di = dow(q('date')) - 1;
    const rows = [];
    for (const r of d.records.filter((x) => x.module === 'timetables' && /^\d-\d+$/.test(x.data.title))) r.data.grid.cells.forEach((row, pi) => { if (row[di]) rows.push({ cls: r.data.title, period: pi + 1, subject: row[di] }); });
    for (const cls of ['1-1', '2-1', '3-1', '4-1']) ['국어', '수학', '바른 생활', '슬기로운 생활', '즐거운 생활'].forEach((subject, pi) => rows.push({ cls, period: pi + 1, subject }));
    return { configured: true, rows };
  }
  if ((m = p.match(/^\/api\/records\/([^/]+)$/))) {
    const mod = m[1];
    if (!MODULES[mod]) fail(404, '알 수 없는 메뉴입니다.');
    if (method === 'GET') return list(mod, year);
    return write(() => {
      const data = normalizeData(mod, body.data);
      if (MODULES[mod].scope === 'date' && !data.date) fail(400, '날짜를 입력해 주세요.');
      clash(mod, data);
      if (mod === 'activities') data.token = Math.random().toString(16).slice(2).padEnd(24, '0');
      const r = { id: `d${d.seq++}`, module: mod, data, version: 1, sort: d.seq, year: MODULES[mod].scope === 'year' ? Number(body.year || year) : null, date: MODULES[mod].scope === 'date' ? data.date : null, owner: spaceOf(mod) === 'school' ? null : ME.email, author: d.name, updatedBy: ME.email, updatedAt: nowStamp() };
      if (mod === 'market') r.data.likes = [];
      d.records.push(r);
      if (mod === 'events' && data.toNotice) { // 서버의 '공지사항에도 올리기'와 같은 동작
        const nid = `d${d.seq++}`;
        d.records.push({ id: nid, module: 'notices', data: normalizeData('notices', { title: String(data.title).split('\n')[0], category: '일반', content: `📅 ${data.date}${data.endDate ? ` ~ ${data.endDate}` : ''}  ${data.title}`, dept: data.dept || '', month: data.date.slice(0, 7) }), version: 1, sort: d.seq, year: Number(year), date: null, owner: null, updatedBy: ME.email, updatedAt: nowStamp() });
        r.data.noticeId = nid;
      }
      d.audit.unshift({ id: d.audit.length + 1, at: nowStamp(), email: ME.email, name: d.name, action: 'create', module: mod, record_id: r.id });
      return toClient(r);
    });
  }
  if ((m = p.match(/^\/api\/records\/([^/]+)\/([^/]+)(?:\/(self|observe|reveal))?$/))) {
    const [, mod, id, act] = m;
    const r = d.records.find((x) => x.id === id && x.module === mod);
    if (!r) fail(404, '기록을 찾을 수 없습니다.');
    if (act === 'reveal') { const out = {}; for (const f of MODULES[mod].fields) if (f.type === 'secret') out[f.key] = r.data[f.key] || ''; return out; }
    if (act) {
      return write(() => {
        const field = SELF_TOGGLE[mod];
        const who = mod === 'market' ? ME.email : d.name;
        const set = new Set(r.data[field] || []);
        if (body.on) set.add(who); else set.delete(who);
        r.data[field] = [...set]; r.version++;
        return toClient(r);
      });
    }
    if (method === 'DELETE') return write(() => { d.records.splice(d.records.indexOf(r), 1); return { ok: true }; });
    if (mod === 'market' && r.owner !== ME.email) fail(403, '수정 권한이 없습니다.');
    return write(() => {
      if (body.version !== undefined && body.version !== r.version) fail(409, '그사이 다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.');
      const data = normalizeData(mod, body.data);
      for (const f of MODULES[mod].fields) if (f.type === 'secret' && (data[f.key] === MASK || data[f.key] === undefined)) data[f.key] = r.data[f.key];
      if (mod === 'market') data.likes = r.data.likes || [];
      clash(mod, data, id);
      r.data = data; r.date = MODULES[mod].scope === 'date' ? data.date : null; r.version++; r.updatedAt = nowStamp(); r.updatedBy = ME.email;
      return toClient(r);
    });
  }
  // 학교 관리
  if (p === '/api/admin/users' && method === 'GET') return d.members;
  if ((m = p.match(/^\/api\/admin\/users(?:\/(.+))?$/))) {
    return write(() => {
      const email = decodeURIComponent(m[1] || body.email || '').toLowerCase();
      const i = d.members.findIndex((x) => x.email === email);
      if (method === 'DELETE') { if (i >= 0) d.members.splice(i, 1); return { ok: true }; }
      if (i >= 0) Object.assign(d.members[i], Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null)));
      else d.members.push({ email, name: body.name || '', dept: body.dept || '', role: body.role || 'staff', created_at: nowStamp(), last_login: null });
      return { ok: true };
    });
  }
  if (p === '/api/admin/invite') return { code: 'demo2026' };
  if (p === '/api/admin/settings') return write(() => { if (body.currentYear) d.settings.currentYear = body.currentYear; if (body.lists) d.settings.lists = body.lists; if (body.schoolName) d.settings.schoolName = body.schoolName; if (body.theme) d.settings.theme = body.theme; if (body.access) d.settings.access = body.access; return d.settings; });
  if (p === '/api/admin/audit') {
    const all = d.audit;
    const users = [...new Set(all.map((a) => a.email))].map((email) => ({ email, name: all.find((a) => a.email === email)?.name, role: 'admin', n: all.filter((a) => a.email === email).length, last: all.find((a) => a.email === email)?.at }));
    const rows = all.filter((a) => (!q('email') || a.email === q('email')) && (!q('action') || a.action === q('action')) && (!q('module') || a.module === q('module')));
    return { school: 'demo', schools: [{ id: 'demo', name: SCHOOL }], full: true, more: false, users, rows: rows.slice(0, 200) };
  }
  if (p === '/api/admin/export') return { exportedAt: new Date().toISOString(), demo: true, records: d.records };
  if (p === '/api/admin/import') {
    return write(() => {
      let n = 0;
      if (body.mode === 'replace') { const mods = new Set(body.items.map((x) => x.module)); d.records = d.records.filter((r) => !mods.has(r.module) || spaceOf(r.module) !== 'school'); }
      for (const it of body.items) {
        if (!MODULES[it.module] || spaceOf(it.module) !== 'school') continue;
        const data = normalizeData(it.module, it.data);
        const scope = MODULES[it.module].scope;
        if (scope === 'date' && !data.date) continue;
        d.records.push({ id: `d${d.seq++}`, module: it.module, data, version: 1, sort: d.seq, year: scope === 'year' ? Number(body.year) : null, date: scope === 'date' ? data.date : null, owner: null, updatedBy: ME.email, updatedAt: nowStamp() });
        n++;
      }
      return { ok: true, inserted: n };
    });
  }
  if (p === '/api/admin/copy-year') return { ok: true, copied: 0 };
  if (p.startsWith('/api/admin/neis') || p.startsWith('/api/push') || p.startsWith('/api/schools') || p.startsWith('/api/neis/schools') || p.startsWith('/api/platform')) {
    fail(400, '체험 모드에서는 쓸 수 없는 기능입니다. 로그인한 뒤 사용해 주세요.');
  }
  fail(404, '체험 모드에서는 지원하지 않는 기능입니다.');
}
