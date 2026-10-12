// 달력 부품: 학사일정·특별수업·출장·동료장학이 함께 사용
//   보기: 연속(14개월 세로 스크롤) · 월별(←/→·스와이프) · 목록
//   범례를 눌러 분류별로 켜고 끄기, 날짜 칸의 + 로 바로 입력
import { yearMonths, yearRange, CATEGORIES, categoryColor, categoryIcon, normCategory, NO_SCHOOL_CATEGORIES } from '../modules.js';
import { h, clear, pad, fmtDate, addDays, today, DOW, modal } from '../ui.js';
import { state, canEdit, remember, setYear } from '../state.js';
import { openRecordForm } from '../form.js';

// ---------- 기록 → 달력 항목 ----------

const PALETTE = ['#8a4fd6', '#1f9d55', '#e07b12', '#d6408f', '#0f8f86', '#3b6fe0', '#9a6b2f', '#3949ab', '#d93b3b', '#7a808c'];
export const paletteColor = (i) => PALETTE[i % PALETTE.length];

export function eventItem(r) {
  const cat = normCategory(r.data.category);
  return { mod: 'events', r, date: r.data.date, endDate: r.data.endDate, cat, color: categoryColor(cat), icon: categoryIcon(cat), label: (r.data.title || '').split('\n')[0], sub: r.data.dept, review: r.data.review };
}
// 특별수업 칸 내용 풀기: '(14/44)' 진행 차시 · '(4-1) 5교시' 반·교시 줄 · 나머지 메모
export function programInfo(content) {
  const lines = String(content || '').split('\n').map((x) => x.trim()).filter(Boolean);
  let progress = null;
  const classes = [];
  const notes = [];
  for (const l of lines) {
    const pm = l.match(/^\(?\s*(\d+)\s*\/\s*(\d+)\s*\)?$/);
    if (pm && !progress) { progress = { n: Number(pm[1]), total: Number(pm[2]) }; continue; }
    if (/\(?\d-\d+\)?\s*\d*\s*[~-]?\s*\d*\s*교시|^\(\d-\d+\)/.test(l)) classes.push(l.replace(/\s+/g, ' ')); else if (l !== '-') notes.push(l);
  }
  return { progress, classes, notes };
}
export function programItem(r, legendBy = 'category', programs = []) {
  const cat = legendBy === 'program' ? r.data.program || '기타' : '특별수업';
  const color = legendBy === 'program' ? paletteColor(Math.max(0, programs.indexOf(r.data.program))) : categoryColor('특별수업');
  const info = programInfo(r.data.content);
  const head = info.classes.length ? `${info.classes[0]}${info.classes.length > 1 ? ` 외 ${info.classes.length - 1}반` : ''}` : info.notes[0] || '';
  const label = `[${r.data.program || ''}] ${info.progress ? `${info.progress.n}/${info.progress.total}차시 · ` : ''}${head}`;
  return { mod: 'programs', r, date: r.data.date, cat, color, icon: '🎵', label, sub: r.data.place, cancel: r.data.status === '취소' };
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

// ---------- 내 일정 ----------
//   전교 행사·휴일은 모두의 일정 + 내 이름·부서·담임 학급(학년)이 들어간 일정 + 내 출장·보결·담당·공개수업·우리 반 특별수업
const ALL_TARGET = /전교|전체|전\s*학년|교직원|전\s*교원|모든/;
export function isMine(it) {
  const me = String(state.member?.name || state.me?.name || '').replace(/\s/g, '');
  const dept = String(state.member?.dept || '').trim();
  const room = String(state.member?.homeroom || '').trim();
  const grade = room.match(/^(\d)\s*-/)?.[1];
  const d = it.r?.data || {};
  const text = JSON.stringify(d).replace(/\s/g, '');
  const has = (x) => !!x && text.includes(String(x).replace(/\s/g, ''));
  const hasRoom = room && (text.includes(`(${room})`) || new RegExp(`(^|[^\\d])${room.replace('-', '\\s*-\\s*')}($|[^\\d])`).test(JSON.stringify(d)));
  if (it.memo) return true;
  if (it.mod === 'events') {
    if (NO_SCHOOL_CATEGORIES.includes(it.cat)) return true;
    if (has(me) || (dept && d.dept === dept) || hasRoom) return true;
    const scope = `${d.target || ''} ${d.title || ''}`;
    const grades = [...scope.matchAll(/(\d)\s*(?:~\s*(\d))?\s*학년/g)].flatMap((m) => { const a = Number(m[1]); const b = Number(m[2] || m[1]); return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i); });
    // 대상이 비었거나 전교·교직원이면 모두의 일정. 단 제목에 다른 학년만 적혀 있으면(예: 1학년 현장체험학습) 그 학년 일정
    if (grades.length) return !!grade && grades.includes(Number(grade));
    return !String(d.target || '').trim() || ALL_TARGET.test(d.target);
  }
  if (it.mod === 'programs') return hasRoom || has(me);
  if (it.mod === 'briefings') return true;
  return has(me) || hasRoom;
}
const LEGEND_LABEL = { 전체행사: '학교 행사' };

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
    // 처음에는 o.defaultHidden(예: 특별수업·복무·출장)을 꺼 둔 채로 시작. 바꾸면 이 기기에 기억
    hidden: new Set(remember(`${key}_hidden2`) ?? o.defaultHidden ?? []),
    mine: !!remember(`${key}_mine`),
    sel: today(),
    q: '',
    month: null,
    noteOpen: remember(`${key}_note`) ?? window.innerWidth > 700, // 주요 안내: PC는 펼침, 휴대폰은 접음이 기본 — 바꾸면 이 기기에 기억
    tools: false, // 휴대폰: 보기 설정 펼침
  };
  const months = yearMonths(state.year);
  const now = today();
  ui.month = months.find((m) => `${m.y}-${pad(m.m)}` === now.slice(0, 7)) || months[2];
  const legend = o.legend || CATEGORIES;
  const ymOf = (m) => `${m.y}-${pad(m.m)}`;

  let allByDate = {};
  let banner;
  let paintSide = () => {};

  // 배너 안의 '그 달' 부분(월 버튼 강조 + 주요 안내)만 다시 그림 — 스크롤할 때 호출
  const paintMonth = () => {
    if (!banner) return;
    const ym = ymOf(ui.month);
    const sel = banner.querySelector('.month-select');
    if (sel) sel.value = String(months.findIndex((m) => ymOf(m) === ym));
    const slot = banner.querySelector('.banner-note');
    if (slot) {
      slot.classList.toggle('closed', !ui.noteOpen);
      clear(slot, noticePanel(o, ui.month, allByDate, ui.noteOpen, () => {
        // 접고 펼치면 배너 높이가 바뀌므로, 보던 달이 그대로 보이도록 다시 맞춤 (그동안 스크롤 감지 멈춤)
        const keep = ui.month;
        ui.lockUntil = Date.now() + 400;
        ui.noteOpen = !ui.noteOpen; remember(`${key}_note`, ui.noteOpen);
        paintMonth();
        if (ui.mode === 'scroll') requestAnimationFrame(() => { ui.month = keep; scrollToMonth(keep, false); });
      }));
    }
  };

  const scrollToMonth = (m, smooth = true) => {
    const el = root.querySelector(`.month-divider[data-ym="${ymOf(m)}"]`);
    if (!el) return;
    const stickyBanner = banner && getComputedStyle(banner).position === 'sticky';
    const offset = 50 + (stickyBanner ? banner.offsetHeight : 0) + 34;
    // 버튼으로 이동하는 동안에는 스크롤 감지를 잠시 멈춤 (지나가는 달마다 배너를 다시 그리지 않도록)
    ui.lockUntil = Date.now() + (smooth ? 900 : 150);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset + 2, behavior: smooth ? 'smooth' : 'auto' });
  };

  const draw = () => {
    const shown = o.items.filter((it) => it && !ui.hidden.has(it.cat) && (!ui.mine || isMine(it)) && (!ui.q || `${it.label} ${it.sub || ''} ${JSON.stringify(it.r.data)}`.toLowerCase().includes(ui.q.toLowerCase())));
    // byDate: 날짜별 모든 항목(목록 보기용) · single: 하루짜리만(칸 안 띠) · spans: 여러 날 일정(이어진 막대) · holidays: 날짜별 휴일 이름
    const byDate = {};
    const single = {};
    const spans = [];
    const holidays = {};
    for (const it of shown) {
      let d = it.date;
      const end = it.endDate && it.endDate > d ? it.endDate : d;
      const hol = it.mod === 'events' && NO_SCHOOL_CATEGORIES.includes(it.cat);
      if (end > d) spans.push({ ...it, endDate: end });
      for (let g = 0; d <= end && g < 120; g++) {
        (byDate[d] ||= []).push(it);
        if (hol) (holidays[d] ||= []).push(it);
        if (end === it.date && !hol) (single[d] ||= []).push(it);
        d = addDays(d, 1);
      }
    }
    // 날짜 숫자 누르기: 오른쪽 칸이 보이면(큰 화면) 그 칸에, 아니면 하루 일정 창으로
    const ctx = { single, spans, holidays, byDate, now, sel: o.side ? ui.sel : null };
    ctx.onPick = (d) => {
      const sideEl = root.querySelector('.cal-side');
      if (!sideEl || getComputedStyle(sideEl).display === 'none') { dayModal(o, d, ctx); return; }
      ui.sel = d; ctx.sel = d;
      for (const c of root.querySelectorAll('.day.picked')) c.classList.remove('picked');
      root.querySelector(`.day[data-date="${d}"]`)?.classList.add('picked');
      paintSide();
    };
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
    // 위쪽 고정 배너: 한 줄(이전·월·다음·오늘 · 보기 · 검색 · 추가) + 주요 안내(접기/펼치기) + 분류(누르면 숨기기)
    //   휴대폰: 보기·검색·분류는 [⚙ 보기] 안에 접어 두고 달력이 바로 보이게
    const setHidden = (next) => { ui.hidden = new Set(next); remember(`${key}_hidden2`, [...ui.hidden]); draw(); };
    const legendEl = h('div', { class: 'legend pick-legend' },
      h('span', { class: 'legend-title' }, '보기'),
      o.mineToggle ? h('button', { class: `mine-toggle ${ui.mine ? 'on' : ''}`, title: '전교 행사·휴일 + 내 이름·부서·우리 반이 들어간 일정만', onclick: () => { ui.mine = !ui.mine; remember(`${key}_mine`, ui.mine); draw(); } }, ui.mine ? '👤 내 일정만 ✓' : '👤 내 일정만') : null,
      legend.filter((c) => counts[c.name]).map((c) => h('button', {
        class: `legend-item ${ui.hidden.has(c.name) ? 'off' : 'on'}`, style: { '--c': c.color }, 'aria-pressed': String(!ui.hidden.has(c.name)), title: ui.hidden.has(c.name) ? '눌러서 보이기' : '눌러서 숨기기',
        onclick: () => { const n = new Set(ui.hidden); n.has(c.name) ? n.delete(c.name) : n.add(c.name); setHidden(n); },
      }, h('span', { class: 'cbox' }, ui.hidden.has(c.name) ? '' : '✓'), c.icon ? h('span', { class: 'li-ico' }, c.icon) : null, LEGEND_LABEL[c.name] || c.name, h('span', { class: 'cnt' }, counts[c.name]))),
      ui.hidden.size ? h('button', { class: 'link-btn', onclick: () => setHidden([]) }, '모두 보기') : null,
      o.defaultHidden && [...ui.hidden].sort().join() !== [...o.defaultHidden].sort().join() ? h('button', { class: 'link-btn', onclick: () => setHidden(o.defaultHidden) }, '기본으로') : null);
    banner = h('div', { class: `cal-banner ${ui.tools ? 'tools-open' : ''}` },
      h('div', { class: 'banner-row' },
        h('div', { class: 'month-nav' },
          h('button', { class: 'btn', onclick: () => go(months.findIndex((m) => ymOf(m) === ymOf(ui.month)) - 1), 'aria-label': '이전 달' }, '◀'),
          h('select', { class: 'month-select', 'aria-label': '달', onchange: (e) => go(Number(e.target.value)) }, months.map((m, i) => h('option', { value: i, selected: i === idx }, `${m.y}년 ${m.m}월`))),
          h('button', { class: 'btn', onclick: () => go(months.findIndex((m) => ymOf(m) === ymOf(ui.month)) + 1), 'aria-label': '다음 달' }, '▶')),
        h('button', { class: 'btn', onclick: () => { const i = months.findIndex((m) => ymOf(m) === now.slice(0, 7)); if (i >= 0) go(i); } }, '오늘'),
        h('div', { class: 'cal-tools' },
          h('label', { class: 'year-pick' },
            h('select', { 'aria-label': '학년도', onchange: (e) => { setYear(e.target.value); state.rerender?.(); } },
              years.sort().map((y) => h('option', { value: y, selected: y === state.year }, `${y}학년도`)))),
          h('div', { class: 'seg' }, [['scroll', '스크롤'], ['month', '월별'], ['list', '목록']].map(([m, l]) => h('button', {
            class: ui.mode === m ? 'on' : '', onclick: () => { ui.mode = remember(`${key}_mode`, m); draw(); if (m !== 'scroll') window.scrollTo(0, 0); },
          }, l))),
          h('input', { type: 'search', placeholder: '일정 검색', value: ui.q, oninput: debounce((e) => { ui.q = e.target.value; draw(); const sb = root.querySelector('.cal-banner input[type=search]'); sb.focus(); sb.setSelectionRange(sb.value.length, sb.value.length); }) })),
        h('span', { class: 'grow' }),
        h('button', { class: `btn tools-btn ${ui.tools ? 'on' : ''} ${ui.q || ui.mine ? 'dot-on' : ''}`, 'aria-expanded': String(ui.tools), onclick: () => { ui.tools = !ui.tools; banner.classList.toggle('tools-open', ui.tools); } }, '⚙ 보기'),
        addButtons(o, `${ymOf(ui.month)}-01`)),
      o.notices ? h('div', { class: 'banner-note' }) : null,
      legendEl,
      ui.mine ? h('div', { class: 'mine-bar' }, '👤 내 일정만 보는 중', h('button', { class: 'link-btn', onclick: () => { ui.mine = false; remember(`${key}_mine`, false); draw(); } }, '모두 보기')) : null);

    let body;
    if (ui.mode === 'scroll') body = scrollView(o, ctx, allByDate);
    else if (ui.mode === 'month') body = monthGrid(o, ui.month, ctx);
    else body = listView(o, ui.month, byDate);

    const keepY = ui.mode === 'scroll' && root._drawn ? window.scrollY : null;
    // 넓은 화면: 오른쪽에 선택한 날 · 다가오는 일정 (날짜 숫자를 누르면 그 날로)
    const side = o.side ? h('aside', { class: 'cal-side' }) : null;
    paintSide = () => { if (side) clear(side, sidePanel(o, ctx, ui.sel)); };
    paintSide();
    clear(root, banner, h('div', { class: `cal-layout ${side ? 'with-side' : ''}` }, h('div', { class: 'cal-main' }, body), side),
      h('p', { class: 'hint' }, '날짜 칸의 빈 곳을 누르면 그 날짜로 바로 입력합니다. 여러 날 일정은 이어진 막대로, 공휴일·방학은 빨간 날로 보입니다. 아래 분류를 누르면 그 분류를 숨깁니다.',
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
        if (ticking || Date.now() < (ui.lockUntil || 0)) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          // 요일 머리줄 바로 아래를 기준으로, 화면 위쪽 1/3 안에 들어온 달을 '보고 있는 달'로 봄
          const dowEl = root.querySelector('.sticky-dow');
          const top = dowEl ? dowEl.getBoundingClientRect().bottom : 50 + (getComputedStyle(banner).position === 'sticky' ? banner.offsetHeight : 0) + 40;
          const line = top + Math.max(60, (window.innerHeight - top) / 3);
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
      const grid = root.querySelector('.month-cal');
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

const icoOf = (it) => (it.icon && it.mod !== 'trips' ? h('span', { class: 'ci' }, it.icon) : null);
const openItem = (o, it) => { if (it.go) location.hash = it.go; else openRecordForm(it.mod, it.r, { onSaved: o.reload }); };

function chip(o, it) {
  return h('button', {
    class: `chip ${it.review ? 'review' : ''} ${it.cancel ? 'cancel' : ''}`,
    style: { '--c': it.color },
    title: [it.label, it.sub, it.r.data.place].filter(Boolean).join(' · '),
    onclick: (ev) => { ev.stopPropagation(); openItem(o, it); },
  }, icoOf(it), it.label, it.sub ? h('span', { class: 'chip-sub' }, ` ${it.sub}`) : null,
  it.r.data.source === '나이스' ? h('span', { class: 'neis-mark', title: '나이스에서 가져온 일정' }, 'N') : null);
}

// 하루 일정 모두 보기 (칸에 다 안 들어갈 때 「+N개」)
function dayModal(o, d, ctx) {
  const all = [...new Map((ctx.byDate[d] || []).map((it) => [`${it.mod}|${it.r.id}`, it])).values()].sort((a, b) => order(a) - order(b));
  const close = modal(`📅 ${fmtDate(d)} 일정 ${all.length}건`, h('ul', { class: 'list day-list' }, all.map((it) => h('li', { class: 'click', style: { '--c': it.color }, onclick: () => { close(); openItem(o, it); } },
    h('span', { class: 'dot' }), ' ', it.icon ? `${it.icon} ` : '', h('strong', {}, it.label), it.sub ? h('span', { class: 'muted small' }, ` · ${it.sub}`) : null,
    it.endDate && it.endDate !== it.date ? h('span', { class: 'muted small' }, ` (${fmtDate(it.date)} ~ ${fmtDate(it.endDate)})`) : null))),
  (o.add || []).some((t) => canEdit(t.mod)) ? [(c) => h('button', { class: 'btn primary', onclick: () => { c(); addAt(o, d); } }, '+ 이 날 추가')] : []);
}

// 날짜 칸: 머리(날짜·휴일 이름·메모·+) · 여러 날 막대 자리 · 하루짜리 일정 (4개 넘으면 「+N개」)
function dayCell(o, d, ctx, { col, lanes = 0, extraClass = '' } = {}) {
  const [y, m, dd] = d.split('-').map(Number);
  const dow = new Date(y, m - 1, dd).getDay();
  const hols = ctx.holidays[d] || [];
  const items = ctx.single[d] || [];
  const memos = items.filter((it) => it.memo);
  const list = items.filter((it) => !it.memo).sort((a, b) => order(a) - order(b));
  const MAX = 4;
  const shown = list.length > MAX ? list.slice(0, MAX - 1) : list;
  const canAdd = (o.add || []).some((t) => canEdit(t.mod));
  // 하루짜리 휴일은 날짜 옆에 빨간 글씨로 (여러 날 방학은 막대로)
  const holLabels = hols.filter((it) => !(it.endDate && it.endDate > it.date));
  return h('div', {
    class: `day ${dow === 0 || hols.length ? 'sun' : ''} ${hols.length ? 'holiday' : ''} ${dow === 6 ? 'sat' : ''} ${d === ctx.now ? 'today' : ''} ${d === ctx.sel ? 'picked' : ''} ${canAdd ? 'can-add' : ''} ${extraClass}`,
    'data-date': d,
    style: col !== undefined ? { gridColumn: String(col + 1), gridRow: '1 / -1' } : null,
    onclick: canAdd ? () => addAt(o, d) : null,
  },
  h('div', { class: 'day-head' },
    ctx.onPick ? h('button', { class: 'dnum', title: '이 날 일정 보기', onclick: (e) => { e.stopPropagation(); ctx.onPick(d); } }, dd === 1 ? `${m}/${dd}` : dd) : h('span', { class: 'dnum' }, dd === 1 ? `${m}/${dd}` : dd),
    holLabels.map((it) => h('button', { class: 'hol-name', title: it.label, onclick: (e) => { e.stopPropagation(); openItem(o, it); } }, it.label)),
    memos.map((it) => h('button', { class: 'memo', title: `메모: ${it.label}`, onclick: (e) => { e.stopPropagation(); openRecordForm('memos', it.r, { onSaved: o.reload }); } }, it.label)),
    canAdd ? h('button', { class: 'add-mini', title: '추가', onclick: (e) => { e.stopPropagation(); addAt(o, d); } }, '+') : null),
  lanes ? h('div', { class: 'lane-space', style: { height: `${lanes * 23}px` } }) : null,
  shown.map((it) => chip(o, it)),
  list.length > shown.length ? h('button', { class: 'more', onclick: (e) => { e.stopPropagation(); dayModal(o, d, ctx); } }, `+${list.length - shown.length}개`) : null);
}

// 오른쪽 칸: 선택한 날(기본 오늘) 일정 + 앞으로 2주 다가오는 일정 — 지금 켜 둔 분류·내 일정만 설정을 그대로 따름
function sidePanel(o, ctx, sel) {
  const uniq = (list) => [...new Map((list || []).map((it) => [`${it.mod}|${it.r.id}`, it])).values()].sort((a, b) => order(a) - order(b));
  const row = (it, showRange = true) => h('li', { class: 'click', style: { '--c': it.color }, onclick: () => openItem(o, it) },
    h('span', { class: 'sb-bar' }), h('div', { class: 'sb-txt' },
      h('div', { class: 'sb-title' }, it.icon && it.mod !== 'trips' ? `${it.icon} ` : '', it.label),
      h('div', { class: 'muted small' }, [it.sub, it.r.data.place, showRange && it.endDate && it.endDate > it.date ? `${fmtDate(it.date)} ~ ${fmtDate(it.endDate)}` : ''].filter(Boolean).join(' · '))));
  const selItems = uniq(ctx.byDate[sel]);
  const days = [];
  for (let i = 1; i <= 14 && days.length < 8; i++) {
    const d = addDays(ctx.now, i);
    const list = uniq(ctx.byDate[d]).filter((it) => !(it.endDate && it.endDate > it.date && it.date < d)); // 이어지는 일정은 시작일에만
    if (list.length) days.push([d, list]);
  }
  const canAdd = (o.add || []).some((t) => canEdit(t.mod));
  return h('div', { class: 'side-in' },
    h('section', { class: 'side-box' },
      h('div', { class: 'side-head' }, h('strong', {}, sel === ctx.now ? `오늘 · ${fmtDate(sel)}` : `📌 ${fmtDate(sel)}`),
        h('span', { class: 'grow' }), sel !== ctx.now && ctx.onPick ? h('button', { class: 'link-btn small', onclick: () => ctx.onPick(ctx.now) }, '오늘로') : null,
        canAdd ? h('button', { class: 'btn small', onclick: () => addAt(o, sel) }, '+ 추가') : null),
      (ctx.holidays[sel] || []).length ? h('div', { class: 'side-hol' }, `🎌 ${uniq(ctx.holidays[sel]).map((it) => it.label).join(', ')}`) : null,
      selItems.length ? h('ul', { class: 'side-list' }, selItems.map((it) => row(it))) : h('p', { class: 'muted small' }, '이 날 일정이 없습니다.')),
    h('section', { class: 'side-box' },
      h('div', { class: 'side-head' }, h('strong', {}, '⏭ 다가오는 일정'), h('span', { class: 'muted small' }, ' 2주')),
      days.length ? days.map(([d, list]) => h('div', { class: 'side-day' },
        h('button', { class: 'side-date', onclick: () => ctx.onPick?.(d) }, fmtDate(d), h('span', { class: 'muted small' }, ` · D-${Math.round((new Date(d) - new Date(ctx.now)) / 86400000)}`)),
        h('ul', { class: 'side-list' }, list.map((it) => row(it))))) : h('p', { class: 'muted small' }, '앞으로 2주 동안 일정이 없습니다.')),
    h('p', { class: 'muted small side-hint' }, '달력의 날짜 숫자를 누르면 여기에서 그 날 일정을 봅니다. 위 [보기]에서 켠 분류만 나옵니다.'));
}

const ORDER = ['휴일·방학', '전체행사', '회의', '대회출전', '연수', '학급수업', '특별수업', '동료장학', '출장', '기타'];
const order = (it) => { const i = ORDER.indexOf(it.cat); return i < 0 ? 50 : i; };

// 한 주 줄: 날짜 칸 7개 + 여러 날 일정은 칸을 가로지르는 막대 (겹치면 줄을 나눔)
function weekRow(o, days, ctx, { visible = () => true, extraClass = () => '', rowClass = '' } = {}) {
  const vis = days.map((d, i) => visible(d, i));
  const segs = ctx.spans.filter((it) => it.date <= days[6] && it.endDate >= days[0])
    .sort((a, b) => a.date.localeCompare(b.date) || b.endDate.localeCompare(a.endDate) || order(a) - order(b));
  const laneEnd = [];
  const placed = [];
  for (const it of segs) {
    const idx = days.map((d, i) => (vis[i] && d >= it.date && d <= it.endDate ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const s = idx[0]; const e = idx.at(-1);
    let lane = laneEnd.findIndex((end) => end < s);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(e); } else laneEnd[lane] = e;
    placed.push({ it, s, e, lane, head: days[s] === it.date, tail: days[e] === it.endDate });
  }
  const lanes = laneEnd.length;
  return h('div', { class: `calendar week ${rowClass}`, style: { gridTemplateRows: `26px ${'22px '.repeat(lanes)}minmax(0, 1fr)` } },
    days.map((d, i) => (vis[i] ? dayCell(o, d, ctx, { col: i, lanes, extraClass: extraClass(d) }) : h('div', { class: 'day empty', style: { gridColumn: String(i + 1), gridRow: '1 / -1' } }))),
    placed.map(({ it, s, e, lane, head, tail }) => h('button', {
      class: `span-bar ${head ? 'head' : ''} ${tail ? 'tail' : ''} ${it.cat === '휴일·방학' ? 'hol' : ''} ${it.cancel ? 'cancel' : ''}`,
      style: { gridColumn: `${s + 1} / ${e + 2}`, gridRow: String(lane + 2), '--c': it.color },
      title: `${it.label} (${fmtDate(it.date)} ~ ${fmtDate(it.endDate)})${it.sub ? ` · ${it.sub}` : ''}`,
      onclick: (ev) => { ev.stopPropagation(); openItem(o, it); },
    }, head ? null : h('span', { class: 'cont' }, '◀'), icoOf(it), it.label, it.sub && e > s ? h('span', { class: 'chip-sub' }, ` ${it.sub}`) : null, tail ? null : h('span', { class: 'cont' }, '▶'))));
}

// 배너의 월별 주요 안내: 전체 공지(해당 월) + 수업일수 + 작성/수정 · 머리줄을 눌러 접기/펼치기
function noticePanel(o, { y, m }, allByDate, open = true, toggle = null) {
  const ym = `${y}-${pad(m)}`;
  // 주요 안내: 전체 공지(해당 월) + '학사일정 주요 안내에 표시'한 공지(해당 월·마감 월) + 같은 표시를 한 그 달 전달사항
  const pins = (o.notices || []).filter((n) => (n.data.pinned || n.data.onCalendar) && (n.data.month || String(n.data.due || '').slice(0, 7)) === ym);
  const briefs = (o.briefings || []).filter((b) => b.data.onCalendar && String(b.data.date || '').startsWith(ym)).sort((a, b) => a.data.date.localeCompare(b.data.date));
  // 학사일정 등록 때 '주요 안내에 표시'한 일정 (그 달에 걸친 것)
  const evs = [...new Map((o.items || []).filter((it) => it?.mod === 'events' && it.r.data.onCalendar && it.r.data.date.slice(0, 7) <= ym && String(it.r.data.endDate || it.r.data.date).slice(0, 7) >= ym).map((it) => [it.r.id, it.r])).values()].sort((a, b) => a.data.date.localeCompare(b.data.date));
  const days = pins.map((n) => n.data.schoolDays).find(Boolean);
  const auto = schoolDays(y, m, allByDate);
  const count = pins.length + briefs.length + evs.length;
  const write = () => openRecordForm('notices', null, { defaults: { category: '월별 안내', pinned: true, month: ym, title: `${m}월 교육과정 주요 안내` }, onSaved: o.reload });
  return h('div', { class: `note-panel ${open ? '' : 'closed'}` },
    h('div', { class: 'np-head', onclick: toggle, title: open ? '눌러서 접기' : '눌러서 펼치기', role: toggle ? 'button' : null, 'aria-expanded': String(open) },
      h('span', { class: 'np-caret' }, open ? '▾' : '▸'),
      h('strong', {}, `📌 ${m}월 주요 안내`),
      h('span', { class: `tag ${count ? '' : 'ghost'}` }, count ? `${count}건` : '없음'),
      h('span', { class: 'mh-days' }, `수업일수 ${days || '-'}`, h('span', { class: 'muted' }, ` (자동 ${auto}일)`)),
      h('span', { class: 'grow' }),
      open && pins.length ? pins.map((n) => h('button', { class: 'link-btn', onclick: (e) => { e.stopPropagation(); openRecordForm('notices', n, { onSaved: o.reload }); } }, canEdit('notices') ? '수정' : '보기')) : null,
      open && canEdit('notices') ? h('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); write(); } }, pins.length ? '+ 추가' : '+ 작성') : null),
    !open ? null : [
      pins.length
        ? pins.map((n) => h('div', { class: 'np-body pre clamp-3', title: '눌러서 펼치기', onclick: (e) => e.currentTarget.classList.toggle('clamp-3') },
          n.data.title && pins.length > 1 ? h('strong', {}, `${n.data.title}\n`) : null,
          n.data.content && n.data.content !== '-' ? n.data.content : h('span', { class: 'muted' }, '(내용 없음)')))
        : briefs.length || evs.length ? null : h('div', { class: 'np-body muted' }, '등록된 주요 안내가 없습니다. 일정·공지·전달사항에서 "학사일정 주요 안내에 표시"를 체크하면 여기에 나옵니다.'),
      evs.length ? h('ul', { class: 'np-briefs' }, evs.map((e) => h('li', { class: 'click', onclick: () => openRecordForm('events', e, { onSaved: o.reload }) },
        h('span', { class: 'muted' }, `${Number(e.data.date.slice(5, 7))}/${Number(e.data.date.slice(8))}${e.data.endDate && e.data.endDate !== e.data.date ? `~${Number(e.data.endDate.slice(5, 7))}/${Number(e.data.endDate.slice(8))}` : ''} `),
        h('span', { class: 'tag ghost' }, '📅 일정'), ' ', String(e.data.title || '').split('\n')[0], e.data.target ? h('span', { class: 'muted small' }, ` · ${e.data.target}`) : null))) : null,
      briefs.length ? h('ul', { class: 'np-briefs' }, briefs.map((b) => h('li', { class: 'click', onclick: () => openRecordForm('briefings', b, { onSaved: o.reload }) },
        h('span', { class: 'muted' }, `${Number(b.data.date.slice(5, 7))}/${Number(b.data.date.slice(8))} `), b.data.kind ? h('span', { class: 'tag ghost' }, b.data.kind) : null, ' ', String(b.data.content || '').split('\n')[0]))) : null]);
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

function monthGrid(o, { y, m }, ctx) {
  const first = `${y}-${pad(m)}-01`;
  const last = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  let d = addDays(first, -new Date(y, m - 1, 1).getDay());
  const weeks = [];
  while (d <= last) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    weeks.push(weekRow(o, days, ctx, { visible: (x) => x >= first && x <= last, rowClass: days.includes(ctx.now) ? 'has-today' : '' }));
    d = addDays(d, 7);
  }
  return h('div', { class: 'scroll-cal month-cal' }, h('div', { class: 'calendar sticky-dow' }, DOW.map((x, i) => h('div', { class: `dow ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}` }, x))), weeks);
}

// 스크롤 보기: 학년도 전체(14개월)를 주 단위로 이어서, 달이 바뀌는 곳에 월 구분선
function scrollView(o, ctx, allByDate) {
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
    // 달 구분은 색 대신 구분선으로. 새 달이 시작되는 주의 앞쪽(지난달) 날짜만 흐리게
    out.push(weekRow(o, week, ctx, { visible: (x) => x >= from && x <= to, extraClass: (x) => (firstOfMonth && x < firstOfMonth ? 'other-month' : ''), rowClass: `${week.includes(ctx.now) ? 'has-today' : ''} ${firstOfMonth ? 'month-start' : ''}` }));
    d = addDays(d, 7);
  }
  return h('div', { class: 'scroll-cal' }, out);
}

function listView(o, { y, m }, byDate) {
  const last = new Date(y, m, 0).getDate();
  const rows = [];
  for (let d = 1; d <= last; d++) {
    const key = `${y}-${pad(m)}-${pad(d)}`;
    // 여러 날 일정은 시작일(이 달 첫날이면 그날)에 한 번만, 기간을 붙여 표시
    const items = (byDate[key] || []).filter((it) => !(it.endDate && it.endDate > it.date) || it.date === key || (d === 1 && it.date < key)).sort((a, b) => order(a) - order(b));
    items.forEach((it, i) => rows.push(h('tr', { class: 'click', onclick: () => openRecordForm(it.mod, it.r, { onSaved: o.reload }) },
      i === 0 ? h('td', { rowspan: items.length, class: 'nowrap' }, fmtDate(key)) : null,
      h('td', {}, h('span', { class: 'tag', style: { '--c': it.color } }, it.cat)),
      h('td', { class: 'pre' }, it.mod === 'events' ? it.r.data.title : it.label, it.endDate && it.endDate > it.date ? h('span', { class: 'muted small' }, ` (${fmtDate(it.date)} ~ ${fmtDate(it.endDate)})`) : null, it.review ? h('span', { class: 'badge warn' }, '확인필요') : null),
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
