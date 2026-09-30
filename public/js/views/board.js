// 자유 표: 모양이 제각각인 표(신발장, 에듀테크 현황 등)를 시트처럼 보기/편집
import { h, api, clear, toast, confirmBox } from '../ui.js';
import { state, canEdit } from '../state.js';

export async function boardView(root) {
  const rows = await api(`/api/records/boards?year=${state.year}`);
  render(root, rows);
}

function spanMap(merges = []) {
  const skip = new Set();
  const start = {};
  for (const m of merges) {
    start[`${m.r},${m.c}`] = m;
    for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) skip.add(`${r},${c}`);
  }
  return { skip, start };
}

function boardTable(b, editing) {
  const rows = b.data.rows || [];
  const { skip, start } = spanMap(b.data.merges);
  return h('table', { class: `board ${editing ? 'editing' : ''}` }, h('tbody', {}, rows.map((row, r) => h('tr', {}, row.map((v, c) => {
    if (skip.has(`${r},${c}`)) return null;
    const m = start[`${r},${c}`];
    const attrs = { rowspan: m?.rs > 1 ? m.rs : null, colspan: m?.cs > 1 ? m.cs : null };
    if (typeof v === 'boolean') {
      return h('td', { ...attrs, class: 'center' }, h('input', { type: 'checkbox', checked: v, disabled: !editing, onchange: (e) => { rows[r][c] = e.target.checked; } }));
    }
    if (editing) return h('td', attrs, h('textarea', { rows: 1, value: v ?? '', oninput: (e) => { rows[r][c] = e.target.value; } }));
    return h('td', { ...attrs, class: 'pre' }, linkify(v));
  })))));
}

function linkify(v) {
  const s = String(v ?? '');
  const m = s.match(/https?:\/\/\S+/);
  if (!m) return s;
  const i = s.indexOf(m[0]);
  return [s.slice(0, i), h('a', { href: m[0], target: '_blank', rel: 'noopener' }, '링크'), s.slice(i + m[0].length)];
}

function render(root, list, openId = null) {
  const reload = () => boardView(root);
  const editable = canEdit('boards');
  clear(root,
    h('div', { class: 'toolbar' },
      h('span', { class: 'muted' }, '시트 모양 그대로 옮긴 표입니다. 칸 수정, 줄·칸 추가가 가능합니다.'),
      h('span', { class: 'grow' }),
      editable ? h('button', { class: 'btn primary', onclick: async () => {
        const title = prompt('표 제목');
        if (!title) return;
        await api('/api/records/boards', { method: 'POST', body: { year: state.year, data: { title, rows: Array.from({ length: 5 }, () => Array(5).fill('')), merges: [] } } });
        reload();
      } }, '+ 자유 표') : null),
    list.map((b) => boardCard(root, list, b, editable, reload, openId === b.id)),
    list.length ? null : h('p', { class: 'muted' }, '자유 표가 없습니다.'));
}

function boardCard(root, list, b, editable, reload, startEditing) {
  let editing = startEditing;
  const card = h('details', { class: 'card board-card', open: startEditing || list.length <= 3 });
  const draw = () => {
    const snapshot = JSON.parse(JSON.stringify(b.data));
    const save = async () => {
      try { await api(`/api/records/boards/${b.id}`, { method: 'PUT', body: { data: b.data } }); toast('저장했습니다.'); editing = false; draw(); }
      catch (e) { toast(e.message, 'error'); }
    };
    const rows = b.data.rows;
    clear(card,
      h('summary', {}, h('strong', {}, b.data.title), b.data.note ? h('span', { class: 'muted' }, ` · ${b.data.note}`) : null, h('span', { class: 'muted' }, ` (${rows.length}줄)`)),
      editable ? h('div', { class: 'row-actions' }, editing
        ? [
          h('button', { class: 'btn small', onclick: () => { rows.push(Array(rows[0]?.length || 1).fill('')); draw(); } }, '+ 줄'),
          h('button', { class: 'btn small', onclick: () => { rows.forEach((r) => r.push('')); draw(); } }, '+ 칸'),
          h('button', { class: 'btn small', disabled: rows.length <= 1, onclick: () => { rows.pop(); b.data.merges = (b.data.merges || []).filter((m) => m.r + m.rs <= rows.length); draw(); } }, '- 마지막 줄'),
          h('button', { class: 'btn small', onclick: () => { const t = prompt('제목', b.data.title); if (t) { b.data.title = t; draw(); } } }, '제목 변경'),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn small', onclick: () => { b.data = snapshot; editing = false; draw(); } }, '취소'),
          h('button', { class: 'btn small primary', onclick: save }, '저장')]
        : [
          h('button', { class: 'btn small', onclick: () => { editing = true; draw(); } }, '편집'),
          h('button', { class: 'btn small danger ghost', onclick: async () => { if (await confirmBox(`'${b.data.title}' 표를 삭제할까요?`)) { await api(`/api/records/boards/${b.id}`, { method: 'DELETE' }); reload(); } } }, '삭제')]) : null,
      h('div', { class: 'table-wrap' }, boardTable(b, editing)));
  };
  draw();
  return card;
}
