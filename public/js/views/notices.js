// 📢 공지·회의 영역: 한눈에 · 공지 · 회의록(같은 날·같은 회의 묶음)
import { h, api, clear, fmtDate, today, addDays, toast, modal } from '../ui.js';
import { state, canEdit, remember, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { seg } from './schedule.js';
import { isNew } from '../news.js';
import { eventItem, programItem, tripItem, openClassItem, substituteItem, memoItem, dutyItems, deadlineItem } from './calendar.js';

const monthLabel = (ym) => (ym ? `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월` : '');

export function noticeCard(n, reload, { compact = false } = {}) {
  const d = n.data;
  return h('div', { class: `card notice ${d.pinned ? 'pinned' : ''} ${isNew('notices', n) ? 'is-new' : ''} click`, onclick: () => openRecordForm('notices', n, { onSaved: reload }) },
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

// 그날의 행사·일정 모두 (학사일정·특별수업·동료장학·복무·보결·담당·예약·회의·마감·메모 — 기본 시간표 제외)
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
function dayBoard(d, date, setDate, reload) {
  const items = [
    ...d.events.map(eventItem), ...d.programs.map((r) => programItem(r)), ...d.trips.map(tripItem), ...d.openClasses.map(openClassItem),
    ...d.substitutes.map(substituteItem), ...d.memos.map(memoItem), ...dutyItems(d.duties),
    ...d.reservations.map((r) => ({ mod: 'reservations', r, date: r.data.date, cat: '특별실 예약', color: '#0369a1', label: `🏫 ${r.data.period || ''} ${r.data.place || ''}`.trim(), sub: [r.data.user, r.data.className].filter(Boolean).join(' ') })),
    ...groupMeetings(d.meetings).map((g) => ({ mod: 'meetings', r: g.rows[0], date: g.date, cat: '회의', color: '#0f8f86', label: `📝 ${g.meeting} (안건 ${g.rows.length})`, go: '#/notice/meetings' })),
    ...d.collections.filter((c) => c.data.due).map((c) => ({ mod: 'collections', r: c, date: c.data.due, cat: '수합 마감', color: '#0e7490', label: `📥 마감: ${c.data.title}`, go: '#/notice/collections' })),
    ...d.deadlines.map(deadlineItem),
    ...d.notices.filter((n) => n.data.due).map((n) => ({ mod: 'notices', r: n, date: n.data.due, cat: '공지 마감', color: '#b7791f', label: `📢 마감: ${n.data.title || String(n.data.content || '').split('\n')[0]}` })),
  ].filter((it) => it && it.date && it.date <= date && (it.endDate || it.date) >= date);
  const [y, m, dd] = date.split('-').map(Number);
  const cats = [...new Set(items.map((it) => it.cat))];
  return h('section', { class: 'card day-board' },
    h('div', { class: 'card-head' }, h('h3', {}, `📅 ${m}월 ${dd}일(${DOW_KO[new Date(y, m - 1, dd).getDay()]}) 행사·일정`), h('span', { class: 'tag' }, `${items.length}건`), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => setDate(addDays(date, -1)) }, '◀'),
      h('button', { class: `btn small ${date === today() ? 'primary' : ''}`, onclick: () => setDate(today()) }, '오늘'),
      h('button', { class: 'btn small', onclick: () => setDate(addDays(date, 1)) }, '▶'),
      h('input', { type: 'date', value: date, onchange: (e) => e.target.value && setDate(e.target.value) })),
    items.length ? h('div', { class: 'day-groups' }, cats.map((c) => {
      const list = items.filter((it) => it.cat === c);
      return h('div', { class: 'day-group' }, h('div', { class: 'day-cat' }, h('i', { style: { background: list[0].color } }), c, h('span', { class: 'muted small' }, ` ${list.length}`)),
        h('ul', { class: 'list' }, list.map((it) => h('li', { class: `click ${it.cancel ? 'cancel' : ''}`, onclick: () => (it.go ? (location.hash = it.go) : openRecordForm(it.mod, it.r, { onSaved: reload })) }, it.label, it.sub ? h('span', { class: 'muted' }, ` · ${it.sub}`) : null))));
    })) : h('p', { class: 'muted' }, '이 날은 등록된 행사·일정이 없습니다.'),
    h('p', { class: 'hint' }, '학사일정·특별수업·동료장학·복무·보결·담당 배정·특별실 예약·회의·기한·마감·메모를 모두 모아 보여 줍니다(기본 시간표 제외).'));
}

// 한눈에: 그날의 행사 + 전체 공지 + 이번 달 + 마감 임박 + 최근 회의
export async function noticeOverview(root, date = today()) {
  const d = await api(`/api/bundle?year=${state.year}&modules=notices,meetings,events,programs,trips,openClasses,substitutes,memos,duties,reservations,collections,deadlines`);
  const reload = () => noticeOverview(root);
  const ym = today().slice(0, 7);
  const pinned = d.notices.filter((n) => n.data.pinned && (!n.data.month || n.data.month === ym));
  const month = d.notices.filter((n) => n.data.month === ym && !n.data.pinned);
  const due = d.notices.filter((n) => n.data.due && n.data.due >= today() && n.data.due <= addDays(today(), 14));
  const recent = groupMeetings(d.meetings).slice(0, 3);
  const board = h('div', {});
  const setDate = (x) => clear(board, dayBoard(d, x, setDate, reload));
  setDate(date);
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      canEdit('notices') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('notices', null, { defaults: { category: '일반' }, onSaved: reload }) }, '+ 공지') : null,
      canEdit('meetings') ? h('button', { class: 'btn', onclick: () => openRecordForm('meetings', null, { defaults: { date: today(), meeting: '전체회의' }, onSaved: reload }) }, '+ 회의 안건') : null),
    board,
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
      canEdit('meetings') ? h('button', { class: 'btn primary', onclick: () => newMeeting(kind, reload) }, '+ 새 회의록') : null),
    groups.map((g) => meetingCard(g, reload, false)),
    groups.length ? null : h('p', { class: 'muted' }, '회의 기록이 없습니다.'));
}

// 새 회의록: 예정된 회의(회의 탭)를 불러오거나, 빈 회의록으로 시작
async function newMeeting(kind, reload) {
  const [plans, recs] = await Promise.all([api(`/api/records/meetingPlans?year=${state.year}`), api(`/api/records/meetings?year=${state.year}`)]);
  const used = new Set(recs.map((r) => r.data.planId).filter(Boolean));
  const t = today();
  const cand = plans.filter((p) => !used.has(p.id) && p.data.date <= addDays(t, 7)).sort((a, b) => b.data.date.localeCompare(a.data.date)).slice(0, 12);
  const blank = () => openRecordForm('meetings', null, { defaults: { date: t, meeting: kind || '전체회의', status: '완료' }, onSaved: reload });
  if (!cand.length) return blank();
  const load = async (p, close) => {
    const items = String(p.data.agenda || '').split('\n').map((x) => x.replace(/^\s*[-·•\d.)]+\s*/, '').trim()).filter(Boolean);
    const base = { date: p.data.date, meeting: p.data.meeting || '회의', planId: p.id };
    close();
    if (!items.length) return openRecordForm('meetings', null, { defaults: { ...base, agenda: p.data.title || '', status: '완료' }, onSaved: reload });
    try {
      for (const agenda of items) await api('/api/records/meetings', { method: 'POST', body: { data: { ...base, agenda, status: '진행중' } } });
      toast(`안건 ${items.length}개를 불러왔습니다. 안건을 눌러 결과를 적어 주세요.`); reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const closeModal = modal('📝 새 회의록', h('div', {},
    h('p', { class: 'muted small' }, '회의 탭에 등록한 회의를 불러오면 날짜·회의명·안건이 채워집니다. 불러오지 않고 빈 회의록으로 시작해도 됩니다.'),
    h('ul', { class: 'list pick-list' }, cand.map((p) => h('li', {},
      h('div', { class: 'grow' }, h('strong', {}, `${fmtDate(p.data.date)} · ${p.data.meeting || '회의'}`), p.data.title ? ` ${p.data.title}` : '',
        h('div', { class: 'muted small' }, p.data.agenda ? `안건 ${String(p.data.agenda).split('\n').filter((x) => x.trim()).length}개` : '안건 미리 입력 없음')),
      h('button', { class: 'btn small primary', onclick: () => load(p, closeModal) }, '불러오기'))))), [
    (close) => h('button', { class: 'btn', onclick: () => { close(); blank(); } }, '불러오지 않고 빈 회의록으로'),
  ]);
}

// ---------- 회의 (예정) : 저장하면 학사일정·공지 자동 등록 ----------
export async function meetingPlansView(root) {
  const [plans, recs] = await Promise.all([api(`/api/records/meetingPlans?year=${state.year}`), api(`/api/records/meetings?year=${state.year}`)]);
  const reload = () => meetingPlansView(root);
  const t = today();
  const done = new Set(recs.map((r) => r.data.planId).filter(Boolean));
  const mode = remember('mp_mode') || 'up';
  const shown = plans.filter((p) => (mode === 'up' ? p.data.date >= t : p.data.date < t)).sort((a, b) => (mode === 'up' ? a.data.date.localeCompare(b.data.date) : b.data.date.localeCompare(a.data.date)));
  const writeRecord = async (p) => {
    const items = String(p.data.agenda || '').split('\n').map((x) => x.replace(/^\s*[-·•\d.)]+\s*/, '').trim()).filter(Boolean);
    const base = { date: p.data.date, meeting: p.data.meeting || '회의', planId: p.id };
    if (!items.length) return openRecordForm('meetings', null, { defaults: { ...base, agenda: p.data.title || '', status: '완료' }, onSaved: () => { location.hash = '#/notice/meetings'; } });
    for (const agenda of items) await api('/api/records/meetings', { method: 'POST', body: { data: { ...base, agenda, status: '진행중' } } });
    toast(`안건 ${items.length}개로 회의록을 만들었습니다.`); location.hash = '#/notice/meetings';
  };
  clear(root,
    h('div', { class: 'toolbar' },
      seg([['up', `다가오는 회의 (${plans.filter((p) => p.data.date >= t).length})`], ['past', '지난 회의']], mode, (v) => { remember('mp_mode', v); reload(); }),
      h('span', { class: 'grow' }),
      canEdit('meetingPlans') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('meetingPlans', null, { defaults: { date: t, meeting: '전체회의', toCalendar: true, toNotice: true }, onSaved: reload }) }, '+ 회의 등록') : null),
    shown.length ? h('div', { class: 'cards' }, shown.map((p) => {
      const d = p.data;
      const dd = Math.round((new Date(`${d.date}T00:00:00`) - new Date(`${t}T00:00:00`)) / 86400000);
      return h('div', { class: 'card mplan' },
        h('div', { class: 'card-head' }, h('strong', { class: 'click', onclick: () => openRecordForm('meetingPlans', p, { onSaved: reload }) }, `${fmtDate(d.date)}${d.time ? ` ${d.time}` : ''} · ${d.meeting || '회의'}`),
          dd >= 0 ? h('span', { class: `tag ${dd <= 1 ? 'warn' : 'ghost'}` }, dd === 0 ? '오늘' : `D-${dd}`) : null),
        d.title ? h('div', {}, d.title) : null,
        h('div', { class: 'muted small' }, [d.place && `📍 ${d.place}`, d.dept && `주관 ${d.dept}`, `👥 ${(d.attendees || []).length ? `${d.attendees.length}명` : '전체 교직원'}`].filter(Boolean).join(' · ')),
        d.agenda ? h('ol', { class: 'small mplan-agenda' }, String(d.agenda).split('\n').filter((x) => x.trim()).map((x) => h('li', {}, x.replace(/^\s*[-·•]\s*/, '')))) : null,
        h('div', { class: 'row-actions' },
          d.eventId ? h('a', { class: 'tag ok', href: '#/schedule/overview' }, '📅 학사일정 등록됨') : h('span', { class: 'tag ghost' }, '학사일정 미등록'),
          d.noticeId ? h('a', { class: 'tag ok', href: '#/notice/notices' }, '📢 공지 등록됨') : h('span', { class: 'tag ghost' }, '공지 미등록'),
          h('span', { class: 'grow' }),
          done.has(p.id) ? h('a', { class: 'tag blue', href: '#/notice/meetings' }, '📝 회의록 있음') : canEdit('meetings') ? h('button', { class: 'btn small', onclick: () => writeRecord(p).catch((e) => toast(e.message, 'error')) }, '📝 회의록 쓰기') : null));
    })) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🗓'), h('p', {}, mode === 'up' ? '예정된 회의가 없습니다. [+ 회의 등록]으로 회의를 알리면 학사일정과 공지에 자동으로 올라갑니다.' : '지난 회의가 없습니다.')),
    h('p', { class: 'hint' }, '회의를 등록하면 학사일정(분류: 회의)과 공지에 자동으로 올라가고, 회의 내용을 고치면 함께 고쳐집니다. 체크를 끄거나 회의를 지우면 자동으로 올린 일정·공지도 함께 지워집니다. 회의가 끝나면 [📝 회의록 쓰기]로 미리 적은 안건을 회의록으로 불러옵니다.'));
}

// ---------- 수합 (제출 체크) ----------

export const targetsOf = (r) => (r.data.target?.length ? r.data.target : state.staff.map((x) => x.name).filter(Boolean));
export const isMyTask = (r) => targetsOf(r).includes(myName()) && !(r.data.done || []).includes(myName());

export function dday(due) {
  if (!due) return '';
  const diff = Math.round((new Date(`${due}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);
  return diff === 0 ? 'D-day' : diff > 0 ? `D-${diff}` : `마감 ${-diff}일 지남`;
}

function collectionCard(r, reload, onToggle) {
  const targets = targetsOf(r);
  const done = (r.data.done || []).filter((n) => targets.includes(n));
  const missing = targets.filter((n) => !done.includes(n));
  const me = myName();
  const mine = targets.includes(me);
  const iDone = (r.data.done || []).includes(me);
  const pct = targets.length ? Math.round((done.length / targets.length) * 100) : 0;
  const late = r.data.due && r.data.due < today() && missing.length;
  return h('div', { class: `card collection ${late ? 'late' : ''}` },
    h('div', { class: 'notice-head' },
      h('strong', { class: 'click', onclick: () => openRecordForm('collections', r, { onSaved: reload }) }, r.data.title),
      h('span', { class: 'grow' }),
      r.data.due ? h('span', { class: `tag ${late ? 'danger' : ''}` }, `${fmtDate(r.data.due)} · ${dday(r.data.due)}`) : null),
    r.data.content ? h('div', { class: 'pre small' }, r.data.content) : null,
    h('div', { class: 'bar', title: `${done.length}/${targets.length}` }, h('span', { style: { width: `${pct}%` } }), h('em', {}, `제출 ${done.length} / ${targets.length}명`)),
    h('div', { class: 'row-actions' },
      mine && state.me.role !== 'viewer' ? h('button', { class: `btn small ${iDone ? '' : 'primary'}`, onclick: () => onToggle(r, !iDone) }, iDone ? '✔ 제출함 (취소)' : '제출 완료') : null,
      r.data.link && /^https?:/.test(r.data.link) ? h('a', { class: 'btn small', href: r.data.link, target: '_blank', rel: 'noopener' }, '제출 링크 열기') : null),
    missing.length ? h('details', { class: 'small' }, h('summary', {}, `미제출 ${missing.length}명`), h('div', { class: 'muted' }, missing.join(', '))) : h('div', { class: 'small muted' }, '모두 제출했습니다.'));
}

export async function collectionsView(root) {
  const rows = await api(`/api/records/collections?year=${state.year}`);
  const reload = () => collectionsView(root);
  const mode = remember('col_mode') || 'open';
  const t = today();
  const toggle = async (r, on) => {
    try { Object.assign(r, await api(`/api/records/collections/${r.id}/self`, { method: 'POST', body: { on } })); toast(on ? '제출 완료로 표시했습니다.' : '제출 표시를 취소했습니다.'); draw(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const draw = () => {
    const shown = rows
      .filter((r) => mode === 'all' || (mode === 'mine' ? isMyTask(r) : (!r.data.due || r.data.due >= addDays(t, -7)) && targetsOf(r).some((n) => !(r.data.done || []).includes(n))))
      .sort((a, b) => String(a.data.due || '9999').localeCompare(String(b.data.due || '9999')));
    const mineN = rows.filter(isMyTask).length;
    clear(root,
      h('div', { class: 'toolbar' },
        seg([['open', '진행 중'], ['mine', `내가 낼 것${mineN ? ` (${mineN})` : ''}`], ['all', '전체']], mode, (v) => { remember('col_mode', v); collectionsView(root); }),
        h('span', { class: 'grow' }),
        canEdit('collections') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('collections', null, { onSaved: reload }) }, '+ 수합') : null),
      h('p', { class: 'hint' }, '대상을 비워 두면 승인된 전체 교직원이 대상입니다. 각자 [제출 완료]를 누르면 미제출 명단이 자동으로 줄어듭니다.'),
      shown.length ? h('div', { class: 'cards' }, shown.map((r) => collectionCard(r, reload, toggle))) : h('p', { class: 'muted' }, '해당하는 수합이 없습니다.'));
  };
  draw();
}

// 📣 조례·종례 전달사항: 날짜별로 모아 보고, 담임은 그대로 읽어 줄 수 있게 크게 보기
export async function briefingsView(root) {
  const rows = await api(`/api/records/briefings?year=${state.year}`);
  const reload = () => briefingsView(root);
  const t = today();
  const range = remember('brief_range') || 'upcoming';
  const shown = rows.filter((r) => range === 'all' || r.data.date >= t).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const byDate = new Map();
  for (const r of shown) { if (!byDate.has(r.data.date)) byDate.set(r.data.date, []); byDate.get(r.data.date).push(r); }
  const editable = canEdit('briefings');
  const big = (date, list) => modal(`📣 ${fmtDate(date)} 전달사항`, h('div', { class: 'brief-big' }, list.map((r) => h('div', { class: 'brief-item' },
    h('div', { class: 'muted small' }, [r.data.kind, r.data.target, r.data.dept].filter(Boolean).join(' · ')),
    h('div', { class: 'pre' }, r.data.content)))), [], { wide: true });
  clear(root,
    h('div', { class: 'toolbar' },
      seg([['upcoming', '오늘부터'], ['all', '전체']], range, (v) => { remember('brief_range', v); reload(); }),
      h('span', { class: 'grow' }),
      editable ? h('button', { class: 'btn primary', onclick: () => openRecordForm('briefings', null, { defaults: { date: t, kind: '조례' }, onSaved: reload }) }, '+ 전달사항') : null),
    byDate.size ? h('div', { class: 'cards' }, [...byDate].map(([date, list]) => h('div', { class: `card ${date === t ? 'mine' : ''}` },
      h('div', { class: 'card-head' }, h('strong', {}, `${fmtDate(date)}${date === t ? ' · 오늘' : ''}`),
        h('div', { class: 'row-actions' },
          h('button', { class: 'link-btn', onclick: () => big(date, list) }, '크게 보기'),
          editable ? h('button', { class: 'link-btn', onclick: () => openRecordForm('briefings', null, { defaults: { date, kind: '조례' }, onSaved: reload }) }, '+ 추가') : null)),
      list.map((r) => h('div', { class: `brief-row click ${isNew('briefings', r) ? 'is-new' : ''}`, onclick: () => openRecordForm('briefings', r, { onSaved: reload }) },
        r.data.kind ? h('span', { class: 'tag' }, r.data.kind) : null, r.data.target ? h('span', { class: 'tag ghost' }, r.data.target) : null,
        h('div', { class: 'pre' }, r.data.content), r.data.dept ? h('div', { class: 'muted small' }, r.data.dept) : null))))) :
      h('p', { class: 'muted' }, '전달사항이 없습니다.'),
    h('p', { class: 'hint' }, '등록하면 학교 선생님들에게 알림이 갑니다. 홈과 Deskterior "내 책상"의 오늘 전달사항에도 나옵니다.'));
}
