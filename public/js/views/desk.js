// 🪴 Deskterior: 선생님 개인 공간 (본인만 봄) — 내 책상 · 학급 · 수업 · 평가 · 기록 · 마켓
//   벤치마킹: tdesk(메뉴 구성), 학급다이어리2(출결·체크리스트·이번 주), Classendo(즉석 평가·특기사항)
import { h, api, clear, toast, modal, fmtDate, addDays, today, DOW } from '../ui.js';
import { state, remember, hasSchool, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { seg } from './schedule.js';
import { loadStudents, sortStudents, todoItem, lessonsOn, dowOf, ATT_COLOR, monthOf, copyText } from './desk-common.js';
import { studentCards, attendanceView, checklistsView, pointsView, studentsView, seatsView, rolesView, toolsView } from './desk-class.js';
import { weekBoard, dailyNotesView, weeklyView, myTimetableView, progressView } from './desk-lesson.js';
import { evalView, studentEvalView, remarksView, planDocView, standardsView } from './desk-eval.js';
import { evalToolsView, boardView } from './desk-tools.js';
import { workshopHome, myTools, toolRunner } from './workshop.js';
import { portfolioView, careerView, worksheetsView, quizView, loadPrefs, savePrefs, orderPicker } from './desk-more.js';
import { classroomView } from './classroom.js';

// ---------- 내 책상 (홈): 카드 목록에서 골라 끌어오고 빼고 순서 바꾸기 (설정은 계정에 저장) ----------

export const HOME_CARDS = [
  { id: 'att', label: '🗓 오늘 출결' }, { id: 'note', label: '📒 오늘 알림장' }, { id: 'todo', label: '✅ 할 일' }, { id: 'lessons', label: '🕘 오늘 내 수업' },
  { id: 'briefs', label: '📣 오늘 전달사항 (학교)' }, { id: 'checks', label: '☑️ 확인할 체크리스트' }, { id: 'progress', label: '📘 다음 진도' }, { id: 'notes', label: '🗒 이번 주 누가기록' },
  { id: 'events', label: '📅 이번 주 학교 일정 (학교)' }, { id: 'deadlines', label: '⏰ 기한 임박 (학교)' }, { id: 'live', label: '⚡ 진행 중인 활동·퀴즈' },
  { id: 'points', label: '⭐ 칭찬 점수 순위' }, { id: 'portfolio', label: '🗂 포트폴리오 현황' }, { id: 'bdays', label: '🎂 이번 달 생일' }, { id: 'counsel', label: '💬 최근 상담' },
];
export const HOME_DEFAULT = ['att', 'note', 'todo', 'lessons', 'briefs', 'checks', 'progress', 'notes'];

function homeSettings(on, reload) {
  let next = [...on];
  modal('⚙ 내 책상 꾸미기', h('div', { class: 'form' },
    h('p', { class: 'muted small' }, '체크한 카드만 내 책상에 나옵니다. ⠿를 끌거나 ↑↓로 순서를 바꾸세요. 설정은 계정에 저장되어 어느 기기에서나 같습니다.'),
    orderPicker(HOME_CARDS, on, (ids) => { next = ids; })), [
    (close) => h('button', { class: 'btn', onclick: async () => { await savePrefs({ home: HOME_DEFAULT }); close(); toast('기본 구성으로 되돌렸습니다.'); reload(); } }, '기본값'),
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => { try { await savePrefs({ home: next }); close(); toast('저장했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); } } }, '저장'),
  ]);
}

async function deskHome(root) {
  const t = today();
  const [d, school, prefs] = await Promise.all([
    api(`/api/bundle?year=${state.year}&modules=students,todos,myTimetable,progress,notes,attendance,dailyNotes,checklists,points,activities,portfolios,counsels`),
    hasSchool() ? api(`/api/bundle?year=${state.year}&modules=briefings,events,deadlines`).catch(() => ({ briefings: [], events: [], deadlines: [] })) : Promise.resolve({ briefings: [], events: [], deadlines: [] }),
    loadPrefs(),
  ]);
  const on = (prefs.home || HOME_DEFAULT).filter((id) => HOME_CARDS.some((c) => c.id === id));
  const reload = () => deskHome(root);
  const students = sortStudents(d.students);
  const todos = d.todos.filter((r) => !r.data.done && (!r.data.due || r.data.due <= addDays(t, 3))).sort((a, b) => String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
  const lessons = lessonsOn(d.myTimetable);
  const att = d.attendance.filter((a) => a.data.date === t);
  const note = d.dailyNotes.find((n) => n.data.date === t);
  const briefs = school.briefings.filter((b) => b.data.date === t);
  const events = school.events.filter((e) => e.data.date <= t && (e.data.endDate || e.data.date) >= t);
  const weekEvents = school.events.filter((e) => e.data.date <= addDays(t, 6) && (e.data.endDate || e.data.date) >= t).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const deadlines = (school.deadlines || []).filter((x) => !x.data.done && x.data.date >= t && x.data.date <= addDays(t, 14)).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const checks = d.checklists.filter((c) => (c.data.done || []).length < students.length && (!c.data.due || c.data.due >= addDays(t, -7)));
  const nextProg = [];
  const seen = new Set();
  for (const p of d.progress.filter((x) => !x.data.done).sort((a, b) => String(a.data.date || '9').localeCompare(String(b.data.date || '9')))) {
    if (seen.has(p.data.subject)) continue;
    seen.add(p.data.subject); nextProg.push(p);
  }
  const weekNotes = d.notes.filter((n) => n.data.date >= addDays(t, -6));
  const noted = new Set(weekNotes.map((n) => n.data.student));
  const bdayOf = (s) => { const m = String(s.data.birthday || '').match(/(\d{1,2})\D+(\d{1,2})\D*$/) || String(s.data.birthday || '').match(/(\d{1,2})\D+(\d{1,2})/); return m ? [Number(m[1]), Number(m[2])] : null; };
  const [, m, dd] = t.split('-').map(Number);
  const bdays = students.filter((s) => { const b = bdayOf(s); return b && b[0] === m && b[1] === dd; });
  const monthBdays = students.map((s) => [s, bdayOf(s)]).filter(([, b]) => b && b[0] === m).sort((x, y) => x[1][1] - y[1][1]);
  const pointSum = {};
  for (const p of d.points) pointSum[p.data.student] = (pointSum[p.data.student] || 0) + (Number(p.data.points) || 0);
  const pfCount = {};
  for (const p of d.portfolios || []) pfCount[p.data.student] = (pfCount[p.data.student] || 0) + 1;
  const live = (d.activities || []).filter((a) => a.data.open);
  const card = (title, action, ...body) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, title), action), ...body);
  const link = (href, text) => h('a', { class: 'link-btn', href }, text);

  const CARD = {
    att: () => card('🗓 오늘 출결', link('#/desk/class/attendance', '체크 →'),
      !students.length ? h('p', { class: 'muted small' }, '학생 명단을 입력하면 출결을 체크할 수 있습니다.') :
      h('div', { class: 'big-num' }, `${students.length - att.filter((a) => a.data.type === '결석').length}`, h('span', {}, ` / ${students.length}명 출석`)),
      att.length ? h('ul', { class: 'list' }, att.map((a) => h('li', {}, h('i', { class: 'dot', style: { background: ATT_COLOR[a.data.type] } }), ` ${a.data.student} ${a.data.type} ${a.data.reason || ''}`))) : students.length ? h('p', { class: 'muted small' }, '결석·지각·조퇴 없음') : null),
    note: () => card('📒 오늘 알림장', note ? h('button', { class: 'link-btn', onclick: () => copyText([...String(note.data.content).split('\n'), note.data.supplies ? `준비물: ${note.data.supplies}` : ''].filter(Boolean).join('\n')) }, '복사') : null,
      note ? h('div', { class: 'pre clamp', onclick: () => openRecordForm('dailyNotes', note, { onSaved: reload }) }, note.data.content) : h('button', { class: 'btn small primary', onclick: () => openRecordForm('dailyNotes', null, { defaults: { date: t }, onSaved: reload }) }, '+ 오늘 알림장 쓰기'),
      note?.data.supplies ? h('div', { class: 'small' }, '🎒 ', note.data.supplies) : null),
    todo: () => card('✅ 할 일', h('button', { class: 'btn small primary', onclick: () => openRecordForm('todos', null, { defaults: { due: t, repeat: '없음' }, onSaved: reload }) }, '+'),
      todos.length ? h('ul', { class: 'list todo-list' }, todos.map((r) => todoItem(r, reload))) : h('p', { class: 'muted' }, '3일 안에 할 일이 없습니다.')),
    lessons: () => card('🕘 오늘 내 수업', link('#/desk/lesson/overview', '이번 주 →'),
      lessons === null ? h('p', { class: 'muted small' }, '내 시간표를 만들면 오늘 수업이 보입니다. ', h('a', { href: '#/desk/lesson/timetable' }, '만들기 →')) :
      lessons.length ? h('div', { class: 'lesson-strip' }, lessons.map((l) => h('div', { class: `ls ${l.text ? '' : 'empty'}` }, h('span', {}, l.period.replace('교시', '')), h('strong', {}, (l.text || '-').split('\n')[0])))) : h('p', { class: 'muted' }, '오늘은 수업이 없는 날입니다.')),
    briefs: () => (hasSchool() ? card('📣 오늘 전달사항', link('#/notice/briefings', '전체 →'),
      briefs.length ? briefs.map((b) => h('div', { class: 'brief-row' }, b.data.kind ? h('span', { class: 'tag' }, b.data.kind) : null, h('div', { class: 'pre' }, b.data.content))) : h('p', { class: 'muted' }, '오늘 전달사항이 없습니다.')) : null),
    checks: () => card('☑️ 확인할 체크리스트', link('#/desk/class/checklists', '열기 →'),
      checks.length ? h('ul', { class: 'list' }, checks.slice(0, 5).map((c) => h('li', {}, c.data.title, h('span', { class: 'muted small' }, ` ${(c.data.done || []).length}/${students.length}`)))) : h('p', { class: 'muted' }, '진행 중인 체크리스트가 없습니다.')),
    progress: () => card('📘 다음 진도', link('#/desk/lesson/progress', '진도표 →'),
      nextProg.length ? h('ul', { class: 'list' }, nextProg.map((p) => h('li', { class: 'click', onclick: () => openRecordForm('progress', p, { onSaved: reload }) }, h('strong', {}, p.data.subject), ` ${p.data.unit}`))) : h('p', { class: 'muted' }, '진도표가 비어 있습니다.')),
    notes: () => card('🗒 이번 주 누가기록', link('#/desk/record/overview', '열기 →'),
      h('div', { class: 'big-num' }, `${noted.size}`, h('span', {}, ` / ${students.length}명 기록`)),
      students.length ? h('div', { class: 'muted small' }, '아직 없음: ', students.filter((s) => !noted.has(s.data.name)).slice(0, 12).map((s) => s.data.name).join(', ') || '모두 기록함 👏') : null),
    events: () => (hasSchool() ? card('📅 이번 주 학교 일정', link('#/schedule/overview', '달력 →'),
      weekEvents.length ? h('ul', { class: 'list' }, weekEvents.slice(0, 8).map((e) => h('li', {}, h('span', { class: 'muted small' }, `${fmtDate(e.data.date)} `), String(e.data.title).split('\n')[0]))) : h('p', { class: 'muted' }, '7일 안에 학교 일정이 없습니다.')) : null),
    deadlines: () => (hasSchool() ? card('⏰ 기한 임박', link('#/money/deadlines', '기한 안내 →'),
      deadlines.length ? h('ul', { class: 'list' }, deadlines.slice(0, 6).map((x) => { const n = Math.round((new Date(x.data.date) - new Date(t)) / 86400000); return h('li', {}, h('span', { class: `tag ${n <= 3 ? 'warn' : 'ghost'}` }, n === 0 ? '오늘' : `D-${n}`), ` ${x.data.title}`); })) : h('p', { class: 'muted' }, '2주 안에 마감되는 일이 없습니다.')) : null),
    live: () => card('⚡ 진행 중인 활동·퀴즈', link('#/desk/lesson/quiz', '퀴즈 →'),
      live.length ? h('ul', { class: 'list' }, live.map((a) => h('li', {}, h('a', { href: a.data.kind === '실시간 퀴즈' ? `#/desk/lesson/quiz?id=${a.id}` : a.data.kind === '클래스 보드' ? '#/desk/lesson/board' : '#/desk/eval/tools' }, h('span', { class: 'tag ghost' }, a.data.kind), ` ${a.data.title}`)))) : h('p', { class: 'muted' }, '학생 제출을 받는 중인 활동이 없습니다.')),
    points: () => card('⭐ 칭찬 점수 순위', link('#/desk/class/points', '열기 →'),
      Object.keys(pointSum).length ? h('ol', { class: 'list rank' }, Object.entries(pointSum).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => h('li', {}, `${n} `, h('strong', {}, `${v}점`)))) : h('p', { class: 'muted' }, '아직 칭찬 점수가 없습니다.')),
    portfolio: () => card('🗂 포트폴리오 현황', link('#/desk/class/portfolio', '열기 →'),
      h('div', { class: 'big-num' }, `${Object.keys(pfCount).length}`, h('span', {}, ` / ${students.length}명 · ${(d.portfolios || []).length}건`)),
      students.length ? h('div', { class: 'muted small' }, '아직 없음: ', students.filter((s) => !pfCount[s.data.name]).slice(0, 12).map((s) => s.data.name).join(', ') || '모두 있음 👏') : null),
    bdays: () => card(`🎂 ${m}월 생일`, null,
      monthBdays.length ? h('ul', { class: 'list' }, monthBdays.map(([s, b]) => h('li', {}, `${b[1]}일 `, h('strong', {}, s.data.name), b[1] === dd ? ' 🎉 오늘!' : ''))) : h('p', { class: 'muted' }, '이번 달 생일인 학생이 없습니다.')),
    counsel: () => card('💬 최근 상담', link('#/desk/record/counsels', '열기 →'),
      (d.counsels || []).length ? h('ul', { class: 'list' }, [...d.counsels].sort((a, b) => b.data.date.localeCompare(a.data.date)).slice(0, 5).map((c) => h('li', {}, h('span', { class: 'muted small' }, `${fmtDate(c.data.date, false)} `), h('strong', {}, c.data.student), ` ${c.data.topic || c.data.with || ''}`))) : h('p', { class: 'muted' }, '상담 기록이 없습니다.')),
  };

  clear(root,
    h('div', { class: 'hero' },
      h('div', {}, h('div', { class: 'hero-date' }, `${m}월 ${dd}일 ${DOW[dowOf(t)]}요일`), h('div', { class: 'hero-title' }, `${myName() || '선생님'}의 책상`),
        events.length ? h('div', { class: 'hero-sub' }, '📅 ', events.map((e) => String(e.data.title).split('\n')[0]).join(' · ')) : null,
        bdays.length ? h('div', { class: 'hero-sub' }, `🎂 오늘 생일: ${bdays.map((s) => s.data.name).join(', ')}`) : null),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'qa', href: '#/desk/class/attendance' }, h('span', {}, '🗓'), '출결'),
        h('a', { class: 'qa', href: '#/desk/lesson/notes' }, h('span', {}, '📒'), '알림장'),
        h('a', { class: 'qa', href: '#/desk/class/points' }, h('span', {}, '⭐'), '칭찬'),
        h('a', { class: 'qa', href: '#/desk/market/classroom' }, h('span', {}, '🏫'), '내 교실'),
        h('button', { class: 'qa', onclick: async () => { await loadStudents(); openRecordForm('notes', null, { defaults: { date: t, category: '관찰' }, onSaved: reload }); } }, h('span', {}, '🗒'), '누가기록'))),
    h('div', { class: 'toolbar slim' }, h('span', { class: 'muted small' }, `카드 ${on.length}개`), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => homeSettings(on, reload) }, '⚙ 내 책상 꾸미기')),
    on.length ? h('div', { class: 'dash' }, on.map((id) => CARD[id]?.()).filter(Boolean)) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🪴'), h('p', {}, '[⚙ 내 책상 꾸미기]에서 보고 싶은 카드를 골라 주세요.')),
    h('p', { class: 'hint' }, '🔒 Deskterior 기록은 본인만 볼 수 있고, 학생 연락처·건강·특이사항·누가기록·상담·특기사항은 암호화해 저장합니다. 학생 개인정보는 꼭 필요한 만큼만 적어 주세요.'));
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

async function counselsView(root) {
  await loadStudents();
  const who = remember('cs_student') || '';
  const reload = () => counselsView(root);
  const rows = (await api(`/api/records/counsels?year=${state.year}`)).filter((r) => !who || r.data.student === who).sort((a, b) => b.data.date.localeCompare(a.data.date));
  clear(root,
    h('div', { class: 'toolbar' },
      h('select', { onchange: (e) => { remember('cs_student', e.target.value); reload(); } }, h('option', { value: '' }, '전체 학생'), state.students.map((s) => h('option', { value: s, selected: s === who }, s))),
      h('span', { class: 'muted' }, `${rows.length}건`), h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('counsels', null, { defaults: { date: today(), student: who, with: '학생', method: '대면' }, onSaved: reload }) }, '+ 상담 기록')),
    rows.length ? h('ul', { class: 'timeline' }, rows.map((n) => h('li', { class: 'click', onclick: () => openRecordForm('counsels', n, { onSaved: reload }) },
      h('div', { class: 'tl-head' }, h('strong', {}, n.data.student), h('span', { class: 'tag ghost' }, `${n.data.with || ''} · ${n.data.method || ''}`), n.data.topic ? h('span', { class: 'tag' }, n.data.topic) : null, h('span', { class: 'muted small' }, fmtDate(n.data.date))),
      h('div', { class: 'pre' }, n.data.content), n.data.followup ? h('div', { class: 'muted small' }, `↳ 후속: ${n.data.followup}`) : null))) :
      h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '💬'), h('p', {}, '학생·보호자 상담 내용을 기록합니다. 내용은 암호화되어 본인만 봅니다.')));
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

export const DESK_VIEWS = {
  'home/': deskHome,
  'class/overview': studentCards,
  'class/attendance': (el) => attendanceView(el),
  'class/checklists': (el) => checklistsView(el),
  'class/points': pointsView,
  'class/students': studentsView,
  'class/seats': (el) => seatsView(el),
  'class/roles': rolesView,
  'class/portfolio': portfolioView,
  'class/career': careerView,
  'class/tools': toolsView,
  'lesson/overview': (el) => weekBoard(el),
  'lesson/notes': dailyNotesView,
  'lesson/weekly': (el) => weeklyView(el),
  'lesson/board': boardView,
  'lesson/quiz': quizView,
  'lesson/worksheets': worksheetsView,
  'lesson/timetable': myTimetableView,
  'lesson/progress': progressView,
  'eval/overview': (el) => evalView(el),
  'eval/tools': evalToolsView,
  'eval/plan': planDocView,
  'eval/standards': standardsView,
  'eval/students': studentEvalView,
  'eval/remarks': remarksView,
  'record/overview': notesView,
  'record/counsels': counselsView,
  'record/todos': todosView,
  'market/overview': workshopHome,
  'market/mine': myTools,
  'market/classroom': classroomView,
  'market/run': toolRunner,
};
