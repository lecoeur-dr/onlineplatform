// 🏫 특별실 예약: 장소를 고르고 한 주(월~금) × 교시 표에서 빈칸을 눌러 예약
import { h, api, clear, addDays, today, fmtDate, DOW } from '../ui.js';
import { state, canEdit, remember, myName, listOf } from '../state.js';
import { MODULES } from '../modules.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { seg } from './schedule.js';

const monday = (d) => { const [y, m, dd] = d.split('-').map(Number); const w = new Date(y, m - 1, dd).getDay(); return addDays(d, w === 0 ? 1 : 1 - w); };

export async function reservationsView(root, week) {
  const mode = remember('resv_mode') || 'week';
  const head = h('div', { class: 'subbar' }, seg([['week', '주간 표'], ['list', '목록']], mode, (m) => { remember('resv_mode', m); reservationsView(root, week); }));
  const body = h('div', {});
  clear(root, head, body);
  if (mode === 'list') return tableView(body, 'reservations', { reload: () => reservationsView(root, week), defaults: { date: today(), user: myName() } });

  const places = listOf(MODULES.reservations.fields.find((f) => f.key === 'place'));
  let place = remember('resv_place');
  if (!places.includes(place)) place = places[0] || '';
  const start = week || monday(today());
  const days = [0, 1, 2, 3, 4].map((i) => addDays(start, i));
  const d = await api(`/api/bundle?year=${state.year}&modules=reservations,programs`);
  const periods = state.settings.lists.periods?.length ? state.settings.lists.periods : ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'];
  const reload = () => reservationsView(root, start);
  const at = (day, p) => d.reservations.filter((r) => r.data.date === day && r.data.place === place && r.data.period === p);
  const progs = (day) => d.programs.filter((r) => r.data.date === day && r.data.place === place && r.data.status !== '취소');
  const editable = canEdit('reservations');
  const me = myName();
  const add = (day, p) => openRecordForm('reservations', null, { defaults: { date: day, place, period: p, user: me }, onSaved: reload });
  const dayLabel = (x) => { const [y, m, dd] = x.split('-').map(Number); return `${m}/${dd}(${DOW[new Date(y, m - 1, dd).getDay()]})`; };

  clear(body,
    h('div', { class: 'toolbar' },
      h('select', { 'aria-label': '장소', onchange: (e) => { remember('resv_place', e.target.value); reservationsView(root, start); } },
        places.map((p) => h('option', { value: p, selected: p === place }, p))),
      h('button', { class: 'btn', onclick: () => reservationsView(root, addDays(start, -7)), 'aria-label': '이전 주' }, '◀'),
      h('strong', {}, `${fmtDate(days[0])} ~ ${fmtDate(days[4])}`),
      h('button', { class: 'btn', onclick: () => reservationsView(root, addDays(start, 7)), 'aria-label': '다음 주' }, '▶'),
      h('button', { class: 'btn', onclick: () => reservationsView(root) }, '이번 주')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'tt resv' },
      h('thead', {}, h('tr', {}, h('th', {}, place), days.map((x) => h('th', { class: x === today() ? 'today' : '' }, dayLabel(x))))),
      h('tbody', {},
        days.some((x) => progs(x).length) ? h('tr', { class: 'resv-prog' }, h('th', {}, '특별수업'), days.map((x) => h('td', {}, progs(x).map((r) => h('div', { class: 'small' }, `[${r.data.program}] ${(r.data.content || '').split('\n')[0]}`))))) : null,
        periods.map((p) => h('tr', {}, h('th', {}, p), days.map((x) => {
          const list = at(x, p);
          if (list.length) {
            return h('td', { class: `booked ${list.some((r) => r.data.user === me) ? 'mine' : ''}` }, list.map((r) => h('button', {
              class: 'resv-item', onclick: () => openRecordForm('reservations', r, { onSaved: reload }),
            }, h('strong', {}, r.data.user || ''), r.data.className ? ` ${r.data.className}` : '', r.data.purpose ? h('div', { class: 'muted small' }, r.data.purpose) : null)));
          }
          return h('td', { class: editable ? 'free click' : 'free', onclick: editable ? () => add(x, p) : null }, editable ? h('span', { class: 'plus' }, '+ 예약') : '');
        })))))),
    h('p', { class: 'hint' }, '빈칸을 누르면 그 날·교시로 예약합니다. 같은 장소·날짜·교시에 이미 예약이 있으면 저장되지 않습니다. 장소 목록은 관리자 → 설정 → 장소 목록에서 바꿉니다.'));
}
