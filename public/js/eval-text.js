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


// ---------- 분석적 루브릭: 평가 관점 × 수준 ----------

// 평가 방법에 맞는 평가 관점 제안
const CRITERIA_PRESETS = [
  [/실험|탐구/, ['탐구 계획과 수행', '결과 정리', '원리 설명']],
  [/조사|보고서/, ['자료 수집', '내용 정리', '표현과 발표']],
  [/실기|실습/, ['기능 수행', '자세와 안전', '참여 태도']],
  [/토의|토론/, ['주장과 근거', '경청과 존중', '의견 조정']],
  [/프로젝트/, ['계획 세우기', '수행과 협력', '결과물 완성도']],
  [/서술|논술|구술/, ['내용의 정확성', '논리와 근거', '표현']],
  [/포트폴리오|관찰|자기|동료/, ['과정 성실성', '성장과 개선', '성찰']],
];
export const suggestCriteria = (method) => (CRITERIA_PRESETS.find(([re]) => re.test(String(method || ''))) || [null, ['개념 이해', '적용과 수행', '참여 태도']])[1];

// 관점 수준 문장 초안: 관점 이름을 넣은 기본 문장
export function criterionRubric(name, levels) {
  const n = levels.length;
  const top = `${josa(name)} 매우 뛰어나게 해냄.`;
  const t2 = `${josa(name)} 바르게 해냄.`;
  const mid = `${josa(name)} 대체로 해내며 일부 도움이 필요함.`;
  const low = `${josa(name)} 해내기 위해 안내와 연습이 필요함.`;
  const list = n <= 2 ? [t2, low] : n === 3 ? [top, mid, low] : n === 4 ? [top, t2, mid, low] : [top, t2, mid, mid, low];
  return Object.fromEntries(levels.map((lv, i) => [lv, list[Math.min(i, list.length - 1)]]));
}

// 강점(문장형) · 보완(명사형) 근거 칩 기본값
export const DEFAULT_CHIPS = {
  good: ['스스로 끝까지 해결함', '근거를 들어 설명함', '친구와 협력하여 활동함', '결과를 꼼꼼하게 정리함', '창의적인 방법을 제안함', '질문을 통해 탐구를 넓힘', '발표를 자신 있게 함'],
  need: ['근거를 들어 설명하는 연습', '결과를 정리하는 습관', '과정을 스스로 점검하는 태도', '친구와 의견을 나누는 경험', '기본 개념을 다지는 활동'],
};

// 관점별 수준 → 종합 수준 (순위 평균 반올림)
export function overallLevel(levels, critLevels) {
  const idx = Object.values(critLevels || {}).map((lv) => levels.indexOf(lv)).filter((i) => i >= 0);
  if (!idx.length) return '';
  return levels[Math.round(idx.reduce((a, b) => a + b, 0) / idx.length)];
}

// 강점 칩 두 개를 한 문장으로: "근거를 들어 설명함" + "방법을 제안함" → "근거를 들어 설명하고 방법을 제안함."
export function joinChips(list) {
  const xs = (list || []).map((x) => String(x).trim().replace(/[.。]$/, '')).filter(Boolean).slice(0, 2);
  if (xs.length < 2 || !/함$/.test(xs[0])) return xs.map(endDot);
  return [endDot(`${xs[0].replace(/함$/, '하고')} ${xs[1]}`)];
}
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (arr, seed, k = 0) => arr[(seed + k) % arr.length];
const unitOf = (d) => String(d.unit || '').replace(/^\s*\d+\s*[.)]\s*/, '').trim();

// 한 평가 계획에서 한 학생의 교과발달 문장: 기록에 있는 것만 씀
//   강점 관점(가장 높은 수준) 기준 문장 → 강점 칩 → 산출물 근거 → 관찰 메모 → 보완 관점(성장 기대 문장)
export function composeRemark(d, sc, name = '') {
  if (!sc?.level && !Object.keys(sc?.crit || {}).length) return '';
  const levels = d.levels?.length >= 2 ? d.levels : null;
  if (!levels) return '';
  const seed = hash(`${name}|${d.unit}|${d.element}`);
  const idx = (lv) => levels.indexOf(lv);
  const u = unitOf(d);
  const topic = u ? pick([`'${u}' 단원에서 `, `'${u}' 수업에서 `, `'${u}' 활동에서 `], seed) : d.area ? `'${d.area}' 영역에서 ` : '';
  const parts = [];
  const crits = (d.criteria || []).filter((c) => idx(sc.crit?.[c.name]) >= 0);
  if (crits.length) {
    const sorted = crits.slice().sort((a, b) => idx(sc.crit[a.name]) - idx(sc.crit[b.name]) || hash(name + a.name) - hash(name + b.name));
    const bestI = idx(sc.crit[sorted[0].name]);
    const strong = sorted.filter((c) => idx(sc.crit[c.name]) === bestI).slice(0, 2);
    strong.forEach((c, k) => {
      const base = c.rubric?.[sc.crit[c.name]] || criterionRubric(c.name, levels)[sc.crit[c.name]];
      parts.push(toRecordStyle(`${k === 0 ? topic : pick(['또한 ', '아울러 ', ''], seed, k)}${base}`));
    });
    parts.push(...joinChips(sc.good));
    if (sc.evidence) parts.push(endDot(sc.evidence));
    if (sc.note) parts.push(endDot(sc.note));
    const weak = sorted.at(-1);
    const wI = idx(sc.crit[weak.name]);
    const need = sc.need?.[0];
    if (need) {
      parts.push(pick([`${need}${josa(need, '이', '가').slice(need.length)} 더해지면 한층 성장할 것으로 기대됨.`, `앞으로 ${josa(need)} 더해 가면 더 큰 성장이 기대됨.`, `${need}에 꾸준히 관심을 기울이면 더욱 성장할 것으로 기대됨.`], seed));
    } else if (wI > bestI && wI >= levels.length - 2) {
      parts.push(pick([`${weak.name} 면에서 꾸준히 연습하면 더욱 성장할 것으로 기대됨.`, `${weak.name}에서도 자신감을 기르도록 격려함.`], seed));
    }
  } else {
    const base = d.rubric?.[sc.level];
    if (base) parts.push(toRecordStyle(`${topic}${base}`));
    parts.push(...joinChips(sc.good));
    if (sc.evidence) parts.push(endDot(sc.evidence));
    if (sc.note) parts.push(endDot(sc.note));
    if (sc.need?.[0]) parts.push(`앞으로 ${josa(sc.need[0])} 더해 가면 더 큰 성장이 기대됨.`);
  }
  return parts.filter(Boolean).join(' ');
}

// ---------- AI 브리지: 결과 읽기 ----------

// "S01 | 문장" 줄 또는 JSON([{id,text}] / {"S01":"…"}) → Map(id → 문장)
export function parseAiRemarks(text) {
  const out = new Map();
  const s = String(text || '').trim();
  const json = s.match(/[[{][\s\S]*[\]}]/);
  if (json) {
    try {
      const v = JSON.parse(json[0]);
      if (Array.isArray(v)) for (const x of v) { if (x && (x.id || x.번호) && (x.text || x.문장 || x.content)) out.set(String(x.id || x.번호).toUpperCase(), String(x.text || x.문장 || x.content).trim()); }
      else for (const [k, t] of Object.entries(v)) if (/^S\d+$/i.test(k)) out.set(k.toUpperCase(), String(t).trim());
      if (out.size) return out;
    } catch { /* 줄 형식으로 */ }
  }
  for (const line of s.split('\n')) {
    const m = line.replace(/^[\s*>\-|]+/, '').match(/^\[?(S\d{1,3})\]?\s*[|:：)\].\-–]\s*(.+)$/i);
    if (m) out.set(m[1].toUpperCase(), m[2].replace(/\s*\|\s*$/, '').trim());
  }
  return out;
}

// AI 루브릭 답(JSON) → { criteria: [{name, rubric}], good, need }
export function parseAiRubric(text, levels) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let v; try { v = JSON.parse(m[0]); } catch { return null; }
  const crit = (v.criteria || v.관점 || []).map((c) => {
    const lvMap = c.levels || c.rubric || c.수준 || {};
    const rubric = Array.isArray(lvMap) ? Object.fromEntries(levels.map((lv, i) => [lv, String(lvMap[i] || '')])) : Object.fromEntries(levels.map((lv) => [lv, String(lvMap[lv] ?? lvMap[lv.replace(/\s/g, '')] ?? '')]));
    return { name: String(c.name || c.이름 || '').trim(), rubric };
  }).filter((c) => c.name);
  return crit.length ? { criteria: crit, good: (v.good || v.강점 || []).map(String), need: (v.need || v.보완 || []).map(String) } : null;
}
