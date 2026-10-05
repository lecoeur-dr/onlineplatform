// 달력 부품: 학사일정·특별수업·출장·동료장학이 함께 사용
//   보기: 연속(14개월 세로 스크롤) · 월별(←/→·스와이프) · 목록
//   범례를 눌러 분류별로 켜고 끄기, 날짜 칸의 + 로 바로 입력
import { yearMonths, yearRange, CATEGORIES, categoryColor, normCategory, NO_SCHOOL_CATEGORIES } from '../modules.js';
import { h, clear, pad, fmtDate, addDays, today, DOW, modal } from '../ui.js';
import { state, canEdit, remember, setYear } from '../state.js';
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
const LEAVE_ICON = { 출장: '🚌', 조퇴: '🏃', 외출: '🚶', 지참: '⏰', 연가: '🌿', 병가: '🏥', 공가: '📋', 특별휴가: '🎗️' };
export function tripItem(r) {
  const kind = r.data.kind || '출장';
  const who = r.data.person ? `${r.data.person} ` : '';
  const what = kind === '출장' ? (r.data.title || '').split('/')[0] : `${kind}${r.data.time ? ` ${r.data.time}` : ''}`;
  return { mod: 'trips', r, date: r.data.date, endDate: r.data.endDate, cat: '복무·출장', color: categoryColor('복무·출장'), label: `${LEAVE_ICON[kind] || '🚌'} ${who}${what}`.trim(), sub: kind === '출장' ? '' : (r.data.title || '').split('\n')[0] };
}
export function substituteItem(r) {
  return { mod: 'substitutes', r, date: r.data.date, cat: '보결', color: '#c2410c', label: `🔁 ${r.data.period || ''} ${r.data.className || ''} → ${r.data.substitute || ''}`.trim(), sub: r.data.absent ? `(${r.data.absent})` : '' };
}
export function memoItem(r) {
  return { mod: 'memos', r, date: r.data.date, cat: '메모', color: '#64748b', label: r.data.text || '', memo: true };
}
// 담당 배정: 같은 날·같은 행사는 한 줄로 (담당자 이름 나열)
export function dutyItems(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.data.date}|${r.data.title}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.values()].map((list) => ({
    mod: 'duties', r: list[0], date: list[0].data.date, cat: '담당 배정', color: '#0e7490',
    label: `🧑‍🏫 ${list[0].data.title || ''}`, sub: [...new Set(list.map((r) => r.data.person).filter(Boolean))].join(','), go: '#/notice/duties',
  }));
}
// 예전 가져오기 자료는 공개일이 '9.22(화) 2교시' 글자(openDate)로만 있을 수 있음 → 날짜로 읽음
export function openClassDate(r) {
  if (r.data.date) return r.data.date;
  const m = String(r.data.openDate || '').match(/(\d{1,2})\s*\.\s*(\d{1,2})/);
  if (!m) return '';
  const y = Number(r.year || state.year) + (Number(m[1]) <= 2 ? 1 : 0);
  return `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
}
// 전달사항(학사일정 표시 체크) · 기한 안내
export function briefingItem(r) {
  if (!r.data.onCalendar || !r.data.date) return null;
  return { mod: 'briefings', r, date: r.data.date, cat: '전달사항', color: '#b45309', label: `📣 ${String(r.data.content || '').split('\n')[0].slice(0, 40)}`, sub: r.data.kind || '' };
}
export function deadlineItem(r) {
  if (!r.data.date) return null;
  return { mod: 'deadlines', r, date: r.data.date, cat: '기한', color: '#be123c', label: `⏰ ${r.data.done ? '✔ ' : ''}${r.data.title || ''}`, sub: [r.data.category, r.data.person].filter(Boolean).join(' · '), cancel: !!r.data.done };
}
export function openClassItem(r) {
  const date = openClassDate(r);
  if (!date) return null;
  r = date === r.data.date ? r : { ...r, data: { ...r.data, date, period: r.data.period || String(r.data.openDate || '').match(/\d\s*교시/)?.[0] || '' } };
  return { mod: 'openClasses', r, date, cat: '동료장학', color: categoryColor('동료장학'), label: `👀 ${r.data.className || ''} ${r.data.teacher || ''} ${r.data.period || ''}`.trim(), sub: r.data.subject };
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
  const ymOf = (m) => `${m.y}-${pad(m.m)}`;

  let allByDate = {};
  let banner;

  // 배너 안의 '그 달' 부분(월 버튼 강조 + 주요 안내)만 다시 그림 — 스크롤할 때 호출
  const paintMonth = () => {
    if (!banner) return;
    const ym = ymOf(ui.month);
    for (const b of banner.querySelectorAll('.mchip')) b.classList.toggle('on', b.dataset.ym === ym);
    banner.querySelector('.mchip.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const sel = banner.querySelector('.month-select');
    if (sel) sel.value = String(months.findIndex((m) => ymOf(m) === ym));
    const slot = banner.querySelector('.banner-note');
    if (slot) clear(slot, noticePanel(o, ui.month, allByDate));
  };

  const scrollToMonth = (m, smooth = true) => {
    const el = root.querySelector(`.month-divider[data-ym="${ymOf(m)}"]`);
    if (!el) return;
    const stickyBanner = banner && getComputedStyle(banner).position === 'sticky';
    const offset = 50 + (stickyBanner ? banner.offsetHeight : 0) + 34;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset + 2, behavior: smooth ? 'smooth' : 'auto' });
  };

  const draw = () => {
    const shown = o.items.filter((it) => it && !ui.hidden.has(it.cat) && (!ui.q || `${it.label} ${it.sub || ''} ${JSON.stringify(it.r.data)}`.toLowerCase().includes(ui.q.toLowerCase())));
    const byDate = {};
    for (const it of shown) {
      let d = it.date;
      const end = it.endDate && it.endDate > d ? it.endDate : d;
      for (let g = 0; d <= end && g < 120; g++) { (byDate[d] ||= []).push(it); d = addDays(d, 1); }
    }
    allByDate = {};
    for (const it of o.items) if (it?.mod === 'events') (allByDate[it.date] ||= []).push(it);

    const counts = {};
    for (const it of o.items) if (it) counts[it.cat] = (counts[it.cat] || 0) + 1;

    const idx = months.findIndex((m) => m.y === ui.month.y && m.m === ui.month.m);
    const go = (i) => {
      if (i < 0 || i >= months.length) return;
      ui.month = months[i];
      if (ui.mode === 'scroll') { paintMonth(); scrollToMonth(ui.month); } else draw();
    };

    const years = [];
    for (let y = state.settings.currentYear - 2; y <= state.settings.currentYear + 1; y++) years.push(y);
    if (!years.includes(state.year)) years.push(state.year);

    // ---------- 위쪽 고정 배너: 연도 · 월 · 보기 · 추가 · 주요 안내 · 범례 ----------
    banner = h('div', { class: 'cal-banner' },
      h('div', { class: 'banner-row' },
        h('label', { class: 'year-pick' },
          h('select', { 'aria-label': '학년도', onchange: (e) => { setYear(e.target.value); state.rerender?.(); } },
            years.sort().map((y) => h('option', { value: y, selected: y === state.year }, `${y}학년도`)))),
        h('div', { class: 'month-nav' },
          h('button', { class: 'btn', onclick: () => go(months.findIndex((m) => ymOf(m) === ymOf(ui.month)) - 1), 'aria-label': '이전 달' }, '◀'),
          h('select', { class: 'month-select', onchange: (e) => go(Number(e.target.value)) }, months.map((m, i) => h('option', { value: i, selected: i === idx }, `${m.y}년 ${m.m}월`))),
          h('button', { class: 'btn', onclick: () => go(months.findIndex((m) => ymOf(m) === ymOf(ui.month)) + 1), 'aria-label': '다음 달' }, '▶')),
        h('button', { class: 'btn', onclick: () => { const i = months.findIndex((m) => ymOf(m) === now.slice(0, 7)); if (i >= 0) go(i); } }, '오늘'),
        h('div', { class: 'seg' }, [['scroll', '스크롤'], ['month', '월별'], ['list', '목록']].map(([m, l]) => h('button', {
          class: ui.mode === m ? 'on' : '', onclick: () => { ui.mode = remember(`${key}_mode`, m); draw(); if (m !== 'scroll') window.scrollTo(0, 0); },
        }, l))),
        h('input', { type: 'search', placeholder: '검색', value: ui.q, oninput: debounce((e) => { ui.q = e.target.value; draw(); const sb = root.querySelector('input[type=search]'); sb.focus(); sb.setSelectionRange(sb.value.length, sb.value.length); }) }),
        h('span', { class: 'grow' }),
        addButtons(o, `${ymOf(ui.month)}-01`)),
      h('div', { class: 'month-chips' }, months.map((m, i) => h('button', {
        class: `mchip ${ymOf(m) === ymOf(ui.month) ? 'on' : ''} ${ymOf(m) === now.slice(0, 7) ? 'now' : ''}`, 'data-ym': ymOf(m), onclick: () => go(i),
      }, m.m === 1 || i === 0 ? `${m.y}.${m.m}월` : `${m.m}월`))),
      o.notices ? h('div', { class: 'banner-note' }) : null,
      h('div', { class: 'legend' }, legend.filter((c) => counts[c.name]).map((c) => h('button', {
        class: `legend-item ${ui.hidden.has(c.name) ? 'off' : ''}`, style: { '--c': c.color }, title: '눌러서 켜기/끄기',
        onclick: () => { ui.hidden.has(c.name) ? ui.hidden.delete(c.name) : ui.hidden.add(c.name); remember(`${key}_hidden`, [...ui.hidden]); draw(); },
      }, h('span', { class: 'dot' }), c.name, h('span', { class: 'cnt' }, counts[c.name]))),
      ui.hidden.size ? h('button', { class: 'link-btn', onclick: () => { ui.hidden.clear(); remember(`${key}_hidden`, []); draw(); } }, '모두 켜기') : null));

    let body;
    if (ui.mode === 'scroll') body = scrollView(o, byDate, allByDate, now);
    else if (ui.mode === 'month') body = monthGrid(o, ui.month, byDate, now);
    else body = listView(o, ui.month, byDate);

    const keepY = ui.mode === 'scroll' && root._drawn ? window.scrollY : null;
    clear(root, banner, body,
      h('p', { class: 'hint' }, '날짜 칸의 빈 곳을 누르면 그 날짜로 바로 입력합니다. 위 배너의 월을 누르면 그 달로 이동하고, 스크롤하면 배너의 월과 주요 안내가 함께 바뀝니다.',
        ui.mode === 'month' ? ' 좌우로 밀거나 ← → 키로 달을 옮깁니다.' : ''));
    root.classList.add('cal-root');
    paintMonth();

    // 고정 배너 높이만큼 요일 머리를 아래로
    const setH = () => root.style.setProperty('--banner-h', getComputedStyle(banner).position === 'sticky' ? `${banner.offsetHeight}px` : '0px');
    setH();
    root._ro?.disconnect();
    if (window.ResizeObserver) { root._ro = new ResizeObserver(setH); root._ro.observe(banner); }

    // 스크롤 위치 → 보고 있는 달
    if (root._onScroll) window.removeEventListener('scroll', root._onScroll);
    root._onScroll = null;
    if (ui.mode === 'scroll') {
      let ticking = false;
      root._onScroll = () => {
        if (!root.isConnected) { window.removeEventListener('scroll', root._onScroll); return; }
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const line = 50 + (getComputedStyle(banner).position === 'sticky' ? banner.offsetHeight : 0) + 40;
          let cur = null;
          for (const el of root.querySelectorAll('.month-divider')) {
            if (el.getBoundingClientRect().top <= line + 10) cur = el.dataset.ym; else break;
          }
          if (!cur) cur = root.querySelector('.month-divider')?.dataset.ym;
          if (cur && cur !== ymOf(ui.month)) { ui.month = months.find((m) => ymOf(m) === cur) || ui.month; paintMonth(); }
        });
      };
      window.addEventListener('scroll', root._onScroll, { passive: true });
      if (keepY !== null) window.scrollTo(0, keepY);
      else if (!root._drawn && o.autoScroll !== false) requestAnimationFrame(() => scrollToMonth(ui.month, false));
    }
    if (ui.mode === 'month') {
      const grid = root.querySelector('.calendar');
      let x0 = null;
      grid.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      grid.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) go(idx + (dx < 0 ? 1 : -1)); x0 = null; });
    }
    root._go = ui.mode === 'month' ? go : null;
    root._idx = idx;
    root._drawn = true;
  };

  if (!root._keys) {
    root._keys = true;
    document.addEventListener('keydown', (e) => {
      if (!root.isConnected || !root._go || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('.modal-wrap')) return;
      if (e.key === 'ArrowLeft') root._go(root._idx - 1);
      if (e.key === 'ArrowRight') root._go(root._idx + 1);
    });
  }
  root._drawn = false;
  draw();
}

function addButtons(o, date) {
  const targets = (o.add || []).filter((t) => canEdit(t.mod));
  if (!targets.length) return null;
  // 많으면 첫 항목 + '추가…'(고르기)로 줄임
  if (targets.length > 3) {
    return h('div', { class: 'row-actions' },
      h('button', { class: 'btn primary', onclick: () => openAdd(o, targets[0], date) }, `+ ${targets[0].label}`),
      h('button', { class: 'btn', onclick: () => addAt(o, date) }, '+ 추가…'));
  }
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
    onclick: (ev) => { ev.stopPropagation(); if (it.go) location.hash = it.go; else openRecordForm(it.mod, it.r, { onSaved: o.reload }); },
  }, it.endDate && it.date !== d ? '↳ ' : '', it.label, it.sub ? h('span', { class: 'chip-sub' }, ` ${it.sub}`) : null,
  it.r.data.source === '나이스' ? h('span', { class: 'neis-mark', title: '나이스에서 가져온 일정' }, 'N') : null);
}

function dayCell(o, d, items, now, extraClass = '') {
  const [y, m, dd] = d.split('-').map(Number);
  const dow = new Date(y, m - 1, dd).getDay();
  const holiday = items.some((it) => it.mod === 'events' && NO_SCHOOL_CATEGORIES.includes(it.cat));
  const memos = items.filter((it) => it.memo);
  const list = items.filter((it) => !it.memo).sort((a, b) => order(a) - order(b));
  const MAX = 6;
  const canAdd = (o.add || []).some((t) => canEdit(t.mod));
  // 빈 곳을 누르면 그 날짜로 바로 입력 (구글 캘린더처럼)
  const cell = h('div', {
    class: `day ${dow === 0 || holiday ? 'sun' : ''} ${dow === 6 ? 'sat' : ''} ${d === now ? 'today' : ''} ${canAdd ? 'can-add' : ''} ${extraClass}`,
    onclick: canAdd ? () => addAt(o, d) : null,
  },
  h('div', { class: 'day-head' },
    h('span', { class: 'dnum' }, dd === 1 ? `${m}/${dd}` : dd),
    memos.map((it) => h('button', { class: 'memo', title: `메모: ${it.label}`, onclick: (e) => { e.stopPropagation(); openRecordForm('memos', it.r, { onSaved: o.reload }); } }, it.label)),
    canAdd ? h('button', { class: 'add-mini', title: '추가', onclick: (e) => { e.stopPropagation(); addAt(o, d); } }, '+') : null),
  list.slice(0, MAX).map((it) => chip(o, it, d)),
  list.length > MAX ? h('button', { class: 'more', onclick: (e) => { e.stopPropagation(); e.target.replaceWith(...list.slice(MAX).map((it) => chip(o, it, d))); } }, `+${list.length - MAX}개 더`) : null);
  return cell;
}

const ORDER = ['휴일·방학', '전체행사', '회의', '대회출전', '연수', '학급수업', '특별수업', '동료장학', '출장', '기타'];
const order = (it) => { const i = ORDER.indexOf(it.cat); return i < 0 ? 50 : i; };

// 배너의 월별 주요 안내: 전체 공지(해당 월) + 수업일수 + 작성/수정
function noticePanel(o, { y, m }, allByDate) {
  const ym = `${y}-${pad(m)}`;
  // 주요 안내: 전체 공지(해당 월) + '학사일정 주요 안내에 표시'한 공지(해당 월·마감 월) + 같은 표시를 한 그 달 전달사항
  const pins = (o.notices || []).filter((n) => (n.data.pinned || n.data.onCalendar) && (n.data.month || String(n.data.due || '').slice(0, 7)) === ym);
  const briefs = (o.briefings || []).filter((b) => b.data.onCalendar && String(b.data.date || '').startsWith(ym)).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const days = pins.map((n) => n.data.schoolDays).find(Boolean);
  const auto = schoolDays(y, m, allByDate);
  const write = () => openRecordForm('notices', null, { defaults: { category: '월별 안내', pinned: true, month: ym, title: `${m}월 교육과정 주요 안내` }, onSaved: o.reload });
  return h('div', { class: 'note-panel' },
    h('div', { class: 'np-head' },
      h('strong', {}, `📌 ${y}년 ${m}월 주요 안내`),
      h('span', { class: 'mh-days' }, `수업일수 ${days || '-'}`, h('span', { class: 'muted' }, ` (자동 ${auto}일)`)),
      h('span', { class: 'grow' }),
      pins.length ? pins.map((n) => h('button', { class: 'link-btn', onclick: () => openRecordForm('notices', n, { onSaved: o.reload }) }, canEdit('notices') ? '수정' : '보기')) : null,
      canEdit('notices') ? h('button', { class: 'btn small', onclick: write }, pins.length ? '+ 추가' : '+ 작성') : null),
    pins.length
      ? pins.map((n) => h('div', { class: 'np-body pre clamp-3', title: '눌러서 펼치기', onclick: (e) => e.currentTarget.classList.toggle('clamp-3') },
        n.data.title && pins.length > 1 ? h('strong', {}, `${n.data.title}\n`) : null,
        n.data.content && n.data.content !== '-' ? n.data.content : h('span', { class: 'muted' }, '(내용 없음)')))
      : briefs.length ? null : h('div', { class: 'np-body muted' }, '등록된 주요 안내가 없습니다. 공지·전달사항에서 "학사일정 주요 안내에 표시"를 체크하면 여기에 나옵니다.'),
    briefs.length ? h('ul', { class: 'np-briefs' }, briefs.map((b) => h('li', { class: 'click', onclick: () => openRecordForm('briefings', b, { onSaved: o.reload }) },
      h('span', { class: 'muted' }, `${Number(b.data.date.slice(5, 7))}/${Number(b.data.date.slice(8))} `), b.data.kind ? h('span', { class: 'tag ghost' }, b.data.kind) : null, ' ', String(b.data.content || '').split('\n')[0]))) : null);
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

// 스크롤 보기: 학년도 전체(14개월)를 주 단위로 이어서, 달이 바뀌는 곳에 월 구분선
function scrollView(o, byDate, allByDate, now) {
  const { from, to } = yearRange(state.year);
  const [fy, fm, fd] = from.split('-').map(Number);
  let d = addDays(from, -new Date(fy, fm - 1, fd).getDay());
  const out = [h('div', { class: 'calendar sticky-dow' }, DOW.map((x, i) => h('div', { class: `dow ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}` }, x)))];
  let first = true;
  while (d <= to) {
    const week = [];
    for (let i = 0; i < 7; i++) week.push(addDays(d, i));
    const firstOfMonth = week.find((x) => x.endsWith('-01') && x >= from && x <= to);
    if (firstOfMonth || first) {
      const ym = (firstOfMonth || from).slice(0, 7);
      const [y, m] = ym.split('-').map(Number);
      out.push(h('div', { class: 'month-divider', 'data-ym': ym }, `${y}년 ${m}월`, h('span', { class: 'muted small' }, ` · 수업일수 자동 ${schoolDays(y, m, allByDate)}일`)));
      first = false;
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
