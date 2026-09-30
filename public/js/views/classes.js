// 🕘 수업 영역: 수업 전체 · 시간표 · 특별수업 · 동료장학
import { categoryColor } from '../modules.js';
import { h, api, clear, DOW } from '../ui.js';
import { state, remember } from '../state.js';
import { renderCalendar, eventItem, programItem, openClassItem } from './calendar.js';
import { tableView } from './table.js';
import { sortTimetables, glanceTable, editTimetable, conflicts } from './timetable.js';
import { openClassesView } from './openclasses.js';
import { seg } from './schedule.js';

const CLASS_CATS = ['학급수업', '특별수업', '동료장학'];

// 수업 전체: 오늘 시간표(한눈에) + 수업 달력(특별수업·동료장학·학급수업)
export async function classOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=timetables,programs,openClasses,events`);
  const dow = DOW[new Date().getDay()];
  const weekday = ['월', '화', '수', '목', '금'].includes(dow) ? dow : '월';
  const tts = sortTimetables(d.timetables);
  const cal = h('div', {});
  clear(root,
    h('section', { class: 'section' },
      h('h3', {}, `${weekday}요일 시간표 한눈에`, dow !== weekday ? h('span', { class: 'muted small' }, ' (주말이라 월요일 표시)') : null),
      tts.length ? glanceTable(tts, { days: [weekday], onOpen: (r) => editTimetable(r, () => classOverview(root)), clash: conflicts(tts) }) : h('p', { class: 'muted' }, '시간표가 없습니다.')),
    h('section', { class: 'section' }, h('h3', {}, '수업 달력 (학급수업 · 특별수업 · 동료장학)'), cal));
  renderCalendar(cal, {
    key: 'cal_class', defaultMode: 'month', autoScroll: false,
    items: [
      ...d.events.map(eventItem).filter((it) => CLASS_CATS.includes(it.cat)),
      ...d.programs.map((r) => programItem(r)),
      ...d.openClasses.map(openClassItem),
    ],
    legend: CLASS_CATS.map((name) => ({ name, color: categoryColor(name) })),
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
