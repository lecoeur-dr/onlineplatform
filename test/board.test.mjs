import test from 'node:test';
import assert from 'node:assert/strict';
import { fillTimes, periodState, boardStats, pickPool, makeGroups, ddayLabel, parsePlaces, placeOf, gapName, durLabel } from '../public/js/board-logic.js';

const T = fillTimes();
const L = ['국어', '수학', '사회', '과학', '체육', '창체'].map((text, i) => ({ period: `${i + 1}교시`, text }));
const at = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

test('교시 시각 한 번에 채우기: 중간놀이(2교시 뒤 20분)·점심(4교시 뒤 50분)', () => {
  assert.deepEqual(T.map((t) => `${t.start}~${t.end}`), ['09:00~09:40', '09:50~10:30', '10:50~11:30', '11:40~12:20', '13:10~13:50', '14:00~14:40']);
});

test('지금 상태: 수업 전 · 수업 중 · 쉬는 시간 · 점심 · 끝', () => {
  let s = periodState(T, L, at('08:30'));
  assert.equal(s.kind, 'before'); assert.equal(s.next.subject, '국어'); assert.equal(s.left, 30);
  s = periodState(T, L, at('09:10'));
  assert.equal(s.kind, 'class'); assert.equal(s.cur.subject, '국어'); assert.equal(s.left, 30); assert.equal(s.next.subject, '수학');
  s = periodState(T, L, at('10:35'));
  assert.equal(s.kind, 'break'); assert.equal(s.gap, '중간놀이'); assert.equal(s.next.subject, '사회'); assert.equal(s.left, 15);
  s = periodState(T, L, at('12:30'));
  assert.equal(s.gap, '점심시간'); assert.equal(s.next.subject, '체육');
  assert.equal(periodState(T, L, at('15:00')).kind, 'after');
});

test('그 날 수업이 5교시까지면 6교시는 없음', () => {
  const five = L.slice(0, 5);
  assert.equal(periodState(T, five, at('14:10')).kind, 'after');
});

test('시간표가 없어도 교시 시각만으로 동작', () => {
  const s = periodState(T, [], at('09:10'));
  assert.equal(s.kind, 'class'); assert.equal(s.cur.label, '1교시'); assert.equal(s.cur.subject, '');
});

test('체크판 집계: 빼는 번호·결석 제외, 아직 번호', () => {
  const s = boardStats(10, [1, 2, 3, 4, 5, 6], [9], [10]);
  assert.equal(s.target, 8); assert.equal(s.done, 6); assert.deepEqual(s.left, [7, 8]); assert.equal(s.complete, false);
  assert.equal(boardStats(3, [1, 2, 3]).complete, true);
});

test('번호 뽑기·모둠', () => {
  assert.deepEqual(pickPool(5, [2], [4]), [1, 3, 5]);
  assert.deepEqual(pickPool(5, [2], [4], false), [1, 3, 4, 5]);
  const g = makeGroups([1, 2, 3, 4, 5, 6, 7], 3, () => 0.5);
  assert.equal(g.length, 3); assert.equal(g.flat().length, 7);
  assert.ok(Math.max(...g.map((x) => x.length)) - Math.min(...g.map((x) => x.length)) <= 1);
});

test('D-day · 장소 · 글자', () => {
  assert.equal(ddayLabel('2026-11-14', '2026-10-31'), 'D-14');
  assert.equal(ddayLabel('2026-10-31', '2026-10-31'), 'D-DAY');
  assert.equal(ddayLabel('2026-10-30', '2026-10-31'), 'D+1');
  const p = parsePlaces('과학=과학실\n체육: 체육관\n잘못된 줄');
  assert.deepEqual(p, { 과학: '과학실', 체육: '체육관' });
  assert.equal(placeOf(p, '과학'), '과학실');
  assert.equal(gapName(10), '쉬는 시간');
  assert.equal(durLabel(256), '4시간 16분');
});
