// 🧰 Teachshop 기본 도구: 우리 반 명단(Deskterior 학생 명단)과 자동 연동
//   각 도구 = { id, name, icon, desc, cat, color, roster(명단 사용 여부), run(el, ctx) }
//   ctx = { students: [{ num, name, gender }], save(key, value), load(key) }
import { h, clear, toast } from './ui.js';
import { MORE_TOOLS } from './tools-more.js';

const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const label = (s) => `${s.num ?? ''} ${s.name}`.trim();
const needRoster = (ctx) => (ctx.students.length ? null : h('div', { class: 'alert warn' }, '이 도구는 학생 명단을 씁니다. ', h('a', { href: '#/desk/class/students' }, 'Deskterior → 학급 → 명단 관리에서 입력 →')));
const beep = () => { try { const a = new AudioContext(); const o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 600); } catch { /* 무시 */ } };

export const TOOLS = [
  {
    id: 'picker', name: '이름 뽑기', icon: '🎲', color: '#7c3aed', cat: '수업 도구', roster: true,
    desc: '발표자·도우미를 공정하게. 뽑힌 학생 빼기, 여러 명 한 번에',
    run(el, ctx) {
      let pool = ctx.load('pool') || ctx.students.map((s) => s.name);
      const out = h('div', { class: 'tool-big' }, '🎲');
      const picked = h('div', { class: 'tool-chips' });
      const count = h('input', { type: 'number', min: 1, max: 10, value: 1, style: { width: '70px' } });
      const norep = h('input', { type: 'checkbox', checked: true });
      const left = h('span', { class: 'muted' });
      const paintLeft = () => { left.textContent = norep.checked ? `남은 학생 ${pool.length}명` : ''; };
      const pick = () => {
        if (!ctx.students.length) return;
        const n = Math.max(1, Math.min(10, Number(count.value) || 1));
        if (norep.checked && pool.length < n) pool = ctx.students.map((s) => s.name);
        const list = norep.checked ? pool : ctx.students.map((s) => s.name);
        let k = 0;
        const spin = setInterval(() => {
          out.textContent = list[Math.floor(Math.random() * list.length)];
          if (++k > 14) {
            clearInterval(spin);
            const who = shuffle(list).slice(0, n);
            out.textContent = who.join(' · ');
            out.classList.remove('pop'); void out.offsetWidth; out.classList.add('pop');
            for (const w of who) picked.prepend(h('span', { class: 'tag big' }, w));
            if (norep.checked) { pool = pool.filter((x) => !who.includes(x)); ctx.save('pool', pool); }
            paintLeft();
          }
        }, 55);
      };
      clear(el, needRoster(ctx), out,
        h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary big', onclick: pick }, '뽑기'),
          h('label', { class: 'inline' }, count, '명'), h('label', { class: 'inline' }, norep, ' 뽑힌 학생 빼기'), left,
          h('button', { class: 'btn small', onclick: () => { pool = ctx.students.map((s) => s.name); ctx.save('pool', pool); clear(picked); paintLeft(); } }, '처음부터')),
        h('div', { class: 'muted small' }, '뽑힌 순서'), picked);
      paintLeft();
    },
  },
  {
    id: 'number', name: '숫자 뽑기', icon: '🔢', color: '#2563eb', cat: '수업 도구', roster: false,
    desc: '범위를 정해 숫자를 무작위로. 번호 뽑기·주사위 대용',
    run(el) {
      const min = h('input', { type: 'number', value: 1, style: { width: '80px' } });
      const max = h('input', { type: 'number', value: 30, style: { width: '80px' } });
      const out = h('div', { class: 'tool-big' }, '?');
      const go = () => {
        const a = Math.min(Number(min.value), Number(max.value)); const b = Math.max(Number(min.value), Number(max.value));
        let k = 0;
        const spin = setInterval(() => { out.textContent = a + Math.floor(Math.random() * (b - a + 1)); if (++k > 12) clearInterval(spin); }, 50);
      };
      clear(el, out, h('div', { class: 'tool-bar' }, min, ' ~ ', max, h('button', { class: 'btn primary big', onclick: go }, '뽑기')));
    },
  },
  {
    id: 'groups', name: '모둠 편성', icon: '👥', color: '#0d9488', cat: '수업 활동', roster: true,
    desc: '모둠 수나 인원으로 나누기, 남녀 고르게, 모둠장 지정',
    run(el, ctx) {
      const n = h('input', { type: 'number', min: 2, max: 12, value: ctx.load('n') || 4, style: { width: '70px' } });
      const by = h('select', {}, h('option', { value: 'count' }, '모둠 수'), h('option', { value: 'size' }, '모둠당 인원'));
      const mix = h('input', { type: 'checkbox', checked: true });
      const lead = h('input', { type: 'checkbox', checked: true });
      const out = h('div', { class: 'group-grid' });
      let last = null;
      const make = () => {
        const v = Math.max(2, Number(n.value) || 4); ctx.save('n', v);
        const k = by.value === 'count' ? v : Math.ceil(ctx.students.length / v);
        const gs = Array.from({ length: k }, () => []);
        const order = mix.checked ? [...shuffle(ctx.students.filter((s) => s.gender === '여')), ...shuffle(ctx.students.filter((s) => s.gender !== '여'))] : shuffle(ctx.students);
        order.forEach((s, i) => gs[i % k].push(s));
        last = gs.map((g) => shuffle(g));
        clear(out, last.map((g, i) => h('div', { class: 'group-card' }, h('strong', {}, `${i + 1}모둠`),
          g.map((s, j) => h('div', {}, j === 0 && lead.checked ? '⭐ ' : '', s.name)))));
      };
      clear(el, needRoster(ctx),
        h('div', { class: 'tool-bar' }, by, n, h('label', { class: 'inline' }, mix, ' 남녀 고르게'), h('label', { class: 'inline' }, lead, ' 모둠장(⭐)'),
          h('button', { class: 'btn primary', onclick: make }, '나누기'),
          h('button', { class: 'btn', onclick: () => last && navigator.clipboard?.writeText(last.map((g, i) => `${i + 1}모둠: ${g.map((s) => s.name).join(', ')}`).join('\n')).then(() => toast('복사했습니다.')) }, '복사'),
          h('button', { class: 'btn', onclick: () => window.print() }, '인쇄')),
        out);
      if (ctx.students.length) make();
    },
  },
  {
    id: 'timer', name: '타이머', icon: '⏱', color: '#e11d48', cat: '수업 도구', roster: false,
    desc: '큰 화면 타이머·스톱워치. 끝나면 소리로 알림',
    run(el) {
      const disp = h('div', { class: 'tool-clock' }, '05:00');
      const bar = h('div', { class: 'progress-bar tool-progress' }, h('span', { style: { width: '100%' } }));
      let total = 300; let left = 300; let id = null; let up = false;
      const fmt = (s) => `${String(Math.floor(Math.abs(s) / 60)).padStart(2, '0')}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
      const paint = () => { disp.textContent = fmt(left); disp.classList.toggle('end', !up && left <= 0); bar.firstChild.style.width = up ? '100%' : `${Math.max(0, left / total) * 100}%`; };
      const stop = () => { clearInterval(id); id = null; };
      const start = () => { if (id) return; id = setInterval(() => { if (!el.isConnected) return stop(); left += up ? 1 : -1; paint(); if (!up && left <= 0) { stop(); beep(); } }, 1000); };
      const set = (sec) => { stop(); up = false; total = left = sec; paint(); };
      const custom = h('input', { type: 'number', min: 1, placeholder: '분', style: { width: '70px' } });
      clear(el, disp, bar,
        h('div', { class: 'tool-bar' }, [1, 3, 5, 10, 15].map((m) => h('button', { class: 'btn', onclick: () => set(m * 60) }, `${m}분`)), custom, h('button', { class: 'btn', onclick: () => custom.value && set(Number(custom.value) * 60) }, '설정')),
        h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary big', onclick: start }, '▶ 시작'), h('button', { class: 'btn big', onclick: stop }, '⏸ 멈춤'),
          h('button', { class: 'btn', onclick: () => { stop(); up = true; left = 0; paint(); } }, '스톱워치')));
      paint();
    },
  },
  {
    id: 'order', name: '발표 순서', icon: '🗣', color: '#ea580c', cat: '수업 활동', roster: true,
    desc: '전체 학생 발표 순서를 무작위로 정하고, 한 명씩 체크',
    run(el, ctx) {
      const out = h('ol', { class: 'tool-order' });
      const make = () => clear(out, shuffle(ctx.students).map((s) => h('li', { onclick: (e) => e.currentTarget.classList.toggle('done') }, s.name)));
      clear(el, needRoster(ctx), h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary', onclick: make }, '🔀 순서 정하기'), h('span', { class: 'muted small' }, '발표한 학생을 누르면 줄이 그어집니다')), out);
      if (ctx.students.length) make();
    },
  },
  {
    id: 'score', name: '팀 점수판', icon: '🏆', color: '#ca8a04', cat: '수업 활동', roster: false,
    desc: '퀴즈·게임용 팀 점수판. 2~6팀, 큰 숫자',
    run(el, ctx) {
      let teams = ctx.load('teams') || [{ n: '1팀', s: 0 }, { n: '2팀', s: 0 }, { n: '3팀', s: 0 }, { n: '4팀', s: 0 }];
      const colors = ['#e5484d', '#0091ff', '#30a46c', '#f5a524', '#8e4ec6', '#12a594'];
      const box = h('div', { class: 'score-grid' });
      const draw = () => {
        ctx.save('teams', teams);
        clear(box, teams.map((t, i) => h('div', { class: 'score-card', style: { '--c': colors[i % 6] } },
          h('input', { class: 'score-name', value: t.n, onchange: (e) => { t.n = e.target.value; ctx.save('teams', teams); } }),
          h('div', { class: 'score-num' }, t.s),
          h('div', { class: 'tool-bar' }, h('button', { class: 'btn', onclick: () => { t.s -= 1; draw(); } }, '−1'), h('button', { class: 'btn primary', onclick: () => { t.s += 1; draw(); } }, '+1'), h('button', { class: 'btn', onclick: () => { t.s += 5; draw(); } }, '+5')))));
      };
      clear(el, h('div', { class: 'tool-bar' },
        h('button', { class: 'btn small', onclick: () => { if (teams.length < 6) teams.push({ n: `${teams.length + 1}팀`, s: 0 }); draw(); } }, '+ 팀'),
        h('button', { class: 'btn small', onclick: () => { if (teams.length > 2) teams.pop(); draw(); } }, '− 팀'),
        h('button', { class: 'btn small', onclick: () => { teams.forEach((t) => { t.s = 0; }); draw(); } }, '점수 초기화')), box);
      draw();
    },
  },
  {
    id: 'quiz', name: '퀴즈 쇼', icon: '❓', color: '#db2777', cat: '수업 활동', roster: true,
    desc: '문제를 붙여넣으면 한 문제씩 큰 화면으로. 정답 공개·타이머·답할 학생 뽑기',
    run(el, ctx) {
      const ta = h('textarea', { rows: 6, value: ctx.load('src') || '대한민국의 수도는? | 서울\n3 × 7 = ? | 21\n물이 어는 온도는 몇 도? | 0도', placeholder: '한 줄에 한 문제: 문제 | 정답' });
      const stage = h('div', {});
      let qs = []; let i = 0; let shown = false;
      const show = () => {
        const q = qs[i];
        clear(stage, !q ? h('p', { class: 'muted' }, '문제를 입력하고 [시작]을 누르세요.') : h('div', { class: 'quiz-stage' },
          h('div', { class: 'muted' }, `${i + 1} / ${qs.length}`),
          h('div', { class: 'quiz-q' }, q.q),
          h('div', { class: `quiz-a ${shown ? 'on' : ''}` }, shown ? q.a : '정답은?'),
          h('div', { class: 'tool-bar' },
            h('button', { class: 'btn', disabled: i === 0, onclick: () => { i--; shown = false; show(); } }, '◀ 이전'),
            h('button', { class: 'btn primary big', onclick: () => { shown = !shown; show(); } }, shown ? '정답 숨기기' : '정답 보기'),
            ctx.students.length ? h('button', { class: 'btn', onclick: (e) => { e.target.textContent = `🎤 ${ctx.students[Math.floor(Math.random() * ctx.students.length)].name}`; } }, '🎤 답할 학생') : null,
            h('button', { class: 'btn', disabled: i >= qs.length - 1, onclick: () => { i++; shown = false; show(); } }, '다음 ▶'))));
      };
      clear(el, h('details', { class: 'card', open: !ctx.load('src') }, h('summary', {}, '문제 입력'), ta,
        h('button', { class: 'btn primary', onclick: () => { ctx.save('src', ta.value); qs = ta.value.split('\n').map((l) => l.split('|')).filter((p) => p[0].trim()).map(([q, a]) => ({ q: q.trim(), a: (a || '').trim() })); i = 0; shown = false; show(); } }, '시작')), stage);
      qs = ta.value.split('\n').map((l) => l.split('|')).filter((p) => p[0].trim()).map(([q, a]) => ({ q: q.trim(), a: (a || '').trim() }));
      show();
    },
  },
  {
    id: 'noise', name: '소음 신호등', icon: '🚦', color: '#16a34a', cat: '학급 운영', roster: false,
    desc: '마이크로 교실 소리 크기를 재서 초록·노랑·빨강으로 (소리는 저장되지 않음)',
    run(el) {
      const light = h('div', { class: 'noise-light' });
      const meter = h('div', { class: 'progress-bar tool-progress' }, h('span', { style: { width: '0%' } }));
      const sens = h('input', { type: 'range', min: 1, max: 10, value: 5 });
      let stream = null; let raf = null;
      const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; };
      const start = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const ac = new AudioContext(); const an = ac.createAnalyser(); ac.createMediaStreamSource(stream).connect(an);
          const buf = new Uint8Array(an.fftSize);
          const loop = () => {
            if (!el.isConnected) return stop();
            an.getByteTimeDomainData(buf);
            let sum = 0; for (const v of buf) sum += (v - 128) ** 2;
            const level = Math.min(1, Math.sqrt(sum / buf.length) / 40 * (Number(sens.value) / 5));
            meter.firstChild.style.width = `${level * 100}%`;
            light.dataset.level = level < 0.4 ? 'g' : level < 0.7 ? 'y' : 'r';
            raf = requestAnimationFrame(loop);
          };
          loop();
        } catch { toast('마이크를 쓸 수 없습니다. 브라우저에서 마이크 권한을 허용해 주세요.', 'error'); }
      };
      clear(el, light, meter, h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary', onclick: start }, '🎙 시작'), h('button', { class: 'btn', onclick: stop }, '멈춤'), h('label', { class: 'inline' }, '민감도 ', sens)),
        h('p', { class: 'muted small' }, '소리는 이 기기에서 크기만 재고 어디에도 저장·전송하지 않습니다.'));
    },
  },
  {
    id: 'worksheet', name: '빈칸 학습지 만들기', icon: '📝', color: '#0891b2', cat: '학습지', roster: true,
    desc: '본문에 [정답]처럼 괄호를 치면 빈칸 학습지와 정답지를 자동 생성·인쇄. 학생 이름 넣어 인원수만큼',
    run(el, ctx) {
      const title = h('input', { value: ctx.load('title') || '3단원 정리 학습지', placeholder: '제목' });
      const ta = h('textarea', { rows: 8, value: ctx.load('src') || '1. 식물이 빛을 이용해 양분을 만드는 과정을 [광합성]이라고 한다.\n2. 광합성에 필요한 것은 빛, [물], [이산화 탄소]이다.\n3. 광합성으로 만들어진 양분은 [녹말] 형태로 저장된다.' });
      const perStudent = h('input', { type: 'checkbox' });
      const preview = h('div', { class: 'ws-preview' });
      const sheet = (name, answers) => `<div class="ws"><h2>${esc(title.value)}</h2><div class="who">${name ? `${esc(name)}` : '__학년 __반 __번 이름: ________'}</div>${esc(ta.value).replace(/\[(.+?)\]/g, (_, a) => (answers ? `<b class="ans">${a}</b>` : `<span class="blank" style="min-width:${Math.max(4, a.length * 1.3)}em"></span>`)).split('\n').map((l) => `<p>${l}</p>`).join('')}</div>`;
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const paint = () => { ctx.save('src', ta.value); ctx.save('title', title.value); preview.innerHTML = sheet('', false); };
      const print = (answers) => {
        const w = window.open('', '_blank'); if (!w) return;
        const pages = answers ? [sheet('정답지', true)] : perStudent.checked && ctx.students.length ? ctx.students.map((s) => sheet(label(s), false)) : [sheet('', false)];
        w.document.write(`<title>${esc(title.value)}</title><style>body{font-family:sans-serif;padding:20px}.ws{page-break-after:always;font-size:17px;line-height:2.2}.ws h2{text-align:center}.who{text-align:right;margin-bottom:12px}.blank{display:inline-block;border-bottom:1.5px solid #000;height:1.2em;vertical-align:bottom}.ans{color:#c00;text-decoration:underline}</style>${pages.join('')}`);
        w.document.close(); w.print();
      };
      ta.addEventListener('input', paint); title.addEventListener('input', paint);
      clear(el, h('div', { class: 'two-col' },
        h('div', { class: 'form' }, h('div', { class: 'row' }, h('label', {}, '제목'), title), h('div', { class: 'row' }, h('label', {}, '본문 (빈칸으로 만들 말을 [ ]로 감싸기)'), ta),
          h('div', { class: 'tool-bar' }, h('label', { class: 'inline' }, perStudent, ' 학생 이름 넣어 인원수만큼'),
            h('button', { class: 'btn primary', onclick: () => print(false) }, '🖨 학습지 인쇄'), h('button', { class: 'btn', onclick: () => print(true) }, '정답지 인쇄'))),
        h('div', {}, h('div', { class: 'muted small' }, '미리보기'), preview)));
      paint();
    },
  },

  {
    id: 'screen', name: '교실 화면', icon: '🖥', color: '#4f46e5', cat: '학급 운영', roster: true, featured: true,
    desc: '시계·타이머·활동 신호·오늘 시간표·알림장·이름 뽑기를 한 화면에. 교실 TV에 띄워 두는 대시보드',
    run(el, ctx) { renderScreen(el, ctx); },
  },
  {
    id: 'roulette', name: '룰렛', icon: '🎡', color: '#f59e0b', cat: '수업 도구', roster: true,
    desc: '학생 이름이나 직접 쓴 항목으로 돌리는 룰렛. 벌칙·역할·주제 정하기',
    run(el, ctx) {
      const src = h('textarea', { rows: 4, placeholder: '비우면 학생 명단 사용. 직접 쓰려면 한 줄에 하나', value: ctx.load('items') || '' });
      const cv = h('canvas', { width: 420, height: 420, class: 'wheel' });
      const res = h('div', { class: 'tool-big', style: { fontSize: '48px', padding: '10px 0' } }, '');
      let angle = 0; let spinning = false;
      const items = () => { const t = src.value.split('\n').map((x) => x.trim()).filter(Boolean); return t.length ? t : ctx.students.map((s) => s.name); };
      const colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#818cf8', '#e879f9', '#f472b6'];
      const draw = () => {
        const list = items(); const g = cv.getContext('2d'); const n = Math.max(1, list.length); const r = 200;
        g.clearRect(0, 0, 420, 420); g.save(); g.translate(210, 210); g.rotate(angle);
        list.forEach((t, i) => {
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, (i / n) * 2 * Math.PI, ((i + 1) / n) * 2 * Math.PI); g.fillStyle = colors[i % colors.length]; g.fill();
          g.save(); g.rotate(((i + 0.5) / n) * 2 * Math.PI); g.fillStyle = '#1f2937'; g.font = `bold ${n > 24 ? 11 : 15}px sans-serif`; g.textAlign = 'right'; g.fillText(t.slice(0, 8), r - 12, 5); g.restore();
        });
        g.restore(); g.beginPath(); g.moveTo(400, 210); g.lineTo(420, 198); g.lineTo(420, 222); g.fillStyle = '#111827'; g.fill();
      };
      const spin = () => {
        if (spinning) return; const list = items(); if (!list.length) return;
        spinning = true; ctx.save('items', src.value); res.textContent = '';
        const start = angle; const total = 8 * Math.PI + Math.random() * 2 * Math.PI; const t0 = performance.now(); const dur = 3800;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur); angle = start + total * (1 - (1 - k) ** 3); draw();
          if (k < 1 && el.isConnected) return requestAnimationFrame(step);
          spinning = false;
          const n = list.length; const a = ((2 * Math.PI - (angle % (2 * Math.PI))) % (2 * Math.PI));
          res.textContent = `🎉 ${list[Math.floor(a / (2 * Math.PI / n)) % n]}`;
        };
        requestAnimationFrame(step);
      };
      src.addEventListener('input', draw);
      clear(el, h('div', { class: 'two-col' }, h('div', { class: 'center' }, cv, res, h('button', { class: 'btn primary big', onclick: spin }, '돌리기')),
        h('div', { class: 'form' }, h('div', { class: 'row' }, h('label', {}, '항목'), src), h('p', { class: 'hint' }, '비워 두면 우리 반 학생 이름으로 돌립니다.'))));
      draw();
    },
  },
  {
    id: 'dice', name: '주사위', icon: '🎯', color: '#0ea5e9', cat: '수업 도구', roster: false,
    desc: '주사위 1~4개 굴리기. 보드게임·수학 확률 수업',
    run(el) {
      const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      const n = h('select', {}, [1, 2, 3, 4].map((k) => h('option', { value: k }, `${k}개`)));
      const out = h('div', { class: 'dice-row' });
      const sum = h('div', { class: 'muted', style: { fontSize: '22px' } });
      const roll = () => {
        let k = 0;
        const t = setInterval(() => {
          const v = Array.from({ length: Number(n.value) }, () => Math.floor(Math.random() * 6));
          clear(out, v.map((x) => h('span', {}, FACES[x]))); sum.textContent = `합계 ${v.reduce((a, x) => a + x + 1, 0)}`;
          if (++k > 10) clearInterval(t);
        }, 70);
      };
      clear(el, out, sum, h('div', { class: 'tool-bar' }, n, h('button', { class: 'btn primary big', onclick: roll }, '굴리기')));
      roll();
    },
  },
  {
    id: 'pairs', name: '짝 정하기', icon: '🤝', color: '#10b981', cat: '수업 활동', roster: true,
    desc: '무작위 짝 만들기. 지난번 짝은 되도록 피하고, 홀수면 3인 1조',
    run(el, ctx) {
      const out = h('div', { class: 'group-grid' });
      const make = () => {
        const hist = new Set(ctx.load('hist') || []);
        let best = null; let bestScore = Infinity;
        for (let t = 0; t < 200; t++) {
          const order = shuffle(ctx.students.map((s) => s.name)); const pairs = [];
          for (let i = 0; i < order.length; i += 2) pairs.push(order.slice(i, i + 2));
          if (pairs.length > 1 && pairs.at(-1).length === 1) pairs.at(-2).push(pairs.pop()[0]);
          const score = pairs.reduce((a, p) => a + (hist.has([...p].sort().join('|')) ? 1 : 0), 0);
          if (score < bestScore) { best = pairs; bestScore = score; if (!score) break; }
        }
        clear(out, best.map((p, i) => h('div', { class: 'group-card' }, h('strong', {}, `${i + 1}`), p.join(' · '))));
        out._pairs = best;
      };
      clear(el, needRoster(ctx), h('div', { class: 'tool-bar' }, h('button', { class: 'btn primary', onclick: make }, '🔀 짝 정하기'),
        h('button', { class: 'btn', onclick: () => { if (!out._pairs) return; const hist = new Set(ctx.load('hist') || []); out._pairs.forEach((p) => hist.add([...p].sort().join('|'))); ctx.save('hist', [...hist].slice(-300)); toast('이 짝을 기억했습니다. 다음에는 되도록 피합니다.'); } }, '이 짝으로 확정'),
        h('button', { class: 'btn small', onclick: () => { ctx.save('hist', []); toast('지난 짝 기록을 지웠습니다.'); } }, '기록 지우기')), out);
      if (ctx.students.length) make();
    },
  },
  {
    id: 'vote', name: '손들기 투표', icon: '📊', color: '#8b5cf6', cat: '수업 활동', roster: false,
    desc: '선택지를 쓰고 손 든 수를 눌러 세면 막대그래프로. 의견 모으기·예상하기',
    run(el, ctx) {
      const src = h('input', { value: ctx.load('opts') || '찬성, 반대, 잘 모르겠음', placeholder: '선택지를 쉼표로' });
      const box = h('div', { class: 'vote-box' });
      let counts = {};
      const draw = () => {
        const opts = src.value.split(',').map((x) => x.trim()).filter(Boolean); ctx.save('opts', src.value);
        const max = Math.max(1, ...opts.map((o) => counts[o] || 0)); const total = opts.reduce((a, o) => a + (counts[o] || 0), 0);
        clear(box, opts.map((o, i) => h('div', { class: 'vote-row' },
          h('span', { class: 'vote-label' }, o),
          h('div', { class: 'vote-bar' }, h('i', { style: { width: `${((counts[o] || 0) / max) * 100}%`, background: ['#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#64748b'][i % 6] } })),
          h('strong', { class: 'vote-num' }, counts[o] || 0, total ? h('span', { class: 'muted small' }, ` ${Math.round(((counts[o] || 0) / total) * 100)}%`) : null),
          h('button', { class: 'btn small', onclick: () => { counts[o] = Math.max(0, (counts[o] || 0) - 1); draw(); } }, '−'),
          h('button', { class: 'btn small primary', onclick: () => { counts[o] = (counts[o] || 0) + 1; draw(); } }, '+'))));
      };
      src.addEventListener('change', draw);
      clear(el, h('div', { class: 'tool-bar' }, src, h('button', { class: 'btn small', onclick: () => { counts = {}; draw(); } }, '초기화')), box);
      draw();
    },
  },
  {
    id: 'flash', name: '단어 카드', icon: '🃏', color: '#ec4899', cat: '수업 활동', roster: false,
    desc: '단어|뜻을 붙여넣으면 카드 뒤집기 복습. 영어 단어·한자·개념어',
    run(el, ctx) {
      const ta = h('textarea', { rows: 5, value: ctx.load('src') || 'apple | 사과\nlibrary | 도서관\nphotosynthesis | 광합성' });
      const card = h('button', { class: 'flash-card' });
      let cards = []; let i = 0; let back = false;
      const parse = () => { ctx.save('src', ta.value); cards = ta.value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]); i = 0; back = false; show(); };
      const show = () => { const c = cards[i]; clear(card, c ? h('div', {}, h('div', { class: 'muted small' }, `${i + 1} / ${cards.length} · ${back ? '뜻' : '단어'}`), h('div', { class: 'flash-text' }, back ? c[1] || '' : c[0])) : '카드가 없습니다'); card.classList.toggle('back', back); };
      card.onclick = () => { back = !back; show(); };
      clear(el, card, h('div', { class: 'tool-bar' },
        h('button', { class: 'btn', onclick: () => { i = (i - 1 + cards.length) % cards.length; back = false; show(); } }, '◀'),
        h('button', { class: 'btn primary', onclick: () => { back = !back; show(); } }, '뒤집기'),
        h('button', { class: 'btn', onclick: () => { i = (i + 1) % cards.length; back = false; show(); } }, '▶'),
        h('button', { class: 'btn', onclick: () => { cards = shuffle(cards); i = 0; back = false; show(); } }, '🔀 섞기')),
      h('details', { class: 'card' }, h('summary', {}, '카드 편집 (한 줄에 "단어 | 뜻")'), ta, h('button', { class: 'btn small', onclick: parse }, '적용')));
      parse();
    },
  },
  {
    id: 'signal', name: '활동 신호', icon: '🤫', color: '#64748b', cat: '학급 운영', roster: false,
    desc: '지금 할 활동을 크게: 조용히 혼자 · 짝 활동 · 모둠 활동 · 손 들고 말하기 · 정리 시간',
    run(el, ctx) {
      const SIG = [['🤫', '조용히 혼자', '#334155'], ['👫', '짝과 함께', '#0ea5e9'], ['👥', '모둠 활동', '#10b981'], ['🙋', '손 들고 말하기', '#f59e0b'], ['👀', '선생님 보기', '#8b5cf6'], ['🧹', '정리 시간', '#ef4444']];
      const big = h('div', { class: 'signal-big' });
      const set = (k) => { ctx.save('k', k); const [ic, t, c] = SIG[k]; big.style.setProperty('--c', c); clear(big, h('div', { class: 'signal-ico' }, ic), h('div', { class: 'signal-text' }, t)); };
      clear(el, big, h('div', { class: 'tool-bar' }, SIG.map(([ic, t], k) => h('button', { class: 'btn', onclick: () => set(k) }, `${ic} ${t}`))));
      set(ctx.load('k') || 0);
    },
  },
  {
    id: 'qr', name: 'QR 만들기', icon: '🔳', color: '#111827', cat: '수업 도구', roster: false,
    desc: '링크를 크게 QR로 띄우기. 패들렛·설문·자료를 학생 기기로 바로',
    run(el, ctx) {
      const url = h('input', { value: ctx.load('url') || 'https://', style: { minWidth: '320px' } });
      const box = h('div', { class: 'qr-big' });
      const make = async () => {
        ctx.save('url', url.value);
        if (!window.qrcode) await new Promise((r) => { const s = document.createElement('script'); s.src = '/vendor/qrcode.js'; s.onload = r; document.head.append(s); });
        const q = window.qrcode(0, 'M'); q.addData(url.value || ' '); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 10, margin: 2, scalable: true });
      };
      url.addEventListener('change', make);
      clear(el, h('div', { class: 'tool-bar' }, url, h('button', { class: 'btn primary', onclick: make }, '만들기')), box, h('p', { class: 'center muted' }, '휴대폰·태블릿 카메라로 비추면 열립니다.'));
      make();
    },
  },
  {
    id: 'board', name: '판서 칠판', icon: '✏️', color: '#15803d', cat: '수업 도구', roster: false,
    desc: '전자칠판처럼 손·펜으로 쓰기. 색·지우개·전체 지우기',
    run(el) {
      const cv = h('canvas', { class: 'chalk' });
      let color = '#ffffff'; let size = 4; let drawing = false; let last = null;
      const fit = () => { const r = cv.getBoundingClientRect(); const img = cv.width ? cv.getContext('2d').getImageData(0, 0, cv.width, cv.height) : null; cv.width = r.width; cv.height = r.height; if (img) cv.getContext('2d').putImageData(img, 0, 0); };
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => { if (!drawing) return; const g = cv.getContext('2d'); const p = pos(e); g.strokeStyle = color; g.lineWidth = color === 'erase' ? 28 : size; g.lineCap = 'round'; g.globalCompositeOperation = color === 'erase' ? 'destination-out' : 'source-over'; g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; });
      cv.addEventListener('pointerup', () => { drawing = false; });
      clear(el, h('div', { class: 'tool-bar' },
        ['#ffffff', '#fde047', '#f87171', '#60a5fa', '#4ade80'].map((c) => h('button', { class: 'swatch', style: { background: c, width: '30px', height: '30px' }, onclick: () => { color = c; } })),
        h('button', { class: 'btn small', onclick: () => { color = 'erase'; } }, '지우개'),
        h('select', { onchange: (e) => { size = Number(e.target.value); } }, [[4, '보통'], [2, '가늘게'], [8, '굵게']].map(([v, l]) => h('option', { value: v }, l))),
        h('button', { class: 'btn small', onclick: () => cv.getContext('2d').clearRect(0, 0, cv.width, cv.height) }, '전체 지우기')), cv);
      requestAnimationFrame(fit); window.addEventListener('resize', () => el.isConnected && fit());
    },
  },
  ...MORE_TOOLS,
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);

// 🖥 교실 화면: 위젯을 골라 한 화면에 (Teachshop → 내 교실에서 구성·순서까지 저장)
export const WIDGETS = [
  ['clock', '🕘 시계'], ['timer', '⏱ 타이머'], ['signal', '🤫 활동 신호'], ['lessons', '🗓 오늘 시간표'], ['note', '📒 오늘 알림장'], ['picker', '🎲 이름 뽑기'], ['text', '📝 메모'],
];
const SDOW = ['일', '월', '화', '수', '목', '금', '토'];
export async function loadScreenExtra() {
  const now = new Date(); const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const extra = { lessons: null, note: null };
  try {
    const { api } = await import('./ui.js'); const { state } = await import('./state.js');
    const d = await api(`/api/bundle?year=${state.year}&modules=myTimetable,dailyNotes`);
    const tt = d.myTimetable[0]?.data.grid; const di = tt ? tt.days.indexOf(SDOW[now.getDay()]) : -1;
    extra.lessons = tt && di >= 0 ? tt.periods.map((p, pi) => [p, tt.cells[pi]?.[di] || '']) : [];
    extra.note = d.dailyNotes.find((n) => n.data.date === ymd)?.data || null;
  } catch { /* 체험·오프라인 */ }
  return extra;
}
// 위젯 하나 그리기: 교실 화면 전용 위젯 또는 기본 도구(t:도구id)
export function screenWidget(k, ctx, extra) {
  if (k.startsWith('t:')) { const t = toolById(k.slice(2)); const box = h('div', {}); if (t && t.id !== 'screen') t.run(box, ctx); return box; }
  const W = {
    clock: () => { const t = h('div', { class: 'scr-clock' }); const d = h('div', { class: 'muted' }); const tick = () => { if (!t.isConnected) return; const n = new Date(); t.textContent = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; d.textContent = `${n.getMonth() + 1}월 ${n.getDate()}일 ${SDOW[n.getDay()]}요일`; setTimeout(tick, 1000 * 15); }; setTimeout(tick); return [t, d]; },
    timer: () => { const box = h('div', {}); toolById('timer').run(box, ctx); return box; },
    signal: () => { const box = h('div', {}); toolById('signal').run(box, ctx); return box; },
    lessons: () => (extra.lessons?.length ? h('ul', { class: 'scr-lessons' }, extra.lessons.map(([p, t]) => h('li', {}, h('span', { class: 'muted' }, p), ' ', t || '-'))) : h('p', { class: 'muted' }, 'Deskterior → 수업 → 내 시간표를 만들면 보입니다.')),
    note: () => (extra.note ? h('div', {}, h('ol', { class: 'scr-note' }, String(extra.note.content).split('\n').filter(Boolean).map((l) => h('li', {}, l))), extra.note.supplies ? h('div', {}, '🎒 ', extra.note.supplies) : null) : h('p', { class: 'muted' }, '오늘 알림장이 없습니다.')),
    picker: () => { const out = h('div', { class: 'scr-pick' }, '🎲'); return [out, h('button', { class: 'btn primary', onclick: () => { const s = ctx.students; if (s.length) out.textContent = s[Math.floor(Math.random() * s.length)].name; } }, '뽑기')]; },
    text: () => h('div', { class: 'scr-text', contenteditable: 'true', oninput: (e) => ctx.save('text', e.target.innerText) }, ctx.load('text') || '여기에 적으세요 ✍️'),
  };
  return W[k] ? W[k]() : h('p', { class: 'muted' }, '없는 위젯입니다.');
}
export const widgetName = (k) => (k.startsWith('t:') ? (() => { const t = toolById(k.slice(2)); return t ? `${t.icon} ${t.name}` : k; })() : (WIDGETS.find(([x]) => x === k)?.[1] || k));
async function renderScreen(el, ctx) {
  const on = new Set(ctx.load('w') || ['clock', 'timer', 'signal', 'lessons', 'note', 'picker']);
  const extra = await loadScreenExtra();
  const grid = h('div', { class: 'screen-grid' });
  const draw = () => clear(grid, WIDGETS.filter(([k]) => on.has(k)).map(([k, name]) => h('section', { class: `scr-card scr-w-${k}` }, h('div', { class: 'scr-title' }, name), screenWidget(k, ctx, extra))));
  clear(el, h('div', { class: 'tool-bar' }, WIDGETS.map(([k, name]) => h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: on.has(k), onchange: (e) => { if (e.target.checked) on.add(k); else on.delete(k); ctx.save('w', [...on]); draw(); } }), ` ${name}`)), h('a', { class: 'btn small', href: '#/desk/market/classroom' }, '⚙ 내 교실에서 꾸미기')), grid);
  draw();
}
