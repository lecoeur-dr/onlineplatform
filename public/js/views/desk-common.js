// Deskterior 공통 도구
import { h, api, toast, fmtDate, addDays, today, DOW } from '../ui.js';
import { state } from '../state.js';
import { openRecordForm } from '../form.js';
import { DEFAULT_GRID } from './timetable.js';

// 학생 명단 (번호순) — 드롭다운용 이름 목록도 갱신
export async function loadStudents() {
  const rows = await api(`/api/records/students?year=${state.year}`);
  sortStudents(rows);
  state.students = rows.map((r) => r.data.name).filter(Boolean);
  return rows;
}
export function sortStudents(rows) {
  rows.sort((a, b) => (Number(a.data.num) || 999) - (Number(b.data.num) || 999) || String(a.data.name).localeCompare(String(b.data.name), 'ko'));
  state.students = rows.map((r) => r.data.name).filter(Boolean);
  return rows;
}

export const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
export const dowOf = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getDay(); };
export const mondayOf = (d) => { const w = dowOf(d); return addDays(d, w === 0 ? 1 : 1 - w); };
export const dayLabel = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${DOW[dowOf(d)]})`; };
export const monthOf = (d) => d.slice(0, 7);

// 나이스 입력 글자 수 참고: 한글 3바이트, 영문·숫자 1바이트, 줄바꿈 2바이트 [학교 나이스 기준 확인 필요]
export const byteLen = (s) => [...String(s || '')].reduce((a, ch) => a + (ch === '\n' ? 2 : ch.charCodeAt(0) > 127 ? 3 : 1), 0);

export function nextDue(due, repeat) {
  const d = due || today();
  if (repeat === '매일') return addDays(d, 1);
  if (repeat === '평일') { let x = addDays(d, 1); while ([0, 6].includes(dowOf(x))) x = addDays(x, 1); return x; }
  if (repeat === '매주') return addDays(d, 7);
  if (repeat === '매월') {
    const [y, m, dd] = d.split('-').map(Number);
    const last = new Date(y, m + 1, 0).getDate();
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
  }
  return d;
}

// 할 일 완료: 반복 할 일은 다음 날짜로
export async function completeTodo(r) {
  const rep = r.data.repeat && r.data.repeat !== '없음';
  const data = rep ? { ...r.data, due: nextDue(r.data.due, r.data.repeat), done: false } : { ...r.data, done: !r.data.done };
  await api(`/api/records/todos/${r.id}`, { method: 'PUT', body: { data, version: r.version } });
  if (rep) toast(`다음: ${fmtDate(data.due)}`);
}

export function todoItem(r, reload) {
  const t = today();
  const late = r.data.due && r.data.due < t && !r.data.done;
  return h('li', { class: `todo ${r.data.done ? 'done' : ''} ${late ? 'late' : ''}` },
    h('input', { type: 'checkbox', checked: !!r.data.done, 'aria-label': '완료', onchange: async () => { try { await completeTodo(r); reload(); } catch (e) { toast(e.message, 'error'); } } }),
    h('span', { class: 'click grow', onclick: () => openRecordForm('todos', r, { onSaved: reload }) }, r.data.title,
      r.data.repeat && r.data.repeat !== '없음' ? h('span', { class: 'tag ghost' }, `🔁 ${r.data.repeat}`) : null),
    r.data.due ? h('span', { class: `muted small ${late ? 'danger' : ''}` }, r.data.due === t ? '오늘' : fmtDate(r.data.due)) : null);
}

// 내 시간표(첫 번째)에서 그 날 요일 칸
export function lessonsOn(tts, d = today()) {
  const tt = tts[0];
  if (!tt) return null;
  const g = tt.data.grid || DEFAULT_GRID();
  const di = g.days.indexOf(DOW[dowOf(d)]);
  if (di < 0) return [];
  return g.periods.map((p, pi) => ({ period: p, text: g.cells[pi]?.[di] || '' }));
}

export const ATT_TYPES = ['결석', '지각', '조퇴', '결과'];
export const ATT_COLOR = { 결석: '#e5484d', 지각: '#f5a524', 조퇴: '#8e4ec6', 결과: '#0091ff' };

// 학생 이름 → 그 학생 기록들
export function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = r.data[key] || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}

export const emptyStudents = () => h('div', { class: 'empty-state' },
  h('div', { class: 'empty-ico' }, '🧒'),
  h('p', {}, '학생 명단을 먼저 입력해 주세요.'),
  h('a', { class: 'btn primary', href: '#/desk/class/students' }, '명단 입력하기'));

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { toast('복사하지 못했습니다.', 'error'); }
}
