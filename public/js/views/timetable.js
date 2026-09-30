// 시간표: 표 모양 그대로 보기/편집. 같은 시간에 같은 학급이 두 시간표에 있으면 표시
import { h, api, clear } from '../ui.js';
import { state, canEdit } from '../state.js';
import { openRecordForm } from '../form.js';

const DEFAULT_GRID = () => ({ days: ['월', '화', '수', '목', '금'], periods: ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시'], cells: Array.from({ length: 6 }, () => Array(5).fill('')) });
let kindFilter = '';

export async function timetableView(root) {
  const rows = await api(`/api/records/timetables?year=${state.year}`);
  render(root, rows);
}

// "3-1과" 처럼 칸에 적힌 학급 찾기 (전담 시간표끼리 겹침 확인용)
function classesIn(text) {
  return [...String(text).matchAll(/(\d)-(\d)/g)].map((m) => `${m[1]}-${m[2]}`);
}

function conflicts(rows) {
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
  const edit = (r) => openRecordForm('timetables', r, { extra: gridEditor, onSaved: reload });
  const clash = conflicts(rows);
  const shown = rows.filter((r) => !kindFilter || r.data.kind === kindFilter);
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, ['', '전담', '학급', '기타'].map((k) => h('button', { class: kindFilter === k ? 'on' : '', onclick: () => { kindFilter = k; render(root, rows); } }, k || '전체'))),
      h('span', { class: 'grow' }),
      canEdit('timetables') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('timetables', null, { defaults: { kind: '전담', semester: '연간' }, extra: gridEditor, onSaved: reload }) }, '+ 시간표') : null),
    clash.size ? h('p', { class: 'alert warn' }, '⚠ 빨간 칸: 같은 학기·요일·교시에 같은 학급이 두 전담 시간표에 들어 있습니다.') : null,
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
    }), shown.length ? null : h('p', { class: 'muted' }, '시간표가 없습니다.')));
}
