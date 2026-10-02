// 🧰 Teachshop 기본 도구: 우리 반 명단(Deskterior 학생 명단)과 자동 연동
//   각 도구 = { id, name, icon, desc, cat, color, roster(명단 사용 여부), run(el, ctx) }
//   ctx = { students: [{ num, name, gender }], save(key, value), load(key) }
import { h, clear, toast } from './ui.js';

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
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);
