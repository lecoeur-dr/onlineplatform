// 🧑‍🏫 담당 배정표: 행사·업무별(같은 날·같은 이름 묶음)로 역할과 담당자를 한 표에
import { h, api, clear, fmtDate, today } from '../ui.js';
import { state, canEdit, remember, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { seg } from './schedule.js';
import { isNew } from '../news.js';

export async function dutiesView(root) {
  const rows = await api(`/api/records/duties?year=${state.year}`);
  const reload = () => dutiesView(root);
  const me = myName();
  const filter = remember('duty_filter') || 'upcoming';
  const t = today();
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.data.date}|${r.data.title}`;
    if (!groups.has(k)) groups.set(k, { date: r.data.date, title: r.data.title, list: [] });
    groups.get(k).list.push(r);
  }
  let list = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (filter === 'upcoming') list = list.filter((g) => g.date >= t);
  if (filter === 'mine') list = list.filter((g) => g.list.some((r) => r.data.person === me));
  const editable = canEdit('duties');
  const add = (defaults) => openRecordForm('duties', null, { defaults, onSaved: reload });

  clear(root,
    h('div', { class: 'toolbar' },
      seg([['upcoming', '다가오는'], ['mine', '내 담당'], ['all', '전체']], filter, (v) => { remember('duty_filter', v); reload(); }),
      h('span', { class: 'grow' }),
      editable ? h('button', { class: 'btn primary', onclick: () => add({ date: t }) }, '+ 담당 배정') : null),
    list.length ? h('div', { class: 'cards' }, list.map((g) => h('div', { class: `card duty ${g.list.some((r) => r.data.person === me) ? 'mine' : ''}` },
      h('div', { class: 'card-head' },
        h('div', {}, h('strong', {}, g.title), h('div', { class: 'muted small' }, fmtDate(g.date))),
        editable ? h('button', { class: 'link-btn', onclick: () => add({ date: g.date, title: g.title }) }, '+ 담당 추가') : null),
      h('table', { class: 'table compact' },
        h('thead', {}, h('tr', {}, ['역할', '담당자', '장소', '시간'].map((x) => h('th', {}, x)))),
        h('tbody', {}, g.list.map((r) => h('tr', {
          class: `click ${r.data.person === me ? 'me' : ''} ${isNew('duties', r) ? 'is-new' : ''}`,
          onclick: () => openRecordForm('duties', r, { onSaved: reload }),
        }, h('td', {}, r.data.role || ''), h('td', {}, h('strong', {}, r.data.person || '')), h('td', {}, r.data.place || ''), h('td', {}, r.data.time || '')))))))) :
      h('p', { class: 'muted' }, filter === 'mine' ? '내 담당이 없습니다.' : '담당 배정이 없습니다.'),
    h('p', { class: 'hint' }, '같은 날·같은 행사명으로 입력한 담당은 한 표로 묶입니다. 내 담당은 홈의 "내 할 일"에도 나옵니다.'));
}
