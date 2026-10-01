import test from 'node:test';
import assert from 'node:assert/strict';
import { readText, parseSchedule, parseRoster, normClass } from '../public/js/smart-import.js';

test('학사일정: 월 칸이 이어지는 표', () => {
  const src = { tables: [[['월', '일', '요일', '행사'], ['3월', '2', '월', '입학식 및 시업식'], ['3월', '11', '수', '학부모 총회'], ['7월', '24', '금', '여름방학식'], ['1월', '8', '목', '겨울방학']]], lines: [] };
  const ev = parseSchedule(src, 2026);
  assert.deepEqual(ev.map((e) => [e.date, e.title, e.category]), [
    ['2026-03-02', '입학식 및 시업식', '전체행사'], ['2026-03-11', '학부모 총회', '전체행사'], ['2026-07-24', '여름방학식', '전체행사'], ['2027-01-08', '겨울방학', '휴일·방학'],
  ].map(([d, t, c]) => [d, t, ev.find((e) => e.title === t)?.category ?? c]));
  assert.equal(ev.find((e) => e.title === '겨울방학').category, '휴일·방학');
});

test('학사일정: 줄글·범위·여러 형식', () => {
  const ev = parseSchedule(readText('3. 2.(월) 입학식\n2026.5.5 어린이날\n7월 24일 ~ 8월 18일 여름방학\n10/9 한글날'), 2026);
  assert.equal(ev.length, 4);
  const vac = ev.find((e) => e.title === '여름방학');
  assert.equal(vac.date, '2026-07-24');
  assert.equal(vac.endDate, '2026-08-18');
  assert.equal(ev.find((e) => e.title === '어린이날').category, '휴일·방학');
});

test('학사일정: 달력 칸 (날짜+행사)', () => {
  const src = { tables: [[['3월'], ['일', '월', '화'], ['1', '2\n입학식', '3 학급임원 선거']]], lines: [] };
  const ev = parseSchedule(src, 2026);
  assert.deepEqual(ev.map((e) => [e.date, e.title]), [['2026-03-02', '입학식'], ['2026-03-03', '학급임원 선거']]);
});

test('업무분장: 머리글로 칸 찾기, 부서 이어받기, 학급 정리', () => {
  const src = readText('부서\t직위\t성명\t담임\t담당 업무\n교무부\t부장\t김민지\t6학년 1반\t교육과정, 학적\n\t교사\t이서준\t5-1\t방과후\n연구부\t부장\t박지우\t\t수업 공개\n합계\t\t\t\t');
  const r = parseRoster(src);
  assert.equal(r.length, 3);
  assert.equal(r[1].dept, '교무부');
  assert.equal(r[0].homeroom, '6-1');
  assert.equal(r[2].duties, '수업 공개');
  assert.equal(normClass('3학년 2반'), '3-2');
});
