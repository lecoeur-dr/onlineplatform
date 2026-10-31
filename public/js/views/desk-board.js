// ✨ 반짝 교실판 — 전자칠판에 하루 종일 켜 두는 학급 대시보드 (반짝 교실판 벤치마킹)
//   한 화면: 지금 교시·시계 / 시간표 / 전달사항 칠판 / 체크판(우유·숙제·준비물·출결) / 타이머 / 번호 뽑기 / 아래 도구
//   교실 화면에는 학생 이름 없이 번호만. 기록은 서버(classBoard 설정 1개 + boardDays 날짜별)에, 출결은 기존 출결 탭에 저장
import { h, api, clear, toast, modal, confirmBox, today, addDays, DOW } from '../ui.js';
import { state, remember } from '../state.js';
import { loadStudents, lessonsOn, dowOf, copyText } from './desk-common.js';
import { DEFAULT_BOARDS, DEFAULT_QUOTES, MOODS, fillTimes, periodState, boardStats, pickPool, makeGroups, durLabel, ddayLabel, parsePlaces, placeOf, gapName } from '../board-logic.js';

const ATT_CYCLE = ['', '결석', '지각', '조퇴'];
const ATT_CLS = { 결석: 'abs', 지각: 'late', 조퇴: 'early' };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const DAYS = ['월', '화', '수', '목', '금'];
// 받침에 맞춰 '로/으로' (과학실로, 체육관으로)
const ro = (w) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 && c % 28 !== 8 ? '으로' : '로'; };

function defaultConfig(size) {
  return { size: size || 25, boards: DEFAULT_BOARDS(), times: fillTimes(), places: { 과학: '과학실', 체육: '체육관', 음악: '음악실' }, chime: { on: true, min: 3 },
    quotes: DEFAULT_QUOTES.slice(), qi: 0, dday: { title: '', date: '' }, jar: { n: 0, goal: 30 }, notes: [], theme: 'green', dark: false };
}

// 서버 저장: 화면은 바로 바꾸고, 0.5초 모아서 저장. 다른 기기가 먼저 고쳤으면(409) 새로 받아 내 변경을 다시 얹음
function makeStore({ module, rec, create, refetch, onSaved }) {
  const st = { rec, ops: [], timer: null, busy: false };
  const flush = async () => {
    if (st.busy) { st.timer = setTimeout(flush, 300); return; }
    if (!st.ops.length) return;
    st.busy = true;
    const ops = st.ops; st.ops = [];
    try {
      const saved = st.rec.id
        ? await api(`/api/records/${module}/${st.rec.id}`, { method: 'PUT', body: { data: st.rec.data, version: st.rec.version } })
        : await api(`/api/records/${module}`, { method: 'POST', body: { data: st.rec.data, year: state.year } });
      st.rec.id = saved.id; st.rec.version = saved.version;
      onSaved?.();
    } catch (e) {
      if (e.status === 409) {
        const fresh = await refetch().catch(() => null);
        if (fresh) { for (const op of [...ops, ...st.ops]) op(fresh.data); st.rec = fresh; }
        st.ops = [...ops, ...st.ops];
        st.timer = setTimeout(flush, 200);
      } else { st.ops = [...ops, ...st.ops]; toast(`저장하지 못했습니다: ${e.message}`, 'error'); }
    } finally { st.busy = false; }
  };
  st.data = () => (st.rec ? st.rec.data : create());
  st.change = (op) => {
    if (!st.rec) st.rec = { id: null, version: 0, data: create() };
    op(st.rec.data); st.ops.push(op);
    clearTimeout(st.timer); st.timer = setTimeout(flush, 500);
  };
  st.pending = () => st.ops.length > 0 || st.busy;
  st.flush = () => { clearTimeout(st.timer); return flush(); };
  return st;
}

// 🔔 소리: WebAudio로 짧은 음 몇 개 (파일 없음)
let actx = null;
function chime(kind = 'bell') {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const notes = kind === 'end' ? [784, 659, 523, 659, 784] : kind === 'pop' ? [880] : [660, 880, 1046];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = actx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch { /* 소리를 못 내는 기기 */ }
}

let fontLoaded = false;
function loadFont() {
  if (fontLoaded) return; fontLoaded = true;
  document.head.append(h('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Gaegu:wght@700&family=Jua&display=swap' }));
}

export async function classBoardView(root) {
  loadFont();
  const t0 = today();
  const [studs, cfgRows, dayRows, tts, attRows, noteRows] = await Promise.all([
    loadStudents(),
    api(`/api/records/classBoard?year=${state.year}`, { fresh: true }),
    api(`/api/records/boardDays?year=${state.year}&date=${t0}`, { fresh: true }),
    api(`/api/records/myTimetable?year=${state.year}`),
    api(`/api/records/attendance?year=${state.year}`, { fresh: true }),
    api(`/api/records/dailyNotes?year=${state.year}&date=${t0}`, { fresh: true }),
  ]);
  const numOfName = new Map(studs.filter((s) => s.data.num).map((s) => [s.data.name, Number(s.data.num)]));
  const nameOfNum = new Map(studs.filter((s) => s.data.num).map((s) => [Number(s.data.num), s.data.name]));
  const numOf = (name) => numOfName.get(name) || Number(String(name).match(/^(\d+)번$/)?.[1]) || 0;
  const nameOf = (n) => nameOfNum.get(n) || `${n}번`;

  const cfgStore = makeStore({
    module: 'classBoard', rec: cfgRows[0] || null,
    create: () => ({ title: '', config: defaultConfig(studs.length) }),
    refetch: async () => (await api(`/api/records/classBoard?year=${state.year}`, { fresh: true }))[0],
  });
  const dayStore = makeStore({
    module: 'boardDays', rec: dayRows[0] || null,
    create: () => ({ date: t0, checks: {}, memo: {}, mood: {} }),
    refetch: async () => (await api(`/api/records/boardDays?year=${state.year}&date=${t0}`, { fresh: true }))[0],
  });
  const C = () => { const d = cfgStore.data(); if (!d.config) d.config = defaultConfig(studs.length); return d.config; };
  const D = () => dayStore.data();
  const setC = (fn) => cfgStore.change((d) => { if (!d.config) d.config = defaultConfig(studs.length); fn(d.config, d); });
  const setD = (fn) => dayStore.change((d) => { d.checks = d.checks || {}; d.memo = d.memo || {}; d.mood = d.mood || {}; fn(d); });

  // 오늘 출결 (기존 출결 탭 기록)
  let att = attRows.filter((r) => r.data.date === t0);
  const monthAbs = () => {
    const m = new Map();
    for (const r of attRows) if (r.data.type === '결석' && String(r.data.date).startsWith(t0.slice(0, 7))) { const n = numOf(r.data.student); if (n) m.set(n, (m.get(n) || 0) + 1); }
    return m;
  };
  const attOf = (n) => att.find((r) => numOf(r.data.student) === n);
  const absentNums = () => att.filter((r) => r.data.type === '결석').map((r) => numOf(r.data.student)).filter(Boolean);

  const ui = { tab: remember('cb_tab') || 'milk', exMode: false, viewDay: null, signal: '', timer: { total: 300, left: 300, run: false, id: null }, used: remember(`cb_used_${t0}`) || [], moodUndo: [], jarUndo: [] };
  const box = h('div', {});
  let tick = null; let poll = null;
  const alive = () => root.isConnected && box.isConnected;

  // ---------- 지금 교시 ----------
  const weekend = () => [0, 6].includes(dowOf(t0));
  const dayFor = () => (weekend() ? addDays(t0, dowOf(t0) === 6 ? 2 : 1) : t0);
  const lessons = (d) => lessonsOn(tts, d) || [];
  const nowState = () => periodState(C().times, lessons(t0), nowMin());
  const subjLabel = (p) => (p ? `${p.label} ${p.subject || ''}`.trim() : '');
  function nowCard() {
    const c = C();
    if (weekend()) {
      const s = periodState(c.times, lessons(dayFor()), -1);
      return { tag: '주말', sub: `${DOW[dowOf(dayFor())]}요일 시간표 미리 보기`, main: s.next ? `${subjLabel(s.next)} 준비` : '시간표를 넣어 주세요', right: '', pct: 0 };
    }
    const s = nowState();
    const place = (p) => placeOf(c.places, p?.subject);
    if (s.kind === 'none') return { tag: '시간표', sub: '⚙ 설정에서 교시 시각을 넣으면 지금 교시가 저절로 보여요', main: '오늘 시간표 없음', right: '', pct: 0 };
    if (s.kind === 'before') return { tag: '아침 시간', sub: `${DOW[dowOf(t0)]}요일`, main: `${subjLabel(s.next)} 준비`, right: `${durLabel(s.left)} 뒤 시작`, pct: 0, place: place(s.next) };
    if (s.kind === 'class') return { tag: '수업 중', sub: s.next ? `다음 ${subjLabel(s.next)}` : '마지막 교시', main: subjLabel(s.cur), right: `${durLabel(s.left)} 남음`, pct: 1 - s.left / s.total, place: place(s.cur), live: true };
    if (s.kind === 'break') return { tag: s.gap, sub: place(s.next) ? `📍 ${place(s.next)}${ro(place(s.next))} 이동` : '다음 수업 준비', main: `다음 ${subjLabel(s.next)}`, right: `${durLabel(s.left)} 뒤`, pct: 1 - s.left / s.total, place: place(s.next) };
    const tmr = addDays(t0, dowOf(t0) === 5 ? 3 : 1);
    const n = periodState(c.times, lessons(tmr), -1).next;
    return { tag: '하교', sub: '오늘 수업 끝! 수고했어요', main: n ? `${DOW[dowOf(tmr)]}요일 ${subjLabel(n)}` : '내일 만나요', right: '', pct: 1 };
  }
  // 수업 전 알림음 (교시마다 한 번)
  const rung = new Set();
  function checkChime() {
    const c = C();
    if (!c.chime?.on || weekend()) return;
    const s = nowState();
    if ((s.kind === 'break' || s.kind === 'before') && s.next && s.left === Number(c.chime.min || 3) && !rung.has(s.next.label)) {
      rung.add(s.next.label); chime('bell'); toast(`🔔 ${c.chime.min}분 뒤 ${subjLabel(s.next)}${placeOf(c.places, s.next.subject) ? ` · 📍${placeOf(c.places, s.next.subject)}` : ''}`);
    }
  }

  // ---------- 그리기 ----------
  const els = {};
  function drawAll() {
    const c = C();
    box.className = `cb t-${c.theme || 'green'} ${c.dark ? 'dark' : ''} ${ui.signal ? `sig-${ui.signal}` : ''}`;
    els.clock = h('div', { class: 'cb-clock' });
    els.now = h('div', { class: 'cb-now' });
    els.tt = h('section', { class: 'cb-card cb-tt' });
    els.notes = h('section', { class: 'cb-card cb-board' });
    els.checks = h('section', { class: 'cb-card cb-checks' });
    els.timer = h('section', { class: 'cb-card cb-timer' });
    els.pick = h('section', { class: 'cb-card cb-pick' });
    els.dock = h('div', { class: 'cb-dock' });
    els.head = h('div', { class: 'cb-title' });
    clear(box,
      h('header', { class: 'cb-top' },
        els.head,
        h('div', { class: 'cb-size' },
          h('button', { class: 'cb-round', 'aria-label': '학생 수 줄이기', onclick: () => { setC((x) => { x.size = Math.max(1, (x.size || 25) - 1); }); drawChecks(); drawPick(); drawSize(); } }, '−'),
          els.size = h('span', {}),
          h('button', { class: 'cb-round', 'aria-label': '학생 수 늘리기', onclick: () => { setC((x) => { x.size = Math.min(40, (x.size || 25) + 1); }); drawChecks(); drawPick(); drawSize(); } }, '+')),
        els.clock, els.now,
        h('div', { class: 'cb-btns' },
          h('button', { class: 'cb-icon', title: '칠판(어두운) 모드', 'aria-label': '칠판 모드', onclick: () => { setC((x) => { x.dark = !x.dark; }); box.classList.toggle('dark', C().dark); } }, '🌙'),
          h('button', { class: 'cb-icon', title: '전체화면', 'aria-label': '전체화면', onclick: toggleFull }, '⛶'),
          h('button', { class: 'cb-icon', title: '설정', 'aria-label': '설정', onclick: () => settings() }, '⚙'))),
      h('div', { class: 'cb-grid' }, els.tt, h('div', { class: 'cb-mid' }, els.notes, els.checks), h('div', { class: 'cb-right' }, els.timer, els.pick)),
      els.dock);
    drawHead(); drawSize(); drawClock(); drawTT(); drawNotes(); drawChecks(); drawTimer(); drawPick(); drawDock();
  }
  function drawHead() {
    const c = C();
    const q = c.quotes?.length ? c.quotes[(c.qi || 0) % c.quotes.length] : '';
    clear(els.head,
      h('h2', {}, cfgStore.data().title || '우리 반'),
      q ? h('div', { class: 'cb-quote' }, h('span', {}, q), c.quotes.length > 1 ? h('button', { class: 'cb-chip', onclick: () => { setC((x) => { x.qi = ((x.qi || 0) + 1) % x.quotes.length; }); drawHead(); } }, '다른 말') : null) : null);
  }
  const drawSize = () => { els.size.replaceChildren(h('b', {}, C().size || 25), h('small', {}, ' 명')); };
  function drawClock() {
    const d = new Date(); const hr = d.getHours();
    const c = C();
    const dd = c.dday?.date ? ddayLabel(c.dday.date, t0) : '';
    clear(els.clock,
      h('div', { class: 'cb-time' }, h('small', {}, hr < 12 ? '오전' : '오후'), h('b', {}, `${((hr + 11) % 12) + 1}`, h('i', {}, ':'), String(d.getMinutes()).padStart(2, '0')), h('em', {}, String(d.getSeconds()).padStart(2, '0'))),
      h('div', { class: 'cb-date' }, `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`, dd ? h('span', { class: 'cb-dday' }, `${c.dday.title || '행사'} `, h('b', {}, dd)) : null));
    const n = nowCard();
    clear(els.now,
      h('div', { class: 'cb-now-sub' }, h('span', { class: `cb-tag ${n.live ? 'live' : ''}` }, n.tag), n.sub),
      h('div', { class: 'cb-now-main' }, h('strong', {}, n.main), n.right ? h('span', {}, n.right) : null),
      h('div', { class: 'cb-bar' }, h('span', { style: { width: `${Math.round((n.pct || 0) * 100)}%` } })));
  }

  // 시간표
  function drawTT() {
    const c = C();
    const d0 = dayFor();
    const shown = ui.viewDay || DOW[dowOf(d0)];
    const off = DAYS.indexOf(shown) - DAYS.indexOf(DOW[dowOf(d0)]);
    const date = addDays(d0, off);
    const ls = lessons(date);
    const isToday = date === t0;
    const s = isToday ? nowState() : null;
    const rows = [];
    c.times.forEach((t, i) => {
      const l = ls.find((x) => Number(String(x.period).match(/\d+/)?.[0]) === i + 1) || ls[i];
      if (ls.length && (!l || !l.text)) return;
      const subject = l?.text ? String(l.text).split('\n')[0] : '';
      const cur = s && s.kind === 'class' && s.cur.i === i;
      const next = s && (s.kind === 'break' || s.kind === 'before') && s.next?.i === i;
      const place = placeOf(c.places, subject);
      const prev = rows.length ? c.times[i - 1] : null;
      if (prev) {
        const [ph, pm] = prev.end.split(':').map(Number); const [sh, sm] = t.start.split(':').map(Number);
        const gap = sh * 60 + sm - (ph * 60 + pm);
        if (gap >= 15) rows.push(h('div', { class: 'cb-gap' }, h('span', {}, gapName(gap)), h('span', {}, `${prev.end}~${t.start}`)));
      }
      rows.push(h('div', { class: `cb-period ${cur ? 'cur' : ''} ${next ? 'next' : ''}` },
        h('span', { class: 'cb-pn' }, i + 1),
        h('div', { class: 'cb-ps' }, h('strong', {}, subject || '—'), place ? h('small', {}, `📍 ${place}`) : null),
        h('div', { class: 'cb-pt' }, cur ? h('b', {}, `${durLabel(s.left)} 남음`) : next ? h('b', {}, `${durLabel(s.left)} 뒤`) : null, h('small', {}, `${t.start}~${t.end}`))));
    });
    clear(els.tt,
      h('div', { class: 'cb-card-head' }, h('h3', {}, `${shown}요일 시간표`), h('button', { class: 'cb-chip', onclick: () => settings('times') }, '시간·장소 설정')),
      h('div', { class: 'cb-days' }, DAYS.map((x) => h('button', { class: x === shown ? 'on' : '', onclick: () => { ui.viewDay = x; drawTT(); } }, x))),
      tts.length ? null : h('p', { class: 'cb-hint' }, '수업 → 내 시간표를 만들면 과목이 들어가요.'),
      h('div', { class: 'cb-plist' }, rows));
  }

  // 전달사항 칠판
  function drawNotes() {
    const c = C();
    const input = h('input', { placeholder: '전할 말을 쓰고 Enter', maxlength: 60, onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) add(); } });
    const add = () => {
      const v = input.value.trim(); if (!v) return;
      setC((x) => { x.notes = [...(x.notes || []), { id: Math.random().toString(36).slice(2, 9), text: v, star: false, since: t0 }]; });
      drawNotes(); setTimeout(() => els.notes.querySelector('input')?.focus(), 0);
    };
    const notes = c.notes || [];
    clear(els.notes,
      h('div', { class: 'cb-board-head' }, h('h3', {}, '전달사항', h('small', {}, ` ${notes.length}개`)), input,
        h('button', { class: 'cb-yellow', onclick: add }, '붙이기'),
        h('button', { class: 'cb-ghost', onclick: bigNotes, disabled: !notes.length }, '크게 보기')),
      notes.length ? h('ul', { class: 'cb-notes' }, notes.map((n) => h('li', { class: n.star ? 'star' : '' },
        h('button', { class: 'cb-star', 'aria-label': '중요 표시', onclick: () => { setC((x) => { const it = x.notes.find((y) => y.id === n.id); if (it) it.star = !it.star; }); drawNotes(); } }, '★'),
        h('span', { class: 'cb-ntext' }, n.text),
        n.since && n.since !== t0 ? h('small', {}, `${Number(n.since.slice(5, 7))}/${Number(n.since.slice(8))}부터`) : null,
        h('button', { class: 'cb-x', 'aria-label': '지우기', onclick: () => { setC((x) => { x.notes = x.notes.filter((y) => y.id !== n.id); }); drawNotes(); } }, '×'))))
        : h('p', { class: 'cb-chalk-empty' }, noteRows[0] ? h('button', { class: 'cb-ghost', onclick: fromDaily }, '📒 오늘 알림장에서 가져오기') : '오늘 전할 말을 붙여 보세요'));
  }
  function fromDaily() {
    const n = noteRows[0]; if (!n) return;
    const lines = String(n.data.content || '').split('\n').map((x) => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (n.data.supplies) lines.push(`준비물: ${n.data.supplies}`);
    if (n.data.homework) lines.push(`숙제: ${n.data.homework}`);
    setC((x) => { const have = new Set((x.notes || []).map((y) => y.text)); x.notes = [...(x.notes || []), ...lines.filter((l) => !have.has(l)).map((text) => ({ id: Math.random().toString(36).slice(2, 9), text, star: false, since: t0 }))]; });
    drawNotes();
  }
  function bigNotes() {
    const notes = (C().notes || []).slice().sort((a, b) => b.star - a.star);
    overlay('📌 전달사항', h('ul', { class: 'cb-notes big' }, notes.map((n) => h('li', { class: n.star ? 'star' : '' }, h('span', { class: 'cb-star' }, '★'), h('span', { class: 'cb-ntext' }, n.text)))), { chalk: true });
  }

  // 체크판
  function drawChecks() {
    const c = C(); const d = D();
    const size = c.size || 25;
    const abs = absentNums();
    const boards = c.boards?.length ? c.boards : DEFAULT_BOARDS();
    if (ui.tab !== 'att' && !boards.some((b) => b.id === ui.tab)) ui.tab = boards[0].id;
    const tabs = h('div', { class: 'cb-tabs' },
      boards.map((b) => { const st = boardStats(size, d.checks?.[b.id] || [], b.excl || [], abs); return h('button', { class: `${ui.tab === b.id ? 'on' : ''} ${st.complete ? 'done' : ''}`, onclick: () => { ui.tab = b.id; ui.exMode = false; remember('cb_tab', b.id); drawChecks(); } },
        h('span', {}, b.icon), h('b', {}, b.name), h('em', {}, `${st.done}/${st.target}`), h('i', { style: { width: `${st.target ? (st.done / st.target) * 100 : 0}%` } })); }),
      (() => { const n = size - abs.length; return h('button', { class: ui.tab === 'att' ? 'on' : '', onclick: () => { ui.tab = 'att'; remember('cb_tab', 'att'); drawChecks(); } }, h('span', {}, '🙋'), h('b', {}, '출결'), h('em', {}, `${n}/${size}`), h('i', { style: { width: `${(n / size) * 100}%` } })); })());
    if (ui.tab === 'att') return clear(els.checks, tabs, attPanel(size));
    const b = boards.find((x) => x.id === ui.tab);
    const checked = new Set((d.checks?.[b.id] || []).map(Number));
    const excl = new Set((b.excl || []).map(Number));
    const st = boardStats(size, [...checked], [...excl], abs);
    const toggle = (n) => {
      if (ui.exMode) { setC((x) => { const bb = x.boards.find((y) => y.id === b.id); const s = new Set((bb.excl || []).map(Number)); s.has(n) ? s.delete(n) : s.add(n); bb.excl = [...s].sort((p, q) => p - q); }); drawChecks(); return; }
      if (abs.includes(n) || excl.has(n)) return;
      setD((x) => { const s = new Set((x.checks[b.id] || []).map(Number)); s.has(n) ? s.delete(n) : s.add(n); x.checks[b.id] = [...s].sort((p, q) => p - q); });
      const after = boardStats(size, D().checks[b.id], [...excl], abs);
      if (after.complete && !st.complete) { chime('end'); toast(`${b.icon} ${b.name} 모두 완료! 🎉`); }
      drawChecks();
    };
    const memo = h('input', { class: 'cb-memo', placeholder: `오늘 ${b.name} 내용 (예: 흰 우유 · 2교시 끝나고)`, value: d.memo?.[b.id] || '', onchange: (e) => { setD((x) => { x.memo[b.id] = e.target.value.trim(); }); } });
    const skipTxt = [abs.length ? `결석 ${abs.length}` : '', excl.size ? `${b.exLabel || '빼기'} ${excl.size}` : ''].filter(Boolean).join(' · ');
    clear(els.checks, tabs,
      h('div', { class: 'cb-chk-head' },
        h('span', { class: 'cb-chk-ico' }, b.icon),
        h('div', { class: 'grow' }, h('strong', {}, b.name), memo),
        h('div', { class: `cb-count ${st.complete ? 'done' : ''}` }, h('b', {}, st.done), h('span', {}, `/${st.target}명`), skipTxt ? h('small', {}, `${skipTxt} 빼고`) : null)),
      ui.exMode ? h('p', { class: 'cb-exhint' }, `✋ 매일 빼는 번호(${b.exLabel || '빼기'})를 누르세요. 다 했으면 [완료]`) : null,
      h('div', { class: `cb-nums ${ui.exMode ? 'ex' : ''}`, style: { '--cols': size > 30 ? 8 : 7 } }, Array.from({ length: size }, (_, i) => i + 1).map((n) => {
        const isAbs = abs.includes(n); const isEx = excl.has(n); const on = checked.has(n);
        return h('button', { class: `cb-num ${on && !isAbs && !isEx ? 'on' : ''} ${isAbs ? 'abs' : ''} ${isEx ? 'ex' : ''}`, 'aria-label': `${n}번 ${on ? '체크됨' : ''}`, onclick: () => toggle(n) },
          h('b', {}, n), isAbs ? h('small', {}, '결석') : isEx ? h('small', {}, b.exLabel || '빼기') : null);
      })),
      h('div', { class: 'cb-chk-foot' },
        st.left.length ? h('div', { class: 'cb-left' }, h('span', {}, '아직'), st.left.slice(0, 14).map((n) => h('i', {}, n)), st.left.length > 14 ? h('span', {}, `+${st.left.length - 14}`) : null)
          : h('div', { class: 'cb-left ok' }, st.target ? '🎉 모두 했어요!' : ''),
        h('span', { class: 'grow' }),
        h('button', { class: `cb-btn ${ui.exMode ? 'on' : ''}`, onclick: () => { ui.exMode = !ui.exMode; drawChecks(); } }, ui.exMode ? '완료' : '빼는 번호'),
        h('button', { class: 'cb-btn', onclick: () => { setD((x) => { x.checks[b.id] = st.left.concat([...checked]).filter((n, i, a) => a.indexOf(n) === i).sort((p, q) => p - q); }); drawChecks(); } }, '모두 체크'),
        h('button', { class: 'cb-btn', onclick: () => { setD((x) => { x.checks[b.id] = []; }); drawChecks(); } }, '비우기')));
  }
  function attPanel(size) {
    const cycle = async (n) => {
      const r = attOf(n);
      const cur = r?.data.type || '';
      const next = ATT_CYCLE[(ATT_CYCLE.indexOf(ATT_CYCLE.includes(cur) ? cur : '') + 1) % ATT_CYCLE.length];
      try {
        if (!next) { await api(`/api/records/attendance/${r.id}`, { method: 'DELETE' }); att = att.filter((x) => x !== r); } else if (r) { const saved = await api(`/api/records/attendance/${r.id}`, { method: 'PUT', body: { data: { ...r.data, type: next }, version: r.version } }); Object.assign(r, saved); } else { const saved = await api('/api/records/attendance', { method: 'POST', body: { data: { date: t0, student: nameOf(n), type: next } } }); att.push(saved); }
      } catch (e) { toast(e.message, 'error'); }
      drawChecks(); drawPick();
    };
    const ma = monthAbs();
    const counts = { 결석: 0, 지각: 0, 조퇴: 0 };
    for (const r of att) if (counts[r.data.type] !== undefined) counts[r.data.type]++;
    return h('div', {},
      h('div', { class: 'cb-chk-head' }, h('span', { class: 'cb-chk-ico' }, '🙋'),
        h('div', { class: 'grow' }, h('strong', {}, '출결'), h('div', { class: 'cb-hint' }, '번호를 누를 때마다 결석 → 지각 → 조퇴 → 출석. 출결 탭에 함께 저장돼요 (나이스 입력 전 메모용).')),
        h('div', { class: 'cb-count' }, h('b', {}, size - counts.결석), h('span', {}, `/${size}명`), h('small', {}, `결석 ${counts.결석} · 지각 ${counts.지각} · 조퇴 ${counts.조퇴}`))),
      h('div', { class: 'cb-nums att', style: { '--cols': size > 30 ? 8 : 7 } }, Array.from({ length: size }, (_, i) => i + 1).map((n) => {
        const ty = attOf(n)?.data.type || '';
        return h('button', { class: `cb-num ${ATT_CLS[ty] || 'here'}`, onclick: () => cycle(n) }, h('b', {}, n), ty ? h('small', {}, ty) : null);
      })),
      ma.size ? h('div', { class: 'cb-chk-foot' }, h('div', { class: 'cb-left' }, h('span', {}, `${Number(t0.slice(5, 7))}월 결석`), [...ma].sort((a, b) => a[0] - b[0]).map(([n, k]) => h('i', {}, `${n}번 ${k}`)))) : null);
  }

  // 집중 타이머
  function timerFace(big) {
    const T = ui.timer;
    const R = 80; const Cc = 2 * Math.PI * R;
    const frac = T.total ? T.left / T.total : 0;
    const mm = Math.floor(T.left / 60); const ss = T.left % 60;
    const svg = `<svg viewBox="0 0 200 200" class="cb-ring"><circle cx="100" cy="100" r="${R}" class="trk"/><circle cx="100" cy="100" r="${R}" class="arc" stroke-dasharray="${Cc}" stroke-dashoffset="${Cc * (1 - frac)}" transform="rotate(-90 100 100)"/></svg>`;
    return h('div', { class: `cb-face ${big ? 'big' : ''} ${T.left === 0 && T.total ? 'end' : ''}` }, h('div', { html: svg }), h('b', {}, `${mm}:${String(ss).padStart(2, '0')}`));
  }
  const timerBig = { el: null };
  function setTimer(sec, add) {
    const T = ui.timer;
    if (add) { T.left += sec; T.total = Math.max(T.total, T.left); } else { T.total = sec; T.left = sec; stopTimer(); }
    drawTimer();
  }
  function stopTimer() { clearInterval(ui.timer.id); ui.timer.id = null; ui.timer.run = false; }
  function startTimer() {
    const T = ui.timer;
    if (T.run) { stopTimer(); drawTimer(); return; }
    if (!T.left) T.left = T.total;
    if (!T.left) return;
    chime('pop');
    T.run = true;
    T.id = setInterval(() => {
      if (!alive()) { stopTimer(); return; }
      T.left = Math.max(0, T.left - 1);
      if (!T.left) { stopTimer(); chime('end'); setTimeout(() => chime('end'), 900); }
      drawTimer();
    }, 1000);
    drawTimer();
  }
  function drawTimer() {
    const T = ui.timer;
    clear(els.timer,
      h('div', { class: 'cb-card-head' }, h('h3', {}, '집중 타이머'), h('small', {}, T.run ? '진행 중' : T.left === 0 && T.total ? '끝!' : '준비')),
      h('div', { class: 'cb-timer-body' }, timerFace(false),
        h('div', { class: 'cb-tbtns' },
          h('div', { class: 'cb-presets' }, [1, 3, 5, 10, 15].map((m) => h('button', { class: !T.run && T.total === m * 60 ? 'on' : '', onclick: () => setTimer(m * 60) }, `${m}분`)), h('button', { onclick: () => setTimer(60, true) }, '+1분')),
          h('button', { class: 'cb-main', onclick: startTimer }, T.run ? '멈춤' : T.left && T.left < T.total ? '계속' : '시작'),
          h('div', { class: 'cb-row2' }, h('button', { class: 'cb-btn', onclick: () => { stopTimer(); T.left = T.total; drawTimer(); } }, '처음으로'),
            h('button', { class: 'cb-btn', onclick: () => { timerBig.el = h('div', { class: 'cb-big-timer' }); overlay('⏱ 집중 타이머', timerBig.el, { onClose: () => { timerBig.el = null; } }); drawTimer(); } }, '크게 보기')))));
    if (timerBig.el?.isConnected) clear(timerBig.el, timerFace(true), h('div', { class: 'cb-row2 center' }, h('button', { class: 'cb-main', onclick: startTimer }, T.run ? '멈춤' : '시작'), h('button', { class: 'cb-btn', onclick: () => setTimer(60, true) }, '+1분')));
  }

  // 번호 뽑기
  function drawPick() {
    const c = C(); const size = c.size || 25;
    const noRep = remember('cb_norep') ?? true;
    const pool = pickPool(size, absentNums(), ui.used, noRep);
    const ball = h('div', { class: 'cb-ball' }, ui.last ? String(ui.last) : '?');
    const roll = () => {
      let p = pickPool(size, absentNums(), ui.used, noRep);
      if (!p.length) { if (!noRep) return; ui.used = []; remember(`cb_used_${t0}`, []); p = pickPool(size, absentNums(), [], true); toast('한 바퀴 다 돌아서 처음부터 다시 뽑아요.'); }
      let k = 0;
      ball.classList.add('rolling');
      const spin = setInterval(() => {
        ball.textContent = String(p[Math.floor(Math.random() * p.length)]);
        if (++k > 14) {
          clearInterval(spin);
          const n = p[Math.floor(Math.random() * p.length)];
          ui.last = n; ball.textContent = String(n); ball.classList.remove('rolling'); chime('pop');
          if (noRep) { ui.used = [...ui.used, n]; remember(`cb_used_${t0}`, ui.used); }
          setTimeout(drawPick, 700);
        }
      }, 70);
    };
    clear(els.pick,
      h('div', { class: 'cb-card-head' }, h('h3', {}, '번호 뽑기'), h('small', {}, `남은 번호 ${pool.length}개`)),
      h('div', { class: 'cb-pick-body' }, ball,
        h('div', { class: 'cb-tbtns' },
          h('button', { class: 'cb-main', onclick: roll }, '뽑기'),
          h('label', { class: 'cb-switch' }, h('input', { type: 'checkbox', checked: noRep, onchange: (e) => { remember('cb_norep', e.target.checked); drawPick(); } }), h('span', {}), ' 뽑힌 번호 빼고 뽑기'),
          ui.used.length ? h('div', { class: 'cb-used' }, ui.used.slice(-10).map((n, i, a) => h('i', { class: i === a.length - 1 ? 'last' : '' }, n))) : null,
          h('button', { class: 'cb-btn', onclick: () => { ui.used = []; ui.last = null; remember(`cb_used_${t0}`, []); drawPick(); } }, '처음부터 다시'))));
  }

  // ---------- 아래 도구 ----------
  function drawDock() {
    const c = C(); const d = D();
    const moodN = Object.values(d.mood || {}).reduce((a, x) => a + (Number(x) || 0), 0);
    const jar = c.jar || { n: 0, goal: 30 };
    clear(els.dock,
      h('button', { class: 'cb-tool t1', onclick: groupsTool }, h('span', {}, '👥'), '모둠 편성'),
      h('button', { class: 'cb-tool t2', onclick: signalTool }, h('span', { class: `cb-dot ${ui.signal}` }), '소음 신호등'),
      h('button', { class: 'cb-tool t3', onclick: dailyTool }, h('span', {}, '📢'), '알림장'),
      h('button', { class: 'cb-tool t4', onclick: moodTool }, h('span', {}, '☀️'), '기분 날씨', moodN ? h('em', {}, moodN) : null),
      h('button', { class: 'cb-tool t5', onclick: jarTool }, h('span', {}, '🍯'), '칭찬 구슬병', h('em', {}, `${jar.n}/${jar.goal}`)),
      h('span', { class: 'grow' }),
      h('span', { class: 'cb-foot' }, '번호만 써요 · 기록은 서버에 저장돼 다른 기기에서도 이어져요'));
  }
  function overlay(title, body, { chalk, onClose } = {}) {
    const close = modal(title, h('div', { class: `cb-ov ${chalk ? 'chalk' : ''}` }, body), [], { wide: true });
    const wrap = document.querySelector('.modal-wrap:last-child');
    wrap?.classList.add('cb-modal', `t-${C().theme || 'green'}`);
    if (onClose) { const obs = new MutationObserver(() => { if (!wrap.isConnected) { obs.disconnect(); onClose(); } }); obs.observe(document.body, { childList: true }); }
    return close;
  }
  function groupsTool() {
    const size = C().size || 25;
    const nums = pickPool(size, absentNums(), [], false);
    let n = remember('cb_groups_n') || 4;
    const out = h('div', { class: 'cb-groups' });
    const shuffleIt = () => { const gs = makeGroups(nums, n); clear(out, gs.map((g, i) => h('div', { class: 'cb-group' }, h('strong', {}, `${i + 1}모둠`), h('div', {}, g.map((x) => h('i', {}, x)))))); chime('pop'); };
    const sel = h('div', { class: 'cb-presets' });
    const drawSel = () => clear(sel, [2, 3, 4, 5, 6, 7, 8].map((k) => h('button', { class: k === n ? 'on' : '', onclick: () => { n = k; remember('cb_groups_n', k); drawSel(); shuffleIt(); } }, `${k}모둠`)));
    drawSel();
    overlay('👥 모둠 편성', h('div', {}, h('p', { class: 'cb-hint' }, `결석 빼고 ${nums.length}명을 번호로 섞어요.`), sel, h('button', { class: 'cb-main', onclick: shuffleIt }, '섞기'), out));
    shuffleIt();
  }
  // 소음 신호등: 직접 켜기 + 마이크 자동(소리는 저장·전송하지 않음)
  let mic = null;
  function setSignal(s) { ui.signal = s; box.classList.remove('sig-red', 'sig-yellow', 'sig-green'); if (s) box.classList.add(`sig-${s}`); drawDock(); }
  function signalTool() {
    const lights = h('div', { class: 'cb-lights' });
    const meter = h('div', { class: 'cb-meter' }, h('span', {}));
    let sens = remember('cb_sens') ?? 50;
    const draw = () => clear(lights,
      [['red', '멈춰요', '🛑'], ['yellow', '속닥속닥', '🤫'], ['green', '집중해요', '✏️']].map(([k, label, ico]) => h('button', { class: `cb-light ${k} ${ui.signal === k ? 'on' : ''}`, onclick: () => { setSignal(k); draw(); } }, h('span', {}, ico), label)),
      h('button', { class: 'cb-btn', onclick: () => { setSignal(''); draw(); } }, '끄기'));
    const micBtn = h('button', { class: 'cb-btn' }, mic ? '🎤 자동 끄기' : '🎤 마이크로 자동');
    const stopMic = () => { if (mic) { mic.stream.getTracks().forEach((t) => t.stop()); cancelAnimationFrame(mic.raf); mic = null; } micBtn.textContent = '🎤 마이크로 자동'; };
    micBtn.onclick = async () => {
      if (mic) { stopMic(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const src = actx.createMediaStreamSource(stream); const an = actx.createAnalyser(); an.fftSize = 512; src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        mic = { stream, raf: 0 }; micBtn.textContent = '🎤 자동 끄기';
        let hold = 0;
        const loop = () => {
          if (!mic) return;
          if (!alive()) { stopMic(); return; }
          an.getByteTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
          const lvl = Math.min(1, Math.sqrt(sum / buf.length) * (1 + sens / 12));
          meter.firstChild.style.width = `${Math.round(lvl * 100)}%`;
          const want = lvl > 0.6 ? 'red' : lvl > 0.3 ? 'yellow' : 'green';
          if (want !== ui.signal && ++hold > 20) { hold = 0; setSignal(want); draw(); } else if (want === ui.signal) hold = 0;
          mic.raf = requestAnimationFrame(loop);
        };
        loop();
      } catch { toast('마이크를 쓸 수 없어요. 브라우저에서 마이크 권한을 허용해 주세요.', 'error'); }
    };
    draw();
    overlay('🚦 소음 신호등', h('div', {}, lights,
      h('div', { class: 'cb-mic' }, micBtn, meter, h('label', { class: 'cb-hint' }, '민감도 ', h('input', { type: 'range', min: 0, max: 100, value: sens, oninput: (e) => { sens = Number(e.target.value); remember('cb_sens', sens); } }))),
      h('p', { class: 'cb-hint' }, '고른 신호는 교실판 테두리 색으로 계속 보여요. 마이크 소리는 이 기기에서 크기만 재고, 녹음하거나 보내지 않아요.')), { onClose: () => {} });
  }
  function dailyTool() {
    const n = noteRows[0];
    overlay('📢 오늘 알림장', n ? h('div', { class: 'cb-daily' },
      h('ol', {}, String(n.data.content || '').split('\n').map((x) => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).map((x) => h('li', {}, x))),
      n.data.supplies ? h('p', {}, h('b', {}, '🎒 준비물 '), n.data.supplies) : null,
      n.data.homework ? h('p', {}, h('b', {}, '📝 숙제 '), n.data.homework) : null,
      h('div', { class: 'cb-row2' }, h('button', { class: 'cb-btn', onclick: () => { fromDaily(); toast('전달사항 칠판에 붙였어요.'); } }, '전달사항에 붙이기'), h('a', { class: 'cb-btn', href: '#/desk/lesson/notes' }, '알림장 고치기')))
      : h('div', {}, h('p', {}, '오늘 쓴 알림장이 없어요.'), h('a', { class: 'cb-main', href: '#/desk/lesson/notes' }, '알림장 쓰러 가기')), { chalk: true });
  }
  function moodTool() {
    const body = h('div', {});
    const draw = () => {
      const m = D().mood || {};
      const total = Object.values(m).reduce((a, x) => a + (Number(x) || 0), 0);
      clear(body,
        h('p', { class: 'cb-hint' }, '오늘 내 기분은? 한 사람이 한 번씩 눌러요 (이름·번호는 남지 않아요).'),
        h('div', { class: 'cb-moods' }, MOODS.map((x) => h('button', { onclick: () => { setD((d) => { d.mood[x.key] = (Number(d.mood[x.key]) || 0) + 1; }); ui.moodUndo.push(x.key); chime('pop'); draw(); drawDock(); } },
          h('span', {}, x.icon), h('b', {}, x.label), h('em', {}, m[x.key] || 0), h('i', { style: { height: `${total ? ((m[x.key] || 0) / total) * 100 : 0}%` } })))),
        h('div', { class: 'cb-row2' }, h('span', { class: 'grow' }, `모두 ${total}명`),
          h('button', { class: 'cb-btn', disabled: !ui.moodUndo.length, onclick: () => { const k = ui.moodUndo.pop(); if (k) setD((d) => { d.mood[k] = Math.max(0, (Number(d.mood[k]) || 0) - 1); }); draw(); drawDock(); } }, '방금 누른 것 취소')));
    };
    draw();
    overlay('☀️ 기분 날씨', body);
  }
  function jarTool() {
    const body = h('div', {});
    const draw = () => {
      const j = C().jar || { n: 0, goal: 30 };
      const full = j.n >= j.goal;
      const pct = Math.min(1, j.n / (j.goal || 1));
      const marbles = Array.from({ length: Math.min(j.n, 60) }, (_, i) => h('i', { style: { '--h': `${(i * 47) % 360}` } }));
      clear(body,
        h('div', { class: `cb-jar ${full ? 'full' : ''}` }, h('div', { class: 'cb-jar-glass' }, h('div', { class: 'cb-jar-fill', style: { height: `${pct * 100}%` } }), h('div', { class: 'cb-marbles' }, marbles)), h('b', {}, `${j.n} / ${j.goal}`)),
        full ? h('p', { class: 'cb-yay' }, '🎉 구슬병이 가득 찼어요! 약속한 보상을 함께 정해요') : h('p', { class: 'cb-hint' }, `${j.goal - j.n}개 더 모으면 가득 차요.`),
        h('div', { class: 'cb-row2 center' },
          h('button', { class: 'cb-main', onclick: () => { setC((x) => { x.jar = { ...(x.jar || { goal: 30 }), n: (x.jar?.n || 0) + 1 }; }); ui.jarUndo.push(1); chime(C().jar.n >= C().jar.goal ? 'end' : 'pop'); draw(); drawDock(); } }, '칭찬 구슬 하나 🫙'),
          h('button', { class: 'cb-btn', onclick: () => { setC((x) => { x.jar = { ...x.jar, n: Math.max(0, (x.jar?.n || 0) - 1) }; }); draw(); drawDock(); } }, '하나 빼기'),
          h('button', { class: 'cb-btn', onclick: async () => { if (!(await confirmBox('구슬병을 비우고 새 병으로 시작할까요?'))) return; setC((x) => { x.jar = { ...x.jar, n: 0 }; }); draw(); drawDock(); } }, '새 병으로')),
        h('label', { class: 'cb-hint' }, '목표 구슬 수 ', h('input', { type: 'number', min: 5, max: 200, value: j.goal, style: { width: '80px' }, onchange: (e) => { const g = Math.max(5, Math.min(200, Number(e.target.value) || 30)); setC((x) => { x.jar = { ...x.jar, goal: g }; }); draw(); drawDock(); } })));
    };
    draw();
    overlay('🍯 칭찬 구슬병', body);
  }

  // ---------- 설정 ----------
  function settings(focus) {
    const c = JSON.parse(JSON.stringify(C()));
    const title = h('input', { value: cfgStore.data().title || '', placeholder: '예) 5학년 2반' });
    const size = h('input', { type: 'number', min: 1, max: 40, value: c.size || 25 });
    const boardsBox = h('div', { class: 'cb-set-boards' });
    const drawBoards = () => clear(boardsBox, c.boards.map((b, i) => h('div', { class: 'cb-set-row' },
      h('input', { value: b.icon, maxlength: 2, style: { width: '52px' }, oninput: (e) => { b.icon = e.target.value; } }),
      h('input', { value: b.name, placeholder: '판 이름', oninput: (e) => { b.name = e.target.value; } }),
      h('input', { value: b.exLabel || '빼기', placeholder: '빼는 번호 이름', title: '매일 빼는 번호 이름 (예: 안 마심)', style: { width: '110px' }, oninput: (e) => { b.exLabel = e.target.value; } }),
      c.boards.length > 1 ? h('button', { class: 'btn small danger ghost', onclick: () => { c.boards.splice(i, 1); drawBoards(); } }, '빼기') : null)),
      c.boards.length < 5 ? h('button', { class: 'btn small', onclick: () => { c.boards.push({ id: Math.random().toString(36).slice(2, 8), name: '새 판', icon: '✅', exLabel: '빼기', excl: [] }); drawBoards(); } }, '+ 체크판 추가') : null);
    drawBoards();
    const timesBox = h('div', {});
    const drawTimes = () => clear(timesBox, h('table', { class: 'table compact' }, h('tbody', {}, c.times.map((t, i) => h('tr', {},
      h('th', {}, t.label), h('td', {}, h('input', { type: 'time', value: t.start, onchange: (e) => { t.start = e.target.value; } })), h('td', {}, '~'), h('td', {}, h('input', { type: 'time', value: t.end, onchange: (e) => { t.end = e.target.value; } })),
      h('td', {}, i === c.times.length - 1 && c.times.length > 1 ? h('button', { class: 'link-btn small', onclick: () => { c.times.pop(); drawTimes(); } }, '빼기') : null))))),
    c.times.length < 9 ? h('button', { class: 'btn small', onclick: () => { const last = c.times.at(-1); c.times.push({ label: `${c.times.length + 1}교시`, start: last?.end || '09:00', end: last?.end || '09:40' }); drawTimes(); } }, '+ 교시') : null);
    drawTimes();
    const fill = { start: h('input', { type: 'time', value: c.times[0]?.start || '09:00' }), lesson: h('input', { type: 'number', value: 40, style: { width: '64px' } }), rest: h('input', { type: 'number', value: 10, style: { width: '64px' } }), longAfter: h('input', { type: 'number', value: 2, style: { width: '56px' } }), longRest: h('input', { type: 'number', value: 20, style: { width: '64px' } }), lunchAfter: h('input', { type: 'number', value: 4, style: { width: '56px' } }), lunch: h('input', { type: 'number', value: 50, style: { width: '64px' } }), count: h('input', { type: 'number', value: c.times.length || 6, style: { width: '56px' } }) };
    const places = h('textarea', { rows: 4, placeholder: '과학=과학실\n체육=체육관', value: Object.entries(c.places || {}).map(([k, v]) => `${k}=${v}`).join('\n') });
    const chOn = h('input', { type: 'checkbox', checked: c.chime?.on !== false });
    const chMin = h('input', { type: 'number', min: 1, max: 10, value: c.chime?.min || 3, style: { width: '64px' } });
    const quotes = h('textarea', { rows: 4, value: (c.quotes || []).join('\n') });
    const ddT = h('input', { value: c.dday?.title || '', placeholder: '예) 학급 발표회' });
    const ddD = h('input', { type: 'date', value: c.dday?.date || '' });
    const theme = h('select', {}, [['green', '🌿 초록 교실'], ['cork', '📌 코르크 게시판']].map(([v, l]) => h('option', { value: v, selected: (c.theme || 'green') === v }, l)));
    const sec = (id, head, ...kids) => h('details', { class: 'cb-set', open: !focus || focus === id, id: `cbs-${id}` }, h('summary', {}, head), ...kids);
    const save = (close) => h('button', { class: 'btn primary', onclick: () => {
      c.size = Math.max(1, Math.min(40, Number(size.value) || 25));
      c.boards = c.boards.map((b) => ({ ...b, name: b.name.trim() || '체크', icon: b.icon.trim() || '✅' }));
      c.times = c.times.map((t, i) => ({ ...t, label: `${i + 1}교시` }));
      c.places = parsePlaces(places.value);
      c.chime = { on: chOn.checked, min: Math.max(1, Math.min(10, Number(chMin.value) || 3)) };
      c.quotes = quotes.value.split('\n').map((x) => x.trim()).filter(Boolean);
      c.qi = 0;
      c.dday = { title: ddT.value.trim(), date: ddD.value };
      c.theme = theme.value;
      cfgStore.change((d) => { d.title = title.value.trim(); d.config = { ...d.config, ...c, jar: d.config?.jar || c.jar, notes: d.config?.notes || c.notes }; });
      close(); drawAll(); toast('설정을 저장했습니다.');
    } }, '저장');
    modal('⚙ 교실판 설정', h('div', { class: 'form cb-settings' },
      sec('basic', '🏫 학급', h('div', { class: 'grid-2' }, h('label', {}, h('span', {}, '학급 이름'), title), h('label', {}, h('span', {}, '학생 수'), size), h('label', {}, h('span', {}, '디자인'), theme))),
      sec('boards', '☑️ 체크판 (번호로 체크, 날마다 새로)', boardsBox, h('p', { class: 'muted small' }, '매일 빼는 번호(우유 안 마시는 학생 등)는 체크판의 [빼는 번호]에서 고릅니다.')),
      sec('times', '🕘 교시 시각 · 이동 장소', timesBox,
        h('div', { class: 'cb-fill' }, h('b', {}, '한 번에 채우기 '), '시작 ', fill.start, ' 수업 ', fill.lesson, '분 · 쉬는 시간 ', fill.rest, '분 · ', fill.longAfter, '교시 뒤 중간놀이 ', fill.longRest, '분 · ', fill.lunchAfter, '교시 뒤 점심 ', fill.lunch, '분 · ', fill.count, '교시까지 ',
          h('button', { class: 'btn small', onclick: () => { c.times = fillTimes({ start: fill.start.value, lesson: +fill.lesson.value, rest: +fill.rest.value, longAfter: +fill.longAfter.value, longRest: +fill.longRest.value, lunchAfter: +fill.lunchAfter.value, lunch: +fill.lunch.value, count: Math.max(1, Math.min(9, +fill.count.value)) }); drawTimes(); } }, '이대로 채우기')),
        h('label', {}, h('span', {}, '과목별 이동 장소 (한 줄에 하나: 과목=장소)'), places)),
      sec('chime', '🔔 수업 전 알림음', h('div', { class: 'row-actions' }, h('label', { class: 'inline' }, chOn, ' 켜기'), '수업 ', chMin, '분 전에 울리기', h('button', { class: 'btn small', onclick: () => chime('bell') }, '미리 듣기')),
        h('p', { class: 'muted small' }, '전자칠판에서는 화면을 한 번 눌러야 소리가 나요(브라우저 규칙).')),
      sec('extra', '💬 오늘의 한마디 · D-day', h('label', {}, h('span', {}, '한마디 (한 줄에 하나, [다른 말]로 바뀜)'), quotes), h('div', { class: 'grid-2' }, h('label', {}, h('span', {}, 'D-day 이름'), ddT), h('label', {}, h('span', {}, '날짜'), ddD))),
      sec('data', '📋 오늘 기록', h('div', { class: 'row-actions' },
        h('button', { class: 'btn small', onclick: () => copyText(todayText()) }, '오늘 기록 복사'),
        h('button', { class: 'btn small danger ghost', onclick: async () => { if (!(await confirmBox('오늘 체크판·기분 날씨 기록을 모두 지울까요? (출결·전달사항은 그대로)'))) return; setD((d) => { d.checks = {}; d.memo = {}; d.mood = {}; }); drawAll(); } }, '오늘 기록 지우기')),
        h('p', { class: 'muted small' }, '체크판은 날마다 새로 시작하고, 지난 날 기록은 서버에 날짜별로 남습니다.'))),
    [(cl) => h('button', { class: 'btn', onclick: cl }, '취소'), save], { wide: true });
    if (focus) setTimeout(() => document.getElementById(`cbs-${focus}`)?.scrollIntoView({ block: 'start' }), 50);
  }
  function todayText() {
    const c = C(); const d = D(); const abs = absentNums();
    const lines = [`[${t0} ${cfgStore.data().title || '우리 반'} 교실판]`];
    for (const b of c.boards) { const st = boardStats(c.size, d.checks?.[b.id] || [], b.excl || [], abs); lines.push(`${b.icon} ${b.name} ${st.done}/${st.target}${st.left.length ? ` · 아직 ${st.left.join(', ')}번` : ''}${d.memo?.[b.id] ? ` (${d.memo[b.id]})` : ''}`); }
    const byType = {}; for (const r of att) (byType[r.data.type] = byType[r.data.type] || []).push(numOf(r.data.student) || r.data.student);
    lines.push(`🙋 출결: ${Object.keys(byType).length ? Object.entries(byType).map(([k, v]) => `${k} ${v.join(', ')}번`).join(' / ') : '모두 출석'}`);
    const m = d.mood || {}; if (Object.values(m).some(Boolean)) lines.push(`☀️ 기분: ${MOODS.map((x) => `${x.icon}${m[x.key] || 0}`).join(' ')}`);
    if (c.notes?.length) lines.push(`📌 전달사항: ${c.notes.map((n) => n.text).join(' / ')}`);
    return lines.join('\n');
  }

  // 전체화면: 앱 머리·메뉴를 숨기고 교실판만
  function toggleFull() {
    const on = !document.body.classList.contains('cb-full');
    document.body.classList.toggle('cb-full', on);
    try { if (on) document.documentElement.requestFullscreen?.(); else if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* 무시 */ }
  }
  const onFs = () => { if (!document.fullscreenElement) document.body.classList.remove('cb-full'); };
  document.addEventListener('fullscreenchange', onFs);
  const unlock = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { /* 무시 */ } };
  box.addEventListener('pointerdown', unlock, { once: true });

  drawAll();
  clear(root, h('div', { class: 'cb-wrap' }, box));

  // 1초마다 시계, 분이 바뀌면 시간표, 20초마다 다른 기기 변경 받아 오기
  let lastMin = nowMin();
  tick = setInterval(() => {
    if (!alive()) { clearInterval(tick); clearInterval(poll); document.removeEventListener('fullscreenchange', onFs); document.body.classList.remove('cb-full'); return; }
    if (t0 !== today()) { clearInterval(tick); clearInterval(poll); classBoardView(root); return; } // 자정 지나면 새 날
    drawClock(); checkChime();
    if (nowMin() !== lastMin) { lastMin = nowMin(); drawTT(); }
  }, 1000);
  poll = setInterval(async () => {
    if (!alive() || document.hidden || dayStore.pending() || cfgStore.pending() || document.querySelector('.modal-wrap') || box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    try {
      const [dr, cr, ar] = await Promise.all([
        api(`/api/records/boardDays?year=${state.year}&date=${t0}`, { fresh: true }),
        api(`/api/records/classBoard?year=${state.year}`, { fresh: true }),
        api(`/api/records/attendance?year=${state.year}&date=${t0}`, { fresh: true }),
      ]);
      if (dayStore.pending() || cfgStore.pending()) return;
      let changed = false;
      if (dr[0] && dr[0].version !== dayStore.rec?.version) { dayStore.rec = dr[0]; changed = true; }
      if (cr[0] && cr[0].version !== cfgStore.rec?.version) { cfgStore.rec = cr[0]; changed = true; }
      const sig = (l) => l.map((r) => `${r.id}:${r.version}`).sort().join(',');
      if (sig(ar) !== sig(att)) { att = ar; changed = true; }
      if (changed) { drawHead(); drawSize(); drawNotes(); drawChecks(); drawPick(); drawDock(); drawTT(); }
    } catch { /* 다음에 다시 */ }
  }, 20000);
}
