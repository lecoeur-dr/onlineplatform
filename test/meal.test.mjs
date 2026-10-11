import test from 'node:test';
import assert from 'node:assert/strict';
import { gradesOf, optionsOf, checkMeal, mealResults, menuKey } from '../public/js/meal.js';

test('대상 학년 읽기', () => {
  assert.deepEqual(gradesOf('3~6학년'), [3, 4, 5, 6]);
  assert.deepEqual(gradesOf('1, 2학년'), [1, 2]);
  assert.deepEqual(gradesOf('5-6'), [5, 6]);
  assert.deepEqual(gradesOf(''), [1, 2, 3, 4, 5, 6]);
});

test('메뉴 투표: 검사·집계', () => {
  const d = { kind: '메뉴 투표', options: '마라탕\n돈가스, 떡볶이\n돈가스', maxPick: 2, grades: '5~6' };
  assert.deepEqual(optionsOf(d.options), ['마라탕', '돈가스', '떡볶이']);
  assert.ok(checkMeal(d, { grade: 4, picks: ['마라탕'] }).error);
  assert.ok(checkMeal(d, { grade: 5, picks: ['마라탕', '돈가스', '떡볶이'] }).error);
  assert.deepEqual(checkMeal(d, { grade: 5, picks: ['마라탕', '없는메뉴'] }).clean, { grade: 5, answers: { picks: ['마라탕'] } });
  const r = mealResults(d, [{ grade: 5, answers: { picks: ['마라탕', '돈가스'] } }, { grade: 6, answers: { picks: ['마라탕'] } }]);
  assert.equal(r.total, 2);
  assert.deepEqual(r.byGrade, { 5: 1, 6: 1 });
  assert.deepEqual(r.votes[0], { menu: '마라탕', count: 2, grades: { 5: 1, 6: 1 } });
});

test('메뉴 추천: 같은 메뉴 묶기, 숨긴 응답 제외', () => {
  const d = { kind: '메뉴 추천', recCount: 2 };
  assert.equal(menuKey('마라 탕!'), menuKey('마라탕'));
  assert.equal(checkMeal(d, { grade: 3, recs: [{ menu: 'a' }, { menu: 'b' }, { menu: 'c' }] }).clean.answers.recs.length, 2);
  const r = mealResults(d, [
    { grade: 3, answers: { recs: [{ menu: '마라탕', reason: '맛있어요' }] } },
    { grade: 4, answers: { recs: [{ menu: '마라 탕' }] } },
    { grade: 4, answers: { recs: [{ menu: '장난' }] }, hidden: 1 },
  ]);
  assert.equal(r.recs.length, 1);
  assert.equal(r.recs[0].count, 2);
  assert.deepEqual(r.recs[0].grades, { 3: 1, 4: 1 });
});
