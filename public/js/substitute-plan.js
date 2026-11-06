// 🗓 고정 보결표 규칙 (화면·테스트가 같이 씀)
//   담임이 비어 있는 학급: 요일×교시 표에 전담(검정)과 보결(빨강)을 적어 두면 날짜마다 자동으로 배정·집계
//   칸 글자: '5-1'·'교무'·'교장' → 보결(그 사람) / '과'·'영' → 전담 과목 / '체(교장)' → 체육을 교장이 보결

import { normCategory, NO_SCHOOL_CATEGORIES } from './modules.js';

export const PLAN_DAYS = ['월', '화', '수', '목', '금'];
// 보결전담강사: 보결만 맡는 강사 (항상 후보 맨 앞)
export const SUB_TEACHER = '보결전담강사';
export const ROLES = [SUB_TEACHER, '보결강사', '교장', '교감', '교무', '연구', '행정', '보건', '사서', '상담', '영양', '실무사', '강사', '돌봄', '특수', '정보', '생활', '체육부', '방과후'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayOf = (date) => { const [y, m, d] = String(date).split('-').map(Number); return WD[new Date(y, m - 1, d).getDay()]; };
const addDay = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/**
 * 칸 글자 → { kind: 'sub'(보결) | 'class'(전담 수업) | '', who, subj }
 * @param names 교직원 이름 목록 (이름을 적어도 보결로 알아봄)
 * @param force 'sub' | 'class' 직접 고른 경우
 */
export function parseCell(text, names = [], force = '') {
  const s = String(text || '').trim();
  if (!s) return { kind: '', who: '', subj: '' };
  const m = s.match(/^(.*?)\s*[(（]\s*(.+?)\s*[)）]$/);
  if (m) return { kind: force || 'sub', who: m[2], subj: m[1] };
  const isPerson = /^\d\s*-\s*\d{1,2}$/.test(s) || ROLES.includes(s) || names.includes(s);
  const kind = force || (isPerson ? 'sub' : 'class');
  return kind === 'sub' ? { kind, who: s.replace(/\s/g, ''), subj: '' } : { kind, who: '', subj: s };
}
// 저장된 칸 { text, force } → 해석
//   새 형식 { kind, subj, who } (시간표에서 불러온 칸) / 예전 형식 { text, force } 둘 다 읽음
export const cellOf = (plan, pi, di, names) => {
  const c = plan.data.grid?.cells?.[pi]?.[di];
  if (c && typeof c === 'object' && 'kind' in c) return { kind: c.kind || '', who: c.who || '', subj: c.subj || '' };
  return parseCell(c?.text ?? c ?? '', names, c?.force || '');
};

// 학사일정의 휴일·방학 (그 날 수업 없음)
export function holidayChecker(events = []) {
  const ranges = events.filter((e) => NO_SCHOOL_CATEGORIES.includes(normCategory(e.data.category))).map((e) => [e.data.date, e.data.endDate && e.data.endDate > e.data.date ? e.data.endDate : e.data.date, e.data.title]);
  return (date) => ranges.find(([a, b]) => date >= a && date <= b)?.[2] || '';
}

// 그 계획이 그 날 운영되는지: 기간 안·요일 있음·빠지는 날 아님·휴일 아님
export function runsOn(plan, date, isHoliday = () => '') {
  const d = plan.data;
  if (d.start && date < d.start) return false;
  if (d.end && date > d.end) return false;
  const di = (d.grid?.days || PLAN_DAYS).indexOf(weekdayOf(date));
  if (di < 0) return false;
  if ((d.skip || []).includes(date)) return false;
  return !isHoliday(date);
}

/**
 * 그 날 교시별 배정 (날짜별 바꾼 것 반영)
 * @returns [{ pi, period, kind, who, subj, changed, cancelled }]
 */
export function entriesOn(plan, date, names = []) {
  const g = plan.data.grid || {};
  const di = (g.days || PLAN_DAYS).indexOf(weekdayOf(date));
  if (di < 0) return [];
  const ov = plan.data.overrides?.[date] || {};
  return (g.periods || []).map((period, pi) => {
    const base = cellOf(plan, pi, di, names);
    const o = ov[pi];
    if (o === undefined) return { pi, period, ...base, changed: false, cancelled: false };
    if (o === null || o.cancel) return { pi, period, ...base, changed: true, cancelled: true };
    return { pi, period, kind: o.kind || 'sub', who: o.who ?? base.who, subj: o.subj ?? base.subj, changed: true, cancelled: false, was: base.who };
  });
}

/**
 * 교사별 보결 시수 집계
 * @param plans 고정 보결표들, records 수시 보결 기록(substitutes), from~to 기간, today 기준일(이전=실시, 이후=예정)
 * @returns Map who → { fixed, extra, planned, months: { 'YYYY-MM': n }, log: [{ date, period, cls, src }] }
 */
export function tally({ plans = [], records = [], from, to, today, isHoliday = () => '', names = [], resolve = (w) => w }) {
  const out = new Map();
  const get = (w) => { if (!out.has(w)) out.set(w, { fixed: 0, extra: 0, planned: 0, months: {}, log: [] }); return out.get(w); };
  for (const p of plans) {
    const a = p.data.start && p.data.start > from ? p.data.start : from;
    const b = p.data.end && p.data.end < to ? p.data.end : to;
    for (let d = a; d <= b; d = addDay(d, 1)) {
      if (!runsOn(p, d, isHoliday)) continue;
      for (const e of entriesOn(p, d, names)) {
        if (e.kind !== 'sub' || e.cancelled || !e.who) continue;
        const x = get(resolve(e.who));
        if (d > today) { x.planned++; continue; }
        x.fixed++; x.months[d.slice(0, 7)] = (x.months[d.slice(0, 7)] || 0) + 1;
        x.log.push({ date: d, period: e.period, cls: p.data.title, subj: e.subj, src: '고정' });
      }
    }
  }
  for (const r of records) {
    const d = r.data.date; const w = r.data.substitute;
    if (!w || !d || d < from || d > to) continue;
    const x = get(w);
    if (d > today) { x.planned++; continue; }
    x.extra++; x.months[d.slice(0, 7)] = (x.months[d.slice(0, 7)] || 0) + 1;
    x.log.push({ date: d, period: r.data.period, cls: r.data.className || '', subj: r.data.subject || '', src: '수시' });
  }
  for (const x of out.values()) x.log.sort((p, q) => p.date.localeCompare(q.date) || String(p.period).localeCompare(String(q.period), 'ko', { numeric: true }));
  return out;
}

// 한 주 계획의 교사별 보결 시수 (표 옆 요약)
export function weeklyLoad(plan, names = []) {
  const m = new Map();
  let unassigned = 0;
  const g = plan.data.grid || {};
  (g.periods || []).forEach((_, pi) => (g.days || []).forEach((__, di) => { const c = cellOf(plan, pi, di, names); if (c.kind !== 'sub') return; if (c.who) m.set(c.who, (m.get(c.who) || 0) + 1); else unassigned++; }));
  m.unassigned = unassigned;
  return m;
}

// 그 날이 들어 있는 주의 월~금 날짜
export function weekOf(date) {
  const wd = WD.indexOf(weekdayOf(date));
  const mon = addDay(date, wd === 0 ? 1 : 1 - wd);
  return PLAN_DAYS.map((_, i) => addDay(mon, i));
}
export { addDay };

// 엑셀·한글에서 복사한 표(탭/줄) → 칸 글자 [교시][요일]. 첫 줄이 요일 머리글, 첫 칸이 교시면 건너뜀
export function parsePasted(text) {
  let rows = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split('\t').map((x) => x.trim()));
  if (rows.length && rows[0].some((x) => PLAN_DAYS.includes(x))) rows = rows.slice(1);
  return rows.map((r) => (/교시|^\d+$/.test(r[0] || '') ? r.slice(1) : r)).map((r) => r.slice(0, 5));
}
