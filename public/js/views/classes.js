// 🕘 수업 영역: 수업 전체 · 시간표 · 특별수업 · 동료장학
import { categoryColor, NO_SCHOOL_CATEGORIES, normCategory } from '../modules.js';
import { h, api, clear, DOW, today, addDays, fmtDate } from '../ui.js';
import { state, remember, canEdit, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { renderCalendar, eventItem, programItem, openClassItem, substituteItem, programInfo } from './calendar.js';
import { tableView } from './table.js';
import { sortTimetables, glanceTable, editTimetable, conflicts, activeOn } from './timetable.js';
import { openClassesView } from './openclasses.js';
import { seg } from './schedule.js';

const CLASS_CATS = ['학급수업', '특별수업', '동료장학'];

// 수업 전체: 오늘 시간표(한눈에) + 수업 달력(특별수업·동료장학·학급수업)
export async function classOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=timetables,programs,openClasses,events,substitutes`);
  const allTts = sortTimetables(d.timetables);
  // 오늘이 주말·휴일이면 다음 수업일 시간표를 보여 줌
  const t = today();
  const offOf = (day) => {
    const [y, m, dd] = day.split('-').map(Number);
    const w = new Date(y, m - 1, dd).getDay();
    if (w === 0 || w === 6) return '주말';
    const ev = d.events.find((e) => e.data.date <= day && (e.data.endDate || e.data.date) >= day && NO_SCHOOL_CATEGORIES.includes(normCategory(e.data.category)));
    return ev ? ev.data.title.split('\n')[0] : '';
  };
  let day = t;
  let reason = offOf(t);
  for (let i = 0; i < 30 && offOf(day); i++) day = addDays(day, 1);
  const weekday = DOW[new Date(...day.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))).getDay()];
  const tts = allTts.filter((r) => activeOn(r, day)); // 적용 기간·빠지는 날 반영
  const subs = d.substitutes.filter((s) => s.data.date === day);
  // 나이스 학급 시간표(그 날 전체 학급)를 시트 시간표의 빈칸에 채움
  let neis = { rows: [], note: '' };
  if (state.settings.neis) {
    try {
      const res = await api(`/api/neis/timetable-day?date=${day}`);
      neis.rows = res.rows || [];
      neis.note = neis.rows.length ? `나이스 시간표 ${new Set(neis.rows.map((r) => r.cls)).size}개 학급을 합쳐 보여 줍니다. 연한 글씨 = 나이스, 진한 글씨 = 시트(전담·특별실 등).` : '나이스에 이 날 학급 시간표가 없습니다 (학교가 나이스에 시간표를 아직 입력하지 않았거나 방학·휴일).';
    } catch (e) { neis.note = `나이스 시간표를 불러오지 못했습니다: ${e.message}`; }
  } else neis.note = '학교 관리 → 설정 → 나이스 연동에서 학교를 선택하면 학급 시간표 전체(국어·수학 등)를 나이스에서 채워 넣습니다.';
  const soft = new Set();
  const merged = mergeNeis(tts, neis.rows, weekday, soft);
  const cal = h('div', {});
  clear(root,
    h('section', { class: 'section' },
      h('h3', {}, day === t ? `오늘(${weekday}) 시간표 한눈에` : `다음 수업일 ${fmtDate(day)} 시간표`,
        reason && day !== t ? h('span', { class: 'badge warn' }, `오늘은 ${reason}`) : null),
      subs.length ? h('p', { class: 'alert warn' }, `🔁 보결 ${subs.length}건: `, subs.map((s) => `${s.data.period} ${s.data.className || ''} → ${s.data.substitute}`).join(' · ')) : null,
      merged.length ? glanceTable(merged, { days: [weekday], onOpen: (r) => (r.synthetic ? null : editTimetable(r, () => classOverview(root))), clash: conflicts(tts), soft }) : h('p', { class: 'muted' }, '시간표가 없습니다.'),
      h('p', { class: 'hint' }, neis.note)),
    h('section', { class: 'section' }, h('h3', {}, '수업 달력 (학급수업 · 특별수업 · 동료장학)'), cal));
  renderCalendar(cal, {
    key: 'cal_class', defaultMode: 'month', autoScroll: false,
    items: [
      ...d.events.map(eventItem).filter((it) => CLASS_CATS.includes(it.cat)),
      ...d.programs.map((r) => programItem(r)),
      ...d.openClasses.map(openClassItem),
      ...d.substitutes.map(substituteItem),
    ],
    legend: [...CLASS_CATS.map((name) => ({ name, color: categoryColor(name) })), { name: '보결', color: '#c2410c' }],
    reload: () => classOverview(root),
    add: [
      { mod: 'programs', label: '특별수업', defaults: (date) => ({ date, status: '예정' }) },
      { mod: 'events', label: '학급수업 일정', defaults: (date) => ({ date, category: '학급수업' }) },
    ],
  });
}

// 특별수업: 달력(프로그램별 색) / 목록
export async function programsView(root) {
  const mode = remember('prog_mode2') || 'board';
  const body = h('div', {});
  clear(root, h('div', { class: 'subbar' }, seg([['board', '🎨 프로그램별'], ['cal', '통합 달력'], ['list', '목록']], mode, (m) => { remember('prog_mode2', m); programsView(root); })), body);
  if (mode === 'list') return tableView(body, 'programs', { groupBy: 'program', reload: () => programsView(root) });
  const d = await api(`/api/bundle?year=${state.year}&modules=programs`);
  if (mode === 'board') return programBoard(body, d.programs, () => programsView(root));
  const programs = [...new Set([...(state.settings.lists.programs || []), ...d.programs.map((r) => r.data.program).filter(Boolean)])];
  const items = d.programs.map((r) => programItem(r, 'program', programs));
  renderCalendar(body, {
    key: 'cal_prog', items,
    legend: programs.map((name) => ({ name, color: items.find((it) => it.cat === name)?.color || '#7a808c' })),
    reload: () => programsView(root),
    add: [{ mod: 'programs', label: '특별수업', defaults: (date) => ({ date, status: '예정' }) }],
  });
}

// 🎨 프로그램별: 시트(SW·AI 시간표, 예술 시간표)처럼 프로그램마다 달력을 나란히 + 진행 현황
const PROG_COLORS = ['#7c3aed', '#16a34a', '#ea580c', '#db2777', '#0284c7', '#ca8a04', '#0d9488', '#9333ea'];
const ym = (d) => d.slice(0, 7);
function programBoard(body, rows, reload) {
  const t = today();
  const names = [...new Set([...(state.settings.lists.programs || []).filter((p) => rows.some((r) => r.data.program === p)), ...rows.map((r) => r.data.program).filter(Boolean)])];
  const colorOf = (p) => PROG_COLORS[Math.max(0, names.indexOf(p)) % PROG_COLORS.length];
  let pick = (remember('prog_pick') || names).filter((p) => names.includes(p));
  if (!pick.length) pick = names;
  const byProg = new Map(names.map((p) => [p, rows.filter((r) => r.data.program === p).sort((a, b) => a.data.date.localeCompare(b.data.date))]));
  const togglePick = (p) => { const set = new Set(pick); if (set.has(p)) set.delete(p); else set.add(p); remember('prog_pick', names.filter((x) => set.has(x))); reload(); };
  const open = (r) => openRecordForm('programs', r, { onSaved: reload });
  const add = (program, date) => canEdit('programs') && openRecordForm('programs', null, { defaults: { program, date, status: '예정' }, onSaved: reload });

  // 진행 현황 카드
  const summary = (p) => {
    const list = byProg.get(p).filter((r) => r.data.status !== '취소');
    const lessons = list.filter((r) => programInfo(r.data.content).classes.length);
    const past = lessons.filter((r) => r.data.date <= t);
    const next = lessons.find((r) => r.data.date > t);
    const prog = [...list].reverse().map((r) => ({ r, ...programInfo(r.data.content) })).find((x) => x.progress && x.r.data.date <= t);
    const perClass = {};
    for (const r of past) for (const c of programInfo(r.data.content).classes) { const k = (c.match(/\d-\d+/) || [])[0]; if (k) perClass[k] = (perClass[k] || 0) + 1; }
    return h('div', { class: 'card prog-sum', style: { '--c': colorOf(p) } },
      h('div', { class: 'card-head' }, h('strong', {}, p), h('span', { class: 'muted small' }, `${lessons.length}일 예정`)),
      h('div', { class: 'progress-row' }, h('div', { class: 'tally-track' }, h('span', { class: 'tally-fill', style: { width: `${lessons.length ? Math.round((past.length / lessons.length) * 100) : 0}%`, background: colorOf(p) } })),
        h('span', { class: 'progress-text' }, `${past.length} / ${lessons.length}일 진행`)),
      prog ? h('div', { class: 'small' }, `📊 누적 ${prog.progress.n} / ${prog.progress.total}차시 (${fmtDate(prog.r.data.date, false)} 기준)`) : null,
      next ? h('div', { class: 'small click', onclick: () => open(next) }, `⏭ 다음: ${fmtDate(next.data.date)} · ${programInfo(next.data.content).classes.slice(0, 2).join(', ')}${programInfo(next.data.content).classes.length > 2 ? ' …' : ''}`) : h('div', { class: 'small muted' }, '남은 수업 없음'),
      Object.keys(perClass).length ? h('div', { class: 'small muted' }, '반별 진행: ', Object.entries(perClass).sort((a, b) => a[0].localeCompare(b[0], 'ko', { numeric: true })).map(([k, n]) => `${k} ${n}회`).join(' · ')) : null);
  };

  // 한 프로그램의 한 달 달력
  const monthCal = (p, y, m) => {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const map = new Map();
    for (const r of byProg.get(p)) if (ym(r.data.date) === key) { if (!map.has(r.data.date)) map.set(r.data.date, []); map.get(r.data.date).push(r); }
    const first = new Date(y, m - 1, 1).getDay();
    const last = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(h('div', { class: 'pc-cell empty' }));
    for (let d = 1; d <= last; d++) {
      const date = `${key}-${String(d).padStart(2, '0')}`;
      const items = map.get(date) || [];
      const dow = (first + d - 1) % 7;
      cells.push(h('div', { class: `pc-cell ${items.length ? 'has' : ''} ${date === t ? 'today' : ''} ${date < t ? 'past' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}`, onclick: items.length ? null : () => add(p, date) },
        h('div', { class: 'pc-day' }, d),
        items.map((r) => { const info = programInfo(r.data.content); return h('div', { class: `pc-item ${r.data.status === '취소' ? 'cancel' : r.data.status === '변경' ? 'changed' : ''}`, onclick: (e) => { e.stopPropagation(); open(r); } },
          info.progress ? h('span', { class: 'pc-prog' }, `${info.progress.n}/${info.progress.total}`) : null,
          info.classes.map((c) => h('div', { class: 'pc-line', title: c }, c.replace(/[()]/g, '').replace(/\s+/g, ' ').trim())), info.notes.map((n) => h('div', { class: 'muted pc-line', title: n }, n))); })));
    }
    return h('div', { class: 'pc-cal', style: { '--c': colorOf(p) } },
      h('div', { class: 'pc-title' }, p, h('span', { class: 'muted small' }, ` ${map.size ? `${map.size}일` : ''}`)),
      h('div', { class: 'pc-grid' }, DOW.map((x, i) => h('div', { class: `pc-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}` }, x)), cells));
  };

  const months = [...new Set(rows.filter((r) => pick.includes(r.data.program)).map((r) => ym(r.data.date)))].sort();
  const monthBox = h('div', {}, months.map((k) => {
    const [y, m] = k.split('-').map(Number);
    return h('section', { class: `pc-month ${k === ym(t) ? 'now' : ''}`, 'data-ym': k },
      h('h3', {}, `📅 ${y}년 ${m}월`, k === ym(t) ? h('span', { class: 'tag ok' }, ' 이번 달') : null),
      h('div', { class: 'pc-row' }, pick.map((p) => monthCal(p, y, m))));
  }));
  // 위쪽 배너(프로그램 단추 + 현황)는 고정, 접고 펼 수 있음 (기억함, 휴대폰은 기본 접힘)
  let folded = remember('prog_banner_fold') ?? window.innerWidth < 700;
  const mini = h('div', { class: 'pb-mini' }, pick.map((p) => {
    const ls = byProg.get(p).filter((r) => r.data.status !== '취소' && programInfo(r.data.content).classes.length);
    return h('span', { class: 'pb-chip', style: { '--c': colorOf(p) } }, h('span', { class: 'dot', style: { background: colorOf(p) } }), ` ${p} `, h('strong', {}, `${ls.filter((r) => r.data.date <= t).length}/${ls.length}`));
  }));
  const sums = names.length ? h('div', { class: 'cards prog-sums' }, pick.map(summary)) : null;
  const banner = h('div', { class: `prog-banner ${folded ? 'folded' : ''}` });
  const foldBtn = h('button', { class: 'btn small', title: '현황 접기/펴기', onclick: () => { folded = !folded; remember('prog_banner_fold', folded); banner.classList.toggle('folded', folded); foldBtn.textContent = folded ? '▼ 현황 펴기' : '▲ 현황 접기'; setH(); } }, folded ? '▼ 현황 펴기' : '▲ 현황 접기');
  // 맨 위 머리글(로고·학년도) 바로 아래에 붙도록 높이를 재서 맞춤 (PC·휴대폰 머리글 높이가 다름)
  const setH = () => requestAnimationFrame(() => { const gb = document.querySelector('.group-bar'); banner.style.top = `${(document.querySelector('header.top')?.offsetHeight || 0) + (gb && getComputedStyle(gb).display !== 'none' && getComputedStyle(gb).position === 'sticky' ? gb.offsetHeight : 0)}px`; body.style.setProperty('--pb-h', `${banner.offsetHeight}px`); });
  clear(banner,
    names.length ? h('div', { class: 'toolbar' },
      h('span', { class: 'muted small' }, '프로그램:'),
      names.map((p) => h('button', { class: `chip-check ${pick.includes(p) ? 'on' : ''}`, style: { borderColor: colorOf(p) }, onclick: () => togglePick(p) }, h('span', { class: 'dot', style: { background: colorOf(p) } }), ` ${p} `, h('span', { class: 'muted small' }, byProg.get(p).length))),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => document.querySelector('.pc-month.now')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, '이번 달로'),
      foldBtn,
      canEdit('programs') ? h('button', { class: 'btn small primary', onclick: () => add(pick[0] || '', t) }, '+ 특별수업') : null) : null,
    mini, sums);
  clear(body,
    banner,
    names.length ? null : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🎨'), h('p', {}, '특별수업이 없습니다. 학교 관리 → 기존 시트 가져오기에서 SW·AI·예술 시간표 시트를 올리면 프로그램별로 나뉩니다.')),
    monthBox,
    h('p', { class: 'hint' }, '시트처럼 프로그램마다 달력을 나란히 보여 줍니다. 위의 프로그램 단추로 보고 싶은 것만 고르고, 칸을 누르면 수정, 빈 날짜를 누르면 그 날짜로 추가합니다. "14/44"는 누적 진행 차시(14차시째 / 총 44차시)입니다.'));
  setH();
  if (window.ResizeObserver) new ResizeObserver(setH).observe(banner);
  requestAnimationFrame(() => document.querySelector('.pc-month.now')?.scrollIntoView({ block: 'start' }));
}

// 동료장학: 달력 / 공개수업·참관 신청
export async function openClassesTab(root) {
  const mode = remember('oc_mode') || 'list';
  const body = h('div', {});
  clear(root, h('div', { class: 'subbar' }, seg([['list', '공개수업 · 참관 신청'], ['cal', '달력']], mode, (m) => { remember('oc_mode', m); openClassesTab(root); })), body);
  if (mode === 'list') return openClassesView(body);
  const d = await api(`/api/bundle?year=${state.year}&modules=openClasses`);
  renderCalendar(body, {
    key: 'cal_oc', items: d.openClasses.map(openClassItem).filter(Boolean),
    legend: [{ name: '동료장학', color: categoryColor('동료장학') }],
    reload: () => openClassesTab(root),
    add: [{ mod: 'openClasses', label: '공개수업', defaults: (date) => ({ date }) }],
  });
}

// 보결: 날짜별 목록(내 보결 강조) + 교사별 횟수
export async function substitutesView(root) {
  const rows = await api(`/api/bundle?year=${state.year}&modules=substitutes`).then((x) => x.substitutes);
  const reload = () => substitutesView(root);
  const me = myName();
  const mode = remember('sub_mode') || 'upcoming';
  const t = today();
  const shown = rows.filter((r) => mode === 'all' || (mode === 'mine' ? r.data.substitute === me : r.data.date >= t));
  const byDate = new Map();
  for (const r of shown.sort((a, b) => a.data.date.localeCompare(b.data.date) || String(a.data.period).localeCompare(String(b.data.period), 'ko', { numeric: true }))) {
    if (!byDate.has(r.data.date)) byDate.set(r.data.date, []);
    byDate.get(r.data.date).push(r);
  }
  const counts = new Map();
  for (const r of rows) if (r.data.substitute) counts.set(r.data.substitute, (counts.get(r.data.substitute) || 0) + 1);
  const mineCount = rows.filter((r) => r.data.substitute === me && r.data.date >= t).length;
  clear(root,
    h('div', { class: 'toolbar' },
      seg([['upcoming', '오늘 이후'], ['mine', `내 보결${mineCount ? ` (${mineCount})` : ''}`], ['all', '전체']], mode, (v) => { remember('sub_mode', v); reload(); }),
      h('span', { class: 'grow' }),
      canEdit('substitutes') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('substitutes', null, { defaults: { date: t }, onSaved: reload }) }, '+ 보결') : null),
    h('p', { class: 'hint' }, '복무·출장 목록의 [보결 배정] 버튼으로도 바로 입력할 수 있습니다. 내가 보결 교사인 수업은 주황색으로 표시됩니다.'),
    byDate.size ? [...byDate].map(([date, list]) => h('section', { class: 'section' },
      h('h3', {}, fmtDate(date), date === t ? h('span', { class: 'badge warn' }, '오늘') : null),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('thead', {}, h('tr', {}, ['교시', '학급', '과목', '부재 교사', '보결 교사', '사유'].map((x) => h('th', {}, x)))),
        h('tbody', {}, list.map((r) => h('tr', { class: `click ${r.data.substitute === me ? 'hl' : ''}`, onclick: () => openRecordForm('substitutes', r, { onSaved: reload }) },
          h('td', { class: 'nowrap' }, r.data.period || ''), h('td', {}, r.data.className || ''), h('td', {}, r.data.subject || ''),
          h('td', {}, r.data.absent || ''), h('td', {}, h('strong', {}, r.data.substitute || '')), h('td', {}, r.data.reason || '')))))))) : h('p', { class: 'muted' }, '보결 기록이 없습니다.'),
    counts.size ? h('section', { class: 'section' }, h('h3', {}, `교사별 보결 횟수 (${state.year}학년도)`),
      h('div', { class: 'chips-row' }, [...counts].sort((a, b) => b[1] - a[1]).map(([k, v]) => h('span', { class: `tag big ${k === me ? 'mine' : ''}` }, `${k} ${v}회`)))) : null);
}

// 시트 학급 시간표 + 나이스 하루 시간표 합치기. 시트에 없는 학급은 나이스만으로 줄을 만듦
function mergeNeis(tts, rows, weekday, soft) {
  if (!rows.length) return tts;
  const byCls = new Map();
  for (const r of rows) { if (!byCls.has(r.cls)) byCls.set(r.cls, {}); byCls.get(r.cls)[r.period] = r.subject; }
  const out = tts.map((r) => {
    const m = String(r.data.title).match(/^(\d)-(\d+)$/);
    const day = m && r.data.kind === '학급' ? byCls.get(`${m[1]}-${m[2]}`) : null;
    if (!day) return r;
    const g = JSON.parse(JSON.stringify(r.data.grid || { days: ['월', '화', '수', '목', '금'], periods: [], cells: [] }));
    const di = g.days.indexOf(weekday);
    if (di < 0) return r;
    const maxP = Math.max(g.periods.length, ...Object.keys(day).map(Number));
    while (g.periods.length < maxP) { g.periods.push(`${g.periods.length + 1}교시`); g.cells.push(Array(g.days.length).fill('')); }
    for (const [p, subj] of Object.entries(day)) {
      const pi = Number(p) - 1;
      if (!g.cells[pi][di]) { g.cells[pi][di] = subj; soft.add(`${r.id}|${pi}|${di}`); }
    }
    byCls.delete(`${m[1]}-${m[2]}`);
    return { ...r, data: { ...r.data, grid: g } };
  });
  // 시트에 없는 학급
  const extra = [...byCls].sort(([a], [b]) => a.localeCompare(b, 'ko', { numeric: true })).map(([cls, day]) => {
    const n = Math.max(6, ...Object.keys(day).map(Number));
    const cells = Array.from({ length: n }, (_, pi) => [day[pi + 1] || '']);
    const id = `neis-${cls}`;
    cells.forEach((row, pi) => { if (row[0]) soft.add(`${id}|${pi}|0`); });
    return { id, synthetic: true, data: { title: cls, kind: '학급', grid: { days: [weekday], periods: cells.map((_, i) => `${i + 1}교시`), cells } } };
  });
  const firstNonClass = out.findIndex((r) => r.data.kind !== '학급');
  if (firstNonClass < 0) return [...out, ...extra];
  return [...out.slice(0, firstNonClass), ...extra, ...out.slice(firstNonClass)];
}
