// 학사일정: 월간 달력 · 목록 (학년도 = 1월 ~ 다음해 2월, 14개월)
import { yearMonths, NO_SCHOOL_CATEGORIES } from '../modules.js';
import { h, api, clear, pad, fmtDate, addDays, today, DOW } from '../ui.js';
import { state, canEdit } from '../state.js';
import { openRecordForm } from '../form.js';

const CAT_CLASS = { 행사: 'c-event', 특별수업: 'c-program', 회의: 'c-meeting', 연수: 'c-training', 공휴일: 'c-holiday', 휴업일: 'c-holiday', 방학: 'c-holiday', 기타: 'c-etc' };

const ui = { month: null, showPrograms: true, showTrips: true, dept: '', q: '', mode: typeof window !== 'undefined' && window.innerWidth < 700 ? 'list' : 'month' };

export async function calendarView(root) {
  const months = yearMonths(state.year);
  if (!ui.month || !months.some((m) => m.y === ui.month.y && m.m === ui.month.m) ) {
    const now = new Date();
    ui.month = months.find((m) => m.y === now.getFullYear() && m.m === now.getMonth() + 1) || months[2];
  }
  const data = await api(`/api/bundle?year=${state.year}&modules=events,programs,trips,monthNotes`);
  render(root, data, months);
}

function expand(events) {
  // 여러 날 행사는 날짜마다 표시
  const byDate = {};
  for (const e of events) {
    let d = e.data.date;
    const end = e.data.endDate && e.data.endDate > d ? e.data.endDate : d;
    let guard = 0;
    while (d <= end && guard++ < 120) { (byDate[d] ||= []).push(e); d = addDays(d, 1); }
  }
  return byDate;
}

function matches(e) {
  if (ui.dept && e.data.dept !== ui.dept) return false;
  if (ui.q) {
    const t = Object.values(e.data).join(' ').toLowerCase();
    if (!t.includes(ui.q.toLowerCase())) return false;
  }
  return true;
}

// 수업일수(참고): 평일 중 공휴일·휴업일·방학으로 표시된 날 제외
function schoolDays(y, m, byDate) {
  const last = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const key = `${y}-${pad(m)}-${pad(d)}`;
    if ((byDate[key] || []).some((e) => NO_SCHOOL_CATEGORIES.includes(e.data.category))) continue;
    n++;
  }
  return n;
}

function render(root, data, months) {
  const reload = () => calendarView(root);
  const { y, m } = ui.month;
  const events = data.events.filter(matches);
  const byDate = expand(events);
  const progByDate = {};
  if (ui.showPrograms) for (const p of data.programs.filter(matches)) (progByDate[p.data.date] ||= []).push(p);
  const tripByDate = {};
  if (ui.showTrips) for (const t of data.trips.filter(matches)) (tripByDate[t.data.date] ||= []).push(t);
  const note = data.monthNotes.find((n) => n.data.date === `${y}-${pad(m)}-01`);
  const allByDate = expand(data.events);

  const idx = months.findIndex((x) => x.y === y && x.m === m);
  const go = (i) => { ui.month = months[i]; render(root, data, months); };

  const add = (date) => openRecordForm('events', null, { defaults: { date, category: '행사' }, onSaved: reload });
  const edit = (mod, r) => openRecordForm(mod, r, { onSaved: reload });

  const chip = (e, d) => h('button', {
    class: `chip ${CAT_CLASS[e.data.category] || 'c-event'} ${e.data.review ? 'review' : ''}`,
    title: [e.data.title, e.data.dept, e.data.place].filter(Boolean).join(' · '),
    onclick: (ev) => { ev.stopPropagation(); edit('events', e); },
  }, e.data.endDate && e.data.date !== d ? '↳ ' : '', e.data.title.split('\n')[0], e.data.dept ? h('span', { class: 'chip-sub' }, ` ${e.data.dept}`) : null);

  const progChip = (p) => h('button', { class: `chip c-program ghost ${p.data.status === '취소' ? 'cancel' : ''}`, title: p.data.content, onclick: (ev) => { ev.stopPropagation(); edit('programs', p); } },
    `[${p.data.program}] `, (p.data.content || '').split('\n')[0]);
  const tripChip = (t) => h('button', { class: 'chip c-trip', title: t.data.title, onclick: (ev) => { ev.stopPropagation(); edit('trips', t); } }, '🚌 ', t.data.title.split('/')[0]);

  // 달력 칸
  const first = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(h('div', { class: 'day empty' }));
  for (let d = 1; d <= last; d++) {
    const key = `${y}-${pad(m)}-${pad(d)}`;
    const dow = (first + d - 1) % 7;
    const evs = byDate[key] || [];
    const holiday = evs.some((e) => NO_SCHOOL_CATEGORIES.includes(e.data.category));
    cells.push(h('div', {
      class: `day ${dow === 0 || holiday ? 'sun' : ''} ${dow === 6 ? 'sat' : ''} ${key === today() ? 'today' : ''}`,
      ondblclick: () => canEdit('events') && add(key),
    },
    h('div', { class: 'day-head' }, h('span', { class: 'dnum' }, d),
      canEdit('events') ? h('button', { class: 'add-mini', title: '일정 추가', onclick: () => add(key) }, '+') : null),
    evs.map((e) => chip(e, key)),
    (progByDate[key] || []).map(progChip),
    (tripByDate[key] || []).map(tripChip)));
  }

  const listRows = [];
  for (let d = 1; d <= last; d++) {
    const key = `${y}-${pad(m)}-${pad(d)}`;
    const evs = [...(byDate[key] || []).map((e) => ['events', e]), ...(progByDate[key] || []).map((p) => ['programs', p]), ...(tripByDate[key] || []).map((t) => ['trips', t])];
    evs.forEach(([mod, r], i) => listRows.push(h('tr', { class: 'click', onclick: () => edit(mod, r) },
      i === 0 ? h('td', { rowspan: evs.length, class: 'nowrap' }, fmtDate(key)) : null,
      h('td', {}, mod === 'events' ? h('span', { class: `tag ${CAT_CLASS[r.data.category] || ''}` }, r.data.category || '행사') : h('span', { class: `tag ${mod === 'trips' ? 'c-trip' : 'c-program'}` }, mod === 'trips' ? '출장' : r.data.program)),
      h('td', { class: 'pre' }, mod === 'events' ? r.data.title : mod === 'trips' ? r.data.title : r.data.content, r.data.review ? h('span', { class: 'badge warn' }, '확인필요') : null),
      h('td', {}, r.data.dept || r.data.person || ''),
      h('td', {}, r.data.place || ''))));
  }

  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'month-nav' },
        h('button', { class: 'btn', disabled: idx <= 0, onclick: () => go(idx - 1) }, '◀'),
        h('select', { class: 'month-select', onchange: (e) => go(Number(e.target.value)) },
          months.map((x, i) => h('option', { value: i, selected: i === idx }, `${x.y}년 ${x.m}월`))),
        h('button', { class: 'btn', disabled: idx >= months.length - 1, onclick: () => go(idx + 1) }, '▶')),
      h('div', { class: 'seg' },
        h('button', { class: ui.mode === 'month' ? 'on' : '', onclick: () => { ui.mode = 'month'; render(root, data, months); } }, '달력'),
        h('button', { class: ui.mode === 'list' ? 'on' : '', onclick: () => { ui.mode = 'list'; render(root, data, months); } }, '목록')),
      h('select', { onchange: (e) => { ui.dept = e.target.value; render(root, data, months); } },
        h('option', { value: '' }, '전체 부서'), state.settings.lists.depts.map((d) => h('option', { value: d, selected: d === ui.dept }, d))),
      h('input', { type: 'search', placeholder: '검색', value: ui.q, oninput: debounce((e) => { ui.q = e.target.value; render(root, data, months); root.querySelector('input[type=search]')?.focus(); }) }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ui.showPrograms, onchange: (e) => { ui.showPrograms = e.target.checked; render(root, data, months); } }), '특별수업'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ui.showTrips, onchange: (e) => { ui.showTrips = e.target.checked; render(root, data, months); } }), '출장'),
      h('span', { class: 'grow' }),
      canEdit('events') ? h('button', { class: 'btn primary', onclick: () => add(`${y}-${pad(m)}-01`) }, '+ 일정') : null),

    h('div', { class: 'month-note' },
      h('div', { class: 'mn-title' }, `${m}월 교육과정 주요 안내`,
        h('button', { class: 'link-btn', onclick: () => (note ? edit('monthNotes', note) : openRecordForm('monthNotes', null, { defaults: { date: `${y}-${pad(m)}-01` }, onSaved: reload })) }, note ? '수정' : '작성')),
      h('div', { class: 'pre' }, note?.data.content || h('span', { class: 'muted' }, '등록된 안내가 없습니다.')),
      h('div', { class: 'mn-days' },
        `수업일수: ${note?.data.schoolDays || '-'}`,
        h('span', { class: 'muted' }, ` (자동 계산 참고값 ${schoolDays(y, m, allByDate)}일 — 평일 중 공휴일·휴업일·방학 제외)`))),

    ui.mode === 'month'
      ? h('div', { class: 'calendar' }, DOW.map((d, i) => h('div', { class: `dow ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}` }, d)), cells)
      : h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['날짜', '분류', '내용', '담당', '장소'].map((t) => h('th', {}, t)))),
        h('tbody', {}, listRows.length ? listRows : h('tr', {}, h('td', { colspan: 5, class: 'muted center' }, '일정이 없습니다.'))))),
    h('p', { class: 'hint' }, '칸을 두 번 누르거나 + 를 누르면 그 날짜로 일정을 추가합니다. 노란 테두리는 가져오기 때 담당·장소 줄이 맞지 않아 확인이 필요한 일정입니다.'));
}

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
