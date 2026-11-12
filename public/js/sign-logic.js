// ✍️ 회의록 전자서명 규칙 (서버·화면·테스트가 같이 씀)
//   회의록 내용(본문 + 위원 명단)의 지문 = 위원이 어떤 내용에 서명했는지 확인하는 값

export const SIGN_FIELDS = ['title', 'datetime', 'place', 'committee', 'agenda', 'result', 'confirmDate', 'school'];
export const COMMITTEES = ['인사자문위원회', '학업성적관리위원회', '교육과정위원회', '학교폭력전담기구', '예산결산소위원회', '기타'];
export const MEMBER_ROLES = ['위원장', '부위원장', '위원', '간사'];
export const MAX_FAILS = 5;            // 위원 비밀번호 5번 틀리면 잠금
export const MAX_SIGNATURE = 60000;    // 서명 이미지 최대 글자 수
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 헷갈리는 0/O, 1/I 제외

const enc = new TextEncoder();
export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

export const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const cleanMultiline = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');

// 지문에 들어가는 내용: 본문 칸 + 위원(순서대로 id·역할·직위·성명)
export function docBody(meeting, members) {
  return JSON.stringify({
    f: SIGN_FIELDS.map((f) => String(meeting[f] ?? '')),
    m: members.slice().sort((a, b) => Number(a.ord) - Number(b.ord)).map((m) => [String(m.memberId), String(m.role || ''), String(m.position || ''), String(m.name || '')]),
  });
}
export const docHash = (meeting, members) => sha256Hex(docBody(meeting, members));

// 6자리 짧은 링크 코드 (겹치지 않게)
export function newCode(used = new Set()) {
  for (;;) {
    const a = crypto.getRandomValues(new Uint8Array(6));
    const code = [...a].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
    if (!used.has(code)) { used.add(code); return code; }
  }
}
// 6자리 숫자 비밀번호
export function newPassword() {
  const a = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(a % 1000000).padStart(6, '0');
}
export const newId = () => toHex(crypto.getRandomValues(new Uint8Array(12)));

// 화면에서 받은 회의록·위원 입력 정리 + 확인
export function checkInput(meeting = {}, members = []) {
  const m = {};
  for (const f of SIGN_FIELDS) m[f] = ['agenda', 'result'].includes(f) ? cleanMultiline(meeting[f]).slice(0, 20000) : clean(meeting[f]).slice(0, 300);
  const list = (members || []).map((x) => ({ memberId: String(x.memberId || ''), role: clean(x.role).slice(0, 30), position: clean(x.position).slice(0, 40), name: clean(x.name).slice(0, 40) }))
    .filter((x) => x.name || x.role || x.position);
  if (!m.title) return { error: '회의록 제목을 입력해 주세요.' };
  if (!list.length) return { error: '위원을 한 명 이상 입력해 주세요.' };
  if (list.some((x) => !x.name)) return { error: '위원 성명을 모두 입력해 주세요.' };
  if (list.length > 40) return { error: '위원은 40명까지 넣을 수 있습니다.' };
  return { meeting: m, members: list.map((x, i) => ({ ...x, ord: i + 1 })) };
}

// 서명 이미지 확인 (PNG/JPEG data URL, 크기 제한)
export function checkSignature(sig) {
  const s = String(sig || '');
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)) return '서명 이미지가 올바르지 않습니다.';
  if (s.length > MAX_SIGNATURE) return '서명 이미지가 너무 큽니다. 다시 서명해 주세요.';
  if (s.length < 800) return '서명이 너무 짧습니다. 이름을 또박또박 써 주세요.';
  return '';
}

// 처리 이력 이름
export const LOG_LABEL = {
  create: '회의록 작성', update: '회의록 수정', 'issue-password': '비밀번호 발급', 'reissue-password': '비밀번호 재발급', 'reset-signature': '서명 초기화',
  login: '위원 접속', 'login-fail': '비밀번호 틀림', sign: '서명·동의', close: '서명 마감', reopen: '서명 다시 열기', 'auto-close': '모두 서명 → 자동 마감',
  'save-pdf': '원본 PDF 등록', purge: '클라우드 데이터 파기',
};
