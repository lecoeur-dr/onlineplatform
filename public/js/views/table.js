// 일반 표 화면: 모듈 규격대로 열을 만들고, 행을 누르면 수정
import { MODULES } from '../modules.js';
import { h, api, clear, toast, won, fmtDate } from '../ui.js';
import { state, canEdit } from '../state.js';
import { openRecordForm } from '../form.js';

const queries = {};

// opts.groupBy: 이 칸 값으로 묶어서 소계 표시 / opts.hide: 숨길 칸 / opts.rows: 미리 불러온 기록
// opts.embed: 다른 화면 안에 넣을 때(검색창·CSV 생략) / opts.defaults: 추가할 때 기본값
export async function tableView(root, moduleId, opts = {}) {
  const rows = opts.rows || await api(`/api/records/${moduleId}?year=${state.year}`);
  render(root, moduleId, rows, opts);
}

export function cellText(f, v, row) {
  if (f.computed) v = f.computed(row.data);
  if (v === undefined || v === null || v === '') return '';
  switch (f.type) {
    case 'money': return won(v);
    case 'date': return fmtDate(v);
    case 'bool': return v ? '✔' : '';
    case 'names': return (v || []).join(', ');
    case 'secret': return v ? '••••••' : '';
    default: return String(v);
  }
}

function render(root, moduleId, rows, opts = {}) {
  const def = MODULES[moduleId];
  const reload = opts.reload || (() => tableView(root, moduleId, { ...opts, rows: undefined }));
  const q = (queries[moduleId] || '').toLowerCase();
  const shown = q ? rows.filter((r) => JSON.stringify(r.data).toLowerCase().includes(q)) : rows;
  const hide = new Set(opts.hide || []);
  if (opts.groupBy) hide.add(opts.groupBy);
  const cols = def.fields.filter((f) => !hide.has(f.key) && (f.type !== 'names' || moduleId !== 'openClasses'));
  const editable = canEdit(moduleId);

  const cell = (f, r) => {
    const v = r.data[f.key];
    if (f.type === 'url' && v && /^https?:\/\//i.test(v)) return h('td', {}, h('a', { href: v, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, shortUrl(v)));
    if (f.type === 'bool' && editable) {
      return h('td', { class: 'center', onclick: (e) => e.stopPropagation() }, h('input', {
        type: 'checkbox', checked: !!v, 'aria-label': f.label,
        onchange: async (e) => {
          try { Object.assign(r, await api(`/api/records/${moduleId}/${r.id}`, { method: 'PUT', body: { data: { ...r.data, [f.key]: e.target.checked }, version: r.version } })); }
          catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
        },
      }));
    }
    if (f.type === 'secret') {
      const span = h('span', { class: 'mono' }, v ? '••••••' : '');
      return h('td', { onclick: (e) => e.stopPropagation() }, span, v ? h('button', {
        class: 'link-btn', onclick: async (e) => {
          try {
            const res = await api(`/api/records/${moduleId}/${r.id}/reveal`);
            span.textContent = res[f.key];
            e.target.replaceWith(h('button', { class: 'link-btn', onclick: () => { navigator.clipboard?.writeText(res[f.key]); toast('복사했습니다.'); } }, '복사'));
          } catch (err) { toast(err.message, 'error'); }
        },
      }, '보기') : null);
    }
    const t = cellText(f, v, r);
    return h('td', { class: `${f.type === 'textarea' ? 'pre' : ''} ${['money', 'number'].includes(f.type) ? 'num' : ''} ${f.type === 'date' ? 'nowrap' : ''}` }, t);
  };

  const sums = cols.filter((f) => f.sum);
  const total = (list, f) => list.reduce((a, r) => a + (Number(f.computed ? f.computed(r.data) : r.data[f.key]) || 0), 0);
  const foot = sums.length ? h('tfoot', {}, h('tr', {}, cols.map((f, i) => h('td', { class: f.sum ? 'num strong' : '' },
    f.sum ? won(total(shown, f)) : i === 0 ? `합계 (${shown.length}건)` : '')))) : null;
  const row = (r) => h('tr', { class: 'click', onclick: () => openRecordForm(moduleId, r, { onSaved: reload }) }, cols.map((f) => cell(f, r)));

  let body;
  if (!shown.length) body = h('tr', {}, h('td', { colspan: cols.length, class: 'muted center' }, '기록이 없습니다.'));
  else if (opts.groupBy) {
    const groups = new Map();
    for (const r of shown) {
      const k = r.data[opts.groupBy] || '(구분 없음)';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const gf = def.fields.find((f) => f.key === opts.groupBy);
    body = [...groups].map(([k, list]) => [
      h('tr', { class: 'group-row' }, h('td', { colspan: cols.length },
        h('strong', {}, k), h('span', { class: 'muted' }, ` · ${list.length}건`),
        sums.map((f) => h('span', { class: 'muted' }, ` · ${f.label} ${won(total(list, f))}`)),
        editable && !opts.noGroupAdd ? h('button', { class: 'link-btn', onclick: () => openRecordForm(moduleId, null, { defaults: { ...(opts.defaults || {}), [opts.groupBy]: k === '(구분 없음)' ? '' : k }, onSaved: reload }) }, `+ 이 ${gf?.label || '묶음'}에 추가`) : null)),
      list.map(row)]);
  } else body = shown.map(row);

  clear(root,
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: `${def.label} 검색`, value: queries[moduleId] || '', oninput: (e) => { queries[moduleId] = e.target.value; render(root, moduleId, rows, opts); const s = root.querySelector('input[type=search]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }),
      h('span', { class: 'muted' }, `${shown.length}건`),
      h('span', { class: 'grow' }),
      opts.embed ? null : h('button', { class: 'btn', onclick: () => exportCsv(def, shown) }, 'CSV 저장'),
      editable ? h('button', { class: 'btn primary', onclick: () => openRecordForm(moduleId, null, { defaults: opts.defaults, onSaved: reload }) }, `+ ${def.label}`) : null),
    opts.embed ? null : scopeNote(def),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, cols.map((f) => h('th', {}, f.label)))),
      h('tbody', {}, body),
      foot)));
}

function scopeNote(def) {
  if (def.scope === 'year') return h('p', { class: 'hint' }, `${state.year}년 기록입니다. 위쪽에서 연도를 바꾸면 다른 해의 기록을 볼 수 있습니다.`);
  if (def.scope === 'date') return h('p', { class: 'hint' }, `${state.year}년 1월 ~ ${state.year + 1}년 2월 기록입니다.`);
  return null;
}

function shortUrl(u) {
  try { const x = new URL(u); return x.hostname + (x.pathname.length > 1 ? '/…' : ''); } catch { return u; }
}

function exportCsv(def, rows) {
  const cols = def.fields.filter((f) => f.type !== 'secret');
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map((f) => esc(f.label)).join(',')];
  for (const r of rows) lines.push(cols.map((f) => esc(f.type === 'money' || f.type === 'number' ? (f.computed ? f.computed(r.data) : r.data[f.key]) : cellText(f, r.data[f.key], r))).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
  a.download = `${def.label}_${state.year}.csv`;
  a.click();
}
