// 🪴 Deskterior 추가 메뉴 (tdesk 남은 항목): 포트폴리오 · 진로·진학 · 학습지 · 실시간 퀴즈 + 내 설정(카드·교실 화면 구성 저장)
import { h, api, clear, toast, modal, fmtDate, today, download } from '../ui.js';
import { state, remember } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { loadStudents, emptyStudents } from './desk-common.js';
import { linkBox } from './desk-tools.js';
import { parseAiExam } from '../eval-text.js';

// ---------- 내 설정 (한 사람당 기록 하나, 기기가 바뀌어도 유지) ----------
let prefsCache = null;
export async function loadPrefs() {
  const rows = await api(`/api/records/deskSettings?year=${state.year}`).catch(() => []);
  prefsCache = rows[0] || null;
  return prefsCache?.data || {};
}
export async function savePrefs(patch) {
  const data = { ...(prefsCache?.data || {}), ...patch, name: 'Deskterior' };
  prefsCache = prefsCache
    ? await api(`/api/records/deskSettings/${prefsCache.id}`, { method: 'PUT', body: { data, version: prefsCache.version } })
    : await api('/api/records/deskSettings', { method: 'POST', body: { data, year: state.year } });
  return prefsCache.data;
}

// 끌어서 순서 바꾸기 + 켜고 끄기 목록 (내 책상 카드·내 교실 위젯 공통)
export function orderPicker(items, on, onChange) {
  // items: [{id, label}] 전체 후보, on: 켜진 id 순서
  let order = [...on.filter((id) => items.some((x) => x.id === id)), ...items.map((x) => x.id).filter((id) => !on.includes(id))];
  const enabled = new Set(on);
  const ul = h('ul', { class: 'order-list' });
  let drag = null;
  const draw = () => clear(ul, order.map((id, i) => {
    const it = items.find((x) => x.id === id);
    const li = h('li', { draggable: 'true', class: enabled.has(id) ? 'on' : '',
      ondragstart: () => { drag = id; li.classList.add('dragging'); }, ondragend: () => li.classList.remove('dragging'),
      ondragover: (e) => e.preventDefault(),
      ondrop: (e) => { e.preventDefault(); if (!drag || drag === id) return; order.splice(order.indexOf(drag), 1); order.splice(order.indexOf(id), 0, drag); emit(); draw(); } },
    h('span', { class: 'handle', title: '끌어서 순서 바꾸기' }, '⠿'),
    h('label', { class: 'grow' }, h('input', { type: 'checkbox', checked: enabled.has(id), onchange: (e) => { if (e.target.checked) enabled.add(id); else enabled.delete(id); li.classList.toggle('on', e.target.checked); emit(); } }), ` ${it.label}`),
    h('button', { type: 'button', class: 'icon-btn small', title: '위로', disabled: i === 0, onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; emit(); draw(); } }, '↑'),
    h('button', { type: 'button', class: 'icon-btn small', title: '아래로', disabled: i === order.length - 1, onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; emit(); draw(); } }, '↓'));
    return li;
  }));
  const emit = () => onChange(order.filter((id) => enabled.has(id)));
  draw();
  return ul;
}

// ---------- 🗂 포트폴리오 ----------
export async function portfolioView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const rows = await api(`/api/records/portfolios?year=${state.year}`);
  const reload = () => portfolioView(root);
  const who = remember('pf_student') || '';
  const kind = remember('pf_kind') || '';
  const shown = rows.filter((r) => (!who || r.data.student === who) && (!kind || r.data.kind === kind)).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const count = (n) => rows.filter((r) => r.data.student === n).length;
  const kinds = [...new Set(rows.map((r) => r.data.kind).filter(Boolean))];
  const ICON = { 글: '✍️', 그림: '🎨', 사진: '📷', 영상: '🎬', 프로젝트: '🧩', '실험·관찰': '🔬', 기타: '📎' };
  clear(root,
    h('div', { class: 'toolbar' },
      h('select', { onchange: (e) => { remember('pf_student', e.target.value); reload(); } }, h('option', { value: '' }, `전체 학생 (${rows.length})`), students.map((s) => h('option', { value: s.data.name, selected: s.data.name === who }, `${s.data.name} (${count(s.data.name)})`))),
      kinds.length ? h('div', { class: 'seg' }, ['', ...kinds].map((k) => h('button', { class: kind === k ? 'on' : '', onclick: () => { remember('pf_kind', k); reload(); } }, k || '전체'))) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('portfolios', null, { defaults: { date: today(), student: who, kind: '글' }, onSaved: reload }) }, '+ 작품·활동')),
    !who ? h('div', { class: 'note-chips' }, students.map((s) => h('button', { class: `chip-btn ${count(s.data.name) ? '' : 'zero'}`, onclick: () => { remember('pf_student', s.data.name); reload(); } }, s.data.name, h('span', { class: 'cnt' }, count(s.data.name))))) : null,
    shown.length ? h('div', { class: 'pf-grid' }, shown.map((r) => h('div', { class: 'card pf-card click', onclick: () => openRecordForm('portfolios', r, { onSaved: reload }) },
      h('div', { class: 'pf-ico' }, ICON[r.data.kind] || '📎'),
      h('div', { class: 'grow' }, h('strong', {}, r.data.title), h('div', { class: 'muted small' }, [r.data.student, r.data.subject, fmtDate(r.data.date)].filter(Boolean).join(' · ')),
        r.data.note ? h('div', { class: 'small clamp2' }, r.data.note) : null),
      r.data.link && /^https?:/.test(r.data.link) ? h('a', { class: 'btn small', href: r.data.link, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, '열기') : null))) :
      h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🗂'), h('p', {}, '학생 작품·활동을 링크(드라이브·패들렛 등)와 성장 메모로 모아 둡니다. 특기사항·상담 때 근거로 씁니다.')),
    h('p', { class: 'hint' }, '회색 이름은 아직 기록이 없는 학생입니다. 메모는 암호화되어 본인만 봅니다. 사진·파일은 학교 드라이브에 두고 링크만 넣으세요.'));
}

// ---------- 🧭 진로·진학 ----------
export async function careerView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const rows = await api(`/api/records/careers?year=${state.year}`);
  const reload = () => careerView(root);
  const by = new Map(rows.map((r) => [r.data.student, r]));
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'muted' }, `${by.size} / ${students.length}명 기록`), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => {
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        download('진로진학.csv', '﻿' + [['번호', '이름', '희망 진로', '보호자 희망', '관심 분야·강점', '진학 학교', '진로 활동'].map(q).join(','), ...students.map((s) => { const d = by.get(s.data.name)?.data || {}; return [s.data.num, s.data.name, d.hope, d.parentHope, d.interest, d.school, d.activity].map(q).join(','); })].join('\n'), 'text/csv');
      } }, 'CSV')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['번호', '이름', '희망 진로', '보호자 희망', '관심 분야·강점', '진학 학교', '진로 활동'].map((x) => h('th', {}, x)))),
      h('tbody', {}, students.map((s) => {
        const r = by.get(s.data.name); const d = r?.data || {};
        return h('tr', { class: 'click', onclick: () => openRecordForm('careers', r || null, { defaults: { student: s.data.name }, onSaved: reload }) },
          h('td', { class: 'num' }, s.data.num ?? ''), h('td', {}, h('strong', {}, s.data.name)),
          h('td', {}, d.hope || h('span', { class: 'muted' }, '+ 입력')), h('td', { class: 'small' }, d.parentHope || ''), h('td', { class: 'small' }, d.interest || ''), h('td', { class: 'small' }, d.school || ''), h('td', { class: 'small' }, h('div', { class: 'clamp2' }, d.activity || '')));
      })))),
    h('p', { class: 'hint' }, '줄을 누르면 입력합니다. 진로 활동은 창체-진로 특기사항의 근거가 됩니다. 상담 메모는 암호화되어 본인만 봅니다.'));
}

// ---------- 📄 학습지 ----------
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function worksheetHtml(r, answer) {
  const lines = String(r.data.content || '').split('\n');
  let n = 0;
  const body = lines.map((l) => {
    const html = esc(l).replace(/\{([^}]+)\}/g, (_, a) => { n++; return answer ? `<b class="ans">${a}</b>` : `<span class="blank">${'&nbsp;'.repeat(Math.max(6, a.length * 3))}</span>`; });
    return l.trim() ? `<p>${html}</p>` : '<br>';
  }).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(r.data.title)}</title><style>body{font-family:'맑은 고딕',sans-serif;margin:28px;font-size:13pt;line-height:2}h1{text-align:center;font-size:18pt;margin:0}.meta{text-align:center;color:#555;font-size:11pt}.who{text-align:right;margin:10px 0 18px}.blank{display:inline-block;border-bottom:1.5px solid #000;min-width:70px}.ans{color:#c2410c;text-decoration:underline}</style></head><body><h1>${esc(r.data.title)}${answer ? ' (정답)' : ''}</h1><div class="meta">${esc([r.data.subject, r.data.unit].filter(Boolean).join(' · '))}</div><div class="who">( &nbsp; )학년 ( &nbsp; )반 ( &nbsp; )번 이름: ________</div>${body}<p style="color:#888;font-size:10pt">빈칸 ${n}개</p></body></html>`;
}
export async function worksheetsView(root) {
  const rows = await api(`/api/records/worksheets?year=${state.year}`);
  const reload = () => worksheetsView(root);
  const open = (html) => { const w = window.open('', '_blank'); if (!w) { toast('팝업을 허용해 주세요.', 'error'); return; } w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); };
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      h('a', { class: 'btn', href: '#/desk/market/run?tool=worksheet' }, '🧰 빈칸 학습지 도구'),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('worksheets', null, { defaults: { content: '식물은 잎에서 {광합성}을 하여 양분을 만든다.\n물이 수증기로 변하는 현상을 {증발}이라고 한다.' }, onSaved: reload }) }, '+ 학습지')),
    rows.length ? h('div', { class: 'cards' }, rows.map((r) => {
      const blanks = (String(r.data.content).match(/\{[^}]+\}/g) || []).length;
      return h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('strong', {}, r.data.title), h('span', { class: 'tag ghost' }, `빈칸 ${blanks}`)),
        h('div', { class: 'muted small' }, [r.data.subject, r.data.unit].filter(Boolean).join(' · ')),
        h('div', { class: 'small clamp2' }, String(r.data.content).replace(/\{([^}]+)\}/g, '___')),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn small primary', onclick: () => open(worksheetHtml(r, false)) }, '🖨 학생용'),
          h('button', { class: 'btn small', onclick: () => open(worksheetHtml(r, true)) }, '🖨 정답지'),
          h('button', { class: 'btn small', onclick: () => download(`${r.data.title}.html`, worksheetHtml(r, false), 'text/html') }, 'HTML'),
          h('span', { class: 'grow' }), h('button', { class: 'link-btn small', onclick: () => openRecordForm('worksheets', r, { onSaved: reload }) }, '수정')));
    })) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '📄'), h('p', {}, '내용에서 빈칸으로 만들 말을 {중괄호}로 감싸면 학생용(빈칸)·정답지가 자동으로 만들어집니다.')),
    h('p', { class: 'hint' }, '예) 식물은 잎에서 {광합성}을 하여 양분을 만든다. → 학생용: 식물은 잎에서 ______을 하여 … / 정답지: 광합성 표시'));
}

// ---------- ⚡ 실시간 퀴즈 ----------
const QUIZ = '실시간 퀴즈';
const goQ = (q) => { location.hash = `#/desk/lesson/quiz${q ? `?${q}` : ''}`; };
export function gradeQuiz(questions, answers) {
  let score = 0;
  const marks = questions.map((q, i) => {
    const a = String(answers?.[i] ?? '').trim();
    const right = q.choices?.length ? a === String(q.answer).trim() : a.replace(/\s/g, '') !== '' && String(q.answer || '').split(/[,/|]/).map((x) => x.replace(/\s/g, '')).includes(a.replace(/\s/g, ''));
    if (right) score++;
    return right;
  });
  return { score, marks };
}
function editQuestions(a, reload) {
  const qs = JSON.parse(JSON.stringify(a.data.questions || []));
  const box = h('div', {});
  const draw = () => clear(box, qs.map((q, i) => h('div', { class: 'card quiz-q' },
    h('div', { class: 'card-head' }, h('strong', {}, `${i + 1}번`), h('span', { class: 'grow' }), h('button', { type: 'button', class: 'icon-btn small', onclick: () => { qs.splice(i, 1); draw(); } }, '✕')),
    h('textarea', { rows: 2, value: q.q, placeholder: '문제', oninput: (e) => { q.q = e.target.value; } }),
    h('div', { class: 'quiz-ch' }, (q.choices || []).map((c, k) => h('label', { class: 'inline' }, h('input', { type: 'radio', name: `ans${i}`, checked: String(q.answer) === String(k + 1), onchange: () => { q.answer = String(k + 1); } }),
      h('input', { value: c, placeholder: `보기 ${k + 1}`, oninput: (e) => { q.choices[k] = e.target.value; } }))),
    q.choices?.length ? null : h('input', { value: q.answer || '', placeholder: '정답 (여러 개면 쉼표로)', oninput: (e) => { q.answer = e.target.value; } })),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { q.choices = q.choices?.length ? [] : ['', '', '', '']; q.answer = ''; draw(); } }, q.choices?.length ? '단답형으로' : '객관식으로'),
      q.choices?.length && q.choices.length < 5 ? h('button', { type: 'button', class: 'btn small', onclick: () => { q.choices.push(''); draw(); } }, '+ 보기') : null))));
  draw();
  const paste = h('textarea', { rows: 3, placeholder: '[시험문제 만들기]·AI가 준 JSON 문항을 붙여넣으면 한 번에 들어갑니다' });
  modal(`⚡ ${a.data.title} · 문제`, h('div', { class: 'form' }, box,
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => { qs.push({ q: '', choices: ['', '', '', ''], answer: '' }); draw(); } }, '+ 객관식'),
      h('button', { type: 'button', class: 'btn', onclick: () => { qs.push({ q: '', choices: [], answer: '' }); draw(); } }, '+ 단답형')),
    h('details', { class: 'card' }, h('summary', {}, '🤖 AI 문항(JSON) 붙여넣기'), paste,
      h('button', { type: 'button', class: 'btn small', onclick: () => { const items = parseAiExam(paste.value).filter((x) => !String(x.type).includes('서술')); if (!items.length) { toast('문항을 찾지 못했습니다.', 'error'); return; } for (const x of items) qs.push({ q: x.q, choices: x.choices, answer: x.choices.length ? String(x.answer).replace(/[^\d]/g, '') || x.answer : x.answer }); draw(); toast(`${items.length}문항을 넣었습니다.`); } }, '넣기'))), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const clean = qs.filter((q) => q.q.trim()).map((q) => ({ q: q.q.trim(), choices: (q.choices || []).map((c) => c.trim()).filter(Boolean), answer: String(q.answer || '').trim() }));
      if (clean.some((q) => q.choices.length && !q.answer)) { toast('객관식은 정답 보기를 골라 주세요.', 'error'); return; }
      try { await api(`/api/records/activities/${a.id}`, { method: 'PUT', body: { data: { ...a.data, questions: clean }, version: a.version } }); toast('저장했습니다.'); close(); reload(); } catch (e) { toast(e.message, 'error'); }
    } }, '저장'),
  ], { wide: true });
}
export async function quizView(root) {
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  const acts = (await api(`/api/records/activities?year=${state.year}`)).filter((x) => x.data.kind === QUIZ);
  const a = acts.find((x) => x.id === id);
  const reload = () => quizView(root);
  if (!a) {
    return clear(root, h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('activities', null, { defaults: { kind: QUIZ, open: false }, onSaved: (r) => r && goQ(`id=${r.id}`) }) }, '+ 퀴즈 만들기')),
      acts.length ? h('div', { class: 'cards' }, acts.map((x) => h('button', { class: 'card eval-card', onclick: () => goQ(`id=${x.id}`) },
        h('div', { class: 'card-head' }, h('strong', {}, x.data.title), h('span', { class: `tag ${x.data.open ? 'ok' : 'ghost'}` }, x.data.open ? '진행 중' : '닫힘')),
        h('div', { class: 'muted small' }, `${(x.data.questions || []).length}문항 · ${x.data.subject || ''}`)))) :
        h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '⚡'), h('p', {}, '전원 참여 퀴즈: 학생은 링크·QR로 로그인 없이 답하고, 문제별 정답률과 학생별 점수가 바로 모입니다.')));
  }
  const qs = a.data.questions || [];
  const setA = async (patch) => { await api(`/api/records/activities/${a.id}`, { method: 'PUT', body: { data: { ...a.data, ...patch }, version: a.version } }); reload(); };
  const results = h('div', {});
  const draw = async () => {
    const subs = (await api(`/api/activities/${a.id}/submissions`)).filter((s) => !s.hidden);
    const graded = subs.map((s) => { let ans = []; try { ans = JSON.parse(s.body); } catch { /* 무시 */ } return { s, ans, ...gradeQuiz(qs, ans) }; }).sort((x, y) => (Number(x.s.num) || 999) - (Number(y.s.num) || 999));
    const avg = graded.length ? (graded.reduce((t, g) => t + g.score, 0) / graded.length).toFixed(1) : '-';
    clear(results,
      h('div', { class: 'kpi-grid' }, h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '참여'), h('div', { class: 'kpi-value' }, `${graded.length}명`)),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '평균'), h('div', { class: 'kpi-value' }, `${avg} / ${qs.length}`))),
      qs.length ? h('section', { class: 'section' }, h('h3', {}, '문제별 정답률'), h('div', { class: 'quiz-rates' }, qs.map((q, i) => {
        const n = graded.filter((g) => g.marks[i]).length; const p = graded.length ? Math.round((n / graded.length) * 100) : 0;
        return h('div', { class: 'qr-row' }, h('span', { class: 'qr-no' }, `${i + 1}`), h('span', { class: 'grow small' }, q.q.slice(0, 50)), h('div', { class: 'bar', style: { width: '160px' } }, h('span', { style: { width: `${p}%` } }), h('em', {}, `${p}%`)), h('span', { class: 'muted small' }, `${n}/${graded.length}`));
      }))) : null,
      graded.length ? h('section', { class: 'section' }, h('h3', {}, '학생별 결과'), h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', {}, h('tr', {}, ['번호', '이름', '점수', ...qs.map((_, i) => `${i + 1}`)].map((x) => h('th', {}, x)))),
        h('tbody', {}, graded.map((g) => h('tr', {}, h('td', {}, g.s.num), h('td', {}, h('strong', {}, g.s.name)), h('td', { class: 'num' }, `${g.score}/${qs.length}`),
          qs.map((_, i) => h('td', { class: `center ${g.marks[i] ? 'ok-cell' : 'no-cell'}`, title: String(g.ans[i] ?? '') }, g.marks[i] ? '○' : '✕')))))))) : h('p', { class: 'muted' }, '아직 제출한 학생이 없습니다.'));
    return graded;
  };
  clear(root,
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => goQ('') }, '← 퀴즈 목록'), h('strong', {}, a.data.title), h('span', { class: `tag ${a.data.open ? 'ok' : 'ghost'}` }, a.data.open ? '진행 중' : '닫힘'), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => editQuestions(a, reload) }, `✏️ 문제 (${qs.length})`),
      h('button', { class: `btn ${a.data.open ? '' : 'primary'}`, onclick: () => { if (!qs.length) { toast('문제를 먼저 넣어 주세요.', 'error'); return; } setA({ open: !a.data.open }); } }, a.data.open ? '⏹ 퀴즈 닫기' : '▶ 퀴즈 시작'),
      h('button', { class: 'btn', onclick: async () => {
        const g = await draw(); const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        download(`${a.data.title}_결과.csv`, '﻿' + [['번호', '이름', '점수', ...qs.map((_, i) => `${i + 1}번`)].map(q).join(','), ...g.map((x) => [x.s.num, x.s.name, x.score, ...qs.map((_, i) => `${x.ans[i] ?? ''}${x.marks[i] ? '(○)' : '(✕)'}`)].map(q).join(','))].join('\n'), 'text/csv');
      } }, 'CSV')),
    h('details', { class: 'card', open: a.data.open }, h('summary', {}, '🔗 학생 링크·QR'), linkBox(a)),
    results,
    h('p', { class: 'hint' }, '학생 화면에는 정답이 가지 않습니다. 결과는 4초마다 새로 고쳐지고, 같은 번호·이름으로 다시 내면 마지막 답안으로 채점합니다.'));
  await draw();
  const t = setInterval(() => { if (!results.isConnected) { clearInterval(t); return; } if (!document.hidden) draw().catch(() => {}); }, 4000);
}
