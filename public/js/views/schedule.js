// 📅 학사일정 영역: 통합 달력 · 일정 목록 · 출장(목록/달력)
import { h, api, clear } from '../ui.js';
import { state, remember, canEdit } from '../state.js';
import { renderCalendar, eventItem, programItem, tripItem, openClassItem, substituteItem } from './calendar.js';
import { tableView } from './table.js';
import { openRecordForm } from '../form.js';
import { categoryColor, CATEGORIES } from '../modules.js';

export function seg(options, current, onChange) {
  return h('div', { class: 'seg' }, options.map(([v, l]) => h('button', { class: current === v ? 'on' : '', onclick: () => onChange(v) }, l)));
}

// 통합 달력: 학사일정 + 특별수업 + 출장 + 동료장학 + 월별 전체 공지
export async function scheduleOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=events,programs,trips,openClasses,notices,substitutes`);
  const items = [
    ...d.events.map(eventItem),
    ...d.programs.map((r) => programItem(r)),
    ...d.trips.map(tripItem),
    ...d.openClasses.map(openClassItem),
    ...d.substitutes.map(substituteItem),
  ];
  renderCalendar(root, {
    key: 'cal_all', items, notices: d.notices, reload: () => scheduleOverview(root),
    add: [
      { mod: 'events', label: '일정', defaults: (date) => ({ date, category: '전체행사' }) },
      { mod: 'programs', label: '특별수업', defaults: (date) => ({ date, status: '예정' }) },
      { mod: 'trips', label: '복무·출장', defaults: (date) => ({ date, kind: '출장' }) },
    ],
    legend: [...CATEGORIES, { name: '보결', color: '#c2410c' }],
  });
}

export async function eventsList(root) {
  await tableView(root, 'events', { hide: ['review', 'endDate'] });
}

// 복무·출장: 입력해서 행으로 보는 목록 / 달력
export async function tripsView(root) {
  const mode = remember('trips_mode') || 'list';
  const head = h('div', { class: 'subbar' }, seg([['list', '목록'], ['cal', '달력']], mode, (m) => { remember('trips_mode', m); tripsView(root); }));
  const body = h('div', {});
  clear(root, head, body);
  if (mode === 'list') {
    return tableView(body, 'trips', {
      reload: () => tripsView(root), defaults: { kind: '출장' },
      // 부재 교사의 수업을 바로 보결로 배정
      rowAction: (r) => canEdit('substitutes') && r.data.person ? h('button', { class: 'btn small', onclick: () => openRecordForm('substitutes', null, {
        defaults: { date: r.data.date, absent: r.data.person, reason: r.data.kind || '출장' }, onSaved: () => tripsView(root),
      }) }, '보결 배정') : null,
    });
  }
  const d = await api(`/api/bundle?year=${state.year}&modules=trips`);
  renderCalendar(body, {
    key: 'cal_trips', items: d.trips.map(tripItem), legend: [{ name: '복무·출장', color: categoryColor('복무·출장') }], reload: () => tripsView(root),
    add: [{ mod: 'trips', label: '복무·출장', defaults: (date) => ({ date, kind: '출장' }) }],
  });
}
