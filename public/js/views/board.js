// 자유 표: 모양이 제각각인 표(신발장, 에듀테크 현황 등)를 시트처럼 보기/편집
import { h, api, clear, toast, confirmBox, modal } from '../ui.js';
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
      h('div', { class: 'seg' }, [['', '전체'], ['전체 공개', '👥 전체 공개'], ['나만 보기', '🔒 나만 보기']].map(([v, l]) => h('button', { class: (render.f || '') === v ? 'on' : '', onclick: () => { render.f = v; render(root, list, openId); } }, l))),
      editable ? h('button', { class: 'btn primary', onclick: () => newBoard(reload) }, '+ 자유 표') : null),
    list.filter((b) => !render.f || (b.data.visibility || '전체 공개') === render.f).map((b) => boardCard(root, list, b, editable, reload, openId === b.id)),
    list.length ? null : h('p', { class: 'muted' }, '자유 표가 없습니다.'));
}

function newBoard(reload) {
  const title = h('input', { placeholder: '예) 신발장 배치, 에듀테크 기기 현황' });
  let vis = '전체 공개';
  const segEl = h('div', { class: 'seg' });
  const paint = () => clear(segEl, [['전체 공개', '👥 전체 공개 (교직원 모두 보기·편집)'], ['나만 보기', '🔒 나만 보기 (나만 보기·편집)']].map(([v, l]) => h('button', { type: 'button', class: vis === v ? 'on' : '', onclick: () => { vis = v; paint(); } }, l)));
  paint();
  modal('🧮 자유 표 만들기', h('div', { class: 'form' }, h('div', { class: 'row' }, h('label', {}, '제목'), title), h('div', { class: 'row' }, h('label', {}, '공개 범위'), segEl)), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      if (!title.value.trim()) { toast('제목을 넣어 주세요.', 'error'); return; }
      try { await api('/api/records/boards', { method: 'POST', body: { year: state.year, data: { title: title.value.trim(), visibility: vis, rows: Array.from({ length: 5 }, () => Array(5).fill('')), merges: [] } } }); close(); reload(); } catch (e) { toast(e.message, 'error'); }
    } }, '만들기'),
  ]);
}

const isMine = (b) => !b.createdBy || b.createdBy === state.account?.email || b.createdBy === state.me?.email;

function boardCard(root, list, b, editable, reload, startEditing) {
  let editing = startEditing;
  const card = h('details', { class: 'card board-card', open: startEditing || list.length <= 3 });
  const draw = () => {
    const snapshot = JSON.parse(JSON.stringify(b.data));
    const save = async () => {
      try { Object.assign(b, await api(`/api/records/boards/${b.id}`, { method: 'PUT', body: { data: b.data, version: b.version } })); toast('저장했습니다.'); editing = false; draw(); }
      catch (e) { toast(e.message, 'error'); }
    };
    const rows = b.data.rows;
    clear(card,
      h('summary', {}, h('strong', {}, b.data.title), ' ', b.data.visibility === '나만 보기' ? h('span', { class: 'tag warn' }, '🔒 나만 보기') : h('span', { class: 'tag ghost' }, '👥 전체 공개'),
        b.data.note ? h('span', { class: 'muted' }, ` · ${b.data.note}`) : null, h('span', { class: 'muted' }, ` (${rows.length}줄)`)),
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
          isMine(b) ? h('button', { class: 'btn small', onclick: async () => {
            const next = b.data.visibility === '나만 보기' ? '전체 공개' : '나만 보기';
            if (!(await confirmBox(next === '나만 보기' ? `'${b.data.title}' 표를 나만 보도록 바꿀까요? 다른 선생님 화면에서 사라집니다.` : `'${b.data.title}' 표를 교직원 모두에게 공개할까요?`))) return;
            try { Object.assign(b, await api(`/api/records/boards/${b.id}`, { method: 'PUT', body: { data: { ...b.data, visibility: next }, version: b.version } })); toast('공개 범위를 바꿨습니다.'); draw(); } catch (e) { toast(e.message, 'error'); }
          } }, b.data.visibility === '나만 보기' ? '👥 전체 공개로' : '🔒 나만 보기로') : null,
          h('button', { class: 'btn small danger ghost', onclick: async () => { if (await confirmBox(`'${b.data.title}' 표를 삭제할까요?`)) { await api(`/api/records/boards/${b.id}`, { method: 'DELETE' }); reload(); } } }, '삭제')]) : null,
      h('div', { class: 'table-wrap' }, boardTable(b, editing)));
  };
  draw();
  return card;
}
