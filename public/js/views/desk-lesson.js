// 📘 Deskterior · 수업: 이번 주 · 알림장 · 주간학습안내 · 내 시간표 · 진도·시수
import { h, api, clear, toast, modal, fmtDate, addDays, today, DOW } from '../ui.js';
import { state, remember, hasSchool } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { gridEditor, DEFAULT_GRID, sortTimetables } from './timetable.js';
import { mondayOf, dayLabel, lessonsOn, ATT_COLOR, copyText, dowOf } from './desk-common.js';

// ---------- 이번 주 (학급다이어리 '이번주'처럼 한 주를 한 화면에) ----------

export async function weekBoard(root, start) {
  const mon = start || mondayOf(today());
  const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  const [d, school] = await Promise.all([
    api(`/api/bundle?year=${state.year}&modules=myTimetable,progress,dailyNotes,attendance,todos,checklists`),
    hasSchool() ? api(`/api/bundle?year=${state.year}&modules=events,briefings`).catch(() => ({ events: [], briefings: [] })) : Promise.resolve({ events: [], briefings: [] }),
  ]);
  const reload = () => weekBoard(root, mon);
  const t = today();
  const col = (day) => {
    const lessons = lessonsOn(d.myTimetable, day) || [];
    const prog = d.progress.filter((p) => p.data.date === day);
    const note = d.dailyNotes.find((n) => n.data.date === day);
    const att = d.attendance.filter((a) => a.data.date === day);
    const todos = d.todos.filter((x) => x.data.due === day && !x.data.done);
    const ev = school.events.filter((e) => e.data.date <= day && (e.data.endDate || e.data.date) >= day);
    const br = school.briefings.filter((b) => b.data.date === day);
    return h('div', { class: `week-col ${day === t ? 'today' : ''}` },
      h('div', { class: 'week-head' }, dayLabel(day), day === t ? h('span', { class: 'tag' }, '오늘') : null),
      ev.length ? h('div', { class: 'wk-sec' }, ev.map((e) => h('div', { class: 'wk-ev' }, `📅 ${String(e.data.title).split('\n')[0]}`))) : null,
      lessons.some((l) => l.text) ? h('div', { class: 'wk-sec' }, h('div', { class: 'wk-label' }, '수업'), lessons.filter((l) => l.text).map((l) => h('div', { class: 'wk-line' }, h('span', { class: 'muted' }, `${l.period.replace('교시', '')} `), l.text.split('\n')[0]))) : null,
      prog.length ? h('div', { class: 'wk-sec' }, h('div', { class: 'wk-label' }, '진도'), prog.map((p) => h('div', { class: `wk-line click ${p.data.done ? 'done' : ''}`, onclick: () => openRecordForm('progress', p, { onSaved: reload }) }, `${p.data.subject} ${p.data.unit}`))) : null,
      att.length ? h('div', { class: 'wk-sec' }, h('div', { class: 'wk-label' }, '출결'), att.map((a) => h('div', { class: 'wk-line' }, h('i', { class: 'dot', style: { background: ATT_COLOR[a.data.type] } }), ` ${a.data.student} ${a.data.type}`))) : null,
      todos.length ? h('div', { class: 'wk-sec' }, h('div', { class: 'wk-label' }, '할 일'), todos.map((x) => h('div', { class: 'wk-line' }, `☐ ${x.data.title}`))) : null,
      br.length ? h('div', { class: 'wk-sec' }, h('div', { class: 'wk-label' }, '전달사항'), br.map((b) => h('div', { class: 'wk-line clamp' }, b.data.content))) : null,
      h('div', { class: 'wk-sec' }, h('div', { class: 'wk-label' }, '알림장'),
        note ? h('div', { class: 'wk-line click pre clamp', onclick: () => openRecordForm('dailyNotes', note, { onSaved: reload }) }, note.data.content)
          : h('button', { class: 'link-btn', onclick: () => openRecordForm('dailyNotes', null, { defaults: { date: day }, onSaved: reload }) }, '+ 쓰기')),
      h('button', { class: 'link-btn add-prog', onclick: () => openRecordForm('progress', null, { defaults: { date: day }, onSaved: reload }) }, '+ 진도'));
  };
  const openChecks = d.checklists.filter((c) => c.data.due && c.data.due >= mon && c.data.due <= addDays(mon, 6));
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => weekBoard(root, addDays(mon, -7)) }, '◀'),
      h('strong', {}, `${fmtDate(days[0])} ~ ${fmtDate(days[4])}`),
      h('button', { class: 'btn', onclick: () => weekBoard(root, addDays(mon, 7)) }, '▶'),
      h('button', { class: 'btn', onclick: () => weekBoard(root) }, '이번 주'),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn', href: '#/desk/lesson/weekly' }, '🗒 주간학습안내')),
    openChecks.length ? h('div', { class: 'alert' }, '☑️ 이번 주 기한: ', openChecks.map((c) => `${c.data.title}(${fmtDate(c.data.due, false)})`).join(', ')) : null,
    h('div', { class: 'week-board' }, days.map(col)),
    h('p', { class: 'hint' }, '내 시간표 · 진도 · 출결 · 할 일 · 알림장' + (hasSchool() ? ' · 학교 일정 · 전달사항' : '') + '을 한 주에 모아 봅니다.'));
}

// ---------- 알림장 ----------

const numbered = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => (/^\d+[.)]/.test(l) ? l : `${i + 1}. ${l}`));

function noteText(n) {
  return [`📒 ${dayLabel(n.data.date)} 알림장`, ...numbered(n.data.content), n.data.supplies ? `준비물: ${n.data.supplies}` : '', n.data.homework ? `숙제: ${n.data.homework}` : ''].filter(Boolean).join('\n');
}

export async function dailyNotesView(root) {
  const rows = (await api(`/api/records/dailyNotes?year=${state.year}`)).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const reload = () => dailyNotesView(root);
  const t = today();
  const latest = rows[0];
  const big = (n) => modal(`📒 ${dayLabel(n.data.date)} 알림장`, h('div', { class: 'note-big' },
    h('ol', {}, numbered(n.data.content).map((l) => h('li', {}, l.replace(/^\d+[.)]\s*/, '')))),
    n.data.supplies ? h('p', {}, h('strong', {}, '준비물 '), n.data.supplies) : null,
    n.data.homework ? h('p', {}, h('strong', {}, '숙제 '), n.data.homework) : null), [], { wide: true });
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      latest ? h('button', { class: 'btn', onclick: () => openRecordForm('dailyNotes', null, { defaults: { ...latest.data, date: t }, onSaved: reload }) }, '최근 내용으로 새로 쓰기') : null,
      h('button', { class: 'btn primary', onclick: () => openRecordForm('dailyNotes', null, { defaults: { date: t }, onSaved: reload }) }, '+ 알림장')),
    rows.length ? h('div', { class: 'cards' }, rows.slice(0, 30).map((n) => h('div', { class: `card note-card ${n.data.date === t ? 'mine' : ''}` },
      h('div', { class: 'card-head' }, h('strong', {}, dayLabel(n.data.date)),
        h('div', { class: 'row-actions' },
          h('button', { class: 'link-btn', onclick: () => big(n) }, '크게'),
          h('button', { class: 'link-btn', onclick: () => copyText(noteText(n)) }, '복사'),
          h('button', { class: 'link-btn', onclick: () => openRecordForm('dailyNotes', n, { onSaved: reload }) }, '수정'))),
      h('ol', { class: 'note-lines' }, numbered(n.data.content).map((l) => h('li', {}, l.replace(/^\d+[.)]\s*/, '')))),
      n.data.supplies ? h('div', { class: 'small' }, '🎒 ', n.data.supplies) : null,
      n.data.homework ? h('div', { class: 'small' }, '📚 ', n.data.homework) : null))) :
      h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '📒'), h('p', {}, '오늘 알림장을 써 보세요. [복사]로 학급 SNS(하이클래스·클래스팅 등)에 붙여넣을 수 있습니다.')),
    h('p', { class: 'hint' }, '[크게]는 교실 화면에 띄우기용, [복사]는 학부모 안내 메시지용 텍스트입니다.'));
}

// ---------- 주간학습안내 ----------

export async function weeklyView(root, start) {
  const mon = start || remember('wk_start') || mondayOf(addDays(today(), dowOf(today()) >= 5 ? 3 : 0));
  const [plans, tts] = await Promise.all([api(`/api/records/weeklyPlans?year=${state.year}`), api(`/api/records/myTimetable?year=${state.year}`)]);
  const rec = plans.find((p) => p.data.date === mon);
  const reload = (m = mon) => { remember('wk_start', m); weeklyView(root, m); };
  const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  const tt = tts[0]?.data.grid || DEFAULT_GRID();
  const periods = Math.max(6, tt.periods.length);
  const plan = rec?.data.plan ? JSON.parse(JSON.stringify(rec.data.plan)) : { cells: Array.from({ length: periods }, () => Array(5).fill('')) };
  while (plan.cells.length < periods) plan.cells.push(Array(5).fill(''));
  const info = { title: rec?.data.title || '', notice: rec?.data.notice || '' };
  const fillSubjects = () => {
    days.forEach((d, di) => {
      const ci = tt.days.indexOf(DOW[dowOf(d)]);
      for (let pi = 0; pi < periods; pi++) {
        const subj = ci >= 0 ? String(tt.cells[pi]?.[ci] || '').split('\n')[0] : '';
        if (subj && !plan.cells[pi][di]) plan.cells[pi][di] = `${subj}\n`;
      }
    });
    draw();
  };
  const save = async () => {
    const data = { date: mon, title: info.title, notice: info.notice, plan };
    try {
      if (rec) await api(`/api/records/weeklyPlans/${rec.id}`, { method: 'PUT', body: { data, version: rec.version } });
      else await api('/api/records/weeklyPlans', { method: 'POST', body: { data } });
      toast('저장했습니다.'); reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>');
    w.document.write(`<title>주간학습안내</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:6px;font-size:13px;vertical-align:top}th{background:#eef}h1{font-size:20px}</style>
<h1>주간학습안내 (${fmtDate(days[0])} ~ ${fmtDate(days[4])})</h1>${info.title ? `<p><b>이번 주 주제</b> ${esc(info.title)}</p>` : ''}
<table><tr><th>교시</th>${days.map((d) => `<th>${dayLabel(d)}</th>`).join('')}</tr>${plan.cells.map((row, pi) => `<tr><th>${pi + 1}</th>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
${info.notice ? `<h3>가정 안내</h3><p>${esc(info.notice)}</p>` : ''}`);
    w.document.close(); w.print();
  };
  const grid = h('div', {});
  const draw = () => clear(grid, h('div', { class: 'table-wrap' }, h('table', { class: 'tt weekly' },
    h('thead', {}, h('tr', {}, h('th', {}, '교시'), days.map((d) => h('th', { class: d === today() ? 'today' : '' }, dayLabel(d))))),
    h('tbody', {}, plan.cells.map((row, pi) => h('tr', {}, h('th', {}, pi + 1), row.map((c, di) => h('td', {}, h('textarea', { rows: 2, value: c, placeholder: '과목\n학습 내용', oninput: (e) => { plan.cells[pi][di] = e.target.value; } })))))))));
  draw();
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => reload(addDays(mon, -7)) }, '◀'),
      h('strong', {}, `${fmtDate(days[0])} ~ ${fmtDate(days[4])}`),
      h('button', { class: 'btn', onclick: () => reload(addDays(mon, 7)) }, '▶'),
      rec ? h('span', { class: 'tag' }, '저장됨') : h('span', { class: 'tag ghost' }, '새 주'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: fillSubjects, disabled: !tts.length, title: tts.length ? '' : '내 시간표가 있어야 합니다' }, '내 시간표로 과목 채우기'),
      h('button', { class: 'btn', onclick: print }, '인쇄'),
      h('button', { class: 'btn primary', onclick: save }, '저장')),
    h('div', { class: 'form' }, h('div', { class: 'row' }, h('label', {}, '이번 주 주제'), h('input', { value: info.title, oninput: (e) => { info.title = e.target.value; } }))),
    grid,
    h('div', { class: 'form' }, h('div', { class: 'row' }, h('label', {}, '가정 안내'), h('textarea', { rows: 3, value: info.notice, oninput: (e) => { info.notice = e.target.value; } }))),
    h('p', { class: 'hint' }, '칸 첫 줄에 과목, 다음 줄에 학습 내용을 적습니다. [인쇄]로 가정 배부용 표를 만들 수 있습니다.'));
}

// ---------- 내 시간표 ----------

export async function myTimetableView(root) {
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
    })) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🗓'), h('p', {}, '내 시간표를 만들면 내 책상·이번 주·주간학습안내에 과목이 자동으로 들어갑니다.')));
}

// ---------- 진도 · 시수 ----------

export async function progressView(root) {
  const rows = await api(`/api/records/progress?year=${state.year}`);
  const bySubj = new Map();
  for (const r of rows) { const k = r.data.subject || '기타'; if (!bySubj.has(k)) bySubj.set(k, { all: 0, done: 0 }); const o = bySubj.get(k); o.all++; if (r.data.done) o.done++; }
  const box = h('div', {});
  const reload = () => progressView(root);
  clear(root,
    bySubj.size ? h('div', { class: 'kpi-grid' }, [...bySubj].map(([k, o]) => h('div', { class: 'kpi' },
      h('div', { class: 'kpi-label' }, k), h('div', { class: 'kpi-value' }, `${o.done}`, h('span', { class: 'muted small' }, ` / ${o.all}차시`)),
      h('div', { class: 'progress-bar' }, h('span', { style: { width: `${(o.done / o.all) * 100}%` } }))))) : null,
    box);
  await tableView(box, 'progress', { groupBy: 'subject', defaults: { date: today() }, reload });
}
