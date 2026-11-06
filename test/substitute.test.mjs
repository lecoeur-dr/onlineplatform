import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, lessonsOf, busyAt, absentLessons, candidates, subCounts, weekdayOf } from '../public/js/substitute-logic.js';

const grid = (cells) => ({ days: ['월', '화', '수', '목', '금'], periods: ['1교시', '2교시', '3교시', '4교시'], cells });
// 2026-10-28 = 수요일
const tts = [
  { data: { kind: '학급', title: '6-2', grid: grid([['', '', '국어', '', ''], ['', '', '수학', '', ''], ['', '', '과학', '', ''], ['', '', '사회', '', '']]) } },
  { data: { kind: '학급', title: '6-1', grid: grid([['', '', '수학', '', ''], ['', '', '', '', ''], ['', '', '국어', '', ''], ['', '', '체육', '', '']]) } },
  { data: { kind: '전담', title: '과학 전담', grid: grid([['', '', '', '', ''], ['', '', '6-1', '', ''], ['', '', '6-2', '', ''], ['', '', '', '', '']]) } },
];
const staff = [{ name: '황선생', homeroom: '6-2' }, { name: '박선생', homeroom: '6-1' }, { name: '김과학', homeroom: '과학 전담' }, { name: '이선생', homeroom: '' }];

test('요일 계산', () => { assert.equal(weekdayOf('2026-10-28'), '수'); });

test('교사별 그 날 수업 (전담 시간은 담임이 빔)', () => {
  const ctx = makeCtx(tts, staff, '2026-10-28');
  assert.deepEqual(lessonsOf(ctx, '황선생').map((l) => `${l.period}:${l.subject}`), ['1교시:국어', '2교시:수학', '4교시:사회']); // 3교시 과학은 전담
  assert.deepEqual(lessonsOf(ctx, '김과학').map((l) => `${l.period}:${l.cls}`), ['2교시:6-1', '3교시:6-2']);
  assert.equal(busyAt(ctx, '박선생', '2교시'), false); // 6-1 2교시 = 과학 전담
  assert.equal(busyAt(ctx, '박선생', '1교시'), true);
  assert.equal(busyAt(ctx, '이선생', '1교시'), null);
  assert.deepEqual(absentLessons(ctx, '황선생', '1~2교시').map((l) => l.period), ['1교시', '2교시']);
});

test('보결 후보: 공강 → 정보 없음 → 수업 있음 → 부재, 보강 적은 순', () => {
  const ctx = makeCtx(tts, staff, '2026-10-28');
  const counts = subCounts([{ data: { absent: '황선생', substitute: '김과학' } }, { data: { absent: '황선생', substitute: '김과학' } }]);
  const list = candidates(ctx, { period: '1교시', cls: '6-2', subject: '국어', absentName: '황선생', counts });
  assert.deepEqual(list.map((x) => `${x.name}:${x.status}`), ['김과학:free', '이선생:unknown', '박선생:busy']);
  assert.equal(list[0].subCnt, 2);
  assert.equal(list.find((x) => x.name === '박선생').sameGrade, true);
  const list2 = candidates(ctx, { period: '2교시', cls: '6-2', absentName: '황선생', absentees: new Set(['박선생']) });
  assert.equal(list2.find((x) => x.name === '박선생').status, 'absent');
  assert.equal(list2.find((x) => x.name === '김과학').status, 'busy');
});

test('조퇴 교시 범위: 적힌 교시만 부재로 봄', async () => {
  const { coversPeriod } = await import('../public/js/substitute-logic.js');
  assert.equal(coversPeriod('', '1교시'), true);
  assert.equal(coversPeriod('4~5교시', '1교시'), false);
  assert.equal(coversPeriod('4~5교시', '5교시'), true);
  assert.equal(coversPeriod('3교시', '3교시'), true);
  assert.equal(coversPeriod('14:00~16:40', '6교시'), true);
});

test('학급 하루 시간표: 전담 시간은 전담 선생님으로 표시', async () => {
  const { classDay, homeroomTeacher } = await import('../public/js/substitute-logic.js');
  const ctx = makeCtx(tts, staff, '2026-10-28');
  const day = classDay(ctx, '6-2');
  assert.deepEqual(day.map((x) => `${x.subject}:${x.specialist}`), ['국어:', '수학:', '과학:김과학', '사회:']);
  assert.equal(homeroomTeacher(ctx, '6-2'), '황선생');
  assert.equal(classDay(ctx, '9-9'), null);
});

test('전담 시간표만 있을 때: 담임은 전담이 들어오는 시간만 비어 있음', async () => {
  const { classDay, lessonAt, roomOrder } = await import('../public/js/substitute-logic.js');
  const G6 = (cells) => ({ days: ['월', '화', '수', '목', '금'], periods: ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'], cells });
  const e = ['', '', '', '', ''];
  const only = [
    { data: { kind: '전담', title: '과학 전담', grid: G6([e, ['5-1', '', '', '', ''], e, e, e, e]) } },
    { data: { kind: '전담', title: '영어 전담', grid: G6([e, e, e, ['5-1', '', '', '', ''], e, e]) } },
  ];
  const st = [{ name: '박진선', homeroom: '5-1' }, { name: '김과학', homeroom: '과학 전담' }];
  const ctx = makeCtx(only, st, '2026-11-09'); // 월요일
  assert.equal(busyAt(ctx, '박진선', '1교시'), true);
  assert.equal(busyAt(ctx, '박진선', '2교시'), false); // 과학 전담 시간
  assert.equal(busyAt(ctx, '박진선', '4교시'), false); // 영어 전담 시간
  assert.equal(lessonAt(ctx, '박진선', '3교시').subject, '담임 수업');
  assert.equal(busyAt(ctx, '김과학', '2교시'), true);
  assert.equal(busyAt(ctx, '김과학', '1교시'), false);
  const day = classDay(ctx, '5-1');
  assert.equal(day.length, 6);
  assert.deepEqual(day.map((x) => x.specialist || '-'), ['-', '김과학', '-', '영어 전담', '-', '-']);
  assert.equal(day[1].subject, '과학');
  const tue = classDay(makeCtx(only, st, '2026-11-10'), '5-1'); // 화요일: 전담 없음 → 6교시 모두 담임 수업
  assert.equal(tue.length, 6); assert.ok(tue.every((x) => x.need && !x.specialist));
  // 공강 후보: 2교시엔 박진선 공강
  const c = candidates(ctx, { period: '2교시', cls: '6-2', absentName: '황선생' });
  assert.equal(c.find((x) => x.name === '박진선').status, 'free');
  assert.equal(candidates(ctx, { period: '1교시', cls: '6-2' }).find((x) => x.name === '박진선').status, 'busy');
  // 학년반 순
  assert.deepEqual(['과학 전담', '', '6-1', '1-2', '1-10', '1-1'].sort((a, b) => roomOrder(a) - roomOrder(b)), ['1-1', '1-2', '1-10', '6-1', '과학 전담', '']);
});
