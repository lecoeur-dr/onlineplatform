// 🧮 계산식: 스프레드시트처럼 "5,000원 × 20명 × 3회", "=12000*4+3000", "(3000+500)×10" 을 계산
//   글자(원·명·회 등)는 무시, ×·x·X·* 곱하기, ÷·/ 나누기, 괄호 지원. eval 을 쓰지 않는 작은 해석기
export function evalFormula(input) {
  let s = String(input ?? '').trim();
  if (!s) return null;
  s = s.replace(/^=/, '').replace(/[×xX✕]/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/[^\d.+\-*/()]/g, '');
  if (!/\d/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('괄호'); i++; return v; }
    if (peek() === '-') { i++; return -num(); }
    const m = s.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) throw new Error('숫자');
    i += m[0].length;
    return Number(m[0]);
  };
  const term = () => { let v = num(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = num(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v);
  } catch { return null; }
}

// 금액 칸: 계산식이 있으면 계산값, 없으면 입력한 금액
export const amountFrom = (formula, amount) => evalFormula(formula) ?? (Number(String(amount ?? '').replace(/[^\d.-]/g, '')) || 0);
