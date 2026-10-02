// 🧒 Deskterior · 학급: 학생 카드 · 출결 · 체크리스트 · 칭찬 점수 · 명단 · 자리 · 1인 1역 · 뽑기
import { h, api, clear, toast, modal, fmtDate, addDays, today, confirmBox, download } from '../ui.js';
import { state, remember } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { seg } from './schedule.js';
import { loadStudents, sortStudents, shuffle, dayLabel, monthOf, ATT_TYPES, ATT_COLOR, groupBy, emptyStudents, copyText, dowOf } from './desk-common.js';

// ---------- 학생 카드 ----------

export async function studentCards(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=students,attendance,notes,counsels,points,evalPlans,checklists`);
  const students = sortStudents(d.students);
  const reload = () => studentCards(root);
  if (!students.length) return clear(root, emptyStudents());
  const t = today();
  const ym = monthOf(t);
  const att = groupBy(d.attendance, 'student');
  const notes = groupBy(d.notes, 'student');
  const pts = groupBy(d.points, 'student');
  const bdaySoon = (b) => {
    if (!b) return false;
    const m = String(b).match(/(\d{1,2})\D+(\d{1,2})/);
    if (!m) return false;
    for (let i = 0; i < 7; i++) { const x = addDays(t, i); if (Number(x.slice(5, 7)) === Number(m[1]) && Number(x.slice(8)) === Number(m[2])) return true; }
    return false;
  };
  const q = remember('sc_q') || '';
  const shown = students.filter((s) => !q || s.data.name.includes(q));
  clear(root,
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: '이름 검색', value: q, oninput: (e) => { remember('sc_q', e.target.value); clearTimeout(root._t); root._t = setTimeout(reload, 300); } }),
      h('span', { class: 'muted' }, `${students.length}명 · 남 ${students.filter((s) => s.data.gender === '남').length} · 여 ${students.filter((s) => s.data.gender === '여').length}`),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn', href: '#/desk/class/students' }, '명단 관리')),
    h('div', { class: 'student-grid' }, shown.map((s) => {
      const name = s.data.name;
      const monthAtt = (att.get(name) || []).filter((a) => monthOf(a.data.date) === ym);
      const total = (pts.get(name) || []).reduce((a, p) => a + (Number(p.data.points) || 0), 0);
      const lastNote = (notes.get(name) || []).map((n) => n.data.date).sort().at(-1);
      return h('button', { class: 'student-card', onclick: () => studentProfile(s, d, reload) },
        h('div', { class: 'sc-top' },
          h('span', { class: `avatar ${s.data.gender === '여' ? 'f' : s.data.gender === '남' ? 'm' : ''}` }, s.data.num ?? ''),
          h('span', { class: 'sc-name' }, name),
          bdaySoon(s.data.birthday) ? h('span', { title: '이번 주 생일' }, '🎂') : null,
          s.data.health ? h('span', { class: 'sc-alert', title: s.data.health }, '⚠') : null),
        h('div', { class: 'sc-stats' },
          h('span', { title: '이번 달 출결' }, monthAtt.length ? monthAtt.map((a) => h('i', { class: 'dot', style: { background: ATT_COLOR[a.data.type] } })) : h('span', { class: 'muted' }, '출결 이상 없음')),
          h('span', { title: '칭찬 점수' }, `⭐ ${total}`)),
        h('div', { class: 'muted small' }, lastNote ? `최근 기록 ${fmtDate(lastNote, false)}` : '기록 없음'));
    })),
    h('p', { class: 'hint' }, `카드를 누르면 그 학생의 출결·누가기록·상담·평가·칭찬을 한곳에서 봅니다. 🎂 이번 주 생일 · ⚠ 알레르기·건강 정보`));
}

function studentProfile(s, d, reload) {
  const name = s.data.name;
  const mine = (rows) => rows.filter((r) => r.data.student === name).sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || '')));
  const after = () => { close(); reload(); };
  const add = (mod, defaults) => openRecordForm(mod, null, { defaults: { date: today(), student: name, ...defaults }, onSaved: after });
  const att = mine(d.attendance);
  const notes = mine(d.notes);
  const counsels = mine(d.counsels);
  const pts = mine(d.points);
  const evals = d.evalPlans.filter((p) => p.data.scores?.[name]?.level);
  const checks = d.checklists.filter((c) => !(c.data.done || []).includes(name));
  const section = (title, btn, body) => h('section', { class: 'prof-sec' }, h('div', { class: 'card-head' }, h('h4', {}, title), btn), body);
  const close = modal(`🧒 ${s.data.num ? `${s.data.num}번 ` : ''}${name}`, h('div', { class: 'profile' },
    h('div', { class: 'prof-info' },
      [['성별', s.data.gender], ['생일', s.data.birthday], ['보호자', s.data.guardian], ['알레르기·건강', s.data.health], ['방과후·돌봄', s.data.afterschool], ['특이사항', s.data.note]]
        .filter(([, v]) => v).map(([k, v]) => h('div', {}, h('span', { class: 'muted small' }, k), h('div', { class: 'pre' }, v))),
      h('button', { class: 'btn small', onclick: () => openRecordForm('students', s, { onSaved: after }) }, '정보 수정')),
    h('div', { class: 'prof-cols' },
      section(`🗓 출결 ${att.length}`, h('button', { class: 'link-btn', onclick: () => add('attendance', { type: '결석', reason: '질병' }) }, '+ 출결'),
        att.length ? h('ul', { class: 'list' }, att.slice(0, 12).map((a) => h('li', {}, h('span', { class: 'tag', style: { '--c': ATT_COLOR[a.data.type] } }, a.data.type), ` ${fmtDate(a.data.date)} ${a.data.reason || ''} ${a.data.doc ? '📎' : ''}`))) : h('p', { class: 'muted small' }, '없음')),
      section(`⭐ 칭찬 ${pts.reduce((a, p) => a + (Number(p.data.points) || 0), 0)}점`, h('button', { class: 'link-btn', onclick: () => add('points', { points: 1 }) }, '+ 칭찬'),
        pts.length ? h('ul', { class: 'list' }, pts.slice(0, 8).map((p) => h('li', {}, `${fmtDate(p.data.date, false)} ${p.data.points > 0 ? '+' : ''}${p.data.points} ${p.data.reason || ''}`))) : h('p', { class: 'muted small' }, '없음')),
      section(`📝 평가 ${evals.length}`, null,
        evals.length ? h('ul', { class: 'list' }, evals.map((p) => h('li', {}, h('strong', {}, `${p.data.subject} ${p.data.area || ''}`), ` ${p.data.scores[name].level}`, p.data.scores[name].note ? h('div', { class: 'muted small' }, p.data.scores[name].note) : null))) : h('p', { class: 'muted small' }, '없음')),
      section(`☑️ 미완료 체크 ${checks.length}`, null,
        checks.length ? h('ul', { class: 'list' }, checks.map((c) => h('li', {}, c.data.title, c.data.due ? h('span', { class: 'muted small' }, ` ~${fmtDate(c.data.due, false)}`) : null))) : h('p', { class: 'muted small' }, '모두 완료'))),
    section(`🗒 누가기록 ${notes.length}`, h('button', { class: 'link-btn', onclick: () => add('notes', { category: '관찰' }) }, '+ 기록'),
      notes.length ? h('ul', { class: 'timeline' }, notes.slice(0, 20).map((n) => h('li', {}, h('div', { class: 'tl-head' }, n.data.category ? h('span', { class: 'tag ghost' }, n.data.category) : null, h('span', { class: 'muted small' }, fmtDate(n.data.date))), h('div', { class: 'pre' }, n.data.content)))) : h('p', { class: 'muted small' }, '없음')),
    section(`💬 상담 ${counsels.length}`, h('button', { class: 'link-btn', onclick: () => add('counsels', { with: '학생', method: '대면' }) }, '+ 상담'),
      counsels.length ? h('ul', { class: 'timeline' }, counsels.map((n) => h('li', {}, h('div', { class: 'tl-head' }, h('span', { class: 'tag ghost' }, `${n.data.with || ''} · ${n.data.method || ''}`), n.data.topic ? h('span', { class: 'tag' }, n.data.topic) : null, h('span', { class: 'muted small' }, fmtDate(n.data.date))), h('div', { class: 'pre' }, n.data.content), n.data.followup ? h('div', { class: 'muted small' }, `후속: ${n.data.followup}`) : null))) : h('p', { class: 'muted small' }, '없음'))), [], { wide: true });
}

// ---------- 출결 ----------

export async function attendanceView(root, day) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const mode = remember('att_mode') || 'day';
  let d = day || remember('att_day') || today();
  const rows = await api(`/api/records/attendance?year=${state.year}`);
  const reload = (x) => attendanceView(root, x ?? d);
  const head = h('div', { class: 'toolbar' },
    seg([['day', '날짜별 체크'], ['month', '월별 통계']], mode, (v) => { remember('att_mode', v); reload(); }));
  if (mode === 'month') return clear(root, head, attendanceMonth(students, rows, d, reload));

  const go = (n) => { let x = addDays(d, n); while ([0, 6].includes(dowOf(x))) x = addDays(x, n > 0 ? 1 : -1); remember('att_day', x); reload(x); };
  const todayRows = rows.filter((r) => r.data.date === d);
  const set = async (s, type, rec) => {
    try {
      if (type === '출석') { if (rec) await api(`/api/records/attendance/${rec.id}`, { method: 'DELETE' }); }
      else if (rec) await api(`/api/records/attendance/${rec.id}`, { method: 'PUT', body: { data: { ...rec.data, type }, version: rec.version } });
      else await api('/api/records/attendance', { method: 'POST', body: { data: { date: d, student: s, type, reason: '질병' } } });
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const upd = async (rec, patch) => { try { await api(`/api/records/attendance/${rec.id}`, { method: 'PUT', body: { data: { ...rec.data, ...patch }, version: rec.version } }); reload(); } catch (e) { toast(e.message, 'error'); } };
  const counts = Object.fromEntries(ATT_TYPES.map((t) => [t, todayRows.filter((r) => r.data.type === t).length]));
  clear(root, head,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => go(-1), 'aria-label': '이전 날' }, '◀'),
      h('input', { type: 'date', value: d, onchange: (e) => { remember('att_day', e.target.value); reload(e.target.value); } }),
      h('button', { class: 'btn', onclick: () => go(1), 'aria-label': '다음 날' }, '▶'),
      h('button', { class: 'btn', onclick: () => { remember('att_day', today()); reload(today()); } }, '오늘'),
      h('span', { class: 'grow' }),
      h('span', { class: 'kpi-inline' }, `출석 ${students.length - todayRows.filter((r) => r.data.type === '결석').length}/${students.length}`),
      ATT_TYPES.map((t) => counts[t] ? h('span', { class: 'tag', style: { '--c': ATT_COLOR[t] } }, `${t} ${counts[t]}`) : null)),
    h('div', { class: 'att-list' }, students.map((s) => {
      const name = s.data.name;
      const rec = todayRows.find((r) => r.data.student === name);
      const cur = rec?.data.type || '출석';
      return h('div', { class: `att-row ${rec ? 'has' : ''}` },
        h('span', { class: 'att-name' }, h('span', { class: 'muted small' }, `${s.data.num ?? ''} `), name),
        h('div', { class: 'att-seg' }, ['출석', ...ATT_TYPES].map((t) => h('button', {
          class: cur === t ? 'on' : '', style: { '--c': ATT_COLOR[t] || 'var(--ok)' }, onclick: () => cur !== t && set(name, t, rec),
        }, t))),
        rec ? h('div', { class: 'att-extra' },
          h('select', { onchange: (e) => upd(rec, { reason: e.target.value }) }, ['질병', '미인정', '출석인정', '기타'].map((r) => h('option', { value: r, selected: rec.data.reason === r }, r))),
          h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: !!rec.data.doc, onchange: (e) => upd(rec, { doc: e.target.checked }) }), '증빙'),
          h('input', { class: 'att-note', placeholder: '메모', value: rec.data.note || '', onchange: (e) => upd(rec, { note: e.target.value }) })) : null);
    })),
    h('p', { class: 'hint' }, `${dayLabel(d)} · 출석이 기본입니다. 결석·지각·조퇴·결과만 누르면 기록되고, 사유·증빙 제출 여부를 바로 고를 수 있습니다.`));
}

function attendanceMonth(students, rows, d, reload) {
  const ym = monthOf(d);
  const inMonth = rows.filter((r) => monthOf(r.data.date) === ym);
  const missingDoc = inMonth.filter((r) => !r.data.doc && r.data.reason !== '미인정');
  const [y, m] = ym.split('-').map(Number);
  const prevM = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const reasons = ['질병', '미인정', '출석인정', '기타'];
  const cell = (name, type) => {
    const list = inMonth.filter((r) => r.data.student === name && r.data.type === type);
    if (!list.length) return h('td', { class: 'muted center' }, '');
    return h('td', { class: 'center', title: list.map((r) => `${fmtDate(r.data.date, false)} ${r.data.reason || ''}`).join('\n') }, list.length);
  };
  const csv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', ...ATT_TYPES.flatMap((t) => reasons.map((r) => `${t}(${r})`))].map(esc).join(',')];
    for (const s of students) lines.push([s.data.num, s.data.name, ...ATT_TYPES.flatMap((t) => reasons.map((r) => inMonth.filter((x) => x.data.student === s.data.name && x.data.type === t && x.data.reason === r).length || ''))].map(esc).join(','));
    download(`출결_${ym}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  return h('div', {},
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => reload(`${prevM}-01`) }, '◀'), h('strong', {}, `${y}년 ${m}월`), h('button', { class: 'btn', onclick: () => reload(`${nextM}-01`) }, '▶'),
      h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: csv }, 'CSV (사유별)')),
    missingDoc.length ? h('div', { class: 'alert warn' }, `📎 증빙서류 미제출 ${missingDoc.length}건: `, missingDoc.map((r) => `${r.data.student}(${fmtDate(r.data.date, false)} ${r.data.type})`).join(', ')) : null,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
      h('thead', {}, h('tr', {}, h('th', {}, '번호'), h('th', {}, '이름'), ATT_TYPES.map((t) => h('th', { class: 'center' }, t)))),
      h('tbody', {}, students.map((s) => h('tr', {}, h('td', { class: 'num' }, s.data.num ?? ''), h('td', {}, s.data.name), ATT_TYPES.map((t) => cell(s.data.name, t))))))),
    h('p', { class: 'hint' }, '숫자에 마우스를 올리면 날짜·사유가 보입니다. 나이스 출결 입력 전 대조용으로 쓰세요.'));
}

// ---------- 체크리스트 ----------

export async function checklistsView(root, openId) {
  const students = await loadStudents();
  const rows = await api(`/api/records/checklists?year=${state.year}`);
  const reload = (id) => checklistsView(root, id ?? openId);
  const sel = rows.find((r) => r.id === (openId || remember('cl_sel'))) || rows.at(-1);
  const names = students.map((s) => s.data.name);
  const toggle = async (r, name) => {
    const done = new Set(r.data.done || []);
    if (done.has(name)) done.delete(name); else done.add(name);
    try { const saved = await api(`/api/records/checklists/${r.id}`, { method: 'PUT', body: { data: { ...r.data, done: [...done] }, version: r.version } }); Object.assign(r, saved); drawSel(); drawList(); } catch (e) { toast(e.message, 'error'); reload(); }
  };
  const listBox = h('div', { class: 'cl-list' });
  const selBox = h('div', {});
  const drawList = () => clear(listBox, rows.slice().reverse().map((r) => {
    const n = names.filter((x) => (r.data.done || []).includes(x)).length;
    return h('button', { class: `cl-item ${r === sel ? 'on' : ''}`, onclick: () => { remember('cl_sel', r.id); reload(r.id); } },
      h('strong', {}, r.data.title), h('div', { class: 'progress-bar' }, h('span', { style: { width: `${names.length ? (n / names.length) * 100 : 0}%` } })),
      h('span', { class: 'muted small' }, `${n}/${names.length}${r.data.due ? ` · ~${fmtDate(r.data.due, false)}` : ''}`));
  }));
  const drawSel = () => {
    if (!sel) return clear(selBox, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '☑️'), h('p', {}, '가정통신문 회신, 숙제 검사처럼 학생별로 확인할 일을 만들어 보세요.')));
    const done = new Set(sel.data.done || []);
    const left = names.filter((x) => !done.has(x));
    clear(selBox,
      h('div', { class: 'card-head' }, h('h3', {}, sel.data.title),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn small', onclick: () => copyText(left.join(', ')) }, `미완료 ${left.length}명 복사`),
          h('button', { class: 'btn small', onclick: () => openRecordForm('checklists', sel, { onSaved: () => reload() }) }, '수정'))),
      sel.data.note ? h('p', { class: 'muted' }, sel.data.note) : null,
      h('div', { class: 'chip-grid' }, students.map((s) => h('button', { class: `check-chip ${done.has(s.data.name) ? 'on' : ''}`, onclick: () => toggle(sel, s.data.name) },
        h('span', { class: 'muted small' }, s.data.num ?? ''), s.data.name))));
  };
  drawList(); drawSel();
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => openRecordForm('checklists', null, { defaults: { due: today() }, onSaved: (r) => r && reload(r.id) }) }, '+ 체크리스트')),
    !students.length ? emptyStudents() : h('div', { class: 'split' }, listBox, h('div', { class: 'card' }, selBox)));
}

// ---------- 칭찬 점수 ----------

const QUICK_REASONS = ['발표', '도움', '정리정돈', '과제', '배려', '바른 자세'];

export async function pointsView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const rows = await api(`/api/records/points?year=${state.year}`);
  const reload = () => pointsView(root);
  let reason = remember('pt_reason') || '';
  let minus = false;
  const total = (n) => rows.filter((r) => r.data.student === n).reduce((a, r) => a + (Number(r.data.points) || 0), 0);
  const max = Math.max(1, ...students.map((s) => total(s.data.name)));
  const give = async (name, btn) => {
    btn.classList.add('pop');
    try { await api('/api/records/points', { method: 'POST', body: { data: { date: today(), student: name, points: minus ? -1 : 1, reason } } }); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const recent = rows.slice().sort((a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt))).slice(0, 10);
  clear(root,
    h('div', { class: 'toolbar' },
      h('span', { class: 'muted' }, '이유'),
      h('div', { class: 'seg' }, ['', ...QUICK_REASONS].map((r) => h('button', { class: reason === r ? 'on' : '', onclick: () => { reason = remember('pt_reason', r); reload(); } }, r || '없음'))),
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', onchange: (e) => { minus = e.target.checked; } }), ' -1 모드')),
    h('div', { class: 'point-grid' }, students.map((s) => {
      const n = s.data.name;
      const tot = total(n);
      return h('button', { class: 'point-tile', onclick: (e) => give(n, e.currentTarget) },
        h('span', { class: 'pt-name' }, n), h('span', { class: 'pt-score' }, `⭐ ${tot}`),
        h('span', { class: 'pt-bar' }, h('i', { style: { width: `${Math.max(0, tot) / max * 100}%` } })));
    })),
    recent.length ? h('details', { class: 'card' }, h('summary', {}, '최근 기록'), h('ul', { class: 'list' }, recent.map((r) => h('li', { class: 'click', onclick: () => openRecordForm('points', r, { onSaved: reload }) }, `${fmtDate(r.data.date, false)} ${r.data.student} ${r.data.points > 0 ? '+' : ''}${r.data.points} ${r.data.reason || ''}`)))) : null,
    h('p', { class: 'hint' }, '이유를 고른 뒤 학생 칸을 누르면 +1점. 교실 화면에 띄워 두고 써도 됩니다.'));
}

// ---------- 명단 관리 ----------

export async function studentsView(root) {
  await loadStudents();
  const reload = () => studentsView(root);
  const box = h('div', {});
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => bulkAdd(reload) }, '📋 여러 명 붙여넣기')),
    box);
  await tableView(box, 'students', { reload, defaults: { num: state.students.length + 1 }, hide: ['note', 'guardian'] });
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

// ---------- 자리 배치 ----------

export function seatGrid(layout, { small = false, onPick, picked } = {}) {
  if (!layout) return h('p', { class: 'muted' }, '-');
  const { rows, cols, seats } = layout;
  return h('div', { class: `seat-wrap ${small ? 'small' : ''}` },
    h('div', { class: 'teacher-desk' }, '교탁'),
    h('div', { class: 'seats', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } },
      Array.from({ length: rows * cols }, (_, i) => h('button', {
        class: `seat ${seats[i] ? '' : 'empty'} ${picked === i ? 'picked' : ''}`, disabled: !onPick, onclick: onPick ? () => onPick(i) : null,
      }, seats[i] || ''))));
}

export async function seatsView(root, selId) {
  await loadStudents();
  const plans = await api(`/api/records/seatPlan?year=${state.year}`);
  const reload = (id) => seatsView(root, id);
  let plan = plans.find((p) => p.id === (selId || remember('seat_sel'))) || plans.at(-1) || null;
  const layout = plan?.data.layout ? JSON.parse(JSON.stringify(plan.data.layout)) : { rows: 5, cols: 6, seats: [] };
  let picked = null;
  const area = h('div', {});
  const draw = () => clear(area, seatGrid(layout, { picked, onPick: (i) => {
    if (picked === null) picked = i; else { [layout.seats[picked], layout.seats[i]] = [layout.seats[i] || '', layout.seats[picked] || '']; picked = null; }
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
  const num = (key, label) => h('label', { class: 'inline' }, label, h('input', { type: 'number', min: 1, max: 12, value: layout[key], style: { width: '64px' }, onchange: (e) => { layout[key] = Math.max(1, Math.min(12, Number(e.target.value) || 1)); draw(); } }));
  clear(root,
    h('div', { class: 'toolbar' },
      plans.length ? h('select', { onchange: (e) => { remember('seat_sel', e.target.value); reload(e.target.value); } }, plans.map((p) => h('option', { value: p.id, selected: p.id === plan?.id }, p.data.title))) : null,
      num('rows', '줄 '), num('cols', '칸 '),
      h('button', { class: 'btn', onclick: shuffleAll }, '🎲 랜덤 배치'),
      h('span', { class: 'grow' }),
      plan ? h('button', { class: 'btn primary', onclick: () => save(false) }, '저장') : null,
      h('button', { class: plan ? 'btn' : 'btn primary', onclick: () => save(true) }, '새로 저장'),
      h('button', { class: 'btn', onclick: () => window.print() }, '인쇄')),
    !state.students.length ? emptyStudents() : null,
    area,
    h('p', { class: 'hint' }, '자리 두 곳을 차례로 누르면 서로 바뀝니다. 위쪽이 교탁(칠판) 쪽입니다.'));
  draw();
}

// ---------- 1인 1역 ----------

export async function rolesView(root) {
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

// ---------- 뽑기 · 모둠 · 타이머 ----------

export async function toolsView(root) {
  await loadStudents();
  let pool = remember('pick_pool') || [];
  if (!pool.length) pool = state.students.slice();
  const out = h('div', { class: 'pick-out' }, '🎲');
  const groupsOut = h('div', {});
  const timerOut = h('div', { class: 'timer' }, '00:00');
  let timerId = null;
  const left = h('span', { class: 'muted small' });
  const drawLeft = () => { left.textContent = root.querySelector('#norep')?.checked ? `남은 학생 ${pool.length}명` : ''; };
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
    h('div', { class: 'alert' }, '🧰 모둠 편성·퀴즈 쇼·팀 점수판·빈칸 학습지 등 더 많은 도구는 ', h('a', { href: '#/desk/market/overview' }, 'Teachshop →')),
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
