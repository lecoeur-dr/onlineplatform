// 대시보드: 오늘 · 이번 주 · 이번 달 안내 · 재논의 회의 · 확인필요
import { h, api, clear, fmtDate, addDays, today } from '../ui.js';
import { state } from '../state.js';
import { openRecordForm } from '../form.js';

export async function dashboardView(root) {
  const guest = !state.me;
  const data = guest
    ? await api(`/api/public/bundle?year=${state.year}`)
    : await api(`/api/bundle?year=${state.year}&modules=events,programs,trips,monthNotes,meetings,notices`);
  const t = today();
  const weekEnd = addDays(t, 7);
  const onDay = (e, d) => e.data.date <= d && (e.data.endDate || e.data.date) >= d;
  const reload = () => dashboardView(root);
  const open = (mod, r) => (guest ? null : openRecordForm(mod, r, { onSaved: reload }));

  const todayEvents = data.events.filter((e) => onDay(e, t));
  const todayPrograms = data.programs.filter((p) => p.data.date === t);
  const todayTrips = data.trips.filter((p) => p.data.date === t);
  const week = data.events.filter((e) => e.data.date > t && e.data.date <= weekEnd);
  const monthKey = t.slice(0, 7);
  const note = data.monthNotes.find((n) => n.data.date === `${monthKey}-01`);
  const redo = data.meetings.filter((m) => m.data.status === '재논의').slice(-5);
  const review = data.events.filter((e) => e.data.review);
  const dueSoon = data.notices.filter((n) => n.data.due && n.data.due >= t && n.data.due <= addDays(t, 14));

  const item = (mod, r, text, sub) => h('li', { class: guest ? null : 'click', onclick: () => open(mod, r) }, h('span', {}, text), sub ? h('span', { class: 'muted' }, ` ${sub}`) : null);
  const inRange = new Date().getFullYear() === state.year || (new Date().getFullYear() === state.year + 1 && new Date().getMonth() < 2);

  clear(root,
    guest ? h('p', { class: 'alert' }, '로그인 없이 보는 읽기 전용 화면입니다. 다른 메뉴와 수정은 로그인 후 사용할 수 있습니다.') : null,
    inRange ? null : h('p', { class: 'alert' }, `지금 ${state.year}년 기록을 보고 있습니다. 오늘 일정은 올해 연도를 선택해야 보입니다.`),
    h('div', { class: 'dash' },
      h('div', { class: 'card' },
        h('h3', {}, `오늘 ${fmtDate(t)}`),
        todayEvents.length || todayPrograms.length || todayTrips.length ? h('ul', { class: 'list' },
          todayEvents.map((e) => item('events', e, e.data.title.split('\n')[0], [e.data.dept, e.data.place].filter(Boolean).join(' · '))),
          todayPrograms.map((p) => item('programs', p, `[${p.data.program}] ${(p.data.content || '').replace(/\n/g, ' ')}`)),
          todayTrips.map((p) => item('trips', p, `🚌 ${p.data.title}`))) : h('p', { class: 'muted' }, '오늘 등록된 일정이 없습니다.')),
      h('div', { class: 'card' },
        h('h3', {}, '다가오는 7일'),
        week.length ? h('ul', { class: 'list' }, week.map((e) => item('events', e, `${fmtDate(e.data.date)} ${e.data.title.split('\n')[0]}`, e.data.dept))) : h('p', { class: 'muted' }, '예정된 일정이 없습니다.')),
      h('div', { class: 'card' },
        h('h3', {}, `${Number(monthKey.slice(5))}월 교육과정 주요 안내`),
        note ? h('div', { class: guest ? 'pre' : 'pre click', onclick: () => open('monthNotes', note) }, note.data.content || '-') : h('p', { class: 'muted' }, '등록된 안내가 없습니다.'),
        note?.data.schoolDays ? h('p', { class: 'muted' }, `수업일수 ${note.data.schoolDays}`) : null),
      h('div', { class: 'card' },
        h('h3', {}, '재논의 안건'),
        redo.length ? h('ul', { class: 'list' }, redo.map((m) => item('meetings', m, m.data.agenda.split('\n')[0], fmtDate(m.data.date)))) : h('p', { class: 'muted' }, '재논의 안건이 없습니다.')),
      dueSoon.length ? h('div', { class: 'card' },
        h('h3', {}, '2주 안 마감 안내'),
        h('ul', { class: 'list' }, dueSoon.map((n) => item('notices', n, n.data.content.split('\n')[0], `${n.data.dept || ''} ~${fmtDate(n.data.due)}`)))) : null,
      review.length && !guest ? h('div', { class: 'card warn' },
        h('h3', {}, `확인필요 일정 ${review.length}건`),
        h('p', { class: 'muted' }, '가져올 때 담당·장소 줄이 행사와 맞지 않았던 일정입니다. 열어서 담당·장소를 고친 뒤 "확인필요"를 해제하세요.'),
        h('ul', { class: 'list' }, review.slice(0, 20).map((e) => item('events', e, `${fmtDate(e.data.date)} ${e.data.title.split('\n')[0]}`)))) : null));
}
