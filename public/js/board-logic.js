// 🖥 반짝 교실 화면 규칙 (화면·테스트가 같이 씀)
//   교시 시각 → 지금 몇 교시/쉬는 시간인지, 체크판 집계, 기본 설정

export const DEFAULT_BOARDS = () => [
  { id: 'milk', name: '우유', icon: '🥛', exLabel: '안 마심', excl: [] },
  { id: 'homework', name: '숙제', icon: '📝', exLabel: '빼기', excl: [] },
  { id: 'supplies', name: '준비물', icon: '🎒', exLabel: '빼기', excl: [] },
];
export const MOODS = [
  { key: 'best', icon: '😄', label: '최고' },
  { key: 'calm', icon: '😊', label: '평온' },
  { key: 'sleepy', icon: '🥱', label: '졸려요' },
  { key: 'sad', icon: '😢', label: '속상해요' },
];
export const DEFAULT_QUOTES = ['생각이 다르면 더 많이 배울 수 있어요.', '틀려도 괜찮아, 다시 하면 돼요.', '친구의 말을 끝까지 들어요.', '오늘도 한 뼘 자라요.', '고마워, 미안해, 괜찮아.'];

const hm = (s) => { const [h, m] = String(s || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };
export const toHM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * 교시 시각 한 번에 채우기
 * @returns [{ label:'1교시', start:'09:00', end:'09:40' }]
 */
export function fillTimes({ start = '09:00', count = 6, lesson = 40, rest = 10, longAfter = 2, longRest = 20, lunchAfter = 4, lunch = 50 } = {}) {
  const out = [];
  let t = hm(start);
  for (let i = 1; i <= count; i++) {
    out.push({ label: `${i}교시`, start: toHM(t), end: toHM(t + lesson) });
    t += lesson + (i === lunchAfter ? lunch : i === longAfter ? longRest : rest);
  }
  return out;
}

// 교시 사이 쉬는 시간 이름: 40분 넘으면 점심시간, 15분 넘으면 중간놀이
export const gapName = (min) => (min >= 40 ? '점심시간' : min >= 15 ? '중간놀이' : '쉬는 시간');

/**
 * 지금 상태
 * @param times fillTimes 결과 (요일 무관)
 * @param lessons 그 날 과목 [{ period:'1교시', text:'국어' }] (없으면 [])
 * @param nowMin 자정부터 분
 * @returns { kind: 'before'|'class'|'break'|'after'|'none', cur, next, left(분), total(분), gap }
 */
export function periodState(times, lessons, nowMin) {
  const list = (times || []).map((t, i) => ({ ...t, i, s: hm(t.start), e: hm(t.end), subject: subjectAt(lessons, t.label, i) }))
    .filter((t) => Number.isFinite(t.s) && Number.isFinite(t.e) && t.subject !== null);
  if (!list.length) return { kind: 'none' };
  for (let k = 0; k < list.length; k++) {
    const t = list[k];
    if (nowMin < t.s) {
      const prev = list[k - 1];
      if (!prev) return { kind: 'before', next: t, left: t.s - nowMin, total: t.s - nowMin };
      return { kind: 'break', cur: prev, next: t, left: t.s - nowMin, total: t.s - prev.e, gap: gapName(t.s - prev.e) };
    }
    if (nowMin < t.e) return { kind: 'class', cur: t, next: list[k + 1], left: t.e - nowMin, total: t.e - t.s };
  }
  return { kind: 'after', cur: list.at(-1) };
}
// 그 교시 과목 ('' = 과목 미입력이지만 교시 있음, null = 그 날 그 교시 없음)
function subjectAt(lessons, label, i) {
  if (!lessons) return '';
  if (!lessons.length) return '';
  const pn = (x) => Number(String(x).match(/\d+/)?.[0]) || 0;
  const l = lessons.find((x) => pn(x.period) === pn(label)) || lessons[i];
  if (!l) return null;
  return l.text ? String(l.text).split('\n')[0].trim() : null;
}

/**
 * 체크판 집계
 * @param size 학생 수, checked 체크한 번호, excl 매일 빼는 번호, absent 오늘 결석 번호
 */
export function boardStats(size, checked = [], excl = [], absent = []) {
  const skip = new Set([...excl, ...absent].map(Number));
  const done = new Set(checked.map(Number));
  const target = [];
  for (let n = 1; n <= size; n++) if (!skip.has(n)) target.push(n);
  const left = target.filter((n) => !done.has(n));
  return { target: target.length, done: target.length - left.length, left, complete: target.length > 0 && !left.length };
}

// 결석 빼고 남은 번호 중 뽑기 (뽑힌 번호 빼기 켜면 used 제외)
export function pickPool(size, absent = [], used = [], noRepeat = true) {
  const skip = new Set([...absent, ...(noRepeat ? used : [])].map(Number));
  const out = [];
  for (let n = 1; n <= size; n++) if (!skip.has(n)) out.push(n);
  return out;
}

// 모둠 나누기: 번호를 섞어 n모둠으로 고르게
export function makeGroups(nums, n, rand = Math.random) {
  const a = nums.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const gs = Array.from({ length: Math.max(1, n) }, () => []);
  a.forEach((x, i) => gs[i % gs.length].push(x));
  return gs.map((g) => g.sort((x, y) => x - y));
}

// 'n시간 m분' / 'm분'
export const durLabel = (min) => (min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`);

// D-day 글자
export function ddayLabel(date, today) {
  if (!date) return '';
  const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
  const n = Math.round((d(date) - d(today)) / 86400000);
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`;
}

// 과목별 이동 장소: '과학=과학실' 줄 → { 과학: '과학실' }
export function parsePlaces(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([^=:]+?)\s*[=:]\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
export const placeOf = (places, subject) => (subject && places ? places[subject] || places[String(subject).replace(/\s/g, '')] || '' : '');
