// 📅 학사일정 영역: 통합 달력 · 일정 목록 · 출장(목록/달력)
import { h, api, clear, toast, fmtDate, confirmBox } from '../ui.js';
import { state, remember, canEdit } from '../state.js';
import { renderCalendar, eventItem, programItem, tripItem, openClassItem, substituteItem, memoItem, dutyItems, briefingItem, deadlineItem } from './calendar.js';
import { tableView } from './table.js';
import { openRecordForm } from '../form.js';
import { categoryColor, CATEGORIES } from '../modules.js';

export function seg(options, current, onChange) {
  return h('div', { class: 'seg' }, options.map(([v, l]) => h('button', { class: current === v ? 'on' : '', onclick: () => onChange(v) }, l)));
}

// 통합 달력: 학사일정 + 특별수업 + 출장 + 동료장학 + 월별 전체 공지
export async function scheduleOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=events,programs,trips,openClasses,notices,substitutes,memos,duties,briefings,deadlines`);
  const items = [
    ...d.events.map(eventItem),
    ...d.programs.map((r) => programItem(r)),
    ...d.trips.map(tripItem),
    ...d.openClasses.map(openClassItem),
    ...d.substitutes.map(substituteItem),
    ...d.memos.map(memoItem),
    ...dutyItems(d.duties),
    ...d.briefings.map(briefingItem), ...d.deadlines.map(deadlineItem),
  ].filter(Boolean);
  renderCalendar(root, {
    key: 'cal_all', items, notices: d.notices, briefings: d.briefings, reload: () => scheduleOverview(root),
    add: [
      { mod: 'events', label: '일정', defaults: (date) => ({ date, category: '전체행사' }) },
      { mod: 'programs', label: '특별수업', defaults: (date) => ({ date, status: '예정' }) },
      { mod: 'trips', label: '복무·출장', defaults: (date) => ({ date, kind: '출장' }) },
      { mod: 'duties', label: '담당 배정', defaults: (date) => ({ date }) },
      { mod: 'memos', label: '한 줄 메모', defaults: (date) => ({ date }) },
    ],
    legend: [...CATEGORIES, { name: '보결', color: '#c2410c' }, { name: '담당 배정', color: '#0e7490' }, { name: '전달사항', color: '#b45309' }, { name: '기한', color: '#be123c' }, { name: '메모', color: '#64748b' }],
  });
}

export async function eventsList(root) {
  const box = h('div', {});
  clear(root,
    state.me?.role === 'admin' ? h('div', { class: 'toolbar' }, h('span', { class: 'grow' }), h('a', { class: 'btn', href: '#/admin?tab=smart' }, '🪄 학사일정 파일로 가져오기 (한글·엑셀)')) : null,
    box);
  await tableView(box, 'events', { hide: ['review', 'endDate'] });
}

// ⚠ 확인 필요: 가져오기 때 담당·장소 줄이 행사와 맞지 않았던 일정 (홈에서 옮겨 옴)
export async function reviewView(root) {
  const reload = () => reviewView(root);
  const rows = (await api(`/api/records/events?year=${state.year}`)).filter((e) => e.data.review).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const edit = canEdit('events');
  const done = async (r) => api(`/api/records/events/${r.id}`, { method: 'PUT', body: { data: { ...r.data, review: false }, version: r.version } });
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'muted' }, `확인 필요 ${rows.length}건`), h('span', { class: 'grow' }),
      edit && rows.length ? h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmBox(`${rows.length}건을 모두 확인 완료로 바꿀까요? (내용은 그대로 두고 "확인필요" 표시만 지웁니다)`))) return;
        let n = 0;
        try { for (const r of rows) { await done(r); n++; } toast(`${n}건을 확인 완료했습니다.`); } catch (e) { toast(`${n}건까지 처리: ${e.message}`, 'error'); }
        reload();
      } }, '모두 확인 완료') : null),
    rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['날짜', '행사명', '분류', '대상', '담당부서', '장소', '비고', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', { class: 'click', onclick: () => openRecordForm('events', r, { onSaved: reload }) },
        h('td', { class: 'nowrap small' }, fmtDate(r.data.date), r.data.endDate && r.data.endDate !== r.data.date ? ` ~ ${fmtDate(r.data.endDate, false)}` : ''),
        h('td', {}, h('strong', {}, String(r.data.title || '').split('\n')[0])), h('td', { class: 'small' }, r.data.category || ''), h('td', { class: 'small' }, r.data.target || ''),
        h('td', { class: 'small' }, r.data.dept || h('span', { class: 'muted' }, '-')), h('td', { class: 'small' }, r.data.place || h('span', { class: 'muted' }, '-')), h('td', { class: 'small' }, r.data.note || ''),
        h('td', { onclick: (e) => e.stopPropagation() }, edit ? h('button', { class: 'btn small', onclick: async () => { try { await done(r); toast('확인 완료했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); } } }, '✔ 확인 완료') : null)))))) :
      h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '✅'), h('p', {}, '확인이 필요한 일정이 없습니다.')),
    h('p', { class: 'hint' }, '학사일정 파일을 가져올 때 담당·장소 줄이 행사와 맞지 않았던 일정입니다. 줄을 눌러 담당부서·장소를 고친 뒤 [✔ 확인 완료]를 누르세요.'));
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
