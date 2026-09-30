import { MODULES, MENU, ROLES } from './modules.js';
import { h, api, clear, toast } from './ui.js';
import { state, setYear, isAdmin } from './state.js';
import { dashboardView } from './views/dashboard.js';
import { calendarView } from './views/calendar.js';
import { tableView } from './views/table.js';
import { timetableView } from './views/timetable.js';
import { boardView } from './views/board.js';
import { openClassesView } from './views/openclasses.js';
import { adminView } from './views/admin.js';

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
    MENU.map((m) => {
      const d = MODULES[m.id] || m;
      return h('a', { href: `#/${m.id}`, 'data-id': m.id }, h('span', { class: 'ico' }, d.icon), d.label);
    }),
    isAdmin() ? h('a', { href: '#/admin', 'data-id': 'admin', class: 'admin-link' }, h('span', { class: 'ico' }, '⚙️'), '관리자') : null);
  main = h('main', { class: 'main' });
  clear(app,
    h('header', { class: 'top' },
      h('button', { class: 'icon-btn menu-btn', 'aria-label': '메뉴', onclick: () => document.body.classList.toggle('nav-open') }, '☰'),
      h('a', { href: '#/dashboard', class: 'brand' }, `${state.settings.schoolName || ''} 온라인 교무실`),
      h('span', { class: 'grow' }),
      h('label', { class: 'year' }, h('span', { class: 'year-label' }, '학년도 '),
        h('select', { onchange: (e) => { setYear(e.target.value); route(); } },
          years.sort().map((y) => h('option', { value: y, selected: y === state.year }, `${y}`)))),
      h('span', { class: 'who', title: state.me.email }, state.me.name || state.me.email, h('span', { class: 'tag ghost' }, ROLES[state.me.role])),
      h('button', { class: 'btn small', onclick: logout }, '로그아웃')),
    h('div', { class: 'body' }, nav, main));
  nav.addEventListener('click', () => document.body.classList.remove('nav-open'));
}

async function route() {
  const id = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  for (const a of nav.querySelectorAll('a')) a.classList.toggle('on', a.dataset.id === id);
  const def = MODULES[id];
  const title = id === 'admin' ? '⚙️ 관리자' : id === 'dashboard' ? '🏠 대시보드' : def ? `${def.icon} ${def.label}` : '';
  const content = h('div', { class: 'content' });
  clear(main, h('h2', { class: 'page-title' }, title, h('span', { class: 'muted small' }, def?.scope === 'global' ? '' : `  ${state.year}학년도`)), content);
  content.append(h('p', { class: 'muted' }, '불러오는 중…'));
  try {
    if (id === 'dashboard') await dashboardView(content);
    else if (id === 'admin' && isAdmin()) await adminView(content, refresh);
    else if (!def) location.hash = '#/dashboard';
    else if (def.view === 'calendar') await calendarView(content);
    else if (def.view === 'timetable') await timetableView(content);
    else if (def.view === 'board') await boardView(content);
    else if (def.view === 'openClasses') await openClassesView(content);
    else await tableView(content, id);
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
