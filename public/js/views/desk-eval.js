// 📝 Deskterior · 평가 v2
//   벤치마킹: Classendo(즉석 평가·성취기준 단계·특기사항 자동 생성·나이스 입력), 학급다이어리2(평가 통계·검색),
//            과정중심평가(채점 기준표·관찰 메모)
import { h, api, clear, toast, modal, download } from '../ui.js';
import { state, remember } from '../state.js';
import { EVAL_SCALES, scaleOf } from '../modules.js';
import { openRecordForm } from '../form.js';
import { readSource, readText, parseEvalPlans } from '../smart-import.js';
import { loadStudents, emptyStudents, byteLen, copyText } from './desk-common.js';

const LV_COLORS = ['#30a46c', '#0091ff', '#f5a524', '#e5484d', '#8e4ec6'];
const MARKS = ['◎', '○', '△', '▽', '✕'];
const lvIndex = (plan, lv) => scaleOf(plan).indexOf(lv);
const lvColor = (plan, lv) => { const i = lvIndex(plan, lv); const n = scaleOf(plan).length; return i < 0 ? 'var(--line)' : LV_COLORS[n <= 2 ? (i === 0 ? 0 : 3) : n === 3 ? [0, 1, 2][i] : i] || LV_COLORS[4]; };
const lvMark = (plan, lv) => { const i = lvIndex(plan, lv); const n = scaleOf(plan).length; return i < 0 ? '' : n <= 2 ? (i === 0 ? '○' : '✕') : n === 3 ? ['◎', '○', '△'][i] : MARKS[i] || '·'; };
const planTitle = (p) => [p.data.subject, p.data.area || p.data.element].filter(Boolean).join(' · ');

// 받침 있으면 을, 없으면 를
const josa = (w, a = '을', b = '를') => { const c = String(w).trim().slice(-1).charCodeAt(0); if (c < 0xac00 || c > 0xd7a3) return `${w}${a}(${b})`; return `${w}${(c - 0xac00) % 28 ? a : b}`; };
const endDot = (s) => { const t = String(s || '').trim(); return !t ? '' : /[.!?。]$/.test(t) ? t : `${t}.`; };

// ---------- 평가 현황·기록 ----------

export async function evalView(root, openId) {
  const students = await loadStudents();
  const plans = await api(`/api/records/evalPlans?year=${state.year}`);
  const reload = (id) => evalView(root, id);
  const plan = plans.find((p) => p.id === openId);
  if (plan) return scoreSheet(root, plan, reload);
  const names = students.map((s) => s.data.name);
  const subj = remember('ev_subj') || '';
  const subjects = [...new Set(plans.map((p) => p.data.subject).filter(Boolean))];
  const shown = plans.filter((p) => !subj || p.data.subject === subj);
  const filled = (p) => names.filter((n) => p.data.scores?.[n]?.level).length;
  const totalCells = shown.length * names.length;
  const doneCells = shown.reduce((a, p) => a + filled(p), 0);
  const missing = names.filter((n) => shown.some((p) => !p.data.scores?.[n]?.level));
  const bySubject = new Map();
  for (const p of shown) { const k = p.data.subject || '기타'; if (!bySubject.has(k)) bySubject.set(k, []); bySubject.get(k).push(p); }

  clear(root,
    h('div', { class: 'kpi-grid' },
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '평가 계획'), h('div', { class: 'kpi-value' }, shown.length, h('span', { class: 'muted small' }, ' 개'))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '기록 완료율'), h('div', { class: 'kpi-value' }, totalCells ? `${Math.round((doneCells / totalCells) * 100)}%` : '-'),
        h('div', { class: 'progress-bar' }, h('span', { style: { width: `${totalCells ? (doneCells / totalCells) * 100 : 0}%` } }))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '미기록 있는 학생'), h('div', { class: 'kpi-value' }, missing.length, h('span', { class: 'muted small' }, ` / ${names.length}명`))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '교과'), h('div', { class: 'kpi-value' }, subjects.length, h('span', { class: 'muted small' }, ' 개')))),
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, ['', ...subjects].map((x) => h('button', { class: subj === x ? 'on' : '', onclick: () => { remember('ev_subj', x); reload(); } }, x || '전체 교과'))),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => importPlans(reload) }, '📥 평가계획 가져오기'),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('evalPlans', null, { defaults: { scale: '3단계', subject: subj }, onSaved: (r) => r && reload(r.id) }) }, '+ 평가 계획')),
    !names.length ? emptyStudents() : null,
    plans.length ? [...bySubject].map(([s, list]) => h('section', { class: 'section' }, h('h3', {}, s, h('span', { class: 'muted small' }, ` ${list.length}개`)),
      h('div', { class: 'cards' }, list.map((p) => {
        const scale = scaleOf(p);
        const n = filled(p);
        return h('button', { class: 'card eval-card', onclick: () => reload(p.id) },
          h('div', { class: 'card-head' }, h('strong', {}, p.data.area || p.data.element || p.data.subject), p.data.code ? h('span', { class: 'tag ghost' }, p.data.code) : null),
          p.data.element ? h('div', { class: 'small' }, '🎯 ', p.data.element) : null,
          h('div', { class: 'muted small' }, [p.data.method, p.data.timing, p.data.scale || '3단계'].filter(Boolean).join(' · ')),
          h('div', { class: 'lv-bar' }, scale.map((lv) => h('i', { title: lv, style: { width: `${names.length ? (names.filter((x) => p.data.scores?.[x]?.level === lv).length / names.length) * 100 : 0}%`, background: lvColor(p, lv) } }))),
          h('div', { class: 'row-actions' }, h('span', { class: `small ${n < names.length ? 'danger' : 'muted'}` }, n < names.length ? `미기록 ${names.length - n}명` : '✓ 모두 기록'), h('span', { class: 'grow' }),
            Object.keys(p.data.rubric || {}).length ? h('span', { class: 'tag ghost' }, '채점 기준') : null));
      })))) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '📝'),
      h('p', {}, '학교 평가계획표(한글·엑셀)를 [📥 평가계획 가져오기]로 한 번에 넣거나, [+ 평가 계획]으로 하나씩 만드세요.')));
}

// 평가계획표 가져오기: 한글 HWPX · 엑셀 · 붙여넣기
function importPlans(reload) {
  const file = h('input', { type: 'file', accept: '.hwpx,.hwp,.xlsx,.xls,.csv,.txt' });
  const ta = h('textarea', { rows: 6, placeholder: '평가계획표의 표를 복사해 붙여넣거나 한 줄에 하나씩:\n국어 | 3. 글의 짜임 | [6국03-02] 목적에 맞게 글을 쓴다. | 4월 | 서술형' });
  const scale = h('select', {}, Object.keys(EVAL_SCALES).map((k) => h('option', { value: k }, k)));
  const out = h('div', {});
  let found = [];
  const recognize = async () => {
    try {
      const src = file.files[0] ? await readSource(file.files[0]) : readText(ta.value);
      if (file.files[0] && ta.value.trim()) { const x = readText(ta.value); src.tables.push(...x.tables); src.lines.push(...x.lines); }
      found = parseEvalPlans(src).map((p) => ({ ...p, _on: true }));
      clear(out, found.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact smart-preview' },
        h('thead', {}, h('tr', {}, ['', '교과', '영역', '코드', '성취기준', '평가 요소', '방법', '시기'].map((x) => h('th', {}, x)))),
        h('tbody', {}, found.map((p) => h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: true, onchange: (e) => { p._on = e.target.checked; } })),
          ...['subject', 'area', 'code', 'standard', 'element', 'method', 'timing'].map((k) => h('td', {}, h(k === 'standard' ? 'textarea' : 'input', { value: p[k] || '', rows: 2, oninput: (e) => { p[k] = e.target.value; } })))))))) :
        h('p', { class: 'alert warn' }, '평가 계획을 찾지 못했습니다. 표 첫 줄에 "교과·영역·성취기준" 같은 머리글이 있는지 확인해 주세요.'));
    } catch (e) { clear(out, h('p', { class: 'alert error' }, e.message)); }
  };
  modal('📥 평가계획 가져오기', h('div', { class: 'form' },
    h('p', { class: 'muted small' }, '학교 평가계획표에서 교과·영역·성취기준(코드)·평가 요소·방법·시기를 찾아 평가 계획을 한 번에 만듭니다. 파일은 이 브라우저에서만 읽습니다.'),
    h('div', { class: 'row' }, h('label', {}, '파일 (한글 HWPX · 엑셀)'), file),
    h('div', { class: 'row' }, h('label', {}, '또는 붙여넣기'), ta),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: recognize }, '자동 인식'), h('label', { class: 'inline' }, '평가 단계 ', scale)),
    out), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const chosen = found.filter((p) => p._on);
      if (!chosen.length) { toast('가져올 계획이 없습니다.', 'error'); return; }
      for (const { _on, ...p } of chosen) await api('/api/records/evalPlans', { method: 'POST', body: { data: { ...p, scale: scale.value, scores: {}, rubric: {} }, year: state.year } });
      toast(`평가 계획 ${chosen.length}개를 만들었습니다.`); close(); reload();
    } }, '선택한 계획 만들기'),
  ], { wide: true });
}

// 채점 기준(루브릭) 편집: 단계마다 기준 문장 → 기록할 때 보이고, 특기사항 초안에 쓰임
function editRubric(plan, onSaved) {
  const scale = scaleOf(plan);
  const rubric = { ...(plan.data.rubric || {}) };
  const elem = plan.data.element || plan.data.area || '학습 내용';
  const sample = (i) => (i === 0 ? `${josa(elem)} 정확히 이해하고 스스로 능숙하게 수행함`
    : i === scale.length - 1 ? `${josa(elem)} 수행하는 데 도움이 필요하며 꾸준한 연습이 요구됨`
      : `${josa(elem)} 이해하고 대체로 바르게 수행함`);
  const inputs = scale.map((lv, i) => h('div', { class: 'row' }, h('label', {}, h('span', { style: { color: lvColor(plan, lv) } }, `${lvMark(plan, lv)} ${lv}`)),
    h('textarea', { rows: 2, value: rubric[lv] || '', placeholder: sample(i), oninput: (e) => { rubric[lv] = e.target.value; } })));
  modal(`📏 채점 기준 · ${planTitle(plan)}`, h('div', { class: 'form' },
    plan.data.standard ? h('p', { class: 'muted small' }, `${plan.data.code || ''} ${plan.data.standard}`) : null,
    inputs,
    h('button', { type: 'button', class: 'btn small', onclick: () => { scale.forEach((lv, i) => { if (!rubric[lv]) rubric[lv] = sample(i); }); inputs.forEach((row, i) => { row.querySelector('textarea').value = rubric[scale[i]]; }); } }, '기본 문장 채우기'),
    h('p', { class: 'hint' }, '여기 적은 문장은 특기사항 자동 초안의 바탕이 됩니다. "~함", "~할 수 있음"처럼 끝맺으면 생활기록부 문체와 맞습니다.')), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      try { const saved = await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, rubric }, version: plan.version } }); toast('저장했습니다.'); close(); onSaved(saved); } catch (e) { toast(e.message, 'error'); }
    } }, '저장'),
  ], { wide: true });
}

function scoreSheet(root, plan, reload) {
  const scale = scaleOf(plan);
  const scores = JSON.parse(JSON.stringify(plan.data.scores || {}));
  let version = plan.version;
  let timer = null;
  const status = h('span', { class: 'muted small' });
  const persist = () => {
    clearTimeout(timer);
    status.textContent = '저장 대기…';
    timer = setTimeout(async () => {
      try {
        const saved = await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, scores }, version } });
        version = saved.version; plan.data = saved.data; plan.version = saved.version; status.textContent = '✓ 자동 저장됨';
      } catch (e) { status.textContent = ''; toast(e.message, 'error'); }
    }, 700);
  };
  const mode = remember('ev_mode') || 'tap';
  const names = state.students;
  const count = (lv) => names.filter((s) => scores[s]?.level === lv).length;
  const sum = h('div', { class: 'row-actions' });
  const drawSum = () => clear(sum, scale.map((lv) => h('span', { class: 'tag', style: { '--c': lvColor(plan, lv) } }, `${lvMark(plan, lv)} ${lv} ${count(lv)}`)),
    h('span', { class: 'tag ghost' }, `미기록 ${names.length - scale.reduce((a, lv) => a + count(lv), 0)}`));
  const csv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', '교과', '성취기준 코드', '성취기준', '평가 요소', '결과', '관찰 메모'].map(esc).join(',')];
    names.forEach((s, i) => lines.push([i + 1, s, plan.data.subject, plan.data.code, plan.data.standard, plan.data.element, scores[s]?.level || '', scores[s]?.note || ''].map(esc).join(',')));
    download(`평가_${plan.data.subject}_${plan.data.area || plan.data.code || ''}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  const rubric = plan.data.rubric || {};
  const body = h('div', {});
  const tile = (s, i) => {
    scores[s] ||= {};
    const el = h('button', { class: 'eval-tile', onclick: () => {
      const cur = scale.indexOf(scores[s].level);
      scores[s].level = cur === scale.length - 1 ? '' : scale[cur + 1];
      paint(); drawSum(); persist();
    } });
    const paint = () => {
      const lv = scores[s].level;
      el.style.setProperty('--c', lvColor(plan, lv));
      el.classList.toggle('set', !!lv);
      clear(el, h('span', { class: 'muted small' }, i + 1), h('strong', {}, s), h('span', { class: 'ev-lv' }, lv ? `${lvMark(plan, lv)} ${lv}` : '—'), scores[s].note ? h('span', { class: 'ev-note' }, '📝') : null);
    };
    paint();
    return el;
  };
  const phraseChips = (s, input) => h('div', { class: 'ev-chips' }, ['적극적으로 참여함', '친구를 도와줌', '설명을 듣고 스스로 수정함', '추가 지도 필요'].map((t) => h('button', { type: 'button', class: 'chip-btn', onclick: () => { input.value = input.value ? `${input.value}, ${t}` : t; scores[s].note = input.value; persist(); } }, t)));
  const draw = () => {
    if (mode === 'tap') {
      clear(body, h('div', { class: 'eval-grid' }, names.map(tile)),
        h('p', { class: 'hint' }, `학생을 누를 때마다 ${scale.join(' → ')} → 지움 순서로 바뀌고 자동 저장됩니다. 체육·음악 실기처럼 그 자리에서 평가할 때 쓰세요.`));
    } else {
      clear(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table score' },
        h('thead', {}, h('tr', {}, ['번호', '이름', ...scale, '관찰 메모 (특기사항 참고)'].map((x) => h('th', {}, x)))),
        h('tbody', {}, names.map((s, i) => {
          scores[s] ||= {};
          const note = h('input', { value: scores[s].note || '', placeholder: '관찰 내용', oninput: (e) => { scores[s].note = e.target.value; persist(); } });
          return h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, h('strong', {}, s)),
            scale.map((lv) => h('td', { class: 'center' }, h('input', { type: 'radio', name: `lv_${i}`, checked: scores[s].level === lv, 'aria-label': `${s} ${lv}`, onchange: () => { scores[s].level = lv; drawSum(); persist(); } }))),
            h('td', {}, note, phraseChips(s, note)));
        })))));
    }
  };
  const fillRest = h('select', { onchange: (e) => {
    const lv = e.target.value; e.target.value = '';
    if (!lv) return;
    names.forEach((s) => { scores[s] ||= {}; if (!scores[s].level) scores[s].level = lv; });
    draw(); drawSum(); persist(); toast(`미기록 학생을 "${lv}"(으)로 채웠습니다.`);
  } }, h('option', { value: '' }, '미기록 일괄 지정…'), scale.map((lv) => h('option', { value: lv }, lv)));
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => reload() }, '← 현황'),
      h('strong', {}, planTitle(plan)), plan.data.code ? h('span', { class: 'tag ghost' }, plan.data.code) : null,
      h('div', { class: 'seg' }, [['tap', '즉석 평가'], ['table', '표·메모']].map(([v, l]) => h('button', { class: mode === v ? 'on' : '', onclick: () => { remember('ev_mode', v); reload(plan.id); } }, l))),
      status, h('span', { class: 'grow' }),
      fillRest,
      h('button', { class: 'btn', onclick: () => editRubric(plan, (p) => reload(p.id)) }, '📏 채점 기준'),
      h('button', { class: 'btn', onclick: () => openRecordForm('evalPlans', plan, { onSaved: (r) => reload(r?.id) }) }, '계획 수정'),
      h('button', { class: 'btn', onclick: csv }, 'CSV (나이스 입력용)')),
    h('div', { class: 'ev-head' },
      plan.data.standard ? h('div', {}, h('span', { class: 'muted small' }, '성취기준 '), plan.data.standard) : null,
      plan.data.element ? h('div', {}, h('span', { class: 'muted small' }, '평가 요소 '), h('strong', {}, plan.data.element)) : null,
      Object.keys(rubric).length ? h('div', { class: 'rubric-row' }, scale.map((lv) => rubric[lv] ? h('div', { class: 'rubric-cell', style: { '--c': lvColor(plan, lv) } }, h('strong', {}, `${lvMark(plan, lv)} ${lv}`), h('div', { class: 'small' }, rubric[lv])) : null))
        : h('button', { class: 'link-btn', onclick: () => editRubric(plan, (p) => reload(p.id)) }, '+ 채점 기준(단계별 기준 문장) 정하기')),
    !names.length ? emptyStudents() : [sum, body]);
  drawSum(); draw();
}

// ---------- 학생별 결과 ----------

export async function studentEvalView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const all = (await api(`/api/records/evalPlans?year=${state.year}`)).sort((a, b) => String(a.data.subject).localeCompare(String(b.data.subject), 'ko'));
  if (!all.length) return clear(root, h('p', { class: 'muted' }, '평가 기록이 없습니다.'));
  const subj = remember('ev_subj2') || '';
  const plans = all.filter((p) => !subj || p.data.subject === subj);
  const subjects = [...new Set(all.map((p) => p.data.subject).filter(Boolean))];
  const detail = h('div', {});
  const show = (name) => clear(detail, h('div', { class: 'card' }, h('h3', {}, `🧒 ${name}`),
    h('ul', { class: 'list' }, plans.filter((p) => p.data.scores?.[name]).map((p) => h('li', {},
      h('span', { class: 'tag', style: { '--c': lvColor(p, p.data.scores[name].level) } }, p.data.scores[name].level || '-'), ' ', h('strong', {}, planTitle(p)),
      p.data.scores[name].note ? h('div', { class: 'small muted' }, p.data.scores[name].note) : null))),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn small', onclick: () => copyText(draftFor(name, plans)) }, '✨ 초안 복사'),
      h('a', { class: 'btn small', href: '#/desk/eval/remarks' }, '특기사항 쓰기 →'))));
  clear(root,
    h('div', { class: 'toolbar' }, h('div', { class: 'seg' }, ['', ...subjects].map((x) => h('button', { class: subj === x ? 'on' : '', onclick: () => { remember('ev_subj2', x); studentEvalView(root); } }, x || '전체 교과')))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table compact eval-matrix' },
      h('thead', {}, h('tr', {}, h('th', {}, '이름'), plans.map((p) => h('th', { title: `${p.data.code || ''} ${p.data.standard || ''}` }, h('div', {}, p.data.subject), h('div', { class: 'muted small' }, p.data.area || p.data.code || ''))), h('th', {}, '미기록'))),
      h('tbody', {}, students.map((s) => {
        const n = s.data.name;
        const miss = plans.filter((p) => !p.data.scores?.[n]?.level).length;
        return h('tr', { class: 'click', onclick: () => show(n) }, h('td', {}, h('strong', {}, n)),
          plans.map((p) => { const lv = p.data.scores?.[n]?.level; return h('td', { class: 'center', title: lv || '', style: lv ? { color: lvColor(p, lv), fontWeight: '800' } : {} }, lv ? lvMark(p, lv) : ''); }),
          h('td', { class: `center ${miss ? 'danger' : 'muted'}` }, miss || '✓'));
      })))),
    h('p', { class: 'hint' }, '◎ 최상 · ○ 중간 · △ 낮음 (단계 수에 따라 달라짐). 줄을 누르면 그 학생의 결과·메모와 특기사항 초안을 봅니다.'),
    detail);
}

// 특기사항 초안: 채점 기준 문장(없으면 기본 문장) + 관찰 메모를 이어 붙임 — 사실에 없는 내용은 만들지 않음
export function draftFor(name, plans) {
  const parts = [];
  for (const p of plans) {
    const sc = p.data.scores?.[name];
    if (!sc?.level) continue;
    const scale = scaleOf(p);
    const i = scale.indexOf(sc.level);
    const elem = p.data.element || p.data.area || '학습 내용';
    const topic = p.data.area && p.data.element ? `'${p.data.area}' 단원에서 ` : '';
    const base = p.data.rubric?.[sc.level]
      || (i === 0 ? `${josa(elem)} 정확히 이해하고 능숙하게 수행함`
        : i === scale.length - 1 ? `${josa(elem)} 익히기 위해 꾸준히 노력하고 있으며 지속적인 지도가 필요함`
          : `${josa(elem)} 이해하고 대체로 바르게 수행함`);
    parts.push(endDot(`${topic}${base}`));
    if (sc.note) parts.push(endDot(sc.note));
  }
  return parts.join(' ');
}

// ---------- 특기사항 ----------

export async function remarksView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const d = await api(`/api/bundle?year=${state.year}&modules=remarks,notes,evalPlans`);
  const area = remember('rm_area') || '교과학습발달상황';
  const subjects = [...new Set(d.evalPlans.map((p) => p.data.subject).filter(Boolean))];
  const subject = remember('rm_subj') || subjects[0] || '';
  const limit = Number(remember('rm_limit')) || 1500;
  const reload = () => remarksView(root);
  const areas = ['교과학습발달상황', '행동특성 및 종합의견', '창체-자율', '창체-동아리', '창체-진로', '기타'];
  const subjPlans = d.evalPlans.filter((p) => p.data.subject === subject);
  const find = (name) => d.remarks.find((r) => r.data.student === name && r.data.area === area && (area !== '교과학습발달상황' || (r.data.subject || '') === subject));
  const refs = (name) => [
    ...d.notes.filter((n) => n.data.student === name).map((n) => `[${n.data.date} ${n.data.category || ''}] ${n.data.content}`),
    ...d.evalPlans.filter((p) => p.data.scores?.[name]?.level && (area !== '교과학습발달상황' || p.data.subject === subject)).map((p) => `[${planTitle(p)} · ${p.data.scores[name].level}] ${p.data.scores[name].note || ''}`),
  ];
  const draftOf = (name) => (area === '교과학습발달상황'
    ? draftFor(name, subjPlans)
    : d.notes.filter((n) => n.data.student === name && ['칭찬', '관찰', '생활', '학습'].includes(n.data.category)).slice(-4).map((n) => endDot(n.data.content)).join(' '));
  const rows = [];
  const row = (s) => {
    const name = s.data.name;
    let rec = find(name);
    const ta = h('textarea', { rows: 3, value: rec?.data.content || '', placeholder: '특기사항' });
    const cnt = h('span', { class: 'muted small' });
    const st = h('span', { class: 'muted small' });
    const paint = () => { const b = byteLen(ta.value); cnt.textContent = `${[...ta.value].length}자 · ${b}바이트`; cnt.classList.toggle('danger', b > limit); };
    let timer;
    const save = () => {
      paint(); st.textContent = '…';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const data = { student: name, area, subject: area === '교과학습발달상황' ? subject : '', content: ta.value };
        try {
          rec = rec ? await api(`/api/records/remarks/${rec.id}`, { method: 'PUT', body: { data, version: rec.version } }) : await api('/api/records/remarks', { method: 'POST', body: { data, year: state.year } });
          st.textContent = '✓';
        } catch (e) { st.textContent = ''; toast(e.message, 'error'); }
      }, 800);
    };
    ta.addEventListener('input', save);
    paint();
    const r = refs(name);
    rows.push({ name, ta, save });
    return h('div', { class: 'remark-row' },
      h('div', { class: 'rm-name' }, h('span', { class: 'muted small' }, s.data.num ?? ''), ' ', h('strong', {}, name)),
      h('div', { class: 'rm-body' }, ta, h('div', { class: 'row-actions' }, cnt, st,
        h('button', { class: 'link-btn', onclick: () => { const t = draftOf(name); if (!t) { toast('초안을 만들 평가 결과·기록이 없습니다.', 'error'); return; } ta.value = ta.value ? `${ta.value} ${t}` : t; save(); } }, '✨ 초안'),
        h('span', { class: 'grow' }),
        r.length ? h('details', { class: 'rm-ref' }, h('summary', {}, `참고 ${r.length}건`), h('ul', { class: 'list small' }, r.map((x) => h('li', {}, x)))) : h('span', { class: 'muted small' }, '참고 기록 없음'))));
  };
  const bulk = () => {
    let n = 0;
    for (const x of rows) if (!x.ta.value.trim()) { const t = draftOf(x.name); if (t) { x.ta.value = t; x.save(); n++; } }
    toast(n ? `빈칸 ${n}명에 초안을 넣었습니다. 꼭 읽고 고쳐 주세요.` : '초안을 넣을 빈칸(또는 평가 결과)이 없습니다.', n ? 'ok' : 'error');
  };
  const exportCsv = () => {
    const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', '영역', '과목', '내용', '바이트'].map(esc).join(',')];
    for (const s of students) { const r = find(s.data.name); lines.push([s.data.num, s.data.name, area, area === '교과학습발달상황' ? subject : '', r?.data.content || '', byteLen(r?.data.content)].map(esc).join(',')); }
    download(`특기사항_${area}${area === '교과학습발달상황' ? `_${subject}` : ''}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  clear(root,
    h('div', { class: 'toolbar' },
      h('select', { onchange: (e) => { remember('rm_area', e.target.value); reload(); } }, areas.map((a) => h('option', { value: a, selected: a === area }, a))),
      area === '교과학습발달상황' ? h('select', { onchange: (e) => { remember('rm_subj', e.target.value); reload(); } },
        [...new Set([...subjects, subject].filter(Boolean))].map((x) => h('option', { value: x, selected: x === subject }, x))) : null,
      h('label', { class: 'inline' }, '기준 ', h('input', { type: 'number', value: limit, style: { width: '80px' }, onchange: (e) => { remember('rm_limit', Number(e.target.value) || 1500); reload(); } }), '바이트'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: bulk }, '✨ 빈칸 모두 초안 채우기'),
      h('button', { class: 'btn', onclick: () => copyText(students.map((s) => `${s.data.num ?? ''}\t${s.data.name}\t${find(s.data.name)?.data.content || ''}`).join('\n')) }, '전체 복사'),
      h('button', { class: 'btn', onclick: exportCsv }, 'CSV')),
    area === '교과학습발달상황' && !subjPlans.length ? h('p', { class: 'alert warn' }, `${subject || '이 교과'}의 평가 기록이 없어 자동 초안을 만들 수 없습니다. 평가 → 평가 현황·기록에서 먼저 기록해 주세요.`) : null,
    h('div', { class: 'remarks' }, students.map(row)),
    h('p', { class: 'hint' }, '✨ 초안은 채점 기준 문장(없으면 기본 문장)과 관찰 메모·누가기록을 이어 붙인 것이며, 기록에 없는 내용은 만들지 않습니다. 반드시 읽고 다듬어 주세요. 입력하면 자동 저장(암호화)됩니다. 바이트는 한글 3·영문 1·줄바꿈 2로 계산한 참고값입니다 [확인 필요].'));
}
