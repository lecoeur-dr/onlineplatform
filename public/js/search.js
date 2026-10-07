// 🔎 전체 검색: 지금 보고 있는 공간(학교 / 내 책상)의 기록을 글자로 찾기 → 누르면 그 탭으로 이동해 기록을 엶
//   권한은 서버가 목록 화면과 똑같이 걸러 줌. 암호화 칸·비밀번호는 검색하지 않음
import { h, api, clear, modal } from './ui.js';
import { state, canSeeTab } from './state.js';
import { GROUPS, DESK_GROUPS, MODULES } from './modules.js';

const FALLBACK = { links: 'info/overview', secrets: 'info/overview' };

export function hrefOf(module, space) {
  const groups = space === 'desk' ? DESK_GROUPS : GROUPS;
  const pre = space === 'desk' ? '#/desk/' : '#/';
  for (const g of groups) for (const t of g.tabs) if (t.module === module && canSeeTab(t)) return `${pre}${g.id}/${t.id}`;
  return FALLBACK[module] ? `${pre}${FALLBACK[module]}` : null;
}

const textOf = (v) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : typeof v === 'object' ? '' : String(v));
function titleOf(m, d) {
  for (const k of ['title', 'name', 'subject', 'item', 'site', 'program', 'content', 'label']) if (textOf(d[k]).trim()) return textOf(d[k]).split('\n')[0].slice(0, 60);
  // 제목 칸이 없으면 날짜가 아닌 앞쪽 칸 두 개 (예: 특별실 예약 → 도서관 · 1교시)
  const parts = MODULES[m].fields.filter((x) => !['date', 'secret', 'textarea'].includes(x.type) && x.key !== 'date' && textOf(d[x.key]).trim()).slice(0, 2).map((x) => textOf(d[x.key]).split('\n')[0]);
  return parts.length ? parts.join(' · ').slice(0, 60) : '(제목 없음)';
}
// 찾은 글자 앞뒤만 잘라 강조
function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 80);
  const from = Math.max(0, i - 24);
  return [from ? '…' : '', text.slice(from, i), h('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length, i + q.length + 50), i + q.length + 50 < text.length ? '…' : ''];
}

export function openSearch(initial = '') {
  let space = state.space === 'desk' || !state.member ? 'desk' : 'school';
  let timer = null;
  let seq = 0;
  const out = h('div', { class: 'search-results' });
  const input = h('input', { type: 'search', class: 'search-input', placeholder: '찾을 글자 (2글자 이상) — 예) 출장, 체육관, 방과후', value: initial, oninput: () => { clearTimeout(timer); timer = setTimeout(run, 250); } });
  const segBox = h('div', { class: 'seg' });
  const drawSeg = () => clear(segBox, [['school', '🏫 학교'], ['desk', '🪴 내 책상']].filter(([v]) => v === 'desk' || state.member).map(([v, l]) => h('button', { type: 'button', class: space === v ? 'on' : '', onclick: () => { space = v; drawSeg(); run(); } }, l)));
  drawSeg();
  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < 2) { clear(out, h('p', { class: 'muted small' }, `${state.year}학년도 자료와 학년도 구분이 없는 자료(바로가기·내선번호 등)에서 찾습니다.`)); return; }
    clear(out, h('p', { class: 'muted small' }, '찾는 중…'));
    try {
      const res = await api(`/api/search?space=${space}&year=${state.year}&q=${encodeURIComponent(q)}`);
      if (my !== seq) return;
      if (!res.items.length) { clear(out, h('p', { class: 'muted' }, `'${q}'이(가) 들어간 기록이 없습니다.`)); return; }
      const by = new Map();
      for (const it of res.items) { if (!by.has(it.module)) by.set(it.module, []); by.get(it.module).push(it); }
      clear(out, h('p', { class: 'muted small' }, `${res.items.length}건`), [...by].map(([m, list]) => h('div', { class: 'search-group' },
        h('div', { class: 'search-mod' }, `${MODULES[m].icon || ''} ${MODULES[m].label}`, h('span', { class: 'muted small' }, ` ${list.length}`)),
        list.map((it) => {
          const d = it.record.data;
          const key = it.fields.find((k) => !['title', 'name'].includes(k)) || it.fields[0];
          const href = hrefOf(m, space);
          return h('button', { type: 'button', class: 'search-item', disabled: !href, onclick: () => go(m, it.record, href) },
            h('strong', {}, titleOf(m, d)),
            d.date ? h('span', { class: 'muted small' }, ` · ${d.date}`) : null,
            h('div', { class: 'muted small' }, snippet(textOf(d[key]), q)));
        }))));
    } catch (e) { if (my === seq) clear(out, h('p', { class: 'alert error' }, e.message)); }
  }
  let closeModal = () => {};
  function go(m, record, href) {
    closeModal();
    // 일반 표 화면이면 이동 뒤 그 기록의 입력 창을 엶 (따로 만든 화면은 이동만)
    if (!MODULES[m].extras?.length) state.pendingOpen = { module: m, record };
    if (location.hash === href) state.rerender?.(); else location.hash = href;
  }
  modal('🔎 검색', h('div', { class: 'form search-box' }, h('div', { class: 'row-flex' }, segBox), input, out), [(close) => { closeModal = close; return h('button', { class: 'btn', onclick: close }, '닫기'); }], { wide: true });
  setTimeout(() => input.focus(), 30);
  run();
}

export const searchButton = () => h('button', { class: 'icon-btn search-btn', title: '검색 (Ctrl+K)', 'aria-label': '검색', onclick: () => openSearch() }, '🔎');

// Ctrl+K / ⌘K 또는 입력 칸 밖에서 '/' 로 검색 열기
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !document.querySelector('.modal-wrap'))) {
    if (!state.me) return;
    e.preventDefault();
    openSearch();
  }
});
