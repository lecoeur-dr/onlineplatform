// 📢 공지·회의 영역: 한눈에 · 공지 · 회의록(같은 날·같은 회의 묶음)
import { h, api, clear, fmtDate, today, addDays } from '../ui.js';
import { state, canEdit, remember } from '../state.js';
import { openRecordForm } from '../form.js';
import { seg } from './schedule.js';

const monthLabel = (ym) => (ym ? `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월` : '');

export function noticeCard(n, reload, { compact = false } = {}) {
  const d = n.data;
  return h('div', { class: `card notice ${d.pinned ? 'pinned' : ''} click`, onclick: () => openRecordForm('notices', n, { onSaved: reload }) },
    h('div', { class: 'notice-head' },
      d.pinned ? h('span', { class: 'pin', title: '전체 공지' }, '📌') : null,
      h('strong', {}, d.title || (d.content || '').split('\n')[0].slice(0, 40)),
      h('span', { class: 'grow' }),
      d.category ? h('span', { class: 'tag ghost' }, d.category) : null,
      d.dept ? h('span', { class: 'tag' }, d.dept) : null),
    h('div', { class: 'muted small' }, [d.month ? monthLabel(d.month) : '', d.schoolDays ? `수업일수 ${d.schoolDays}` : '', d.due ? `마감 ${fmtDate(d.due)}` : ''].filter(Boolean).join(' · ')),
    d.content && d.content !== '-' ? h('div', { class: `pre ${compact ? 'clamp' : ''}` }, d.content) : null,
    d.link && /^https?:/.test(d.link) ? h('a', { href: d.link, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, '링크 열기') : null);
}

// 한눈에: 전체 공지 + 이번 달 + 마감 임박 + 최근 회의
export async function noticeOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=notices,meetings`);
  const reload = () => noticeOverview(root);
  const ym = today().slice(0, 7);
  const pinned = d.notices.filter((n) => n.data.pinned && (!n.data.month || n.data.month === ym));
  const month = d.notices.filter((n) => n.data.month === ym && !n.data.pinned);
  const due = d.notices.filter((n) => n.data.due && n.data.due >= today() && n.data.due <= addDays(today(), 14));
  const recent = groupMeetings(d.meetings).slice(0, 3);
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      canEdit('notices') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('notices', null, { defaults: { category: '일반' }, onSaved: reload }) }, '+ 공지') : null,
      canEdit('meetings') ? h('button', { class: 'btn', onclick: () => openRecordForm('meetings', null, { defaults: { date: today(), meeting: '전체회의' }, onSaved: reload }) }, '+ 회의 안건') : null),
    h('div', { class: 'two-col' },
      h('div', {},
        h('h3', {}, '📌 전체 공지'), pinned.length ? pinned.map((n) => noticeCard(n, reload)) : h('p', { class: 'muted' }, '고정된 공지가 없습니다.'),
        month.length ? [h('h3', {}, `${monthLabel(ym)} 공지`), month.map((n) => noticeCard(n, reload, { compact: true }))] : null,
        due.length ? [h('h3', {}, '⏰ 2주 안 마감'), due.map((n) => noticeCard(n, reload, { compact: true }))] : null),
      h('div', {},
        h('h3', {}, '📝 최근 회의'), recent.length ? recent.map((g) => meetingCard(g, reload)) : h('p', { class: 'muted' }, '회의 기록이 없습니다.'))));
}

// 공지: 분류별 · 부서별
export async function noticesView(root) {
  const rows = await api(`/api/records/notices?year=${state.year}`);
  const reload = () => noticesView(root);
  const cat = remember('notice_cat') || '';
  const dept = remember('notice_dept') || '';
  const shown = rows.filter((n) => (!cat || n.data.category === cat) && (!dept || n.data.dept === dept));
  const depts = [...new Set(rows.map((n) => n.data.dept).filter(Boolean))];
  const pinned = shown.filter((n) => n.data.pinned).sort((a, b) => String(a.data.month || '').localeCompare(String(b.data.month || '')));
  const rest = shown.filter((n) => !n.data.pinned);
  const byMonth = rest.filter((n) => n.data.month).sort((a, b) => a.data.month.localeCompare(b.data.month));
  const byDept = rest.filter((n) => !n.data.month);
  const deptGroups = new Map();
  for (const n of byDept) { const k = n.data.dept || '전체'; if (!deptGroups.has(k)) deptGroups.set(k, []); deptGroups.get(k).push(n); }
  clear(root,
    h('div', { class: 'toolbar' },
      seg([['', '전체'], ['월별 안내', '월별 안내'], ['부서 안내', '부서 안내'], ['일반', '일반']], cat, (v) => { remember('notice_cat', v); noticesView(root); }),
      h('select', { onchange: (e) => { remember('notice_dept', e.target.value); noticesView(root); } }, h('option', { value: '' }, '모든 부서'), depts.map((x) => h('option', { value: x, selected: x === dept }, x))),
      h('span', { class: 'grow' }),
      canEdit('notices') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('notices', null, { defaults: { category: cat || '일반', dept }, onSaved: reload }) }, '+ 공지') : null),
    h('p', { class: 'hint' }, '"전체 공지"를 체크하면 홈과 학사일정 달력(해당 월 머리)에 고정됩니다. 월별 안내는 해당 월을 지정하세요.'),
    pinned.length ? h('section', { class: 'section' }, h('h3', {}, '📌 전체 공지'), h('div', { class: 'cards' }, pinned.map((n) => noticeCard(n, reload)))) : null,
    byMonth.length ? h('section', { class: 'section' }, h('h3', {}, '월별'), h('div', { class: 'cards' }, byMonth.map((n) => noticeCard(n, reload)))) : null,
    [...deptGroups].map(([k, list]) => h('section', { class: 'section' }, h('h3', {}, k), h('div', { class: 'cards' }, list.map((n) => noticeCard(n, reload, { compact: true }))))),
    shown.length ? null : h('p', { class: 'muted' }, '공지가 없습니다.'));
}

// ---------- 회의록 ----------

export function groupMeetings(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = `${r.data.date}|${r.data.meeting || '회의'}`;
    if (!map.has(k)) map.set(k, { date: r.data.date, meeting: r.data.meeting || '회의', rows: [] });
    map.get(k).rows.push(r);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function meetingCard(g, reload, open = true) {
  const redo = g.rows.filter((r) => r.data.status === '재논의').length;
  return h('details', { class: 'card meeting', open },
    h('summary', {},
      h('strong', {}, `${fmtDate(g.date)} · ${g.meeting}`),
      h('span', { class: 'muted' }, ` 안건 ${g.rows.length}개`),
      redo ? h('span', { class: 'badge warn' }, `재논의 ${redo}`) : null),
    h('table', { class: 'table compact' },
      h('thead', {}, h('tr', {}, ['안건', '결과', '상태'].map((t) => h('th', {}, t)))),
      h('tbody', {}, g.rows.map((r) => h('tr', { class: `click ${r.data.status === '재논의' ? 'hl' : ''}`, onclick: () => openRecordForm('meetings', r, { onSaved: reload }) },
        h('td', { class: 'pre' }, r.data.agenda), h('td', { class: 'pre' }, r.data.result || ''), h('td', { class: 'nowrap' }, r.data.status || ''))))),
    canEdit('meetings') ? h('button', { class: 'link-btn', onclick: () => openRecordForm('meetings', null, { defaults: { date: g.date, meeting: g.meeting, status: '완료' }, onSaved: reload }) }, '+ 이 회의에 안건 추가') : null);
}

export async function meetingsView(root) {
  const rows = await api(`/api/records/meetings?year=${state.year}`);
  const reload = () => meetingsView(root);
  const kind = remember('meeting_kind') || '';
  const q = remember('meeting_q') || '';
  const kinds = [...new Set(rows.map((r) => r.data.meeting || '회의'))];
  const shown = rows.filter((r) => (!kind || (r.data.meeting || '회의') === kind) && (!q || JSON.stringify(r.data).includes(q)));
  const groups = groupMeetings(shown);
  clear(root,
    h('div', { class: 'toolbar' },
      seg([['', '전체'], ...kinds.map((k) => [k, k])], kind, (v) => { remember('meeting_kind', v); meetingsView(root); }),
      h('input', { type: 'search', placeholder: '안건·결과 검색', value: q, onchange: (e) => { remember('meeting_q', e.target.value); meetingsView(root); } }),
      h('span', { class: 'muted' }, `회의 ${groups.length}번 · 안건 ${shown.length}개`),
      h('span', { class: 'grow' }),
      canEdit('meetings') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('meetings', null, { defaults: { date: today(), meeting: kind || '전체회의', status: '완료' }, onSaved: reload }) }, '+ 새 회의') : null),
    groups.map((g, i) => meetingCard(g, reload, i < 5)),
    groups.length ? null : h('p', { class: 'muted' }, '회의 기록이 없습니다.'));
}
