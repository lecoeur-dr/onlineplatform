// 시간표: 표 모양 그대로 보기/편집. 같은 시간에 같은 학급이 두 시간표에 있으면 표시
import { TIMETABLE_KINDS } from '../modules.js';
import { h, api, clear, addDays, today, fmtDate, DOW, modal, toast } from '../ui.js';
import { state, canEdit, remember, isAdmin } from '../state.js';
import { openRecordForm } from '../form.js';

export const DEFAULT_GRID = () => ({ days: ['월', '화', '수', '목', '금'], periods: ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'], cells: Array.from({ length: 6 }, () => Array(5).fill('')) });

// 정렬: 학급(1학년부터, 설정의 학급 순서) → 전담 → 특별실 → 외부강의 → 기타
export function sortTimetables(rows) {
  const classes = state.settings?.lists?.classes || [];
  const ci = (t) => { const i = classes.indexOf(t); return i < 0 ? 999 : i; };
  return rows.slice().sort((a, b) => {
    const k = TIMETABLE_KINDS.indexOf(a.data.kind || '기타') - TIMETABLE_KINDS.indexOf(b.data.kind || '기타');
    if (k) return k;
    if (a.data.kind === '학급') return ci(a.data.title) - ci(b.data.title) || String(a.data.title).localeCompare(String(b.data.title), 'ko', { numeric: true });
    return (a.sort || 0) - (b.sort || 0);
  });
}

// ---------- 적용 기간: 1년 · 1학기 · 2학기 · 직접 지정 + 빠지는 날 ----------
const febEnd = (y) => `${y}-02-${new Date(y, 2, 0).getDate()}`;
export function presetRange(kind, year = state.year) {
  const y = Number(year);
  if (kind === '1학기') return { start: `${y}-03-01`, end: `${y}-08-31` };
  if (kind === '2학기') return { start: `${y}-09-01`, end: febEnd(y + 1) };
  return { start: `${y}-03-01`, end: febEnd(y + 1) }; // 1년(연간)
}
export function periodRange(r) {
  const d = r.data || {};
  const base = presetRange(d.semester === '연간' ? '1년' : d.semester, r.year || state.year);
  return { start: d.start || base.start, end: d.end || base.end };
}
export const excludedOn = (r, date) => (r.data.excludes || []).find((x) => x.from && date >= x.from && date <= (x.to || x.from));
export function activeOn(r, date) {
  const { start, end } = periodRange(r);
  return date >= start && date <= end && !excludedOn(r, date);
}
const md = (x) => { const [, m, d] = String(x).split('-').map(Number); return `${m}/${d}`; };
export const periodLabel = (r) => { const { start, end } = periodRange(r); const n = (r.data.excludes || []).length; return `${md(start)}~${md(end)}${n ? ` · 빠지는 날 ${n}` : ''}`; };

export async function timetableView(root) {
  const rows = await api(`/api/records/timetables?year=${state.year}`);
  render(root, sortTimetables(rows));
}

export function editTimetable(r, reload, defaults) {
  if (r && (!r.data.semester || r.data.semester === '연간')) r = { ...r, data: { ...r.data, semester: '1년' } }; // 예전 '연간' = 1년
  return openRecordForm('timetables', r, { extra: ttExtra, onSaved: reload, defaults });
}

// 시간표 입력 창의 아래쪽: 적용 기간(시작·끝) + 빠지는 날 + 시간표 칸
function ttExtra(data, editable) {
  let start = data.start || '';
  let end = data.end || '';
  const excludes = JSON.parse(JSON.stringify(data.excludes || []));
  const startIn = h('input', { type: 'date', value: start, disabled: !editable, oninput: (e) => { start = e.target.value; } });
  const endIn = h('input', { type: 'date', value: end, disabled: !editable, oninput: (e) => { end = e.target.value; } });
  const fill = (kind) => { if (kind === '직접 지정') return; const p = presetRange(kind); start = p.start; end = p.end; startIn.value = start; endIn.value = end; };
  if (!start || !end) fill(data.semester === '연간' || !data.semester ? '1년' : data.semester);
  setTimeout(() => { const sel = document.getElementById('f_semester'); if (sel) sel.addEventListener('change', () => fill(sel.value)); }, 0);
  const exBox = h('div', {});
  const drawEx = () => clear(exBox, excludes.length ? h('ul', { class: 'ex-list' }, excludes.map((x, i) => h('li', {},
    h('input', { type: 'date', value: x.from || '', disabled: !editable, oninput: (e) => { x.from = e.target.value; } }), ' ~ ',
    h('input', { type: 'date', value: x.to || '', disabled: !editable, oninput: (e) => { x.to = e.target.value; } }),
    h('input', { value: x.reason || '', placeholder: '사유 (예: 현장체험학습, 시험 주간)', disabled: !editable, oninput: (e) => { x.reason = e.target.value; } }),
    editable ? h('button', { type: 'button', class: 'icon-btn small', onclick: () => { excludes.splice(i, 1); drawEx(); } }, '✕') : null))) : h('p', { class: 'muted small' }, '빠지는 날이 없습니다.'),
    editable ? h('button', { type: 'button', class: 'btn small', onclick: () => { excludes.push({ from: today(), to: '', reason: '' }); drawEx(); } }, '+ 빠지는 날') : null);
  drawEx();
  const grid = gridEditor(data, editable);
  const wrap = h('div', { class: 'tt-extra' },
    h('div', { class: 'card tt-period' }, h('strong', {}, '📆 적용 기간'),
      h('div', { class: 'wz-row' }, h('label', {}, '시작 ', startIn), h('label', {}, '끝 ', endIn),
        editable ? ['1년', '1학기', '2학기'].map((k) => h('button', { type: 'button', class: 'btn small', onclick: () => fill(k) }, k)) : null),
      h('div', { class: 'muted small' }, '1년 = 3월 1일~다음 해 2월 말, 1학기 = 3월~8월, 2학기 = 9월~2월 (학교 학사일정에 맞게 날짜를 고치세요).'),
      h('strong', {}, '🚫 빠지는 날 (이 기간에는 이 시간표를 쓰지 않음)'), exBox),
    grid);
  wrap._read = () => ({ ...grid._read(), start, end, excludes: excludes.filter((x) => x.from) });
  return wrap;
}

// ---------- ⚙ 학년반 · 전담 · 특별실 설정 + 빠진 시간표 만들기 ----------
function setupModal(rows, reload) {
  const lists = state.settings?.lists || {};
  const classes = (lists.classes || []).slice();
  const counts = {};
  for (const c of classes) { const m = c.match(/^(\d)-(\d+)$/); if (m) counts[m[1]] = Math.max(counts[m[1]] || 0, Number(m[2])); }
  const others = classes.filter((c) => !/^\d-\d+$/.test(c));
  const gradeInputs = [1, 2, 3, 4, 5, 6].map((g) => h('label', { class: 'grade-in' }, `${g}학년 `, h('input', { type: 'number', min: 0, max: 20, value: counts[g] || 0, 'data-g': g }), ' 반'));
  const otherIn = h('input', { value: others.join(', '), placeholder: '예) 하나반, 특수학급' });
  const specIn = h('textarea', { rows: 3, value: (lists.specialists || []).join('\n'), placeholder: '한 줄에 하나: 과학 전담\n영어 전담\n체육 전담' });
  const roomIn = h('textarea', { rows: 3, value: (lists.places || []).join('\n'), placeholder: '한 줄에 하나: 과학실\nAI교실\n체육관' });
  const admin = isAdmin();
  if (!admin) [...gradeInputs.map((l) => l.querySelector('input')), otherIn, specIn, roomIn].forEach((x) => { x.disabled = true; });
  const read = () => {
    const cls = [];
    for (const l of gradeInputs) { const i = l.querySelector('input'); for (let k = 1; k <= Number(i.value || 0); k++) cls.push(`${i.dataset.g}-${k}`); }
    return { classes: [...cls, ...otherIn.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)], specialists: specIn.value.split('\n').map((x) => x.trim()).filter(Boolean), places: roomIn.value.split('\n').map((x) => x.trim()).filter(Boolean) };
  };
  const have = new Set(rows.map((r) => `${r.data.kind}|${r.data.title}`));
  const missing = (v) => [...v.classes.map((t) => ['학급', t]), ...v.specialists.map((t) => ['전담', t]), ...v.places.map((t) => ['특별실', t])].filter(([k, t]) => !have.has(`${k}|${t}`));
  const preview = h('p', { class: 'small' });
  const paint = () => { const m = missing(read()); preview.textContent = m.length ? `시간표가 없는 곳 ${m.length}개: ${m.map(([, t]) => t).slice(0, 12).join(', ')}${m.length > 12 ? ' …' : ''}` : '✓ 모든 학급·전담·특별실에 시간표가 있습니다.'; };
  [...gradeInputs.map((l) => l.querySelector('input')), otherIn, specIn, roomIn].forEach((x) => x.addEventListener('input', paint));
  paint();
  modal('⚙ 학년반 · 전담 · 특별실 설정', h('div', { class: 'form' },
    h('h4', {}, '🏫 학년·반'), h('div', { class: 'grade-grid' }, gradeInputs), h('div', { class: 'row' }, h('label', {}, '그 밖의 학급'), otherIn),
    h('h4', {}, '👩‍🏫 전담 (교과 전담 시간표 이름)'), specIn,
    h('h4', {}, '🔬 특별실 (특별실 시간표·예약 장소)'), roomIn,
    preview,
    h('p', { class: 'hint' }, admin ? '저장하면 학교 설정의 학급·전담·장소 목록이 바뀝니다(특별실 예약·드롭다운에도 쓰임). [빠진 시간표 만들기]는 시간표가 없는 곳에 빈 시간표(1년)를 만듭니다.' : '학교 관리자만 바꿀 수 있습니다.')), admin ? [
    (close) => h('button', { class: 'btn', onclick: close }, '닫기'),
    (close) => h('button', { class: 'btn', onclick: async () => { await saveLists(read()); close(); reload(); } }, '설정만 저장'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const v = read();
      await saveLists(v);
      const m = missing(v);
      for (const [kind, title] of m) await api('/api/records/timetables', { method: 'POST', body: { data: { title, kind, semester: '1년', ...presetRange('1년'), grid: DEFAULT_GRID() }, year: state.year } });
      toast(m.length ? `빈 시간표 ${m.length}개를 만들었습니다. [표에서 바로 수정]으로 채우세요.` : '설정을 저장했습니다.'); close(); reload();
    } }, '저장 + 빠진 시간표 만들기'),
  ] : [(close) => h('button', { class: 'btn', onclick: close }, '닫기')], { wide: true });
}
async function saveLists(v) {
  const lists = { ...(state.settings.lists || {}), ...v };
  const s = await api('/api/admin/settings', { method: 'PUT', body: { lists } });
  state.settings.lists = s.lists || lists;
}

// ---------- ✏️ 표에서 바로 수정 (칸을 고치면 자동 저장) ----------
function sheetEditor(box, rows, reload) {
  let id = remember('tt_edit') || rows[0]?.id;
  if (!rows.some((r) => r.id === id)) id = rows[0]?.id;
  const r = rows.find((x) => x.id === id);
  if (!r) return clear(box, h('p', { class: 'muted' }, '시간표가 없습니다. [⚙ 학년반·전담·특별실 설정]에서 만들 수 있습니다.'));
  const g = r.data.grid ? JSON.parse(JSON.stringify(r.data.grid)) : DEFAULT_GRID();
  const st = h('span', { class: 'muted small' });
  let timer;
  const save = () => {
    st.textContent = '저장 대기…'; clearTimeout(timer);
    timer = setTimeout(async () => {
      try { Object.assign(r, await api(`/api/records/timetables/${r.id}`, { method: 'PUT', body: { data: { ...r.data, grid: g }, version: r.version } })); st.textContent = '✓ 자동 저장됨'; } catch (e) { st.textContent = ''; toast(e.message, 'error'); }
    }, 700);
  };
  const lists = state.settings?.lists || {};
  const sugg = r.data.kind === '학급' ? [...(lists.subjects || []), ...(lists.specialists || [])] : [...(lists.classes || [])];
  clear(box,
    h('div', { class: 'toolbar' },
      h('select', { onchange: (e) => { remember('tt_edit', e.target.value); sheetEditor(box, rows, reload); } }, rows.map((x) => h('option', { value: x.id, selected: x.id === id }, `${x.data.title} · ${x.data.kind || ''}`))),
      h('span', { class: 'tag ghost' }, `${r.data.semester || '1년'} · ${periodLabel(r)}`), st, h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => editTimetable(r, reload) }, '📆 기간·빠지는 날·교시'),
      h('button', { class: 'btn', onclick: () => { const i = rows.indexOf(r); remember('tt_edit', rows[(i + 1) % rows.length].id); sheetEditor(box, rows, reload); } }, '다음 시간표 ▶')),
    h('datalist', { id: 'tt-sugg' }, sugg.map((x) => h('option', { value: x }))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'tt tt-sheet' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), g.days.map((d) => h('th', {}, d)))),
      h('tbody', {}, g.periods.map((p, pi) => h('tr', {}, h('th', {}, p), g.days.map((_, di) => h('td', {}, h('input', { value: g.cells[pi]?.[di] || '', list: 'tt-sugg', disabled: !canEdit('timetables'),
        oninput: (e) => { g.cells[pi][di] = e.target.value; save(); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.closest('tr').nextElementSibling?.children[di + 1]?.querySelector('input')?.focus(); } } })))))))),
    h('p', { class: 'hint' }, `칸을 고치면 바로 저장됩니다. ${r.data.kind === '학급' ? '과목을 쓰세요(전담 과목은 목록에서 고를 수 있음).' : '"3-1"처럼 학급을 쓰면 같은 시간에 겹치는 전담·특별실을 빨간 칸으로 알려 줍니다.'} Enter = 아래 칸.`));
}

// 한눈에: 줄 = 시간표, 칸 = 요일×교시
export function glanceTable(rows, { days = ['월', '화', '수', '목', '금'], onOpen, clash = new Set(), soft = new Set() } = {}) {
  const periods = Math.max(6, ...rows.map((r) => r.data.grid?.periods?.length || 0));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'tt glance' },
    h('thead', {},
      h('tr', {}, h('th', { rowspan: 2, class: 'sticky-col' }, '시간표'), days.map((d) => h('th', { colspan: periods, class: 'day-sep' }, d))),
      h('tr', {}, days.map(() => Array.from({ length: periods }, (_, i) => h('th', { class: i === 0 ? 'day-sep' : '' }, i + 1))))),
    h('tbody', {}, rows.map((r) => {
      const g = r.data.grid || DEFAULT_GRID();
      return h('tr', {},
        h('th', { class: 'sticky-col click', onclick: () => onOpen?.(r), title: r.data.note || '' }, r.data.title, h('span', { class: 'tag small' }, r.data.kind || '')),
        days.map((d) => {
          const di = g.days.indexOf(d);
          return Array.from({ length: periods }, (_, pi) => h('td', { class: `${pi === 0 ? 'day-sep' : ''} ${clash.has(`${r.id}|${pi}|${di}`) ? 'clash' : ''} ${soft.has(`${r.id}|${pi}|${di}`) ? 'from-neis' : ''}` }, di >= 0 ? g.cells[pi]?.[di] || '' : ''));
        }));
    }))));
}

// "3-1과" 처럼 칸에 적힌 학급 찾기 (전담 시간표끼리 겹침 확인용)
function classesIn(text) {
  return [...String(text).matchAll(/(\d)-(\d)/g)].map((m) => `${m[1]}-${m[2]}`);
}

export function conflicts(rows) {
  // 같은 날에 쓰이는 시간표끼리만 넘겨받음 (기준일·적용 기간으로 미리 거름)
  const seen = {};
  const out = new Set();
  for (const r of rows) {
    if (r.data.kind === '학급') continue;
    const g = r.data.grid;
    if (!g) continue;
    g.cells.forEach((row, pi) => row.forEach((txt, di) => {
      for (const cls of classesIn(txt)) {
        const key = `${g.days[di]}|${g.periods[pi]}|${cls}`;
        if (seen[key] && seen[key] !== r.id) { out.add(`${r.id}|${pi}|${di}`); out.add(seen[key].split('#')[0] + `|${seen[key].split('#')[1]}`); }
        else seen[key] = `${r.id}#${pi}|${di}`;
      }
    }));
  }
  return out;
}

export function gridEditor(data, editable) {
  const grid = data.grid ? JSON.parse(JSON.stringify(data.grid)) : DEFAULT_GRID();
  const wrap = h('div', { class: 'grid-editor' });
  const draw = () => {
    clear(wrap,
      h('table', { class: 'tt' },
        h('thead', {}, h('tr', {}, h('th', {}, '구분'), grid.days.map((d, i) => h('th', {}, editable ? h('input', { value: d, oninput: (e) => { grid.days[i] = e.target.value; } }) : d)))),
        h('tbody', {}, grid.periods.map((p, pi) => h('tr', {},
          h('th', {}, editable ? h('input', { value: p, oninput: (e) => { grid.periods[pi] = e.target.value; } }) : p),
          grid.days.map((_, di) => h('td', {}, editable
            ? h('textarea', { rows: 1, value: grid.cells[pi]?.[di] ?? '', oninput: (e) => { grid.cells[pi][di] = e.target.value; } })
            : grid.cells[pi]?.[di] ?? '')))))),
      editable ? h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn small', onclick: () => { grid.periods.push(`${grid.periods.length + 1}교시`); grid.cells.push(Array(grid.days.length).fill('')); draw(); } }, '+ 교시'),
        h('button', { type: 'button', class: 'btn small', disabled: grid.periods.length <= 1, onclick: () => { grid.periods.pop(); grid.cells.pop(); draw(); } }, '- 교시'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { grid.days.push('토'); grid.cells.forEach((r) => r.push('')); draw(); } }, '+ 요일'),
        h('button', { type: 'button', class: 'btn small', disabled: grid.days.length <= 1, onclick: () => { grid.days.pop(); grid.cells.forEach((r) => r.pop()); draw(); } }, '- 요일')) : null);
  };
  draw();
  wrap._read = () => ({ grid });
  return wrap;
}

function render(root, all) {
  const reload = () => timetableView(root);
  const edit = (r) => editTimetable(r, reload);
  const kind = remember('tt_kind') || '';
  const mode = remember('tt_mode') || 'glance';
  const on = remember('tt_on') || '';
  const day = on || today();
  const rows = on === 'all' ? all : all.filter((r) => activeOn(r, day));
  const clash = on === 'all' ? new Set() : conflicts(rows);
  const shown = rows.filter((r) => !kind || (r.data.kind || '기타') === kind);
  const set = (k, v) => { remember(k, v); render(root, all); };
  const body = h('div', {});
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, [['glance', '한눈에'], ['cards', '카드'], ['edit', '✏️ 표에서 바로 수정'], ['neis', '나이스 주간']].map(([v, l]) => h('button', { class: mode === v ? 'on' : '', onclick: () => set('tt_mode', v) }, l))),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => setupModal(all, reload) }, '⚙ 학년반·전담·특별실'),
      canEdit('timetables') && mode !== 'neis' ? h('button', { class: 'btn primary', onclick: () => editTimetable(null, reload, { kind: kind || '학급', semester: '1년' }) }, '+ 시간표') : null),
    mode === 'neis' || mode === 'edit' ? null : h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, ['', ...TIMETABLE_KINDS].map((k) => h('button', { class: kind === k ? 'on' : '', onclick: () => set('tt_kind', k) }, k || '전체',
        h('span', { class: 'cnt' }, k ? rows.filter((r) => (r.data.kind || '기타') === k).length : rows.length)))),
      h('span', { class: 'grow' }),
      h('label', { class: 'inline small' }, '기준일 ', h('input', { type: 'date', value: on === 'all' ? '' : day, onchange: (e) => set('tt_on', e.target.value || '') })),
      h('button', { class: `btn small ${on === 'all' ? 'primary' : ''}`, onclick: () => set('tt_on', on === 'all' ? '' : 'all') }, on === 'all' ? '모든 기간 보는 중' : '모든 기간 보기')),
    body);
  if (mode === 'neis') return neisWeek(body);
  if (mode === 'edit') return sheetEditor(body, all, reload);
  const hidden = all.length - rows.length;
  clear(body,
    clash.size ? h('p', { class: 'alert warn' }, '⚠ 빨간 칸: 같은 요일·교시에 같은 학급이 두 전담·특별실 시간표에 들어 있습니다.') : null,
    on !== 'all' && hidden ? h('p', { class: 'muted small' }, `${fmtDate(day)} 기준으로 적용 기간이 아니거나 빠지는 날인 시간표 ${hidden}개는 숨겼습니다.`) : null,
    !shown.length ? h('p', { class: 'muted' }, '시간표가 없습니다. [⚙ 학년반·전담·특별실]에서 학급·전담·특별실을 정하고 빈 시간표를 한 번에 만들 수 있습니다.') :
    mode === 'glance' ? [glanceTable(shown, { onOpen: edit, clash }), h('p', { class: 'hint' }, '시간표 이름을 누르면 수정합니다. 순서: 학급(1학년부터) → 전담 → 특별실 → 외부강의')] :
    h('div', { class: 'cards' }, shown.map((r) => {
      const g = r.data.grid || DEFAULT_GRID();
      return h('div', { class: 'card tt-card' },
        h('div', { class: 'card-head' },
          h('div', {}, h('strong', {}, r.data.title), ' ', h('span', { class: 'tag' }, r.data.kind || ''), ' ', h('span', { class: 'tag ghost' }, `${r.data.semester || '1년'} · ${periodLabel(r)}`)),
          h('span', {}, h('button', { class: 'link-btn', onclick: () => { remember('tt_edit', r.id); set('tt_mode', 'edit'); } }, '✏️ 칸 수정'), ' ', h('button', { class: 'link-btn', onclick: () => edit(r) }, canEdit('timetables') ? '설정' : '보기'))),
        r.data.note ? h('p', { class: 'muted' }, r.data.note) : null,
        (r.data.excludes || []).length ? h('p', { class: 'muted small' }, '🚫 ', r.data.excludes.map((x) => `${md(x.from)}${x.to && x.to !== x.from ? `~${md(x.to)}` : ''}${x.reason ? ` ${x.reason}` : ''}`).join(', ')) : null,
        h('table', { class: 'tt' },
          h('thead', {}, h('tr', {}, h('th', {}, ''), g.days.map((d) => h('th', {}, d)))),
          h('tbody', {}, g.periods.map((p, pi) => h('tr', {}, h('th', {}, p),
            g.days.map((_, di) => h('td', { class: `pre ${clash.has(`${r.id}|${pi}|${di}`) ? 'clash' : ''}` }, g.cells[pi]?.[di] || '')))))));
    })));
}

// 나이스 학급 시간표 (주간). 학교가 나이스에 입력한 시간표를 그대로 보여 줌
const monday = (d) => { const [y, m, dd] = d.split('-').map(Number); const w = new Date(y, m - 1, dd).getDay(); return addDays(d, w === 0 ? 1 : 1 - w); };
function neisWeek(box, start = monday(today())) {
  const classes = (state.settings.lists.classes || []).filter((c) => /^\d-\d+$/.test(c));
  let cls = remember('tt_neis_cls');
  if (!classes.includes(cls)) cls = classes[0];
  const days = [0, 1, 2, 3, 4].map((i) => addDays(start, i));
  const out = h('div', {}, h('p', { class: 'muted' }, '나이스에서 불러오는 중…'));
  clear(box,
    h('div', { class: 'toolbar' },
      h('select', { 'aria-label': '학급', onchange: (e) => { remember('tt_neis_cls', e.target.value); neisWeek(box, start); } }, classes.map((c) => h('option', { value: c, selected: c === cls }, c))),
      h('button', { class: 'btn', onclick: () => neisWeek(box, addDays(start, -7)) }, '◀'),
      h('strong', {}, `${fmtDate(days[0])} ~ ${fmtDate(days[4])}`),
      h('button', { class: 'btn', onclick: () => neisWeek(box, addDays(start, 7)) }, '▶'),
      h('button', { class: 'btn', onclick: () => neisWeek(box) }, '이번 주')),
    out,
    h('p', { class: 'hint' }, '나이스(교육정보 개방포털)에 학교가 입력한 학급 시간표입니다. 수정은 나이스에서 하며, 비어 있으면 아직 나이스에 등록되지 않은 것입니다. "하나반"처럼 "학년-반" 형식이 아닌 학급은 조회할 수 없습니다.'));
  if (!state.settings.neis) { clear(out, h('p', { class: 'alert warn' }, '관리자 → 설정 → 나이스 연동에서 학교를 먼저 선택해야 합니다.')); return box; }
  if (!cls) { clear(out, h('p', { class: 'muted' }, '설정의 학급 목록에 "3-1" 형식의 학급이 없습니다.')); return box; }
  api(`/api/neis/timetable?cls=${encodeURIComponent(cls)}&from=${days[0]}&to=${days[4]}`).then((res) => {
    const rows = res.rows || [];
    const maxP = Math.max(6, ...rows.map((r) => r.period));
    const cell = (d, p) => rows.filter((r) => r.date === d && r.period === p).map((r) => r.subject).join(', ');
    const label = (x) => { const [y, m, dd] = x.split('-').map(Number); return `${m}/${dd}(${DOW[new Date(y, m - 1, dd).getDay()]})`; };
    clear(out, !rows.length ? h('p', { class: 'muted' }, '이 주의 나이스 시간표가 없습니다. (방학·휴일이거나 아직 등록 전)') :
      h('div', { class: 'table-wrap' }, h('table', { class: 'tt' },
        h('thead', {}, h('tr', {}, h('th', {}, cls), days.map((d) => h('th', { class: d === today() ? 'today' : '' }, label(d))))),
        h('tbody', {}, Array.from({ length: maxP }, (_, i) => h('tr', {}, h('th', {}, `${i + 1}교시`), days.map((d) => h('td', {}, cell(d, i + 1)))))))));
  }).catch((e) => clear(out, h('p', { class: 'alert error' }, e.message)));
  return box;
}
