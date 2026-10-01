import { MODULES, GROUPS, ROLES } from './modules.js';
import { h, api, clear, toast } from './ui.js';
import { state, setYear, isAdmin } from './state.js';
import { dashboardView } from './views/dashboard.js';
import { tableView } from './views/table.js';
import { timetableView } from './views/timetable.js';
import { boardView } from './views/board.js';
import { adminView } from './views/admin.js';
import { scheduleOverview, eventsList, tripsView } from './views/schedule.js';
import { classOverview, programsView, openClassesTab, substitutesView } from './views/classes.js';
import { reservationsView } from './views/reservations.js';
import { dutiesView } from './views/duties.js';
import { loadNews, markSeen, paintBadges } from './news.js';
import { noticeOverview, noticesView, meetingsView, collectionsView } from './views/notices.js';
import { moneyOverview, purchasesView, budgetView } from './views/money.js';
import { infoOverview, contactsView, rulesView, resourcesView } from './views/info.js';
import { openRecordForm } from './form.js';
import { modal } from './ui.js';
import { today } from './ui.js';
import { canEdit } from './state.js';

// 영역/탭 → 화면
const VIEWS = {
  'home/': dashboardView,
  'schedule/overview': scheduleOverview,
  'schedule/events': eventsList,
  'schedule/trips': tripsView,
  'class/overview': classOverview,
  'class/timetables': timetableView,
  'class/programs': programsView,
  'class/openClasses': openClassesTab,
  'class/substitutes': substitutesView,
  'class/reservations': reservationsView,
  'notice/overview': noticeOverview,
  'notice/notices': noticesView,
  'notice/meetings': meetingsView,
  'notice/collections': collectionsView,
  'notice/duties': dutiesView,
  'money/overview': moneyOverview,
  'money/purchases': purchasesView,
  'money/budget': budgetView,
  'money/contests': (el) => tableView(el, 'contests'),
  'money/contestInfo': (el) => tableView(el, 'contestInfo', { groupBy: 'topic' }),
  'info/overview': infoOverview,
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

async function boot() {
  try {
    const me = await api('/api/me');
    state.me = me.user;
    state.settings = me.settings;
    let saved = null;
    try { saved = Number(localStorage.getItem('gy_year')); } catch { /* 무시 */ }
    state.year = saved || me.settings.currentYear;
    state.staff = await api('/api/staff').catch(() => []);
  } catch (e) {
    if (e.status === 401) return loginScreen();
    return clear(app, h('div', { class: 'center-box' }, h('p', {}, `연결 오류: ${e.message}`)));
  }
  if (!['admin', 'staff', 'viewer'].includes(state.me.role)) return pendingScreen();
  document.title = `${state.settings.schoolName || ''} 온라인 교무실`.trim();
  layout();
  route();
}

function loginScreen() {
  clear(app, h('div', { class: 'center-box' },
    h('div', { class: 'login' },
      h('div', { class: 'logo' }, '🏫'),
      h('h1', {}, '온라인 교무실'),
      h('p', { class: 'muted' }, '학교에서 승인한 구글 계정으로 로그인합니다.'),
      h('a', { class: 'btn primary big', href: '/auth/login' }, 'Google 계정으로 로그인'))));
}

function pendingScreen() {
  clear(app, h('div', { class: 'center-box' },
    h('div', { class: 'login' },
      h('div', { class: 'logo' }, '⏳'),
      h('h1', {}, state.me.role === 'blocked' ? '사용이 제한된 계정입니다' : '관리자 승인 대기 중'),
      h('p', {}, state.me.email),
      h('p', { class: 'muted' }, '교무 담당 선생님께 승인을 요청해 주세요. 승인 후 새로고침하면 사용할 수 있습니다.'),
      h('div', { class: 'row-actions center' },
        h('button', { class: 'btn', onclick: () => location.reload() }, '새로고침'),
        h('button', { class: 'btn', onclick: logout }, '다른 계정으로 로그인')))));
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
}

let main;
let nav;

function layout() {
  const years = [];
  for (let y = state.settings.currentYear - 2; y <= state.settings.currentYear + 1; y++) years.push(y);
  if (!years.includes(state.year)) years.push(state.year);
  nav = h('nav', { class: 'nav' },
    GROUPS.map((g) => h('div', { class: 'nav-group', 'data-group': g.id },
      h('a', { href: `#/${g.id}/${g.tabs.length ? 'overview' : ''}`, class: 'nav-head', 'data-id': `${g.id}/${g.tabs.length ? 'overview' : ''}` }, h('span', { class: 'ico' }, g.icon), g.label),
      g.tabs.filter((t) => t.id !== 'overview').map((t) => h('a', { href: `#/${g.id}/${t.id}`, class: 'nav-sub', 'data-id': `${g.id}/${t.id}` }, t.label)))),
    isAdmin() ? h('a', { href: '#/admin', 'data-id': 'admin', class: 'nav-head admin-link' }, h('span', { class: 'ico' }, '⚙️'), '관리자') : null);
  main = h('main', { class: 'main' });
  clear(app,
    h('header', { class: 'top' },
      h('button', { class: 'icon-btn menu-btn', 'aria-label': '메뉴', onclick: () => document.body.classList.toggle('nav-open') }, '☰'),
      h('a', { href: '#/home/', class: 'brand' }, `${state.settings.schoolName || ''} 온라인 교무실`),
      h('span', { class: 'grow' }),
      h('label', { class: 'year' }, h('span', { class: 'year-label' }, '학년도 '),
        h('select', { id: 'year-select', onchange: (e) => { setYear(e.target.value); route(); } },
          years.sort().map((y) => h('option', { value: y, selected: y === state.year }, `${y}`)))),
      h('span', { class: 'who', title: state.me.email }, state.me.name || state.me.email, h('span', { class: 'tag ghost' }, ROLES[state.me.role])),
      h('button', { class: 'btn small', onclick: logout }, '로그아웃')),
    h('div', { class: 'body' }, nav, main),
    bottomBar(),
    quickAddButton());
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
}

// 휴대폰 하단 탭 (넓은 화면에서는 숨김)
const BOTTOM = [
  { href: '#/home/', group: 'home', icon: '🏠', label: '홈' },
  { href: '#/schedule/overview', group: 'schedule', icon: '📅', label: '달력' },
  { href: '#/class/overview', group: 'class', icon: '🕘', label: '수업' },
  { href: '#/notice/overview', group: 'notice', icon: '📢', label: '공지' },
];
function bottomBar() {
  return h('nav', { class: 'bottom-bar', 'aria-label': '빠른 메뉴' },
    BOTTOM.map((b) => h('a', { href: b.href, 'data-group': b.group }, h('span', { class: 'bb-ico' }, b.icon), h('span', {}, b.label))),
    h('button', { onclick: () => document.body.classList.toggle('nav-open') }, h('span', { class: 'bb-ico' }, '☰'), h('span', {}, '전체')));
}

// 휴대폰 빠른 추가(+): 지금 날짜로 바로 입력
function quickAddButton() {
  const targets = [
    ['events', '📅 일정', { date: today(), category: '전체행사' }],
    ['trips', '🚌 복무·출장', { date: today(), kind: '출장', person: state.me.name || '' }],
    ['substitutes', '🔁 보결', { date: today() }],
    ['collections', '📥 수합', {}],
    ['reservations', '🏫 특별실 예약', { date: today(), user: state.me.name || '' }],
    ['duties', '🧑‍🏫 담당 배정', { date: today() }],
    ['memos', '✏️ 달력 메모', { date: today() }],
    ['programs', '🎨 특별수업', { date: today(), status: '예정' }],
    ['notices', '📢 공지', { category: '일반' }],
    ['meetings', '📝 회의 안건', { date: today(), meeting: '전체회의', status: '완료' }],
    ['purchases', '🛒 물품 신청', { requester: state.me.name || '' }],
  ].filter(([m]) => canEdit(m));
  if (!targets.length) return null;
  return h('button', { class: 'fab', 'aria-label': '빠른 추가', onclick: () => {
    const close = modal('빠른 추가', h('div', { class: 'choice' }, targets.map(([m, label, defaults]) => h('button', { class: 'btn big', onclick: () => {
      close();
      openRecordForm(m, null, { defaults: { ...defaults, date: defaults.date ? today() : undefined }, onSaved: () => route() });
    } }, label))));
  } }, '+');
}

async function route() {
  state.rerender = route;
  const ys = document.getElementById('year-select');
  if (ys && ![...ys.options].some((op) => Number(op.value) === state.year)) ys.append(h('option', { value: state.year }, `${state.year}`));
  if (ys) ys.value = String(state.year);
  let path = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (!path) path = 'home/';
  if (!path.includes('/') && path !== 'admin') {
    const to = legacyRoute(path);
    location.replace(`#/${to || 'home/'}`);
    return;
  }
  const [gid, tidRaw] = path.split('/');
  const group = GROUPS.find((g) => g.id === gid);
  const tid = tidRaw || (group?.tabs.length ? 'overview' : '');
  const key = path === 'admin' ? 'admin' : `${gid}/${tid}`;
  for (const a of nav.querySelectorAll('a')) a.classList.toggle('on', a.dataset.id === key);
  for (const a of document.querySelectorAll('.bottom-bar a')) a.classList.toggle('on', a.dataset.group === gid);
  window.scrollTo(0, 0);
  for (const g of nav.querySelectorAll('.nav-group')) g.classList.toggle('open', g.dataset.group === gid);

  const content = h('div', { class: 'content' });
  const tab = group?.tabs.find((t) => t.id === tid);
  const mod = tab?.module ? MODULES[tab.module] : null;
  const title = path === 'admin' ? '⚙️ 관리자' : group ? `${group.icon} ${group.label}` : '';
  const scopeNote = mod?.scope === 'global' ? '' : `  ${state.year}학년도`;
  clear(main,
    h('h2', { class: 'page-title' }, title, h('span', { class: 'muted small' }, scopeNote)),
    group?.tabs.length ? h('div', { class: 'tabs-bar' }, group.tabs.map((t) => h('a', { href: `#/${gid}/${t.id}`, class: t.id === tid ? 'on' : '' }, t.label))) : null,
    content);
  content.append(h('p', { class: 'muted' }, '불러오는 중…'));
  await loadNews();
  if (tab?.module) markSeen(tab.module);
  paintBadges();
  try {
    if (path === 'admin') {
      if (isAdmin()) await adminView(content, refresh);
      else location.replace('#/home/');
      return;
    }
    const view = VIEWS[key];
    if (!view) { location.replace('#/home/'); return; }
    await view(content);
  } catch (e) {
    if (e.status === 401) return loginScreen();
    clear(content, h('p', { class: 'alert error' }, e.message));
    toast(e.message, 'error');
  }
}

async function refresh() {
  const me = await api('/api/me');
  state.me = me.user;
  state.settings = me.settings;
  layout();
  route();
}

window.addEventListener('hashchange', () => { if (main) route(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// 안드로이드 크롬: '홈 화면에 추가' 창을 나중에 띄울 수 있도록 보관
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });
boot();
