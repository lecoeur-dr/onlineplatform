// 📥 취합 공통 규칙 (화면·서버·테스트가 같이 씀): 유형별 기본 문항 · 응답 검사 · 집계 · 정원
export const KINDS = ['확인', '제출', '참석 조사', '선택', '설문'];
export const KIND_INFO = {
  확인: { icon: '✅', desc: '공문·자료를 확인했는지만 체크' },
  제출: { icon: '🔗', desc: '드라이브 링크나 짧은 답을 받기 (구글폼 링크도 가능)' },
  '참석 조사': { icon: '🙋', desc: '참석 / 불참 / 미정 + 불참 사유' },
  선택: { icon: '☑', desc: '정해진 보기에서 고르기 (보기별 정원 가능)' },
  설문: { icon: '📝', desc: '여러 문항 양식 (구글폼처럼)' },
};
export const Q_TYPES = [
  ['short', '단답'], ['long', '장문'], ['single', '하나 선택'], ['multi', '여러 개 선택'], ['dropdown', '드롭다운'],
  ['number', '숫자'], ['date', '날짜'], ['url', '링크'], ['class', '학년/반'], ['attend', '참석 여부'],
];
export const CHOICE_TYPES = ['single', 'multi', 'dropdown', 'attend'];
export const ATTEND_OPTIONS = ['참석', '불참', '미정'];

export function presetQuestions(kind) {
  if (kind === '참석 조사') return [{ id: 'q1', type: 'attend', label: '참석 여부', required: true, options: [...ATTEND_OPTIONS] }, { id: 'q2', type: 'short', label: '불참·미정 사유', required: false }];
  if (kind === '제출') return [{ id: 'q1', type: 'url', label: '제출 링크', required: true }, { id: 'q2', type: 'short', label: '메모', required: false }];
  if (kind === '선택') return [{ id: 'q1', type: 'single', label: '하나를 골라 주세요', required: true, options: ['보기 1', '보기 2'], caps: [] }];
  if (kind === '설문') return [{ id: 'q1', type: 'short', label: '질문 1', required: true }];
  return [];
}

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]).map(String);

// 응답들 → { 문항id: { 보기: 인원 } } (선택형 문항만)
export function tallyOf(questions = [], answersList = []) {
  const out = {};
  for (const q of questions) {
    if (!CHOICE_TYPES.includes(q.type)) continue;
    const t = Object.fromEntries((q.options || []).map((o) => [o, 0]));
    for (const a of answersList) for (const v of asList(a?.[q.id])) if (v in t) t[v]++;
    out[q.id] = t;
  }
  return out;
}

// 보기별 남은 자리 (정원 없으면 Infinity)
export const capOf = (q, i) => { const n = Number((q.caps || [])[i]); return n > 0 ? n : Infinity; };

// 응답 검사·정리. othersTally: 나를 뺀 다른 사람들의 집계 (정원 확인용). 오류면 { error }
export function checkAnswers(questions = [], answers = {}, { othersTally = {}, linkGiven = false } = {}) {
  const clean = {};
  for (const q of questions) {
    let v = answers?.[q.id];
    if (q.type === 'multi') {
      v = [...new Set(asList(v).filter((x) => (q.options || []).includes(x)))];
      if (q.max > 0 && v.length > q.max) return { error: `「${q.label}」은(는) ${q.max}개까지 고를 수 있습니다.` };
    } else if (CHOICE_TYPES.includes(q.type)) {
      v = v === undefined || v === null ? '' : String(v);
      if (v && !(q.options || []).includes(v)) return { error: `「${q.label}」에 없는 보기입니다.` };
    } else if (q.type === 'number') {
      v = v === '' || v === undefined || v === null ? '' : Number(v);
      if (v !== '' && !Number.isFinite(v)) return { error: `「${q.label}」에는 숫자를 적어 주세요.` };
    } else {
      v = String(v ?? '').trim().slice(0, q.type === 'long' ? 4000 : 500);
      if (q.type === 'url' && v && !/^https?:\/\//i.test(v)) return { error: `「${q.label}」에는 http로 시작하는 링크를 붙여 넣어 주세요.` };
    }
    const empty = Array.isArray(v) ? !v.length : v === '';
    // 제출 유형에서 담당자가 링크(구글폼 등)를 걸어 둔 경우, 링크 칸은 비워도 됨
    if (q.required && empty && !(linkGiven && q.type === 'url')) return { error: `「${q.label}」을(를) 입력해 주세요.` };
    if (CHOICE_TYPES.includes(q.type)) {
      for (const pick of asList(v)) {
        const i = (q.options || []).indexOf(pick);
        if ((othersTally[q.id]?.[pick] || 0) >= capOf(q, i)) return { error: `「${pick}」은(는) 정원이 찼습니다. 다른 보기를 골라 주세요.` };
      }
    }
    if (!empty) clean[q.id] = v;
  }
  return { clean };
}

// 응답 한 건을 사람이 읽는 글로
export function answerText(q, v) {
  if (v === undefined || v === null || v === '') return '';
  return Array.isArray(v) ? v.join(', ') : String(v);
}
