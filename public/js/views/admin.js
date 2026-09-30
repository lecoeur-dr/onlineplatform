// 관리자: 사용자 승인 · 설정 · 엑셀 가져오기 · 연도 복사 · 변경 기록 · 백업
import { MODULES, ROLES, DEFAULT_LISTS } from '../modules.js';
import { h, api, clear, toast, confirmBox, loadScript, download } from '../ui.js';
import { state } from '../state.js';
import { parseWorkbook, guessYear } from '../importer.js';

let tab = 'users';
const TABS = { users: '사용자', settings: '설정', import: '엑셀 가져오기', copy: '연도 복사', audit: '변경 기록', backup: '백업' };

export async function adminView(root, refreshApp) {
  const body = h('div', {});
  clear(root,
    h('div', { class: 'seg tabs' }, Object.entries(TABS).map(([k, v]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; adminView(root, refreshApp); } }, v))),
    body);
  await ({ users, settings, import: importTab, copy, audit, backup })[tab](body, refreshApp);
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

  clear(root,
    pending.length ? h('p', { class: 'alert warn' }, `승인 대기 ${pending.length}명 — 권한을 '교직원'으로 바꾸면 바로 사용할 수 있습니다.`) : null,
    h('p', { class: 'hint' }, '선생님이 구글 계정으로 처음 로그인하면 "승인대기"로 등록됩니다. 미리 이메일을 등록해 두면 첫 로그인부터 바로 사용할 수 있습니다.'),
    form,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['이메일', '이름', '부서', '권한', '최근 로그인', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((u) => h('tr', { class: u.role === 'pending' ? 'hl' : '' },
        h('td', {}, u.email),
        h('td', {}, h('input', { value: u.name, onchange: (e) => update(u.email, { name: e.target.value }) })),
        h('td', {}, h('input', { value: u.dept, onchange: (e) => update(u.email, { dept: e.target.value }) })),
        h('td', {}, h('select', { onchange: (e) => update(u.email, { role: e.target.value }).then(() => users(root)) },
          Object.entries(ROLES).map(([k, v]) => h('option', { value: k, selected: k === u.role }, v)))),
        h('td', { class: 'small' }, u.last_login || '-'),
        h('td', {}, u.email === state.me.email ? null : h('button', { class: 'link-btn danger', onclick: async () => {
          if (await confirmBox(`${u.email} 사용자를 삭제할까요?`)) { await api(`/api/admin/users/${encodeURIComponent(u.email)}`, { method: 'DELETE' }); users(root); }
        } }, '삭제'))))))));
}

async function settings(root, refreshApp) {
  const s = state.settings;
  const LABELS = { depts: '부서', places: '장소', classes: '학급', programs: '특별수업 프로그램', eventCategories: '일정 분류' };
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
    h('small', { class: 'hint' }, `학년도 ${s.currentYear} = ${s.currentYear}년 1월 ~ ${s.currentYear + 1}년 2월. 선생님들이 처음 들어왔을 때 보이는 연도입니다.`)),
  h('div', { class: 'lists' }, Object.keys(DEFAULT_LISTS).map((k) => h('div', { class: 'row' },
    h('label', {}, `${LABELS[k]} 목록 (한 줄에 하나)`),
    h('textarea', { name: k, rows: 8, value: (s.lists[k] || []).join('\n') })))),
  h('div', {}, h('button', { class: 'btn primary' }, '설정 저장')));
  clear(root, form);
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

async function audit(root) {
  const rows = await api('/api/admin/audit');
  const ACT = { create: '추가', update: '수정', delete: '삭제', reveal: '비밀번호 보기', import: '가져오기', settings: '설정', user: '사용자', 'copy-year': '연도 복사', export: '백업', observe: '참관 신청', unobserve: '참관 취소' };
  clear(root, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ['시각(UTC)', '사용자', '작업', '메뉴', '내용'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map((a) => h('tr', {},
      h('td', { class: 'nowrap small' }, a.at),
      h('td', {}, a.name || a.email || ''),
      h('td', {}, ACT[a.action] || a.action),
      h('td', {}, a.module ? a.module.split(',').map((m) => MODULES[m]?.label || m).join(', ') : ''),
      h('td', { class: 'small' }, a.detail && a.action !== 'delete' ? a.detail : '')))))));
}

async function backup(root) {
  clear(root,
    h('p', { class: 'hint' }, '모든 기록을 JSON 파일로 내려받습니다. 비밀번호는 암호화된 상태로 저장됩니다. 한 달에 한 번 정도 내려받아 드라이브에 보관하길 권장합니다.'),
    h('button', { class: 'btn primary', onclick: async () => {
      const data = await api('/api/admin/export');
      download(`온라인교무실_백업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1));
    } }, '백업 내려받기'));
}
