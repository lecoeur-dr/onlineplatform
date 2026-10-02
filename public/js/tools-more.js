// 🧰 Teachshop 기본 도구 v3: 어느 교실 도구 모음에나 있는 범용 도구 (시계·스톱워치·사다리·빙고·효과음 등)
//   형식은 tools.js 와 같음: { id, name, icon, desc, cat, color, roster, run(el, ctx) }
import { h, clear, toast } from './ui.js';

const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const lines = (s) => String(s || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const needRoster = (ctx) => (ctx.students.length ? null : h('div', { class: 'alert warn' }, '이 도구는 학생 명단을 씁니다. ', h('a', { href: '#/desk/class/students' }, 'Deskterior → 학급 → 명단 관리에서 입력 →')));
const live = (el, fn, ms) => { const id = setInterval(() => { if (!el.isConnected) { clearInterval(id); return; } fn(); }, ms); return id; };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 효과음: 파일 없이 브라우저에서 바로 만든 소리
let AC = null;
const ac = () => { AC ||= new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; };
function tone(freq, start, dur, { type = 'sine', vol = 0.25, slide } = {}) {
  const a = ac(); const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (slide) o.frequency.linearRampToValueAtTime(slide, a.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + start); g.gain.exponentialRampToValueAtTime(vol, a.currentTime + start + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination); o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
}
function noise(start, dur, vol = 0.3, decay = true) {
  const a = ac(); const n = Math.floor(a.sampleRate * dur); const buf = a.createBuffer(1, n, a.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (decay ? (1 - i / n) ** 3 : 1);
  const s = a.createBufferSource(); const g = a.createGain(); g.gain.value = vol; s.buffer = buf; s.connect(g).connect(a.destination); s.start(a.currentTime + start);
}
export const SOUNDS = [
  ['🔔', '딩동댕', () => { tone(523, 0, 0.45); tone(659, 0.35, 0.45); tone(784, 0.7, 0.8); }],
  ['⭕', '정답', () => { tone(880, 0, 0.18, { type: 'triangle' }); tone(1175, 0.16, 0.35, { type: 'triangle' }); }],
  ['❌', '땡 (오답)', () => tone(150, 0, 0.7, { type: 'square', vol: 0.18 })],
  ['🛎', '종소리', () => { [1, 2.76, 5.4].forEach((m, i) => tone(660 * m, 0, 1.8 - i * 0.4, { vol: 0.2 / (i + 1) })); }],
  ['👏', '박수', () => { for (let i = 0; i < 14; i++) noise(i * 0.09 + Math.random() * 0.04, 0.08, 0.5); }],
  ['🥁', '두구두구', () => { for (let i = 0; i < 28; i++) noise(i * 0.06, 0.05, 0.25 + i * 0.01); noise(1.75, 0.9, 0.45); tone(90, 1.75, 0.5, { vol: 0.3 }); }],
  ['📯', '팡파레', () => { [[523, 0, 0.18], [523, 0.2, 0.18], [523, 0.4, 0.18], [659, 0.6, 0.5], [523, 1.1, 0.25], [659, 1.35, 0.25], [784, 1.6, 0.9]].forEach(([f, s, d]) => tone(f, s, d, { type: 'sawtooth', vol: 0.12 })); }],
  ['😮', '띠용', () => tone(300, 0, 0.6, { type: 'sine', slide: 900, vol: 0.3 })],
  ['⏰', '알람', () => { for (let i = 0; i < 6; i++) tone(i % 2 ? 1046 : 880, i * 0.18, 0.16, { type: 'square', vol: 0.12 }); }],
  ['🎵', '집중 차임', () => { tone(784, 0, 0.6); tone(659, 0.45, 0.6); tone(523, 0.9, 1.0); }],
];

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export const chosung = (w) => [...String(w)].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');

// 사다리: 가로줄 무작위(같은 높이에 붙은 가로줄 없음)
export function makeLadder(n, levels = 12) {
  const rungs = Array.from({ length: levels }, () => Array(Math.max(0, n - 1)).fill(false));
  for (const row of rungs) for (let i = 0; i < n - 1; i++) if (!row[i - 1] && Math.random() < 0.45) row[i] = true;
  // 모든 기둥 사이에 가로줄이 하나 이상
  for (let i = 0; i < n - 1; i++) if (!rungs.some((r) => r[i])) { const r = rungs.find((x) => !x[i - 1] && !x[i + 1]) || rungs[0]; r[i] = true; if (r[i - 1]) r[i - 1] = false; if (r[i + 1]) r[i + 1] = false; }
  return rungs;
}
export const ladderEnd = (rungs, start) => { let c = start; for (const r of rungs) { if (r[c]) c++; else if (c > 0 && r[c - 1]) c--; } return c; };

export const MORE_TOOLS = [
  {
    id: 'clock', name: '큰 시계', icon: '🕰', color: '#0f766e', cat: '수업 도구', roster: false,
    desc: '아날로그·디지털 시계와 날짜·요일을 크게. 쉬는 시간·시작 시각 안내',
    run(el, ctx) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 200 200'); svg.classList.add('aclock');
      svg.innerHTML = `<circle cx="100" cy="100" r="96" class="face"/>${Array.from({ length: 60 }, (_, i) => `<line x1="100" y1="${i % 5 ? 10 : 8}" x2="100" y2="${i % 5 ? 14 : 22}" transform="rotate(${i * 6} 100 100)" class="${i % 5 ? 'tick' : 'tick big'}"/>`).join('')}${Array.from({ length: 12 }, (_, i) => { const a = ((i + 1) * 30 - 90) * Math.PI / 180; return `<text x="${100 + 70 * Math.cos(a)}" y="${100 + 70 * Math.sin(a) + 6}" text-anchor="middle" class="num">${i + 1}</text>`; }).join('')}<line id="hh" x1="100" y1="100" x2="100" y2="52" class="hand h"/><line id="mm" x1="100" y1="100" x2="100" y2="30" class="hand m"/><line id="ss" x1="100" y1="112" x2="100" y2="24" class="hand s"/><circle cx="100" cy="100" r="4" class="pin"/>`;
      const dig = h('div', { class: 'tool-clock small' });
      const date = h('div', { class: 'center big-date' });
      let mode = ctx.load('mode') || 'both';
      const wrap = h('div', { class: 'clock-wrap' });
      const tick = () => {
        const d = new Date(); const s = d.getSeconds(); const m = d.getMinutes(); const hr = d.getHours();
        svg.querySelector('#hh').setAttribute('transform', `rotate(${(hr % 12) * 30 + m / 2} 100 100)`);
        svg.querySelector('#mm').setAttribute('transform', `rotate(${m * 6 + s / 10} 100 100)`);
        svg.querySelector('#ss').setAttribute('transform', `rotate(${s * 6} 100 100)`);
        dig.textContent = `${hr < 12 ? '오전' : '오후'} ${hr % 12 || 12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        date.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
      };
      const draw = () => { ctx.save('mode', mode); clear(wrap, mode !== 'digital' ? svg : null, mode !== 'analog' ? dig : null); };
      clear(el, wrap, date, h('div', { class: 'tool-bar' }, [['both', '둘 다'], ['analog', '아날로그'], ['digital', '디지털']].map(([v, l]) => h('button', { class: 'btn', onclick: () => { mode = v; draw(); } }, l))));
      draw(); tick(); live(el, tick, 1000);
    },
  },
  {
    id: 'stopwatch', name: '스톱워치', icon: '⏱', color: '#be123c', cat: '수업 도구', roster: false,
    desc: '1/100초 스톱워치와 구간 기록(랩). 달리기·과학 실험·발표 시간 재기',
    run(el) {
      const disp = h('div', { class: 'tool-clock' }, '00:00.00');
      const laps = h('ol', { class: 'lap-list' });
      let t0 = 0; let acc = 0; let id = null; let lastLap = 0;
      const now = () => acc + (id ? performance.now() - t0 : 0);
      const fmt = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms / 10) % 100).padStart(2, '0')}`;
      const paint = () => { disp.textContent = fmt(now()); };
      const start = () => { if (id) return; t0 = performance.now(); id = live(el, paint, 31); };
      const stop = () => { if (!id) return; acc = now(); clearInterval(id); id = null; paint(); };
      clear(el, disp, h('div', { class: 'tool-bar' },
        h('button', { class: 'btn primary big', onclick: () => (id ? stop() : start()) }, '▶ 시작 / ⏸ 멈춤'),
        h('button', { class: 'btn big', onclick: () => { const t = now(); laps.prepend(h('li', {}, h('strong', {}, fmt(t)), h('span', { class: 'muted small' }, ` (+${fmt(t - lastLap)})`))); lastLap = t; } }, '🏁 구간'),
        h('button', { class: 'btn', onclick: () => { stop(); acc = 0; lastLap = 0; clear(laps); paint(); } }, '처음으로')), laps,
        h('p', { class: 'hint center' }, '스페이스 키: 시작/멈춤'));
      const key = (e) => { if (!el.isConnected) { document.removeEventListener('keydown', key); return; } if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); if (id) stop(); else start(); } };
      document.addEventListener('keydown', key);
    },
  },
  {
    id: 'ladder', name: '사다리 타기', icon: '🪜', color: '#9333ea', cat: '수업 활동', roster: true,
    desc: '이름과 결과를 넣고 사다리 타기. 역할 정하기·벌칙·순서 정하기',
    run(el, ctx) {
      const who = h('textarea', { rows: 2, placeholder: '참가자 (쉼표·줄바꿈)', value: ctx.load('who') || ctx.students.slice(0, 6).map((s) => s.name).join(', ') || '가, 나, 다, 라' });
      const res = h('textarea', { rows: 2, placeholder: '결과 (참가자 수만큼, 모자라면 꽝)', value: ctx.load('res') || '당첨, 꽝, 꽝, 꽝' });
      const stage = h('div', { class: 'ladder' });
      let names = []; let outs = []; let rungs = []; let cv = null;
      const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];
      const geo = () => { const w = cv.width; const hgt = cv.height; const gap = w / names.length; return { x: (i) => gap * (i + 0.5), y: (l) => 12 + (hgt - 24) * ((l + 1) / (rungs.length + 1)), hgt }; };
      const base = () => {
        const g = cv.getContext('2d'); const { x, y, hgt } = geo();
        g.clearRect(0, 0, cv.width, cv.height); g.strokeStyle = getComputedStyle(cv).color; g.lineWidth = 3; g.lineCap = 'round';
        names.forEach((_, i) => { g.beginPath(); g.moveTo(x(i), 4); g.lineTo(x(i), hgt - 4); g.stroke(); });
        rungs.forEach((r, l) => r.forEach((on, i) => { if (on) { g.beginPath(); g.moveTo(x(i), y(l)); g.lineTo(x(i + 1), y(l)); g.stroke(); } }));
      };
      const trace = (start, color) => new Promise((done) => {
        const { x, y, hgt } = geo(); const pts = [[x(start), 4]]; let c = start;
        rungs.forEach((r, l) => { if (r[c]) { pts.push([x(c), y(l)], [x(c + 1), y(l)]); c++; } else if (c > 0 && r[c - 1]) { pts.push([x(c), y(l)], [x(c - 1), y(l)]); c--; } });
        pts.push([x(c), hgt - 4]);
        const g = cv.getContext('2d'); g.strokeStyle = color; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
        let k = 1;
        const step = () => { if (k >= pts.length) { done(c); return; } g.beginPath(); g.moveTo(...pts[k - 1]); g.lineTo(...pts[k]); g.stroke(); k++; setTimeout(step, 70); };
        step();
      });
      const make = () => {
        names = lines(who.value).slice(0, 12); ctx.save('who', who.value); ctx.save('res', res.value);
        if (names.length < 2) { toast('참가자를 2명 이상 넣어 주세요.', 'error'); return; }
        outs = lines(res.value); while (outs.length < names.length) outs.push('꽝'); outs = outs.slice(0, names.length);
        rungs = makeLadder(names.length);
        cv = h('canvas', { class: 'ladder-cv' });
        const results = names.map(() => h('div', { class: 'ladder-res' }, '?'));
        const tops = names.map((n, i) => h('button', { class: 'ladder-top', style: { '--c': COLORS[i % 10] }, onclick: async (e) => { e.currentTarget.disabled = true; const end = await trace(i, COLORS[i % 10]); results[end].textContent = `${outs[end]} ← ${n}`; results[end].style.setProperty('--c', COLORS[i % 10]); results[end].classList.add('on'); } }, n));
        clear(stage, h('div', { class: 'ladder-row', style: { gridTemplateColumns: `repeat(${names.length}, 1fr)` } }, tops), cv,
          h('div', { class: 'ladder-row', style: { gridTemplateColumns: `repeat(${names.length}, 1fr)` } }, outs.map((o, i) => h('div', { class: 'ladder-out' }, h('div', { class: 'muted small' }, o), results[i]))));
        requestAnimationFrame(() => { const r = cv.getBoundingClientRect(); cv.width = r.width; cv.height = r.height; base(); });
        stage._all = async () => { for (let i = 0; i < tops.length; i++) if (!tops[i].disabled) tops[i].click(); };
      };
      clear(el, needRoster(ctx), h('div', { class: 'tool-two' }, h('label', {}, '참가자', who), h('label', {}, '결과', res)),
        h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary', onclick: make }, '🪜 사다리 만들기'), h('button', { class: 'btn', onclick: () => stage._all?.() }, '모두 공개'),
          ctx.students.length ? h('button', { class: 'btn small', onclick: () => { who.value = shuffle(ctx.students).slice(0, 8).map((s) => s.name).join(', '); } }, '명단에서 8명') : null),
        stage);
      make();
    },
  },
  {
    id: 'bingo', name: '빙고', icon: '🔠', color: '#0369a1', cat: '수업 활동', roster: true,
    desc: '낱말을 넣으면 학생마다 다른 빙고판을 인쇄하고, 교사 화면에서 낱말을 하나씩 부르기',
    run(el, ctx) {
      const ta = h('textarea', { rows: 4, placeholder: '낱말 (쉼표·줄바꿈). 3×3은 9개, 4×4는 16개, 5×5는 25개 이상', value: ctx.load('words') || '사과, 바나나, 포도, 딸기, 수박, 참외, 복숭아, 자두, 귤, 배, 감, 키위, 망고, 레몬, 체리, 블루베리' });
      const size = h('select', {}, [3, 4, 5].map((n) => h('option', { value: n, selected: n === (ctx.load('size') || 4) }, `${n}×${n}`)));
      const big = h('div', { class: 'tool-big' }, '빙고!');
      const called = h('div', { class: 'tool-chips' });
      let deck = [];
      const words = () => [...new Set(lines(ta.value))];
      const start = () => { ctx.save('words', ta.value); deck = shuffle(words()); clear(called); big.textContent = '준비!'; };
      const next = () => { if (!deck.length) start(); const w = deck.pop(); big.textContent = w; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); called.prepend(h('span', { class: 'tag big' }, w)); };
      const print = () => {
        const n = Number(size.value); ctx.save('size', n); const ws = words();
        if (ws.length < n * n) { toast(`${n}×${n} 빙고에는 낱말이 ${n * n}개 이상 필요합니다. (지금 ${ws.length}개)`, 'error'); return; }
        const names = ctx.students.length ? ctx.students.map((s) => s.name) : Array.from({ length: 4 }, (_, i) => `${i + 1}`);
        const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const boards = names.map((nm) => { const pick = shuffle(ws).slice(0, n * n); return `<div class="b"><div class="nm">${esc(nm)}</div><table>${Array.from({ length: n }, (_, r) => `<tr>${pick.slice(r * n, r * n + n).map((w) => `<td>${esc(w)}</td>`).join('')}</tr>`).join('')}</table></div>`; }).join('');
        const w = window.open('', '_blank'); if (!w) { toast('팝업을 허용해 주세요.', 'error'); return; }
        w.document.write(`<!doctype html><meta charset="utf-8"><title>빙고판</title><style>body{font-family:'맑은 고딕',sans-serif;display:flex;flex-wrap:wrap;gap:14px;margin:12px}.b{width:46%;page-break-inside:avoid}.nm{font-weight:700;margin-bottom:4px}table{border-collapse:collapse;width:100%}td{border:2px solid #333;height:${n === 5 ? 52 : 64}px;text-align:center;font-size:${n === 5 ? 13 : 16}px;width:${100 / n}%}</style>${boards}`);
        w.document.close(); setTimeout(() => w.print(), 300);
      };
      clear(el, big, h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary big', onclick: next }, '다음 낱말'), h('button', { class: 'btn', onclick: start }, '처음부터'), size, h('button', { class: 'btn', onclick: print }, `🖨 학생별 빙고판 인쇄${ctx.students.length ? ` (${ctx.students.length}장)` : ''}`)),
        h('div', { class: 'muted small' }, '부른 낱말'), called, h('details', { class: 'card' }, h('summary', {}, '낱말 편집'), ta));
      start();
    },
  },
  {
    id: 'coin', name: '동전 던지기', icon: '🪙', color: '#a16207', cat: '수업 도구', roster: false,
    desc: '앞/뒤 동전 던지기. 선공 정하기·확률 수업에서 횟수 세기',
    run(el, ctx) {
      const coin = h('div', { class: 'coin' }, h('div', { class: 'coin-face' }, '앞'));
      const stat = h('div', { class: 'center muted' });
      const cnt = ctx.load('cnt') || { 앞: 0, 뒤: 0 };
      const paint = () => { const t = cnt.앞 + cnt.뒤; stat.textContent = t ? `앞 ${cnt.앞} · 뒤 ${cnt.뒤} (앞 ${Math.round((cnt.앞 / t) * 100)}%)` : '눌러서 던지기'; };
      const flip = () => {
        const r = Math.random() < 0.5 ? '앞' : '뒤';
        coin.classList.remove('flip'); void coin.offsetWidth; coin.classList.add('flip');
        setTimeout(() => { coin.firstChild.textContent = r; coin.classList.toggle('tail', r === '뒤'); cnt[r]++; ctx.save('cnt', cnt); paint(); }, 600);
      };
      clear(el, h('div', { class: 'center', onclick: flip }, coin), stat, h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary big', onclick: flip }, '🪙 던지기'),
        h('button', { class: 'btn', onclick: () => { cnt.앞 = 0; cnt.뒤 = 0; ctx.save('cnt', cnt); paint(); } }, '횟수 지우기')));
      paint();
    },
  },
  {
    id: 'sounds', name: '효과음', icon: '🔊', color: '#7c2d12', cat: '학급 운영', roster: false,
    desc: '딩동댕·정답·땡·박수·두구두구·팡파레 등 수업 효과음 (소리 파일 없이 바로)',
    run(el) {
      clear(el, h('div', { class: 'sound-grid' }, SOUNDS.map(([ic, name, play]) => h('button', { class: 'sound-btn', onclick: (e) => { try { play(); } catch { toast('이 브라우저에서는 소리를 낼 수 없습니다.', 'error'); } e.currentTarget.classList.remove('pop'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('pop'); } },
        h('span', { class: 'sound-ico' }, ic), h('span', {}, name)))),
      h('p', { class: 'hint center' }, '교실 스피커 음량을 먼저 확인하세요. 숫자 키 1~0으로도 재생됩니다.'));
      const key = (e) => { if (!el.isConnected) { document.removeEventListener('keydown', key); return; } if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const i = '1234567890'.indexOf(e.key); if (i >= 0 && SOUNDS[i]) SOUNDS[i][2](); };
      document.addEventListener('keydown', key);
    },
  },
  {
    id: 'banner', name: '전광판', icon: '📢', color: '#b91c1c', cat: '학급 운영', roster: false,
    desc: '큰 글씨가 흐르는 전광판. 오늘의 목표·안내·축하 메시지',
    run(el, ctx) {
      const text = h('input', { value: ctx.load('t') || '오늘도 함께 즐겁게! 🌈', style: { minWidth: '260px' } });
      const speed = h('select', {}, [[16, '느리게'], [10, '보통'], [6, '빠르게']].map(([v, l]) => h('option', { value: v, selected: v === (ctx.load('sp') || 10) }, l)));
      const colors = ['#facc15', '#f87171', '#4ade80', '#60a5fa', '#ffffff', '#f472b6'];
      let color = ctx.load('c') || colors[0];
      const run = h('div', { class: 'marquee-text' });
      const board = h('div', { class: 'marquee' }, run);
      const paint = () => { ctx.save('t', text.value); ctx.save('sp', Number(speed.value)); ctx.save('c', color); run.textContent = text.value; run.style.color = color; run.style.animationDuration = `${speed.value}s`; };
      text.addEventListener('input', paint); speed.addEventListener('change', paint);
      clear(el, board, h('div', { class: 'tool-bar' }, text, speed, colors.map((c) => h('button', { class: 'swatch', style: { background: c, width: '28px', height: '28px' }, onclick: () => { color = c; paint(); } }))),
        h('p', { class: 'hint center' }, '[전체 화면] 버튼으로 크게 띄우세요.'));
      paint();
    },
  },
  {
    id: 'chosung', name: '초성 퀴즈', icon: '🔤', color: '#047857', cat: '수업 활동', roster: false,
    desc: '낱말을 넣으면 초성만 크게 보여 주고, 힌트·정답 공개. 어휘 복습',
    run(el, ctx) {
      const ta = h('textarea', { rows: 4, value: ctx.load('w') || '광합성 | 식물이 빛으로 양분을 만드는 일\n민주주의\n분수의 나눗셈\n혼합물' });
      const big = h('div', { class: 'tool-big chosung' });
      const sub = h('div', { class: 'center muted' });
      let list = []; let i = 0; let stage = 0;
      const load = () => { ctx.save('w', ta.value); list = shuffle(ta.value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0])); i = 0; show(0); };
      const show = (s) => { stage = s; const c = list[i]; if (!c) { big.textContent = '낱말을 넣어 주세요'; return; } big.textContent = s === 2 ? c[0] : chosung(c[0]); sub.textContent = `${i + 1} / ${list.length}${s >= 1 && c[1] ? ` · 힌트: ${c[1]}` : ''}${s === 1 && !c[1] ? ` · 첫 글자: ${c[0][0]}` : ''}`; big.classList.toggle('answer', s === 2); };
      clear(el, big, sub, h('div', { class: 'tool-bar' },
        h('button', { class: 'btn', onclick: () => show(Math.max(stage, 1)) }, '💡 힌트'),
        h('button', { class: 'btn primary', onclick: () => show(2) }, '정답'),
        h('button', { class: 'btn', onclick: () => { i = (i + 1) % Math.max(1, list.length); show(0); } }, '다음 ▶')),
      h('details', { class: 'card' }, h('summary', {}, '낱말 편집 (한 줄에 "낱말 | 힌트")'), ta, h('button', { class: 'btn small', onclick: load }, '적용')));
      load();
    },
  },
  {
    id: 'speed', name: '스피드 퀴즈', icon: '⚡', color: '#c2410c', cat: '수업 활동', roster: false,
    desc: '제한 시간 안에 설명해서 맞히기. 맞힘·통과 개수 자동 집계',
    run(el, ctx) {
      const ta = h('textarea', { rows: 4, value: ctx.load('w') || '지구, 태양, 화산, 지진, 날씨, 구름, 온도계, 자석, 전구, 그림자' });
      const sec = h('select', {}, [30, 60, 90, 120].map((s) => h('option', { value: s, selected: s === (ctx.load('s') || 60) }, `${s}초`)));
      const word = h('div', { class: 'tool-big' }, '준비');
      const clock = h('div', { class: 'center speed-clock' });
      const score = h('div', { class: 'center' });
      let deck = []; let left = 0; let ok = 0; let pass = 0; let id = null;
      const paint = () => { clock.textContent = id || left ? `⏱ ${left}초` : ''; score.textContent = `⭕ 맞힘 ${ok} · ⏭ 통과 ${pass}`; };
      const next = () => { word.textContent = deck.shift() || '끝!'; word.classList.remove('pop'); void word.offsetWidth; word.classList.add('pop'); };
      const end = () => { clearInterval(id); id = null; word.textContent = `끝! ⭕ ${ok}개`; paint(); };
      const start = () => {
        ctx.save('w', ta.value); ctx.save('s', Number(sec.value));
        deck = shuffle(lines(ta.value)); ok = 0; pass = 0; left = Number(sec.value); clearInterval(id);
        id = live(el, () => { left--; paint(); if (left <= 0) end(); }, 1000); next(); paint();
      };
      clear(el, clock, word, score, h('div', { class: 'tool-bar' },
        h('button', { class: 'btn primary big', onclick: start }, '▶ 시작'),
        h('button', { class: 'btn big', onclick: () => { if (!id) return; ok++; next(); paint(); } }, '⭕ 맞힘'),
        h('button', { class: 'btn big', onclick: () => { if (!id) return; pass++; deck.push(word.textContent); next(); paint(); } }, '⏭ 통과'), sec),
      h('details', { class: 'card' }, h('summary', {}, '제시어 편집'), ta));
      paint();
    },
  },
  {
    id: 'dday', name: 'D-데이', icon: '📅', color: '#1d4ed8', cat: '학급 운영', roster: false,
    desc: '현장체험학습·방학·학예회까지 남은 날을 크게. 여러 개 저장',
    run(el, ctx) {
      let items = ctx.load('items') || [];
      const title = h('input', { placeholder: '예) 여름방학' });
      const date = h('input', { type: 'date' });
      const box = h('div', { class: 'dday-grid' });
      const diff = (d) => { const [y, m, dd] = d.split('-').map(Number); const a = new Date(); a.setHours(0, 0, 0, 0); return Math.round((new Date(y, m - 1, dd) - a) / 86400000); };
      const draw = () => {
        ctx.save('items', items);
        clear(box, items.length ? items.slice().sort((a, b) => a.date.localeCompare(b.date)).map((it) => { const n = diff(it.date); return h('div', { class: `dday-card ${n < 0 ? 'past' : n === 0 ? 'today' : ''}` },
          h('div', { class: 'dday-n' }, n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`), h('div', { class: 'dday-t' }, it.title), h('div', { class: 'muted small' }, it.date),
          h('button', { class: 'icon-btn small', onclick: () => { items = items.filter((x) => x !== it); draw(); } }, '✕')); }) : h('p', { class: 'muted center' }, '날짜를 추가하세요.'));
      };
      clear(el, box, h('div', { class: 'tool-bar' }, title, date, h('button', { class: 'btn primary', onclick: () => { if (!title.value || !date.value) { toast('이름과 날짜를 넣어 주세요.', 'error'); return; } items.push({ title: title.value, date: date.value }); title.value = ''; draw(); } }, '+ 추가')));
      draw();
    },
  },
  {
    id: 'breathe', name: '마음 호흡', icon: '🫧', color: '#0891b2', cat: '학급 운영', roster: false,
    desc: '커졌다 작아지는 원을 따라 숨쉬기. 수업 시작·쉬는 시간 뒤 마음 가라앉히기',
    run(el, ctx) {
      const P = { '4-4-4 (기본)': [4, 4, 4, 0], '4-7-8 (긴 내쉼)': [4, 7, 8, 0], '네모 호흡 4-4-4-4': [4, 4, 4, 4] };
      let key = ctx.load('p') || Object.keys(P)[0];
      const ball = h('div', { class: 'breath-ball' });
      const txt = h('div', { class: 'breath-text' }, '시작을 누르세요');
      const cnt = h('div', { class: 'center muted' });
      let timer = null; let rounds = 0;
      const stop = () => { clearTimeout(timer); timer = null; ball.style.transform = 'scale(.55)'; txt.textContent = '시작을 누르세요'; };
      const phase = (k) => {
        if (!el.isConnected) return;
        const p = P[key]; const names = ['들이마시기', '멈추기', '내쉬기', '멈추기'];
        if (!p[k]) { phase((k + 1) % 4); return; }
        if (k === 0) { rounds++; cnt.textContent = `${rounds}번째`; }
        txt.textContent = `${names[k]} ${p[k]}초`;
        ball.style.transitionDuration = `${p[k]}s`;
        if (k === 0) ball.style.transform = 'scale(1)';
        if (k === 2) ball.style.transform = 'scale(.55)';
        timer = setTimeout(() => phase((k + 1) % 4), p[k] * 1000);
      };
      clear(el, h('div', { class: 'breath-wrap' }, ball, txt), cnt, h('div', { class: 'tool-bar' },
        h('select', { onchange: (e) => { key = e.target.value; ctx.save('p', key); } }, Object.keys(P).map((k) => h('option', { value: k, selected: k === key }, k))),
        h('button', { class: 'btn primary big', onclick: () => { if (timer) return; rounds = 0; phase(0); } }, '▶ 시작'), h('button', { class: 'btn big', onclick: stop }, '■ 그만')));
      stop();
    },
  },
  {
    id: 'wordcloud', name: '낱말 구름', icon: '☁️', color: '#4338ca', cat: '수업 활동', roster: false,
    desc: '학생들의 답·생각을 모아 많이 나온 낱말일수록 크게. 브레인스토밍·수업 열기',
    run(el, ctx) {
      const ta = h('textarea', { rows: 5, placeholder: '학생 답을 한 줄(또는 쉼표)에 하나씩', value: ctx.load('w') || '친구, 배려, 친구, 웃음, 협동, 배려, 친구, 존중, 웃음, 약속' });
      const add = h('input', { placeholder: '답 하나 입력 후 Enter' });
      const cloud = h('div', { class: 'wcloud' });
      const COLORS = ['#4f46e5', '#0891b2', '#16a34a', '#ea580c', '#db2777', '#7c3aed', '#ca8a04', '#0f766e'];
      const draw = () => {
        ctx.save('w', ta.value);
        const freq = new Map(); for (const w of lines(ta.value)) freq.set(w, (freq.get(w) || 0) + 1);
        const max = Math.max(1, ...freq.values());
        clear(cloud, freq.size ? shuffle([...freq]).map(([w, n], i) => h('span', { title: `${n}번`, style: { fontSize: `${16 + (n / max) * 56}px`, color: COLORS[i % COLORS.length], fontWeight: n === max ? 900 : 700 } }, w)) : h('span', { class: 'muted' }, '답을 넣어 주세요'));
      };
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { ta.value = `${ta.value.trim()}\n${add.value.trim()}`; add.value = ''; draw(); } });
      ta.addEventListener('input', draw);
      clear(el, cloud, h('div', { class: 'tool-bar' }, add, h('button', { class: 'btn', onclick: draw }, '🔀 다시 배치'), h('button', { class: 'btn', onclick: () => { ta.value = ''; draw(); } }, '비우기')),
        h('details', { class: 'card' }, h('summary', {}, '모은 답 전체'), ta));
      draw();
    },
  },
  {
    id: 'cards', name: '뽑기판', icon: '🎁', color: '#be185d', cat: '수업 활동', roster: false,
    desc: '번호 칸을 뒤집어 선물·미션·질문 확인. 칭찬 뽑기·모둠 미션',
    run(el, ctx) {
      const ta = h('textarea', { rows: 4, value: ctx.load('items') || '칭찬 스티커 1장, 자리 바꾸기권, 한 번 더!, 꽝, 선생님과 하이파이브, 숙제 1회 면제, 꽝, 간식 쿠폰, 노래 한 소절, 꽝, 칭찬 스티커 2장, 박수 받기' });
      const grid = h('div', { class: 'pick-grid' });
      const make = () => {
        ctx.save('items', ta.value);
        const items = shuffle(lines(ta.value));
        clear(grid, items.map((it, i) => h('button', { class: 'pick-tile', onclick: (e) => { const b = e.currentTarget; if (b.classList.contains('open')) return; b.classList.add('open'); b.textContent = it; } }, String(i + 1))));
      };
      clear(el, grid, h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary', onclick: make }, '🔀 새로 섞기')), h('details', { class: 'card' }, h('summary', {}, '칸 내용 편집 (쉼표·줄바꿈)'), ta));
      make();
    },
  },
  {
    id: 'mood', name: '마음 날씨', icon: '🌤', color: '#0284c7', cat: '학급 운영', roster: true,
    desc: '아침마다 학생이 오늘 마음을 고르는 체크인. 반 전체 분위기 한눈에 (이 기기에만 저장)',
    run(el, ctx) {
      const M = [['☀️', '맑음'], ['⛅', '구름 조금'], ['🌧', '비'], ['⛈', '천둥 번개'], ['🌈', '무지개']];
      const d = new Date(); const key = `d${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
      const data = ctx.load(key) || {};
      const sum = h('div', { class: 'tool-chips center' });
      const paintSum = () => clear(sum, M.map(([ic, t], i) => h('span', { class: 'tag big' }, `${ic} ${t} ${Object.values(data).filter((v) => v === i).length}`)));
      clear(el, needRoster(ctx), sum, h('div', { class: 'mood-grid' }, ctx.students.map((s) => {
        const b = h('button', { class: 'mood-tile' });
        const paint = () => clear(b, data[s.name] === undefined ? h('span', { class: 'mood-ico empty' }) : h('span', { class: 'mood-ico' }, M[data[s.name]][0]), h('span', {}, s.name));
        b.onclick = () => { const v = data[s.name]; data[s.name] = v === undefined ? 0 : v + 1 >= M.length ? undefined : v + 1; if (data[s.name] === undefined) delete data[s.name]; ctx.save(key, data); paint(); paintSum(); };
        paint(); return b;
      })), h('p', { class: 'hint center' }, '누를 때마다 ☀️ → ⛅ → 🌧 → ⛈ → 🌈 → 지움. 기록은 서버로 보내지 않고 이 기기에 오늘 날짜로만 저장됩니다. 마음이 흐린 학생은 따로 살펴봐 주세요.'));
      paintSum();
    },
  },
];
