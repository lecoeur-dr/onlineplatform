// 🧩 분석적 루브릭(평가 관점 × 수준) · 학생 평가 카드 · AI 브리지(Claude 프로젝트·스킬, 제미나이 젬스 등과 주고받기)
//   벤치마킹: 채움AI(교사 루브릭 → AI 초검 → 교사 확정), Snorkl(잘한 점·보완점·다음 단계 피드백),
//            Classendo(즉석 평가 → 특기사항), 학급다이어리2(평가 통계·검색)
//   원칙: 학생 이름은 AI로 보내지 않음(S01 번호), 근거에 없는 내용은 쓰지 않음, 최종 확정은 교사
import { h, clear, toast, modal, download } from '../ui.js';
import { scaleOf } from '../modules.js';
import { copyText, byteLen } from './desk-common.js';
import { suggestCriteria, criterionRubric, DEFAULT_CHIPS, overallLevel, composeRemark, parseAiRubric, parseAiRemarks } from '../eval-text.js';

const LV_COLORS = ['#30a46c', '#0091ff', '#f5a524', '#e5484d', '#8e4ec6'];
const lvColorAt = (n, i) => (i < 0 ? 'var(--line)' : n <= 2 ? LV_COLORS[i === 0 ? 0 : 3] : LV_COLORS[i] || LV_COLORS[4]);
const csv = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
export const chipsOf = (plan) => ({ good: plan.data.chips?.good?.length ? plan.data.chips.good : DEFAULT_CHIPS.good, need: plan.data.chips?.need?.length ? plan.data.chips.need : DEFAULT_CHIPS.need });
export const hasCriteria = (plan) => (plan.data.criteria || []).length > 0;

// ---------- 🧩 평가 관점 편집 ----------

function rubricPrompt(plan, levels) {
  const d = plan.data;
  return `# 분석적 루브릭(채점 기준표) 만들기 요청
초등학교 ${d.grade || ''} ${d.subject} 평가입니다. 아래 정보로 "평가 관점 2~4개 × 수준 ${levels.length}개" 분석적 루브릭을 만들어 주세요.

- 성취기준: ${d.standard || '(없음)'}
- 평가 요소: ${d.element || ''}
- 평가 방법: ${d.method || ''}
- 단원: ${d.unit || ''}
- 수준(높은 순): ${levels.join(', ')}

작성 원칙
1. 관점은 서로 겹치지 않게, 관찰 가능한 행동으로 씁니다.
2. 수준별 기준은 같은 관점 안에서 차이가 분명하게, "~할 수 있다/~한다" 문장으로 씁니다.
3. 가장 낮은 수준도 부정어 대신 "도움을 받아 ~한다"처럼 씁니다.
4. good: 학생 강점 관찰 문구 5개(문장 끝 "~함"), need: 보완점 명사구 4개("~하는 연습" 형태).

아래 JSON 형식으로만 답해 주세요.
{"criteria":[{"name":"관점 이름","levels":{${levels.map((l) => `"${l}":"기준 문장"`).join(',')}}}],"good":["…함"],"need":["…하는 연습"]}`;
}

export function editCriteria(plan, onSave) {
  const levels = scaleOf(plan);
  let crits = JSON.parse(JSON.stringify(plan.data.criteria || []));
  const chips = chipsOf(plan);
  const good = h('textarea', { rows: 2, value: chips.good.join(', ') });
  const need = h('textarea', { rows: 2, value: chips.need.join(', ') });
  const box = h('div', {});
  const draw = () => clear(box, crits.length ? crits.map((c, ci) => h('div', { class: 'card crit-card' },
    h('div', { class: 'card-head' }, h('input', { value: c.name, placeholder: '관점 이름 (예: 원리 설명)', class: 'grow', oninput: (e) => { c.name = e.target.value; } }),
      h('button', { class: 'icon-btn', title: '관점 삭제', onclick: () => { crits.splice(ci, 1); draw(); } }, '✕')),
    levels.map((lv, i) => h('div', { class: 'crit-lv' }, h('span', { class: 'tag', style: { '--c': lvColorAt(levels.length, i) } }, lv),
      h('textarea', { rows: 2, value: c.rubric?.[lv] || '', placeholder: criterionRubric(c.name || '이 관점', levels)[lv], oninput: (e) => { (c.rubric ||= {})[lv] = e.target.value; } })))))
    : h('p', { class: 'muted' }, '아직 평가 관점이 없습니다. [방법에 맞게 관점 제안]을 누르거나 직접 추가하세요. 관점이 없으면 지금처럼 종합 수준 하나로만 평가합니다.'));
  draw();
  const aiOut = h('textarea', { rows: 4, placeholder: 'AI가 준 JSON 답을 여기에 붙여넣기' });
  modal(`🧩 평가 관점(분석적 루브릭) · ${plan.data.subject} ${plan.data.unit || plan.data.element || ''}`, h('div', { class: 'form' },
    h('p', { class: 'muted small' }, '한 평가를 2~4개 관점(예: 원리 설명 · 실험 수행 · 결과 정리)으로 나눠 관점마다 수준을 줍니다. 같은 "잘함"이어도 관점 조합과 근거가 학생마다 달라서 교과발달상황 문장이 학생별로 달라집니다.'),
    plan.data.standard ? h('p', { class: 'small pre' }, plan.data.standard) : null,
    box,
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { crits.push({ name: '', rubric: {} }); draw(); } }, '+ 관점 추가'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { const have = new Set(crits.map((c) => c.name)); for (const n of suggestCriteria(plan.data.method)) if (!have.has(n)) crits.push({ name: n, rubric: {} }); draw(); } }, `방법(${plan.data.method || '기본'})에 맞게 관점 제안`),
      h('button', { type: 'button', class: 'btn small', onclick: () => { for (const c of crits) { const auto = criterionRubric(c.name || '이 관점', levels); c.rubric ||= {}; for (const lv of levels) if (!c.rubric[lv]) c.rubric[lv] = auto[lv]; } draw(); } }, '빈 칸 기본 문장')),
    h('details', { class: 'card ai-box' }, h('summary', {}, '🤖 AI로 루브릭 만들기 (Claude 프로젝트·스킬, 제미나이 젬스 등)'),
      h('ol', { class: 'small' }, h('li', {}, '[요청문 복사] → 쓰시는 AI에 붙여넣기'), h('li', {}, 'AI가 준 JSON 답을 아래에 붙여넣고 [적용]'), h('li', {}, '내용을 확인·수정한 뒤 저장')),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn small primary', onclick: () => copyText(rubricPrompt(plan, levels)) }, '📋 요청문 복사')),
      aiOut, h('button', { type: 'button', class: 'btn small', onclick: () => {
        const r = parseAiRubric(aiOut.value, levels);
        if (!r) { toast('JSON 형식의 답을 찾지 못했습니다. 요청문 그대로 다시 요청해 보세요.', 'error'); return; }
        crits = r.criteria; if (r.good.length) good.value = r.good.join(', '); if (r.need.length) need.value = r.need.join(', ');
        draw(); toast(`관점 ${crits.length}개를 넣었습니다. 확인 후 저장하세요.`);
      } }, '적용')),
    h('div', { class: 'row' }, h('label', {}, '강점 칩 (문장형, 쉼표)'), good),
    h('div', { class: 'row' }, h('label', {}, '보완 칩 (명사형, 쉼표)'), need),
    h('p', { class: 'hint' }, '강점 칩은 "~함"으로 끝나는 짧은 관찰 문장, 보완 칩은 "~하는 연습"처럼 씁니다. 기록할 때 눌러서 학생별 근거로 남깁니다.')), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const clean = crits.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), rubric: Object.fromEntries(levels.map((lv) => [lv, (c.rubric?.[lv] || '').trim()]).filter(([, v]) => v)) }));
      await onSave({ criteria: clean, chips: { good: csv(good.value), need: csv(need.value) } }); close();
    } }, '저장'),
  ], { wide: true });
}

// ---------- 🧒 학생 평가 카드: 관점별 수준 + 강점/보완 칩 + 산출물 근거 + 메모 → 문장 미리보기 ----------

export function studentCard(plan, name, sc, onChange) {
  const levels = scaleOf(plan);
  const crits = plan.data.criteria || [];
  const chips = chipsOf(plan);
  sc.crit ||= {}; sc.good ||= []; sc.need ||= [];
  const preview = h('div', { class: 'card preview' });
  const overallBox = h('div', {});
  const paintPreview = () => {
    const t = composeRemark({ ...plan.data, levels }, sc, name);
    clear(preview, h('div', { class: 'muted small' }, '교과발달 문장 미리보기 (기록한 내용만 사용)'), h('div', {}, t || '—'), t ? h('div', { class: 'muted small' }, `${[...t].length}자 · ${byteLen(t)}바이트`) : null);
  };
  const paintOverall = () => clear(overallBox, h('div', { class: 'crit-row' }, h('strong', {}, '종합 수준'),
    h('div', { class: 'seg' }, levels.map((lv, i) => h('button', { type: 'button', class: sc.level === lv ? 'on' : '', style: sc.level === lv ? { color: lvColorAt(levels.length, i) } : {}, onclick: () => { sc.level = lv; sc.manual = true; changed(); } }, lv))),
    sc.manual ? h('button', { type: 'button', class: 'link-btn small', onclick: () => { sc.manual = false; sc.level = overallLevel(levels, sc.crit) || sc.level; changed(); } }, '자동으로') : h('span', { class: 'muted small' }, crits.length ? '관점 수준으로 자동 계산' : '')));
  const changed = () => { if (!sc.manual && crits.length) sc.level = overallLevel(levels, sc.crit) || sc.level; paintOverall(); paintPreview(); drawCrits(); onChange(); };
  const critBox = h('div', {});
  const drawCrits = () => clear(critBox, crits.map((c) => h('div', { class: 'crit-row' }, h('strong', {}, c.name),
    h('div', { class: 'seg' }, levels.map((lv, i) => h('button', { type: 'button', class: sc.crit[c.name] === lv ? 'on' : '', title: c.rubric?.[lv] || '', style: sc.crit[c.name] === lv ? { color: lvColorAt(levels.length, i) } : {}, onclick: () => { sc.crit[c.name] = sc.crit[c.name] === lv ? undefined : lv; if (!sc.crit[c.name]) delete sc.crit[c.name]; changed(); } }, lv))),
    sc.crit[c.name] && c.rubric?.[sc.crit[c.name]] ? h('div', { class: 'muted small' }, c.rubric[sc.crit[c.name]]) : null)));
  const chipRow = (list, key, cls) => h('div', { class: 'ev-chips' }, list.map((t) => {
    const b = h('button', { type: 'button', class: `chip-btn ${cls} ${sc[key].includes(t) ? 'on' : ''}`, onclick: () => { sc[key] = sc[key].includes(t) ? sc[key].filter((x) => x !== t) : [...sc[key], t]; b.classList.toggle('on'); paintPreview(); onChange(); } }, t);
    return b;
  }));
  const ev = h('input', { value: sc.evidence || '', placeholder: '이 학생만의 산출물·답안 내용 한 줄 (예: 자석으로 철가루를 분리하는 방법을 제안함)', oninput: (e) => { sc.evidence = e.target.value; paintPreview(); onChange(); } });
  const note = h('input', { value: sc.note || '', placeholder: '관찰 메모', oninput: (e) => { sc.note = e.target.value; paintPreview(); onChange(); } });
  drawCrits(); paintOverall(); paintPreview();
  modal(`🧒 ${name} · ${plan.data.subject} ${plan.data.unit || plan.data.element || ''}`, h('div', { class: 'form student-card' },
    crits.length ? critBox : h('p', { class: 'muted small' }, '평가 관점이 없어 종합 수준만 기록합니다. [🧩 평가 관점]에서 관점을 만들면 관점별로 기록할 수 있습니다.'),
    overallBox,
    h('div', { class: 'row' }, h('label', {}, '👍 강점'), chipRow(chips.good, 'good', 'good')),
    h('div', { class: 'row' }, h('label', {}, '🌱 보완'), chipRow(chips.need, 'need', 'need')),
    h('div', { class: 'row' }, h('label', {}, '📎 산출물 근거'), ev),
    h('div', { class: 'row' }, h('label', {}, '📝 메모'), note),
    preview), [(close) => h('button', { class: 'btn primary', onclick: close }, '완료 (자동 저장)')], { wide: true });
}

// ---------- 🤖 AI 브리지: 교과발달상황 ----------

export function remarkRequest({ subject, plans, students, limit, mode = 'subject' }) {
  const lines = [];
  lines.push(`# 교과학습발달상황 작성 요청 (${subject})`, '',
    '## 작성 원칙',
    '- 아래 "학생별 근거"에 있는 내용만 사용합니다. 근거에 없는 활동·성취·성격은 절대 지어내지 않습니다.',
    '- 같은 수준이어도 관점별 수준·강점·보완·산출물 근거가 다르면 문장 구성과 표현을 다르게 씁니다. 학생끼리 같은 문장을 반복하지 않습니다.',
    '- 생활기록부 문체(~함, ~임, ~음)로 쓰고, 학생 이름·번호·"학생은" 같은 주어는 쓰지 않습니다.',
    '- 보완점은 부정적으로 쓰지 않고 성장 가능성 중심으로 씁니다.',
    `- 학생당 ${limit}바이트(한글 약 ${Math.floor(limit / 3)}자) 이내, 한 문단.`,
    '- 출력은 한 줄에 한 학생, `S01 | 문장` 형식으로만 씁니다. 다른 설명은 쓰지 않습니다.', '',
    '## 평가 정보');
  for (const p of plans) {
    const lv = scaleOf(p);
    lines.push(`### ${p.data.unit || p.data.element || p.data.subject} (${p.data.timing || ''} · ${p.data.method || ''})`,
      `- 성취기준: ${(p.data.standard || '').replace(/\n/g, ' / ')}`, `- 평가 요소: ${p.data.element || ''}`, `- 수준: ${lv.join(' > ')}`);
    for (const c of p.data.criteria || []) lines.push(`- 관점 「${c.name}」: ${lv.map((l) => `${l}=${c.rubric?.[l] || ''}`).join(' / ')}`);
    if (!(p.data.criteria || []).length) lines.push(`- 수준별 기준: ${lv.map((l) => `${l}=${p.data.rubric?.[l] || ''}`).join(' / ')}`);
  }
  lines.push('', '## 학생별 근거 (S번호는 익명 번호)');
  students.forEach((s, i) => {
    const id = `S${String(i + 1).padStart(2, '0')}`;
    const ev = plans.map((p) => {
      const sc = p.data.scores?.[s.data.name];
      if (!sc?.level && !Object.keys(sc?.crit || {}).length) return '';
      const crit = Object.entries(sc.crit || {}).map(([k, v]) => `${k}=${v}`).join(', ');
      return `[${p.data.unit || p.data.element}] 종합=${sc.level || '-'}${crit ? ` · 관점: ${crit}` : ''}${sc.good?.length ? ` · 강점: ${sc.good.join(', ')}` : ''}${sc.need?.length ? ` · 보완: ${sc.need.join(', ')}` : ''}${sc.evidence ? ` · 산출물: ${sc.evidence}` : ''}${sc.note ? ` · 메모: ${sc.note}` : ''}`;
    }).filter(Boolean);
    lines.push(`${id} | ${ev.length ? ev.join(' ‖ ') : '(평가 기록 없음 → "기록 없음"이라고만 쓰기)'}`);
  });
  return lines.join('\n');
}

export function importAiRemarks(students, apply) {
  const ta = h('textarea', { rows: 10, placeholder: 'AI 답을 그대로 붙여넣기\nS01 | …함.\nS02 | …임.' });
  const over = h('input', { type: 'checkbox' });
  const out = h('div', {});
  let map = new Map();
  const check = () => {
    map = parseAiRemarks(ta.value);
    clear(out, map.size ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('tbody', {}, students.map((s, i) => {
      const t = map.get(`S${String(i + 1).padStart(2, '0')}`) || map.get(`S${i + 1}`);
      return h('tr', {}, h('td', { class: 'num' }, `S${String(i + 1).padStart(2, '0')}`), h('td', {}, h('strong', {}, s.data.name)), h('td', { class: t ? '' : 'muted' }, t || '(없음)'), h('td', { class: 'muted small' }, t ? `${byteLen(t)}B` : ''));
    })))) : h('p', { class: 'alert warn' }, '"S01 | 문장" 형식의 줄을 찾지 못했습니다.'));
  };
  ta.addEventListener('input', check);
  modal('📥 AI 결과 붙여넣기', h('div', { class: 'form' },
    h('p', { class: 'muted small' }, 'S번호로 학생을 찾아 칸을 채웁니다. 학생 이름은 이 화면에서만 다시 붙습니다. 꼭 읽고 다듬은 뒤 확정하세요.'),
    ta, h('label', { class: 'inline' }, over, ' 이미 쓴 칸도 바꾸기'), out), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: () => {
      check(); if (!map.size) return;
      const n = apply((i) => map.get(`S${String(i + 1).padStart(2, '0')}`) || map.get(`S${i + 1}`), over.checked);
      toast(`${n}명의 칸을 채웠습니다.`); close();
    } }, '칸 채우기'),
  ], { wide: true });
}

// Claude 프로젝트 지침 · 스킬(SKILL.md) · 젬스 지침으로 그대로 쓰는 파일
export function downloadGuide(limit = 1500) {
  const md = `---
name: gyogwa-baldal-writer
description: OnlinePlatform에서 내보낸 "교과학습발달상황 작성 요청"(S01 | 근거 형식)을 받아 학생별 교과학습발달상황 문장을 생활기록부 문체로 작성한다. 요청문에 "교과학습발달상황 작성 요청"이 있으면 사용.
---

# 교과학습발달상황 작성 지침 (OnlinePlatform)

이 지침은 Claude 프로젝트 지침, Claude 스킬(SKILL.md), 제미나이 젬스 지침에 그대로 붙여 쓸 수 있습니다.

## 입력
OnlinePlatform의 [🤖 AI 요청문 복사]로 만든 글: 평가 정보(성취기준·평가 요소·관점별 수준 기준) + 학생별 근거(S01 | …).
학생 이름은 들어 있지 않습니다. S번호는 익명 번호입니다.

## 작성 원칙
1. **근거 안에서만 씁니다.** 학생별 근거(종합 수준, 관점별 수준, 강점, 보완, 산출물, 메모)와 평가 정보에 없는 활동·성취·성격·태도를 지어내지 않습니다.
2. **학생마다 다르게 씁니다.** 수준이 같아도 관점 조합·강점·산출물이 다르면 문장 구성, 첫 문장, 어휘를 다르게 합니다. 같은 문장을 여러 학생에게 반복하지 않습니다.
3. **구성:** (단원·활동 맥락) → 가장 높은 관점의 성취 → 강점·산출물 근거 → 보완점을 성장 가능성으로.
4. **문체:** 생활기록부 문체(~함, ~임, ~음). 주어(학생은, 이 학생은)와 이름·번호를 쓰지 않습니다.
5. **보완점:** "부족함", "못함" 대신 "~하면 더욱 성장할 것으로 기대됨"처럼 씁니다.
6. **분량:** 학생당 ${limit}바이트(한글 약 ${Math.floor(limit / 3)}자) 이내, 한 문단.
7. **근거가 없으면** 그 학생은 "기록 없음"이라고만 씁니다.

## 출력 형식
한 줄에 한 학생, 다른 설명 없이:
\`\`\`
S01 | 문장…함.
S02 | 문장…음.
\`\`\`
→ OnlinePlatform [📥 AI 결과 붙여넣기]에 그대로 붙여넣으면 학생 칸이 채워집니다.

## 점검
- 근거에 없는 낱말(대회, 수상, 리더십 등)이 들어갔는지 확인
- 학생 간 첫 문장이 겹치는지 확인
- 바이트 수 확인
`;
  download('교과발달상황_AI지침_SKILL.md', md, 'text/markdown');
}
