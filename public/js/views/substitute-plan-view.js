// 🗓 고정 보결표 화면: ① 하루 배정 보드 위 「오늘 고정 보결」 ② 고정 보결표 만들기·고치기 ③ 교사별·날짜별 보결 시수
//   빨강 = 보결, 검정 = 전담 수업. 칸에 '5-1'·'교무'·'체(교장)'처럼 적으면 자동으로 알아봄
import { h, api, clear, toast, modal, confirmBox, today, fmtDate, download } from '../ui.js';
import { state, canEdit, remember, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { seg } from './schedule.js';
import { PLAN_DAYS, ROLES, SUB_TEACHER, parseCell, cellOf, runsOn, entriesOn, tally, weeklyLoad, parsePasted, weekOf, addDay } from '../substitute-plan.js';
import { makeCtx, classDay, homeroomTeacher, candidates, subCounts, busyAt, lessonAt, roomOrder } from '../substitute-logic.js';
import { activeOn } from './timetable.js';

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
      }, h('small', {}, e.period.replace('교시', '')), h('b', { class: e.kind === 'sub' && !e.who && !e.cancelled ? 'todo' : '' }, e.kind === 'sub' ? (e.cancelled ? '취소' : e.who ? label(e.who) : '미배정') : e.subj || '—'), e.kind === 'sub' && e.subj ? h('em', {}, e.subj) : e.kind === 'class' && e.who ? h('em', {}, e.who) : null))));
  }));
}
function editDay(p, date, e, reload) {
  const { names } = staffResolver();
  const opts = [...new Set([...ROLES.slice(0, 6), ...names])];
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

// ② 고정 보결표: 반을 고르면 그 반 시간표를 불러와 칸마다 과목·전담이 채워지고, 보결 칸을 눌러 들어갈 선생님을 고름 (나이스 결보강 등록처럼)
//   위에는 실제 날짜가 붙은 한 주, 오른쪽에는 그 교시 후보 교사(공강·결강수·보강수). [매주 이 시간] 또는 [이 날만]으로 배정
const fxUI = { week: '', cell: null, plan: '' };
function ttCtx(d, date) {
  const staff = (state.staff || []).filter((s) => s.name);
  return makeCtx(d.timetables.filter((r) => r.data.kind && activeOn(r, date)), staff, date);
}
// 그 반 시간표 → 칸 (이미 고른 보결 교사는 그대로 둠)
function gridFromTimetable(d, p) {
  const start = p.data.start || today();
  const week = weekOf(start);
  const old = p.data.grid;
  let found = false; let maxP = 6;
  const days = week.map((date) => { const day = classDay(ttCtx(d, date), p.data.title); if (day) { found = true; maxP = Math.max(maxP, day.length); } return day || []; });
  const periods = Array.from({ length: maxP }, (_, i) => `${i + 1}교시`);
  const cells = periods.map((_, pi) => PLAN_DAYS.map((__, di) => {
    const x = days[di][pi];
    const prev = old?.cells?.[pi]?.[di];
    const prevWho = prev && typeof prev === 'object' && prev.kind === 'sub' ? prev.who : '';
    if (!x || !x.need) return { kind: '', subj: '', who: '' };
    if (x.specialist) return { kind: 'class', subj: x.subject, who: x.specialist };
    return { kind: 'sub', subj: x.subject, who: prevWho || '' };
  }));
  return { found, grid: { days: PLAN_DAYS.slice(), periods, cells } };
}

export function planTab(root, d, reload, isHoliday) {
  const plans = d.subPlans;
  const { names, label, nameOf } = staffResolver();
  const editable = canEdit('subPlans');
  const sel = plans.find((p) => p.id === remember('fx_sel')) || plans[0];
  const redraw = () => planTab(root, d, reload, isHoliday);
  const create = () => openRecordForm('subPlans', null, { defaults: { start: today(), end: yearEnd() }, onSaved: async (r) => {
    if (!r) return; remember('fx_sel', r.id);
    const { grid, found } = gridFromTimetable(d, r);
    try { await api(`/api/records/subPlans/${r.id}`, { method: 'PUT', body: { data: { ...r.data, grid }, version: r.version } }); } catch { /* 화면에서 다시 불러오기 */ }
    toast(found ? `${r.data.title} 시간표를 불러왔습니다. 빨간 칸(보결)을 눌러 들어갈 선생님을 고르세요.` : `${r.data.title} 학급 시간표가 없어 빈 표로 만들었습니다. 수업 → 시간표에 학급 시간표를 먼저 넣으면 자동으로 채워집니다.`);
    reload();
  } });
  if (!sel) {
    return clear(root, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🗓'),
      h('p', {}, '담임이 비어 있는 학급을 고르면 그 반 시간표를 불러와 전담 수업과 보결할 시간을 나눠 줍니다. 보결 칸마다 들어갈 선생님을 고르면 날짜마다 자동 배정되고 선생님별 시수가 집계됩니다.'),
      editable ? h('button', { class: 'btn primary', onclick: create }, '+ 고정 보결표 만들기') : null));
  }
  const p = sel;
  if (fxUI.plan !== p.id) { fxUI.plan = p.id; fxUI.cell = null; fxUI.week = ''; }
  const cls = p.data.title;
  // 표가 비어 있으면 시간표에서 자동으로 채움
  const emptyGridNow = !p.data.grid?.cells || p.data.grid.cells.every((r) => r.every((c) => !c || (!c.text && !c.subj && !c.who)));
  if (emptyGridNow && editable && !fxUI.autoTried?.[p.id]) {
    fxUI.autoTried = { ...(fxUI.autoTried || {}), [p.id]: true };
    const { grid, found } = gridFromTimetable(d, p);
    if (found) { savePlan(p, { grid }).then(() => { toast(`${cls} 시간표를 불러왔습니다.`); redraw(); }).catch((e) => toast(e.message, 'error')); return clear(root, h('p', { class: 'muted' }, `${cls} 시간표 불러오는 중…`)); }
  }
  if (!p.data.grid?.cells) p.data.grid = emptyGrid();
  const g = p.data.grid;
  const t = today();
  const start = p.data.start || t; const end = p.data.end || yearEnd();
  if (!fxUI.week) fxUI.week = weekOf(t < start ? start : t > end ? end : t)[0];
  const week = weekOf(fxUI.week);
  const save = async (patch, msg) => { try { await savePlan(p, patch); if (msg) toast(msg); redraw(); } catch (e) { toast(e.message, 'error'); } };

  // 보강수(실시)·결강수: 학년도 전체
  const y = Number(state.year);
  const tl = tally({ plans, records: d.substitutes, from: `${y}-03-01`, to: yearEnd(), today: t, isHoliday, names, resolve: nameOf });
  const absCnt = subCounts(d.substitutes);
  const counts = new Map([...new Set([...tl.keys(), ...absCnt.keys()])].map((n) => [n, { absent: absCnt.get(n)?.absent || 0, sub: (tl.get(n)?.fixed || 0) + (tl.get(n)?.extra || 0) }]));

  const colInfo = week.map((date) => {
    const out = date < start || date > end;
    const hol = isHoliday(date);
    const skip = (p.data.skip || []).includes(date);
    return { date, out, hol, skip, runs: !out && runsOn(p, date, isHoliday) };
  });
  // 겹침 확인: 배정한 선생님이 그 시간에 자기 수업(전담이 안 들어오는 담임 시간)·다른 보결·출장이 있는지
  const ctxCache = new Map();
  const ctxOn = (date) => { if (!ctxCache.has(date)) ctxCache.set(date, ttCtx(d, date)); return ctxCache.get(date); };
  const awayOn = (date) => new Set(d.trips.filter((tr) => date >= tr.data.date && date <= (tr.data.endDate || tr.data.date)).map((tr) => tr.data.person).filter(Boolean));
  const takenOn = (date, pi) => {
    const s0 = new Set(fixedBusy(plans.filter((x) => x !== p), date, isHoliday).get(pi + 1) || []);
    for (const r of d.substitutes) if (r.data.date === date && Number(String(r.data.period).match(/\d+/)?.[0]) === pi + 1 && r.data.substitute) s0.add(r.data.substitute);
    return s0;
  };
  const clashOf = (who, date, pi) => {
    if (!who) return '';
    const nm = nameOf(who);
    if (awayOn(date).has(nm)) return '그 날 복무·출장';
    if (takenOn(date, pi).has(nm)) return '다른 반 보결';
    const ls = lessonAt(ctxOn(date), nm, g.periods[pi]);
    return ls ? `${ls.cls} ${ls.subject}` : '';
  };
  let clashes = 0;
  const cellView = (pi, di) => {
    const ci = colInfo[di];
    const base = cellOf(p, pi, di, names);
    const e = ci.runs ? entriesOn(p, ci.date, names)[pi] : { ...base, changed: false, cancelled: false };
    const on = fxUI.cell && fxUI.cell.pi === pi && fxUI.cell.di === di;
    const kind = e.kind;
    const clash = ci.runs && kind === 'sub' && !e.cancelled ? clashOf(e.who, ci.date, pi) : '';
    if (clash) clashes++;
    return h('td', { title: clash ? `⚠ 겹침: ${clash}` : '', class: `fx-c ${kind} ${clash ? 'clash' : ''} ${ci.runs ? '' : 'off'} ${e.changed ? 'changed' : ''} ${e.cancelled ? 'cancel' : ''} ${on ? 'sel' : ''} ${kind === 'sub' && !e.who ? 'todo' : ''}`,
      onclick: () => { fxUI.cell = { pi, di }; fxUI.scroll = true; redraw(); } },
      kind ? h('small', {}, e.subj || '') : null,
      kind === 'sub' ? [h('b', {}, e.cancelled ? '없음' : e.who ? label(e.who) : '미배정'), clash ? h('i', { class: 'fx-clash' }, `⚠ ${clash}`) : null] : kind === 'class' ? h('b', { class: 'cls' }, e.who || '전담') : h('b', { class: 'none' }, ''));
  };
  // 오른쪽: 고른 칸의 후보 교사
  const panel = () => {
    if (!fxUI.cell) return h('div', { class: 'fx-panel empty' }, h('p', {}, '👈 표에서 칸을 누르면 그 시간에 들어갈 수 있는 선생님(공강 먼저)이 여기 나옵니다.'), h('p', { class: 'muted small' }, '빨강 = 보결 · 검정 = 전담 · 주황 = 아직 미배정'));
    const { pi, di } = fxUI.cell;
    const ci = colInfo[di]; const date = ci.date;
    const period = g.periods[pi];
    const base = cellOf(p, pi, di, names);
    const e = ci.runs ? entriesOn(p, date, names)[pi] : { ...base };
    const scope = ci.runs ? remember('fx_scope') || 'week' : 'week';
    const setCell = (patch, msg) => { const c = { ...base, ...patch }; g.cells[pi][di] = c; save({ grid: g }, msg); };
    const setDay = (val, msg) => { const ov = { ...(p.data.overrides || {}) }; const day = { ...(ov[date] || {}) }; if (val === undefined) delete day[pi]; else day[pi] = val; if (Object.keys(day).length) ov[date] = day; else delete ov[date]; save({ overrides: ov }, msg); };
    const doAssign = (who) => (scope === 'day' ? setDay({ who, kind: 'sub' }, `${md(date)} ${period} → ${label(who)} (이 날만)`) : setCell({ kind: 'sub', who }, `매주 ${PLAN_DAYS[di]} ${period} → ${label(who)}`));
    const ctx = ctxOn(date);
    // 배정 전 겹침 확인 (매주 배정이면 기간 안의 같은 요일 날짜들을 모두 확인)
    const assign = async (who) => {
      const dates = scope === 'day' ? [date] : (() => { const out = []; for (let x = date; x <= end; x = addDay(x, 7)) if (runsOn(p, x, isHoliday)) out.push(x); for (let x = addDay(date, -7); x >= start; x = addDay(x, -7)) if (runsOn(p, x, isHoliday)) out.push(x); return out.length ? out : [date]; })();
      const hits = dates.map((x) => [x, clashOf(who, x, pi)]).filter(([, r]) => r);
      if (hits.length && !(await confirmBox(`⚠ ${label(who)} 선생님은 이 시간에 겹치는 일정이 있습니다.\n${hits.slice(0, 6).map(([x, r]) => `· ${md(x)}(${PLAN_DAYS[di]}) ${period}: ${r}`).join('\n')}${hits.length > 6 ? `\n… 외 ${hits.length - 6}일` : ''}\n\n그래도 배정할까요?`))) return;
      doAssign(who);
    };
    const away = new Set(d.trips.filter((tr) => date >= tr.data.date && date <= (tr.data.endDate || tr.data.date)).map((tr) => tr.data.person).filter(Boolean));
    const hr = homeroomTeacher(ctx, cls); if (hr) away.add(hr);
    const taken = fixedBusy(plans.filter((x) => x !== p), date, isHoliday).get(pi + 1) || new Set();
    for (const r of d.substitutes) if (r.data.date === date && Number(String(r.data.period).match(/\d+/)?.[0]) === pi + 1 && r.data.substitute) taken.add(r.data.substitute);
    const sortBy = remember('sub_sort') || 'avail';
    const list = candidates(ctx, { period, cls, subject: base.subj, absentName: hr, absentees: away, counts })
      .map((c) => (taken.has(c.name) && c.status !== 'absent' ? { ...c, status: 'busy', taken: true } : c));
    if (sortBy === 'class') list.sort((a, b) => roomOrder(a.room) - roomOrder(b.room) || a.name.localeCompare(b.name, 'ko'));
    const ST = { free: '공강', unknown: '기타', busy: '수업', absent: '부재' };
    const custom = h('input', { list: 'fx-roles', placeholder: '직접 입력 (예: 교장, 교무, 강사)' });
    const cur = e.kind === 'sub' ? (e.cancelled ? '이 날 보결 없음' : e.who ? label(e.who) : '미배정') : e.kind === 'class' ? `전담 · ${e.who || ''}` : '수업 없음';
    return h('div', { class: 'fx-panel' },
      h('div', { class: 'fx-ph' }, h('h4', {}, `${md(date)}(${PLAN_DAYS[di]}) ${period}`, h('span', {}, ` · ${cls} ${base.subj || ''}`)), h('button', { class: 'link-btn small', onclick: () => { fxUI.cell = null; redraw(); } }, '닫기')),
      h('div', { class: 'fx-cur' }, h('span', {}, '지금: '), h('b', { class: e.kind === 'sub' ? 'r' : '' }, cur), e.changed ? h('span', { class: 'tag ghost' }, '이 날만 바뀜') : null, !ci.runs ? h('span', { class: 'tag ghost' }, ci.hol || (ci.out ? '기간 밖' : ci.skip ? '빠지는 날' : '운영 안 함')) : null),
      editable ? h('div', { class: 'fx-kind' },
        h('div', { class: 'seg' }, [['sub', '🔴 보결'], ['class', '⚫ 전담']].map(([k, l]) => h('button', { class: base.kind === k ? 'on' : '', onclick: () => setCell({ kind: k, who: k === base.kind ? base.who : '' }) }, l))),
        h('input', { value: base.subj || '', placeholder: '과목', style: { width: '90px' }, onchange: (ev) => setCell({ subj: ev.target.value.trim() }) }),
        base.kind === 'class' ? h('input', { value: base.who || '', placeholder: '전담 선생님', style: { width: '120px' }, onchange: (ev) => setCell({ who: ev.target.value.trim() }) }) : null) : null,
      editable && base.kind !== 'class' ? [
        ci.runs ? h('div', { class: 'fx-scope' }, h('span', { class: 'muted small' }, '배정 범위 '), h('div', { class: 'seg' }, [['week', `🔁 매주 ${PLAN_DAYS[di]} ${period}`], ['day', `📅 ${md(date)}만`]].map(([k, l]) => h('button', { class: scope === k ? 'on' : '', onclick: () => { remember('fx_scope', k); redraw(); } }, l)))) : null,
        h('div', { class: 'fx-sort' }, h('span', { class: 'muted small' }, '정렬 '), h('div', { class: 'seg' }, [['avail', '가능한 순'], ['class', '학년반 순 (1-1부터)']].map(([k, l]) => h('button', { class: sortBy === k ? 'on' : '', onclick: () => { remember('sub_sort', k); redraw(); } }, l)))),
        h('div', { class: 'table-wrap fx-cands' }, h('table', { class: 'table compact' },
          h('thead', {}, h('tr', {}, ['구분', '교사', '결강', '보강', '그 시간'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
          h('tbody', {}, h('tr', { class: `click st-free fx-subt-row ${e.who === SUB_TEACHER ? 'picked' : ''}`, onclick: () => assign(SUB_TEACHER) },
            h('td', {}, h('span', { class: 'fx-st free' }, '강사')), h('td', {}, h('b', {}, `🧑‍🏫 ${SUB_TEACHER}`)), h('td', { class: 'num' }, '-'), h('td', { class: 'num' }, counts.get(SUB_TEACHER)?.sub || 0), h('td', { class: 'num' }, '보결 전담')),
            list.map((c) => h('tr', { class: `click st-${c.status} ${c.sameSubject ? 'same' : ''} ${e.who && nameOf(e.who) === c.name ? 'picked' : ''}`, onclick: () => assign(c.name) },
            h('td', {}, h('span', { class: `fx-st ${c.status}` }, ST[c.status])), h('td', {}, h('b', {}, c.name), c.room ? h('small', { class: 'muted' }, ` ${c.room}`) : null, c.sameSubject ? h('span', { class: 'fx-tag' }, '같은 과목') : c.sameGrade ? h('span', { class: 'fx-tag g' }, '같은 학년') : null),
            h('td', { class: 'num' }, c.absentCnt || 0), h('td', { class: 'num' }, c.subCnt || 0), h('td', { class: 'num fx-why' }, c.status === 'busy' ? (c.taken ? '다른 보결' : c.lesson ? `${c.lesson.cls} ${c.lesson.subject}` : '수업') : c.status === 'free' ? '비어 있음' : c.status === 'absent' ? '출장 등' : '모름')))))),
        h('div', { class: 'fx-roles' }, h('button', { class: 'btn small fx-subt', onclick: () => assign(SUB_TEACHER) }, `🧑‍🏫 ${SUB_TEACHER}`), ['교장', '교감', '교무', '연구'].map((r) => h('button', { class: 'btn small', onclick: () => assign(r) }, r)), custom, h('datalist', { id: 'fx-roles' }, [...ROLES, ...names].map((n) => h('option', { value: n }))), h('button', { class: 'btn small primary', onclick: () => { const v = custom.value.trim(); if (v) assign(v); } }, '지정')),
        h('div', { class: 'row-actions' },
          scope === 'week' && base.who ? h('button', { class: 'btn small ghost', onclick: () => setCell({ who: '' }, '미배정으로 바꿨습니다.') }, '매주 배정 지우기') : null,
          scope === 'day' && e.changed ? h('button', { class: 'btn small', onclick: () => setDay(undefined, '원래대로 돌렸습니다.') }, '이 날 원래대로') : null,
          scope === 'day' && !e.cancelled ? h('button', { class: 'btn small danger ghost', onclick: () => setDay(null, '이 날은 보결 없음으로 했습니다.') }, '이 날 보결 없음') : null),
      ] : null,
      h('p', { class: 'muted small' }, '공강 = 그 시간 수업 없음 · 기타 = 담임·전담 미지정(시간 모름) · 수업 = 그 시간 수업 또는 다른 보결 · 부재 = 그 날 복무·출장. 노란 줄 = 같은 과목 선생님. 결강·보강 = 올해 횟수.'));
  };
  const load = weeklyLoad(p, names);
  const total = [...load.values()].reduce((a, b) => a + b, 0);
  const paste = h('textarea', { rows: 4, placeholder: '엑셀·한글에서 보결표를 복사해 붙여넣으세요 (요일 머리글·교시 칸이 있어도 됩니다)' });
  const skipIn = h('input', { type: 'date' });
  const weekLabel = `${md(week[0])}~${md(week[4])}`;
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'fx-plans' }, plans.map((x) => h('button', { class: `chip ${x === p ? 'on' : ''}`, onclick: () => { remember('fx_sel', x.id); redraw(); } }, `${x.data.title}`, h('small', {}, ` ${md(x.data.start)}~${md(x.data.end) || ''}`)))),
      h('span', { class: 'grow' }),
      editable ? h('button', { class: 'btn', onclick: create }, '+ 고정 보결표') : null),
    h('div', { class: 'fx-title' }, h('h3', {}, cls), h('span', { class: 'muted' }, `${fmtDate(start)} ~ ${fmtDate(end)}`), p.data.note ? h('span', { class: 'tag ghost' }, p.data.note) : null,
      h('span', { class: 'fx-wk' }, `주당 보결 `, h('b', {}, total), '시간', load.unassigned ? h('em', {}, ` · 미배정 ${load.unassigned}`) : null, h('span', { class: 'fx-clashn' })),
      h('span', { class: 'grow' }),
      editable ? h('button', { class: 'btn small', title: '학급 시간표에서 과목·전담을 다시 불러옵니다 (고른 보결 교사는 그대로)', onclick: async () => { const { grid, found } = gridFromTimetable(d, p); if (!found) { toast(`${cls} 학급 시간표가 없습니다. 수업 → 시간표에서 먼저 넣어 주세요.`, 'error'); return; } save({ grid }, '시간표를 다시 불러왔습니다.'); } }, '📥 시간표 다시 불러오기') : null,
      editable ? h('button', { class: 'btn small', onclick: () => openRecordForm('subPlans', p, { onSaved: reload }) }, '기간·이름') : null,
      editable ? h('button', { class: 'btn small danger ghost', onclick: async () => { if (!(await confirmBox(`'${cls}' 고정 보결표를 지울까요? (날짜별 집계에서도 빠집니다)`))) return; await api(`/api/records/subPlans/${p.id}`, { method: 'DELETE' }); remember('fx_sel', null); reload(); } }, '삭제') : null),
    h('div', { class: 'fx-weeknav' },
      h('button', { class: 'btn small', onclick: () => { fxUI.week = addDay(week[0], -7); redraw(); } }, '◀ 이전 주'),
      h('strong', {}, weekLabel),
      h('button', { class: 'btn small', onclick: () => { fxUI.week = addDay(week[0], 7); redraw(); } }, '다음 주 ▶'),
      !week.includes(t) ? h('button', { class: 'btn small ghost', onclick: () => { fxUI.week = weekOf(t)[0]; redraw(); } }, '이번 주') : null),
    h('div', { class: 'fx-editor' },
      h('div', { class: 'fx-main' },
        h('table', { class: 'fx-grid fx-week' },
          h('thead', {}, h('tr', {}, h('th', { class: 'fx-corner' }, cls), colInfo.map((c, di) => h('th', { class: `${c.runs ? '' : 'off'} ${c.date === t ? 'today' : ''}` }, h('div', {}, PLAN_DAYS[di]), h('small', {}, md(c.date)), !c.runs ? h('em', {}, c.hol || (c.out ? '기간 밖' : c.skip ? '빠지는 날' : '')) : null)))),
          h('tbody', {}, g.periods.map((per, pi) => h('tr', {}, h('th', {}, per), PLAN_DAYS.map((_, di) => cellView(pi, di)))))),
        h('div', { class: 'fx-load2' }, [...load].sort((a, b) => b[1] - a[1]).map(([w, n]) => h('span', { class: 'fx-chip' }, `${label(w)} ${n}`))),
        h('details', { class: 'fx-paste' }, h('summary', {}, '빠지는 날 · 엑셀 붙여넣기'),
          h('p', { class: 'muted small' }, '학사일정의 휴일·방학은 자동으로 빠집니다. 그 밖에 운영하지 않는 날만 넣으세요.'),
          h('div', { class: 'chips-row' }, (p.data.skip || []).map((x) => h('span', { class: 'tag' }, md(x), editable ? h('button', { class: 'link-btn small', onclick: () => save({ skip: p.data.skip.filter((z) => z !== x) }) }, ' ✕') : null))),
          editable ? h('div', { class: 'row-actions' }, skipIn, h('button', { class: 'btn small', onclick: () => { if (skipIn.value) save({ skip: [...new Set([...(p.data.skip || []), skipIn.value])].sort() }); } }, '+ 빠지는 날')) : null,
          editable ? [paste, h('button', { class: 'btn small', onclick: () => {
            const rows = parsePasted(paste.value); if (!rows.length) { toast('표를 찾지 못했습니다.', 'error'); return; }
            rows.slice(0, g.periods.length).forEach((r, pi) => r.forEach((txt, di) => { if (!g.cells[pi]) return; const c = parseCell(txt, names); const old = cellOf(p, pi, di, names); g.cells[pi][di] = c.kind === 'sub' ? { kind: 'sub', subj: c.subj || old.subj, who: c.who } : c.kind === 'class' ? { kind: 'class', subj: c.subj, who: old.kind === 'class' ? old.who : '' } : { kind: '', subj: '', who: '' }; }));
            save({ grid: g }, '붙여넣었습니다.');
          } }, '표에 채우기')] : null)),
      panel()));
  const cn = root.querySelector('.fx-clashn'); if (cn && clashes) cn.textContent = ` · ⚠ 이 주 겹침 ${clashes}`;
  if (fxUI.scroll) { fxUI.scroll = false; const el = root.querySelector('.fx-panel'); if (el && window.innerWidth < 1100) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
