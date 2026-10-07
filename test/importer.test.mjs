import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { splitEvents, parseWorkbook } from '../public/js/importer.js';
import { yearRange, yearMonths, normalizeData, DEFAULT_LISTS } from '../public/js/modules.js';

test('학년도 범위는 1월 ~ 다음해 2월 말', () => {
  assert.deepEqual(yearRange(2026), { from: '2026-01-01', to: '2027-02-28' });
  assert.deepEqual(yearRange(2027), { from: '2027-01-01', to: '2028-02-29' }); // 윤년
  const ms = yearMonths(2026);
  assert.equal(ms.length, 14);
  assert.deepEqual(ms.at(-1), { y: 2027, m: 2 });
});

test('한 칸의 여러 행사를 담당·장소 줄과 짝지음', () => {
  const ev = splitEvents('• 출결마감\n• 음악 줄넘기\n• 평화수업', '\n학맞통\n생활', '\n체육관\n각반교실');
  assert.equal(ev.length, 3);
  assert.equal(ev[0].dept, '');
  assert.equal(ev[1].dept, '학맞통');
  assert.equal(ev[2].place, '각반교실');
  assert.ok(!ev.some((e) => e.review));
});

test('줄이 어긋나면 확인필요 표시', () => {
  const ev = splitEvents('• 행사A\n• 행사B', '교무\n\n보건', '');
  assert.ok(ev.every((e) => e.review));
  assert.match(ev[0].note, /교무, 보건/);
});

test('행사 하나에 담당 여러 줄이면 모두 담당으로', () => {
  const ev = splitEvents('• 책임장학', '연구\n교무', '');
  assert.equal(ev[0].dept, '연구, 교무');
});

test('공휴일 분류 추정', () => {
  assert.equal(splitEvents('• 추석 연휴', '', '')[0].category, '휴일·방학');
  assert.equal(splitEvents('• 제75회 수영대회 (4학년 2명 출전)', '', '')[0].category, '대회출전');
  assert.equal(splitEvents('• 평화수업(1~2교시 3-1)', '', '')[0].category, '학급수업');
  assert.equal(splitEvents('• SW·AI 수업(6학년)', '', '')[0].category, '특별수업');
});

test('금액은 단가×수량 자동 계산', () => {
  const d = normalizeData('purchases', { requester: '가', item: '나', price: '1,000', qty: '3', amount: 999, bogus: 1 });
  assert.equal(d.amount, 3000);
  assert.equal(d.bogus, undefined);
});

test('시트 가져오기: 월별 행사 · 날짜로 바뀐 학급명 복원 · 자유 표', () => {
  const wb = XLSX.utils.book_new();
  const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return (Date.UTC(y, m - 1, dd) / 86400000) + 25569; };
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['9월 교육활동(행사) 일정'],
    ['#9월 교육과정 주요 안내\n- 정보공시'],
    ['일', '요일', '학교 행사', '담당자', '비고(장소)', '출장명\n이름/시각/장소'],
    [{ t: 'n', v: d('2026-09-01'), z: 'd' }, '화', '• 월례회의', '교무', '도서관', '연수/홍길동/9:00/연수원'],
    ['9월 수업일수 : 21일'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws1, '월별교육활동');
  const ws2 = XLSX.utils.aoa_to_sheet([[{ t: 'n', v: d('2026-03-01'), z: 'm-d' }, '보건']]);
  XLSX.utils.book_append_sheet(wb, ws2, '신발장');
  const { items } = parseWorkbook(XLSX, wb, { lists: DEFAULT_LISTS });
  const ev = items.find((i) => i.module === 'events');
  assert.equal(ev.data.date, '2026-09-01');
  assert.equal(ev.data.title, '월례회의');
  assert.equal(items.find((i) => i.module === 'trips').data.person, '홍길동');
  const note = items.find((i) => i.module === 'notices' && i.data.category === '월별 안내');
  assert.equal(note.data.month, '2026-09');
  assert.equal(note.data.pinned, true);
  assert.equal(note.data.schoolDays, '21일');
  assert.match(note.data.content, /정보공시/);
  const board = items.find((i) => i.module === 'boards');
  assert.equal(board.data.rows[0][0], '3-1');
});

test('달력형 특별수업 시트: 날짜는 칸 위치로 계산(잘못 적은 날짜 숫자 무시), 개학식 등 행사는 제외', () => {
  const rows = [
    ['국악'],
    ['📅 2026년 9월'],
    ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    ['', '', 1, '2\n(14/44)\n(4-1) 5교시', '10\n(3-2) 1교시', 4, 5],
    [6, 7, 8, 9, '10\n개학식', 11, 12],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '예술 시간표');
  const { items } = parseWorkbook(XLSX, wb, { lists: DEFAULT_LISTS });
  const p = items.filter((x) => x.module === 'programs');
  assert.deepEqual(p.map((x) => [x.data.program, x.data.date]), [['국악', '2026-09-02'], ['국악', '2026-09-03']]);
});
