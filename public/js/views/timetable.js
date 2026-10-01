// 시간표: 표 모양 그대로 보기/편집. 같은 시간에 같은 학급이 두 시간표에 있으면 표시
import { TIMETABLE_KINDS } from '../modules.js';
import { h, api, clear, addDays, today, fmtDate, DOW } from '../ui.js';
import { state, canEdit, remember } from '../state.js';
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

export async function timetableView(root) {
  const rows = await api(`/api/records/timetables?year=${state.year}`);
  render(root, sortTimetables(rows));
}

export function editTimetable(r, reload, defaults) {
  return openRecordForm('timetables', r, { extra: gridEditor, onSaved: reload, defaults });
}

// 한눈에: 줄 = 시간표, 칸 = 요일×교시
export function glanceTable(rows, { days = ['월', '화', '수', '목', '금'], onOpen, clash = new Set() } = {}) {
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
          return Array.from({ length: periods }, (_, pi) => h('td', { class: `${pi === 0 ? 'day-sep' : ''} ${clash.has(`${r.id}|${pi}|${di}`) ? 'clash' : ''}` }, di >= 0 ? g.cells[pi]?.[di] || '' : ''));
        }));
    }))));
}

// "3-1과" 처럼 칸에 적힌 학급 찾기 (전담 시간표끼리 겹침 확인용)
function classesIn(text) {
  return [...String(text).matchAll(/(\d)-(\d)/g)].map((m) => `${m[1]}-${m[2]}`);
}

export function conflicts(rows) {
  const seen = {};
  const out = new Set();
  for (const r of rows) {
    if (r.data.kind === '학급') continue;
    const g = r.data.grid;
    if (!g) continue;
    g.cells.forEach((row, pi) => row.forEach((txt, di) => {
      for (const cls of classesIn(txt)) {
        const key = `${r.data.semester || ''}|${g.days[di]}|${g.periods[pi]}|${cls}`;
        if (seen[key] && seen[key] !== r.id) { out.add(`${r.id}|${pi}|${di}`); out.add(seen[key].split('#')[0] + `|${seen[key].split('#')[1]}`); }
        else seen[key] = `${r.id}#${pi}|${di}`;
      }
    }));
  }
  return out;
}

function gridEditor(data, editable) {
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

function render(root, rows) {
  const reload = () => timetableView(root);
  const edit = (r) => editTimetable(r, reload);
  const clash = conflicts(rows);
  const kind = remember('tt_kind') || '';
  const mode = remember('tt_mode') || 'glance';
  const shown = rows.filter((r) => !kind || (r.data.kind || '기타') === kind);
  const set = (k, v) => { remember(k, v); render(root, rows); };
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, [['glance', '한눈에'], ['cards', '카드'], ['neis', '나이스 주간']].map(([v, l]) => h('button', { class: mode === v ? 'on' : '', onclick: () => set('tt_mode', v) }, l))),
      mode === 'neis' ? null : h('div', { class: 'seg' }, ['', ...TIMETABLE_KINDS].map((k) => h('button', { class: kind === k ? 'on' : '', onclick: () => set('tt_kind', k) }, k || '전체',
        h('span', { class: 'cnt' }, k ? rows.filter((r) => (r.data.kind || '기타') === k).length : rows.length)))),
      h('span', { class: 'grow' }),
      canEdit('timetables') && mode !== 'neis' ? h('button', { class: 'btn primary', onclick: () => editTimetable(null, reload, { kind: kind || '학급', semester: '연간' }) }, '+ 시간표') : null),
    mode === 'neis' ? neisWeek(h('div', {})) :
    clash.size ? h('p', { class: 'alert warn' }, '⚠ 빨간 칸: 같은 학기·요일·교시에 같은 학급이 두 전담 시간표에 들어 있습니다.') : null,
    mode === 'neis' ? null : !shown.length ? h('p', { class: 'muted' }, '시간표가 없습니다.') :
    mode === 'glance' ? [glanceTable(shown, { onOpen: edit, clash }), h('p', { class: 'hint' }, '시간표 이름을 누르면 수정합니다. 순서: 학급(1학년부터) → 전담 → 특별실 → 외부강의')] :
    h('div', { class: 'cards' }, shown.map((r) => {
      const g = r.data.grid || DEFAULT_GRID();
      return h('div', { class: 'card tt-card' },
        h('div', { class: 'card-head' },
          h('div', {}, h('strong', {}, r.data.title), ' ', h('span', { class: 'tag' }, r.data.kind || ''), ' ', r.data.semester ? h('span', { class: 'tag ghost' }, r.data.semester) : null),
          h('button', { class: 'link-btn', onclick: () => edit(r) }, canEdit('timetables') ? '수정' : '보기')),
        r.data.note ? h('p', { class: 'muted' }, r.data.note) : null,
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
