// 관리자: 사용자 승인 · 설정 · 엑셀 가져오기 · 연도 복사 · 변경 기록 · 백업
import { MODULES, ROLES, DEFAULT_LISTS, MONEY_ACCESS } from '../modules.js';
import { h, api, clear, toast, confirmBox, loadScript, download, modal } from '../ui.js';
import { state, remember } from '../state.js';
import { parseWorkbook, guessYear } from '../importer.js';
import { swatches, applyTheme } from '../theme.js';
import { smartTab } from './smart-tab.js';

let tab = 'users';
const TABS = { users: '👥 사용자·초대', access: '🔐 행정·예산 권한', settings: '⚙️ 설정', smart: '🪄 새 학기 가져오기', audit: '🕘 변경 기록', import: '📄 기존 시트', copy: '📋 연도 복사', backup: '💾 백업' };

// 휴대폰에서 넓은 표 → 줄마다 카드로 (머리글을 각 칸 앞에 이름표로 붙임)
export function stackTables(root) {
  for (const t of root.querySelectorAll('table.table')) {
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!heads.length) continue;
    t.classList.add('stack');
    for (const tr of t.querySelectorAll('tbody tr, tfoot tr')) [...tr.children].forEach((td, i) => { if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] || ''); });
  }
}

export async function adminView(root, refreshApp) {
  const want = location.hash.match(/[?&]tab=(\w+)/)?.[1];
  if (want && TABS[want]) { tab = want; history.replaceState(null, '', '#/admin'); }
  const body = h('div', {});
  // 탭: 넓은 화면은 여러 줄, 휴대폰은 한 줄 가로 넘김
  const bar = h('div', { class: 'seg tabs admin-tabs' }, Object.entries(TABS).map(([k, v]) => h('button', { class: tab === k ? 'on' : '', 'data-tab': k, onclick: () => { tab = k; adminView(root, refreshApp); } }, v)));
  clear(root, bar, body);
  bar.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  // 가입 요청이 있으면 사용자 탭에 숫자
  api('/api/admin/users').then((list) => { const n = list.filter((u) => u.role === 'pending').length; if (n) bar.querySelector('[data-tab=users]')?.append(h('span', { class: 'badge' }, String(n))); }).catch(() => {});
  // 표를 다시 그려도(승인·필터 등) 휴대폰 카드 모양 유지
  let raf = 0;
  new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => stackTables(body)); }).observe(body, { childList: true, subtree: true });
  await ({ users, access: accessTab, smart: smartTab, settings, import: importTab, copy, audit, backup })[tab](body, refreshApp);
  stackTables(body);
}

// 🔐 행정·예산 권한: 공모 안내·기한 안내는 모두에게 보임. 나머지 탭은 관리자 + 여기서 체크한 사람만 보고 입력
async function accessTab(root, refreshApp) {
  const list = (await api('/api/admin/users')).filter((u) => ['staff', 'viewer'].includes(u.role)).map((u) => ({ ...u, email: String(u.email).toLowerCase() }));
  const grants = {};
  for (const a of MONEY_ACCESS) grants[a.id] = new Set(state.settings.access?.[a.id] || []);
  let q = '';
  const tbody = h('tbody', {});
  const draw = () => clear(tbody, list.filter((u) => !q || `${u.name} ${u.email} ${u.dept}`.includes(q)).map((u) => h('tr', {},
    h('td', {}, h('strong', {}, u.name || '(이름 없음)'), h('div', { class: 'muted small' }, u.email)),
    h('td', { class: 'small' }, u.dept || ''),
    MONEY_ACCESS.map((a) => h('td', { class: 'center' }, h('input', { type: 'checkbox', checked: grants[a.id].has(u.email), title: `${u.name || u.email} · ${a.label}`,
      onchange: (e) => { if (e.target.checked) grants[a.id].add(u.email); else grants[a.id].delete(u.email); dirty(); } }))),
    h('td', {}, h('button', { class: 'link-btn small', onclick: () => { const all = MONEY_ACCESS.every((a) => grants[a.id].has(u.email)); for (const a of MONEY_ACCESS) { if (all) grants[a.id].delete(u.email); else grants[a.id].add(u.email); } dirty(); draw(); } }, '전체')))));
  const save = h('button', { class: 'btn primary', disabled: true, onclick: async () => {
    try {
      const access = Object.fromEntries(MONEY_ACCESS.map((a) => [a.id, [...grants[a.id]]]));
      state.settings = await api('/api/admin/settings', { method: 'PUT', body: { access } });
      save.disabled = true; toast('권한을 저장했습니다. 해당 선생님은 새로고침하면 메뉴가 바뀝니다.');
    } catch (e) { toast(e.message, 'error'); }
  } }, '저장');
  const dirty = () => { save.disabled = false; };
  draw();
  clear(root,
    h('p', { class: 'hint' }, '행정·예산 메뉴는 기본으로 관리자만 봅니다. 「공모 안내」·「기한 안내」는 모든 교직원에게 보이고, 나머지 탭은 여기서 체크한 사람에게만 열립니다. 공모사업은 [공모사업] 탭에서 담당자로 지정된 사람도 자기 사업만 볼 수 있습니다.'),
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: '이름·부서 찾기', oninput: (e) => { q = e.target.value.trim(); draw(); } }), h('span', { class: 'grow' }),
      h('span', { class: 'muted small' }, MONEY_ACCESS.map((a) => `${a.label} ${grants[a.id].size}명`).join(' · ')), save),
    list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, '교직원'), h('th', {}, '부서'), MONEY_ACCESS.map((a) => h('th', { class: 'center', title: a.hint }, a.label)), h('th', {}, ''))),
      tbody)) : h('p', { class: 'muted' }, '승인된 교직원이 없습니다.'),
    h('ul', { class: 'muted small' }, MONEY_ACCESS.map((a) => h('li', {}, h('strong', {}, a.label), ` — ${a.hint}`))));
}

// 담임 학급·전담 고르기: 시간표 탭이 이 시간표로 바로 열림 (설정의 학급·전담 목록)
function homeroomSelect(value, onChange) {
  const lists = state.settings.lists || {};
  const classes = lists.classes || [];
  const specs = lists.specialists || [];
  return h('select', { title: '시간표 탭이 이 시간표로 바로 열립니다', onchange: (e) => onChange(e.target.value) },
    h('option', { value: '' }, '없음'),
    classes.length ? h('optgroup', { label: '담임 학급' }, classes.map((c) => h('option', { value: c, selected: c === value }, c))) : null,
    specs.length ? h('optgroup', { label: '전담' }, specs.map((c) => h('option', { value: c, selected: c === value }, c))) : null,
    value && !classes.includes(value) && !specs.includes(value) ? h('option', { value, selected: true }, value) : null);
}

async function users(root) {
  const list = await api('/api/admin/users');
  const pending = list.filter((u) => u.role === 'pending');
  const update = async (email, patch) => {
    try { await api(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'PUT', body: patch }); toast('저장했습니다.'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const form = h('form', { class: 'inline-form', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/admin/users', { method: 'POST', body: Object.fromEntries(f) });
      toast('등록했습니다.');
      users(root);
    } catch (err) { toast(err.message, 'error'); }
  } },
  h('input', { name: 'email', type: 'email', placeholder: 'gmail 주소', required: true }),
  h('input', { name: 'name', placeholder: '이름 (참관 명단 등에 표시)' }),
  h('input', { name: 'dept', placeholder: '부서' }),
  h('select', { name: 'role' }, ['staff', 'viewer', 'admin'].map((r) => h('option', { value: r }, ROLES[r]))),
  h('button', { class: 'btn primary' }, '미리 등록'));

  const inv = await api('/api/admin/invite');
  const link = `${location.origin}/#/join/${inv.code}`;
  const approve = (u) => h('span', { class: 'nowrap' },
    h('button', { class: 'btn small primary', onclick: async () => { await update(u.email, { role: 'staff' }); users(root); } }, '승인'),
    h('button', { class: 'btn small danger ghost', onclick: async () => { if (await confirmBox(`${u.name || u.email}의 가입 요청을 거절할까요?`)) { await api(`/api/admin/users/${encodeURIComponent(u.email)}`, { method: 'DELETE' }); users(root); } } }, '거절'));
  // 정렬 (기본: 담임·전담순 — 1-1부터, 담임·전담 없는 사람은 맨 뒤). 고른 정렬은 이 기기에 기억
  let sortKey = remember('adm_user_sort') || 'homeroom';
  let desc = false;
  const tableBox = h('div', {});
  const sortSel = h('select', { 'aria-label': '정렬', onchange: (e) => { sortKey = e.target.value; desc = false; remember('adm_user_sort', sortKey); drawTable(); } },
    SORTS.map(([k, l]) => h('option', { value: k, selected: k === sortKey }, l)));
  const dirBtn = h('button', { type: 'button', class: 'btn small', title: '순서 뒤집기', onclick: () => { desc = !desc; drawTable(); } });
  const sortBar = h('div', { class: 'toolbar slim' }, h('strong', {}, `교직원 ${list.length}명`), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, '정렬'), sortSel, dirBtn);
  const COLS = [['email', '이메일'], ['name', '이름'], ['dept', '부서'], ['homeroom', '담임·전담'], ['role', '권한'], ['last_login', '최근 로그인'], ['', '']];
  const drawTable = () => {
    let rows = list.slice().sort(compareUsers(sortKey));
    if (desc) {
      // 거꾸로 해도 담임·전담·부서가 '없음'인 사람은 맨 뒤
      const blank = (u) => (sortKey === 'homeroom' ? !u.homeroom : sortKey === 'dept' ? !u.dept : false);
      rows = [...rows.filter((u) => !blank(u)).reverse(), ...rows.filter(blank)];
    }
    dirBtn.textContent = desc ? '↑ 거꾸로' : '↓ 차례로';
    sortSel.value = sortKey;
    clear(tableBox, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, COLS.map(([k, t]) => h('th', k && k !== 'email' ? { class: 'sortable', title: `${t} 기준으로 정렬`, onclick: () => { if (sortKey === k) desc = !desc; else { sortKey = k; desc = false; remember('adm_user_sort', k); } drawTable(); } } : {}, t, sortKey === k ? (desc ? ' ▼' : ' ▲') : '')))),
      h('tbody', {}, rows.map((u) => h('tr', { class: u.role === 'pending' ? 'hl' : '' },
        h('td', {}, u.email),
        h('td', {}, h('input', { value: u.name, onchange: (e) => { u.name = e.target.value; update(u.email, { name: u.name }); } })),
        h('td', {}, h('input', { value: u.dept, onchange: (e) => { u.dept = e.target.value; update(u.email, { dept: u.dept }); } })),
        h('td', {}, homeroomSelect(u.homeroom || '', (v) => { u.homeroom = v; update(u.email, { homeroom: v }); })),
        h('td', {}, h('select', { onchange: (e) => update(u.email, { role: e.target.value }).then(() => users(root)) },
          Object.entries(ROLES).map(([k, v]) => h('option', { value: k, selected: k === u.role }, v)))),
        h('td', { class: 'small' }, u.last_login || '-'),
        h('td', {}, u.email === state.me.email ? null : h('button', { class: 'link-btn danger', onclick: async () => {
          if (await confirmBox(`${u.email} 사용자를 삭제할까요?`)) { await api(`/api/admin/users/${encodeURIComponent(u.email)}`, { method: 'DELETE' }); users(root); }
        } }, '삭제'))))))));
  };
  clear(root,
    h('section', { class: 'card' },
      h('h3', {}, '🔑 초대 링크'),
      h('p', { class: 'muted small' }, '이 링크(또는 코드)를 교직원 단톡방 등에 보내면, 선생님이 구글 로그인 후 가입을 요청합니다. 아래 "가입 요청"에서 승인하면 사용할 수 있습니다.'),
      h('div', { class: 'invite-row' }, h('code', {}, link),
        h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(link); toast('링크를 복사했습니다.'); } }, '복사'),
        h('button', { class: 'btn small', onclick: () => showQr(link) }, '📱 QR'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmBox('초대 코드를 새로 만들까요? 이전 링크는 더 이상 쓸 수 없습니다.')) { await api('/api/admin/invite', { method: 'POST' }); users(root); } } }, '코드 바꾸기')),
      h('div', { class: 'muted small' }, `초대 코드: ${inv.code}`)),
    pending.length ? h('section', { class: 'card warn' }, h('h3', {}, `🙋 가입 요청 ${pending.length}명`),
      h('ul', { class: 'list' }, pending.map((u) => h('li', {}, h('strong', {}, u.name || u.account_name || '(이름 없음)'), h('span', { class: 'muted' }, ` ${u.email} · ${u.created_at}`), ' ', approve(u),
        u.note ? h('div', { class: 'small req-note' }, `💬 ${u.note}`) : h('div', { class: 'muted small' }, '(신청 메모 없음)'))))) : null,
    h('p', { class: 'hint' }, '이름은 보결·담당 배정·내 할 일에 쓰이므로 실명으로 맞춰 주세요. 이메일을 미리 등록해 두면 그 선생님은 첫 로그인부터 바로 사용합니다. "담임·전담"을 지정하면 그 선생님의 수업 → 시간표 탭이 자기 시간표로 바로 열립니다(학급·전담 목록은 시간표 탭의 ⚙ 학년반·전담·특별실에서).'),
    form,
    sortBar, tableBox);
  drawTable();
}

// 사용자 표 정렬: 담임·전담(1-1, 1-2 … 6-n → 그 밖의 학급 → 전담 → 없음) · 이름 · 부서 · 권한 · 최근 로그인
const SORTS = [['homeroom', '담임·전담순'], ['name', '이름순'], ['dept', '부서순'], ['role', '권한순'], ['last_login', '최근 로그인순']];
const ROLE_ORDER = ['pending', 'admin', 'staff', 'viewer'];
const ko = (a, b) => String(a || '').localeCompare(String(b || ''), 'ko', { numeric: true });
function homeroomKey(v) {
  const lists = state.settings.lists || {};
  const t = String(v || '').trim();
  if (!t) return [9, 0, 0, ''];
  const m = t.match(/^(\d+)\s*[-–학년\s]+\s*(\d+)/);
  if (m) return [0, Number(m[1]), Number(m[2]), t];
  const ci = (lists.classes || []).indexOf(t);
  if (ci >= 0) return [1, ci, 0, t];
  const si = (lists.specialists || []).indexOf(t);
  return [2, si < 0 ? 999 : si, 0, t];
}
function compareUsers(key) {
  const byName = (a, b) => ko(a.name || a.email, b.name || b.email);
  if (key === 'homeroom') return (a, b) => { const x = homeroomKey(a.homeroom); const y = homeroomKey(b.homeroom); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return ko(x[3], y[3]) || byName(a, b); };
  if (key === 'role') return (a, b) => (ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)) || byName(a, b);
  if (key === 'last_login') return (a, b) => String(b.last_login || '').localeCompare(String(a.last_login || '')) || byName(a, b);
  if (key === 'dept') return (a, b) => { if (!a.dept !== !b.dept) return a.dept ? -1 : 1; return ko(a.dept, b.dept) || byName(a, b); };
  return byName;
}

// 접속 QR: 교무실 화면·연수 자료에 띄워 두면 폰 카메라로 바로 접속
export async function showQr(target) {
  if (!window.qrcode) await loadScript('/vendor/qrcode.js');
  const url = typeof target === 'string' ? target : location.origin + '/';
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const box = h('div', { class: 'qr-box' });
  box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  modal('📱 접속 QR', h('div', { class: 'center' },
    box,
    h('p', { class: 'strong' }, url),
    h('p', { class: 'muted small' }, '휴대폰 카메라로 비추면 바로 열립니다. 처음 로그인한 선생님은 "승인대기"가 되며, 사용자 탭에서 승인하면 됩니다.'),
    h('div', { class: 'row-actions center' },
      h('button', { class: 'btn', onclick: () => { navigator.clipboard?.writeText(url); toast('주소를 복사했습니다.'); } }, '주소 복사'),
      h('button', { class: 'btn', onclick: () => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<title>접속 QR</title><div style="text-align:center;font-family:sans-serif;padding:40px"><h1>${state.settings.schoolName || ''} · OnlinePlatform</h1><div style="width:420px;margin:auto">${box.innerHTML}</div><p style="font-size:20px">${url}</p></div>`);
        w.document.close();
        w.print();
      } }, '인쇄'))));
}

async function settings(root, refreshApp) {
  const s = state.settings;
  const LABELS = { depts: '부서', places: '장소', classes: '학급', programs: '특별수업 프로그램', meetingTypes: '회의 종류', linkCategories: '바로가기 분류', leaveKinds: '복무 구분', periods: '교시', resourceCategories: '자료실 분류', subjects: '교과', budgetCategories: '예산 비목', specialists: '전담(교과 전담 시간표)' };
  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const lists = {};
    for (const k of Object.keys(DEFAULT_LISTS)) lists[k] = String(f.get(k)).split('\n').map((x) => x.trim()).filter(Boolean);
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { currentYear: Number(f.get('currentYear')), schoolName: f.get('schoolName'), lists } });
      toast('저장했습니다.');
      refreshApp();
    } catch (err) { toast(err.message, 'error'); }
  } },
  h('div', { class: 'row' }, h('label', {}, '학교 이름'), h('input', { name: 'schoolName', value: s.schoolName })),
  h('div', { class: 'row' }, h('label', {}, '기본 학년도'), h('input', { name: 'currentYear', type: 'number', value: s.currentYear }),
    h('small', { class: 'hint' }, `학년도 ${s.currentYear} = ${s.currentYear}년 3월 1일 ~ ${s.currentYear + 1}년 2월 말. 선생님들이 처음 들어왔을 때 보이는 학년도이며, 3월 1일이 되면 자동으로 새 학년도로 바뀝니다(2월에 미리 다음 학년도로 바꿔 둘 수도 있음).`)),
  h('p', { class: 'muted small' }, '아래 목록은 입력 창의 고르기 칸에 쓰입니다. 눌러서 펼친 뒤 한 줄에 하나씩 적어 주세요.'),
  h('div', { class: 'lists' }, Object.keys(DEFAULT_LISTS).map((k) => h('details', { class: 'list-box' },
    h('summary', {}, h('strong', {}, LABELS[k] || k), h('span', { class: 'muted small' }, ` ${(s.lists[k] || []).length}개 · ${(s.lists[k] || []).slice(0, 4).join(', ')}${(s.lists[k] || []).length > 4 ? ' …' : ''}`)),
    h('textarea', { name: k, rows: 8, value: (s.lists[k] || []).join('\n') })))),
  h('div', {}, h('button', { class: 'btn primary' }, '설정 저장')));
  const themeBox = h('section', { class: 'card' });
  const drawTheme = () => clear(themeBox, h('h3', {}, '🎨 학교 기본 색'),
    h('p', { class: 'muted small' }, '우리 학교 선생님들 화면의 주 색입니다. 각자 내 정보에서 따로 바꿀 수도 있습니다.'),
    swatches(s.theme?.accent || 'indigo', async (id) => {
      try { await api('/api/admin/settings', { method: 'PUT', body: { theme: { accent: id } } }); s.theme = { accent: id }; applyTheme(); drawTheme(); toast('학교 기본 색을 바꿨습니다.'); } catch (err) { toast(err.message, 'error'); }
    }));
  drawTheme();
  clear(root, themeBox, yearPrepSection(), neisSection(refreshApp), h('h3', {}, '기본 설정'), form);
}

// 🌱 다음 학년도 준비: 해마다 이어 쓰는 자료 복사 + 새 학기 자료 가져오기 안내
function yearPrepSection() {
  const cur = state.settings.currentYear;
  const pick = { from: cur, to: cur + 1 };
  const MODS = [['assignments', '업무분장'], ['timetables', '시간표(틀)'], ['boards', '자유 표'], ['contestInfo', '공모 안내']];
  const on = new Set(['assignments', 'timetables']);
  const yearSel = (k) => h('select', { onchange: (e) => { pick[k] = Number(e.target.value); } }, [cur - 1, cur, cur + 1].map((y) => h('option', { value: y, selected: y === pick[k] }, `${y}학년도`)));
  return h('section', { class: 'card' }, h('h3', {}, '🌱 학년도 관리'),
    h('p', { class: 'muted small' }, `지금 기본 학년도: ${cur}학년도 (${cur}.3.1 ~ ${cur + 1}.2월 말). 학사일정·회의·출장 같은 날짜 자료는 날짜로, 공지·업무분장·예산 같은 자료는 학년도로 자동 구분됩니다. 3월 1일에 기본 학년도가 자동으로 넘어갑니다.`),
    h('ol', { class: 'small' },
      h('li', {}, '2월: 위쪽 [학년도]에서 다음 학년도를 고르고 업무분장·시간표·학사일정을 미리 넣기 (새 학기 자료 가져오기·나이스 학사일정 가져오기)'),
      h('li', {}, '해마다 비슷한 자료는 아래에서 복사한 뒤 고치기'),
      h('li', {}, '3월 1일: 모두의 화면이 새 학년도로 자동 전환 (지난 학년도는 [학년도]에서 언제든 다시 볼 수 있음)')),
    h('div', { class: 'row-flex', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, yearSel('from'), '→', yearSel('to'),
      MODS.map(([k, l]) => h('label', { class: 'inline chip-check' }, h('input', { type: 'checkbox', checked: on.has(k), onchange: (e) => (e.target.checked ? on.add(k) : on.delete(k)) }), ` ${l}`)),
      h('button', { class: 'btn primary small', onclick: async (e) => {
        if (!on.size) { toast('복사할 자료를 골라 주세요.', 'error'); return; }
        if (!(await confirmBox(`${pick.from}학년도 → ${pick.to}학년도로 ${[...on].map((k) => MODS.find((x) => x[0] === k)[1]).join(', ')}을(를) 복사할까요? 받는 학년도에 이미 자료가 있는 메뉴는 건너뜁니다.`))) return;
        e.target.disabled = true;
        try {
          const r = await api('/api/admin/copy-year', { method: 'POST', body: { from: pick.from, to: pick.to, modules: [...on] } });
          toast(Object.entries(r.result).map(([k, v]) => `${MODS.find((x) => x[0] === k)[1]} ${v.copied !== undefined ? `${v.copied}건 복사` : `이미 ${v.skipped}건 있어 건너뜀`}`).join(' · ') || '복사할 자료가 없습니다.');
        } catch (err) { toast(err.message, 'error'); }
        e.target.disabled = false;
      } }, '복사')),
    h('p', { class: 'hint' }, h('a', { href: '#/admin?tab=smart' }, '🪄 새 학기 자료 가져오기(한글·엑셀) →'), ' 화면 위쪽 [학년도]에서 고른 학년도로 들어갑니다.'));
}

// 나이스 연동: 학교 검색 → 선택 → 학사일정 가져오기 (급식은 홈에 자동 표시)
function neisSection(refreshApp) {
  const s = state.settings;
  const box = h('section', { class: 'card neis-box' });
  const results = h('div', {});
  const status = h('div', {});
  const search = async (name) => {
    clear(results, h('p', { class: 'muted' }, '검색 중…'));
    try {
      const list = await api(`/api/admin/neis/schools?name=${encodeURIComponent(name)}`);
      clear(results, list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
        h('tbody', {}, list.map((x) => h('tr', {},
          h('td', {}, h('strong', {}, x.name), h('div', { class: 'muted small' }, `${x.office || ''} · ${x.address || ''}`)),
          h('td', {}, h('button', { class: 'btn small primary', onclick: async () => {
            await api('/api/admin/neis/config', { method: 'POST', body: x });
            toast(`${x.name}(으)로 설정했습니다.`);
            refreshApp();
          } }, '선택'))))))) : h('p', { class: 'muted' }, '검색 결과가 없습니다.'));
    } catch (e) { clear(results, h('p', { class: 'alert error' }, e.message)); }
  };
  const sync = async (btn) => {
    btn.disabled = true;
    clear(status, h('p', { class: 'muted' }, '나이스에서 학사일정을 가져오는 중…'));
    try {
      const r = await api('/api/admin/neis/sync', { method: 'POST', body: { year: state.year } });
      clear(status, h('p', { class: 'alert' }, `완료: 나이스 ${r.fetched}건 → 학사일정 ${r.inserted}건 등록 (직접 입력한 같은 일정 ${r.skipped}건은 건너뜀)`));
    } catch (e) { clear(status, h('p', { class: 'alert error' }, e.message)); }
    btn.disabled = false;
  };
  const last = s.neis?.lastSync;
  clear(box,
    h('h3', {}, '🔗 나이스 연동 (학사일정 · 급식)'),
    !s.neisKey ? h('p', { class: 'alert warn' }, '인증키(NEIS_API_KEY)가 아직 등록되지 않았습니다. Cloudflare → onlineplatform → 설정 → 변수 및 비밀에 비밀(Secret)로 등록하세요. (docs/02_배포_가이드.md 참고)') : null,
    s.neis ? h('p', {}, '연결된 학교: ', h('strong', {}, s.neis.name), h('span', { class: 'muted' }, ` (${s.neis.office || s.neis.atpt})`),
      last ? h('span', { class: 'muted small' }, ` · 마지막 동기화 ${new Date(last.at).toLocaleString('ko-KR')} (${last.inserted}건)`) : null) : h('p', { class: 'muted' }, '아직 학교가 선택되지 않았습니다.'),
    h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); search(new FormData(e.target).get('q')); } },
      h('input', { name: 'q', placeholder: '학교 이름 (예: 서부초)', value: '', required: true }),
      h('button', { class: 'btn', disabled: !s.neisKey }, '학교 검색')),
    results,
    s.neis ? h('div', { class: 'row-actions' },
      h('button', { class: 'btn primary', disabled: !s.neisKey, onclick: (e) => sync(e.currentTarget) }, `${state.year}학년도 학사일정 가져오기`),
      h('span', { class: 'muted small' }, '매일 새벽 5시에도 자동으로 갱신됩니다. 직접 입력한 같은 날·같은 이름의 일정은 중복으로 넣지 않습니다.')) : null,
    status);
  return box;
}

async function importTab(root) {
  let parsed = null;
  const out = h('div', {});
  const file = h('input', { type: 'file', accept: '.xlsx', onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    clear(out, h('p', {}, '파일을 읽는 중…'));
    try {
      if (!window.XLSX) await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array', cellNF: true, cellDates: false });
      parsed = parseWorkbook(window.XLSX, wb, { lists: state.settings.lists });
      parsed.year = guessYear(wb, parsed.items);
      preview();
    } catch (err) { clear(out, h('p', { class: 'alert error' }, err.message)); }
  } });

  const preview = () => {
    const counts = {};
    for (const it of parsed.items) counts[it.module] = (counts[it.module] || 0) + 1;
    const yearIn = h('input', { type: 'number', value: parsed.year, style: { width: '6rem' } });
    const mode = h('select', {}, h('option', { value: 'replace' }, '바꾸기 — 같은 연도의 해당 메뉴 기록을 지우고 새로 넣기'), h('option', { value: 'append' }, '추가 — 기존 기록 유지하고 덧붙이기'));
    const checks = Object.keys(counts).map((m) => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: m, checked: true }), `${MODULES[m].icon} ${MODULES[m].label} ${counts[m]}건`));
    clear(out,
      h('h3', {}, '시트별 결과'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['시트', '옮기는 곳', '건수'].map((t) => h('th', {}, t)))),
        h('tbody', {}, parsed.report.map((r) => h('tr', {}, h('td', {}, r.sheet), h('td', {}, r.how),
          h('td', { class: 'small' }, Object.entries(r.counts).map(([m, n]) => `${MODULES[m].label} ${n}`).join(', '))))))),
      parsed.warnings.length ? h('details', { class: 'alert warn' }, h('summary', {}, `어디에도 넣지 못한 칸 ${parsed.warnings.reduce((a, w) => a + w.cells.length, 0)}개 (눌러서 보기)`),
        parsed.warnings.map((w) => h('p', { class: 'small' }, `${w.sheet}: `, w.cells.map((c) => `${c.cell} ${c.value}`).join(' · ')))) : null,
      h('h3', {}, '가져올 메뉴'),
      h('div', { class: 'checks' }, checks),
      h('div', { class: 'inline-form' }, h('label', {}, '학년도 '), yearIn, mode),
      h('p', { class: 'hint' }, '날짜가 있는 기록(일정·회의 등)은 날짜 그대로 들어가고, 시간표·예산 같은 연도별 기록은 위 학년도로 들어갑니다. 연락처·위임전결·계정은 연도와 관계없이 하나로 관리됩니다.'),
      h('button', { class: 'btn primary', onclick: async () => {
        const pick = new Set(checks.map((c) => c.querySelector('input')).filter((i) => i.checked).map((i) => i.value));
        const items = parsed.items.filter((i) => pick.has(i.module));
        if (!(await confirmBox(`${yearIn.value}년으로 ${items.length}건을 가져옵니다.\n방식: ${mode.selectedOptions[0].textContent}`))) return;
        try {
          const res = await api('/api/admin/import', { method: 'POST', body: { year: Number(yearIn.value), mode: mode.value, items } });
          toast(`${res.inserted}건을 가져왔습니다.`);
          clear(out, h('p', { class: 'alert' }, `완료: ${res.inserted}건. 왼쪽 메뉴에서 확인하세요.`));
        } catch (err) { toast(err.message, 'error'); }
      } }, '가져오기 실행'));
  };

  clear(root,
    h('ol', { class: 'steps' },
      h('li', {}, '구글 시트에서 [파일] → [다운로드] → [Microsoft Excel (.xlsx)] 로 내려받습니다.'),
      h('li', {}, '아래에서 파일을 고르면, 시트마다 어디로 옮겨지는지 미리 보여 줍니다. (파일은 이 브라우저 안에서만 읽고, 확인한 기록만 서버로 보냅니다.)'),
      h('li', {}, '확인 후 [가져오기 실행]을 누릅니다. 같은 파일을 다시 가져와도 "바꾸기"면 중복되지 않습니다.')),
    file, out);
}

async function copy(root) {
  const yearMods = Object.entries(MODULES).filter(([, d]) => d.scope === 'year');
  const from = h('input', { type: 'number', value: state.year });
  const to = h('input', { type: 'number', value: state.year + 1 });
  const checks = yearMods.map(([k, d]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: k, checked: ['timetables', 'boards'].includes(k) }), `${d.icon} ${d.label}`));
  clear(root,
    h('p', { class: 'hint' }, '새 학년도를 시작할 때, 작년 시간표·자유 표 등을 복사해서 고쳐 쓰면 셋팅이 빨라집니다. 날짜가 있는 기록(학사일정 등)은 복사하지 않아도 1~2월이 두 해에 함께 보입니다.'),
    h('div', { class: 'inline-form' }, from, ' 년 → ', to, ' 년'),
    h('div', { class: 'checks' }, checks),
    h('button', { class: 'btn primary', onclick: async () => {
      const modules = checks.map((c) => c.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
      if (!modules.length) return toast('메뉴를 골라 주세요.', 'error');
      if (!(await confirmBox(`${from.value}년 → ${to.value}년으로 복사합니다. (기존 ${to.value}년 기록은 그대로 두고 추가)`))) return;
      const res = await api('/api/admin/copy-year', { method: 'POST', body: { from: Number(from.value), to: Number(to.value), modules } });
      toast(`${res.copied}건 복사했습니다.`);
    } }, '복사'));
}

const ACT = { create: '추가', update: '수정', delete: '삭제', reveal: '비밀번호 보기', import: '가져오기', settings: '설정', user: '사용자', 'copy-year': '연도 복사', export: '백업', observe: '참관 신청', unobserve: '참관 취소', 'self-on': '본인 체크', 'self-off': '본인 체크 해제', 'neis-sync': '나이스 동기화' };
// DB 시각(UTC 'YYYY-MM-DD HH:MM:SS') → 한국 시각
const kst = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); if (Number.isNaN(d.getTime())) return at; const k = new Date(d.getTime() + 9 * 3600000); return k.toISOString().slice(0, 16).replace('T', ' '); };
const ROLE_KO = { admin: '관리자', staff: '교직원', viewer: '열람', pending: '대기', blocked: '차단' };
const auditF = { school: '', email: '', action: '', module: '' };

async function audit(root) {
  const qs = (extra = {}) => new URLSearchParams(Object.entries({ ...auditF, ...extra }).filter(([, v]) => v)).toString();
  let res;
  try { res = await api(`/api/admin/audit?${qs()}`); } catch (e) { auditF.school = ''; return clear(root, h('p', { class: 'alert warn' }, e.message)); }
  if (Array.isArray(res)) res = { rows: res, users: [], schools: [], full: true }; // 체험 모드
  let rows = res.rows;
  const reload = () => audit(root);
  const set = (k, v) => { auditF[k] = v; if (k === 'school') auditF.email = ''; reload(); };
  const label = (u) => `${u.name || '(이름 없음)'} · ${u.email || '-'}`;
  const tbody = h('tbody', {});
  const drawRows = () => clear(tbody, rows.map((a) => h('tr', {},
    h('td', { class: 'nowrap small' }, kst(a.at)),
    h('td', {}, h('button', { class: 'link-btn', title: '이 아이디만 보기', onclick: () => set('email', a.email || '') }, a.name || a.email || ''), a.name && a.email ? h('div', { class: 'muted small' }, a.email) : null),
    h('td', {}, h('span', { class: `tag ${a.action === 'delete' ? 'warn' : a.action === 'create' ? 'ok' : 'ghost'}` }, ACT[a.action] || a.action)),
    h('td', {}, a.module ? a.module.split(',').map((m) => MODULES[m]?.label || m).join(', ') : ''),
    h('td', { class: 'small' }, h('div', { class: 'clamp2', title: a.detail && a.action !== 'delete' ? a.detail : '' }, a.detail && a.action !== 'delete' ? a.detail : '')))));
  drawRows();
  const more = h('button', { class: 'btn', style: { display: res.more ? '' : 'none' }, onclick: async () => {
    const r = await api(`/api/admin/audit?${qs({ before: rows[rows.length - 1].id })}`);
    rows = rows.concat(r.rows); drawRows(); more.style.display = r.more ? '' : 'none';
  } }, '더 보기');
  const csv = () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const school = res.schools.find((s) => s.id === res.school)?.name || state.me?.schoolName || '';
    download(`변경기록_${school}_${auditF.email || '전체'}.csv`, '﻿' + [['학교', '시각(한국)', '이름', '아이디', '작업', '메뉴', '내용'].map(q).join(','), ...rows.map((a) => [school, kst(a.at), a.name, a.email, ACT[a.action] || a.action, a.module ? a.module.split(',').map((m) => MODULES[m]?.label || m).join(' ') : '', a.action === 'delete' ? '' : a.detail].map(q).join(','))].join('\n'), 'text/csv');
  };
  const mods = [...new Set(Object.keys(MODULES))].filter((m) => MODULES[m].space !== 'desk' && MODULES[m].space !== 'market');
  clear(root,
    h('div', { class: 'toolbar wrap' },
      res.schools.length > 1 ? h('select', { title: '학교', onchange: (e) => set('school', e.target.value) }, res.schools.map((s) => h('option', { value: s.id, selected: s.id === res.school }, `🏫 ${s.name}`))) : null,
      h('select', { title: '아이디', onchange: (e) => set('email', e.target.value) }, h('option', { value: '' }, `👤 모든 사용자 (${res.users.length}명)`),
        res.users.map((u) => h('option', { value: u.email || '', selected: (u.email || '') === auditF.email }, `${label(u)} · ${u.n}건`))),
      h('select', { title: '작업', onchange: (e) => set('action', e.target.value) }, h('option', { value: '' }, '모든 작업'), Object.entries(ACT).map(([k, v]) => h('option', { value: k, selected: k === auditF.action }, v))),
      h('select', { title: '메뉴', onchange: (e) => set('module', e.target.value) }, h('option', { value: '' }, '모든 메뉴'), mods.map((m) => h('option', { value: m, selected: m === auditF.module }, MODULES[m].label))),
      auditF.email || auditF.action || auditF.module ? h('button', { class: 'btn small', onclick: () => { auditF.email = ''; auditF.action = ''; auditF.module = ''; reload(); } }, '거르기 해제') : null,
      h('span', { class: 'grow' }), h('span', { class: 'muted small' }, `${rows.length}건${res.more ? '+' : ''}`),
      h('button', { class: 'btn', onclick: csv }, 'CSV')),
    !auditF.email && res.users.length ? h('div', { class: 'note-chips' }, res.users.slice(0, 30).map((u) => h('button', { class: 'chip-btn', title: `${u.email} · 마지막 ${kst(u.last)}`, onclick: () => set('email', u.email || '') },
      u.name || u.email || '-', u.role ? h('span', { class: 'muted small' }, ` ${ROLE_KO[u.role] || u.role}`) : null, h('span', { class: 'cnt' }, u.n)))) : null,
    res.full ? null : h('p', { class: 'alert warn' }, '플랫폼 운영자 보기: 이 학교의 관리자가 아니므로 누가·언제·어느 메뉴만 보이고 내용은 숨깁니다.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['시각(한국)', '사용자(아이디)', '작업', '메뉴', '내용'].map((t) => h('th', {}, t)))), tbody)),
    rows.length ? null : h('p', { class: 'muted' }, '조건에 맞는 변경 기록이 없습니다.'),
    more,
    h('p', { class: 'hint' }, '학교마다 따로 쌓이고, 아이디(이메일)별로 몇 건을 바꿨는지 볼 수 있습니다. 여러 학교의 관리자라면 위에서 학교를 고르세요. 개인 공간(Deskterior) 기록은 남기지 않습니다.'));
}

async function backup(root) {
  clear(root,
    h('p', { class: 'hint' }, '모든 기록을 JSON 파일로 내려받습니다. 비밀번호는 암호화된 상태로 저장됩니다. 한 달에 한 번 정도 내려받아 드라이브에 보관하길 권장합니다.'),
    h('button', { class: 'btn primary', onclick: async () => {
      const data = await api('/api/admin/export');
      download(`온라인교무실_백업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1));
    } }, '백업 내려받기'));
}
