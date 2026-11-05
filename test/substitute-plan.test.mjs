import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCell, runsOn, entriesOn, tally, weeklyLoad, parsePasted, holidayChecker } from '../public/js/substitute-plan.js';

// 사진의 6학년 2반 고정 보결표
const T = [
  ['5-1', '과', '4-1', '영', '영'],
  ['5-1', '3-2', '4-1', '3-1', '도'],
  ['5-2', '3-1', '6-1', '과', '3-2'],
  ['5-2', '체(교장)', '6-1', '과', '체(교감)'],
  ['교무', '교장', '교감', '교감', '연구'],
  ['교무', '교장', '', '교감', '연구'],
];
const plan = (extra = {}) => ({ id: 'p1', data: { title: '6-2', start: '2026-11-02', end: '2026-11-13', grid: { days: ['월', '화', '수', '목', '금'], periods: ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'], cells: T.map((r) => r.map((text) => ({ text }))) }, ...extra } });

test('칸 글자 해석: 학급·직책은 보결, 과목은 전담, 괄호는 과목(보결 교사)', () => {
  assert.deepEqual(parseCell('5-1'), { kind: 'sub', who: '5-1', subj: '' });
  assert.deepEqual(parseCell('교무'), { kind: 'sub', who: '교무', subj: '' });
  assert.deepEqual(parseCell('과'), { kind: 'class', who: '', subj: '과' });
  assert.deepEqual(parseCell('체(교장)'), { kind: 'sub', who: '교장', subj: '체' });
  assert.deepEqual(parseCell('김선생', ['김선생']), { kind: 'sub', who: '김선생', subj: '' });
  assert.equal(parseCell('도', [], 'sub').kind, 'sub');
  assert.equal(parseCell('', []).kind, '');
});

test('한 주 보결 시수: 사진 기준 23시간', () => {
  const m = weeklyLoad(plan());
  assert.equal([...m.values()].reduce((a, b) => a + b, 0), 23);
  assert.equal(m.get('교감'), 4); // 수5, 목5, 목6, 금4(체)
  assert.equal(m.get('교장'), 3); // 화4(체), 화5, 화6
  assert.equal(m.get('5-1'), 2);
});

test('운영일: 기간·요일·빠지는 날·휴일', () => {
  const p = plan({ skip: ['2026-11-04'] });
  const hol = holidayChecker([{ data: { date: '2026-11-06', category: '휴업일', title: '재량휴업' } }]);
  assert.equal(runsOn(p, '2026-11-02', hol), true);
  assert.equal(runsOn(p, '2026-11-01', hol), false); // 일요일·기간 전
  assert.equal(runsOn(p, '2026-11-04', hol), false); // 빠지는 날
  assert.equal(runsOn(p, '2026-11-06', hol), false); // 휴업일
  assert.equal(runsOn(p, '2026-11-16', hol), false); // 기간 뒤
});

test('날짜별 바꾸기·취소 반영', () => {
  const p = plan({ overrides: { '2026-11-02': { 0: { who: '교감' }, 4: null } } });
  const e = entriesOn(p, '2026-11-02');
  assert.equal(e[0].who, '교감'); assert.equal(e[0].changed, true); assert.equal(e[0].was, '5-1');
  assert.equal(e[4].cancelled, true);
  assert.equal(e[1].who, '5-1');
});

test('집계: 오늘까지 실시 + 이후 예정, 수시 보결 기록 포함', () => {
  const recs = [{ data: { date: '2026-11-03', period: '3교시', className: '4-2', substitute: '교감' } }];
  const t = tally({ plans: [plan()], records: recs, from: '2026-11-01', to: '2026-11-30', today: '2026-11-04' });
  // 11/2(월)~11/4(수) 실시: 교감은 수5 1회 + 수시 1회, 이후(11/5~11/13) 예정
  assert.equal(t.get('교감').fixed, 1);
  assert.equal(t.get('교감').extra, 1);
  assert.equal(t.get('교감').months['2026-11'], 2);
  assert.equal(t.get('교감').planned, 3 + 4); // 11/5목 2 + 11/6금 1, 다음 주 4
  assert.equal(t.get('5-1').fixed, 2);
  assert.equal(t.get('5-1').log[0].date, '2026-11-02');
});

test('붙여넣기: 머리글·교시 칸 건너뜀', () => {
  const g = parsePasted('\t월\t화\t수\t목\t금\n1교시\t5-1\t과\t4-1\t영\t영\n2교시\t5-1\t3-2\t4-1\t3-1\t도');
  assert.deepEqual(g, [['5-1', '과', '4-1', '영', '영'], ['5-1', '3-2', '4-1', '3-1', '도']]);
});
