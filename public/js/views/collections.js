// 📥 취합 (공지·업무): 확인 · 제출 · 참석 조사 · 선택(정원) · 설문 — 만들기 · 응답 · 현황 · 미응답 알림 · CSV
import { h, api, clear, fmtDate, today, addDays, toast, modal, confirmBox, download } from '../ui.js';
import { state, canEdit, remember, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { seg } from './schedule.js';
import { KINDS, KIND_INFO, Q_TYPES, CHOICE_TYPES, presetQuestions, capOf, answerText, optsOf, ATTEND_OPTIONS } from '../collect.js';
import { targetsOf, dday } from './notices.js';

const kindOf = (r) => r.data.kind || '확인';
const isOwner = (r) => r.createdBy === state.me?.email || state.me?.role === 'admin';
const closed = (r) => !!r.data.due && r.data.due < today();
const qsOf = (r) => { const qs = r.data.questions || []; return kindOf(r) === '참석 조사' ? qs.filter((q) => q.type === 'attend') : qs; };

// ---------- 만들기 ----------
function createCollection(reload, preset = {}) {
  const close = modal('📥 새 취합 — 유형 고르기', h('div', { class: 'kind-pick' }, KINDS.map((k) => h('button', { class: 'card kind-card', onclick: () => {
    close();
    openRecordForm('collections', null, { defaults: { kind: k, allowEdit: true, showResults: k === '선택', questions: presetQuestions(k), ...preset }, onSaved: (r) => {
      reload();
      if (r && (k === '선택' || k === '설문')) editQuestions(r, reload);
    } });
  } }, h('div', { class: 'kind-ico' }, KIND_INFO[k].icon), h('strong', {}, k), h('div', { class: 'muted small' }, KIND_INFO[k].desc)))), [], { wide: true });
}

// ---------- 문항 편집 (선택: 문항 1개, 설문: 여러 문항) ----------
export function editQuestions(r, reload) {
  const single = kindOf(r) === '선택';
  const qs = JSON.parse(JSON.stringify(r.data.questions?.length ? r.data.questions : presetQuestions(kindOf(r))));
  let seq = qs.reduce((m, q) => Math.max(m, Number(String(q.id).replace(/\D/g, '')) || 0), 0);
  const box = h('div', {});
  const draw = () => clear(box, qs.map((q, i) => {
    const isChoice = CHOICE_TYPES.includes(q.type);
    if (isChoice && !q.options?.length) q.options = q.type === 'attend' ? [...ATTEND_OPTIONS] : ['보기 1', '보기 2'];
    return h('div', { class: 'card q-edit' },
      h('div', { class: 'card-head' }, h('strong', {}, single ? '문항' : `${i + 1}번`), h('span', { class: 'grow' }),
        single ? null : h('button', { type: 'button', class: 'icon-btn small', title: '위로', disabled: i === 0, onclick: () => { [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; draw(); } }, '↑'),
        single ? null : h('button', { type: 'button', class: 'icon-btn small', title: '삭제', onclick: () => { qs.splice(i, 1); draw(); } }, '✕')),
      h('div', { class: 'grid-2' },
        h('input', { value: q.label || '', placeholder: '질문', oninput: (e) => { q.label = e.target.value; } }),
        h('select', { onchange: (e) => { q.type = e.target.value; if (!CHOICE_TYPES.includes(q.type)) { delete q.options; delete q.caps; } draw(); } },
          Q_TYPES.filter(([t]) => !single || ['single', 'multi', 'dropdown'].includes(t)).map(([t, l]) => h('option', { value: t, selected: q.type === t }, l)))),
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: !!q.required, onchange: (e) => { q.required = e.target.checked; } }), ' 필수'),
      q.type === 'multi' ? h('label', { class: 'inline' }, ' · 최대 ', h('input', { type: 'number', min: 0, style: { width: '60px' }, value: q.max || '', oninput: (e) => { q.max = Number(e.target.value) || 0; } }), '개 (비우면 제한 없음)') : null,
      isChoice && q.type !== 'attend' ? h('div', { class: 'opt-list' },
        h('div', { class: 'muted small' }, '보기 · 정원(비우면 제한 없음)'),
        q.options.map((o, k) => h('div', { class: 'opt-row' },
          h('input', { value: o, placeholder: `보기 ${k + 1}`, oninput: (e) => { q.options[k] = e.target.value; } }),
          ['single', 'multi'].includes(q.type) ? h('input', { type: 'number', min: 0, placeholder: '정원', class: 'cap', value: (q.caps || [])[k] || '', oninput: (e) => { q.caps ||= []; q.caps[k] = Number(e.target.value) || 0; } }) : null,
          h('button', { type: 'button', class: 'icon-btn small', onclick: () => { q.options.splice(k, 1); (q.caps || []).splice(k, 1); draw(); } }, '✕'))),
        h('button', { type: 'button', class: 'link-btn small', onclick: () => { q.options.push(''); draw(); } }, '+ 보기 추가')) : null,
      q.type === 'attend' ? h('div', { class: 'muted small' }, '보기: 참석 / 불참') : null);
  }));
  draw();
  modal(`✏️ ${r.data.title} · ${single ? '보기' : '문항'}`, h('div', { class: 'form' }, box,
    single ? null : h('div', { class: 'row-actions' }, Q_TYPES.map(([t, l]) => h('button', { type: 'button', class: 'btn small', onclick: () => { qs.push({ id: `q${++seq}`, type: t, label: '', required: false }); draw(); } }, `+ ${l}`)))), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const clean = qs.map((q) => ({ ...q, label: String(q.label || '').trim() || '(질문)', ...(q.options ? { options: q.options.map((o) => String(o).trim()).filter(Boolean) } : {}) }));
      if (clean.some((q) => CHOICE_TYPES.includes(q.type) && (q.options || []).length < 2)) { toast('선택형 문항은 보기가 2개 이상 있어야 합니다.', 'error'); return; }
      try { await api(`/api/records/collections/${r.id}`, { method: 'PUT', body: { data: { ...r.data, questions: clean }, version: r.version } }); toast('저장했습니다.'); close(); reload(); } catch (e) { toast(e.message, 'error'); }
    } }, '저장'),
  ], { wide: true });
}

// ---------- 응답 ----------
async function respond(r, answers, reload) {
  try { await api(`/api/collections/${r.id}/respond`, { method: 'POST', body: { answers } }); toast('응답했습니다.'); reload(); return true; } catch (e) { toast(e.message, 'error'); return false; }
}
function questionInput(q, value, tally, onChange) {
  const opts = optsOf(q);
  const full = (o, i) => (tally?.[q.id]?.[o] || 0) >= capOf(q, i) && !(Array.isArray(value) ? value.includes(o) : value === o);
  const label = (o, i) => `${o}${Number.isFinite(capOf(q, i)) ? ` (${tally?.[q.id]?.[o] || 0}/${capOf(q, i)})` : ''}${full(o, i) ? ' · 마감' : ''}`;
  if (q.type === 'single' || q.type === 'attend') return h('div', { class: 'choice-list' }, opts.map((o, i) => h('label', { class: `choice ${full(o, i) ? 'full' : ''}` }, h('input', { type: 'radio', name: q.id, checked: value === o, disabled: full(o, i), onchange: () => onChange(o) }), ` ${label(o, i)}`)));
  if (q.type === 'multi') { const set = new Set(value || []); return h('div', { class: 'choice-list' }, opts.map((o, i) => h('label', { class: `choice ${full(o, i) ? 'full' : ''}` }, h('input', { type: 'checkbox', checked: set.has(o), disabled: full(o, i), onchange: (e) => { if (e.target.checked) set.add(o); else set.delete(o); onChange([...set]); } }), ` ${label(o, i)}`))); }
  if (q.type === 'dropdown') return h('select', { onchange: (e) => onChange(e.target.value) }, h('option', { value: '' }, '선택'), opts.map((o) => h('option', { value: o, selected: value === o }, o)));
  if (q.type === 'class') return h('select', { onchange: (e) => onChange(e.target.value) }, h('option', { value: '' }, '선택'), (state.settings.lists.classes || []).map((o) => h('option', { value: o, selected: value === o }, o)));
  if (q.type === 'long') return h('textarea', { rows: 4, value: value || '', oninput: (e) => onChange(e.target.value) });
  const type = { number: 'number', date: 'date', url: 'url' }[q.type] || 'text';
  return h('input', { type, value: value ?? '', placeholder: q.type === 'url' ? 'https://' : '', oninput: (e) => onChange(e.target.value) });
}
async function openRespond(r, reload) {
  const res = await api(`/api/collections/${r.id}/responses`);
  const answers = { ...(res.mine?.answers || {}) };
  const qs = qsOf(r);
  modal(`${KIND_INFO[kindOf(r)].icon} ${r.data.title}`, h('div', { class: 'form' },
    r.data.content ? h('div', { class: 'alert info pre' }, r.data.content) : null,
    r.data.link && /^https?:/.test(r.data.link) ? h('p', {}, h('a', { class: 'btn', href: r.data.link, target: '_blank', rel: 'noopener' }, '🔗 링크 열기 (폴더·구글폼)'), h('span', { class: 'muted small' }, ' 이곳에 낸 뒤 아래 [제출]을 누르면 완료로 표시됩니다.')) : null,
    qs.map((q) => h('div', { class: 'row' }, h('label', {}, q.label, q.required ? h('span', { class: 'req' }, ' *') : null), questionInput(q, answers[q.id], r.data.tally, (v) => { answers[q.id] = v; }))),
    r.data.due ? h('p', { class: 'muted small' }, `마감 ${fmtDate(r.data.due)} · ${r.data.allowEdit === false ? '제출 후 수정할 수 없습니다' : '마감 전까지 고칠 수 있습니다'}`) : null), [
    res.mine && r.data.allowEdit !== false ? (close) => h('button', { class: 'btn danger ghost', onclick: async () => { if (!(await confirmBox('내 응답을 취소할까요?'))) return; try { await api(`/api/collections/${r.id}/respond`, { method: 'DELETE' }); toast('응답을 취소했습니다.'); close(); reload(); } catch (e) { toast(e.message, 'error'); } } }, '응답 취소') : null,
    (close) => h('button', { class: 'btn', onclick: close }, '닫기'),
    (close) => h('button', { class: 'btn primary', onclick: async () => { if (await respond(r, answers, reload)) close(); } }, res.mine ? '수정해서 제출' : '제출'),
  ].filter(Boolean), { wide: qs.length > 2 });
}

// ---------- 현황 (만든 사람·관리자, 또는 결과 공개) ----------
async function openStatus(r, reload) {
  const res = await api(`/api/collections/${r.id}/responses`);
  const qs = qsOf(r);
  const targets = res.targets;
  const done = new Set(kindOf(r) === '확인' ? r.data.done || [] : res.rows.map((x) => x.name));
  const missing = targets.filter((n) => !done.has(n));
  const csv = () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['이름', '응답 시각', ...qs.map((x) => x.label)];
    const lines = [head.map(q).join(','), ...res.rows.map((x) => [x.name, x.at, ...qs.map((qq) => answerText(qq, x.answers[qq.id]))].map(q).join(',')), ...missing.map((n) => [n, '(미응답)'].map(q).join(','))];
    download(`${r.data.title}_결과.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  modal(`📊 ${r.data.title} · 현황`, h('div', {},
    h('div', { class: 'kpi-grid' }, h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '응답'), h('div', { class: 'kpi-value' }, `${done.size} / ${targets.length}명`)),
      h('div', { class: `kpi ${missing.length ? 'warn' : ''}` }, h('div', { class: 'kpi-label' }, '미응답'), h('div', { class: 'kpi-value' }, `${missing.length}명`))),
    qs.filter((q) => CHOICE_TYPES.includes(q.type)).map((q) => h('section', { class: 'section' }, h('h3', {}, q.label),
      h('div', { class: 'tally' }, optsOf(q).map((o, i) => {
        const n = r.data.tally?.[q.id]?.[o] || 0; const cap = capOf(q, i); const base = Number.isFinite(cap) ? cap : Math.max(1, done.size);
        const who = res.rows.filter((x) => [].concat(x.answers[q.id] || []).includes(o)).map((x) => x.name);
        return h('div', { class: 'tally-row', title: who.join(', ') },
          h('span', { class: 'tally-label' }, o),
          h('div', { class: 'tally-track' }, h('span', { class: 'tally-fill', style: { width: `${Math.min(100, Math.round((n / base) * 100))}%` } })),
          h('strong', { class: 'tally-num' }, `${n}${Number.isFinite(cap) ? `/${cap}` : '명'}`),
          h('span', { class: 'tally-who muted small' }, who.join(', ')));
      })))),
    res.canSeeAll && res.rows.length && qs.length ? h('section', { class: 'section' }, h('h3', {}, '응답 표'), h('div', { class: 'table-wrap', style: { maxHeight: '40vh' } }, h('table', { class: 'table compact' },
      h('thead', {}, h('tr', {}, ['이름', ...qs.map((x) => x.label)].map((x) => h('th', {}, x)))),
      h('tbody', {}, res.rows.map((x) => h('tr', {}, h('td', {}, h('strong', {}, x.name)), qs.map((qq) => h('td', { class: 'small' }, qq.type === 'url' && x.answers[qq.id] ? h('a', { href: x.answers[qq.id], target: '_blank', rel: 'noopener' }, '열기') : answerText(qq, x.answers[qq.id]))))))))) : null,
    missing.length ? h('section', { class: 'section' }, h('h3', {}, `미응답 ${missing.length}명`), h('p', { class: 'small' }, missing.join(', '))) : h('p', { class: 'alert' }, '모두 응답했습니다. 👏')), [
    res.owner && missing.length ? (close) => h('button', { class: 'btn', onclick: async () => { try { const x = await api(`/api/collections/${r.id}/remind`, { method: 'POST' }); toast(`미응답 ${x.sent}명에게 알림을 보냈습니다.`); } catch (e) { toast(e.message, 'error'); } } }, '🔔 미응답자에게 알림') : null,
    res.canSeeAll ? () => h('button', { class: 'btn', onclick: csv }, 'CSV') : null,
    (close) => h('button', { class: 'btn primary', onclick: close }, '닫기'),
  ].filter(Boolean), { wide: true });
}

// ---------- 카드 ----------
function card(r, reload) {
  const k = kindOf(r);
  const targets = targetsOf(r);
  const done = (r.data.done || []).filter((n) => targets.includes(n));
  const missing = targets.filter((n) => !done.includes(n));
  const me = myName();
  const mine = targets.includes(me) && state.me.role !== 'viewer';
  const iDone = (r.data.done || []).includes(me);
  const pct = targets.length ? Math.round((done.length / targets.length) * 100) : 0;
  const late = closed(r);
  const owner = isOwner(r);
  const q1 = qsOf(r)[0];
  // 참석 조사·선택(하나)은 카드에서 바로 한 번에 응답
  const quick = !late && mine && q1 && ((k === '참석 조사' && q1.type === 'attend') || (k === '선택' && q1.type === 'single'));
  const showCounts = (k === '선택') || r.data.showResults || owner;
  return h('div', { class: `card collection ${late ? 'late' : ''} ${mine && !iDone && !late ? 'todo' : ''}` },
    h('div', { class: 'notice-head' },
      h('span', { class: 'tag ghost' }, `${KIND_INFO[k].icon} ${k}`),
      h('strong', { class: owner ? 'click' : '', onclick: owner ? () => openRecordForm('collections', r, { onSaved: reload }) : null }, r.data.title),
      h('span', { class: 'grow' }),
      r.data.meetingId ? h('a', { class: 'tag blue', href: '#/notice/meetingPlans' }, '🗓 회의') : null,
      r.data.due ? h('span', { class: `tag ${late ? 'danger' : ''}` }, `${fmtDate(r.data.due)} · ${late ? '마감' : dday(r.data.due)}`) : null),
    r.data.content ? h('div', { class: 'pre small clamp2' }, r.data.content) : null,
    h('div', { class: 'bar', title: `${done.length}/${targets.length}` }, h('span', { style: { width: `${pct}%` } }), h('em', {}, `응답 ${done.length} / ${targets.length}명`)),
    quick ? h('div', { class: 'quick-row' }, optsOf(q1).map((o, i) => {
      const n = r.data.tally?.q1?.[o] || 0; const cap = capOf(q1, i); const isFull = n >= cap;
      const picked = iDone && r._my === o;
      return h('button', { class: `btn small ${picked ? 'primary' : ''}`, disabled: isFull && !picked, onclick: async () => {
        await respond(r, { q1: o }, reload);
      } }, `${o}${showCounts ? ` ${n}${Number.isFinite(cap) ? `/${cap}` : ''}` : ''}${isFull && !picked ? ' 마감' : ''}`);
    })) : null,
    h('div', { class: 'row-actions' },
      k === '확인' && mine && !late ? h('button', { class: `btn small ${iDone ? '' : 'primary'}`, onclick: async () => { try { await api(`/api/records/collections/${r.id}/self`, { method: 'POST', body: { on: !iDone } }); reload(); } catch (e) { toast(e.message, 'error'); } } }, iDone ? '✔ 확인함 (취소)' : '확인했어요') : null,
      k !== '확인' && mine && !late && !quick ? h('button', { class: `btn small ${iDone ? '' : 'primary'}`, onclick: () => openRespond(r, reload) }, iDone ? '✔ 응답함 · 보기/수정' : k === '제출' ? '제출하기' : '응답하기') : null,
      quick && iDone && qsOf(r).length > 1 ? h('button', { class: 'link-btn small', onclick: () => openRespond(r, reload) }, '응답 보기·수정') : null,
      r.data.link && /^https?:/.test(r.data.link) ? h('a', { class: 'btn small', href: r.data.link, target: '_blank', rel: 'noopener' }, '🔗 링크') : null,
      h('span', { class: 'grow' }),
      owner || r.data.showResults ? h('button', { class: 'btn small', onclick: () => openStatus(r, reload) }, '📊 현황') : null,
      owner && (k === '선택' || k === '설문') ? h('button', { class: 'btn small', onclick: () => editQuestions(r, reload) }, k === '선택' ? '✏️ 보기' : '✏️ 문항') : null,
      owner ? h('button', { class: 'link-btn small', title: '같은 내용으로 새로 만들기', onclick: () => openRecordForm('collections', null, { defaults: { ...r.data, title: `${r.data.title} (복사)`, due: '', done: [], tally: {}, noticeId: '', meetingId: '' }, onSaved: reload }) }, '복제') : null),
    missing.length && (owner || r.data.showResults) ? h('details', { class: 'small' }, h('summary', {}, `미응답 ${missing.length}명`), h('div', { class: 'muted' }, missing.join(', '))) : !missing.length ? h('div', { class: 'small muted' }, '모두 응답했습니다.') : null);
}

export async function collectionsView(root) {
  const rows = await api(`/api/records/collections?year=${state.year}`);
  const reload = () => collectionsView(root);
  const mode = remember('col_mode') || 'open';
  const t = today();
  const me = myName();
  const isTodo = (r) => targetsOf(r).includes(me) && !(r.data.done || []).includes(me) && !closed(r);
  // 참석 조사·선택 빠른 응답 버튼에 내가 고른 값 표시
  const quickOnes = rows.filter((r) => ['참석 조사', '선택'].includes(kindOf(r)) && (r.data.done || []).includes(me));
  await Promise.all(quickOnes.map(async (r) => { try { const x = await api(`/api/collections/${r.id}/responses`); r._my = x.mine?.answers?.q1; } catch { /* 무시 */ } }));
  const shown = rows
    .filter((r) => mode === 'all' || (mode === 'mine' ? isTodo(r) : (!r.data.due || r.data.due >= addDays(t, -7)) && targetsOf(r).some((n) => !(r.data.done || []).includes(n))))
    .sort((a, b) => String(a.data.due || '9999').localeCompare(String(b.data.due || '9999')));
  const mineN = rows.filter(isTodo).length;
  clear(root,
    h('div', { class: 'toolbar' },
      seg([['open', '진행 중'], ['mine', `내가 낼 것${mineN ? ` (${mineN})` : ''}`], ['all', '전체']], mode, (v) => { remember('col_mode', v); reload(); }),
      h('span', { class: 'grow' }),
      canEdit('collections') ? h('button', { class: 'btn primary', onclick: () => createCollection(reload) }, '+ 취합 만들기') : null),
    shown.length ? h('div', { class: 'cards' }, shown.map((r) => card(r, reload))) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '📥'), h('p', {}, mode === 'mine' ? '지금 낼 취합이 없습니다. 👏' : '해당하는 취합이 없습니다.')),
    h('p', { class: 'hint' }, '확인·제출·참석 조사·선택(정원)·설문 다섯 가지로 받을 수 있습니다. 대상을 비우면 전체 교직원이고, 응답하면 미응답 명단에서 자동으로 빠집니다. 마감 전날 아침에는 미응답자에게만 알림이 갑니다. 결과는 만든 사람과 관리자가 보며, "결과 공개"를 켜면 대상자 모두 볼 수 있습니다.'));
}

