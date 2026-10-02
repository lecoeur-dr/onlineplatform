// 모듈 규격(fields)으로 입력 폼을 자동 생성
import { MODULES } from './modules.js';
import { h, api, clear, modal, toast, confirmBox, won } from './ui.js';
import { state, canEdit, listOf } from './state.js';

export function fieldInput(f, value) {
  const common = { name: f.key, id: `f_${f.key}` };
  switch (f.type) {
    case 'textarea':
      return h('textarea', { ...common, rows: 3, value: value ?? '' });
    case 'date':
      return h('input', { ...common, type: 'date', value: value ?? '' });
    case 'month':
      return h('input', { ...common, type: 'month', value: value ?? '' });
    case 'money':
    case 'number':
      return h('input', { ...common, type: 'number', step: 'any', inputmode: 'decimal', value: value ?? '' });
    case 'bool':
      return h('input', { ...common, type: 'checkbox', checked: !!value });
    case 'url':
      return h('input', { ...common, type: 'url', placeholder: 'https://', value: value ?? '' });
    case 'secret':
      return h('input', { ...common, type: 'text', autocomplete: 'off', placeholder: value ? '바꿀 때만 입력 (비워 두면 유지)' : '', value: '' });
    case 'names':
      return h('textarea', { ...common, rows: 2, placeholder: '쉼표로 구분', value: (value || []).join(', ') });
    case 'select': {
      const opts = listOf(f);
      if (f.free) return freeSelect(common, opts, value);
      return h('select', common, h('option', { value: '' }, '선택'), opts.map((o) => h('option', { value: o, selected: o === value }, o)),
        value && !opts.includes(value) ? h('option', { value, selected: true }, value) : null);
    }
    default:
      return h('input', { ...common, type: 'text', value: value ?? '' });
  }
}

// 목록에서 고르기 + 맨 아래 '직접 입력' (설정의 목록·교직원 명단을 바로 드롭다운으로)
const CUSTOM = '__custom__';
function freeSelect(common, opts, value) {
  const wrap = h('span', { class: 'combo' });
  const toInput = (v) => {
    const input = h('input', { ...common, value: v ?? '', autocomplete: 'off', placeholder: '직접 입력' });
    clear(wrap, input, opts.length ? h('button', { type: 'button', class: 'link-btn', onclick: () => toSelect(input.value) }, '목록') : null);
    input.focus();
  };
  const toSelect = (v) => {
    const sel = h('select', { ...common, onchange: (e) => { if (e.target.value === CUSTOM) toInput(''); } },
      h('option', { value: '' }, opts.length ? '선택' : '(목록 없음)'),
      opts.map((o) => h('option', { value: o, selected: o === v }, o)),
      v && !opts.includes(v) ? h('option', { value: v, selected: true }, v) : null,
      h('option', { value: CUSTOM }, '✏️ 직접 입력…'));
    clear(wrap, sel);
  };
  if (!opts.length) toInput(value); else toSelect(value);
  return wrap;
}

export function readForm(form, fields) {
  const data = {};
  for (const f of fields) {
    if (f.computed) continue;
    const el = form.querySelector(`[name="${f.key}"]`);
    if (!el) continue;
    if (f.type === 'bool') data[f.key] = el.checked;
    else if (f.type === 'secret') { if (el.value !== '') data[f.key] = el.value; }
    else data[f.key] = el.value.trim();
  }
  return data;
}

// 기록 추가/수정 모달. onSaved(record|null) — 삭제 시 null
export function openRecordForm(moduleId, record, { defaults = {}, onSaved, extra } = {}) {
  const def = MODULES[moduleId];
  const editable = canEdit(moduleId);
  const data = record ? { ...record.data } : { ...defaults };
  const extraNode = extra ? extra(data, editable) : null;
  const form = h('form', { class: 'form', onsubmit: (e) => e.preventDefault() },
    def.fields.map((f) => {
      if (f.computed) return h('div', { class: 'row' }, h('label', {}, f.label), h('div', { class: 'readonly' }, f.type === 'money' ? won(f.computed(data)) : f.computed(data)));
      const input = fieldInput(f, data[f.key]);
      if (!editable) input.querySelectorAll?.('input,select,textarea').forEach((x) => { x.disabled = true; });
      if (!editable && input.matches?.('input,select,textarea')) input.disabled = true;
      return h('div', { class: `row ${f.type === 'bool' ? 'row-check' : ''}` },
        h('label', { for: `f_${f.key}` }, f.label, f.required ? h('span', { class: 'req' }, ' *') : null),
        input,
        f.hint ? h('small', { class: 'hint' }, f.hint) : null);
    }),
    extraNode,
    record?.updatedAt ? h('p', { class: 'meta' }, `마지막 수정: ${record.updatedAt} · ${record.updatedBy || ''}`) : null);

  const save = async (close) => {
    const body = readForm(form, def.fields);
    if (extraNode?._read) Object.assign(body, extraNode._read());
    for (const f of def.fields) if (f.required && !body[f.key] && !(f.type === 'secret' && record)) { toast(`${f.label}을(를) 입력해 주세요.`, 'error'); return; }
    try {
      const saved = record
        ? await api(`/api/records/${moduleId}/${record.id}`, { method: 'PUT', body: { data: { ...record.data, ...body }, version: record.version } })
        : await api(`/api/records/${moduleId}`, { method: 'POST', body: { data: { ...(def.extras || []).reduce((o, k) => (defaults[k] !== undefined ? { ...o, [k]: defaults[k] } : o), {}), ...body }, year: state.year } });
      toast('저장했습니다.');
      close();
      onSaved?.(saved);
    } catch (e) { toast(e.message, 'error'); }
  };
  const del = async (close) => {
    if (!(await confirmBox('이 기록을 삭제할까요?'))) return;
    try {
      await api(`/api/records/${moduleId}/${record.id}`, { method: 'DELETE' });
      toast('삭제했습니다.');
      close();
      onSaved?.(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const actions = [];
  if (editable && record) actions.push((close) => h('button', { class: 'btn danger ghost', onclick: () => del(close) }, '삭제'));
  actions.push((close) => h('button', { class: 'btn', onclick: close }, editable ? '취소' : '닫기'));
  if (editable) actions.push((close) => h('button', { class: 'btn primary', onclick: () => save(close) }, '저장'));
  const close = modal(`${def.icon} ${def.label} ${record ? (editable ? '수정' : '보기') : '추가'}`, form, actions, { wide: !!extra });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && editable) save(close);
  });
  return form;
}
