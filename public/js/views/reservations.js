// 🏫 특별실 예약: 장소를 고르고 한 주(월~금) × 교시 표에서 빈칸을 눌러 예약
import { h, api, clear, addDays, today, fmtDate, DOW, toast } from '../ui.js';
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

  const start = week || monday(today());
  const days = [0, 1, 2, 3, 4].map((i) => addDays(start, i));
  const d = await api(`/api/bundle?year=${state.year}&modules=reservations,programs`);
  // 장소: 학교 장소 목록 + 이미 예약에 쓰인 장소(폼에서 직접 적은 장소도 표에 나오게)
  const places = [...new Set([...listOf(MODULES.reservations.fields.find((f) => f.key === 'place')), ...d.reservations.map((r) => r.data.place)].filter(Boolean))];
  let place = remember('resv_place');
  if (!places.includes(place)) place = places[0] || '';
  const isAdmin = state.me?.role === 'admin';
  const addPlace = async () => {
    const v = prompt('추가할 장소 이름 (예: 미술실, 다목적실)')?.trim();
    if (!v) return;
    if (places.includes(v)) { remember('resv_place', v); reload(); return; }
    try {
      const lists = { ...(state.settings.lists || {}), places: [...listOf(MODULES.reservations.fields.find((f) => f.key === 'place')), v] };
      state.settings = await api('/api/admin/settings', { method: 'PUT', body: { lists } });
      remember('resv_place', v); toast(`'${v}'을(를) 장소 목록에 추가했습니다.`); reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const periods = state.settings.lists.periods?.length ? state.settings.lists.periods : ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'];
  const reload = () => reservationsView(root, start);
  const at = (day, p) => d.reservations.filter((r) => r.data.date === day && r.data.place === place && r.data.period === p);
  const progs = (day) => d.programs.filter((r) => r.data.date === day && r.data.place === place && r.data.status !== '취소');
  const editable = canEdit('reservations');
  const me = myName();
  // 저장한 예약이 지금 보고 있는 장소·주와 다르면 그 장소·주로 옮겨서 보여 줌
  const saved = (r) => {
    if (!r) return reload();
    const other = r.data.place && r.data.place !== place;
    if (other) remember('resv_place', r.data.place);
    const wk = r.data.date ? monday(r.data.date) : start;
    if (other || wk !== start) toast(`${r.data.place} · ${r.data.date} ${r.data.period || ''} 예약을 저장했습니다. 그 장소의 표로 옮깁니다.`);
    reservationsView(root, wk);
  };
  const add = (day, p) => openRecordForm('reservations', null, { defaults: { date: day, place, period: p, user: me }, onSaved: saved });
  const dayLabel = (x) => { const [y, m, dd] = x.split('-').map(Number); return `${m}/${dd}(${DOW[new Date(y, m - 1, dd).getDay()]})`; };

  clear(body,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg wrap', 'aria-label': '장소' }, places.map((p) => h('button', { class: p === place ? 'on' : '', onclick: () => { remember('resv_place', p); reservationsView(root, start); } }, p)),
        isAdmin ? h('button', { class: 'ghost', title: '장소 목록에 추가 (관리자)', onclick: addPlace }, '+ 장소') : null)),
    h('div', { class: 'toolbar' },
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
              class: 'resv-item', onclick: () => openRecordForm('reservations', r, { onSaved: saved }),
            }, h('strong', {}, r.data.user || ''), r.data.className ? ` ${r.data.className}` : '', r.data.purpose ? h('div', { class: 'muted small' }, r.data.purpose) : null)));
          }
          return h('td', { class: editable ? 'free click' : 'free', onclick: editable ? () => add(x, p) : null }, editable ? h('span', { class: 'plus' }, '+ 예약') : '');
        })))))),
    h('p', { class: 'hint' }, '빈칸을 누르면 그 날·교시로 예약합니다. 같은 장소·날짜·교시에 이미 예약이 있으면 저장되지 않습니다. 위 장소 버튼으로 표를 바꿉니다. 장소 목록은 관리자가 [+ 장소] 또는 학교 관리 → 설정 → 장소 목록에서 바꿉니다.'));
}
