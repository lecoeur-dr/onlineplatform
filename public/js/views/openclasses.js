// 동료장학: 공개수업 목록 + 내 이름으로 참관 신청
import { h, api, clear, toast } from '../ui.js';
import { state, canEdit } from '../state.js';
import { openRecordForm } from '../form.js';

export async function openClassesView(root) {
  const rows = await api(`/api/records/openClasses?year=${state.year}`);
  render(root, rows);
}

function render(root, rows) {
  const reload = () => openClassesView(root);
  const me = state.me.name || state.me.email;
  const mine = rows.filter((r) => (r.data.observers || []).includes(me)).length;
  const groups = [...new Set(rows.map((r) => r.data.group || ''))];

  const toggle = async (r, on) => {
    try {
      const saved = await api(`/api/records/openClasses/${r.id}/observe`, { method: 'POST', body: { on } });
      Object.assign(r, saved);
      render(root, rows);
    } catch (e) { toast(e.message, 'error'); }
  };

  clear(root,
    h('div', { class: 'toolbar' },
      h('span', {}, '내 참관 신청: ', h('strong', {}, `${mine}건`), h('span', { class: 'muted' }, ` (이름: ${me})`)),
      h('span', { class: 'grow' }),
      canEdit('openClasses') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('openClasses', null, { onSaved: reload }) }, '+ 공개수업') : null),
    state.me.name ? null : h('p', { class: 'alert warn' }, '관리자 화면에서 내 이름이 등록되어야 참관 명단에 이름으로 표시됩니다.'),
    groups.map((g) => h('section', { class: 'section' },
      g ? h('h3', {}, g) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['공개일', '학급', '수업교사', '과목', '교실', '선협의', '후협의', '참관 신청', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.filter((r) => (r.data.group || '') === g).map((r) => {
          const obs = r.data.observers || [];
          const on = obs.includes(me);
          return h('tr', { class: 'click', onclick: () => openRecordForm('openClasses', r, { onSaved: reload }) },
            h('td', { class: 'nowrap' }, r.data.openDate || ''),
            h('td', {}, r.data.className || ''),
            h('td', {}, r.data.teacher || ''),
            h('td', {}, r.data.subject || ''),
            h('td', {}, r.data.room || ''),
            h('td', {}, r.data.pre || ''),
            h('td', {}, r.data.post || ''),
            h('td', { class: 'small' }, obs.length ? `${obs.length}명: ${obs.join(', ')}` : h('span', { class: 'muted' }, '없음')),
            h('td', { onclick: (e) => e.stopPropagation() }, state.me.role === 'viewer' ? null
              : h('button', { class: `btn small ${on ? '' : 'primary'}`, onclick: () => toggle(r, !on) }, on ? '신청 취소' : '참관 신청')));
        })))))),
    rows.length ? null : h('p', { class: 'muted' }, '등록된 공개수업이 없습니다.'));
}
