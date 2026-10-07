import { MODULES, GROUPS, DESK_GROUPS, ROLES, APP_NAME, DESK_NAME } from './modules.js';
import { h, api, clear, toast, modal, today, apiCtx } from './ui.js';
import { state, setYear, isAdmin, canEdit, remember, defaultSettings, canSeeTab } from './state.js';
import { dashboardView } from './views/dashboard.js';
import { tableView } from './views/table.js';
import { timetableView } from './views/timetable.js';
import { boardView } from './views/board.js';
import { adminView } from './views/admin.js';
import { scheduleOverview, eventsList, tripsView, reviewView } from './views/schedule.js';
import { classOverview, programsView, openClassesTab, substitutesView } from './views/classes.js';
import { reservationsView } from './views/reservations.js';
import { dutiesView } from './views/duties.js';
import { noticeOverview, noticesView, meetingsView, meetingPlansView, briefingsView } from './views/notices.js';
import { deadlinesView } from './views/deadlines.js';
import { moneyOverview, purchasesView, budgetView, schoolBudgetView, contestBudgetView, spendView } from './views/money.js';
import { infoOverview, contactsView, rulesView, resourcesView, assignmentsView } from './views/info.js';
import { collectionsView } from './views/collections.js';
import { DESK_VIEWS } from './views/desk.js';
import { joinView, platformView, meView } from './views/account.js';
import { bellButton, refreshBell } from './views/inbox.js';
import { searchButton } from './search.js';
import { openRecordForm } from './form.js';
import { loadNews, markSeen, paintBadges } from './news.js';
import { isDemo, startDemo, exitDemo, resetDemo, demoApi } from './demo.js';
import { applyTheme } from './theme.js';

// OnlinePlatform(학교) 영역/탭 → 화면
const VIEWS = {
  'home/': dashboardView,
  'schedule/overview': scheduleOverview,
  'schedule/events': eventsList,
  'schedule/trips': tripsView,
  'schedule/review': reviewView,
  'class/overview': classOverview,
  'class/timetables': timetableView,
  'class/programs': programsView,
  'class/openClasses': openClassesTab,
  'class/substitutes': substitutesView,
  'class/reservations': reservationsView,
  'notice/overview': noticeOverview,
  'notice/notices': noticesView,
  'notice/briefings': briefingsView,
  'notice/meetingPlans': meetingPlansView,
  'notice/meetings': meetingsView,
  'notice/collections': collectionsView,
  'notice/duties': dutiesView,
  'money/overview': moneyOverview,
  'money/purchases': purchasesView,
  'money/budget': budgetView,
  'money/school': schoolBudgetView,
  'money/contests': contestBudgetView,
  'money/spend': spendView,
  'money/deadlines': deadlinesView,
  'money/contestInfo': (el) => tableView(el, 'contestInfo', { groupBy: 'topic' }),
  'info/overview': infoOverview,
  'info/assignments': assignmentsView,
  'info/resources': resourcesView,
  'info/contacts': contactsView,
  'info/rules': rulesView,
  'info/boards': boardView,
};

// v1 주소(#/events 등) → v2 주소
function legacyRoute(id) {
  for (const g of GROUPS) for (const t of g.tabs) if (t.module === id) return `${g.id}/${t.id}`;
  return { dashboard: 'home/', monthNotes: 'notice/notices', links: 'info/overview', secrets: 'info/overview' }[id] || null;
}

const app = document.getElementById('app');

// 초대 링크(#/join/코드)로 들어오면 로그인 뒤에도 쓰도록 기억
const inviteMatch = location.hash.match(/^#\/join\/([0-9a-f]{6,16})/i);
if (inviteMatch) remember('invite', inviteMatch[1].toLowerCase());

async function loadMe() {
  const me = await api('/api/me');
  state.account = me.user;
  state.schools = me.schools;
  state.member = me.member;
  state.push = me.push;
  state.settings = me.settings || defaultSettings();
  state.me = {
    email: me.user.email, super: me.user.super, accountName: me.user.name,
    name: me.member?.name || me.user.name || '', role: me.member?.role || null, dept: me.member?.dept || '',
  };
  apiCtx.school = me.member?.schoolId || '';
  if (me.member && !isDemo()) remember('school', me.member.schoolId);
  document.title = state.member ? `${state.settings.schoolName} · ${APP_NAME}` : APP_NAME;
  applyTheme();
}

async function boot() {
  window.__gyBooted = true; // index.html 시작 감시에 '정상 시작' 알림
  // 체험 링크(/?demo 또는 #/demo)로 들어오면 체험 모드 시작
  if (/[?&]demo\b/.test(location.search) || location.hash === '#/demo') {
    try { sessionStorage.setItem('gy_demo', '1'); } catch { /* 무시 */ }
    history.replaceState(null, '', '/#/home/');
  }
  if (isDemo()) apiCtx.mock = demoApi;
  apiCtx.onStale = () => state.rerender?.(); // 뒤에서 받아 온 새 자료가 달라졌으면 지금 화면을 다시 그림
  apiCtx.school = isDemo() ? 'demo' : remember('school') || '';
  try {
    await loadMe();
    let saved = null;
    try { if (Number(localStorage.getItem('gy_year_base')) === state.settings.currentYear) saved = Number(localStorage.getItem('gy_year')); } catch { /* 무시 */ }
    state.year = saved || state.settings.currentYear;
    state.staff = state.member ? await api('/api/staff').catch(() => []) : [];
  } catch (e) {
    if (e.status === 401) return loginScreen();
    return clear(app, h('div', { class: 'center-box' }, h('p', {}, `연결 오류: ${e.message}`)));
  }
  layout();
  route();
  refreshBell();
}

function loginScreen() {
  clear(app, h('div', { class: 'center-box' },
    h('div', { class: 'login' },
      h('div', { class: 'logo' }, '🏫'),
      h('h1', {}, APP_NAME),
      h('p', { class: 'muted' }, `학교 업무는 ${APP_NAME}, 내 학급·수업은 ${DESK_NAME}`),
      h('a', { class: 'btn primary big', href: '/auth/login' }, 'Google 계정으로 로그인'),
      h('button', { class: 'btn big demo-btn', onclick: startDemo }, '👀 로그인 없이 둘러보기'),
      h('p', { class: 'muted small' }, '가상 학교·가상 학급 데이터로 모든 메뉴를 체험합니다. 서버에 저장되지 않습니다.'),
      h('p', { class: 'muted small' }, '구글 계정이면 누구나 로그인할 수 있습니다. 학교 자료는 학교 관리자가 가입을 승인한 뒤 보입니다.'),
      remember('invite') ? h('p', { class: 'alert' }, '초대 링크로 들어왔습니다. 로그인하면 학교 가입 요청이 이어집니다.') : null,
      h('p', { class: 'muted small' }, h('a', { href: '/privacy/' }, '개인정보처리방침'), ' · ', h('a', { href: '/terms/' }, '이용약관')))));
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
}

let main;
let nav;
let groupBar;

const closeNav = () => document.body.classList.remove('nav-open');
const isWide = () => window.matchMedia('(min-width: 1101px)').matches;
const toggleRail = () => { const on = !document.body.classList.contains('nav-rail'); document.body.classList.toggle('nav-rail', on); remember('nav_rail', on); };

const spaceOfPath = (path) => (path.startsWith('desk') ? 'desk' : 'school');
const currentPath = () => location.hash.replace(/^#\/?/, '').split('?')[0];

function layout() {
  const years = [];
  for (let y = state.settings.currentYear - 2; y <= state.settings.currentYear + 1; y++) years.push(y);
  if (!years.includes(state.year)) years.push(state.year);
  nav = h('nav', { class: 'nav', 'aria-label': '전체 메뉴' });
  main = h('main', { class: 'main' });
  groupBar = h('nav', { class: 'group-bar', 'aria-label': '영역' });
  // 넓은 화면: 왼쪽 메뉴 고정 (◀로 아이콘만 남기기). 좁은 화면: ☰ 서랍
  document.body.classList.toggle('nav-rail', !!remember('nav_rail'));
  const schoolPick = state.schools.filter((s) => s.status === 'active' && ['admin', 'staff', 'viewer'].includes(s.role));
  clear(app,
    h('header', { class: 'top' },
      h('button', { class: 'icon-btn menu-btn', 'aria-label': '전체 메뉴', onclick: () => {
        if (isWide()) { toggleRail(); return; }
        document.body.classList.toggle('nav-open');
      } }, h('span', { class: 'burger' }, h('i'), h('i'), h('i'))),
      h('div', { class: 'space-tabs', role: 'tablist' },
        h('a', { href: '#/home/', class: 'space-tab', 'data-space': 'school' }, h('span', { class: 'ico' }, '🏫'), h('span', { class: 'lbl' }, APP_NAME), h('span', { class: 'lbls' }, '학교')),
        h('a', { href: '#/desk/home', class: 'space-tab', 'data-space': 'desk' }, h('span', { class: 'ico' }, '🪴'), h('span', { class: 'lbl' }, DESK_NAME), h('span', { class: 'lbls' }, '내 책상'))),
      h('span', { class: 'grow' }),
      schoolPick.length > 1 ? h('select', { class: 'school-pick', 'aria-label': '학교', onchange: async (e) => { remember('school', e.target.value); apiCtx.school = e.target.value; await refresh(); } },
        schoolPick.map((s) => h('option', { value: s.id, selected: s.id === state.member?.schoolId }, s.name))) : null,
      h('label', { class: 'year' }, h('span', { class: 'year-label' }, '학년도 '),
        h('select', { id: 'year-select', onchange: (e) => { setYear(e.target.value); route(); } },
          years.sort().map((y) => h('option', { value: y, selected: y === state.year }, `${y}${y === state.settings.currentYear ? ' (올해)' : y > state.settings.currentYear ? ' (준비)' : ''}`)))),
      searchButton(),
      bellButton(),
      h('a', { class: 'who', href: '#/me', title: state.me.email }, state.me.name || state.me.email, state.me.role ? h('span', { class: 'tag ghost' }, ROLES[state.me.role]) : null),
      h('button', { class: 'btn small logout', onclick: logout }, '로그아웃')),
    isDemo() ? h('div', { class: 'demo-bar' },
      h('span', {}, '👀 ', h('strong', {}, '체험 모드'), ' · 가상 학교·가상 학생 데이터입니다. 바꾼 내용은 이 탭에만 잠시 남습니다.'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: resetDemo }, '처음 상태로'),
      h('button', { class: 'btn small primary', onclick: () => { exitDemo(); } }, '로그인하고 시작하기')) : null,
    groupBar,
    h('div', { class: 'scrim', onclick: closeNav }),
    h('div', { class: 'body' }, nav, main),
    bottomBar(),
    quickAddButton());
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) closeNav(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
}

// 머리글 아래 영역 바: 지금 공간의 큰 항목을 알약 모양으로 (왼쪽 메뉴를 숨겨도 바로 이동)
function drawGroupBar(space, activeGroup) {
  const groups = space === 'desk' ? DESK_GROUPS : GROUPS;
  const prefix = space === 'desk' ? '#/desk/' : '#/';
  if (space === 'school' && !state.member) return clear(groupBar);
  clear(groupBar, h('div', { class: 'gb-inner' },
    groups.map((g) => ({ ...g, tabs: g.tabs.filter(canSeeTab) })).map((g) => h('a', { href: `${prefix}${g.id}/${g.tabs.length ? g.tabs[0].id : ''}`, class: `gb-item ${g.id === activeGroup ? 'on' : ''}` }, h('span', { class: 'gb-ico' }, g.icon), h('span', {}, g.label))),
    space === 'school' && isAdmin() ? h('a', { href: '#/admin', class: `gb-item subtle ${activeGroup === 'admin' ? 'on' : ''}` }, h('span', { class: 'gb-ico' }, '⚙️'), h('span', {}, '관리')) : null));
  groupBar.querySelector('.gb-item.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// 왼쪽 메뉴: 공간(학교/내 책상)마다 다르고, 큰 항목별로 접고 펼 수 있음 (기억함)
function drawNav(space, activeKey, activeGroup) {
  const groups = space === 'desk' ? DESK_GROUPS : GROUPS;
  const prefix = space === 'desk' ? 'desk/' : '';
  const saved = remember(`nav_fold_${space}`);
  const folded = new Set(saved || groups.map((g) => g.id).filter((id) => id !== activeGroup));
  const toggle = (id, el) => {
    if (folded.has(id)) folded.delete(id); else folded.add(id);
    remember(`nav_fold_${space}`, [...folded]);
    el.classList.toggle('folded', folded.has(id));
  };
  const schoolLocked = space === 'school' && !state.member;
  const item = (href, id, icon, label, cls = 'nav-head') => h('a', { href, 'data-id': id, class: cls, title: label }, h('span', { class: 'ico' }, icon), h('span', { class: 'nt' }, label));
  clear(nav,
    h('div', { class: 'nav-top' },
      h('span', { class: 'nav-brand' }, h('span', { class: 'ico' }, space === 'desk' ? '🪴' : '🏫'), h('span', { class: 'nt' }, space === 'desk' ? DESK_NAME : state.member ? state.settings.schoolName : APP_NAME)),
      h('button', { class: 'pin-btn close-x', 'aria-label': '닫기', onclick: closeNav }, '✕')),
    schoolLocked ? item('#/join', 'join', '🙋', '학교 가입·개설') : null,
    schoolLocked ? null : groups.map((g) => ({ ...g, tabs: g.tabs.filter(canSeeTab) })).map((g) => {
      const subs = g.tabs.filter((t) => t.id !== 'overview' || g.tabs.length === 1);
      const head = `${prefix}${g.id}/${g.tabs.length ? (g.tabs[0].id) : ''}`;
      const grp = h('div', { class: `nav-group ${folded.has(g.id) ? 'folded' : ''} ${g.id === activeGroup ? 'open' : ''}`, 'data-group': g.id },
        h('div', { class: 'nav-head-row' },
          item(`#/${head}`, head, g.icon, g.label),
          subs.length > 1 || (subs.length === 1 && g.tabs.length > 1) ? h('button', { class: 'fold', 'aria-label': `${g.label} 접기/펴기`, onclick: (e) => { e.stopPropagation(); toggle(g.id, grp); } }, '▾') : null),
        subs.length > 1 || g.tabs.length > 1 ? h('div', { class: 'nav-subs' }, subs.map((t) => h('a', { href: `#/${prefix}${g.id}/${t.id}`, class: 'nav-sub', 'data-id': `${prefix}${g.id}/${t.id}` }, t.label))) : null);
      return grp;
    }),
    h('div', { class: 'nav-foot' },
      space === 'school' && isAdmin() ? item('#/admin', 'admin', '⚙️', '학교 관리', 'nav-head admin-link') : null,
      state.me.super ? item('#/platform', 'platform', '🛰', '플랫폼 운영', 'nav-head admin-link') : null,
      space === 'school' && state.member ? h('a', { href: '#/join', class: 'nav-sub small' }, '+ 다른 학교 가입') : null,
      item('#/me', 'me', '👤', `내 정보 · ${state.me.name || ''}`, 'nav-head admin-link'),
      h('button', { class: 'nav-logout link-btn', onclick: logout }, '로그아웃'),
      h('button', { class: 'rail-btn', title: '메뉴 접기/펴기', onclick: toggleRail }, h('span', { class: 'ico' }, '◀'), h('span', { class: 'nt' }, '메뉴 접기'))));
  for (const a of nav.querySelectorAll('a[data-id]')) a.classList.toggle('on', a.dataset.id === activeKey);
}

// 휴대폰 하단 탭 (넓은 화면에서는 숨김)
function bottomBar() {
  const items = [
    { href: '#/home/', group: 'home', space: 'school', icon: '🏠', label: '홈' },
    { href: '#/schedule/overview', group: 'schedule', space: 'school', icon: '📅', label: '달력' },
    { href: '#/notice/overview', group: 'notice', space: 'school', icon: '📢', label: '공지' },
    { href: '#/desk/home', group: 'desk', space: 'desk', icon: '🪴', label: '내 책상' },
  ];
  return h('nav', { class: 'bottom-bar', 'aria-label': '빠른 메뉴' },
    items.map((b) => h('a', { href: b.href, 'data-group': b.group, 'data-space': b.space }, h('span', { class: 'bb-ico' }, b.icon), h('span', {}, b.label))),
    h('button', { onclick: () => document.body.classList.toggle('nav-open') }, h('span', { class: 'bb-ico' }, '☰'), h('span', {}, '전체')));
}

// 빠른 추가(+): 지금 공간에 맞는 항목
function quickAddButton() {
  return h('button', { class: 'fab', 'aria-label': '빠른 추가', onclick: () => {
    const school = state.member ? [
      ['events', '📅 일정', { date: today(), category: '전체행사' }],
      ['trips', '🚌 복무·출장', { date: today(), kind: '출장', person: state.me.name || '' }],
      ['substitutes', '🔁 보결', { date: today() }],
      ['briefings', '📣 전달사항', { date: today(), kind: '조례' }],
      ['collections', '📥 취합', { kind: '확인', allowEdit: true }],
      ['reservations', '🏫 특별실 예약', { date: today(), user: state.me.name || '' }],
      ['duties', '🧑‍🏫 담당 배정', { date: today() }],
      ['memos', '✏️ 달력 메모', { date: today() }],
      ['notices', '📢 공지', { category: '일반' }],
      ['meetings', '📝 회의 안건', { date: today(), meeting: '전체회의', status: '완료' }],
      ['purchases', '🛒 구매신청', { requester: state.me.name || '', date: today() }],
    ].filter(([m]) => canEdit(m)) : [];
    const desk = [
      ['todos', '✅ 할 일', { due: today(), repeat: '없음' }],
      ['notes', '🗒 누가기록', { date: today(), category: '관찰' }],
      ['progress', '📘 진도', { date: today() }],
      ['market', '🧰 Teachshop에 올리기', { kind: 'HTML 도구', category: '수업 도구' }],
    ];
    const list = state.space === 'desk' ? [...desk, ...school] : [...school, ...desk];
    const close = modal('빠른 추가', h('div', { class: 'choice' }, list.map(([m, label, defaults]) => h('button', { class: 'btn big', onclick: () => {
      close();
      openRecordForm(m, null, { defaults, onSaved: () => route() });
    } }, label))));
  } }, '+');
}

// 앱 안 이동 기록: 다른 화면으로 건너갔을 때 ← 로 돌아오기
const trail = [];
function backButton() {
  if (trail.length < 2) return null;
  const prev = trail[trail.length - 2];
  return h('button', { class: 'back-btn', title: '이전 화면', 'aria-label': '이전 화면으로', onclick: () => { trail.pop(); trail.pop(); location.hash = `#/${prev}`; } }, '←');
}

// 학생 이름(누가기록·출결 등 드롭다운)을 학년도마다 미리 불러 둠
async function preloadStudents() {
  if (state._studentsYear === state.year) return;
  state._studentsYear = state.year;
  try {
    const rows = await api(`/api/records/students?year=${state.year}`);
    rows.sort((a, b) => (Number(a.data.num) || 999) - (Number(b.data.num) || 999));
    state.students = rows.map((r) => r.data.name).filter(Boolean);
  } catch { state._studentsYear = null; }
}

async function route() {
  state.rerender = route;
  preloadStudents();
  const cur = location.hash.replace(/^#\/?/, '') || 'home/';
  if (trail[trail.length - 1] !== cur) { trail.push(cur); if (trail.length > 30) trail.shift(); }
  const ys = document.getElementById('year-select');
  if (ys && ![...ys.options].some((op) => Number(op.value) === state.year)) ys.append(h('option', { value: state.year }, `${state.year}`));
  if (ys) ys.value = String(state.year);
  let path = currentPath();
  if (!path) path = state.member ? 'home/' : remember('invite') ? 'join' : 'desk/home';
  if (!path.includes('/') && !['admin', 'join', 'platform', 'me'].includes(path)) {
    const to = legacyRoute(path);
    location.replace(`#/${to || 'home/'}`);
    return;
  }
  const space = spaceOfPath(path);
  state.space = space;
  document.body.dataset.space = space;
  for (const a of document.querySelectorAll('.space-tab')) a.classList.toggle('on', a.dataset.space === space && !['join', 'platform', 'me'].includes(path));
  for (const a of document.querySelectorAll('.bottom-bar a')) a.style.display = '';

  const content = h('div', { class: 'content' });
  window.scrollTo(0, 0);
  const special = { admin: ['⚙️ 학교 관리', adminView], join: ['🙋 학교 가입·개설', joinView], platform: ['🛰 플랫폼 운영', platformView], me: ['👤 내 정보', meView] }[path.split('/')[0]];

  if (special || (space === 'school' && !state.member)) {
    const [title, view] = special || ['🙋 학교 가입·개설', joinView];
    drawNav(space === 'desk' ? 'desk' : 'school', path, '');
    drawGroupBar(space, path.split('/')[0]);
    clear(main, h('h2', { class: 'page-title' }, backButton(), title), content);
    try { await view(content, refresh); } catch (e) { showError(content, e); }
    return;
  }

  const groups = space === 'desk' ? DESK_GROUPS : GROUPS;
  const rel = space === 'desk' ? path.slice(5) : path;
  const [gid, tidRaw] = rel.split('/');
  const rawGroup = groups.find((g) => g.id === gid);
  const group = rawGroup ? { ...rawGroup, tabs: rawGroup.tabs.filter(canSeeTab) } : null;
  // 권한 없는 탭(행정·예산)으로 들어오면 볼 수 있는 첫 탭으로
  if (rawGroup && tidRaw && !group.tabs.some((t) => t.id === tidRaw) && rawGroup.tabs.some((t) => t.id === tidRaw)) {
    location.replace(`${space === 'desk' ? '#/desk/' : '#/'}${gid}/${group.tabs[0]?.id || ''}`);
    return;
  }
  const tid = tidRaw || (group?.tabs.length ? group.tabs[0].id : '');
  const key = `${gid}/${tid}`;
  drawNav(space, `${space === 'desk' ? 'desk/' : ''}${key}`, gid);
  drawGroupBar(space, gid);
  for (const a of document.querySelectorAll('.bottom-bar a')) a.classList.toggle('on', space === 'desk' ? a.dataset.group === 'desk' : a.dataset.group === gid);

  const tab = group?.tabs.find((t) => t.id === tid);
  const mod = tab?.module ? MODULES[tab.module] : null;
  const title = group ? `${group.icon} ${group.label}` : '';
  const scopeNote = mod?.scope === 'global' ? '' : `  ${state.year}학년도`;
  const prefix = space === 'desk' ? '#/desk/' : '#/';
  clear(main,
    yearBanner(space, mod),
    h('h2', { class: 'page-title' }, backButton(), title, h('span', { class: 'muted small' }, scopeNote)),
    group?.tabs.length > 1 ? h('div', { class: 'tabs-bar' }, group.tabs.map((t) => h('a', { href: `${prefix}${gid}/${t.id}`, class: t.id === tid ? 'on' : '' }, t.label))) : null,
    content);
  content.append(h('p', { class: 'muted' }, '불러오는 중…'));
  if (space === 'school') {
    await loadNews();
    if (tab?.module) markSeen(tab.module);
    paintBadges();
  }
  try {
    const view = space === 'desk' ? DESK_VIEWS[key] : VIEWS[key];
    if (!view) { location.replace(space === 'desk' ? '#/desk/home' : '#/home/'); return; }
    await view(content);
    // 검색 결과에서 고른 기록 열기
    const po = state.pendingOpen;
    state.pendingOpen = null;
    if (po) openRecordForm(po.module, po.record, { onSaved: () => route() });
  } catch (e) { showError(content, e); }
}

// 올해가 아닌 학년도를 보고 있을 때 알림 (학년도는 3월 1일 ~ 다음 해 2월 말, 3월 1일에 자동으로 바뀜)
function yearBanner(space, mod) {
  const cur = state.settings?.currentYear;
  if (space !== 'school' || !cur || state.year === cur || mod?.scope === 'global') return null;
  const back = h('button', { class: 'btn small', onclick: () => { setYear(cur); route(); } }, `${cur}학년도(올해)로`);
  return state.year < cur
    ? h('div', { class: 'alert warn year-banner' }, h('span', {}, `📦 지난 ${state.year}학년도(${state.year}.3 ~ ${state.year + 1}.2) 자료를 보고 있습니다.`), back)
    : h('div', { class: 'alert year-banner' }, h('span', {}, `🌱 다음 ${state.year}학년도 준비 중입니다. 여기 넣은 자료는 ${state.year}년 3월 1일부터 모두에게 기본으로 보입니다.`), back);
}

function showError(content, e) {
  if (e.status === 401) return loginScreen();
  clear(content, h('p', { class: 'alert error' }, e.message));
  toast(e.message, 'error');
}

async function refresh() {
  await loadMe();
  state.staff = state.member ? await api('/api/staff').catch(() => []) : [];
  layout();
  route();
  refreshBell();
}

window.addEventListener('hashchange', () => { if (main) route(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// 안드로이드 크롬: '홈 화면에 추가' 창을 나중에 띄울 수 있도록 보관
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });
boot();
