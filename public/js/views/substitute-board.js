// 🔁 보결 배정 보드 — 나이스 결보강 등록을 벤치마킹하되 창을 열지 않고 한 화면에서
//   ① 그 날 부재 교사(복무·출장 + 직접 추가) → ② 그 교사의 결강 수업(시간표) → ③ 그 교시 공강 교사 후보를 바로 아래에 펼쳐 고르기
import { h, api, clear, toast, confirmBox, today, addDays, fmtDate } from '../ui.js';
import { state, canEdit, myName } from '../state.js';
import { openRecordForm } from '../form.js';
import { activeOn } from './timetable.js';
import { makeCtx, absentLessons, candidates, subCounts, coversPeriod } from '../substitute-logic.js';

const pnum = (x) => Number(String(x || '').match(/\d+/)?.[0]) || 0;
const periodLabel = (p) => (pnum(p) ? `${pnum(p)}교시` : String(p || ''));
const ui = { date: '', open: '', manual: new Map() }; // 이번 접속 동안만 기억
const STATUS = {
  free: { icon: '✅', label: '공강', cls: 'free' },
  unknown: { icon: '❔', label: '정보 없음', cls: 'unknown' },
  busy: { icon: '⛔', label: '수업 있음', cls: 'busy' },
  absent: { icon: '🚫', label: '부재', cls: 'absent' },
};

// 복무·출장의 교직원 칸에 여러 명이 적힌 경우도 나눔
function namesIn(text, staffNames) {
  const s = String(text || '').trim();
  if (!s) return [];
  if (staffNames.includes(s)) return [s];
  const parts = s.split(/[,，、/·\s]+/).map((x) => x.trim()).filter(Boolean);
  const known = parts.filter((x) => staffNames.includes(x));
  return known.length ? known : [s];
}

export function substituteBoard(rows, trips, tts, reload) {
  const date = ui.date || (ui.date = today());
  const staff = (state.staff || []).filter((s) => s.name);
  const staffNames = staff.map((s) => s.name);
  const editable = canEdit('substitutes');
  const ctx = makeCtx(tts.filter((r) => activeOn(r, date)), staff, date);
  const counts = subCounts(rows);
  const dayRows = rows.filter((r) => r.data.date === date);
  const box = h('section', { class: 'section sub-board' });

  // ① 부재 교사: 복무·출장 → 그 날 보결 기록의 부재 교사 → 직접 추가
  const absent = new Map();
  const add = (name, info) => { if (name && !absent.has(name)) absent.set(name, info); };
  for (const t of trips) {
    const end = t.data.endDate && t.data.endDate > t.data.date ? t.data.endDate : t.data.date;
    if (date < t.data.date || date > end) continue;
    for (const n of namesIn(t.data.person, staffNames)) add(n, { reason: t.data.kind || '출장', time: t.data.time || '', title: t.data.title || '', from: 'trip' });
  }
  for (const r of dayRows) add(r.data.absent, { reason: r.data.reason || '', time: '', title: '', from: 'record' });
  for (const n of ui.manual.get(date) || []) add(n, { reason: '', time: '', title: '', from: 'manual' });
  const absentees = new Set(absent.keys());
  // 그 교시에 빠지는 사람만 (조퇴 '5~6교시'면 1교시에는 보결 가능)
  const absentAt = (period) => new Set([...absent].filter(([, i]) => coversPeriod(i.time, period)).map(([n]) => n));

  // 교사별 결강 수업 + 이미 배정된 기록 짝짓기
  const cards = [...absent].map(([name, info]) => {
    const recs = dayRows.filter((r) => r.data.absent === name);
    const used = new Set();
    const lines = absentLessons(ctx, name, info.time).map((l) => {
      const rec = recs.find((r) => !used.has(r.id) && pnum(r.data.period) === pnum(l.period));
      if (rec) used.add(rec.id);
      return { period: l.period, cls: l.cls, subject: l.subject, rec };
    });
    for (const r of recs) if (!used.has(r.id)) lines.push({ period: r.data.period, cls: r.data.className, subject: r.data.subject, rec: r });
    lines.sort((a, b) => pnum(a.period) - pnum(b.period));
    return { name, info, lines, known: ctx.roomOf.has(name) };
  });
  const total = cards.reduce((n, c) => n + c.lines.length, 0);
  const done = cards.reduce((n, c) => n + c.lines.filter((l) => l.rec?.data.substitute).length, 0);
  // 같은 날 같은 교시에 이미 보결 들어가는 사람
  const subAt = (period) => new Set(dayRows.filter((r) => pnum(r.data.period) === pnum(period) && r.data.substitute).map((r) => r.data.substitute));

  const go = (d) => { ui.date = d; ui.open = ''; reload(); };
  const save = async (line, absName, info, sub) => {
    const data = { date, period: periodLabel(line.period), className: line.cls || '', subject: line.subject || '', absent: absName, substitute: sub, reason: line.rec?.data.reason || info.reason || '' };
    try {
      if (line.rec) await api(`/api/records/substitutes/${line.rec.id}`, { method: 'PUT', body: { data: { ...line.rec.data, ...data }, version: line.rec.version } });
      else await api('/api/records/substitutes', { method: 'POST', body: { data, year: state.year } });
      toast(`${periodLabel(line.period)} ${line.cls || ''} → ${sub} 선생님 배정`);
      ui.open = ''; reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const cancel = async (line) => {
    if (!(await confirmBox(`${periodLabel(line.period)} ${line.cls || ''} 보결(${line.rec.data.substitute})을 취소할까요?`))) return;
    try { await api(`/api/records/substitutes/${line.rec.id}`, { method: 'DELETE' }); toast('취소했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  // ③ 후보 교사 패널 (나이스 오른쪽 교사 목록)
  const picker = (line, absName, info) => {
    const taken = subAt(line.period);
    const list = candidates(ctx, { period: line.period, cls: line.cls, subject: line.subject, absentName: absName, absentees: absentAt(line.period), counts })
      .map((c) => (taken.has(c.name) && c.name !== line.rec?.data.substitute && c.status !== 'absent' ? { ...c, status: 'busy', taken: true } : c));
    const groups = ['free', 'unknown', 'busy', 'absent'].map((k) => [k, list.filter((c) => c.status === k)]).filter(([, l]) => l.length);
    const pick = async (c) => {
      if (c.status === 'busy' && !(await confirmBox(`${c.name} 선생님은 ${periodLabel(line.period)}에 ${c.taken ? '다른 보결이' : '수업이'} 있습니다. 그래도 배정할까요?`))) return;
      if (c.status === 'absent' && !(await confirmBox(`${c.name} 선생님은 오늘 부재(복무·출장)입니다. 그래도 배정할까요?`))) return;
      save(line, absName, info, c.name);
    };
    return h('div', { class: 'sb-pick' },
      h('div', { class: 'sb-pick-head' },
        h('strong', {}, `${periodLabel(line.period)} ${line.cls || ''} ${line.subject || ''} — 들어갈 선생님 고르기`),
        h('span', { class: 'muted small' }, ' 공강 → 같은 과목·같은 학년 → 보강 적은 순'),
        h('span', { class: 'grow' }),
        h('button', { class: 'link-btn small', onclick: () => { ui.open = ''; reload(); } }, '닫기')),
      groups.length ? groups.map(([k, l]) => h('div', { class: `sb-group ${STATUS[k].cls}` },
        h('div', { class: 'sb-group-title' }, `${STATUS[k].icon} ${STATUS[k].label} ${l.length}`),
        h('div', { class: 'sb-cands' }, l.map((c) => h('button', { class: `sb-cand ${STATUS[k].cls} ${c.name === line.rec?.data.substitute ? 'on' : ''}`, onclick: () => pick(c), title: c.room ? `${c.room}` : '담임·전담 미지정' },
          h('span', { class: 'sb-name' }, c.name),
          c.room ? h('span', { class: 'sb-room' }, c.room) : null,
          c.sameSubject ? h('span', { class: 'sb-tag subj' }, '같은 과목') : null,
          c.sameGrade ? h('span', { class: 'sb-tag grade' }, '같은 학년') : null,
          c.taken ? h('span', { class: 'sb-tag' }, '다른 보결') : null,
          h('span', { class: 'sb-cnt' }, `보강 ${c.subCnt}`)))))) : h('p', { class: 'muted small' }, '선생님 명단이 없습니다. 학교 관리에서 사용자를 초대해 주세요.'));
  };

  const lineRow = (line, card) => {
    const key = `${card.name}|${line.period}|${line.cls}`;
    const sub = line.rec?.data.substitute;
    const mineSub = sub && sub === myName();
    return [h('div', { class: `sb-line ${sub ? 'done' : 'todo'} ${mineSub ? 'mine' : ''} ${ui.open === key ? 'open' : ''}` },
      h('span', { class: 'sb-period' }, periodLabel(line.period)),
      h('span', { class: 'sb-cls' }, line.cls || '—'),
      h('span', { class: 'sb-subj' }, line.subject || ''),
      h('span', { class: 'grow' }),
      sub ? h('span', { class: 'sb-assigned' }, '→ ', h('strong', {}, sub)) : h('span', { class: 'sb-need' }, '미배정'),
      editable ? h('span', { class: 'sb-acts' },
        h('button', { class: `btn small ${sub ? '' : 'primary'}`, onclick: () => { ui.open = ui.open === key ? '' : key; reload(); } }, sub ? '바꾸기' : '배정하기'),
        line.rec ? h('button', { class: 'btn small ghost', title: '사유·비고 고치기', onclick: () => openRecordForm('substitutes', line.rec, { onSaved: reload }) }, '✎') : null,
        line.rec ? h('button', { class: 'btn small danger ghost', onclick: () => cancel(line) }, '취소') : null) : null),
    ui.open === key ? picker(line, card.name, card.info) : null];
  };

  const card = (c) => {
    const n = c.lines.length; const k = c.lines.filter((l) => l.rec?.data.substitute).length;
    const cnt = counts.get(c.name) || { absent: 0, sub: 0 };
    return h('article', { class: `sb-card ${n && k === n ? 'all-done' : ''}` },
      h('header', { class: 'sb-card-head' },
        h('strong', { class: 'sb-who' }, c.name),
        ctx.roomOf.get(c.name) ? h('span', { class: 'tag ghost' }, ctx.roomOf.get(c.name)) : null,
        c.info.reason ? h('span', { class: 'tag warn' }, c.info.reason) : null,
        c.info.time ? h('span', { class: 'muted small' }, c.info.time) : null,
        c.info.title ? h('span', { class: 'muted small ellip' }, c.info.title) : null,
        h('span', { class: 'grow' }),
        h('span', { class: 'muted small' }, `올해 결강 ${cnt.absent} · 보강 ${cnt.sub}`),
        n ? h('span', { class: `sb-prog ${k === n ? 'ok' : ''}` }, `${k}/${n}`) : null,
        c.info.from === 'manual' ? h('button', { class: 'link-btn small', title: '목록에서 빼기', onclick: () => { ui.manual.get(date)?.delete(c.name); reload(); } }, '✕') : null),
      c.lines.length ? h('div', { class: 'sb-lines' }, c.lines.map((l) => lineRow(l, c)))
        : h('p', { class: 'muted small sb-empty' }, c.known ? `${fmtDate(date)}에는 시간표에 수업이 없습니다${c.info.time ? ` (${c.info.time})` : ''}.` : '담임 학급·전담이 지정되지 않았거나 시간표가 없어 수업을 알 수 없습니다. 학교 관리 → 사용자에서 담임·전담을 지정하면 자동으로 채워집니다.'),
      editable ? h('div', { class: 'sb-foot' }, h('button', { class: 'link-btn small', onclick: () => openRecordForm('substitutes', null, { defaults: { date, absent: c.name, reason: c.info.reason }, onSaved: reload }) }, '+ 교시 직접 추가')) : null);
  };

  const others = staffNames.filter((n) => !absentees.has(n));
  const addSel = editable && others.length ? h('select', { class: 'small', onchange: (e) => {
    const n = e.target.value; if (!n) return;
    if (!ui.manual.has(date)) ui.manual.set(date, new Set());
    ui.manual.get(date).add(n); reload();
  } }, h('option', { value: '' }, '+ 부재 교사 추가'), others.map((n) => h('option', { value: n }, n))) : null;

  clear(box,
    h('div', { class: 'sb-top' },
      h('div', { class: 'sb-date' },
        h('button', { class: 'btn small', onclick: () => go(addDays(date, -1)), 'aria-label': '전날' }, '◀'),
        h('input', { type: 'date', value: date, onchange: (e) => e.target.value && go(e.target.value) }),
        h('button', { class: 'btn small', onclick: () => go(addDays(date, 1)), 'aria-label': '다음날' }, '▶'),
        date !== today() ? h('button', { class: 'btn small', onclick: () => go(today()) }, '오늘') : null,
        h('strong', { class: 'sb-day' }, fmtDate(date))),
      h('div', { class: 'sb-sum' },
        h('span', { class: 'sb-chip' }, '부재 ', h('b', {}, absent.size), '명'),
        h('span', { class: 'sb-chip' }, '결강 ', h('b', {}, total), '시간'),
        h('span', { class: 'sb-chip ok' }, '배정 ', h('b', {}, done)),
        h('span', { class: `sb-chip ${total - done ? 'warn' : ''}` }, '미배정 ', h('b', {}, total - done))),
      h('span', { class: 'grow' }), addSel),
    cards.length ? h('div', { class: 'sb-cards' }, cards.map(card))
      : h('p', { class: 'muted sb-none' }, `${fmtDate(date)}에는 복무·출장으로 빠지는 선생님이 없습니다. 다른 사유로 빠지는 선생님은 [+ 부재 교사 추가]로 넣으세요.`),
    h('p', { class: 'hint' }, '✅ 공강 = 그 교시에 수업 없음 · ❔ 정보 없음 = 담임·전담 미지정 · ⛔ 수업 있음 = 그 교시에 수업이나 다른 보결 · 🚫 부재 = 그 날 복무·출장. 수업은 시간표(적용 기간 포함)와 학교 관리의 담임·전담 지정으로 계산합니다.'));
  return box;
}
