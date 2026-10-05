// ⏰ 기한 안내: 공모 신청·정산·결과 보고·공문 제출 등 마감 기한을 D-day 로 (학사일정 달력·공지 한눈에에도 표시)
import { h, api, clear, toast, today, addDays } from '../ui.js';
import { state, canEdit, remember } from '../state.js';
import { openRecordForm } from '../form.js';

const DOWK = ['일', '월', '화', '수', '목', '금', '토'];
const dayDiff = (d) => { const [y, m, dd] = d.split('-').map(Number); const a = new Date(); a.setHours(0, 0, 0, 0); return Math.round((new Date(y, m - 1, dd) - a) / 86400000); };
const label = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${DOWK[new Date(y, m - 1, dd).getDay()]})`; };

export async function deadlinesView(root) {
  const rows = await api(`/api/records/deadlines?year=${state.year}`);
  const reload = () => deadlinesView(root);
  const cat = remember('dl_cat') || '';
  const showDone = !!remember('dl_done');
  const t = today();
  const list = rows.filter((r) => !cat || r.data.category === cat).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const open = list.filter((r) => !r.data.done);
  const overdue = open.filter((r) => r.data.date < t);
  const week = open.filter((r) => r.data.date >= t && r.data.date <= addDays(t, 7));
  const later = open.filter((r) => r.data.date > addDays(t, 7));
  const done = list.filter((r) => r.data.done);
  const cats = [...new Set(rows.map((r) => r.data.category).filter(Boolean))];
  const toggle = async (r) => { try { await api(`/api/records/deadlines/${r.id}`, { method: 'PUT', body: { data: { ...r.data, done: !r.data.done }, version: r.version } }); reload(); } catch (e) { toast(e.message, 'error'); } };
  const item = (r) => {
    const n = dayDiff(r.data.date);
    return h('li', { class: `dl-item ${r.data.done ? 'done' : n < 0 ? 'over' : n <= 3 ? 'soon' : ''}` },
      canEdit('deadlines') ? h('input', { type: 'checkbox', checked: !!r.data.done, title: '완료', onchange: () => toggle(r) }) : null,
      h('span', { class: 'dl-d' }, r.data.done ? '완료' : n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`),
      h('span', { class: 'dl-date' }, label(r.data.date)),
      h('span', { class: 'dl-title click', onclick: () => openRecordForm('deadlines', r, { onSaved: reload }) }, r.data.title,
        h('span', { class: 'muted small' }, [r.data.category, r.data.dept, r.data.person].filter(Boolean).map((x) => ` · ${x}`).join(''))),
      r.data.link && /^https?:/.test(r.data.link) ? h('a', { class: 'link-btn small', href: r.data.link, target: '_blank', rel: 'noopener' }, '링크') : null);
  };
  const sec = (title, arr, cls = '') => (arr.length ? h('section', { class: `section ${cls}` }, h('h3', {}, title, h('span', { class: 'muted small' }, ` ${arr.length}건`)), h('ul', { class: 'dl-list' }, arr.map(item))) : null);
  clear(root,
    h('div', { class: 'kpis' },
      h('div', { class: `kpi ${overdue.length ? 'warn' : ''}` }, h('div', { class: 'kpi-label' }, '기한 지남'), h('div', { class: 'kpi-value' }, `${overdue.length}건`)),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '7일 안'), h('div', { class: 'kpi-value' }, `${week.length}건`)),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '이후'), h('div', { class: 'kpi-value' }, `${later.length}건`)),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '완료'), h('div', { class: 'kpi-value' }, `${done.length}건`))),
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, ['', ...cats].map((c) => h('button', { class: cat === c ? 'on' : '', onclick: () => { remember('dl_cat', c); reload(); } }, c || '전체'))),
      h('label', { class: 'inline small' }, h('input', { type: 'checkbox', checked: showDone, onchange: (e) => { remember('dl_done', e.target.checked); reload(); } }), ' 완료한 것 보기'),
      h('span', { class: 'grow' }),
      canEdit('deadlines') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('deadlines', null, { defaults: { date: addDays(t, 7), category: cat || '' }, onSaved: reload }) }, '+ 기한') : null),
    sec('🚨 기한 지남 (미완료)', overdue, 'dl-over'),
    sec('⏳ 7일 안', week),
    sec('📆 이후', later),
    showDone ? sec('✔ 완료', done) : null,
    list.length ? null : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '⏰'), h('p', {}, '공모 신청·정산·결과 보고·공문 제출 기한을 넣어 두면 D-day 로 보이고, 학사일정 달력과 공지·업무 → 한눈에에도 나옵니다.')),
    h('p', { class: 'hint' }, '체크하면 완료 처리됩니다. 기한은 학사일정 달력(빨간 "기한")과 공지·업무 → 한눈에의 그날 일정에도 표시됩니다.'));
}
