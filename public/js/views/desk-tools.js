// 🧰 평가 도구 · 학생 참여(링크 제출)
//   벤치마킹: 선생님의 책상(tdesk) 평가 도구 — 평가계획 점검 · 시험문제 생성 · 서·논술형 평가(학생 링크 제출 → 채점 기준대로 초안 채점 → 세특 재료) · 루브릭 만들기,
//            수업 — 클래스 보드(학생 글이 실시간으로 모이는 게시판)
//   AI는 복사·붙여넣기 브리지(학생 이름 대신 S01 번호), 최종 확정은 교사
import { h, api, apiCtx, clear, toast, modal, download } from '../ui.js';
import { state, remember } from '../state.js';
import { scaleOf, bandOf, DEFAULT_LISTS } from '../modules.js';
import { openRecordForm } from '../form.js';
import { bandOfCode } from '../smart-import.js';
import { loadStudents, emptyStudents, copyText } from './desk-common.js';
import { checkPlan, parseAiScores, parseAiExam, overallLevel } from '../eval-text.js';
import { editCriteria, studentCard, hasCriteria } from './desk-rubric.js';

const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');
const go = (q) => { location.hash = `#/desk/eval/tools${q ? `?${q}` : ''}`; };
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadClass = async () => (await api(`/api/records/myClass?year=${state.year}`))[0] || null;
const studentLink = (a) => `${location.origin}/student#t=${a.data.token || ''}`;

async function qrSvg(text) {
  if (!window.qrcode) await new Promise((r) => { const s = document.createElement('script'); s.src = '/vendor/qrcode.js'; s.onload = r; s.onerror = r; document.head.append(s); });
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
function linkBox(a) {
  const qr = h('div', { class: 'link-qr' });
  const url = studentLink(a);
  if (apiDemo()) clear(qr, h('p', { class: 'muted small' }, '체험 모드에서는 학생 링크가 열리지 않습니다.'));
  else qrSvg(url).then((svg) => { qr.innerHTML = svg; });
  return h('div', { class: 'link-box' }, qr, h('div', { class: 'grow' },
    h('div', { class: 'muted small' }, '학생 링크 (로그인 없이 열림 · 번호·이름을 적고 제출)'),
    h('code', { class: 'link-url' }, url),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn small', onclick: () => copyText(url) }, '링크 복사'),
      h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener' }, '학생 화면 열기'),
      h('button', { class: 'btn small', onclick: () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(a.data.title)}</title><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>${esc(a.data.title)}</h1><div style="width:60vmin;margin:auto">${qr.innerHTML}</div><p style="font-size:20px">휴대폰 카메라로 비춰 보세요</p></body>`); w.document.close(); } }, '⛶ QR 크게'))));
}
const apiDemo = () => !!apiCtx.mock;

// ---------- 평가 도구 모음 ----------

const TOOLS = [
  ['check', '📋', '평가계획 점검', '빠진 칸·수준별 기준·학년군·관점까지 계획을 한 번에 점검하고 바로 고쳐요', '#ea580c'],
  ['essay', '✍️', '서·논술형 평가', '학생은 링크로 답안 제출 → 채점 기준대로 AI 초안 채점 → 평가 기록·세특 재료까지 이어져요', '#0f9d6e'],
  ['exam', '📝', '시험문제 만들기', '단원 내용을 붙여넣으면 AI가 상·중·하 문항과 정답·해설을 — 시험지로 인쇄·한글 복사', '#2563eb'],
  ['rubric', '🧩', '루브릭 만들기', '평가 계획마다 관점 × 수준 채점 기준표를 만들고, AI 초안도 받아요', '#7c3aed'],
];

export async function evalToolsView(root) {
  const t = qs().get('t');
  if (t === 'check') return planCheck(root);
  if (t === 'essay') return essayView(root, qs().get('id'));
  if (t === 'exam') return examMaker(root);
  if (t === 'rubric') return rubricPick(root);
  clear(root,
    h('div', { class: 'tool-list' }, TOOLS.map(([id, ic, name, desc, color]) => h('button', { class: 'tool-row', onclick: () => go(`t=${id}`) },
      h('span', { class: 'tool-row-ico', style: { background: color } }, ic), h('span', { class: 'grow' }, h('strong', {}, name), h('div', { class: 'muted small' }, desc)), h('span', { class: 'muted' }, '›')))),
    h('p', { class: 'hint' }, 'AI가 필요한 도구는 쓰시는 생성형 AI(Claude 프로젝트·스킬, 제미나이 젬스 등)와 [요청문 복사 → 결과 붙여넣기]로 주고받습니다. 학생 이름은 보내지 않습니다.'));
}
const back = () => h('button', { class: 'btn', onclick: () => go('') }, '← 평가 도구');

// ---------- 📋 평가계획 점검 ----------

async function planCheck(root) {
  const [plans, info, libs] = await Promise.all([api(`/api/records/evalPlans?year=${state.year}`), loadClass(), api(`/api/records/standards?year=${state.year}`)]);
  const reload = () => planCheck(root);
  const save = async (p, patch) => { try { await api(`/api/records/evalPlans/${p.id}`, { method: 'PUT', body: { data: { ...p.data, ...patch }, version: p.version } }); toast('저장했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); } };
  const results = plans.map((p) => ({ p, issues: checkPlan(p.data, { levels: scaleOf(p), classGrade: info?.data.grade, bandOf, bandOfCode }) }));
  const cnt = (lv) => results.reduce((a, r) => a + r.issues.filter((x) => x.lv === lv).length, 0);
  const subjects = [...new Set(plans.map((p) => p.data.subject))];
  const coverage = subjects.map((s) => {
    const lib = libs.filter((l) => l.data.subject === s && (!info || !l.data.band || l.data.band === bandOf(info.data.grade))).flatMap((l) => l.data.items || []);
    const used = new Set(plans.filter((p) => p.data.subject === s).flatMap((p) => [...String(p.data.standard || '').matchAll(/\[([^\]]+)\]/g)].map((m) => `[${m[1]}]`)));
    return { s, n: plans.filter((p) => p.data.subject === s).length, lib: lib.length, used: lib.filter((x) => used.has(x.code)).length };
  });
  const fixBtn = (r, f) => (f === 'form' ? h('button', { class: 'link-btn small', onclick: () => openRecordForm('evalPlans', r.p, { onSaved: reload }) }, '고치기')
    : f === 'criteria' ? h('button', { class: 'link-btn small', onclick: () => editCriteria(r.p, (patch) => save(r.p, patch)) }, '관점 만들기')
      : h('a', { class: 'link-btn small', href: '#/desk/eval/overview', onclick: () => remember('ev_subj', r.p.data.subject) }, '기준 정하기'));
  clear(root,
    h('div', { class: 'toolbar' }, back(), h('strong', {}, '📋 평가계획 점검'), h('span', { class: 'grow' })),
    h('div', { class: 'kpi-grid' },
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '평가 계획'), h('div', { class: 'kpi-value' }, plans.length)),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '꼭 고칠 것'), h('div', { class: `kpi-value ${cnt('error') ? 'danger' : ''}` }, cnt('error'))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '확인 권장'), h('div', { class: 'kpi-value' }, cnt('warn'))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '이상 없음'), h('div', { class: 'kpi-value' }, results.filter((r) => !r.issues.some((x) => x.lv !== 'info')).length))),
    coverage.length ? h('div', { class: 'card' }, h('h3', {}, '과목별 횟수 · 성취기준 반영'), h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
      h('thead', {}, h('tr', {}, ['과목', '평가 횟수', '성취기준 DB', '평가에 쓴 성취기준'].map((x) => h('th', {}, x)))),
      h('tbody', {}, coverage.map((c) => h('tr', {}, h('td', {}, c.s), h('td', {}, `${c.n}회`), h('td', {}, c.lib ? `${c.lib}개` : h('span', { class: 'muted' }, '없음')), h('td', {}, c.lib ? `${c.used} / ${c.lib}` : '-'))))))) : null,
    plans.length ? h('div', { class: 'check-list' }, results.map((r) => {
      const bad = r.issues.filter((x) => x.lv !== 'info');
      return h('div', { class: `card check-card ${r.issues.some((x) => x.lv === 'error') ? 'error' : bad.length ? 'warn' : 'ok'}` },
        h('div', { class: 'card-head' }, h('strong', {}, `${r.p.data.subject} · ${r.p.data.unit || r.p.data.element || '(제목 없음)'}`), h('span', { class: 'muted small' }, [r.p.data.timing, r.p.data.method, `${scaleOf(r.p).length}수준`].filter(Boolean).join(' · ')),
          h('span', { class: 'grow' }), bad.length ? null : h('span', { class: 'tag ok' }, '✓ 이상 없음')),
        r.issues.length ? h('ul', { class: 'check-items' }, r.issues.map((x) => h('li', { class: x.lv }, h('span', {}, x.lv === 'error' ? '❌' : x.lv === 'warn' ? '⚠️' : 'ℹ️'), h('span', { class: 'grow' }, x.msg), fixBtn(r, x.fix)))) : null);
    })) : h('p', { class: 'muted' }, '평가 계획이 없습니다.'),
    h('p', { class: 'hint' }, '점검 기준: 필수 칸(성취기준·평가 요소·방법), 시기·단원·학기, 수준별 기준 빈 칸과 같은 문장, 학급 학년과 성취기준 학년군, 평가 관점 유무. 학교 학업성적관리규정의 세부 요건은 학교마다 달라 반영하지 않았습니다 [확인 필요].'));
}

// ---------- 🧩 루브릭 만들기 ----------

async function rubricPick(root) {
  const plans = await api(`/api/records/evalPlans?year=${state.year}`);
  const reload = () => rubricPick(root);
  clear(root, h('div', { class: 'toolbar' }, back(), h('strong', {}, '🧩 루브릭 만들기'), h('span', { class: 'grow' }), h('a', { class: 'btn', href: '#/desk/eval/overview' }, '+ 평가 계획')),
    plans.length ? h('div', { class: 'cards' }, plans.map((p) => h('button', { class: 'card eval-card', onclick: () => editCriteria(p, async (patch) => { try { await api(`/api/records/evalPlans/${p.id}`, { method: 'PUT', body: { data: { ...p.data, ...patch }, version: p.version } }); toast('저장했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); } }) },
      h('div', { class: 'card-head' }, h('strong', {}, `${p.data.subject} · ${p.data.unit || p.data.element || ''}`)),
      h('div', { class: 'muted small' }, [p.data.method, `${scaleOf(p).length}수준`].filter(Boolean).join(' · ')),
      hasCriteria(p) ? h('div', { class: 'small' }, '🧩 ', p.data.criteria.map((c) => c.name).join(' · ')) : h('span', { class: 'tag warn' }, '관점 없음')))) : h('p', { class: 'muted' }, '평가 계획을 먼저 만들어 주세요.'));
}

// ---------- 📝 시험문제 만들기 ----------

function examPrompt(o) {
  return `# 시험문제 만들기 요청
초등학교 ${o.grade} ${o.subject} 평가 문항을 만들어 주세요.

## 범위(단원·교과서 내용)
${o.range || '(내용 없음)'}

## 조건
- 문항 수: ${o.n}문항 (난이도 상 ${o.hi} · 중 ${o.mid} · 하 ${o.lo} 비율)
- 유형: ${o.types.join(', ')}
- 위 범위 안의 내용으로만 출제하고, 교과서에 없는 사실을 만들지 않습니다.
- 객관식은 보기 ${o.choices}개, 정답은 하나, 매력적인 오답을 넣습니다.
- 학년 수준에 맞는 쉬운 낱말로 씁니다. 해설은 1~2문장.

아래 JSON 형식으로만 답해 주세요.
{"items":[{"type":"객관식|단답형|서술형","level":"상|중|하","q":"문제","choices":["보기1","보기2"],"answer":"정답(객관식은 번호)","explain":"해설"}]}`;
}
function examHtml(title, items, withAnswer) {
  const circ = ['①', '②', '③', '④', '⑤'];
  const body = items.map((x, i) => `<div class="q"><b>${i + 1}.</b> ${esc(x.q).replace(/\n/g, '<br>')}${x.level ? ` <small>[${esc(x.level)}]</small>` : ''}
${x.choices.length ? `<ol class="ch">${x.choices.map((c, k) => `<li>${circ[k] || k + 1} ${esc(c)}</li>`).join('')}</ol>` : `<div class="ans-box ${x.type.includes('서술') ? 'big' : ''}"></div>`}
${withAnswer ? `<div class="key">정답: ${esc(x.answer)}${x.explain ? ` · 해설: ${esc(x.explain)}` : ''}</div>` : ''}</div>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;margin:24px;color:#000;font-size:11pt}
h1{text-align:center;font-size:17pt;margin:0 0 6px}.who{text-align:right;margin-bottom:14px}
.q{margin:0 0 16px;page-break-inside:avoid}.ch{list-style:none;padding-left:18px;margin:6px 0}.ch li{margin:2px 0}
.ans-box{border:1px solid #888;height:34px;margin:6px 0 0 18px}.ans-box.big{height:110px}.key{margin:6px 0 0 18px;color:#c2410c;font-size:10pt}
small{color:#666}</style></head><body><h1>${esc(title)}</h1><div class="who">( &nbsp; )학년 ( &nbsp; )반 ( &nbsp; )번 이름: ________</div>${body}</body></html>`;
}

async function examMaker(root) {
  const info = await loadClass();
  const saved = remember('exam_draft') || {};
  const o = { subject: saved.subject || '', grade: saved.grade || info?.data.grade || '', range: saved.range || '', n: saved.n || 10, hi: 3, mid: 5, lo: 2, choices: 4, types: saved.types || ['객관식', '단답형', '서술형'], items: saved.items || [], title: saved.title || '' };
  const keep = () => remember('exam_draft', { subject: o.subject, grade: o.grade, range: o.range, n: o.n, types: o.types, items: o.items, title: o.title });
  const preview = h('div', {});
  const paint = () => {
    keep();
    if (!o.items.length) return clear(preview, h('p', { class: 'muted' }, '③에 AI 답을 붙여넣으면 시험지 미리보기가 나옵니다.'));
    const title = o.title || `${o.subject} 평가`;
    const frame = h('iframe', { class: 'exam-frame', title: '시험지 미리보기' });
    clear(preview, h('div', { class: 'toolbar' }, h('input', { value: o.title, placeholder: '시험지 제목 (예: 3단원 과학 평가)', oninput: (e) => { o.title = e.target.value; keep(); } }), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(examHtml(title, o.items, false)); w.document.close(); setTimeout(() => w.print(), 300); } }, '🖨 문제지'),
      h('button', { class: 'btn', onclick: () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(examHtml(`${title} (정답·해설)`, o.items, true)); w.document.close(); setTimeout(() => w.print(), 300); } }, '🖨 정답 포함'),
      h('button', { class: 'btn primary', onclick: async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([examHtml(title, o.items, false)], { type: 'text/html' }), 'text/plain': new Blob([o.items.map((x, i) => `${i + 1}. ${x.q}`).join('\n')], { type: 'text/plain' }) })]); toast('복사했습니다. 한글에 붙여넣으세요.'); } catch { toast('복사하지 못했습니다. HTML 저장을 써 주세요.', 'error'); } } }, '📋 한글로 복사'),
      h('button', { class: 'btn', onclick: () => download(`${title}.html`, examHtml(title, o.items, false), 'text/html') }, 'HTML 저장')),
    h('p', { class: 'muted small' }, `${o.items.length}문항 · 상 ${o.items.filter((x) => x.level === '상').length} · 중 ${o.items.filter((x) => x.level === '중').length} · 하 ${o.items.filter((x) => x.level === '하').length}`),
    frame);
    frame.srcdoc = examHtml(title, o.items, true);
  };
  const subjects = state.settings?.lists?.subjects || DEFAULT_LISTS.subjects;
  const ai = h('textarea', { rows: 5, placeholder: 'AI가 준 JSON 답을 여기에 붙여넣기' });
  clear(root,
    h('div', { class: 'toolbar' }, back(), h('strong', {}, '📝 시험문제 만들기'), h('span', { class: 'grow' })),
    h('div', { class: 'card form' },
      h('h4', {}, '① 범위와 조건'),
      h('div', { class: 'wz-row' },
        h('label', {}, '과목 ', h('select', { onchange: (e) => { o.subject = e.target.value; keep(); } }, h('option', { value: '' }, '선택'), subjects.map((s) => h('option', { value: s, selected: s === o.subject }, s)))),
        h('label', {}, '학년 ', h('input', { value: o.grade, style: { width: '80px' }, oninput: (e) => { o.grade = e.target.value; } })),
        h('label', {}, '문항 수 ', h('input', { type: 'number', min: 1, max: 40, value: o.n, style: { width: '70px' }, oninput: (e) => { o.n = Number(e.target.value) || 10; } })),
        h('label', {}, '난이도 상·중·하 ', h('input', { value: `${o.hi}:${o.mid}:${o.lo}`, style: { width: '80px' }, oninput: (e) => { const [a, b, c] = e.target.value.split(/[:,\s]+/).map(Number); o.hi = a || 0; o.mid = b || 0; o.lo = c || 0; } })),
        ['객관식', '단답형', '서술형'].map((t) => h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: o.types.includes(t), onchange: (e) => { o.types = e.target.checked ? [...new Set([...o.types, t])] : o.types.filter((x) => x !== t); } }), ` ${t}`))),
      h('textarea', { rows: 6, placeholder: '단원 범위·교과서 핵심 내용을 붙여넣으세요 (예: 3. 용해와 용액 — 용해, 용액, 용질과 용매 …)', value: o.range, oninput: (e) => { o.range = e.target.value; } }),
      h('h4', {}, '② 요청문 복사 → 쓰시는 AI에 붙여넣기'),
      h('button', { class: 'btn primary', onclick: () => { if (!o.subject || !o.range.trim()) { toast('과목과 범위 내용을 넣어 주세요.', 'error'); return; } keep(); copyText(examPrompt(o)); } }, '📋 요청문 복사'),
      h('h4', {}, '③ AI 답 붙여넣기'), ai,
      h('button', { class: 'btn', onclick: () => { const items = parseAiExam(ai.value); if (!items.length) { toast('JSON 형식의 문항을 찾지 못했습니다.', 'error'); return; } o.items = items; paint(); toast(`${items.length}문항을 넣었습니다. 정답·해설을 꼭 검토하세요.`); } }, '시험지 만들기')),
    preview,
    h('p', { class: 'hint' }, 'AI가 만든 문항은 사실 오류·정답 오류가 있을 수 있습니다. 출제 전 반드시 검토하고, 학교 문항 검토 절차를 따르세요.'));
  paint();
}

// ---------- ✍️ 서·논술형 평가 ----------

function essayPrompt(a, plan, subs) {
  const levels = plan ? scaleOf(plan) : ['잘함', '보통', '노력 요함'];
  const crits = plan?.data.criteria || [];
  const lines = ['# 서·논술형 답안 초안 채점 요청', '',
    `- 과목: ${a.data.subject || plan?.data.subject || ''}`, `- 문항: ${a.data.question || a.data.title}`];
  if (plan) lines.push(`- 성취기준: ${(plan.data.standard || '').replace(/\n/g, ' / ')}`, `- 평가 요소: ${plan.data.element || ''}`);
  lines.push(`- 수준(높은 순): ${levels.join(' > ')}`, '', '## 채점 기준');
  if (crits.length) for (const c of crits) lines.push(`- 관점 「${c.name}」: ${levels.map((l) => `${l}=${c.rubric?.[l] || ''}`).join(' / ')}`);
  else lines.push(plan ? `- 수준별 기준: ${levels.map((l) => `${l}=${plan.data.rubric?.[l] || ''}`).join(' / ')}` : '- (채점 기준 없음: 문항 의도에 맞춰 판단)');
  lines.push('', '## 원칙',
    '- 채점 기준에 비추어 답안에 실제로 쓰인 내용만 근거로 판단합니다. 추측하지 않습니다.',
    '- 근거: 답안에서 확인한 핵심 내용을 한 줄로 (생활기록부 재료로 씀, "~함" 문체).',
    '- 피드백: 학생에게 줄 잘한 점 + 다음 단계 한두 문장.',
    '- 출력은 한 줄에 한 답안, 다른 설명 없이:',
    crits.length ? `S01 | ${crits.map((c) => `${c.name}=수준`).join('; ')} | 종합=수준 | 근거: … | 피드백: …` : 'S01 | 종합=수준 | 근거: … | 피드백: …',
    '', '## 답안 (S번호는 익명 번호)');
  subs.forEach((s, i) => lines.push(`S${String(i + 1).padStart(2, '0')} | ${s.body.replace(/\n+/g, ' ')}`));
  return lines.join('\n');
}

async function essayView(root, openId) {
  const [acts, plans, students] = await Promise.all([api(`/api/records/activities?year=${state.year}`), api(`/api/records/evalPlans?year=${state.year}`), loadStudents()]);
  const essays = acts.filter((a) => a.data.kind === '서·논술형');
  const reload = (id) => essayView(root, id);
  const a = essays.find((x) => x.id === openId);
  if (!a) {
    return clear(root, h('div', { class: 'toolbar' }, back(), h('strong', {}, '✍️ 서·논술형 평가'), h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('activities', null, { defaults: { kind: '서·논술형', open: true }, onSaved: (r) => r && go(`t=essay&id=${r.id}`) }) }, '+ 문항 만들기')),
      essays.length ? h('div', { class: 'cards' }, essays.map((x) => h('button', { class: 'card eval-card', onclick: () => go(`t=essay&id=${x.id}`) },
        h('div', { class: 'card-head' }, h('strong', {}, x.data.title), h('span', { class: `tag ${x.data.open ? 'ok' : 'ghost'}` }, x.data.open ? '제출 받는 중' : '마감')),
        h('div', { class: 'muted small' }, x.data.subject || ''), h('div', { class: 'small clamp2' }, x.data.question || '')))) :
        h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '✍️'), h('p', {}, '문항을 만들면 학생용 링크·QR이 생깁니다. 학생은 로그인 없이 번호·이름을 적고 답안을 냅니다.')));
  }
  const subs = (await api(`/api/activities/${a.id}/submissions`)).filter((s) => !s.hidden);
  const plan = plans.find((p) => p.id === a.data.planId);
  const names = students.map((s) => s.data.name);
  const clean = (n) => String(n || '').replace(/\s/g, '');
  const matched = (s) => names.find((n) => clean(n) === clean(s.name));
  const missing = names.filter((n) => !subs.some((s) => clean(s.name) === clean(n)));
  const setA = async (patch) => { try { await api(`/api/records/activities/${a.id}`, { method: 'PUT', body: { data: { ...a.data, ...patch }, version: a.version } }); reload(a.id); } catch (e) { toast(e.message, 'error'); } };
  const results = h('div', {});
  const applyAi = () => {
    if (!plan) { toast('먼저 연결할 평가 계획을 고르세요.', 'error'); return; }
    const levels = scaleOf(plan);
    const ta = h('textarea', { rows: 8, placeholder: 'S01 | 관점=수준; … | 종합=수준 | 근거: … | 피드백: …' });
    const out = h('div', {});
    let map = new Map();
    const show = () => {
      map = parseAiScores(ta.value, levels, (plan.data.criteria || []).map((c) => c.name));
      clear(out, h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('thead', {}, h('tr', {}, ['번호', '학생', '관점별', '종합', '근거', '피드백'].map((x) => h('th', {}, x)))),
        h('tbody', {}, subs.map((s, i) => { const r = map.get(`S${String(i + 1).padStart(2, '0')}`); return h('tr', { class: r ? '' : 'muted' }, h('td', {}, `S${String(i + 1).padStart(2, '0')}`), h('td', {}, matched(s) || h('span', { class: 'danger' }, `${s.name} (명단에 없음)`)),
          h('td', { class: 'small' }, r ? Object.entries(r.crit).map(([k, v]) => `${k}=${v}`).join(', ') : ''), h('td', {}, r?.level || ''), h('td', { class: 'small' }, r?.evidence || ''), h('td', { class: 'small' }, r?.feedback || '')); })))));
    };
    ta.addEventListener('input', show);
    modal('📥 AI 초안 채점 결과 넣기', h('div', { class: 'form' }, h('p', { class: 'muted small' }, `결과는 평가 계획 「${plan.data.subject} ${plan.data.unit || plan.data.element || ''}」의 학생 기록(관점별 수준·종합·산출물 근거)에 들어갑니다. 이미 기록한 학생은 빈 칸만 채웁니다.`), ta, out), [
      (close) => h('button', { class: 'btn', onclick: close }, '취소'),
      (close) => h('button', { class: 'btn primary', onclick: async () => {
        show();
        const scores = JSON.parse(JSON.stringify(plan.data.scores || {}));
        let n = 0;
        subs.forEach((s, i) => {
          const r = map.get(`S${String(i + 1).padStart(2, '0')}`); const who = matched(s);
          if (!r || !who) return;
          const sc = scores[who] ||= {};
          sc.crit = { ...r.crit, ...(sc.crit || {}) };
          if (!sc.level) sc.level = r.level || overallLevel(levels, sc.crit);
          if (!sc.evidence && r.evidence) sc.evidence = r.evidence;
          if (r.feedback) sc.feedback = r.feedback;
          n++;
        });
        try { await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, scores }, version: plan.version } }); toast(`${n}명의 평가 기록에 넣었습니다. 평가 화면에서 확인·확정하세요.`); close(); reload(a.id); } catch (e) { toast(e.message, 'error'); }
      } }, '평가 기록에 넣기'),
    ], { wide: true });
  };
  clear(results, subs.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ['', '번호', '이름', '답안', '글자', '평가', '제출'].map((x) => h('th', {}, x)))),
    h('tbody', {}, subs.map((s, i) => {
      const who = matched(s);
      const sc = who && plan?.data.scores?.[who];
      return h('tr', {}, h('td', { class: 'muted small' }, `S${String(i + 1).padStart(2, '0')}`), h('td', {}, s.num), h('td', {}, who ? h('strong', {}, who) : h('span', { class: 'danger', title: '명단 이름과 다름' }, `${s.name} ⚠`)),
        h('td', { class: 'essay-cell' }, h('details', {}, h('summary', {}, s.body.slice(0, 40) + (s.body.length > 40 ? '…' : '')), h('div', { class: 'pre small' }, s.body), sc?.feedback ? h('div', { class: 'small feedback' }, '💬 ', sc.feedback) : null)),
        h('td', { class: 'small muted' }, [...s.body].length),
        h('td', {}, plan && who ? h('button', { class: 'link-btn small', onclick: () => { const scores = JSON.parse(JSON.stringify(plan.data.scores || {})); scores[who] ||= {}; studentCard(plan, who, scores[who], () => { clearTimeout(results._t); results._t = setTimeout(async () => { try { const saved = await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, scores }, version: plan.version } }); Object.assign(plan, saved); } catch (e) { toast(e.message, 'error'); } }, 600); }); } }, sc?.level || '평가') : h('span', { class: 'muted small' }, '-')),
        h('td', { class: 'small muted' }, String(s.updatedAt || '').slice(5, 16)));
    })))) : h('p', { class: 'muted' }, '아직 제출한 학생이 없습니다.'));
  clear(root,
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => go('t=essay') }, '← 문항 목록'), h('strong', {}, a.data.title), h('span', { class: `tag ${a.data.open ? 'ok' : 'ghost'}` }, a.data.open ? '제출 받는 중' : '마감'), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => setA({ open: !a.data.open }) }, a.data.open ? '⏹ 제출 마감' : '▶ 제출 받기'),
      h('button', { class: 'btn', onclick: () => openRecordForm('activities', a, { onSaved: (r) => (r ? reload(r.id) : go('t=essay')) }) }, '문항 수정'),
      h('button', { class: 'btn', onclick: () => reload(a.id) }, '↻ 새로고침')),
    h('div', { class: 'card' }, a.data.question ? h('div', { class: 'pre' }, a.data.question) : null, linkBox(a)),
    h('div', { class: 'card' }, h('div', { class: 'wz-row' }, h('label', {}, '연결할 평가 계획 ', h('select', { onchange: (e) => setA({ planId: e.target.value }) }, h('option', { value: '' }, '선택 (채점 기준·평가 기록에 씀)'),
      plans.map((p) => h('option', { value: p.id, selected: p.id === a.data.planId }, `${p.data.subject} · ${p.data.unit || p.data.element || ''}${hasCriteria(p) ? ' 🧩' : ''}`)))),
      plan && !hasCriteria(plan) ? h('button', { class: 'link-btn small', onclick: () => editCriteria(plan, async (patch) => { await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, ...patch }, version: plan.version } }); reload(a.id); }) }, '🧩 이 계획에 평가 관점 만들기') : null)),
    h('div', { class: 'kpi-grid' },
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '제출'), h('div', { class: 'kpi-value' }, subs.length, h('span', { class: 'muted small' }, ` / ${names.length}명`))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '미제출'), h('div', { class: 'kpi-value' }, missing.length), h('div', { class: 'muted small clamp2' }, missing.join(', '))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '명단과 다른 이름'), h('div', { class: 'kpi-value' }, subs.filter((s) => !matched(s)).length))),
    h('div', { class: 'toolbar ai-bar' }, h('span', { class: 'small' }, '🤖 AI 초안 채점 (학생 이름 대신 S번호)'), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => { if (!subs.length) { toast('제출한 답안이 없습니다.', 'error'); return; } copyText(essayPrompt(a, plan, subs)); } }, '① 📋 채점 요청문 복사'),
      h('button', { class: 'btn small', onclick: applyAi }, '② 📥 결과 넣기 → 평가 기록'),
      plan ? h('a', { class: 'btn small', href: '#/desk/eval/remarks', onclick: () => { remember('rm_area', '교과학습발달상황'); remember('rm_subj', plan.data.subject); } }, '③ 교과발달(세특) 쓰기 →') : null),
    results,
    h('p', { class: 'hint' }, '답안은 암호화해 저장되며 이 화면에서만 보입니다. 같은 번호·이름으로 다시 내면 마지막 답안으로 바뀝니다. AI 채점은 초안이며, 학생별 평가 카드에서 확인·수정해 확정하세요.'));
}

// ---------- 🗒 클래스 보드 (수업) ----------

export async function boardView(root) {
  const acts = (await api(`/api/records/activities?year=${state.year}`)).filter((a) => a.data.kind === '클래스 보드');
  const id = qs().get('id');
  const goB = (q) => { location.hash = `#/desk/lesson/board${q ? `?${q}` : ''}`; };
  const a = acts.find((x) => x.id === id);
  if (!a) {
    return clear(root, h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('activities', null, { defaults: { kind: '클래스 보드', open: true, showNames: true }, onSaved: (r) => r && goB(`id=${r.id}`) }) }, '+ 보드 만들기')),
      acts.length ? h('div', { class: 'cards' }, acts.map((x) => h('button', { class: 'card eval-card', onclick: () => goB(`id=${x.id}`) }, h('div', { class: 'card-head' }, h('strong', {}, x.data.title), h('span', { class: `tag ${x.data.open ? 'ok' : 'ghost'}` }, x.data.open ? '열림' : '닫힘')), h('div', { class: 'small clamp2 muted' }, x.data.question || '')))) :
        h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🗒'), h('p', {}, '질문을 띄우면 학생 글이 실시간으로 모이는 수업 게시판입니다. 학생은 링크·QR로 로그인 없이 씁니다.')));
  }
  const wall = h('div', { class: 'board-wall' });
  const count = h('span', { class: 'tag' });
  const draw = async () => {
    if (!wall.isConnected && wall._started) return false;
    const list = (await api(`/api/activities/${a.id}/submissions`)).filter((s) => !s.hidden).reverse();
    count.textContent = `${list.length}개`;
    clear(wall, list.length ? list.map((s, i) => h('div', { class: 'board-post', style: { '--h': (i * 47) % 360 } }, h('div', { class: 'pre' }, s.body), h('div', { class: 'board-meta' }, a.data.showNames ? h('span', {}, s.name) : h('span', {}), h('button', { class: 'icon-btn small', title: '숨기기', onclick: async () => { await api(`/api/activities/${a.id}/submissions/${s.id}/hide`, { method: 'POST', body: { hidden: true } }); draw(); } }, '✕'))))
      : h('p', { class: 'muted center' }, '아직 글이 없습니다. 학생들에게 QR을 보여 주세요.'));
    return true;
  };
  const setA = async (patch) => { await api(`/api/records/activities/${a.id}`, { method: 'PUT', body: { data: { ...a.data, ...patch }, version: a.version } }); boardView(root); };
  clear(root,
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => goB('') }, '← 보드 목록'), h('strong', {}, a.data.title), count, h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => setA({ open: !a.data.open }) }, a.data.open ? '⏹ 글쓰기 닫기' : '▶ 글쓰기 열기'),
      h('button', { class: 'btn', onclick: () => setA({ showNames: !a.data.showNames }) }, a.data.showNames ? '이름 숨기기' : '이름 보이기'),
      h('button', { class: 'btn', onclick: () => openRecordForm('activities', a, { onSaved: (r) => (r ? boardView(root) : goB('')) }) }, '수정'),
      h('button', { class: 'btn', onclick: () => document.querySelector('.board-stage')?.requestFullscreen?.().catch(() => {}) }, '⛶ 전체 화면')),
    h('div', { class: 'board-stage' }, a.data.question ? h('div', { class: 'board-q' }, a.data.question) : null, wall),
    h('details', { class: 'card' }, h('summary', {}, '🔗 학생 링크·QR'), linkBox(a)),
    h('p', { class: 'hint' }, '5초마다 새 글을 불러옵니다. 부적절한 글은 ✕로 숨길 수 있습니다(학생 화면에서도 사라짐).'));
  wall._started = true;
  await draw();
  const t = setInterval(async () => { if (!wall.isConnected) { clearInterval(t); return; } if (!document.hidden) await draw().catch(() => {}); }, 5000);
}
