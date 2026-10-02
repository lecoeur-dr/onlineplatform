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

test('평가 계획: 머리글 표·코드 분리·교과 이어받기', async () => {
  const { parseEvalPlans } = await import('../public/js/smart-import.js');
  const r = parseEvalPlans(readText('교과\t영역\t성취기준\t평가 요소\t평가 방법\t시기\n국어\t읽기\t[6국02-01] 읽기는 배경지식을 활용하여 의미를 구성하는 과정임을 이해하고 글을 읽는다.\t배경지식 활용하여 읽기\t서술형\t4월\n\t쓰기\t[6국03-02] 목적이나 주제에 따라 알맞은 내용과 매체를 선정하여 글을 쓴다.\t알맞은 내용 선정\t논술형\t5월'));
  assert.equal(r.length, 2);
  assert.equal(r[0].code, '[6국02-01]');
  assert.equal(r[1].subject, '국어');
  assert.equal(r[0].standard, '[6국02-01] 읽기는 배경지식을 활용하여 의미를 구성하는 과정임을 이해하고 글을 읽는다.');
  const r2 = parseEvalPlans(readText('수학 | 분수의 나눗셈 | [6수01-01] 분수의 나눗셈을 할 수 있다. | 3월 | 서술형'));
  assert.equal(r2[0].subject, '수학');
  assert.equal(r2[0].method, '서술형');
});

test('평가계획서 양식: 제목·학년·학기, 4줄 성취수준 묶음, 여러 성취기준, 병합 칸', async () => {
  const { parseEvalPlans, parseStandards } = await import('../public/js/smart-import.js');
  // 학교 양식과 같은 구조의 가상 예시 (병합 칸은 readHwpx처럼 같은 값으로 채워짐)
  const T = '가상과 교수학습 및 평가 운영계획';
  const blk = (time, unit, el, area, how, std, lv) => lv.map(([n, d]) => [time, unit, el, area, how, std, std, n, d]);
  const table = [
    Array(9).fill(T),
    [...Array(6).fill('2026학년도 2학기'), '5학년', '5학년', '5학년'],
    ['시기', '단원명(교수학습 내용)', '평가 요소', '평가 영역', '평가 방법', '성취기준', '성취기준', '성취수준', '성취수준'],
    ...blk('9월 3주', '1. 첫 단원\n\n▪ 활동을 하고 정리함.', '요소 하나', '영역가', '보고서', '[6가01-01] 첫째 기준이다.', [['매우 잘함', '가장 높은 기준'], ['잘함', '높은 기준'], ['보통', '중간 기준'], ['노력 요함', '낮은 기준']]),
    ...blk('12~14차시', '2. 둘째 단원', '요소 둘', '영역나', '실기·실습 평가', '[6가02-01] 둘째 기준.\n[6가02-02] 셋째 기준.', [['상', 'A'], ['중', 'B'], ['하', 'C']]),
    Array(9).fill('▶ 2학기 가상 총 횟수: 2회'),
  ];
  const r = parseEvalPlans({ tables: [table], lines: [] });
  assert.equal(r.length, 2);
  assert.equal(r[0].subject, '가상');
  assert.equal(r[0].grade, '5학년');
  assert.equal(r[0].semester, '2학기');
  assert.equal(r[0].unit, '1. 첫 단원');
  assert.equal(r[0].content, '활동을 하고 정리함.');
  assert.deepEqual(r[0].levels, ['매우 잘함', '잘함', '보통', '노력 요함']);
  assert.equal(r[0].rubric['보통'], '중간 기준');
  assert.equal(r[1].code, '[6가02-01] [6가02-02]');
  assert.deepEqual(r[1].levels, ['상', '중', '하']);
  assert.equal(r[1].timing, '12~14차시');
  const g = parseStandards({ tables: [], lines: ['(1) 물질', '[6과05-01] 가나다를 할 수 있다.', '(2) 지구와 우주', '[6과06-01] 라마바를 한다.', '[4국01-01] 사아자.'] });
  assert.deepEqual(g.map((x) => [x.subject, x.band, x.items.length]), [['과학', '5~6학년', 2], ['국어', '3~4학년', 1]]);
  assert.equal(g[0].items[1].area, '지구와 우주');
});

test('평가 문장: 평가 요소 명사형, 생활기록부 문체, 시기 정렬', async () => {
  const { elementFrom, toRecordStyle, timingKey, autoRubric } = await import('../public/js/eval-text.js');
  assert.equal(elementFrom('고체 혼합물을 분리할 수 있다.'), '고체 혼합물을 분리하기');
  assert.equal(elementFrom('시민의식을 기른다.'), '시민의식을 기르기');
  assert.equal(toRecordStyle('소감을 나눈다. 설명할 수 있다. 의미를 이해한다.'), '소감을 나눔. 설명할 수 있음. 의미를 이해함.');
  assert.ok(timingKey('9월 3주') < timingKey('12월 1주') && timingKey('12월 1주') < timingKey('2월 1주'));
  assert.equal(Object.keys(autoRubric('요소', ['상', '중', '하'])).length, 3);
});

test('분석적 루브릭: 같은 수준이라도 관점·근거에 따라 다른 문장, AI 결과 읽기', async () => {
  const { composeRemark, overallLevel, parseAiRemarks, parseAiRubric, suggestCriteria } = await import('../public/js/eval-text.js');
  const L = ['매우 잘함', '잘함', '보통', '노력 요함'];
  const d = { unit: '1. 가상 단원', levels: L, criteria: [{ name: '원리 설명', rubric: { '매우 잘함': '원리를 근거를 들어 설명할 수 있다.' } }, { name: '실험 수행', rubric: { '매우 잘함': '실험을 능숙하게 수행한다.' } }] };
  const a = composeRemark(d, { level: '잘함', crit: { '원리 설명': '매우 잘함', '실험 수행': '보통' }, evidence: '새 방법을 제안함' }, '가');
  const b = composeRemark(d, { level: '잘함', crit: { '원리 설명': '보통', '실험 수행': '매우 잘함' } }, '나');
  assert.notEqual(a, b);
  assert.ok(a.includes('설명할 수 있음.') && a.includes('새 방법을 제안함.'));
  assert.ok(b.includes('능숙하게 수행함.'));
  assert.ok(!/대회|수상/.test(a + b));
  assert.equal(overallLevel(L, { x: '매우 잘함', y: '보통' }), '잘함');
  assert.deepEqual([...parseAiRemarks('S01 | 가함.\n- S02: 나임.\n설명 줄')], [['S01', '가함.'], ['S02', '나임.']]);
  assert.equal(parseAiRemarks('[{"id":"S03","text":"다음."}]').get('S03'), '다음.');
  const r = parseAiRubric('```json\n{"criteria":[{"name":"관점","levels":{"매우 잘함":"가","잘함":"나"}}],"good":["g"],"need":["n"]}\n```', ['매우 잘함', '잘함']);
  assert.equal(r.criteria[0].rubric['잘함'], '나');
  assert.equal(suggestCriteria('실험 보고서')[0], '탐구 계획과 수행');
});

test('평가 도구: AI 채점 결과·시험문제 읽기, 평가계획 점검', async () => {
  const { parseAiScores, parseAiExam, checkPlan } = await import('../public/js/eval-text.js');
  const L = ['매우 잘함', '잘함', '보통', '노력 요함'];
  const r = parseAiScores('S01 | 원리=매우 잘함; 수행=보통 | 근거: 근거함 | 피드백: 좋아요\n잡담\nS02 | 종합=보 통', L, ['원리', '수행']);
  assert.deepEqual(r.get('S01').crit, { 원리: '매우 잘함', 수행: '보통' });
  assert.equal(r.get('S01').level, '잘함');
  assert.equal(r.get('S01').evidence, '근거함');
  assert.equal(r.get('S02').level, '보통');
  const ex = parseAiExam('답: {"items":[{"q":"문제","choices":["가","나"],"answer":"1"},{"q":""}]}');
  assert.equal(ex.length, 1);
  assert.equal(ex[0].type, '객관식');
  const ok = checkPlan({ standard: '[6과05-01] 가', element: '요소', method: '보고서', timing: '9월', unit: '1. 단원', semester: '2학기', criteria: [{ name: 'A', rubric: { 상: 'x', 중: 'y', 하: 'z' } }] }, { levels: ['상', '중', '하'] });
  assert.equal(ok.length, 0);
  const bad = checkPlan({ standard: '[4과01-01] 가', element: '요소', method: '보고서', timing: '9월', unit: 'u', semester: '1학기', rubric: { 상: 'a', 중: 'a' } }, { levels: ['상', '중', '하'], classGrade: '6학년', bandOf: (g) => (g.startsWith('6') ? '5~6학년' : ''), bandOfCode: () => '3~4학년' });
  assert.ok(bad.some((x) => x.msg.includes('학년군')));
  assert.ok(bad.some((x) => x.msg.includes('빈 칸')));
});

test('예산: 학교본예산·공모사업 편성 대비 날짜별 집행, 비목별 사용률', async () => {
  globalThis.document ||= undefined;
  const { buildMoney } = await import('../public/js/views/money.js').catch(() => ({}));
  if (!buildMoney) return; // 화면 모듈을 node에서 못 읽는 환경이면 건너뜀
  const r = (data, id = Math.random().toString(36)) => ({ id, data });
  const d = {
    budget: [r({ source: '학교본예산', program: '기초학력', category: '일반수용비', amount: 1000 }), r({ program: '기초학력', category: '강사수당', amount: 2000 }), r({ source: '공모사업', program: 'AI 선도', category: '일반수용비', amount: 500 })],
    contests: [r({ name: 'AI 선도', budget: 800 }), r({ name: '생태 공모', budget: 300 })],
    spending: [r({ date: '2026-04-01', source: '학교본예산', program: '기초학력', category: '일반수용비', amount: 400 }), r({ date: '2026-05-01', source: '공모사업', program: 'AI 선도', category: '일반수용비', amount: 100, purchaseId: 'p1' })],
    purchases: [r({ budget: '기초학력', price: 10, qty: 3 }, 'p0'), r({ budget: 'AI 선도', price: 50, qty: 2 }, 'p1')],
  };
  const m = buildMoney(d);
  const school = m.byKind('학교본예산');
  assert.equal(school.length, 1);
  assert.equal(school[0].assigned, 3000);
  assert.equal(school[0].used, 400);
  assert.equal(school[0].pending, 30);
  const ai = m.programs.get('공모사업|AI 선도');
  assert.equal(ai.assigned, 800); // 편성 500 + 미배분 300
  assert.equal(ai.cats.get('(미배분)').assigned, 300);
  assert.equal(ai.pending, 0); // 집행 등록된 물품은 대기에서 빠짐
  assert.equal(m.programs.get('공모사업|생태 공모').cats.get('(비목 미지정)').assigned, 300);
  const cats = m.catsOf([...m.programs.values()]);
  assert.equal(cats.find((c) => c.name === '일반수용비').used, 500);
});
