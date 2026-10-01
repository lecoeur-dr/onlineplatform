import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNeis, scheduleToEvents, searchSchools, getMeals, NeisError } from '../src/neis.js';

const ok = (service, row) => ({ [service]: [{ head: [{ list_total_count: row.length }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다.' } }] }, { row }] });
const fakeFetch = (body) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

test('나이스 응답 해석: 정상 · 데이터 없음 · 오류', () => {
  assert.equal(parseNeis('X', ok('X', [{ a: 1 }])).rows.length, 1);
  assert.deepEqual(parseNeis('X', { RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }).rows, []);
  assert.throws(() => parseNeis('X', { RESULT: { CODE: 'ERROR-290', MESSAGE: '인증키가 유효하지 않습니다.' } }), /인증키/);
});

test('학사일정 변환: 토요휴업일 제외 · 휴업일 분류 · 학년 · 연속 일정 묶기', () => {
  const rows = [
    { AA_YMD: '20261003', EVENT_NM: '개천절', SBTR_DD_SC_NM: '공휴일', ONE_GRADE_EVENT_YN: 'Y', TW_GRADE_EVENT_YN: 'Y', THREE_GRADE_EVENT_YN: 'Y', FR_GRADE_EVENT_YN: 'Y', FIV_GRADE_EVENT_YN: 'Y', SIX_GRADE_EVENT_YN: 'Y' },
    { AA_YMD: '20261010', EVENT_NM: '토요휴업일', SBTR_DD_SC_NM: '휴업일' },
    { AA_YMD: '20261015', EVENT_NM: '현장체험학습', SBTR_DD_SC_NM: '해당없음', FIV_GRADE_EVENT_YN: 'Y', SIX_GRADE_EVENT_YN: 'Y' },
    { AA_YMD: '20260721', EVENT_NM: '여름방학', SBTR_DD_SC_NM: '휴업일' },
    { AA_YMD: '20260722', EVENT_NM: '여름방학', SBTR_DD_SC_NM: '휴업일' },
    { AA_YMD: '20260727', EVENT_NM: '여름방학', SBTR_DD_SC_NM: '휴업일' },
    { AA_YMD: '20260720', EVENT_NM: '방학식', SBTR_DD_SC_NM: '해당없음' },
  ];
  const ev = scheduleToEvents(rows);
  assert.ok(!ev.some((e) => e.title === '토요휴업일'));
  assert.equal(ev.find((e) => e.title === '개천절').category, '휴일·방학');
  assert.equal(ev.find((e) => e.title === '개천절').target, '');
  assert.equal(ev.find((e) => e.title === '현장체험학습').target, '5,6학년');
  const vac = ev.filter((e) => e.title === '여름방학');
  assert.equal(vac.length, 1);
  assert.equal(vac[0].date, '2026-07-21');
  assert.equal(vac[0].endDate, '2026-07-27');
  assert.notEqual(ev.find((e) => e.title === '방학식').category, '휴일·방학');
  assert.ok(ev.every((e) => e.source === '나이스'));
});

test('인증키 없으면 안내 오류', async () => {
  await assert.rejects(() => searchSchools({}, '서부초'), (e) => e instanceof NeisError && /NEIS_API_KEY/.test(e.message));
});

test('학교 검색 · 급식 정리', async () => {
  const env = { NEIS_API_KEY: 'k' };
  const schools = await searchSchools(env, '서부초', fakeFetch(ok('schoolInfo', [{ ATPT_OFCDC_SC_CODE: 'K10', SD_SCHUL_CODE: '7801234', SCHUL_NM: '서부초등학교', ATPT_OFCDC_SC_NM: '강원특별자치도교육청', ORG_RDNMA: '강원 삼척시' }])));
  assert.equal(schools[0].code, '7801234');
  const meals = await getMeals(env, { atpt: 'K10', code: '7801234' }, '2026-10-01', '2026-10-01', fakeFetch(ok('mealServiceDietInfo', [{ MLSV_YMD: '20261001', MMEAL_SC_NM: '중식', DDISH_NM: '현미밥<br/>된장국 (5.6.13.)<br/>제육볶음*(10.13.)', CAL_INFO: '650.2 Kcal' }])));
  assert.deepEqual(meals['2026-10-01'][0].dishes, ['현미밥', '된장국', '제육볶음']);
});
