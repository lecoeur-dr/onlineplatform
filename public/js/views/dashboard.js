// 🏠 홈: 전체 공지 · 날짜별 게시판[오늘·이번 주·이번 달] · 내 할 일 · 급식 · 재논의 (확인필요 일정은 학사일정 → 확인 필요 탭)
import { h, api, clear, fmtDate, addDays, today, won, modal, DOW } from '../ui.js';
import { state, remember, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { eventItem, programItem, tripItem, openClassItem, substituteItem } from './calendar.js';
import { noticeCard, isMyTask, dday, isExpired } from './notices.js';
import { seg } from './schedule.js';
import { unseen, tabOf } from '../news.js';
import { MODULES } from '../modules.js';

const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const weekStart = (d) => { const [y, m, dd] = d.split('-').map(Number); return addDays(d, -new Date(y, m - 1, dd).getDay()); };

export async function dashboardView(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=events,programs,trips,openClasses,notices,meetings,substitutes,collections,duties,reservations,briefings`);
  const t = today();
  const ym = t.slice(0, 7);
  const me = myName();
  const reload = () => dashboardView(root);
  const all = [
    ...d.events.map(eventItem), ...d.programs.map((r) => programItem(r)), ...d.trips.map(tripItem),
    ...d.openClasses.map(openClassItem), ...d.substitutes.map(substituteItem),
  ].filter(Boolean);
  for (const x of d.duties) all.push({ mod: 'duties', r: x, date: x.data.date, cat: '담당', color: '#0e7490', label: `🧑‍🏫 ${x.data.title}${x.data.role ? ` · ${x.data.role}` : ''}`, sub: x.data.person || '' });
  for (const c of d.collections) if (c.data.due) all.push({ mod: 'collections', r: c, date: c.data.due, cat: '취합', color: '#0e7490', label: `📥 마감: ${c.data.title}`, sub: '' });
  for (const n of d.notices) if (n.data.due) all.push({ mod: 'notices', r: n, date: n.data.due, cat: '공지', color: '#b7791f', label: `📢 마감: ${n.data.title || n.data.content.split('\n')[0]}`, sub: n.data.dept || '' });

  const pinned = d.notices.filter((n) => !isExpired(n) && n.data.pinned && (!n.data.month || n.data.month === ym));
  const redo = d.meetings.filter((m) => m.data.status === '재논의').slice(-5);

  // 내 할 일: 내 보결(7일 안) · 내가 낼 취합 · 내 복무
  const mySubs = d.substitutes.filter((s) => s.data.substitute === me && s.data.date >= t && s.data.date <= addDays(t, 7)).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const myCols = d.collections.filter(isMyTask).sort((a, b) => String(a.data.due || '9999').localeCompare(String(b.data.due || '9999')));
  const myDuties = d.duties.filter((x) => x.data.person === me && x.data.date >= t && x.data.date <= addDays(t, 14)).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const myResv = d.reservations.filter((x) => x.data.user === me && x.data.date >= t && x.data.date <= addDays(t, 7)).sort((a, b) => `${a.data.date}${a.data.period}`.localeCompare(`${b.data.date}${b.data.period}`));
  // D-Day: 'D-Day 표시'를 체크한 일정 중 오늘 이후
  const ddays = d.events.filter((e) => e.data.dday && (e.data.endDate || e.data.date) >= t).sort((a, b) => a.data.date.localeCompare(b.data.date)).slice(0, 6);
  const news = unseen();
  const briefs = d.briefings.filter((b) => b.data.date === t);
  const myLeaves = d.trips.filter((x) => x.data.person === me && (x.data.endDate || x.data.date) >= t && x.data.date <= addDays(t, 7));

  const item = (it) => h('li', { class: 'click', onclick: () => openRecordForm(it.mod, it.r, { onSaved: reload }) },
    h('span', { class: 'dot', style: { background: it.color } }), h('span', {}, it.label), it.sub ? h('span', { class: 'muted' }, ` ${it.sub}`) : null);
  const inRange = new Date().getFullYear() === state.year || (new Date().getFullYear() === state.year + 1 && new Date().getMonth() < 2);

  const mealBox = h('div', { class: 'card meal' }, h('h3', {}, '🍚 오늘 급식'), h('p', { class: 'muted small' }, '불러오는 중…'));
  const boardBox = h('div', { class: 'card board-card-home' });

  // 날짜별 게시판
  const drawBoard = () => {
    const range = remember('home_range') || 'today';
    const from = range === 'today' ? t : range === 'week' ? weekStart(t) : `${ym}-01`;
    const to = range === 'today' ? t : range === 'week' ? addDays(weekStart(t), 6) : monthEnd(ym);
    const days = [];
    for (let x = from; x <= to; x = addDays(x, 1)) days.push(x);
    const groups = days.map((x) => ({ day: x, items: all.filter((it) => it.date <= x && (it.endDate || it.date) >= x) })).filter((g) => g.items.length);
    const past = groups.filter((g) => g.day < t);
    const now = groups.filter((g) => g.day >= t);
    const dayHead = (x) => { const [y, m, dd] = x.split('-').map(Number); const w = DOW[new Date(y, m - 1, dd).getDay()]; return `${m}/${dd}(${w})${x === t ? ' · 오늘' : ''}`; };
    const block = (g) => h('div', { class: `board-day ${g.day === t ? 'is-today' : ''}` }, h('div', { class: 'board-date' }, dayHead(g.day)), h('ul', { class: 'list' }, g.items.map(item)));
    clear(boardBox,
      h('div', { class: 'card-head' }, h('h3', {}, '🗓 날짜별 게시판'),
        seg([['today', '오늘'], ['week', '이번 주'], ['month', '이번 달']], range, (v) => { remember('home_range', v); drawBoard(); })),
      past.length ? h('details', { class: 'past' }, h('summary', {}, `지난 날 ${past.length}일 보기`), past.map(block)) : null,
      now.length ? now.map(block) : h('p', { class: 'muted' }, range === 'today' ? '오늘 등록된 일정이 없습니다.' : '남은 일정이 없습니다.'),
      h('a', { href: '#/schedule/overview', class: 'more-link' }, '학사일정 달력 →'));
  };
  drawBoard();

  const [, mm, dd2] = t.split('-').map(Number);
  clear(root,
    installHint(),
    h('div', { class: 'hero' },
      h('div', {}, h('div', { class: 'hero-date' }, `${mm}월 ${dd2}일 ${DOW[new Date(`${t}T00:00`).getDay()]}요일`), h('div', { class: 'hero-title' }, state.settings.schoolName || '우리 학교'),
        h('div', { class: 'hero-sub' }, `오늘 일정 ${all.filter((it) => it.date <= t && (it.endDate || it.date) >= t).length}건 · 내 할 일 ${mySubs.length + myCols.length + myDuties.length}건`)),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'qa', href: '#/schedule/overview' }, h('span', {}, '📅'), '달력'),
        h('a', { class: 'qa', href: '#/schedule/trips' }, h('span', {}, '🚌'), '복무'),
        h('a', { class: 'qa', href: '#/class/substitutes' }, h('span', {}, '🔁'), '보결'),
        h('a', { class: 'qa', href: '#/notice/briefings' }, h('span', {}, '📣'), '전달'),
        h('a', { class: 'qa', href: '#/class/reservations' }, h('span', {}, '🏫'), '예약'))),
    state.me?.role === 'admin' ? adminStrip() : null,
    inRange ? null : h('p', { class: 'alert' }, `지금 ${state.year}학년도 기록을 보고 있습니다. 오늘 일정은 올해 학년도를 선택해야 보입니다.`),
    pinned.length ? h('section', { class: 'section' }, h('div', { class: 'cards' }, pinned.map((n) => noticeCard(n, reload, { compact: true })))) : null,
    ddays.length ? h('div', { class: 'dday-row' }, ddays.map((e) => h('button', { class: 'dday', style: { '--c': '#3b6fe0' }, onclick: () => openRecordForm('events', e, { onSaved: reload }) },
      h('strong', {}, ddayLabel(e.data.date, e.data.endDate, t)), h('span', {}, (e.data.title || '').split('\n')[0]), h('span', { class: 'muted small' }, fmtDate(e.data.date))))) : null,
    h('div', { class: 'dash' },
      boardBox,
      briefs.length ? h('div', { class: 'card mine' }, h('h3', {}, `📣 오늘 전달사항 ${briefs.length}건`),
        briefs.map((b) => h('div', { class: 'brief-row click', onclick: () => openRecordForm('briefings', b, { onSaved: reload }) }, b.data.kind ? h('span', { class: 'tag' }, b.data.kind) : null, b.data.target ? h('span', { class: 'tag ghost' }, b.data.target) : null, h('div', { class: 'pre clamp' }, b.data.content))),
        h('a', { href: '#/notice/briefings', class: 'more-link' }, '전달사항 →')) : null,
      news.length ? h('div', { class: 'card news' }, h('h3', {}, `🆕 새 소식 ${news.length}건`),
        h('ul', { class: 'list' }, news.slice(0, 8).map((n) => h('li', { class: 'click', onclick: () => { location.hash = tabOf(n.module) || '#/home/'; } },
          h('span', { class: 'tag ghost' }, MODULES[n.module]?.label || n.module), ` ${n.label}`,
          h('span', { class: 'muted small' }, ` ${n.by ? `· ${n.by} ` : ''}${n.isNew ? '새 글' : '수정'}`)))),
        news.length > 8 ? h('p', { class: 'muted small' }, '왼쪽 메뉴의 숫자 배지를 눌러 나머지를 확인하세요.') : null) : null,
      h('div', { class: `card ${mySubs.length || myCols.length ? 'mine' : ''}` }, h('h3', {}, `✅ 내 할 일${me ? ` · ${me}` : ''}`),
        mySubs.length || myCols.length || myLeaves.length || myDuties.length || myResv.length ? h('ul', { class: 'list' },
          mySubs.map((s) => h('li', { class: 'click', onclick: () => openRecordForm('substitutes', s, { onSaved: reload }) }, `🔁 ${fmtDate(s.data.date)} ${s.data.period} ${s.data.className || ''} 보결`, h('span', { class: 'muted' }, ` (${s.data.absent || ''} ${s.data.reason || ''})`))),
          myCols.map((c) => h('li', { class: 'click', onclick: () => { location.hash = '#/notice/collections'; } }, `📥 ${c.data.title}`, h('span', { class: 'muted' }, ` ${c.data.due ? dday(c.data.due) : ''}`))),
          myDuties.map((x) => h('li', { class: 'click', onclick: () => { location.hash = '#/notice/duties'; } }, `🧑‍🏫 ${fmtDate(x.data.date)} ${x.data.title}`, h('span', { class: 'muted' }, ` ${[x.data.role, x.data.place, x.data.time].filter(Boolean).join(' · ')}`))),
          myResv.map((x) => h('li', { class: 'click', onclick: () => { location.hash = '#/class/reservations'; } }, `🏫 ${fmtDate(x.data.date)} ${x.data.period} ${x.data.place} 예약`)),
          myLeaves.map((x) => item(tripItem(x)))) : h('p', { class: 'muted' }, '오늘 이후 내 보결·담당·낼 취합이 없습니다.'),
        !state.me.name ? h('p', { class: 'muted small' }, '학교 관리 → 사용자에서 내 이름(실명)이 등록되어야 내 할 일이 보입니다.') : null),
      mealBox,
      h('div', { class: 'card' }, h('h3', {}, '📝 재논의 안건'),
        redo.length ? h('ul', { class: 'list' }, redo.map((m) => h('li', { class: 'click', onclick: () => openRecordForm('meetings', m, { onSaved: reload }) }, m.data.agenda.split('\n')[0], h('span', { class: 'muted' }, ` ${fmtDate(m.data.date)}`)))) : h('p', { class: 'muted' }, '재논의 안건이 없습니다.'),
        h('a', { href: '#/notice/meetings', class: 'more-link' }, '회의록 →'))));

  loadMeal(mealBox, t);
}

function ddayLabel(date, end, t) {
  const diff = Math.round((new Date(date) - new Date(t)) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0 || (end && end >= t)) return 'D-Day';
  return `D+${-diff}`;
}

// 오늘 급식 (나이스). 주말·방학이면 다음 급식일까지 최대 7일 앞을 찾아봄
async function loadMeal(box, t) {
  if (!state.settings.neis || !state.settings.neisKey) {
    clear(box, h('h3', {}, '🍚 급식'), h('p', { class: 'muted small' }, state.me.role === 'admin' ? '관리자 → 설정 → 나이스 연동에서 학교를 선택하면 급식이 표시됩니다.' : '나이스 연동이 아직 설정되지 않았습니다.'));
    return;
  }
  try {
    const res = await api(`/api/neis/meals?from=${t}&to=${addDays(t, 7)}`);
    const day = Object.keys(res.meals || {}).sort().find((x) => x >= t);
    if (!day) { clear(box, h('h3', {}, '🍚 급식'), h('p', { class: 'muted' }, '7일 안에 급식 정보가 없습니다.')); return; }
    clear(box, h('h3', {}, day === t ? '🍚 오늘 급식' : `🍚 ${fmtDate(day)} 급식`),
      res.meals[day].map((m) => h('div', {}, res.meals[day].length > 1 ? h('strong', { class: 'small' }, m.meal) : null,
        h('div', { class: 'meal-dishes' }, m.dishes.join(' · ')), m.kcal ? h('div', { class: 'muted small' }, m.kcal) : null)));
  } catch (e) {
    clear(box, h('h3', {}, '🍚 급식'), h('p', { class: 'muted small' }, `급식을 불러오지 못했습니다: ${e.message}`));
  }
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

// 관리자: 홈 맨 위에 학교 관리 바로가기 (가입 요청이 있으면 숫자로 알림)
function adminStrip() {
  const sub = h('span', { class: 'muted small' }, '사용자·권한·설정');
  const a = h('a', { class: 'admin-strip', href: '#/admin' }, h('span', { class: 'as-ico' }, '⚙️'), h('span', { class: 'as-txt' }, h('strong', {}, '학교 관리'), sub), h('span', { class: 'as-go' }, '›'));
  api('/api/admin/users').then((list) => {
    const n = list.filter((u) => u.role === 'pending').length;
    if (n) { a.classList.add('has-req'); clear(sub, h('span', { class: 'as-req' }, `🙋 가입 요청 ${n}명 — 눌러서 승인`)); }
  }).catch(() => {});
  return a;
}
