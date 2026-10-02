// 🪴 Deskterior: 선생님 개인 공간 (본인만 봄) — 내 책상 · 학급 · 수업 · 평가 · 기록 · 마켓
//   벤치마킹: tdesk(메뉴 구성), 학급다이어리2(출결·체크리스트·이번 주), Classendo(즉석 평가·특기사항)
import { h, api, clear, toast, fmtDate, addDays, today, DOW } from '../ui.js';
import { state, remember, hasSchool, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { seg } from './schedule.js';
import { loadStudents, sortStudents, todoItem, lessonsOn, dowOf, ATT_COLOR, monthOf, copyText } from './desk-common.js';
import { studentCards, attendanceView, checklistsView, pointsView, studentsView, seatsView, rolesView, toolsView } from './desk-class.js';
import { weekBoard, dailyNotesView, weeklyView, myTimetableView, progressView } from './desk-lesson.js';
import { evalView, studentEvalView, remarksView } from './desk-eval.js';
import { workshopHome, myTools, toolRunner } from './workshop.js';

// ---------- 내 책상 (홈) ----------

async function deskHome(root) {
  const t = today();
  const [d, school] = await Promise.all([
    api(`/api/bundle?year=${state.year}&modules=students,todos,myTimetable,progress,notes,attendance,dailyNotes,checklists,points`),
    hasSchool() ? api(`/api/bundle?year=${state.year}&modules=briefings,events`).catch(() => ({ briefings: [], events: [] })) : Promise.resolve({ briefings: [], events: [] }),
  ]);
  const reload = () => deskHome(root);
  const students = sortStudents(d.students);
  const todos = d.todos.filter((r) => !r.data.done && (!r.data.due || r.data.due <= addDays(t, 3))).sort((a, b) => String(a.data.due || '9').localeCompare(String(b.data.due || '9')));
  const lessons = lessonsOn(d.myTimetable);
  const att = d.attendance.filter((a) => a.data.date === t);
  const note = d.dailyNotes.find((n) => n.data.date === t);
  const briefs = school.briefings.filter((b) => b.data.date === t);
  const events = school.events.filter((e) => e.data.date <= t && (e.data.endDate || e.data.date) >= t);
  const checks = d.checklists.filter((c) => (c.data.done || []).length < students.length && (!c.data.due || c.data.due >= addDays(t, -7)));
  const nextProg = [];
  const seen = new Set();
  for (const p of d.progress.filter((x) => !x.data.done).sort((a, b) => String(a.data.date || '9').localeCompare(String(b.data.date || '9')))) {
    if (seen.has(p.data.subject)) continue;
    seen.add(p.data.subject); nextProg.push(p);
  }
  const weekNotes = d.notes.filter((n) => n.data.date >= addDays(t, -6));
  const noted = new Set(weekNotes.map((n) => n.data.student));
  const bdays = students.filter((s) => { const m = String(s.data.birthday || '').match(/(\d{1,2})\D+(\d{1,2})/); return m && Number(m[1]) === Number(t.slice(5, 7)) && Number(m[2]) === Number(t.slice(8)); });
  const [, m, dd] = t.split('-').map(Number);
  const card = (title, action, ...body) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', {}, title), action), ...body);

  clear(root,
    h('div', { class: 'hero' },
      h('div', {}, h('div', { class: 'hero-date' }, `${m}월 ${dd}일 ${DOW[dowOf(t)]}요일`), h('div', { class: 'hero-title' }, `${myName() || '선생님'}의 책상`),
        events.length ? h('div', { class: 'hero-sub' }, '📅 ', events.map((e) => String(e.data.title).split('\n')[0]).join(' · ')) : null,
        bdays.length ? h('div', { class: 'hero-sub' }, `🎂 오늘 생일: ${bdays.map((s) => s.data.name).join(', ')}`) : null),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'qa', href: '#/desk/class/attendance' }, h('span', {}, '🗓'), '출결'),
        h('a', { class: 'qa', href: '#/desk/lesson/notes' }, h('span', {}, '📒'), '알림장'),
        h('a', { class: 'qa', href: '#/desk/class/points' }, h('span', {}, '⭐'), '칭찬'),
        h('a', { class: 'qa', href: '#/desk/class/tools' }, h('span', {}, '🎲'), '뽑기'),
        h('button', { class: 'qa', onclick: async () => { await loadStudents(); openRecordForm('notes', null, { defaults: { date: t, category: '관찰' }, onSaved: reload }); } }, h('span', {}, '🗒'), '누가기록'))),
    h('div', { class: 'dash' },
      card('🗓 오늘 출결', h('a', { class: 'link-btn', href: '#/desk/class/attendance' }, '체크 →'),
        !students.length ? h('p', { class: 'muted small' }, '학생 명단을 입력하면 출결을 체크할 수 있습니다.') :
        h('div', { class: 'big-num' }, `${students.length - att.filter((a) => a.data.type === '결석').length}`, h('span', {}, ` / ${students.length}명 출석`)),
        att.length ? h('ul', { class: 'list' }, att.map((a) => h('li', {}, h('i', { class: 'dot', style: { background: ATT_COLOR[a.data.type] } }), ` ${a.data.student} ${a.data.type} ${a.data.reason || ''}`))) : students.length ? h('p', { class: 'muted small' }, '결석·지각·조퇴 없음') : null),
      card('📒 오늘 알림장', note ? h('button', { class: 'link-btn', onclick: () => copyText([...String(note.data.content).split('\n'), note.data.supplies ? `준비물: ${note.data.supplies}` : ''].filter(Boolean).join('\n')) }, '복사') : null,
        note ? h('div', { class: 'pre clamp', onclick: () => openRecordForm('dailyNotes', note, { onSaved: reload }) }, note.data.content) : h('button', { class: 'btn small primary', onclick: () => openRecordForm('dailyNotes', null, { defaults: { date: t }, onSaved: reload }) }, '+ 오늘 알림장 쓰기'),
        note?.data.supplies ? h('div', { class: 'small' }, '🎒 ', note.data.supplies) : null),
      card('✅ 할 일', h('button', { class: 'btn small primary', onclick: () => openRecordForm('todos', null, { defaults: { due: t, repeat: '없음' }, onSaved: reload }) }, '+'),
        todos.length ? h('ul', { class: 'list todo-list' }, todos.map((r) => todoItem(r, reload))) : h('p', { class: 'muted' }, '3일 안에 할 일이 없습니다.')),
      card('🕘 오늘 내 수업', h('a', { class: 'link-btn', href: '#/desk/lesson/overview' }, '이번 주 →'),
        lessons === null ? h('p', { class: 'muted small' }, '내 시간표를 만들면 오늘 수업이 보입니다. ', h('a', { href: '#/desk/lesson/timetable' }, '만들기 →')) :
        lessons.length ? h('div', { class: 'lesson-strip' }, lessons.map((l) => h('div', { class: `ls ${l.text ? '' : 'empty'}` }, h('span', {}, l.period.replace('교시', '')), h('strong', {}, (l.text || '-').split('\n')[0])))) : h('p', { class: 'muted' }, '오늘은 수업이 없는 날입니다.')),
      hasSchool() ? card('📣 오늘 전달사항', h('a', { class: 'link-btn', href: '#/notice/briefings' }, '전체 →'),
        briefs.length ? briefs.map((b) => h('div', { class: 'brief-row' }, b.data.kind ? h('span', { class: 'tag' }, b.data.kind) : null, h('div', { class: 'pre' }, b.data.content))) : h('p', { class: 'muted' }, '오늘 전달사항이 없습니다.')) : null,
      card('☑️ 확인할 체크리스트', h('a', { class: 'link-btn', href: '#/desk/class/checklists' }, '열기 →'),
        checks.length ? h('ul', { class: 'list' }, checks.slice(0, 5).map((c) => h('li', {}, c.data.title, h('span', { class: 'muted small' }, ` ${(c.data.done || []).length}/${students.length}`)))) : h('p', { class: 'muted' }, '진행 중인 체크리스트가 없습니다.')),
      card('📘 다음 진도', h('a', { class: 'link-btn', href: '#/desk/lesson/progress' }, '진도표 →'),
        nextProg.length ? h('ul', { class: 'list' }, nextProg.map((p) => h('li', { class: 'click', onclick: () => openRecordForm('progress', p, { onSaved: reload }) }, h('strong', {}, p.data.subject), ` ${p.data.unit}`))) : h('p', { class: 'muted' }, '진도표가 비어 있습니다.')),
      card('🗒 이번 주 누가기록', h('a', { class: 'link-btn', href: '#/desk/record/overview' }, '열기 →'),
        h('div', { class: 'big-num' }, `${noted.size}`, h('span', {}, ` / ${students.length}명 기록`)),
        students.length ? h('div', { class: 'muted small' }, '아직 없음: ', students.filter((s) => !noted.has(s.data.name)).slice(0, 12).map((s) => s.data.name).join(', ') || '모두 기록함 👏') : null)),
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
  'class/tools': toolsView,
  'lesson/overview': (el) => weekBoard(el),
  'lesson/notes': dailyNotesView,
  'lesson/weekly': (el) => weeklyView(el),
  'lesson/timetable': myTimetableView,
  'lesson/progress': progressView,
  'eval/overview': (el) => evalView(el),
  'eval/students': studentEvalView,
  'eval/remarks': remarksView,
  'record/overview': notesView,
  'record/counsels': counselsView,
  'record/todos': todosView,
  'market/overview': workshopHome,
  'market/mine': myTools,
  'market/run': toolRunner,
};
