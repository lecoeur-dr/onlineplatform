// ✍️ 공지·업무 → 회의록 서명: 인사자문위원회 등 회의록을 위원별 링크·6자리 비밀번호로 온라인 서명 받기
//   관리(관리자 + 권한의 '회의록 서명' 담당자): 작성 → 링크·비밀번호 보내기 → 서명 현황 → 원본 PDF(확인값 등록) → 클라우드 파기
//   위원 화면은 /sign (로그인 없음), 위변조 확인은 누구나
import { h, api, clear, toast, modal, confirmBox, fmtDate } from '../ui.js';
import { state, remember, canManageSign } from '../state.js';
import { COMMITTEES, MEMBER_ROLES, LOG_LABEL, sha256Hex } from '../sign-logic.js';

const ui = { view: 'list', id: '' };
const linkOf = (code) => `${location.origin}/sign#k=${code}`;
const STATUS = { open: ['서명 받는 중', 'warn'], closed: ['마감', 'ok'] };
const copy = async (text, msg = '복사했습니다.') => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('복사하지 못했습니다. 길게 눌러 직접 복사해 주세요.', 'error'); } };
const inviteText = (m, x) => `[회의록 서명 요청] ${m.title}\n${x.name} 위원님, 아래 링크에서 회의록을 확인하고 서명해 주세요.\n링크: ${linkOf(x.code)}\n비밀번호: ${x.password}`;
const EXAMPLE = {
  committee: '인사자문위원회', title: '2026학년도 제○회 인사자문위원회 회의록', datetime: '2026. 11. 12.(목) 15:30', place: '교무실',
  agenda: '1. 2027학년도 교원 업무분장(안) 협의\n2. 학년 배정 원칙 협의', result: '1. 업무분장(안)을 원안대로 가결함.\n2. 학년 배정은 희망 순위와 경력을 고려하여 배정하기로 함.',
  members: [{ role: '위원장', position: '교감' }, { role: '위원', position: '부장교사' }, { role: '위원', position: '교사' }, { role: '간사', position: '교사' }],
};

export async function signView(root) {
  const reload = () => signView(root);
  if (!canManageSign()) {
    return clear(root, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '✍️'),
      h('p', {}, '회의록 서명 요청은 담당자(교감 등)가 메신저로 링크와 비밀번호를 보내 드립니다. 받은 링크를 열어 서명해 주세요.'),
      h('p', { class: 'muted small' }, '회의록을 만들고 관리하는 권한은 관리자가 학교 관리 → 권한에서 지정합니다.'),
      h('button', { class: 'btn', onclick: verifyBox }, '🔍 PDF 위변조 확인')));
  }
  if (ui.view === 'edit') return editor(root, reload);
  if (ui.view === 'detail' && ui.id) return detail(root, reload);
  const { meetings, purged } = await api('/api/sign', { fresh: true });
  clear(root,
    h('div', { class: 'toolbar' },
      h('span', { class: 'muted small' }, '위원별 링크·6자리 비밀번호로 휴대폰에서 확인·서명 → 모두 서명하면 자동 마감 → 원본 PDF를 에듀파인에 첨부'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: verifyBox }, '🔍 위변조 확인'),
      h('button', { class: 'btn primary', onclick: () => { ui.view = 'edit'; ui.id = ''; reload(); } }, '+ 새 회의록')),
    meetings.length ? h('div', { class: 'sg-list' }, meetings.map((m) => {
      const [label, cls] = STATUS[m.status] || STATUS.open;
      return h('button', { class: 'sg-card', onclick: () => { ui.view = 'detail'; ui.id = m.id; reload(); } },
        h('div', { class: 'sg-top' }, h('span', { class: 'tag ghost' }, m.committee || '회의'), h('span', { class: `tag ${cls}` }, label), m.pdfs ? h('span', { class: 'tag ok' }, '📄 원본 등록') : null),
        h('strong', {}, m.title), h('span', { class: 'muted small' }, [m.datetime, m.place].filter(Boolean).join(' · ')),
        h('div', { class: 'sg-prog' }, h('i', { style: { width: `${m.total ? (m.signed / m.total) * 100 : 0}%` } })),
        h('span', { class: 'small' }, `서명 ${m.signed}/${m.total}`));
    })) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '✍️'), h('p', {}, '위원회가 끝나면 [+ 새 회의록]에서 일시·장소·위원·안건·회의 결과를 입력하세요. 위원별 링크와 비밀번호가 만들어집니다.')),
    purged.length ? h('details', { class: 'section' }, h('summary', {}, `🗑 파기한 회의록 ${purged.length}건 (위변조 확인 기록만 남음)`),
      h('ul', { class: 'list' }, purged.map((x) => h('li', {}, h('strong', {}, x.title), h('span', { class: 'muted small' }, ` · ${x.confirm_date || ''} · 원본 PDF ${x.n}건`))))) : null,
    h('p', { class: 'hint' }, '「전자서명법」상 당사자가 동의한 전자서명은 효력이 인정되지만, 자필 서명 원본이 꼭 필요한 문서인지는 소속 교육청 지침을 확인해 주세요. 서명 이미지는 서버에 암호화해 저장하고, 에듀파인 등록 뒤 [클라우드 데이터 파기]로 지울 수 있습니다.'));
}

// ---------- 작성·수정 ----------
async function editor(root, reload) {
  let meeting = { committee: '인사자문위원회', school: state.settings?.schoolName || '' };
  let members = [{ role: '위원장', position: '', name: '' }, { role: '위원', position: '', name: '' }];
  if (ui.id) { const d = await api(`/api/sign/${ui.id}`, { fresh: true }); meeting = d.meeting; members = d.members.map((x) => ({ memberId: x.memberId, role: x.role, position: x.position, name: x.name, signedAt: x.signedAt })); }
  const inputs = {};
  const field = (key, label, el) => { inputs[key] = el; el.value = meeting[key] || ''; return h('label', {}, h('span', {}, label), el); };
  const staffNames = (state.staff || []).map((s) => s.name).filter(Boolean);
  const box = h('div', { class: 'sg-members' });
  const drawMembers = () => clear(box, members.map((x, i) => h('div', { class: 'sg-mrow' },
    h('span', { class: 'sg-ord' }, i + 1),
    h('select', { onchange: (e) => { x.role = e.target.value; } }, [...new Set([...MEMBER_ROLES, x.role].filter(Boolean))].map((r) => h('option', { value: r, selected: r === x.role }, r))),
    h('input', { placeholder: '직위 (예: 교감, 교사)', value: x.position || '', oninput: (e) => { x.position = e.target.value; } }),
    h('input', { placeholder: '성명', list: 'sg-staff', value: x.name || '', oninput: (e) => { x.name = e.target.value; } }),
    x.signedAt ? h('span', { class: 'tag ok', title: x.signedAt }, '서명함') : null,
    h('span', { class: 'sg-mbtn' },
      h('button', { class: 'icon-btn', title: '위로', disabled: i === 0, onclick: () => { [members[i - 1], members[i]] = [members[i], members[i - 1]]; drawMembers(); } }, '↑'),
      h('button', { class: 'icon-btn', title: '아래로', disabled: i === members.length - 1, onclick: () => { [members[i + 1], members[i]] = [members[i], members[i + 1]]; drawMembers(); } }, '↓'),
      h('button', { class: 'icon-btn danger', title: '빼기', onclick: () => { members.splice(i, 1); drawMembers(); } }, '✕')))),
  h('datalist', { id: 'sg-staff' }, staffNames.map((n) => h('option', { value: n }))));
  drawMembers();
  const fill = (src) => { for (const k of Object.keys(inputs)) if (src[k] !== undefined) inputs[k].value = src[k]; };
  const loadPrev = async () => {
    const { meetings } = await api('/api/sign', { fresh: true });
    if (!meetings.length) { toast('불러올 회의록이 없습니다.', 'error'); return; }
    const close = modal('기존 회의록 불러오기', h('div', { class: 'pick-grid' }, meetings.map((m) => h('button', { class: 'btn', onclick: async () => {
      const d = await api(`/api/sign/${m.id}`, { fresh: true });
      fill({ ...d.meeting, title: d.meeting.title, confirmDate: '' });
      members = d.members.map((x) => ({ role: x.role, position: x.position, name: x.name })); // 새 위원으로 (새 비밀번호)
      drawMembers(); close(); toast('불러왔습니다. 일시·안건·결과를 고쳐 주세요.');
    } }, `${m.title} (${m.datetime || ''})`))));
  };
  const save = async (confirmReset = false) => {
    const m = { id: ui.id || undefined };
    for (const [k, el] of Object.entries(inputs)) m[k] = el.value;
    try {
      const r = await api('/api/sign', { method: 'POST', body: { meeting: m, members, confirmReset } });
      ui.id = r.id; ui.view = 'detail';
      if (r.reset) toast('내용이 바뀌어 서명을 모두 초기화했습니다. 위원들께 다시 서명을 요청해 주세요.');
      reload();
      if (r.issued.length) issuedBox({ ...m, id: r.id }, r.issued);
    } catch (e) {
      if (/이미 \d+명이 서명/.test(e.message) && (await confirmBox(`${e.message}\n그래도 저장할까요?`))) { save(true); return; }
      toast(e.message, 'error');
    }
  };
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn small', onclick: () => { ui.view = ui.id ? 'detail' : 'list'; reload(); } }, '← 돌아가기'),
      h('strong', {}, ui.id ? '회의록 고치기' : '새 회의록'),
      h('span', { class: 'grow' }),
      !ui.id ? h('button', { class: 'btn small', onclick: loadPrev }, '📂 기존 회의록 불러오기') : null,
      !ui.id ? h('button', { class: 'btn small', onclick: () => { fill(EXAMPLE); members = EXAMPLE.members.map((x) => ({ ...x, name: '' })); drawMembers(); } }, '예시 불러오기') : null),
    h('div', { class: 'form sg-form' },
      h('div', { class: 'grid-2' },
        field('committee', '위원회', h('input', { list: 'sg-committees', placeholder: '인사자문위원회' })),
        field('title', '회의록 제목 *', h('input', { placeholder: '2026학년도 제3회 인사자문위원회 회의록' })),
        field('datetime', '일시', h('input', { placeholder: '2026. 11. 12.(목) 15:30' })),
        field('place', '장소', h('input', { placeholder: '교무실' }))),
      h('datalist', { id: 'sg-committees' }, COMMITTEES.map((c) => h('option', { value: c }))),
      field('agenda', '안건', h('textarea', { rows: 4, placeholder: '1. ...\n2. ...' })),
      field('result', '회의 결과', h('textarea', { rows: 6, placeholder: '1. 원안대로 가결함.\n2. ...' })),
      h('div', { class: 'grid-2' },
        field('confirmDate', '회의록 확정일', h('input', { placeholder: '2026. 11. 12.' })),
        field('school', '학교명', h('input', {}))),
      h('h4', {}, '참석 위원 (서명 순서)'), box,
      h('button', { class: 'btn small', onclick: () => { members.push({ role: '위원', position: '', name: '' }); drawMembers(); } }, '+ 위원 추가'),
      h('p', { class: 'muted small' }, '저장하면 새 위원마다 링크와 6자리 비밀번호가 만들어집니다(비밀번호는 저장 직후 한 번만 보입니다). 서명이 있는 회의록의 내용을 고치면 서명이 모두 초기화됩니다.')),
    h('div', { class: 'row-actions' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => save() }, ui.id ? '저장' : '저장하고 링크 만들기')));
}

// 새로 발급한 링크·비밀번호 (이때만 보임)
function issuedBox(m, issued) {
  const all = issued.map((x) => inviteText(m, x)).join('\n\n');
  modal('🔑 위원별 링크·비밀번호', h('div', { class: 'form' },
    h('p', { class: 'alert warn' }, '비밀번호는 지금만 확인할 수 있습니다. 위원마다 [복사]해서 메신저로 보내 주세요. 잃어버리면 [비밀번호 재발급]을 누르면 됩니다.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' },
      h('thead', {}, h('tr', {}, ['위원', '링크', '비밀번호', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, issued.map((x) => h('tr', {}, h('td', {}, h('strong', {}, x.name)), h('td', { class: 'small' }, h('code', {}, linkOf(x.code))), h('td', {}, h('b', { class: 'sg-pw' }, x.password)),
        h('td', {}, h('button', { class: 'btn small primary', onclick: () => copy(inviteText(m, x), `${x.name} 위원 안내문을 복사했습니다.`) }, '복사')))))))),
  [(close) => h('button', { class: 'btn', onclick: () => copy(all, '모든 위원 안내문을 복사했습니다.') }, '전체 복사'), (close) => h('button', { class: 'btn primary', onclick: close }, '확인')], { wide: true });
}

// ---------- 회의록 보기·관리 ----------
async function detail(root, reload) {
  const d = await api(`/api/sign/${ui.id}`, { fresh: true }).catch((e) => { toast(e.message, 'error'); ui.view = 'list'; return null; });
  if (!d) return reload();
  const m = d.meeting; const open = m.status === 'open';
  const signed = d.members.filter((x) => x.signedAt).length;
  const act = async (path, body, msg) => { try { const r = await api(`/api/sign/${m.id}${path}`, { method: 'POST', body }); if (msg) toast(msg); reload(); return r; } catch (e) { toast(e.message, 'error'); return null; } };
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn small', onclick: () => { ui.view = 'list'; reload(); } }, '← 목록'),
      h('span', { class: `tag ${(STATUS[m.status] || STATUS.open)[1]}` }, (STATUS[m.status] || STATUS.open)[0]),
      h('strong', {}, `서명 ${signed}/${d.members.length}`),
      h('span', { class: 'grow' }),
      open ? h('button', { class: 'btn small', onclick: () => { ui.view = 'edit'; reload(); } }, '✎ 고치기') : null,
      open ? h('button', { class: 'btn small', onclick: async () => { if (signed < d.members.length && !(await confirmBox(`아직 ${d.members.length - signed}명이 서명하지 않았습니다. 그래도 마감할까요? (부재 위원은 수기 서명 등으로 처리)`))) return; act('/status', { status: 'closed' }, '마감했습니다.'); } }, '🔒 서명 마감')
        : h('button', { class: 'btn small', onclick: () => act('/status', { status: 'open' }, '서명을 다시 열었습니다.') }, '🔓 서명 다시 열기'),
      h('button', { class: 'btn small primary', onclick: () => pdfBox(d, reload) }, '📄 원본 PDF 만들기'),
      !open ? h('button', { class: 'btn small sg-purge', onclick: () => purgeBox(d, reload) }, '🔥 클라우드 데이터 파기') : null,
      h('button', { class: 'btn small danger ghost', onclick: async () => { if (!(await confirmBox(`'${m.title}' 회의록을 지울까요? 위원 서명과 이력도 함께 지워집니다.`))) return; try { await api(`/api/sign/${m.id}`, { method: 'DELETE' }); ui.view = 'list'; reload(); } catch (e) { toast(e.message, 'error'); } } }, '삭제')),
    h('div', { class: 'sg-detail' },
      h('section', { class: 'sg-doc-wrap' }, minutesDoc(d, { preview: true })),
      h('section', {},
        h('h4', {}, '위원 서명 현황'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table compact sg-mt' },
          h('thead', {}, h('tr', {}, ['', '위원', '서명', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.members.map((x, i) => h('tr', { class: x.signedAt ? 'done' : '' },
            h('td', {}, i + 1),
            h('td', {}, h('strong', {}, x.name), h('div', { class: 'muted small' }, [x.role, x.position].filter(Boolean).join(' · ')), x.locked ? h('span', { class: 'tag danger' }, '잠김') : null),
            h('td', {}, x.signedAt ? [h('img', { class: 'sg-sigthumb', src: x.signature, alt: `${x.name} 서명` }), h('div', { class: 'muted small' }, x.signedAt.slice(5, 16))] : h('span', { class: 'muted' }, '대기')),
            h('td', {}, h('div', { class: 'sg-acts' },
              h('button', { class: 'link-btn small', onclick: () => copy(linkOf(x.code), `${x.name} 위원 링크를 복사했습니다. (비밀번호는 재발급해야 다시 볼 수 있어요)`) }, '링크'),
              h('button', { class: 'link-btn small', onclick: async () => { if (!(await confirmBox(`${x.name} 위원의 비밀번호를 새로 만들까요? 예전 비밀번호는 쓸 수 없게 됩니다.`))) return; const r = await act('/reissue', { memberId: x.memberId }); if (r) issuedBox(m, [r]); } }, '비밀번호 재발급'),
              x.signedAt && open ? h('button', { class: 'link-btn small danger', onclick: async () => { if (await confirmBox(`${x.name} 위원의 서명을 지울까요?`)) act('/reset', { memberId: x.memberId }, '서명을 초기화했습니다.'); } }, '서명 초기화') : null))))))),
        d.pdfs.length ? h('div', { class: 'sg-pdfs' }, h('h4', {}, '📄 등록한 원본 PDF'), d.pdfs.map((p) => h('div', { class: 'small' }, h('strong', {}, p.name), h('span', { class: 'muted' }, ` · ${p.created_at.slice(0, 16)} · 확인값 ${p.sha256.slice(0, 16)}…`)))) : null,
        h('details', { class: 'sg-log' }, h('summary', {}, `처리 이력 ${d.logs.length}건`),
          h('ul', { class: 'list' }, d.logs.slice().reverse().map((l) => h('li', { class: 'small' }, h('span', { class: 'muted' }, l.at.slice(5, 16)), ' ', h('strong', {}, LOG_LABEL[l.action] || l.action), l.detail ? h('span', { class: 'muted' }, ` · ${l.detail}`) : null)))),
        h('p', { class: 'muted small' }, `문서확인값 ${d.docHash.slice(0, 24)}… — 위원이 서명할 때의 회의록 지문입니다. 내용을 고치면 바뀝니다.`))));
}

// 회의록 문서 (화면 미리보기·PDF 공통)
function minutesDoc(d, { preview = false } = {}) {
  const m = d.meeting;
  const pre = (t) => h('div', { class: 'sg-pre' }, t || '');
  return h('div', { class: `sg-doc ${preview ? 'preview' : ''}` },
    h('h1', {}, m.title),
    h('table', { class: 'sg-tbl' }, h('tbody', {},
      h('tr', {}, h('th', {}, '일 시'), h('td', {}, m.datetime || ''), h('th', {}, '장 소'), h('td', {}, m.place || '')),
      h('tr', {}, h('th', {}, '참석 위원'), h('td', { colspan: 3 }, d.members.map((x) => `${x.name}(${x.role || '위원'})`).join(', '))),
      h('tr', {}, h('th', {}, '안 건'), h('td', { colspan: 3 }, pre(m.agenda))),
      h('tr', {}, h('th', {}, '회의 결과'), h('td', { colspan: 3 }, pre(m.result))))),
    h('p', { class: 'sg-confirm' }, '위와 같이 회의록을 확정합니다.'),
    h('p', { class: 'sg-date' }, m.confirmDate || ''),
    h('table', { class: 'sg-tbl sg-signs' },
      h('thead', {}, h('tr', {}, ['구분', '직위', '성명', '서명'].map((t) => h('th', {}, t)))),
      h('tbody', {}, d.members.map((x) => h('tr', {}, h('td', {}, x.role || '위원'), h('td', {}, x.position || ''), h('td', {}, x.name), h('td', { class: 'sg-sigcell' }, x.signature ? h('img', { src: x.signature, alt: '' }) : h('span', { class: 'muted' }, preview ? '(서명 전)' : '')))))),
    h('p', { class: 'sg-school' }, m.school || ''));
}
// 전자서명 확인 내역 (PDF 둘째 장)
function proofDoc(d) {
  const m = d.meeting;
  return h('div', { class: 'sg-doc' },
    h('h2', {}, '전자서명 확인 내역'),
    h('p', { class: 'small' }, `회의록: ${m.title} · 학교: ${m.school || ''} · 확정일: ${m.confirmDate || ''}`),
    h('table', { class: 'sg-tbl sg-proof' },
      h('thead', {}, h('tr', {}, ['위원', '서명 시각', '접속 기기', '서명한 문서확인값'].map((t) => h('th', {}, t)))),
      h('tbody', {}, d.members.map((x) => h('tr', {}, h('td', {}, `${x.name} (${x.role || '위원'})`), h('td', {}, x.signedAt || '서명 안 함'), h('td', { class: 'small' }, x.device || ''), h('td', { class: 'mono small' }, x.docHash ? `${x.docHash.slice(0, 20)}…` : ''))))),
    h('p', { class: 'small' }, `현재 문서확인값(SHA-256): `, h('span', { class: 'mono' }, d.docHash)),
    h('p', { class: 'small' }, '각 위원은 링크와 개인 비밀번호로 접속해 회의록 내용을 확인하고, 「내용 확인·동의」와 「전자서명 사용 동의」에 체크한 뒤 서명했습니다. 서명한 문서확인값이 현재 문서확인값과 같으면 서명 뒤 내용이 바뀌지 않았다는 뜻입니다.'),
    h('h3', {}, '처리 이력'),
    h('table', { class: 'sg-tbl sg-proof' }, h('tbody', {}, d.logs.filter((l) => !['login-fail'].includes(l.action)).map((l) => h('tr', {}, h('td', { class: 'nowrap small' }, l.at), h('td', { class: 'small' }, LOG_LABEL[l.action] || l.action), h('td', { class: 'small' }, l.detail || ''))))),
    h('p', { class: 'small muted' }, `이 PDF는 OnlinePlatform 회의록 전자서명에서 만들었습니다. 위변조 확인: ${location.origin}/sign#verify`));
}

// ---------- 원본 PDF: 브라우저에서 만들고 확인값(SHA-256)만 서버에 등록 ----------
const loadScript = (src) => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) { res(); return; } const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('PDF 만들기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.')); document.head.append(s); });
async function makePdf(d) {
  await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  const stage = h('div', { class: 'sg-stage' }, h('div', { class: 'sg-page' }, minutesDoc(d)), h('div', { class: 'sg-page' }, proofDoc(d)));
  document.body.append(stage);
  try {
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const pages = [...stage.querySelectorAll('.sg-page')];
    for (let i = 0; i < pages.length; i++) {
      const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const W = 210; const pageH = 297; const imgH = (canvas.height * W) / canvas.width;
      // 한 장보다 길면 잘라서 여러 장으로
      let y = 0; let first = true;
      while (y < imgH - 0.5) {
        if (i > 0 || !first) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, -y, W, imgH);
        y += pageH; first = false;
      }
    }
    pdf.setProperties({ title: d.meeting.title, subject: '회의록 전자서명', creator: 'OnlinePlatform' });
    return pdf.output('blob');
  } finally { stage.remove(); }
}
function pdfBox(d, reload) {
  const m = d.meeting;
  const left = d.members.filter((x) => !x.signedAt).length;
  const name = `${m.title || '회의록'}_${String(m.confirmDate || '').replace(/[.\s]+$/, '').replace(/\s+/g, '') || new Date().toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
  const status = h('p', { class: 'muted small' });
  const go = async (btn) => {
    btn.disabled = true; status.textContent = 'PDF를 만드는 중… (몇 초 걸립니다)';
    try {
      const blob = await makePdf(d);
      const sha = await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
      await api(`/api/sign/${m.id}/pdf`, { method: 'POST', body: { sha256: sha, name } });
      const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
      status.textContent = `✅ 내려받고 원본으로 등록했습니다. 파일 확인값 ${sha.slice(0, 16)}…`;
      toast('원본 PDF를 내려받았습니다. 에듀파인 내부결재에 첨부하세요.');
    } catch (e) { status.textContent = ''; toast(e.message, 'error'); btn.disabled = false; return; }
    btn.disabled = false;
  };
  modal('📄 원본 PDF 만들기', h('div', { class: 'form' },
    left ? h('p', { class: 'alert warn' }, `아직 ${left}명이 서명하지 않았습니다. 서명 칸이 빈 채로 만들어집니다.`) : null,
    h('ol', { class: 'small' },
      h('li', {}, '[PDF 내려받기·원본 등록]을 누르면 회의록 + 전자서명 확인 내역 PDF가 내려받아지고, 파일 확인값이 원본으로 등록됩니다.'),
      h('li', {}, '내려받은 PDF를 에듀파인 내부결재에 첨부하세요. 그 파일이 공식 원본입니다.'),
      h('li', {}, '나중에 위변조 확인에서 이 파일을 올리면 원본과 같은지 확인됩니다. (인쇄 창의 「PDF로 저장」으로 만든 파일은 확인값이 없어 확인되지 않습니다)')),
    status), [(close) => h('button', { class: 'btn', onclick: close }, '닫기'), () => { const b = h('button', { class: 'btn primary' }, 'PDF 내려받기·원본 등록'); b.onclick = () => go(b); return b; }]);
}

// 클라우드 데이터 파기: PC 저장·에듀파인 등록 두 칸 확인 뒤
function purgeBox(d, reload) {
  const c1 = h('input', { type: 'checkbox' }); const c2 = h('input', { type: 'checkbox' });
  modal('🔥 클라우드 데이터 파기', h('div', { class: 'form' },
    h('p', {}, '회의록 내용, 위원 명단·비밀번호, 서명 이미지, 처리 이력을 서버에서 지웁니다. 위변조 확인 기록(파일 확인값·제목·날짜·서명자 이름과 시각)만 남아, 보관한 PDF가 원본인지 계속 확인할 수 있습니다.'),
    d.pdfs.length ? null : h('p', { class: 'alert warn' }, '아직 원본 PDF를 등록하지 않았습니다. 먼저 [📄 원본 PDF 만들기]를 해 주세요.'),
    h('label', { class: 'inline' }, c1, ' 원본 PDF를 PC에 내려받았습니다.'),
    h('label', { class: 'inline' }, c2, ' 에듀파인 내부결재에 등록했습니다.'),
    h('p', { class: 'muted small' }, '되돌릴 수 없습니다.')), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn danger', onclick: async () => {
      if (!c1.checked || !c2.checked) { toast('두 칸을 모두 확인해 주세요.', 'error'); return; }
      try { const r = await api(`/api/sign/${d.meeting.id}/purge`, { method: 'POST' }); close(); toast(`파기했습니다. 위변조 확인 기록 ${r.kept}건은 남겨 두었습니다.`); ui.view = 'list'; reload(); } catch (e) { toast(e.message, 'error'); }
    } }, '파기'),
  ]);
}

// 위변조 확인: PDF를 고르면 이 브라우저에서 확인값을 계산해 원본 기록과 비교 (파일은 서버로 보내지 않음)
export function verifyBox() {
  const out = h('div', {});
  const file = h('input', { type: 'file', accept: 'application/pdf,.pdf', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    clear(out, h('p', { class: 'muted' }, '확인하는 중…'));
    try {
      const sha = await sha256Hex(new Uint8Array(await f.arrayBuffer()));
      const r = await fetch(`/pub/sign-verify/${sha}`).then((x) => x.json());
      clear(out, r.match
        ? h('div', { class: 'alert ok' }, h('strong', {}, `✅ 원본과 일치합니다${r.purged ? ' · 클라우드 데이터 파기됨' : ''}`),
          h('div', { class: 'small' }, `${r.title} · ${r.school || ''} · 확정일 ${r.confirmDate || ''} · 원본 등록 ${String(r.createdAt).slice(0, 16)}`),
          h('div', { class: 'small' }, `서명: ${(r.signers || []).map((s) => `${s.name}${s.signedAt ? `(${String(s.signedAt).slice(5, 16)})` : '(미서명)'}`).join(', ')}`))
        : h('div', { class: 'alert error' }, h('strong', {}, '❌ 등록된 원본과 다릅니다'), h('div', { class: 'small' }, '파일이 바뀌었거나, 인쇄 창의 「PDF로 저장」처럼 원본 등록 없이 만든 파일입니다.')),
        h('p', { class: 'muted small mono' }, `파일 확인값 ${sha}`));
    } catch (er) { clear(out, h('p', { class: 'alert error' }, er.message)); }
  } });
  modal('🔍 PDF 위변조 확인', h('div', { class: 'form' }, h('p', { class: 'muted small' }, '보관한 회의록 PDF를 고르세요. 파일은 서버로 보내지 않고, 이 기기에서 계산한 확인값만 비교합니다.'), file, out), [(close) => h('button', { class: 'btn', onclick: close }, '닫기')]);
}
