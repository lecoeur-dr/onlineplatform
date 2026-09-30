import { MODULES, GROUPS, ROLES } from './modules.js';
import { h, api, clear, toast } from './ui.js';
import { state, setYear, isAdmin } from './state.js';
import { dashboardView } from './views/dashboard.js';
import { tableView } from './views/table.js';
import { timetableView } from './views/timetable.js';
import { boardView } from './views/board.js';
import { adminView } from './views/admin.js';
import { scheduleOverview, eventsList, tripsView } from './views/schedule.js';
import { classOverview, programsView, openClassesTab } from './views/classes.js';
import { noticeOverview, noticesView, meetingsView } from './views/notices.js';
import { moneyOverview, purchasesView, budgetView } from './views/money.js';
import { infoOverview, contactsView, rulesView } from './views/info.js';

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
  'notice/overview': noticeOverview,
  'notice/notices': noticesView,
  'notice/meetings': meetingsView,
  'money/overview': moneyOverview,
  'money/purchases': purchasesView,
  'money/budget': budgetView,
  'money/contests': (el) => tableView(el, 'contests'),
  'money/contestInfo': (el) => tableView(el, 'contestInfo', { groupBy: 'topic' }),
  'info/overview': infoOverview,
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
        h('select', { onchange: (e) => { setYear(e.target.value); route(); } },
          years.sort().map((y) => h('option', { value: y, selected: y === state.year }, `${y}`)))),
      h('span', { class: 'who', title: state.me.email }, state.me.name || state.me.email, h('span', { class: 'tag ghost' }, ROLES[state.me.role])),
      h('button', { class: 'btn small', onclick: logout }, '로그아웃')),
    h('div', { class: 'body' }, nav, main));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
}

async function route() {
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
boot();
