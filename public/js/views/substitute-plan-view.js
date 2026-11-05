// 🗓 고정 보결표 화면: ① 하루 배정 보드 위 「오늘 고정 보결」 ② 고정 보결표 만들기·고치기 ③ 교사별·날짜별 보결 시수
//   빨강 = 보결, 검정 = 전담 수업. 칸에 '5-1'·'교무'·'체(교장)'처럼 적으면 자동으로 알아봄
import { h, api, clear, toast, modal, confirmBox, today, fmtDate, download } from '../ui.js';
import { state, canEdit, remember, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { seg } from './schedule.js';
import { PLAN_DAYS, ROLES, parseCell, runsOn, entriesOn, tally, weeklyLoad, parsePasted } from '../substitute-plan.js';

const PERIODS = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'];
const emptyGrid = () => ({ days: PLAN_DAYS.slice(), periods: PERIODS.slice(), cells: PERIODS.map(() => PLAN_DAYS.map(() => ({ text: '' }))) });
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : '');
const yearEnd = () => { const y = Number(state.year) + 1; return `${y}-02-${new Date(y, 2, 0).getDate()}`; };

// 학급 이름('5-1') → 그 반 담임 이름 (학교 관리에서 담임 지정한 경우)
export function staffResolver() {
  const staff = (state.staff || []).filter((s) => s.name);
  const byRoom = new Map(staff.filter((s) => s.homeroom).map((s) => [String(s.homeroom).replace(/\s/g, ''), s.name]));
  const names = staff.map((s) => s.name);
  return { names, nameOf: (w) => byRoom.get(w) || w, label: (w) => (byRoom.get(w) ? `${w} ${byRoom.get(w)}` : w) };
}

async function savePlan(p, patch) {
  const saved = await api(`/api/records/subPlans/${p.id}`, { method: 'PUT', body: { data: { ...p.data, ...patch }, version: p.version } });
  Object.assign(p, saved);
  return p;
}

// 같은 날·교시에 고정 보결로 들어가는 사람 (하루 배정 보드의 '다른 보결' 판단용)
export function fixedBusy(plans, date, isHoliday) {
  const { names, nameOf } = staffResolver();
  const m = new Map();
  for (const p of plans) if (runsOn(p, date, isHoliday)) for (const e of entriesOn(p, date, names)) if (e.kind === 'sub' && !e.cancelled && e.who) {
    const k = Number(String(e.period).match(/\d+/)?.[0]) || 0;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(nameOf(e.who));
  }
  return m;
}

// ① 하루 배정 보드 위: 그 날 고정 보결 (칸을 누르면 그 날만 바꾸기·취소)
export function fixedToday(plans, date, { isHoliday, reload }) {
  if (!plans.length) return null;
  const { names, label } = staffResolver();
  const editable = canEdit('subPlans');
  const rows = plans.filter((p) => (!p.data.start || date >= p.data.start) && (!p.data.end || date <= p.data.end));
  if (!rows.length) return null;
  return h('div', { class: 'fx-today' }, rows.map((p) => {
    const hol = isHoliday(date);
    if (!runsOn(p, date, isHoliday)) return h('div', { class: 'fx-row off' }, h('strong', { class: 'fx-cls' }, `🗓 ${p.data.title}`), h('span', { class: 'muted' }, hol ? `${hol} — 쉬는 날` : (p.data.skip || []).includes(date) ? '이 날은 빠지는 날로 정했습니다' : '수업 없는 날'));
    const es = entriesOn(p, date, names);
    const n = es.filter((e) => e.kind === 'sub' && !e.cancelled).length;
    return h('div', { class: 'fx-row' },
      h('div', { class: 'fx-head' }, h('strong', { class: 'fx-cls' }, `🗓 ${p.data.title} 고정 보결`), h('span', { class: 'fx-n' }, `보결 ${n}시간`)),
      h('div', { class: 'fx-cells' }, es.map((e) => h('button', {
        class: `fx-cell ${e.kind} ${e.cancelled ? 'cancel' : ''} ${e.changed ? 'changed' : ''}`, disabled: !editable || e.kind !== 'sub',
        title: e.kind === 'sub' ? (editable ? '눌러서 이 날만 바꾸기·취소' : '') : '전담 수업',
        onclick: () => editDay(p, date, e, reload),
      }, h('small', {}, e.period.replace('교시', '')), h('b', {}, e.kind === 'sub' ? (e.cancelled ? '취소' : label(e.who)) : e.subj || '—'), e.kind === 'sub' && e.subj ? h('em', {}, e.subj) : null))));
  }));
}
function editDay(p, date, e, reload) {
  const { names } = staffResolver();
  const opts = [...new Set([...ROLES.slice(0, 4), ...names])];
  const input = h('input', { list: 'fx-who', value: e.cancelled ? '' : e.who, placeholder: '보결 교사 (이름·학급·직책)' });
  const set = async (val, close) => {
    const ov = { ...(p.data.overrides || {}) }; const day = { ...(ov[date] || {}) };
    if (val === undefined) delete day[e.pi]; else day[e.pi] = val;
    if (Object.keys(day).length) ov[date] = day; else delete ov[date];
    try { await savePlan(p, { overrides: ov }); toast('저장했습니다.'); close(); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  modal(`${fmtDate(date)} ${e.period} · ${p.data.title}`, h('div', { class: 'form' },
    h('p', { class: 'muted small' }, `고정 보결표: ${e.was || e.who || '—'}${e.subj ? ` (${e.subj})` : ''}. 여기서 바꾸면 이 날만 바뀌고 시수 집계에도 반영됩니다.`),
    input, h('datalist', { id: 'fx-who' }, opts.map((n) => h('option', { value: n })))), [
    (close) => h('button', { class: 'btn', onclick: close }, '닫기'),
    (close) => e.changed ? h('button', { class: 'btn', onclick: () => set(undefined, close) }, '원래대로') : null,
    (close) => h('button', { class: 'btn danger ghost', onclick: () => set(null, close) }, '이 날 보결 없음'),
    (close) => h('button', { class: 'btn primary', onclick: () => { const v = input.value.trim(); if (!v) { toast('보결 교사를 적어 주세요.', 'error'); return; } set({ who: v }, close); } }, '바꾸기'),
  ].filter(Boolean));
}

// ② 고정 보결표 만들기·고치기
export function planTab(root, d, reload) {
  const plans = d.subPlans;
  const { names, label } = staffResolver();
  const editable = canEdit('subPlans');
  const sel = plans.find((p) => p.id === remember('fx_sel')) || plans[0];
  const create = () => openRecordForm('subPlans', null, { defaults: { start: today(), end: yearEnd() }, onSaved: async (r) => {
    if (!r) return; remember('fx_sel', r.id);
    try { await api(`/api/records/subPlans/${r.id}`, { method: 'PUT', body: { data: { ...r.data, grid: emptyGrid() }, version: r.version } }); } catch { /* 빈 표는 화면에서 채움 */ }
    reload();
  } });
  if (!sel) {
    return clear(root, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🗓'),
      h('p', {}, '담임이 비어 있는 학급의 요일×교시 보결표를 한 번 만들어 두면, 날짜마다 자동으로 배정되고 선생님별 시수가 집계됩니다.'),
      editable ? h('button', { class: 'btn primary', onclick: create }, '+ 고정 보결표 만들기') : null));
  }
  const p = sel;
  if (!p.data.grid?.cells) p.data.grid = emptyGrid();
  const g = p.data.grid;
  const status = h('span', { class: 'muted small' });
  const side = h('div', { class: 'fx-side' });
  let timer = null;
  const queue = () => { status.textContent = '저장 중…'; clearTimeout(timer); timer = setTimeout(async () => { try { await savePlan(p, { grid: g }); status.textContent = '✓ 저장됨'; } catch (e) { status.textContent = ''; toast(e.message, 'error'); } }, 600); };
  const drawSide = () => {
    const load = weeklyLoad(p, names);
    const total = [...load.values()].reduce((a, b) => a + b, 0);
    clear(side,
      h('div', { class: 'fx-total' }, h('span', {}, '한 주 보결'), h('b', {}, total), h('span', {}, '시간')),
      h('ul', { class: 'fx-load' }, [...load].sort((a, b) => b[1] - a[1]).map(([w, n]) => h('li', {}, h('span', {}, label(w)), h('b', {}, `${n}`)))));
  };
  const cellEl = (pi, di) => {
    const c = g.cells[pi][di] || (g.cells[pi][di] = { text: '' });
    const td = h('td', { class: 'fx-td' });
    const paint = () => { const k = parseCell(c.text, names, c.force).kind; td.className = `fx-td ${k}`; flip.textContent = k === 'sub' ? '보결' : k === 'class' ? '전담' : ''; };
    const input = h('input', { value: c.text || '', disabled: !editable, 'aria-label': `${g.days[di]} ${g.periods[pi]}`, oninput: (e) => { c.text = e.target.value; paint(); drawSide(); queue(); },
      onkeydown: (e) => { const mv = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0] }[e.key]; if (mv && !e.isComposing) { e.preventDefault(); root.querySelector(`[data-c="${pi + mv[0]}-${di + mv[1]}"]`)?.focus(); } }, 'data-c': `${pi}-${di}` });
    const flip = h('button', { class: 'fx-flip', title: '보결/전담 바꾸기', disabled: !editable, onclick: () => { const k = parseCell(c.text, names, c.force).kind; c.force = k === 'sub' ? 'class' : 'sub'; paint(); drawSide(); queue(); } });
    td.append(input, flip); paint();
    return td;
  };
  const paste = h('textarea', { rows: 4, placeholder: '엑셀·한글에서 표를 복사해 붙여넣으세요 (요일 머리글·교시 칸이 있어도 됩니다)' });
  const skipIn = h('input', { type: 'date' });
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'fx-plans' }, plans.map((x) => h('button', { class: `chip ${x === p ? 'on' : ''}`, onclick: () => { remember('fx_sel', x.id); reload(); } }, `${x.data.title}`, h('small', {}, ` ${md(x.data.start)}~${md(x.data.end) || ''}`)))),
      h('span', { class: 'grow' }),
      editable ? h('button', { class: 'btn', onclick: create }, '+ 고정 보결표') : null),
    h('div', { class: 'fx-editor' },
      h('div', { class: 'fx-main' },
        h('div', { class: 'fx-title' }, h('h3', {}, p.data.title), h('span', { class: 'muted' }, `${fmtDate(p.data.start)} ~ ${p.data.end ? fmtDate(p.data.end) : '학년도 끝'}`), p.data.note ? h('span', { class: 'tag ghost' }, p.data.note) : null, h('span', { class: 'grow' }), status,
          editable ? h('button', { class: 'btn small', onclick: () => openRecordForm('subPlans', p, { onSaved: reload }) }, '기간·이름') : null,
          editable ? h('button', { class: 'btn small danger ghost', onclick: async () => { if (!(await confirmBox(`'${p.data.title}' 고정 보결표를 지울까요? (날짜별 집계에서도 빠집니다)`))) return; await api(`/api/records/subPlans/${p.id}`, { method: 'DELETE' }); remember('fx_sel', null); reload(); } }, '삭제') : null),
        h('table', { class: 'fx-grid' },
          h('thead', {}, h('tr', {}, h('th', { colspan: 1, class: 'fx-corner' }, p.data.title), g.days.map((x) => h('th', {}, x)))),
          h('tbody', {}, g.periods.map((per, pi) => h('tr', {}, h('th', {}, per), g.days.map((_, di) => cellEl(pi, di)))))),
        h('p', { class: 'hint' }, h('b', { class: 'fx-red' }, '빨강 = 보결'), ' · ', h('b', {}, '검정 = 전담'), ' — 학급(5-1)·교장·교감·교무·연구·선생님 이름은 보결로, 과목(과·영·도)은 전담으로 자동 구분합니다. 「체(교장)」처럼 쓰면 체육을 교장 선생님이 보결. 잘못 잡히면 칸의 작은 표시를 누르세요.'),
        editable ? h('details', { class: 'fx-paste' }, h('summary', {}, '📋 엑셀 표 붙여넣기'), paste,
          h('button', { class: 'btn small', onclick: () => { const rows = parsePasted(paste.value); if (!rows.length) { toast('표를 찾지 못했습니다.', 'error'); return; } rows.slice(0, g.periods.length).forEach((r, pi) => r.forEach((t, di) => { if (g.cells[pi]?.[di]) g.cells[pi][di] = { text: t }; })); queue(); planTab(root, d, reload); } }, '표에 채우기')) : null),
      h('div', {},
        side,
        h('div', { class: 'fx-skip' }, h('h4', {}, '빠지는 날'),
          h('p', { class: 'muted small' }, '학사일정의 휴일·방학은 자동으로 빠집니다. 그 밖에 운영하지 않는 날만 넣으세요.'),
          h('div', { class: 'chips-row' }, (p.data.skip || []).map((x) => h('span', { class: 'tag' }, md(x), editable ? h('button', { class: 'link-btn small', onclick: async () => { await savePlan(p, { skip: p.data.skip.filter((y) => y !== x) }); reload(); } }, ' ✕') : null))),
          editable ? h('div', { class: 'row-actions' }, skipIn, h('button', { class: 'btn small', onclick: async () => { if (!skipIn.value) return; await savePlan(p, { skip: [...new Set([...(p.data.skip || []), skipIn.value])].sort() }); reload(); } }, '+ 추가')) : null))));
  drawSide();
}

// ③ 교사별·날짜별 보결 시수
export function countTab(root, d, isHoliday, reload) {
  const { names, nameOf } = staffResolver();
  const t = today();
  const y = Number(state.year);
  const ranges = { year: [`${y}-03-01`, yearEnd(), `${y}학년도`], s1: [`${y}-03-01`, `${y}-08-31`, '1학기'], s2: [`${y}-09-01`, yearEnd(), '2학기'], month: [`${t.slice(0, 7)}-01`, `${t.slice(0, 7)}-31`, `${Number(t.slice(5, 7))}월`] };
  const rk = remember('fx_range') || 'year';
  const view = remember('fx_view') || 'teacher';
  const [from, to, rlabel] = ranges[rk] || ranges.year;
  const data = tally({ plans: d.subPlans, records: d.substitutes, from, to, today: t, isHoliday, names, resolve: nameOf });
  const rows = [...data].map(([who, x]) => ({ who, ...x, done: x.fixed + x.extra })).filter((r) => r.done || r.planned).sort((a, b) => b.done - a.done || b.planned - a.planned || a.who.localeCompare(b.who, 'ko'));
  const months = [...new Set(rows.flatMap((r) => Object.keys(r.months)))].sort();
  const me = myName();
  const open = new Set(remember('fx_open') || []);
  const tot = rows.reduce((a, r) => ({ f: a.f + r.fixed, e: a.e + r.extra, p: a.p + r.planned }), { f: 0, e: 0, p: 0 });
  const max = Math.max(1, ...rows.map((r) => r.done));
  const csv = () => {
    const head = ['교사', ...months.map((m) => `${Number(m.slice(5))}월`), '고정', '수시', '합계', '예정'];
    const body = rows.map((r) => [r.who, ...months.map((m) => r.months[m] || 0), r.fixed, r.extra, r.done, r.planned]);
    download(`보결시수_${rlabel}.csv`, '﻿' + [head, ...body].map((x) => x.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
  const seg2 = (opts, cur, key) => seg(opts, cur, (v) => { remember(key, v); reload(); });
  const teacherTable = () => h('div', { class: 'table-wrap' }, h('table', { class: 'table compact fx-count' },
    h('thead', {}, h('tr', {}, h('th', {}, '교사'), months.map((m) => h('th', { class: 'num' }, `${Number(m.slice(5))}월`)), h('th', { class: 'num' }, '고정'), h('th', { class: 'num' }, '수시'), h('th', { class: 'num fx-sum' }, '합계'), h('th', { class: 'num muted' }, '예정'))),
    h('tbody', {}, rows.map((r) => [
      h('tr', { class: `click ${r.who === me ? 'hl' : ''}`, onclick: () => { open.has(r.who) ? open.delete(r.who) : open.add(r.who); remember('fx_open', [...open]); reload(); } },
        h('td', { class: 'fx-who' }, h('span', {}, open.has(r.who) ? '▾ ' : '▸ ', r.who), h('i', { class: 'fx-bar', style: { width: `${(r.done / max) * 100}%` } })),
        months.map((m) => h('td', { class: 'num' }, r.months[m] || '')),
        h('td', { class: 'num' }, r.fixed || ''), h('td', { class: 'num' }, r.extra || ''), h('td', { class: 'num fx-sum' }, h('b', {}, r.done)), h('td', { class: 'num muted' }, r.planned || '')),
      open.has(r.who) ? h('tr', { class: 'fx-detail' }, h('td', { colspan: months.length + 5 }, r.log.length ? h('div', { class: 'fx-log' }, r.log.map((l) => h('span', { class: `fx-chip ${l.src === '수시' ? 'extra' : ''}` }, `${md(l.date)} ${String(l.period).replace('교시', '')}교시 ${l.cls}${l.subj ? `·${l.subj}` : ''}`))) : h('span', { class: 'muted' }, '아직 실시한 보결이 없습니다 (예정만 있음)'))) : null])),
    h('tfoot', {}, h('tr', {}, h('td', { class: 'strong' }, '합계'), months.map((m) => h('td', { class: 'num strong' }, rows.reduce((a, r) => a + (r.months[m] || 0), 0))), h('td', { class: 'num strong' }, tot.f), h('td', { class: 'num strong' }, tot.e), h('td', { class: 'num strong fx-sum' }, tot.f + tot.e), h('td', { class: 'num muted' }, tot.p)))));
  // 날짜별: 고정 보결표마다 날짜 × 교시 (오늘까지, 최근 날짜가 위)
  const dateTable = () => d.subPlans.map((p) => {
    const a = p.data.start && p.data.start > from ? p.data.start : from;
    const b0 = p.data.end && p.data.end < to ? p.data.end : to;
    const dates = [];
    for (let x = a; x <= b0; ) { if (runsOn(p, x, isHoliday)) dates.push(x); const [yy, mm, dd] = x.split('-').map(Number); const n = new Date(yy, mm - 1, dd + 1); x = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
    const per = p.data.grid?.periods || PERIODS;
    const past = dates.filter((x) => x <= t).reverse(); const next = dates.filter((x) => x > t).slice(0, 5);
    const row = (x, future) => { const es = entriesOn(p, x, names); return h('tr', { class: `${x === t ? 'hl' : ''} ${future ? 'fx-future' : ''}` }, h('td', { class: 'nowrap' }, fmtDate(x)), es.map((e) => h('td', { class: `fx-dc ${e.kind} ${e.cancelled ? 'cancel' : ''} ${e.changed ? 'changed' : ''}` }, e.kind === 'sub' ? (e.cancelled ? '—' : e.who) : e.subj)), h('td', { class: 'num' }, es.filter((e) => e.kind === 'sub' && !e.cancelled).length)); };
    return h('section', { class: 'section' }, h('h3', {}, `🗓 ${p.data.title}`, h('span', { class: 'muted small' }, ` 실시 ${past.length}일`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact fx-dates' },
        h('thead', {}, h('tr', {}, h('th', {}, '날짜'), per.map((x) => h('th', {}, x.replace('교시', ''))), h('th', { class: 'num' }, '보결'))),
        h('tbody', {}, next.slice().reverse().map((x) => row(x, true)), past.map((x) => row(x, false))))));
  });
  clear(root,
    h('div', { class: 'toolbar' },
      seg2([['teacher', '👩‍🏫 교사별'], ['date', '📅 날짜별']], view, 'fx_view'),
      seg2([['month', ranges.month[2]], ['s1', '1학기'], ['s2', '2학기'], ['year', '학년도']], rk, 'fx_range'),
      h('span', { class: 'grow' }),
      view === 'teacher' && rows.length ? h('button', { class: 'btn small', onclick: csv }, '엑셀(CSV) 저장') : null),
    h('div', { class: 'fx-kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, `${rlabel} 보결 (오늘까지)`), h('div', { class: 'kpi-value' }, tot.f + tot.e, h('span', { class: 'muted small' }, ' 시간'))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '고정 보결표'), h('div', { class: 'kpi-value' }, tot.f)),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '수시 보결 (출장·연가 등)'), h('div', { class: 'kpi-value' }, tot.e)),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '앞으로 예정'), h('div', { class: 'kpi-value muted' }, tot.p))),
    view === 'teacher' ? (rows.length ? teacherTable() : h('p', { class: 'muted' }, '이 기간에 보결 기록이 없습니다.')) : (d.subPlans.length ? dateTable() : h('p', { class: 'muted' }, '고정 보결표가 없습니다.')),
    h('p', { class: 'hint' }, '고정 = 고정 보결표에서 날짜마다 자동 계산(휴일·빠지는 날·그 날 취소 제외) · 수시 = 하루 배정 보드에서 넣은 보결 · 예정 = 내일 이후 고정 보결. 학급(5-1)은 학교 관리에서 담임을 지정하면 선생님 이름으로 합쳐집니다. 이름을 누르면 날짜별 내역이 펼쳐집니다.'));
}
