// 🏠 홈: 전체 공지 · 오늘 · 이번 주 · 예산 요약 · 재논의 · 확인필요
import { h, api, clear, fmtDate, addDays, today, won, modal } from '../ui.js';
import { state } from '../state.js';
import { openRecordForm } from '../form.js';
import { eventItem, programItem, tripItem, openClassItem } from './calendar.js';
import { noticeCard } from './notices.js';
import { budgetSources } from './money.js';

export async function dashboardView(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=events,programs,trips,openClasses,notices,meetings,purchases,budget,contests`);
  const t = today();
  const ym = t.slice(0, 7);
  const reload = () => dashboardView(root);
  const all = [...d.events.map(eventItem), ...d.programs.map((r) => programItem(r)), ...d.trips.map(tripItem), ...d.openClasses.map(openClassItem)].filter(Boolean);
  const on = (it, day) => it.date <= day && (it.endDate || it.date) >= day;
  const todays = all.filter((it) => on(it, t));
  const week = all.filter((it) => it.date > t && it.date <= addDays(t, 7) && it.mod !== 'programs').sort((a, b) => a.date.localeCompare(b.date));
  const pinned = d.notices.filter((n) => n.data.pinned && (!n.data.month || n.data.month === ym));
  const redo = d.meetings.filter((m) => m.data.status === '재논의').slice(-5);
  const review = d.events.filter((e) => e.data.review);
  const sources = budgetSources(d.budget, d.contests);
  const assign = sources.reduce((a, s) => a + s.amount, 0);
  const req = d.purchases.reduce((a, p) => a + (Number(p.data.price) || 0) * (Number(p.data.qty) || 0), 0);
  const waiting = d.purchases.filter((p) => !p.data.received).length;

  const item = (it) => h('li', { class: 'click', onclick: () => openRecordForm(it.mod, it.r, { onSaved: reload }) },
    h('span', { class: 'dot', style: { background: it.color } }), h('span', {}, it.label), it.sub ? h('span', { class: 'muted' }, ` ${it.sub}`) : null);
  const inRange = new Date().getFullYear() === state.year || (new Date().getFullYear() === state.year + 1 && new Date().getMonth() < 2);

  clear(root,
    installHint(),
    inRange ? null : h('p', { class: 'alert' }, `지금 ${state.year}학년도 기록을 보고 있습니다. 오늘 일정은 올해 학년도를 선택해야 보입니다.`),
    pinned.length ? h('section', { class: 'section' }, h('div', { class: 'cards' }, pinned.map((n) => noticeCard(n, reload, { compact: true })))) : null,
    h('div', { class: 'dash' },
      h('div', { class: 'card' }, h('h3', {}, `오늘 ${fmtDate(t)}`),
        todays.length ? h('ul', { class: 'list' }, todays.map(item)) : h('p', { class: 'muted' }, '오늘 등록된 일정이 없습니다.'),
        h('a', { href: '#/schedule/overview', class: 'more-link' }, '학사일정 달력 →')),
      h('div', { class: 'card' }, h('h3', {}, '다가오는 7일'),
        week.length ? h('ul', { class: 'list' }, week.slice(0, 15).map((it) => item({ ...it, label: `${fmtDate(it.date)} ${it.label}` }))) : h('p', { class: 'muted' }, '예정된 일정이 없습니다.')),
      h('div', { class: 'card' }, h('h3', {}, '💰 예산·물품'),
        h('div', { class: 'mini-kpi' }, h('span', {}, '배정'), h('strong', {}, won(assign))),
        h('div', { class: 'mini-kpi' }, h('span', {}, '물품 신청'), h('strong', {}, won(req))),
        h('div', { class: 'mini-kpi' }, h('span', {}, '미수령'), h('strong', {}, `${waiting}건`)),
        h('a', { href: '#/money/overview', class: 'more-link' }, '사용 현황 →')),
      h('div', { class: 'card' }, h('h3', {}, '📝 재논의 안건'),
        redo.length ? h('ul', { class: 'list' }, redo.map((m) => h('li', { class: 'click', onclick: () => openRecordForm('meetings', m, { onSaved: reload }) }, m.data.agenda.split('\n')[0], h('span', { class: 'muted' }, ` ${fmtDate(m.data.date)}`)))) : h('p', { class: 'muted' }, '재논의 안건이 없습니다.'),
        h('a', { href: '#/notice/meetings', class: 'more-link' }, '회의록 →')),
      review.length ? h('div', { class: 'card warn' }, h('h3', {}, `확인필요 일정 ${review.length}건`),
        h('p', { class: 'muted small' }, '가져올 때 담당·장소 줄이 행사와 맞지 않았던 일정입니다. 열어서 고친 뒤 "확인필요"를 해제하세요.'),
        h('ul', { class: 'list' }, review.slice(0, 12).map((e) => item({ ...eventItem(e), label: `${fmtDate(e.data.date)} ${eventItem(e).label}` })))) : null));
}

// 휴대폰에서 앱처럼 쓰도록 '홈 화면에 추가' 안내 (이미 설치했거나 PC면 숨김)
function installHint() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let dismissed = false;
  try { dismissed = localStorage.getItem('gy_install_hide') === '1'; } catch { /* 무시 */ }
  if (standalone || dismissed || window.innerWidth > 800) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const box = h('div', { class: 'alert install' },
    h('strong', {}, '📲 휴대폰 홈 화면에 추가하면 앱처럼 바로 열립니다.'),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn primary small', onclick: async () => {
        if (state.installPrompt) { state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; box.remove(); return; }
        modal('홈 화면에 추가', h('ol', { class: 'steps' }, ios
          ? [h('li', {}, 'Safari 아래쪽 [공유] 버튼(□↑)을 누릅니다.'), h('li', {}, '[홈 화면에 추가]를 누릅니다.'), h('li', {}, '오른쪽 위 [추가]를 누르면 홈 화면에 "교무실" 아이콘이 생깁니다.')]
          : [h('li', {}, '크롬 오른쪽 위 [⋮] 메뉴를 누릅니다.'), h('li', {}, '[홈 화면에 추가] 또는 [앱 설치]를 누릅니다.'), h('li', {}, '홈 화면의 "교무실" 아이콘으로 바로 열 수 있습니다.')]));
      } }, '추가 방법'),
      h('button', { class: 'btn small', onclick: () => { try { localStorage.setItem('gy_install_hide', '1'); } catch { /* 무시 */ } box.remove(); } }, '닫기')));
  return box;
}
