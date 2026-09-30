// 달력 부품: 학사일정·특별수업·출장·동료장학이 함께 사용
//   보기: 연속(14개월 세로 스크롤) · 월별(←/→·스와이프) · 목록
//   범례를 눌러 분류별로 켜고 끄기, 날짜 칸의 + 로 바로 입력
import { yearMonths, yearRange, CATEGORIES, categoryColor, normCategory, NO_SCHOOL_CATEGORIES } from '../modules.js';
import { h, clear, pad, fmtDate, addDays, today, DOW, modal } from '../ui.js';
import { state, canEdit, remember } from '../state.js';
import { openRecordForm } from '../form.js';

// ---------- 기록 → 달력 항목 ----------

const PALETTE = ['#8a4fd6', '#1f9d55', '#e07b12', '#d6408f', '#0f8f86', '#3b6fe0', '#9a6b2f', '#3949ab', '#d93b3b', '#7a808c'];
export const paletteColor = (i) => PALETTE[i % PALETTE.length];

export function eventItem(r) {
  const cat = normCategory(r.data.category);
  return { mod: 'events', r, date: r.data.date, endDate: r.data.endDate, cat, color: categoryColor(cat), label: (r.data.title || '').split('\n')[0], sub: r.data.dept, review: r.data.review };
}
export function programItem(r, legendBy = 'category', programs = []) {
  const cat = legendBy === 'program' ? r.data.program || '기타' : '특별수업';
  const color = legendBy === 'program' ? paletteColor(Math.max(0, programs.indexOf(r.data.program))) : categoryColor('특별수업');
  return { mod: 'programs', r, date: r.data.date, cat, color, label: `[${r.data.program || ''}] ${(r.data.content || '').split('\n')[0]}`, sub: r.data.place, cancel: r.data.status === '취소' };
}
export function tripItem(r) {
  return { mod: 'trips', r, date: r.data.date, endDate: r.data.endDate, cat: '출장', color: categoryColor('출장'), label: `🚌 ${(r.data.title || '').split('/')[0]}`, sub: r.data.person };
}
export function openClassItem(r) {
  if (!r.data.date) return null;
  return { mod: 'openClasses', r, date: r.data.date, cat: '동료장학', color: categoryColor('동료장학'), label: `👀 ${r.data.className || ''} ${r.data.teacher || ''} ${r.data.period || ''}`.trim(), sub: r.data.subject };
}

// ---------- 달력 ----------

/**
 * @param root 그릴 곳
 * @param o.items 달력 항목 목록
 * @param o.legend 범례 [{name,color}] (없으면 CATEGORIES)
 * @param o.notices 공지 기록 (전체 공지 + 해당 월 → 월 머리에 표시)
 * @param o.add 추가 대상 [{mod,label,defaults(date)}]
 * @param o.key 보기 상태 기억용 이름
 * @param o.reload 저장 후 다시 불러오기
 */
export function renderCalendar(root, o) {
  const key = o.key || 'cal';
  const ui = {
    mode: remember(`${key}_mode`) || (window.innerWidth < 700 ? 'list' : o.defaultMode || 'scroll'),
    hidden: new Set(remember(`${key}_hidden`) || []),
    q: '',
    month: null,
  };
  const months = yearMonths(state.year);
  const now = today();
  ui.month = months.find((m) => `${m.y}-${pad(m.m)}` === now.slice(0, 7)) || months[2];
  const legend = o.legend || CATEGORIES;

  const draw = () => {
    const shown = o.items.filter((it) => it && !ui.hidden.has(it.cat) && (!ui.q || `${it.label} ${it.sub || ''} ${JSON.stringify(it.r.data)}`.toLowerCase().includes(ui.q.toLowerCase())));
    const byDate = {};
    for (const it of shown) {
      let d = it.date;
      const end = it.endDate && it.endDate > d ? it.endDate : d;
      for (let g = 0; d <= end && g < 120; g++) { (byDate[d] ||= []).push(it); d = addDays(d, 1); }
    }
    const allByDate = {};
    for (const it of o.items) if (it?.mod === 'events') (allByDate[it.date] ||= []).push(it);

    const counts = {};
    for (const it of o.items) if (it) counts[it.cat] = (counts[it.cat] || 0) + 1;

    const legendBar = h('div', { class: 'legend' }, legend.filter((c) => counts[c.name]).map((c) => h('button', {
      class: `legend-item ${ui.hidden.has(c.name) ? 'off' : ''}`, style: { '--c': c.color }, title: '눌러서 켜기/끄기',
      onclick: () => { ui.hidden.has(c.name) ? ui.hidden.delete(c.name) : ui.hidden.add(c.name); remember(`${key}_hidden`, [...ui.hidden]); draw(); },
    }, h('span', { class: 'dot' }), c.name, h('span', { class: 'cnt' }, counts[c.name]))),
    ui.hidden.size ? h('button', { class: 'link-btn', onclick: () => { ui.hidden.clear(); remember(`${key}_hidden`, []); draw(); } }, '모두 켜기') : null);

    const idx = months.findIndex((m) => m.y === ui.month.y && m.m === ui.month.m);
    const go = (i) => { if (i >= 0 && i < months.length) { ui.month = months[i]; draw(); } };

    const toolbar = h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, [['scroll', '연속'], ['month', '월별'], ['list', '목록']].map(([m, l]) => h('button', {
        class: ui.mode === m ? 'on' : '', onclick: () => { ui.mode = remember(`${key}_mode`, m); draw(); },
      }, l))),
      ui.mode !== 'scroll' ? h('div', { class: 'month-nav' },
        h('button', { class: 'btn', disabled: idx <= 0, onclick: () => go(idx - 1), 'aria-label': '이전 달' }, '◀'),
        h('select', { class: 'month-select', onchange: (e) => go(Number(e.target.value)) }, months.map((m, i) => h('option', { value: i, selected: i === idx }, `${m.y}년 ${m.m}월`))),
        h('button', { class: 'btn', disabled: idx >= months.length - 1, onclick: () => go(idx + 1), 'aria-label': '다음 달' }, '▶')) :
        h('button', { class: 'btn', onclick: () => root.querySelector('.week.has-today')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, '오늘로'),
      h('input', { type: 'search', placeholder: '검색', value: ui.q, oninput: debounce((e) => { ui.q = e.target.value; draw(); const s = root.querySelector('input[type=search]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }) }),
      h('span', { class: 'grow' }),
      addButtons(o, `${ui.month.y}-${pad(ui.month.m)}-01`));

    let body;
    if (ui.mode === 'scroll') body = scrollView(o, byDate, allByDate, now);
    else if (ui.mode === 'month') body = [monthHead(o, ui.month, allByDate), monthGrid(o, ui.month, byDate, now)];
    else body = [monthHead(o, ui.month, allByDate), listView(o, ui.month, byDate)];

    clear(root, toolbar, legendBar, body,
      h('p', { class: 'hint' }, '날짜 칸의 + 또는 두 번 누르기로 바로 입력합니다. 범례를 누르면 그 분류만 끄고 켤 수 있습니다.',
        ui.mode === 'month' ? ' 좌우로 밀거나 ← → 키로 달을 옮깁니다.' : ''));

    if (ui.mode === 'scroll' && o.autoScroll !== false) requestAnimationFrame(() => root.querySelector('.week.has-today')?.scrollIntoView({ block: 'center' }));
    if (ui.mode === 'month') {
      const grid = root.querySelector('.calendar');
      let x0 = null;
      grid.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      grid.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) go(idx + (dx < 0 ? 1 : -1)); x0 = null; });
    }
    root._go = ui.mode === 'month' ? go : null;
    root._idx = idx;
  };

  if (!root._keys) {
    root._keys = true;
    document.addEventListener('keydown', (e) => {
      if (!root.isConnected || !root._go || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('.modal-wrap')) return;
      if (e.key === 'ArrowLeft') root._go(root._idx - 1);
      if (e.key === 'ArrowRight') root._go(root._idx + 1);
    });
  }
  draw();
}

function addButtons(o, date) {
  const targets = (o.add || []).filter((t) => canEdit(t.mod));
  if (!targets.length) return null;
  return h('div', { class: 'row-actions' }, targets.map((t) => h('button', { class: 'btn primary', onclick: () => openAdd(o, t, date) }, `+ ${t.label}`)));
}

function openAdd(o, t, date) {
  openRecordForm(t.mod, null, { defaults: t.defaults ? t.defaults(date) : { date }, onSaved: o.reload });
}

function addAt(o, date) {
  const targets = (o.add || []).filter((t) => canEdit(t.mod));
  if (!targets.length) return;
  if (targets.length === 1) return openAdd(o, targets[0], date);
  const close = modal(`${fmtDate(date)} 추가`, h('div', { class: 'choice' }, targets.map((t) => h('button', { class: 'btn big', onclick: () => { close(); openAdd(o, t, date); } }, t.label))));
}

function chip(o, it, d) {
  return h('button', {
    class: `chip ${it.review ? 'review' : ''} ${it.cancel ? 'cancel' : ''}`,
    style: { '--c': it.color },
    title: [it.label, it.sub, it.r.data.place].filter(Boolean).join(' · '),
    onclick: (ev) => { ev.stopPropagation(); openRecordForm(it.mod, it.r, { onSaved: o.reload }); },
  }, it.endDate && it.date !== d ? '↳ ' : '', it.label, it.sub ? h('span', { class: 'chip-sub' }, ` ${it.sub}`) : null);
}

function dayCell(o, d, items, now, extraClass = '') {
  const [y, m, dd] = d.split('-').map(Number);
  const dow = new Date(y, m - 1, dd).getDay();
  const holiday = items.some((it) => it.mod === 'events' && NO_SCHOOL_CATEGORIES.includes(it.cat));
  const list = items.slice().sort((a, b) => order(a) - order(b));
  const MAX = 6;
  const cell = h('div', {
    class: `day ${dow === 0 || holiday ? 'sun' : ''} ${dow === 6 ? 'sat' : ''} ${d === now ? 'today' : ''} ${extraClass}`,
    ondblclick: () => addAt(o, d),
  },
  h('div', { class: 'day-head' },
    h('span', { class: 'dnum' }, dd === 1 ? `${m}/${dd}` : dd),
    (o.add || []).some((t) => canEdit(t.mod)) ? h('button', { class: 'add-mini', title: '추가', onclick: () => addAt(o, d) }, '+') : null),
  list.slice(0, MAX).map((it) => chip(o, it, d)),
  list.length > MAX ? h('button', { class: 'more', onclick: (e) => { e.target.replaceWith(...list.slice(MAX).map((it) => chip(o, it, d))); } }, `+${list.length - MAX}개 더`) : null);
  return cell;
}

const ORDER = ['휴일·방학', '전체행사', '회의', '대회출전', '연수', '학급수업', '특별수업', '동료장학', '출장', '기타'];
const order = (it) => { const i = ORDER.indexOf(it.cat); return i < 0 ? 50 : i; };

// 월 머리: 전체 공지(해당 월) + 수업일수
function monthHead(o, { y, m }, allByDate) {
  const ym = `${y}-${pad(m)}`;
  const pins = (o.notices || []).filter((n) => n.data.pinned && n.data.month === ym);
  const days = pins.map((n) => n.data.schoolDays).find(Boolean);
  const auto = schoolDays(y, m, allByDate);
  return h('div', { class: 'month-head' },
    h('div', { class: 'mh-title' }, `${y}년 ${m}월`,
      h('span', { class: 'mh-days' }, `수업일수 ${days || '-'}`, h('span', { class: 'muted' }, ` (자동 계산 ${auto}일)`))),
    pins.map((n) => h('div', { class: 'mh-note click', onclick: () => openRecordForm('notices', n, { onSaved: o.reload }) },
      h('strong', {}, '📌 ', n.data.title || '공지'), n.data.content && n.data.content !== '-' ? h('div', { class: 'pre' }, n.data.content) : null)),
    canEdit('notices') && !pins.length && o.notices ? h('button', { class: 'link-btn', onclick: () => openRecordForm('notices', null, { defaults: { category: '월별 안내', pinned: true, month: ym, title: `${m}월 교육과정 주요 안내` }, onSaved: o.reload }) }, `+ ${m}월 주요 안내 작성`) : null);
}

function schoolDays(y, m, allByDate) {
  const last = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) continue;
    if ((allByDate[`${y}-${pad(m)}-${pad(d)}`] || []).some((it) => NO_SCHOOL_CATEGORIES.includes(it.cat))) continue;
    n++;
  }
  return n;
}

function monthGrid(o, { y, m }, byDate, now) {
  const first = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(h('div', { class: 'day empty' }));
  for (let d = 1; d <= last; d++) {
    const key = `${y}-${pad(m)}-${pad(d)}`;
    cells.push(dayCell(o, key, byDate[key] || [], now));
  }
  return h('div', { class: 'calendar' }, DOW.map((d, i) => h('div', { class: `dow ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}` }, d)), cells);
}

// 연속 보기: 학년도 전체를 주 단위로 이어서, 달이 바뀌는 곳에 월 머리
function scrollView(o, byDate, allByDate, now) {
  const { from, to } = yearRange(state.year);
  const [fy, fm, fd] = from.split('-').map(Number);
  let d = addDays(from, -new Date(fy, fm - 1, fd).getDay());
  const out = [h('div', { class: 'calendar sticky-dow' }, DOW.map((x, i) => h('div', { class: `dow ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}` }, x)))];
  let lastMonth = '';
  while (d <= to) {
    const week = [];
    for (let i = 0; i < 7; i++) week.push(addDays(d, i));
    const firstOfMonth = week.find((x) => x.endsWith('-01') && x >= from && x <= to);
    const ym = (firstOfMonth || week[0]).slice(0, 7);
    if (firstOfMonth || !lastMonth) {
      const [y, m] = ym.split('-').map(Number);
      if (ym !== lastMonth) out.push(monthHead(o, { y, m }, allByDate));
      lastMonth = ym;
    }
    out.push(h('div', { class: `calendar week ${week.includes(now) ? 'has-today' : ''}` }, week.map((x) => {
      const inRange = x >= from && x <= to;
      const odd = Number(x.slice(5, 7)) % 2 ? 'odd-month' : '';
      return inRange ? dayCell(o, x, byDate[x] || [], now, odd) : h('div', { class: 'day empty' });
    })));
    d = addDays(d, 7);
  }
  return h('div', { class: 'scroll-cal' }, out);
}

function listView(o, { y, m }, byDate) {
  const last = new Date(y, m, 0).getDate();
  const rows = [];
  for (let d = 1; d <= last; d++) {
    const key = `${y}-${pad(m)}-${pad(d)}`;
    const items = (byDate[key] || []).slice().sort((a, b) => order(a) - order(b));
    items.forEach((it, i) => rows.push(h('tr', { class: 'click', onclick: () => openRecordForm(it.mod, it.r, { onSaved: o.reload }) },
      i === 0 ? h('td', { rowspan: items.length, class: 'nowrap' }, fmtDate(key)) : null,
      h('td', {}, h('span', { class: 'tag', style: { '--c': it.color } }, it.cat)),
      h('td', { class: 'pre' }, it.mod === 'events' ? it.r.data.title : it.label, it.review ? h('span', { class: 'badge warn' }, '확인필요') : null),
      h('td', {}, it.sub || ''),
      h('td', {}, it.r.data.place || ''))));
  }
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table cal-list' },
    h('thead', {}, h('tr', {}, ['날짜', '분류', '내용', '담당', '장소'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: 5, class: 'muted center' }, '기록이 없습니다.')))));
}

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
