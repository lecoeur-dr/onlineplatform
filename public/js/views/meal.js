// 🍚 공지·업무 → 급식 의견: 영양 선생님이 매달 학생 의견을 받음
//   메뉴 투표(선생님이 올린 후보 중 고르기) · 메뉴 추천(학생이 직접 적기)을 따로 진행
//   학생은 링크·QR로 로그인 없이 참여하고, 이름 없이 학년만 고름
import { h, api, clear, toast, modal, confirmBox, download, today } from '../ui.js';
import { state } from '../state.js';
import { openRecordForm } from '../form.js';
import { showQr } from './admin.js';
import { gradesOf, optionsOf, maxPickOf, recCountOf } from '../meal.js';

const linkOf = (p) => `${location.origin}/meal#t=${p.data.token}`;
const isOpen = (p) => !!p.data.open && !(p.data.due && p.data.due < today());
const mine = (p) => p.createdBy === state.me?.email || state.me?.role === 'admin';
const monthLabel = (m) => (m ? `${Number(m.slice(5))}월` : '');
const nextMonth = (m) => { const [y, mo] = (m || today().slice(0, 7)).split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };

export async function mealView(root) {
  const list = await api(`/api/records/mealPolls?year=${state.year}`);
  const reload = () => mealView(root);
  const create = (kind) => openRecordForm('mealPolls', null, {
    defaults: { kind, open: true, month: nextMonth(today().slice(0, 7)), title: `${monthLabel(nextMonth(today().slice(0, 7)))} ${kind === '메뉴 투표' ? '먹고 싶은 메뉴 투표' : '먹고 싶은 메뉴 추천'}`, maxPick: 3, recCount: 3 },
    onSaved: (r) => { reload(); if (r) shareBox(r); },
  });
  const sorted = list.slice().sort((a, b) => String(b.data.month || '').localeCompare(String(a.data.month || '')) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const group = (kind) => sorted.filter((p) => (p.data.kind || '메뉴 투표') === kind);
  clear(root,
    h('div', { class: 'toolbar' },
      h('span', { class: 'muted small' }, '학생은 링크·QR로 로그인 없이 참여하고, 이름 없이 학년만 고릅니다.'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => create('메뉴 추천') }, '🍽️ + 메뉴 추천 받기'),
      h('button', { class: 'btn primary', onclick: () => create('메뉴 투표') }, '🗳️ + 메뉴 투표 만들기')),
    ['메뉴 투표', '메뉴 추천'].map((kind) => h('section', { class: 'section' },
      h('h3', {}, kind === '메뉴 투표' ? '🗳️ 메뉴 투표 — 선생님이 올린 후보 중 고르기' : '🍽️ 메뉴 추천 — 학생이 먹고 싶은 메뉴 적기'),
      group(kind).length ? h('div', { class: 'cards meal-cards' }, group(kind).map((p) => card(p, reload)))
        : h('p', { class: 'muted' }, kind === '메뉴 투표' ? '아직 투표가 없습니다. [🗳️ + 메뉴 투표 만들기]에서 이번 달 메뉴 후보를 올려 보세요.' : '아직 추천 받기가 없습니다. [🍽️ + 메뉴 추천 받기]로 학생들이 먹고 싶은 메뉴를 받아 보세요.'))),
    h('p', { class: 'hint' }, '같은 기기에서는 한 번만 응답되고, 다시 내면 앞의 응답을 고칩니다(로그인이 없어 완벽한 중복 방지는 아닙니다). 추천 글 중 장난 글은 결과 화면에서 숨길 수 있습니다.'));
}

function card(p, reload) {
  const d = p.data;
  const open = isOpen(p);
  return h('article', { class: 'card meal-card' },
    h('div', { class: 'mc-top' },
      h('span', { class: `tag ${open ? 'ok' : 'ghost'}` }, open ? '응답 받는 중' : '마감'),
      d.month ? h('span', { class: 'tag' }, `${monthLabel(d.month)} 반영`) : null,
      h('span', { class: 'tag ghost' }, d.grades ? gradesOf(d.grades).map((g) => `${g}`).join('·') + '학년' : '전 학년')),
    h('h4', {}, d.title),
    h('div', { class: 'muted small' }, d.kind === '메뉴 추천' ? `한 사람당 ${recCountOf(d)}개까지 적기` : `후보 ${optionsOf(d.options).length}개 중 ${maxPickOf(d)}개까지 고르기`, d.due ? ` · 마감 ${d.due.slice(5).replace('-', '/')}` : ''),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn small primary', onclick: () => results(p) }, '📊 결과'),
      h('button', { class: 'btn small', onclick: () => shareBox(p) }, '🔗 학생 링크·QR'),
      mine(p) ? h('button', { class: 'btn small', onclick: () => openRecordForm('mealPolls', p, { onSaved: reload }) }, '수정') : null,
      mine(p) ? h('button', { class: 'btn small', title: '다음 달용으로 복사', onclick: () => duplicate(p, reload) }, '다음 달로 복제') : null,
      mine(p) ? h('button', { class: 'btn small danger ghost', onclick: async () => {
        if (!(await confirmBox(`'${d.title}'와(과) 학생 응답을 모두 삭제할까요?`))) return;
        try { await api(`/api/records/mealPolls/${p.id}`, { method: 'DELETE' }); toast('삭제했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); }
      } }, '🗑') : null));
}

async function duplicate(p, reload) {
  const d = p.data;
  const month = nextMonth(d.month);
  const data = { ...d, month, open: true, due: '', title: String(d.title || '').replace(/^\d{1,2}월/, monthLabel(month)) };
  delete data.token;
  try { const r = await api('/api/records/mealPolls', { method: 'POST', body: { data, year: state.year } }); toast(`${monthLabel(month)}용으로 복사했습니다. 메뉴 후보를 고쳐 주세요.`); openRecordForm('mealPolls', r, { onSaved: reload }); reload(); } catch (e) { toast(e.message, 'error'); }
}

function shareBox(p) {
  const url = linkOf(p);
  modal('🔗 학생에게 보내기', h('div', { class: 'form' },
    h('p', {}, h('strong', {}, p.data.title)),
    h('div', { class: 'invite-row' }, h('code', {}, url),
      h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(url); toast('링크를 복사했습니다.'); } }, '복사'),
      h('button', { class: 'btn small', onclick: () => showQr(url) }, '📱 QR 크게')),
    h('ul', { class: 'muted small' },
      h('li', {}, '담임 선생님께 링크를 보내 반 단톡방이나 교실 TV(QR)로 안내해 달라고 부탁하면 됩니다.'),
      h('li', {}, '학생은 로그인 없이 학년만 고르고 참여합니다. 이름은 받지 않습니다.'),
      h('li', {}, '응답을 그만 받으려면 [수정]에서 「응답 받는 중」을 끄거나 마감일을 정하세요.'))), [(close) => h('button', { class: 'btn', onclick: close }, '닫기')]);
}

// 📊 결과: 투표는 메뉴별 표, 추천은 같은 메뉴끼리 묶어 많은 순. 학년별 숫자 함께
async function results(p) {
  const d = p.data;
  const box = h('div', {}, h('p', { class: 'muted' }, '불러오는 중…'));
  modal(`📊 ${d.title}`, box, [(close) => h('button', { class: 'btn', onclick: close }, '닫기')], { wide: true });
  const draw = async () => {
    let r;
    try { r = await api(`/api/meal/${p.id}/results`); } catch (e) { clear(box, h('p', { class: 'alert error' }, e.message)); return; }
    const grades = Object.keys(r.byGrade).map(Number);
    const items = d.kind === '메뉴 추천' ? r.recs : r.votes;
    const max = Math.max(1, ...items.map((x) => x.count));
    const csv = () => {
      const head = ['메뉴', '합계', ...grades.map((g) => `${g}학년`), ...(d.kind === '메뉴 추천' ? ['이유(일부)'] : [])];
      const rows = items.map((x) => [x.menu, x.count, ...grades.map((g) => x.grades[g] || 0), ...(d.kind === '메뉴 추천' ? [x.reasons.join(' / ')] : [])]);
      download(`${d.title}.csv`, '﻿' + [head, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    };
    clear(box,
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '참여'), h('div', { class: 'kpi-value' }, `${r.total}명`)),
        h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '학년별'), h('div', { class: 'small' }, grades.map((g) => `${g}학년 ${r.byGrade[g]}`).join(' · ')))),
      items.length && r.total ? h('div', { class: 'meal-bars' }, items.map((x, i) => h('div', { class: 'meal-bar' },
        h('div', { class: 'mb-name' }, h('strong', {}, `${i + 1}. ${x.menu}`), h('span', { class: 'muted small' }, ` ${grades.filter((g) => x.grades[g]).map((g) => `${g}학년 ${x.grades[g]}`).join(' · ')}`)),
        h('div', { class: 'mb-track' }, h('span', { style: { width: `${(x.count / max) * 100}%` } }), h('em', {}, `${x.count}${d.kind === '메뉴 추천' ? '명' : '표'}`)),
        x.reasons?.length ? h('div', { class: 'muted small mb-why' }, `💬 ${x.reasons.slice(0, 3).join(' / ')}${x.reasons.length > 3 ? ' …' : ''}`) : null)))
        : h('p', { class: 'muted' }, '아직 응답이 없습니다.'),
      d.kind === '메뉴 추천' && r.owner && r.responses.length ? h('details', { class: 'meal-raw' },
        h('summary', {}, `학생이 쓴 글 모두 보기 (${r.responses.length}건) — 장난 글 숨기기`),
        h('ul', { class: 'list' }, r.responses.slice().reverse().map((x) => h('li', { class: x.hidden ? 'dim' : '' },
          h('span', { class: 'tag ghost' }, `${x.grade}학년`), ' ', (x.answers.recs || []).map((m) => `${m.menu}${m.reason ? ` (${m.reason})` : ''}`).join(', '),
          h('button', { class: 'link-btn small', onclick: async () => { try { await api(`/api/meal/${p.id}/hide/${x.id}`, { method: 'POST', body: { hidden: !x.hidden } }); draw(); } catch (e) { toast(e.message, 'error'); } } }, x.hidden ? ' 다시 보이기' : ' 숨기기'))))) : null,
      h('div', { class: 'row-actions' }, h('span', { class: 'grow' }), h('button', { class: 'btn small', onclick: draw }, '↻ 새로 고침'), h('button', { class: 'btn small', onclick: csv }, '엑셀(CSV) 저장')));
  };
  draw();
}
