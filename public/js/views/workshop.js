// 🧰 Teachshop: 기본 도구 + 선생님들이 올린 HTML 도구·자료를 우리 반 명단과 함께 바로 실행
import { h, api, clear, toast, modal } from '../ui.js';
import { state, remember } from '../state.js';
import { openRecordForm } from '../form.js';
import { seg } from './schedule.js';
import { TOOLS, toolById } from '../tools.js';

const CATS = ['수업 도구', '수업 활동', '학급 운영', '평가', '학습지', '업무 서식', '기타'];

async function roster() {
  const rows = await api(`/api/records/students?year=${state.year}`);
  return rows.map((r) => ({ num: r.data.num, name: r.data.name, gender: r.data.gender }))
    .filter((s) => s.name).sort((a, b) => (Number(a.num) || 999) - (Number(b.num) || 999));
}

const favs = () => new Set(remember('ws_fav') || []);
function toggleFav(key) { const f = favs(); if (f.has(key)) f.delete(key); else f.add(key); remember('ws_fav', [...f]); }

function thumb(icon, color) {
  return h('div', { class: 'ws-thumb', style: { '--c': color } }, h('span', {}, icon));
}

export async function workshopHome(root) {
  const [rows, students] = await Promise.all([api('/api/records/market'), roster().catch(() => [])]);
  const reload = () => workshopHome(root);
  const me = state.me.email;
  const view = remember('ws_view') || 'all';
  const sort = remember('ws_sort') || 'popular';
  const cat = remember('ws_cat') || '';
  const q = (remember('ws_q') || '').toLowerCase();
  const fav = favs();
  const likes = (r) => (r.data.likes || []).length;
  const items = [
    ...TOOLS.map((t) => ({ key: `b:${t.id}`, builtin: true, t, title: t.name, desc: t.desc, cat: t.cat, maker: 'OnlineFlatform', likes: 0, date: '' })),
    ...rows.map((r) => ({ key: `r:${r.id}`, r, title: r.data.title, desc: r.data.desc || '', cat: r.data.category || '기타', maker: r.author, likes: likes(r), date: String(r.updatedAt || '').slice(0, 10), html: r.data.kind === 'HTML 도구' && !!r.data.html, mine: r.owner === me })),
  ];
  const shown = items.filter((it) => (view === 'all'
      || (view === 'builtin' && it.builtin) || (view === 'shared' && !it.builtin && it.html) || (view === 'links' && !it.builtin && !it.html)
      || (view === 'fav' && fav.has(it.key)))
    && (!cat || it.cat === cat)
    && (!q || `${it.title} ${it.desc} ${it.maker}`.toLowerCase().includes(q)))
    .sort((a, b) => (sort === 'popular' ? (b.likes - a.likes) || (a.builtin ? -1 : 1) - (b.builtin ? -1 : 1) : String(b.date).localeCompare(String(a.date))));
  const open = (it) => {
    if (it.builtin) location.hash = `#/desk/market/run?tool=${it.t.id}`;
    else if (it.html) location.hash = `#/desk/market/run?id=${it.r.id}`;
    else if (/^https?:/.test(it.r.data.link || '')) window.open(it.r.data.link, '_blank', 'noopener');
    else openRecordForm('market', it.r, { onSaved: reload });
  };
  const like = async (r, e) => {
    e.stopPropagation();
    try { await api(`/api/records/market/${r.id}/self`, { method: 'POST', body: { on: !(r.data.likes || []).includes(me) } }); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const count = (v) => items.filter((it) => (v === 'builtin' ? it.builtin : v === 'shared' ? !it.builtin && it.html : v === 'links' ? !it.builtin && !it.html : fav.has(it.key))).length;
  clear(root,
    h('p', { class: 'ws-sub' }, '선생님이 만들고 나누는 수업 도구 공방 — 우리 반 명단과 연결해 바로 실행합니다'),
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', class: 'grow', placeholder: '도구 이름·설명·만든 선생님으로 찾기', value: remember('ws_q') || '', onchange: (e) => { remember('ws_q', e.target.value); reload(); } }),
      h('span', { class: 'muted small' }, '정렬'),
      seg([['popular', '🔥 인기순'], ['new', '🕒 최신순']], sort, (v) => { remember('ws_sort', v); reload(); }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('market', null, { defaults: { kind: 'HTML 도구', category: '수업 도구' }, onSaved: reload }) }, '+ 올리기')),
    h('div', { class: 'toolbar' },
      seg([['all', `전체 ${items.length}`], ['builtin', `기본 도구 ${count('builtin')}`], ['shared', `선생님 도구 ${count('shared')}`], ['links', `자료 ${count('links')}`], ['fav', `☆ 즐겨찾기 ${count('fav')}`]], view, (v) => { remember('ws_view', v); reload(); }),
      h('div', { class: 'seg' }, ['', ...CATS].map((c) => h('button', { class: cat === c ? 'on' : '', onclick: () => { remember('ws_cat', c); reload(); } }, c || '모든 분류')))),
    h('div', { class: `roster-band ${students.length ? 'ok' : ''}` },
      h('span', { class: 'rb-ico' }, '🔗'),
      h('div', { class: 'grow' }, h('strong', {}, students.length ? `우리 반 명단 ${students.length}명이 연결되어 있습니다` : '명단을 입력하면 모든 도구에서 학생 이름이 자동으로 쓰입니다'),
        h('div', { class: 'muted small' }, '이름 뽑기 · 모둠 편성 · 발표 순서 · 퀴즈 · 학습지 · 선생님 도구(명단 보내기)')),
      h('a', { class: 'btn small primary', href: '#/desk/class/students' }, students.length ? '명단 보기' : '+ 학생 명단')),
    shown.length ? h('div', { class: 'ws-grid' }, shown.map((it) => h('div', { class: 'ws-card', onclick: () => open(it) },
      h('button', { class: `mk-fav ws-star ${fav.has(it.key) ? 'on' : ''}`, title: '즐겨찾기', onclick: (e) => { e.stopPropagation(); toggleFav(it.key); reload(); } }, fav.has(it.key) ? '★' : '☆'),
      it.builtin ? thumb(it.t.icon, it.t.color) : thumb(it.html ? '🧩' : '🔗', it.html ? '#8b5cf6' : '#64748b'),
      h('div', { class: 'ws-body' },
        h('strong', {}, it.title),
        h('div', { class: 'muted small clamp' }, it.desc),
        h('div', { class: 'ws-meta' },
          h('span', { class: 'tag' }, it.cat), it.builtin ? h('span', { class: 'tag ghost' }, '기본') : it.html ? h('span', { class: 'tag ghost' }, 'HTML 도구') : h('span', { class: 'tag ghost' }, '링크'),
          it.builtin && it.t.roster ? h('span', { class: 'tag ghost' }, '🔗 명단 연동') : null,
          h('span', { class: 'grow' }),
          !it.builtin ? h('button', { class: `link-btn ${(it.r.data.likes || []).includes(me) ? 'liked' : ''}`, onclick: (e) => like(it.r, e) }, `${(it.r.data.likes || []).includes(me) ? '♥' : '♡'} ${it.likes}`) : null),
        h('div', { class: 'muted small' }, `${it.builtin ? '🧰' : '👤'} ${it.maker}${it.builtin ? '' : ' 선생님'}${it.date ? ` · ${it.date}` : ''}`),
        it.mine ? h('button', { class: 'link-btn', onclick: (e) => { e.stopPropagation(); openRecordForm('market', it.r, { onSaved: reload }); } }, '수정') : null)))) :
      h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🧰'), h('p', {}, '조건에 맞는 도구가 없습니다.')),
    h('p', { class: 'hint' }, 'Teachshop은 OnlineFlatform을 쓰는 모든 학교 선생님이 함께 보는 공간입니다. 자료에 학생 개인정보를 담지 마세요. ', h('button', { class: 'link-btn', onclick: makerGuide }, 'HTML 도구 만드는 법')));
}

export async function myTools(root) {
  const rows = (await api('/api/records/market')).filter((r) => r.owner === state.me.email);
  const reload = () => myTools(root);
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: makerGuide }, 'HTML 도구 만드는 법'),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('market', null, { defaults: { kind: 'HTML 도구', category: '수업 도구' }, onSaved: reload }) }, '+ 올리기')),
    rows.length ? h('div', { class: 'ws-grid' }, rows.map((r) => h('div', { class: 'ws-card', onclick: () => openRecordForm('market', r, { onSaved: reload }) },
      thumb(r.data.kind === 'HTML 도구' ? '🧩' : '🔗', '#8b5cf6'),
      h('div', { class: 'ws-body' }, h('strong', {}, r.data.title), h('div', { class: 'muted small clamp' }, r.data.desc || ''),
        h('div', { class: 'ws-meta' }, h('span', { class: 'tag' }, r.data.category || '기타'), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, `♥ ${(r.data.likes || []).length}`)),
        r.data.kind === 'HTML 도구' ? h('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); location.hash = `#/desk/market/run?id=${r.id}`; } }, '▶ 실행') : null)))) :
      h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🧩'), h('p', {}, '내가 만든 수업 도구나 자료를 올려 다른 선생님과 나눠 보세요.')));
}

// 도구 실행 화면 (#/desk/market/run?tool=… 또는 ?id=…)
export async function toolRunner(root) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const stage = h('div', { class: 'tool-stage' });
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.().catch(() => {}));
  const back = h('a', { class: 'btn', href: '#/desk/market/overview' }, '← Teachshop');
  const builtin = toolById(qs.get('tool'));
  if (builtin) {
    const students = await roster().catch(() => []);
    const ctx = {
      students,
      save: (k, v) => { try { localStorage.setItem(`gy_tool_${builtin.id}_${k}`, JSON.stringify(v)); } catch { /* 무시 */ } },
      load: (k) => { try { return JSON.parse(localStorage.getItem(`gy_tool_${builtin.id}_${k}`)); } catch { return null; } },
    };
    clear(root, h('div', { class: 'toolbar' }, back, h('strong', { class: 'tool-title' }, `${builtin.icon} ${builtin.name}`), h('span', { class: 'muted small' }, builtin.desc), h('span', { class: 'grow' }),
      builtin.roster ? h('span', { class: 'tag' }, `🔗 명단 ${students.length}명`) : null,
      h('button', { class: 'btn', onclick: full }, '⛶ 전체 화면')), stage);
    builtin.run(stage, ctx);
    return;
  }
  const rows = await api('/api/records/market');
  const r = rows.find((x) => x.id === qs.get('id'));
  if (!r || !r.data.html) return clear(root, back, h('p', { class: 'alert warn' }, '도구를 찾을 수 없습니다.'));
  // 다른 선생님이 만든 코드는 안전 상자(sandbox) 안에서만 실행: 이 사이트의 로그인·자료에 접근 불가
  const frame = h('iframe', { class: 'tool-frame', sandbox: 'allow-scripts allow-modals allow-forms allow-popups', title: r.data.title, referrerpolicy: 'no-referrer' });
  frame.srcdoc = r.data.html;
  const send = async () => {
    const students = await roster().catch(() => []);
    if (!students.length) { toast('학생 명단이 없습니다.', 'error'); return; }
    if (!confirm(`이 도구에 학생 ${students.length}명의 번호·이름을 보낼까요?\n(다른 선생님이 만든 도구입니다. 믿을 수 있는 도구에만 보내 주세요.)`)) return;
    frame.contentWindow.postMessage({ type: 'roster', students: students.map(({ num, name }) => ({ num, name })) }, '*');
    toast('명단을 보냈습니다.');
  };
  clear(root, h('div', { class: 'toolbar' }, back, h('strong', { class: 'tool-title' }, `🧩 ${r.data.title}`), h('span', { class: 'muted small' }, `👤 ${r.author} 선생님`), h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: send }, '📤 학생 명단 보내기'),
    h('button', { class: 'btn', onclick: full }, '⛶ 전체 화면')),
  stage);
  stage.append(frame);
}

function makerGuide() {
  const code = `<!-- 한 장짜리 HTML 수업 도구 예시 -->
<!doctype html><html><body style="font-family:sans-serif;text-align:center">
<h1 id="who">명단을 기다리는 중…</h1>
<button onclick="pick()">뽑기</button>
<script>
  let students = [];
  // 선생님이 [학생 명단 보내기]를 누르면 이 메시지가 옵니다
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'roster') { students = e.data.students; document.getElementById('who').textContent = students.length + '명 연결됨'; }
  });
  function pick() { const s = students[Math.floor(Math.random() * students.length)]; document.getElementById('who').textContent = s ? s.name : '명단 없음'; }
</script></body></html>`;
  modal('🧩 HTML 도구 만드는 법', h('div', { class: 'form' },
    h('ol', {},
      h('li', {}, '한 장짜리 HTML 파일로 수업 도구를 만듭니다. (AI에게 "초등 수업용 ○○ 도구를 HTML 한 파일로 만들어 줘"라고 부탁해도 됩니다)'),
      h('li', {}, 'Teachshop → [+ 올리기] → 종류 "HTML 도구" → HTML 코드 칸에 전체를 붙여넣습니다.'),
      h('li', {}, '학생 이름이 필요하면 아래처럼 message를 받으세요. 선생님이 [학생 명단 보내기]를 누를 때만 { type: "roster", students: [{ num, name }] }가 전달됩니다.')),
    h('pre', { class: 'code' }, code),
    h('p', { class: 'hint' }, '도구는 안전 상자(sandbox)에서 실행되어 OnlineFlatform 로그인·자료에 접근할 수 없습니다. 외부 서버로 학생 정보를 보내는 도구는 올리지 마세요.')), [], { wide: true });
}
