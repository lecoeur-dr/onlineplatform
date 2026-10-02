// 평가 문장 도우미 (화면과 테스트가 함께 씀): 조사, 평가 요소 명사형, 수준별 기준 초안, 생활기록부 문체, 시기 정렬

// 시기 정렬: "9월 3주" → 학년도 순서(3월 시작), "12~14차시" → 차시 순
export function timingKey(t) {
  const s = String(t || '');
  const m = s.match(/(\d{1,2})\s*월/);
  const w = Number(s.match(/(\d)\s*주/)?.[1] || 0);
  if (m) { const mo = Number(m[1]); return (mo >= 3 ? mo - 3 : mo + 9) * 10 + w; }
  const n = s.match(/(\d+)/);
  return n ? 200 + Number(n[1]) / 1000 : 999;
}
// 받침 있으면 을, 없으면 를
export const josa = (w, a = '을', b = '를') => { const c = String(w).trim().slice(-1).charCodeAt(0); if (c < 0xac00 || c > 0xd7a3) return `${w}${a}(${b})`; return `${w}${(c - 0xac00) % 28 ? a : b}`; };
export const endDot = (s) => { const t = String(s || '').trim(); return !t ? '' : /[.!?。]$/.test(t) ? t : `${t}.`; };

// 성취기준 문장 → 평가 요소(명사형): "…분리할 수 있다." → "…분리하기", "…기른다." → "…기르기"
const KEEP_L = new Set(['들', '알', '살', '놀', '열', '풀', '밀', '걸', '불', '끌', '길', '벌', '갈', '팔', '달', '울', '멀']);
const syl = (ch) => ch.charCodeAt(0) - 0xac00;
export function elementFrom(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');
  if (!t) return '';
  let m;
  if ((m = t.match(/^(.*)할 수 있다$/))) return `${m[1]}하기`;
  if ((m = t.match(/^(.*?)([가-힣])을 수 있다$/))) return `${m[1]}${m[2]}기`;
  if ((m = t.match(/^(.*?)([가-힣]) 수 있다$/))) { const c = syl(m[2]); return `${m[1]}${c % 28 === 8 && !KEEP_L.has(m[2]) ? String.fromCharCode(0xac00 + c - 8) : m[2]}기`; }
  if ((m = t.match(/^(.*)한다$/))) return `${m[1]}하기`;
  if ((m = t.match(/^(.*?)([가-힣])는다$/))) return `${m[1]}${m[2]}기`;
  if ((m = t.match(/^(.*?)([가-힣])다$/))) { const c = syl(m[2]); return `${m[1]}${c % 28 === 4 ? String.fromCharCode(0xac00 + c - 4) : m[2]}기`; }
  return t;
}

// 수준별 기준 초안 (학교 기준으로 꼭 다듬기)
export function autoRubric(element, levels) {
  const e = element || '학습 내용';
  const top = `${josa(e)} 정확히 이해하고 스스로 능숙하게 수행할 수 있다.`;
  const second = `${josa(e)} 이해하고 바르게 수행할 수 있다.`;
  const mid3 = `${josa(e)} 대체로 이해하고 수행할 수 있다.`;
  const mid = `${josa(e)} 부분적으로 이해하고 도움을 받아 수행할 수 있다.`;
  const low = `교사의 안내에 따라 ${josa(e)} 수행하는 활동에 참여한다.`;
  const n = levels.length;
  const list = n <= 2 ? [`${josa(e)} 수행할 수 있다.`, `${josa(e)} 수행하는 데 도움이 필요하다.`]
    : n === 3 ? [top, mid, low] : n === 4 ? [top, second, mid, low] : [top, second, mid3, mid, low, ...Array(Math.max(0, n - 5)).fill(low)];
  return Object.fromEntries(levels.map((lv, i) => [lv, list[i]]));
}

// 생활기록부 문체: "~할 수 있다." → "~할 수 있음.", "~한다." → "~함.", "나눈다" → "나눔"
export function toRecordStyle(s) {
  return String(s || '').split(/(?<=[.!?])\s+/).map((sent) => {
    const t = sent.trim().replace(/[.。]+$/, '');
    if (!t) return '';
    const rules = [[/있다$/, '있음'], [/없다$/, '없음'], [/이다$/, '임'], [/했다$/, '함'], [/였다$/, '였음'], [/한다$/, '함'], [/([가-힣])는다$/, '$1음']];
    for (const [re, to] of rules) if (re.test(t)) return `${t.replace(re, to)}.`;
    const m = t.match(/([가-힣])다$/);
    if (m) { const c = syl(m[1]); if (c >= 0 && c % 28 === 4) return `${t.slice(0, -2)}${String.fromCharCode(0xac00 + c - 4 + 16)}.`; }
    return `${t}.`;
  }).filter(Boolean).join(' ');
}

