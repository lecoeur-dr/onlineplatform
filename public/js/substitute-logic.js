// 🔁 보결 배정 규칙 (화면·테스트가 같이 씀) — 나이스 결보강 등록을 벤치마킹
//   시간표(학급·전담) + 교사의 담임 학급/전담(학교 관리에서 지정) → 그 날 그 교시에 누가 수업이 있고 누가 비는지
//   분류: 공강(그 시간 수업 없음) · 같은 과목/같은 학년(참고) · 수업 있음 · 부재(그 날 복무·출장) · 정보 없음(담임·전담 미지정)

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayOf = (date) => { const [y, m, d] = String(date).split('-').map(Number); return WEEKDAYS[new Date(y, m - 1, d).getDay()]; };
const roomKey = (s) => String(s || '').replace(/\s|학년|반/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
export const classesIn = (text) => [...String(text || '').matchAll(/(\d)\s*-\s*(\d{1,2})/g)].map((m) => `${m[1]}-${m[2]}`);
const pnum = (label) => Number(String(label || '').match(/\d+/)?.[0]) || 0;
const subjectOfSpecialist = (title) => String(title || '').replace(/\s*전담\s*/g, '').trim();

// 시간표 칸 읽기: 그 요일·교시의 글자
function cellAt(r, day, period) {
  const g = r?.data?.grid;
  if (!g) return '';
  const di = g.days.indexOf(day);
  const pi = g.periods.findIndex((p) => pnum(p) === pnum(period));
  if (di < 0 || pi < 0) return '';
  return String(g.cells?.[pi]?.[di] ?? '').trim();
}
const periodsOf = (r) => (r?.data?.grid?.periods || []).filter(Boolean);

/**
 * ctx 만들기
 * @param tts 그 날 쓰이는 시간표들 (적용 기간으로 미리 거른 것)
 * @param staff [{ name, homeroom }]
 * @param date 'YYYY-MM-DD'
 */
export function makeCtx(tts, staff, date) {
  const day = weekdayOf(date);
  const classTT = new Map();
  const specTT = new Map();
  for (const r of tts) {
    if (r.data.kind === '학급') classTT.set(roomKey(r.data.title), r);
    else if (r.data.kind === '전담') specTT.set(roomKey(r.data.title), r);
  }
  const roomOf = new Map();
  const teacherOfRoom = new Map();
  for (const s of staff) if (s.name && s.homeroom) { roomOf.set(s.name, s.homeroom); teacherOfRoom.set(roomKey(s.homeroom), s.name); }
  return { date, day, classTT, specTT, roomOf, teacherOfRoom, staff };
}

// 그 학급의 그 교시를 맡는 전담 시간표 (전담 시간표 칸에 학급이 적혀 있거나, 학급 칸에 전담 이름이 적힌 경우)
function specialistFor(ctx, cls, period) {
  for (const [k, r] of ctx.specTT) if (classesIn(cellAt(r, ctx.day, period)).includes(cls)) return k;
  const txt = cellAt(ctx.classTT.get(roomKey(cls)), ctx.day, period);
  for (const k of ctx.specTT.keys()) if (txt && roomKey(txt) === k) return k;
  for (const s of ctx.staff) if (s.homeroom && /전담/.test(s.homeroom) && txt && roomKey(txt) === roomKey(s.homeroom)) return roomKey(s.homeroom);
  return null;
}

// 교사 한 명의 그 날 수업 목록 [{ period, cls, subject }]  (모르면 null)
export function lessonsOf(ctx, name) {
  const room = ctx.roomOf.get(name);
  if (!room) return null;
  const key = roomKey(room);
  if (ctx.classTT.has(key)) {
    const r = ctx.classTT.get(key);
    const out = [];
    for (const p of periodsOf(r)) {
      const subject = cellAt(r, ctx.day, p);
      if (!subject) continue;
      if (specialistFor(ctx, key, p)) continue; // 전담 시간 = 담임은 빔
      out.push({ period: p, cls: key, subject });
    }
    return out;
  }
  if (ctx.specTT.has(key)) {
    const r = ctx.specTT.get(key);
    return periodsOf(r).map((p) => ({ p, t: cellAt(r, ctx.day, p) })).filter((x) => x.t)
      .map((x) => ({ period: x.p, cls: classesIn(x.t)[0] || x.t, subject: subjectOfSpecialist(room) || x.t }));
  }
  return null;
}

// 그 교시에 이 교사가 수업 중인지: true / false / null(모름)
export function busyAt(ctx, name, period) {
  const ls = lessonsOf(ctx, name);
  if (!ls) return null;
  return ls.some((l) => pnum(l.period) === pnum(period));
}

// '5~6교시'·'3교시'처럼 적힌 시간이 그 교시를 포함하는지 (교시가 안 적혀 있으면 하루 종일로 봄)
export function coversPeriod(time, period) {
  const m = String(time || '').match(/(\d)\s*(?:교시)?\s*[~\-–]\s*(\d)\s*교시/) || String(time || '').match(/(\d)\s*교시/);
  if (!m) return true;
  const a = Number(m[1]); const b = Number(m[2] || m[1]); const p = pnum(period);
  return p >= Math.min(a, b) && p <= Math.max(a, b);
}

// 부재 교사가 그 날 맡은 수업. 시간표가 없으면 빈 목록
//   time: '5~6교시' 처럼 적혀 있으면 그 교시만 (조퇴·외출)
export function absentLessons(ctx, name, time = '') {
  return (lessonsOf(ctx, name) || []).filter((l) => coversPeriod(time, l.period));
}

/**
 * 보결 교사 후보 (나이스 결보강 화면의 교사 목록처럼)
 * @returns [{ name, status: 'free'|'busy'|'absent'|'unknown', sameGrade, sameSubject, absentCnt, subCnt, room }]
 *   정렬: 공강 → 정보 없음 → 수업 있음 → 부재, 같은 등급 안에서는 보강 적은 순
 */
export function candidates(ctx, { period, cls, subject, absentName, absentees = new Set(), counts = new Map() }) {
  const grade = String(cls || '').match(/^(\d)/)?.[1];
  const rank = { free: 0, unknown: 1, busy: 2, absent: 3 };
  return ctx.staff.filter((s) => s.name && s.name !== absentName).map((s) => {
    const busy = busyAt(ctx, s.name, period);
    const status = absentees.has(s.name) ? 'absent' : busy === null ? 'unknown' : busy ? 'busy' : 'free';
    const room = ctx.roomOf.get(s.name) || '';
    const c = counts.get(s.name) || { absent: 0, sub: 0 };
    return { name: s.name, room, status, sameGrade: !!grade && room.startsWith(`${grade}-`), sameSubject: !!subject && subjectOfSpecialist(room) === subject, absentCnt: c.absent, subCnt: c.sub };
  }).sort((a, b) => rank[a.status] - rank[b.status] || (b.sameSubject - a.sameSubject) || (b.sameGrade - a.sameGrade) || a.subCnt - b.subCnt || a.name.localeCompare(b.name, 'ko'));
}

// 교사별 결강·보강 횟수 (학년도 보결 기록에서)
export function subCounts(rows) {
  const m = new Map();
  const get = (n) => { if (!m.has(n)) m.set(n, { absent: 0, sub: 0 }); return m.get(n); };
  for (const r of rows) { if (r.data.absent) get(r.data.absent).absent++; if (r.data.substitute) get(r.data.substitute).sub++; }
  return m;
}
