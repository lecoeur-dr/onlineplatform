// 🍚 급식 의견 공통 규칙 (화면·서버·학생 화면·테스트가 같이 씀)
//   메뉴 투표: 영양 선생님이 올린 후보 중 고르기 / 메뉴 추천: 학생이 먹고 싶은 메뉴를 직접 적기
export const MEAL_KINDS = ['메뉴 투표', '메뉴 추천'];

// 대상 학년 글 → [3,4,5,6]  예) '3~6학년', '1,2학년', '5-6', '' (비우면 1~6학년)
export function gradesOf(text) {
  const t = String(text || '').replace(/\s/g, '');
  if (!t) return [1, 2, 3, 4, 5, 6];
  const out = new Set();
  for (const m of t.matchAll(/(\d)(?:학년)?(?:[~\-–](\d))?/g)) {
    const a = Number(m[1]); const b = Number(m[2] || m[1]);
    for (let g = Math.min(a, b); g <= Math.max(a, b); g++) if (g >= 1 && g <= 6) out.add(g);
  }
  return out.size ? [...out].sort((x, y) => x - y) : [1, 2, 3, 4, 5, 6];
}

// 메뉴 후보: 한 줄에 하나 (쉼표로 이어 써도 됨), 같은 이름은 하나만
export const optionsOf = (text) => [...new Set(String(text || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean))].slice(0, 60);
export const maxPickOf = (d) => Math.max(1, Math.min(10, Number(d.maxPick) || 3));
export const recCountOf = (d) => Math.max(1, Math.min(5, Number(d.recCount) || 3));
// 추천 메뉴 묶기용: 띄어쓰기·꾸밈 글자 무시 (예: '마라 탕!' = '마라탕')
export const menuKey = (s) => String(s || '').replace(/[\s~!?.,·'"()[\]]/g, '').toLowerCase();

// 응답 검사·정리 → { clean } 또는 { error }
export function checkMeal(d, body) {
  const grades = gradesOf(d.grades);
  const grade = Number(body?.grade);
  if (!grades.includes(grade)) return { error: '학년을 골라 주세요.' };
  if (d.kind === '메뉴 추천') {
    const recs = (Array.isArray(body.recs) ? body.recs : []).map((r) => ({ menu: String(r?.menu || '').trim().slice(0, 30), reason: String(r?.reason || '').trim().slice(0, 100) })).filter((r) => r.menu).slice(0, recCountOf(d));
    if (!recs.length) return { error: '먹고 싶은 메뉴를 하나 이상 적어 주세요.' };
    return { clean: { grade, answers: { recs } } };
  }
  const opts = optionsOf(d.options);
  const picks = [...new Set((Array.isArray(body.picks) ? body.picks : []).map(String))].filter((x) => opts.includes(x));
  if (!picks.length) return { error: '메뉴를 하나 이상 골라 주세요.' };
  if (picks.length > maxPickOf(d)) return { error: `${maxPickOf(d)}개까지 고를 수 있어요.` };
  return { clean: { grade, answers: { picks } } };
}

// 결과 집계: responses = [{ grade, answers, hidden }]
export function mealResults(d, responses) {
  const grades = gradesOf(d.grades);
  const byGrade = Object.fromEntries(grades.map((g) => [g, 0]));
  for (const r of responses) if (r.grade in byGrade) byGrade[r.grade]++;
  if (d.kind === '메뉴 추천') {
    const groups = new Map();
    for (const r of responses) {
      if (r.hidden) continue;
      for (const x of r.answers?.recs || []) {
        const k = menuKey(x.menu);
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, { menu: x.menu, count: 0, grades: {}, reasons: [] });
        const gr = groups.get(k);
        gr.count++; gr.grades[r.grade] = (gr.grades[r.grade] || 0) + 1;
        if (x.reason && gr.reasons.length < 20) gr.reasons.push(x.reason);
      }
    }
    return { total: responses.length, byGrade, recs: [...groups.values()].sort((a, b) => b.count - a.count || a.menu.localeCompare(b.menu, 'ko')) };
  }
  const opts = optionsOf(d.options);
  const votes = opts.map((o) => ({ menu: o, count: 0, grades: {} }));
  for (const r of responses) for (const p of r.answers?.picks || []) {
    const v = votes.find((x) => x.menu === p);
    if (v) { v.count++; v.grades[r.grade] = (v.grades[r.grade] || 0) + 1; }
  }
  return { total: responses.length, byGrade, votes: votes.sort((a, b) => b.count - a.count) };
}
