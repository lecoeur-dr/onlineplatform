// 새 글 표시: 마지막으로 그 메뉴를 연 뒤 다른 사람이 올리거나 고친 기록에 배지·강조
//   본 시점은 이 기기(브라우저)에 기억함
import { GROUPS, MODULES } from './modules.js';
import { api } from './ui.js';
import { state, remember } from './state.js';

const news = { now: null, items: [], at: 0 };
const prevSeen = {}; // 이번에 메뉴를 열기 직전의 '본 시점' (행 강조용)

const seenMap = () => remember('seen') || {};
const seenOf = (m, map = seenMap()) => map[m] || map._base || '9999';

export const tabOf = (module) => {
  for (const g of GROUPS) for (const t of g.tabs) if (t.module === module) return `#/${g.id}/${t.id}`;
  return null;
};

export async function loadNews(force = false) {
  if (!force && Date.now() - news.at < 60000) return news;
  const map = seenMap();
  const since = Object.values(map).sort()[0];
  try {
    const res = await api(`/api/changes${since ? `?since=${encodeURIComponent(since)}` : ''}`);
    news.now = res.now;
    news.items = res.items;
    news.at = Date.now();
    if (!since) remember('seen', { _base: res.now }); // 처음 쓰는 기기: 지금부터 새 글로 셈
  } catch { /* 표시만 안 함 */ }
  return news;
}

// 아직 보지 않은 변경
export function unseen() {
  const map = seenMap();
  return news.items.filter((it) => it.at > seenOf(it.module, map));
}

// 메뉴를 열 때: 강조 기준을 남기고 '본 시점'을 지금으로
export function markSeen(module) {
  const map = seenMap();
  prevSeen[module] = seenOf(module, map);
  if (news.now) { map[module] = news.now; remember('seen', map); }
}

// 표의 행 등: 이 기록이 새로 올라오거나 바뀐 것인지
export function isNew(module, r) {
  const base = prevSeen[module];
  return !!base && !!r.updatedAt && r.updatedAt > base && r.updatedBy !== state.me?.email;
}

// 왼쪽 메뉴·하단 탭에 숫자 배지
export function paintBadges(root = document) {
  const counts = {};
  for (const it of unseen()) counts[it.module] = (counts[it.module] || 0) + 1;
  for (const g of GROUPS) {
    let sum = 0;
    for (const t of g.tabs) {
      if (!t.module || !MODULES[t.module]) continue;
      const n = counts[t.module] || 0;
      sum += n;
      setBadge(root.querySelector(`.nav-sub[data-id="${g.id}/${t.id}"]`), n);
    }
    setBadge(root.querySelector(`.nav-group[data-group="${g.id}"] .nav-head`), sum);
    setBadge(root.querySelector(`.bottom-bar a[data-group="${g.id}"]`), sum);
  }
}

function setBadge(el, n) {
  if (!el) return;
  let b = el.querySelector('.nbadge');
  if (!n) { b?.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'nbadge'; el.append(b); }
  b.textContent = n > 99 ? '99+' : String(n);
}
