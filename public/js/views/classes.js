// 🕘 수업 영역: 수업 전체 · 시간표 · 특별수업 · 동료장학
import { categoryColor, NO_SCHOOL_CATEGORIES, normCategory } from '../modules.js';
import { h, api, clear, DOW, today, addDays, fmtDate } from '../ui.js';
import { state, remember, canEdit, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { renderCalendar, eventItem, programItem, openClassItem, substituteItem } from './calendar.js';
import { tableView } from './table.js';
import { sortTimetables, glanceTable, editTimetable, conflicts } from './timetable.js';
import { openClassesView } from './openclasses.js';
import { seg } from './schedule.js';

const CLASS_CATS = ['학급수업', '특별수업', '동료장학'];

// 수업 전체: 오늘 시간표(한눈에) + 수업 달력(특별수업·동료장학·학급수업)
export async function classOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=timetables,programs,openClasses,events,substitutes`);
  const tts = sortTimetables(d.timetables);
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
  const subs = d.substitutes.filter((s) => s.data.date === day);
  const cal = h('div', {});
  clear(root,
    h('section', { class: 'section' },
      h('h3', {}, day === t ? `오늘(${weekday}) 시간표 한눈에` : `다음 수업일 ${fmtDate(day)} 시간표`,
        reason && day !== t ? h('span', { class: 'badge warn' }, `오늘은 ${reason}`) : null),
      subs.length ? h('p', { class: 'alert warn' }, `🔁 보결 ${subs.length}건: `, subs.map((s) => `${s.data.period} ${s.data.className || ''} → ${s.data.substitute}`).join(' · ')) : null,
      tts.length ? glanceTable(tts, { days: [weekday], onOpen: (r) => editTimetable(r, () => classOverview(root)), clash: conflicts(tts) }) : h('p', { class: 'muted' }, '시간표가 없습니다.')),
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
  const mode = remember('prog_mode') || 'cal';
  const body = h('div', {});
  clear(root, h('div', { class: 'subbar' }, seg([['cal', '달력'], ['list', '목록']], mode, (m) => { remember('prog_mode', m); programsView(root); })), body);
  if (mode === 'list') return tableView(body, 'programs', { groupBy: 'program', reload: () => programsView(root) });
  const d = await api(`/api/bundle?year=${state.year}&modules=programs`);
  const programs = [...new Set([...(state.settings.lists.programs || []), ...d.programs.map((r) => r.data.program).filter(Boolean)])];
  const items = d.programs.map((r) => programItem(r, 'program', programs));
  renderCalendar(body, {
    key: 'cal_prog', items,
    legend: programs.map((name) => ({ name, color: items.find((it) => it.cat === name)?.color || '#7a808c' })),
    reload: () => programsView(root),
    add: [{ mod: 'programs', label: '특별수업', defaults: (date) => ({ date, status: '예정' }) }],
  });
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
