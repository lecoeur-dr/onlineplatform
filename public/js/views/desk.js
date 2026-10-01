// 🪴 Deskterior: 선생님 개인 공간 (본인만 봄) — 학급 · 수업 · 평가 · 기록 · 마켓
//   tdesk(선생님의 책상)의 학급/수업/평가/기록/마켓 구성을 참고
import { h, api, clear, toast, modal, fmtDate, addDays, today, DOW, confirmBox, download } from '../ui.js';
import { state, remember, hasSchool, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { gridEditor, DEFAULT_GRID, sortTimetables } from './timetable.js';
import { seg } from './schedule.js';
import { dday } from './notices.js';

// ---------- 공통 ----------

async function loadStudents() {
  const rows = await api(`/api/records/students?year=${state.year}`);
  rows.sort((a, b) => (Number(a.data.num) || 999) - (Number(b.data.num) || 999) || String(a.data.name).localeCompare(String(b.data.name), 'ko'));
  state.students = rows.map((r) => r.data.name).filter(Boolean);
  return rows;
}

const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const dowOf = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getDay(); };

function nextDue(due, repeat) {
  const d = due || today();
  if (repeat === '매일') return addDays(d, 1);
  if (repeat === '평일') { let x = addDays(d, 1); while ([0, 6].includes(dowOf(x))) x = addDays(x, 1); return x; }
  if (repeat === '매주') return addDays(d, 7);
  if (repeat === '매월') { const [y, m, dd] = d.split('-').map(Number); const t = new Date(y, m, Math.min(dd, new Date(y, m + 1, 0).getDate())); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
  return d;
}

// 할 일 완료: 반복 할 일은 다음 날짜로 넘어감
async function completeTodo(r) {
  const rep = r.data.repeat && r.data.repeat !== '없음';
  const data = rep ? { ...r.data, due: nextDue(r.data.due, r.data.repeat), done: false } : { ...r.data, done: !r.data.done };
  await api(`/api/records/todos/${r.id}`, { method: 'PUT', body: { data, version: r.version } });
  if (rep) toast(`다음: ${fmtDate(data.due)}`);
}

function todoItem(r, reload) {
  const t = today();
  const late = r.data.due && r.data.due < t && !r.data.done;
  return h('li', { class: `todo ${r.data.done ? 'done' : ''} ${late ? 'late' : ''}` },
    h('input', { type: 'checkbox', checked: !!r.data.done, 'aria-label': '완료', onchange: async () => { try { await completeTodo(r); reload(); } catch (e) { toast(e.message, 'error'); } } }),
    h('span', { class: 'click grow', onclick: () => openRecordForm('todos', r, { onSaved: reload }) }, r.data.title,
      r.data.repeat && r.data.repeat !== '없음' ? h('span', { class: 'tag ghost' }, `🔁 ${r.data.repeat}`) : null),
    r.data.due ? h('span', { class: `muted small ${late ? 'danger' : ''}` }, r.data.due === t ? '오늘' : fmtDate(r.data.due)) : null);
}

// 내 시간표에서 오늘(요일) 칸
function todayLessons(tts, d = today()) {
  const tt = tts[0];
  if (!tt) return null;
  const g = tt.data.grid || DEFAULT_GRID();
  const di = g.days.indexOf(DOW[dowOf(d)]);
  if (di < 0) return [];
  return g.periods.map((p, pi) => ({ period: p, text: g.cells[pi]?.[di] || '' }));
}

// ---------- 내 책상 (홈) ----------

async function deskHome(root) {
  const t = today();
  const [d, briefs] = await Promise.all([
    api(`/api/bundle?year=${state.year}&modules=todos,myTimetable,progress,notes,students`),
    hasSchool() ? api(`/api/records/briefings?year=${state.year}`).catch(() => []) : Promise.resolve([]),
  ]);
  const reload = () => deskHome(root);
  const todos = d.todos.filter((r) => !r.data.done && (!r.data.due || r.data.due <= addDays(t, 3))).sort((a, b) => String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
  const lessons = todayLessons(d.myTimetable);
  const nextProg = [];
  const seen = new Set();
  for (const p of d.progress.filter((x) => !x.data.done).sort((a, b) => String(a.data.date || '9').localeCompare(String(b.data.date || '9')))) {
    if (seen.has(p.data.subject)) continue;
    seen.add(p.data.subject); nextProg.push(p);
  }
  const todayBriefs = briefs.filter((b) => b.data.date === t);
  const weekNotes = d.notes.filter((n) => n.data.date >= addDays(t, -6));
  const [y, m, dd] = t.split('-').map(Number);

  clear(root,
    h('div', { class: 'desk-hello' }, h('strong', {}, `${myName() || '선생님'}의 책상`), h('span', { class: 'muted' }, ` · ${m}월 ${dd}일 ${DOW[dowOf(t)]}요일`)),
    h('div', { class: 'dash' },
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, '✅ 할 일'), h('button', { class: 'btn small primary', onclick: () => openRecordForm('todos', null, { defaults: { due: t, repeat: '없음' }, onSaved: reload }) }, '+ 할 일')),
        todos.length ? h('ul', { class: 'list todo-list' }, todos.map((r) => todoItem(r, reload))) : h('p', { class: 'muted' }, '3일 안에 할 일이 없습니다.'),
        h('a', { href: '#/desk/record/todos', class: 'more-link' }, '전체 할 일 →')),
      h('div', { class: 'card' }, h('h3', {}, '📣 오늘 전달사항'),
        !hasSchool() ? h('p', { class: 'muted small' }, '학교에 가입하면 학교의 조례·종례 전달사항이 여기에 나옵니다.') :
        todayBriefs.length ? todayBriefs.map((b) => h('div', { class: 'brief-row' }, b.data.kind ? h('span', { class: 'tag' }, b.data.kind) : null, h('div', { class: 'pre' }, b.data.content))) : h('p', { class: 'muted' }, '오늘 전달사항이 없습니다.'),
        hasSchool() ? h('a', { href: '#/notice/briefings', class: 'more-link' }, '전달사항 →') : null),
      h('div', { class: 'card' }, h('h3', {}, '🗓 오늘 내 수업'),
        lessons === null ? h('p', { class: 'muted small' }, '내 시간표를 만들면 오늘 수업이 보입니다. ', h('a', { href: '#/desk/lesson/timetable' }, '만들기 →')) :
        lessons.length ? h('table', { class: 'table compact' }, h('tbody', {}, lessons.map((l) => h('tr', {}, h('th', {}, l.period), h('td', {}, l.text || h('span', { class: 'muted' }, '-')))))) : h('p', { class: 'muted' }, '오늘은 수업이 없는 날입니다.')),
      h('div', { class: 'card' }, h('h3', {}, '📘 다음 진도'),
        nextProg.length ? h('ul', { class: 'list' }, nextProg.map((p) => h('li', { class: 'click', onclick: () => openRecordForm('progress', p, { onSaved: reload }) }, h('strong', {}, p.data.subject), ` ${p.data.unit}`, p.data.date ? h('span', { class: 'muted small' }, ` ${fmtDate(p.data.date)}`) : null))) : h('p', { class: 'muted' }, '진도표가 비어 있습니다.'),
        h('a', { href: '#/desk/lesson/progress', class: 'more-link' }, '진도표 →')),
      h('div', { class: 'card' }, h('h3', {}, '🗒 이번 주 누가기록'),
        h('div', { class: 'mini-kpi' }, h('span', {}, '기록'), h('strong', {}, `${weekNotes.length}건`)),
        h('div', { class: 'mini-kpi' }, h('span', {}, '기록한 학생'), h('strong', {}, `${new Set(weekNotes.map((n) => n.data.student)).size} / ${d.students.length}명`)),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn small primary', onclick: async () => { await loadStudents(); openRecordForm('notes', null, { defaults: { date: t, category: '관찰' }, onSaved: reload }); } }, '+ 기록'),
          h('a', { href: '#/desk/record/overview', class: 'more-link' }, '누가기록 →'))),
      h('div', { class: 'card' }, h('h3', {}, '🧒 우리 반'),
        h('p', {}, `학생 ${d.students.length}명`),
        h('div', { class: 'row-actions' },
          h('a', { class: 'btn small', href: '#/desk/class/tools' }, '🎲 뽑기'),
          h('a', { class: 'btn small', href: '#/desk/class/seats' }, '🪑 자리'),
          h('a', { class: 'btn small', href: '#/desk/market/overview' }, '🛍 마켓')))),
    h('p', { class: 'hint' }, `🔒 Deskterior의 기록은 본인만 볼 수 있고, 학생 특이사항·누가기록 내용은 암호화해 저장합니다. 학생 개인정보는 꼭 필요한 만큼만 적어 주세요. (${y}학년도)`));
}

// ---------- 학급 ----------

async function classOverview(root) {
  const [students, d] = await Promise.all([loadStudents(), api(`/api/bundle?year=${state.year}&modules=classRoles,seatPlan`)]);
  const boys = students.filter((s) => s.data.gender === '남').length;
  const girls = students.filter((s) => s.data.gender === '여').length;
  const seat = d.seatPlan.at(-1);
  clear(root,
    h('div', { class: 'dash' },
      h('div', { class: 'card' }, h('h3', {}, '🧒 학생'), h('div', { class: 'mini-kpi' }, h('span', {}, '전체'), h('strong', {}, `${students.length}명`)),
        h('div', { class: 'mini-kpi' }, h('span', {}, '남 / 여'), h('strong', {}, `${boys} / ${girls}`)), h('a', { href: '#/desk/class/students', class: 'more-link' }, '명단 →')),
      h('div', { class: 'card' }, h('h3', {}, '🧹 1인 1역'),
        d.classRoles.length ? h('ul', { class: 'list' }, d.classRoles.slice(0, 8).map((r) => h('li', {}, h('strong', {}, r.data.role), ' ', h('span', { class: 'muted' }, (r.data.students || []).join(', '))))) : h('p', { class: 'muted' }, '역할이 없습니다.'),
        h('a', { href: '#/desk/class/roles', class: 'more-link' }, '1인 1역 →')),
      h('div', { class: 'card' }, h('h3', {}, `🪑 자리 ${seat ? `· ${seat.data.title}` : ''}`),
        seat ? seatGrid(seat.data.layout, { small: true }) : h('p', { class: 'muted' }, '자리 배치가 없습니다.'),
        h('a', { href: '#/desk/class/seats', class: 'more-link' }, '자리 배치 →'))));
}

async function studentsView(root) {
  await loadStudents();
  const reload = () => studentsView(root);
  const box = h('div', {});
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => bulkAdd(reload) }, '📋 여러 명 붙여넣기')),
    box);
  await tableView(box, 'students', { reload, defaults: { num: state.students.length + 1 } });
}

function bulkAdd(reload) {
  const ta = h('textarea', { rows: 12, placeholder: '한 줄에 한 명: 번호 이름 성별\n예)\n1 김하늘 여\n2 이바다 남' });
  modal('📋 학생 여러 명 추가', h('div', { class: 'form' }, h('p', { class: 'muted small' }, '엑셀에서 번호·이름·성별 칸을 복사해 붙여넣어도 됩니다.'), ta), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const rows = ta.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const parts = l.split(/[\t,\s]+/);
        const num = /^\d+$/.test(parts[0]) ? Number(parts.shift()) : undefined;
        const gender = ['남', '여'].includes(parts.at(-1)) ? parts.pop() : undefined;
        return { num, name: parts.join(' '), gender };
      }).filter((r) => r.name);
      for (const r of rows) await api('/api/records/students', { method: 'POST', body: { data: r, year: state.year } });
      toast(`${rows.length}명을 추가했습니다.`);
      close(); reload();
    } }, '추가'),
  ]);
}

function seatGrid(layout, { small = false, onPick, picked } = {}) {
  if (!layout) return h('p', { class: 'muted' }, '-');
  const { rows, cols, seats } = layout;
  return h('div', { class: `seat-wrap ${small ? 'small' : ''}` },
    h('div', { class: 'teacher-desk' }, '교탁'),
    h('div', { class: 'seats', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } },
      Array.from({ length: rows * cols }, (_, i) => h('button', {
        class: `seat ${seats[i] ? '' : 'empty'} ${picked === i ? 'picked' : ''}`, disabled: !onPick, onclick: onPick ? () => onPick(i) : null,
      }, seats[i] || ''))));
}

async function seatsView(root, selId) {
  await loadStudents();
  const plans = await api(`/api/records/seatPlan?year=${state.year}`);
  const reload = (id) => seatsView(root, id);
  let plan = plans.find((p) => p.id === (selId || remember('seat_sel'))) || plans.at(-1) || null;
  let layout = plan?.data.layout ? JSON.parse(JSON.stringify(plan.data.layout)) : { rows: 5, cols: 6, seats: [] };
  let picked = null;
  const area = h('div', {});
  const draw = () => clear(area, seatGrid(layout, { picked, onPick: (i) => {
    if (picked === null) { picked = i; } else { [layout.seats[picked], layout.seats[i]] = [layout.seats[i] || '', layout.seats[picked] || '']; picked = null; }
    draw();
  } }));
  const shuffleAll = () => {
    const n = layout.rows * layout.cols;
    if (state.students.length > n) { toast(`자리(${n})보다 학생(${state.students.length})이 많습니다. 줄·칸을 늘려 주세요.`, 'error'); return; }
    const mixed = shuffle(state.students);
    layout.seats = Array.from({ length: n }, (_, i) => mixed[i] || '');
    picked = null; draw();
  };
  const save = async (asNew) => {
    try {
      if (plan && !asNew) await api(`/api/records/seatPlan/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, layout }, version: plan.version } });
      else {
        const title = prompt('이름 (예: 1학기 2차)', `${new Date().getMonth() + 1}월 자리`);
        if (!title) return;
        plan = await api('/api/records/seatPlan', { method: 'POST', body: { data: { title, layout }, year: state.year } });
      }
      remember('seat_sel', plan.id);
      toast('저장했습니다.'); reload(plan.id);
    } catch (e) { toast(e.message, 'error'); }
  };
  const num = (key, label) => h('label', { class: 'inline' }, label, h('input', { type: 'number', min: 1, max: 12, value: layout[key], style: { width: '60px' }, onchange: (e) => { layout[key] = Math.max(1, Math.min(12, Number(e.target.value) || 1)); draw(); } }));
  clear(root,
    h('div', { class: 'toolbar' },
      plans.length ? h('select', { onchange: (e) => { remember('seat_sel', e.target.value); reload(e.target.value); } }, plans.map((p) => h('option', { value: p.id, selected: p.id === plan?.id }, p.data.title))) : null,
      num('rows', '줄 '), num('cols', '칸 '),
      h('button', { class: 'btn', onclick: shuffleAll }, '🎲 랜덤 배치'),
      h('span', { class: 'grow' }),
      plan ? h('button', { class: 'btn primary', onclick: () => save(false) }, '저장') : null,
      h('button', { class: plan ? 'btn' : 'btn primary', onclick: () => save(true) }, '새로 저장'),
      h('button', { class: 'btn', onclick: () => window.print() }, '인쇄')),
    !state.students.length ? h('p', { class: 'alert warn' }, '학생 명단을 먼저 입력해 주세요. ', h('a', { href: '#/desk/class/students' }, '학생 명단 →')) : null,
    area,
    h('p', { class: 'hint' }, '자리 두 곳을 차례로 누르면 서로 바뀝니다. 위쪽이 교탁(칠판) 쪽입니다.'));
  draw();
}

async function rolesView(root) {
  await loadStudents();
  const reload = () => rolesView(root);
  const box = h('div', {});
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: async () => {
        const roles = await api(`/api/records/classRoles?year=${state.year}`);
        if (!roles.length || !state.students.length) { toast('역할과 학생 명단이 있어야 합니다.', 'error'); return; }
        if (!(await confirmBox(`학생 ${state.students.length}명을 역할 ${roles.length}개에 고르게 랜덤 배정할까요? (지금 배정은 바뀝니다)`))) return;
        const mixed = shuffle(state.students);
        const buckets = roles.map(() => []);
        mixed.forEach((s, i) => buckets[i % roles.length].push(s));
        for (let i = 0; i < roles.length; i++) await api(`/api/records/classRoles/${roles[i].id}`, { method: 'PUT', body: { data: { ...roles[i].data, students: buckets[i] }, version: roles[i].version } });
        toast('배정했습니다.'); reload();
      } }, '🎲 랜덤 배정')),
    box);
  await tableView(box, 'classRoles', { reload });
}

// 뽑기 · 모둠 나누기 · 타이머
async function toolsView(root) {
  await loadStudents();
  let pool = remember('pick_pool') || [];
  if (!pool.length) pool = state.students.slice();
  const out = h('div', { class: 'pick-out' }, '🎲');
  const groupsOut = h('div', {});
  const timerOut = h('div', { class: 'timer' }, '00:00');
  let timerId = null;
  const pick = () => {
    if (!state.students.length) { toast('학생 명단을 먼저 입력해 주세요.', 'error'); return; }
    const noRepeat = root.querySelector('#norep')?.checked;
    if (noRepeat && !pool.length) pool = state.students.slice();
    const list = noRepeat ? pool : state.students;
    let n = 0;
    const spin = setInterval(() => {
      out.textContent = list[Math.floor(Math.random() * list.length)];
      if (++n > 12) {
        clearInterval(spin);
        const who = list[Math.floor(Math.random() * list.length)];
        out.textContent = who;
        if (noRepeat) { pool = pool.filter((x) => x !== who); remember('pick_pool', pool); }
        drawLeft();
      }
    }, 60);
  };
  const left = h('span', { class: 'muted small' });
  const drawLeft = () => { left.textContent = root.querySelector('#norep')?.checked ? `남은 학생 ${pool.length}명` : ''; };
  const groups = (n) => {
    const mixed = shuffle(state.students);
    const gs = Array.from({ length: n }, () => []);
    mixed.forEach((s, i) => gs[i % n].push(s));
    clear(groupsOut, h('div', { class: 'cards' }, gs.map((g, i) => h('div', { class: 'card' }, h('strong', {}, `${i + 1}모둠`), h('div', {}, g.join(', '))))));
  };
  const startTimer = (sec) => {
    clearInterval(timerId);
    let s = sec;
    const show = () => { timerOut.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; timerOut.classList.toggle('end', s <= 0); };
    show();
    timerId = setInterval(() => { s--; show(); if (s <= 0 || !root.isConnected) { clearInterval(timerId); if (s <= 0) { try { navigator.vibrate?.(400); } catch { /* 무시 */ } } } }, 1000);
  };
  clear(root,
    h('div', { class: 'dash' },
      h('div', { class: 'card' }, h('h3', {}, '🎲 발표 뽑기'), out,
        h('div', { class: 'row-actions' }, h('button', { class: 'btn primary big', onclick: pick }, '뽑기'),
          h('label', { class: 'inline' }, h('input', { type: 'checkbox', id: 'norep', checked: true, onchange: drawLeft }), ' 뽑힌 학생 빼기'), left,
          h('button', { class: 'link-btn', onclick: () => { pool = state.students.slice(); remember('pick_pool', pool); drawLeft(); } }, '처음부터'))),
      h('div', { class: 'card' }, h('h3', {}, '👥 모둠 나누기'),
        h('div', { class: 'row-actions' }, [2, 3, 4, 5, 6, 7, 8].map((n) => h('button', { class: 'btn small', onclick: () => groups(n) }, `${n}모둠`))), groupsOut),
      h('div', { class: 'card' }, h('h3', {}, '⏱ 타이머'), timerOut,
        h('div', { class: 'row-actions' }, [1, 3, 5, 10].map((m) => h('button', { class: 'btn small', onclick: () => startTimer(m * 60) }, `${m}분`)),
          h('button', { class: 'btn small ghost', onclick: () => { clearInterval(timerId); timerOut.textContent = '00:00'; } }, '멈춤')))));
  drawLeft();
}

// ---------- 수업 ----------

async function lessonOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=myTimetable,progress`);
  const t = today();
  const days = [0, 1, 2, 3, 4].map((i) => addDays(t, i - ((dowOf(t) + 6) % 7)));
  const reload = () => lessonOverview(root);
  const week = d.progress.filter((p) => p.data.date >= days[0] && p.data.date <= days[4]).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const lessons = todayLessons(d.myTimetable);
  clear(root,
    h('div', { class: 'two-col' },
      h('div', { class: 'card' }, h('h3', {}, `🗓 오늘 수업 (${DOW[dowOf(t)]})`),
        lessons === null ? h('p', { class: 'muted' }, '내 시간표가 없습니다. ', h('a', { href: '#/desk/lesson/timetable' }, '만들기 →')) :
        lessons.length ? h('table', { class: 'table compact' }, h('tbody', {}, lessons.map((l) => h('tr', {}, h('th', {}, l.period), h('td', {}, l.text))))) : h('p', { class: 'muted' }, '오늘은 수업이 없는 날입니다.')),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, '📘 이번 주 진도'), h('button', { class: 'btn small primary', onclick: () => openRecordForm('progress', null, { defaults: { date: t }, onSaved: reload }) }, '+ 진도')),
        week.length ? h('ul', { class: 'list' }, week.map((p) => h('li', { class: `click ${p.data.done ? 'muted' : ''}`, onclick: () => openRecordForm('progress', p, { onSaved: reload }) },
          p.data.done ? '✔ ' : '', h('strong', {}, p.data.subject), ` ${p.data.unit}`, h('span', { class: 'muted small' }, ` ${fmtDate(p.data.date)}`)))) : h('p', { class: 'muted' }, '이번 주 진도가 없습니다.'))));
}

async function myTimetableView(root) {
  const rows = await api(`/api/records/myTimetable?year=${state.year}`);
  const reload = () => myTimetableView(root);
  const edit = (r, defaults) => openRecordForm('myTimetable', r, { extra: gridEditor, onSaved: reload, defaults });
  const importSchool = async () => {
    const list = sortTimetables(await api(`/api/records/timetables?year=${state.year}`));
    if (!list.length) { toast('학교 시간표가 없습니다.', 'error'); return; }
    const close = modal('학교 시간표에서 가져오기', h('div', { class: 'choice' }, list.map((r) => h('button', { class: 'btn', onclick: async () => {
      close();
      await api('/api/records/myTimetable', { method: 'POST', body: { data: { title: `${r.data.title} (학교)`, semester: r.data.semester || '연간', grid: r.data.grid || DEFAULT_GRID() }, year: state.year } });
      toast('가져왔습니다. 내 시간표는 학교 시간표와 따로 고칠 수 있습니다.'); reload();
    } }, `${r.data.title} · ${r.data.kind || ''}`))));
  };
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      hasSchool() ? h('button', { class: 'btn', onclick: importSchool }, '🏫 학교 시간표에서 가져오기') : null,
      h('button', { class: 'btn primary', onclick: () => edit(null, { title: '내 시간표', semester: '연간' }) }, '+ 시간표')),
    rows.length ? h('div', { class: 'cards' }, rows.map((r) => {
      const g = r.data.grid || DEFAULT_GRID();
      return h('div', { class: 'card tt-card' },
        h('div', { class: 'card-head' }, h('strong', {}, r.data.title, r.data.semester ? h('span', { class: 'tag ghost' }, r.data.semester) : null), h('button', { class: 'link-btn', onclick: () => edit(r) }, '수정')),
        h('table', { class: 'tt' }, h('thead', {}, h('tr', {}, h('th', {}, ''), g.days.map((x) => h('th', { class: x === DOW[dowOf(today())] ? 'today' : '' }, x)))),
          h('tbody', {}, g.periods.map((p, pi) => h('tr', {}, h('th', {}, p), g.days.map((_, di) => h('td', { class: 'pre' }, g.cells[pi]?.[di] || '')))))));
    })) : h('p', { class: 'muted' }, '내 시간표가 없습니다. 첫 번째 시간표가 "내 책상"의 오늘 수업에 쓰입니다.'));
}

async function progressView(root) {
  await tableView(root, 'progress', { groupBy: 'subject', defaults: { date: today() } });
}

// ---------- 평가 ----------

const LEVELS = ['잘함', '보통', '노력 요함'];

async function evalView(root, openId) {
  await loadStudents();
  const plans = await api(`/api/records/evalPlans?year=${state.year}`);
  const reload = (id) => evalView(root, id);
  const plan = plans.find((p) => p.id === openId);
  if (plan) return scoreSheet(root, plan, reload);
  const bySubject = new Map();
  for (const p of plans) { const k = p.data.subject || '기타'; if (!bySubject.has(k)) bySubject.set(k, []); bySubject.get(k).push(p); }
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => openRecordForm('evalPlans', null, { onSaved: (r) => r && reload(r.id) }) }, '+ 평가 계획')),
    plans.length ? [...bySubject].map(([subj, list]) => h('section', { class: 'section' }, h('h3', {}, subj),
      h('div', { class: 'cards' }, list.map((p) => {
        const sc = p.data.scores || {};
        const done = state.students.filter((s) => sc[s]?.level).length;
        return h('div', { class: 'card click', onclick: () => reload(p.id) },
          h('strong', {}, p.data.area || p.data.subject), h('div', { class: 'muted small' }, [p.data.timing, p.data.method].filter(Boolean).join(' · ')),
          p.data.standard ? h('div', { class: 'small clamp' }, p.data.standard) : null,
          h('div', { class: 'progress-bar' }, h('span', { style: { width: `${state.students.length ? (done / state.students.length) * 100 : 0}%` } })),
          h('div', { class: 'muted small' }, `기록 ${done} / ${state.students.length}명`));
      })))) : h('p', { class: 'muted' }, '평가 계획을 추가한 뒤, 눌러서 학생별 결과(잘함·보통·노력 요함)와 메모를 기록합니다.'));
}

function scoreSheet(root, plan, reload) {
  const scores = JSON.parse(JSON.stringify(plan.data.scores || {}));
  const count = (lv) => state.students.filter((s) => scores[s]?.level === lv).length;
  const sum = h('div', { class: 'row-actions' });
  const drawSum = () => clear(sum, LEVELS.map((lv) => h('span', { class: 'tag' }, `${lv} ${count(lv)}`)), h('span', { class: 'tag ghost' }, `미기록 ${state.students.length - LEVELS.reduce((a, lv) => a + count(lv), 0)}`));
  const save = async () => {
    try { await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, scores }, version: plan.version } }); toast('저장했습니다.'); reload(plan.id); } catch (e) { toast(e.message, 'error'); }
  };
  const csv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', '결과', '메모'].map(esc).join(',')];
    state.students.forEach((s, i) => lines.push([i + 1, s, scores[s]?.level || '', scores[s]?.note || ''].map(esc).join(',')));
    download(`평가_${plan.data.subject}_${plan.data.area || ''}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => reload() }, '← 목록'),
      h('strong', {}, `${plan.data.subject} · ${plan.data.area || ''}`),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => openRecordForm('evalPlans', plan, { onSaved: (r) => reload(r?.id) }) }, '계획 수정'),
      h('button', { class: 'btn', onclick: csv }, 'CSV'),
      h('button', { class: 'btn primary', onclick: save }, '저장')),
    plan.data.standard ? h('p', { class: 'muted pre' }, plan.data.standard) : null,
    sum,
    !state.students.length ? h('p', { class: 'alert warn' }, '학생 명단을 먼저 입력해 주세요.') :
    h('div', { class: 'table-wrap' }, h('table', { class: 'table score' },
      h('thead', {}, h('tr', {}, ['번호', '이름', ...LEVELS, '메모'].map((x) => h('th', {}, x)))),
      h('tbody', {}, state.students.map((s, i) => {
        scores[s] ||= {};
        return h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, h('strong', {}, s)),
          LEVELS.map((lv) => h('td', { class: 'center' }, h('input', { type: 'radio', name: `lv_${i}`, checked: scores[s].level === lv, 'aria-label': `${s} ${lv}`, onchange: () => { scores[s].level = lv; drawSum(); } }))),
          h('td', {}, h('input', { value: scores[s].note || '', placeholder: '관찰 내용', oninput: (e) => { scores[s].note = e.target.value; } })));
      })))),
    h('p', { class: 'hint' }, '결과를 고른 뒤 [저장]을 누르세요. 메모는 생활기록부 작성 때 참고 자료로 쓸 수 있습니다.'));
  drawSum();
}

// ---------- 기록 ----------

async function notesView(root) {
  await loadStudents();
  const rows = await api(`/api/records/notes?year=${state.year}`);
  const reload = () => notesView(root);
  const who = remember('note_student') || '';
  const shown = rows.filter((r) => !who || r.data.student === who).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const counts = {};
  for (const r of rows) counts[r.data.student] = (counts[r.data.student] || 0) + 1;
  clear(root,
    h('div', { class: 'toolbar' },
      h('select', { onchange: (e) => { remember('note_student', e.target.value); reload(); } }, h('option', { value: '' }, '전체 학생'), state.students.map((s) => h('option', { value: s, selected: s === who }, `${s} (${counts[s] || 0})`))),
      h('span', { class: 'muted' }, `${shown.length}건`),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('notes', null, { defaults: { date: today(), category: '관찰', student: who }, onSaved: reload }) }, '+ 기록')),
    !who && state.students.length ? h('div', { class: 'note-chips' }, state.students.map((s) => h('button', { class: `chip-btn ${counts[s] ? '' : 'zero'}`, onclick: () => { remember('note_student', s); reload(); } }, s, h('span', { class: 'cnt' }, counts[s] || 0)))) : null,
    shown.length ? h('ul', { class: 'timeline' }, shown.map((r) => h('li', { class: 'click', onclick: () => openRecordForm('notes', r, { onSaved: reload }) },
      h('div', { class: 'tl-head' }, h('strong', {}, r.data.student), r.data.category ? h('span', { class: 'tag ghost' }, r.data.category) : null, h('span', { class: 'muted small' }, fmtDate(r.data.date))),
      h('div', { class: 'pre' }, r.data.content)))) : h('p', { class: 'muted' }, '기록이 없습니다.'),
    h('p', { class: 'hint' }, '회색 이름은 아직 기록이 없는 학생입니다. 내용은 암호화되어 저장되며 본인만 볼 수 있습니다.'));
}

async function todosView(root) {
  const rows = await api(`/api/records/todos?year=${state.year}`);
  const reload = () => todosView(root);
  const mode = remember('todo_mode') || 'open';
  const shown = rows.filter((r) => (mode === 'done' ? r.data.done : !r.data.done)).sort((a, b) => String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
  clear(root,
    h('div', { class: 'toolbar' },
      seg([['open', '할 일'], ['done', '완료']], mode, (v) => { remember('todo_mode', v); reload(); }),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('todos', null, { defaults: { due: today(), repeat: '없음' }, onSaved: reload }) }, '+ 할 일')),
    shown.length ? h('ul', { class: 'list todo-list' }, shown.map((r) => todoItem(r, reload))) : h('p', { class: 'muted' }, mode === 'done' ? '완료한 일이 없습니다.' : '할 일이 없습니다. 👏'),
    h('p', { class: 'hint' }, '반복 할 일(매일·평일·매주·매월)은 체크하면 다음 날짜로 넘어갑니다. 나만 보는 목록입니다.'));
}

// ---------- 마켓 ----------

async function marketView(root) {
  const rows = await api('/api/records/market');
  const reload = () => marketView(root);
  const cat = remember('mk_cat') || '';
  const q = (remember('mk_q') || '').toLowerCase();
  const mine = remember('mk_mine') || false;
  const me = state.me.email;
  const cats = ['학급 운영', '수업 자료', '평가 자료', '업무 서식', '에듀테크', '기타'];
  const shown = rows.filter((r) => (!cat || r.data.category === cat) && (!mine || r.owner === me) && (!q || JSON.stringify(r.data).toLowerCase().includes(q)));
  const like = async (r) => {
    const on = !(r.data.likes || []).includes(me);
    try { await api(`/api/records/market/${r.id}/self`, { method: 'POST', body: { on } }); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, ['', ...cats].map((c) => h('button', { class: cat === c ? 'on' : '', onclick: () => { remember('mk_cat', c); reload(); } }, c || '전체'))),
      h('input', { type: 'search', placeholder: '검색', value: remember('mk_q') || '', onchange: (e) => { remember('mk_q', e.target.value); reload(); } }),
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: mine, onchange: (e) => { remember('mk_mine', e.target.checked); reload(); } }), ' 내 자료'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('market', null, { defaults: { category: cat || '수업 자료' }, onSaved: reload }) }, '+ 자료 올리기')),
    shown.length ? h('div', { class: 'cards market' }, shown.map((r) => {
      const liked = (r.data.likes || []).includes(me);
      return h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('span', { class: 'tag ghost' }, r.data.category || '기타'), r.owner === me ? h('button', { class: 'link-btn', onclick: () => openRecordForm('market', r, { onSaved: reload }) }, '수정') : null),
        h('strong', {}, r.data.title), r.data.grades ? h('div', { class: 'muted small' }, r.data.grades) : null,
        r.data.desc ? h('div', { class: 'small pre clamp' }, r.data.desc) : null,
        h('div', { class: 'row-actions' },
          r.data.link && /^https?:/.test(r.data.link) ? h('a', { class: 'btn small primary', href: r.data.link, target: '_blank', rel: 'noopener' }, '자료 열기') : null,
          h('button', { class: `btn small ${liked ? 'liked' : ''}`, onclick: () => like(r) }, `${liked ? '♥' : '♡'} ${(r.data.likes || []).length}`),
          h('span', { class: 'muted small' }, `${r.author} · ${String(r.updatedAt || '').slice(0, 10)}`)));
    })) : h('p', { class: 'muted' }, '자료가 없습니다. 첫 자료를 올려 보세요!'),
    h('p', { class: 'hint' }, '마켓은 OnlineFlatform을 쓰는 모든 학교 선생님이 함께 보는 공간입니다. 자료는 링크(드라이브·패들렛 등)로 공유하며, 학생 개인정보가 담긴 자료는 올리지 마세요.'));
}

export const DESK_VIEWS = {
  'home/': deskHome,
  'class/overview': classOverview,
  'class/students': studentsView,
  'class/seats': (el) => seatsView(el),
  'class/roles': rolesView,
  'class/tools': toolsView,
  'lesson/overview': lessonOverview,
  'lesson/timetable': myTimetableView,
  'lesson/progress': progressView,
  'eval/overview': (el) => evalView(el),
  'record/overview': notesView,
  'record/todos': todosView,
  'market/overview': marketView,
};

export { dday };
