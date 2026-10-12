// 지역교육과정 일정 글 → 특별수업(프로그램 '지역교육과정') 기록
//   예) '지역교육과정(피아노) 1교시 3-1, 2교시 3-2' → { program:'지역교육과정', activity:'피아노', content:'피아노\n(3-1) 1교시\n(3-2) 2교시' }
//       '지역교육과정(종이접기) 1-2교시 2-1/ 3-4교시 2-2', '지역교육과정(마을선생님) - 플라워 디자인 (1-1) 1-2교시'
export const LOCAL_PROGRAM = '지역교육과정';
export const isLocalCurriculum = (title) => /^\s*지역\s*교육\s*과정/.test(String(title || ''));

export function localCurriculumToProgram(title) {
  const t = String(title || '').split('\n')[0].trim();
  if (!isLocalCurriculum(t)) return null;
  let rest = t.replace(/^\s*지역\s*교육\s*과정\s*/, '');
  let activity = '';
  const m = rest.match(/^\(([^)]*)\)\s*/);
  if (m) { activity = m[1].trim(); rest = rest.slice(m[0].length); }
  const classes = [];
  // '(1-1) 1-2교시' 꼴
  for (const x of rest.matchAll(/\(?\s*(\d)\s*-\s*(\d{1,2})\s*\)?\s*(\d(?:\s*[-~]\s*\d)?)\s*교시/g)) classes.push([`${x[1]}-${x[2]}`, x[3].replace(/\s/g, '')]);
  // '1교시 3-1' · '1-2교시 2-1' 꼴
  if (!classes.length) for (const x of rest.matchAll(/(\d(?:\s*[-~]\s*\d)?)\s*교시\s*(\d)\s*-\s*(\d{1,2})/g)) classes.push([`${x[2]}-${x[3]}`, x[1].replace(/\s/g, '')]);
  // 반·교시 말고 남은 설명 (예: '- 플라워 디자인')
  const extra = rest.replace(/\(?\s*\d\s*-\s*\d{1,2}\s*\)?\s*\d(?:\s*[-~]\s*\d)?\s*교시/g, '').replace(/\d(?:\s*[-~]\s*\d)?\s*교시\s*\d\s*-\s*\d{1,2}/g, '').replace(/^[\s,/·\-–]+|[\s,/·\-–]+$/g, '').replace(/[\s,/]+$/g, '');
  const head = [activity, extra].filter(Boolean).join(' · ');
  return { program: LOCAL_PROGRAM, activity: head, content: [head, ...classes.map(([c, p]) => `(${c}) ${p}교시`)].filter(Boolean).join('\n') };
}
