// 계정·학교: 학교 가입(초대 코드·학교 찾기) · 새 학교 개설 · 플랫폼 운영(학교 승인) · 내 정보
import { h, api, clear, toast, confirmBox } from '../ui.js';
import { state, remember } from '../state.js';
import { APP_NAME, DESK_NAME, ROLES } from '../modules.js';
import { pushState, enablePush, disablePush, pushSupported } from './inbox.js';
import { MODES, myTheme, setMyTheme, swatches } from '../theme.js';

const STATUS = { pending: '승인 대기', active: '사용 중', closed: '중지' };

function mySchools(refresh) {
  if (!state.schools.length) return null;
  return h('section', { class: 'card' }, h('h3', {}, '내 학교'),
    h('ul', { class: 'list' }, state.schools.map((s) => h('li', {},
      h('strong', {}, s.name), ' ',
      s.status !== 'active' ? h('span', { class: 'tag warn' }, `학교 ${STATUS[s.status]}`) : h('span', { class: `tag ${s.role === 'pending' ? 'warn' : 'ghost'}` }, ROLES[s.role] || s.role),
      s.status === 'pending' ? h('span', { class: 'muted small' }, ' 플랫폼 운영자가 승인하면 사용할 수 있습니다.') : null,
      s.role === 'pending' && s.status === 'active' ? h('span', { class: 'muted small' }, ' 학교 관리자가 승인하면 사용할 수 있습니다.') : null,
      h('button', { class: 'link-btn danger', onclick: async () => {
        if (!(await confirmBox(`${s.name}에서 나갈까요?`))) return;
        try { await api(`/api/schools/${s.id}/membership`, { method: 'DELETE' }); toast('나갔습니다.'); refresh(); } catch (e) { toast(e.message, 'error'); }
      } }, s.role === 'pending' ? '요청 취소' : '나가기')))),
    h('p', { class: 'hint' }, '승인 상태가 바뀌었는지 보려면 새로고침하세요.'),
    h('button', { class: 'btn small', onclick: () => refresh() }, '새로고침'));
}

export async function joinView(root, refresh) {
  const out = h('div', {});
  const myNameInput = () => h('input', { name: 'name', placeholder: '학교에서 쓰는 내 이름 (실명)', value: state.me.accountName || '', required: true });

  // 초대 링크로 들어온 경우 바로 요청
  const invite = remember('invite');
  if (invite) {
    remember('invite', null);
    try {
      const r = await api('/api/schools/join', { method: 'POST', body: { code: invite } });
      toast(`${r.school.name}에 가입을 요청했습니다.`);
      return refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  const join = async (body) => {
    try {
      const r = await api('/api/schools/join', { method: 'POST', body });
      toast(r.status === 'pending' ? `${r.school.name}에 가입을 요청했습니다. 관리자 승인을 기다려 주세요.` : `${r.school.name}: ${ROLES[r.status] || r.status}`);
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  const results = h('div', {});
  const neisResults = h('div', {});
  let picked = null;
  const createForm = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/api/schools', { method: 'POST', body: { name: f.get('school'), myName: f.get('name'), dept: f.get('dept'), neisCode: picked?.code, neis: picked } });
      toast(r.status === 'active' ? '학교를 만들었습니다.' : '개설을 신청했습니다. 운영자 승인 뒤 사용할 수 있습니다.');
      remember('school', r.id);
      refresh();
    } catch (err) { toast(err.message, 'error'); }
  } },
  h('div', { class: 'row' }, h('label', {}, '학교 찾기 (나이스)'),
    h('div', { class: 'inline-form' },
      h('input', { id: 'neis-q', placeholder: '예: 서부초' }),
      h('button', { type: 'button', class: 'btn', onclick: async () => {
        const q = root.querySelector('#neis-q').value.trim();
        clear(neisResults, h('p', { class: 'muted' }, '검색 중…'));
        try {
          const list = await api(`/api/neis/schools?name=${encodeURIComponent(q)}`);
          clear(neisResults, list.length ? h('ul', { class: 'list' }, list.map((x) => h('li', { class: 'click', onclick: () => {
            picked = x;
            createForm.querySelector('[name=school]').value = x.name;
            clear(neisResults, h('p', { class: 'alert' }, `선택: ${x.name} (${x.office}) — 나이스 학사일정·급식이 자동 연결됩니다.`));
          } }, h('strong', {}, x.name), h('span', { class: 'muted small' }, ` ${x.office || ''} · ${x.address || ''}`)))) : h('p', { class: 'muted' }, '검색 결과가 없습니다.'));
        } catch (err) { clear(neisResults, h('p', { class: 'muted small' }, `나이스 검색을 쓸 수 없습니다(${err.message}). 학교 이름을 직접 입력해도 됩니다.`)); }
      } }, '검색')),
    neisResults),
  h('div', { class: 'row' }, h('label', {}, '학교 이름 *'), h('input', { name: 'school', required: true })),
  h('div', { class: 'row' }, h('label', {}, '내 이름 *'), myNameInput()),
  h('div', { class: 'row' }, h('label', {}, '내 부서'), h('input', { name: 'dept', placeholder: '예: 교무' })),
  h('button', { class: 'btn primary' }, '학교 개설 신청'));

  clear(root,
    h('p', { class: 'alert' }, `🪴 ${DESK_NAME}(내 학급·수업·기록)는 학교 가입 없이 바로 쓸 수 있습니다. `, h('a', { href: '#/desk/home' }, `${DESK_NAME} 열기 →`)),
    mySchools(refresh),
    h('div', { class: 'two-col' },
      h('div', {},
        h('section', { class: 'card' }, h('h3', {}, '🔑 초대 코드로 가입'),
          h('p', { class: 'muted small' }, '학교 관리자에게 받은 초대 링크를 열었거나 코드를 받았다면 입력하세요. 관리자가 승인하면 학교 자료가 보입니다.'),
          h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); const f = new FormData(e.target); join({ code: f.get('code'), name: f.get('name') }); } },
            h('div', { class: 'row' }, h('label', {}, '초대 코드'), h('input', { name: 'code', required: true, placeholder: '예: 3fa9c21b' })),
            h('div', { class: 'row' }, h('label', {}, '내 이름'), myNameInput()),
            h('button', { class: 'btn primary' }, '가입 요청'))),
        h('section', { class: 'card' }, h('h3', {}, '🔎 학교 찾아서 가입'),
          h('form', { class: 'form', onsubmit: async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            const list = await api(`/api/schools/search?q=${encodeURIComponent(f.get('q'))}`);
            clear(results, list.length ? h('ul', { class: 'list' }, list.map((s) => h('li', {}, h('strong', {}, s.name), ' ',
              h('button', { class: 'btn small primary', onclick: () => join({ schoolId: s.id, name: f.get('name') }) }, '가입 요청')))) : h('p', { class: 'muted' }, `${APP_NAME}에 등록된 학교가 없습니다. 오른쪽에서 새로 개설할 수 있습니다.`));
          } },
          h('div', { class: 'row' }, h('label', {}, '학교 이름'), h('input', { name: 'q', required: true, minlength: 2 })),
          h('div', { class: 'row' }, h('label', {}, '내 이름'), myNameInput()),
          h('button', { class: 'btn' }, '찾기')),
          results)),
      h('section', { class: 'card' }, h('h3', {}, '🏫 새 학교 개설'),
        h('p', { class: 'muted small' }, `우리 학교가 아직 ${APP_NAME}에 없을 때 신청합니다. 신청한 선생님이 그 학교의 관리자가 되며, 플랫폼 운영자 승인 뒤 사용할 수 있습니다.`),
        createForm)),
    out);
}

export async function platformView(root) {
  const list = await api('/api/platform/schools');
  const set = async (id, status) => { try { await api(`/api/platform/schools/${id}`, { method: 'PUT', body: { status } }); toast('저장했습니다.'); platformView(root); } catch (e) { toast(e.message, 'error'); } };
  clear(root,
    h('p', { class: 'hint' }, '새 학교 개설 신청을 승인하거나, 사용을 중지합니다. 각 학교의 교직원 승인은 그 학교 관리자가 합니다. (운영자는 학교 자료를 볼 수 없습니다)'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['학교', '상태', '구성원', '기록', '신청자', '만든 날', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((s) => h('tr', { class: s.status === 'pending' ? 'hl' : '' },
        h('td', {}, h('strong', {}, s.name), s.neis_code ? h('div', { class: 'muted small' }, `나이스 ${s.neis_code}`) : null),
        h('td', {}, STATUS[s.status] || s.status), h('td', { class: 'num' }, s.members), h('td', { class: 'num' }, s.records),
        h('td', { class: 'small' }, s.created_by || '-'), h('td', { class: 'small' }, s.created_at),
        h('td', { class: 'nowrap' },
          s.status !== 'active' ? h('button', { class: 'btn small primary', onclick: () => set(s.id, 'active') }, '승인·재개') : null,
          s.status === 'active' ? h('button', { class: 'btn small danger ghost', onclick: async () => { if (await confirmBox(`${s.name} 사용을 중지할까요? (자료는 남습니다)`)) set(s.id, 'closed'); } }, '중지') : null)))))));
}

export async function meView(root, refresh) {
  const pushBox = h('div', {});
  const drawPush = async () => {
    const st = await pushState();
    clear(pushBox,
      st === 'unsupported' ? h('p', { class: 'muted' }, !pushSupported() ? '이 브라우저는 휴대폰 알림을 지원하지 않습니다. 아이폰은 Safari에서 "홈 화면에 추가"한 앱으로 열어야 합니다(iOS 16.4 이상).' : '휴대폰 알림이 아직 설정되지 않았습니다(운영자 설정 필요).') :
      st === 'denied' ? h('p', { class: 'alert warn' }, '이 기기에서 알림이 차단되어 있습니다. 브라우저/휴대폰 설정에서 이 사이트 알림을 허용해 주세요.') :
      h('div', { class: 'row-actions' },
        st === 'on' ? h('span', { class: 'tag' }, '✅ 이 기기에서 알림 받는 중') : null,
        st === 'on' ? h('button', { class: 'btn', onclick: async () => { await disablePush(); drawPush(); } }, '알림 끄기')
          : h('button', { class: 'btn primary', onclick: async () => { try { await enablePush(); } catch (e) { toast(e.message, 'error'); } drawPush(); } }, '이 기기에서 알림 받기'),
        st === 'on' ? h('button', { class: 'btn', onclick: () => api('/api/push/test', { method: 'POST' }).then(() => toast('시험 알림을 보냈습니다.')) }, '시험 알림') : null),
      h('p', { class: 'hint' }, '보결·담당 배정, 전체 공지, 새 수합, 전달사항, 학교 가입 승인 때 알림이 옵니다. 기기마다 따로 켭니다.'));
  };
  drawPush();
  const themeBox = h('div', {});
  const drawTheme = () => {
    const t = myTheme();
    clear(themeBox,
      h('div', { class: 'seg' }, MODES.map(([v, l]) => h('button', { class: (t.mode || 'light') === v ? 'on' : '', onclick: () => { setMyTheme({ mode: v }); drawTheme(); } }, l))),
      h('p', { class: 'muted small', style: { margin: '12px 0 6px' } }, '주 색 (첫 칸 = 학교 기본 색)'),
      swatches(t.accent || '', (id) => { setMyTheme({ accent: id }); drawTheme(); }, { withDefault: true }),
      h('p', { class: 'hint' }, '이 기기에만 적용됩니다. 기본은 밝은 화면입니다.'));
  };
  drawTheme();
  clear(root,
    h('section', { class: 'card' }, h('h3', {}, '🎨 화면 테마'), themeBox),
    h('section', { class: 'card' }, h('h3', {}, '👤 계정'),
      h('p', {}, state.me.email, state.me.super ? h('span', { class: 'tag' }, '플랫폼 운영자') : null),
      h('form', { class: 'inline-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await api('/api/me', { method: 'PUT', body: { name: new FormData(e.target).get('name') } }); toast('저장했습니다.'); refresh(); } catch (err) { toast(err.message, 'error'); }
      } }, h('input', { name: 'name', value: state.me.accountName || '', placeholder: '이름' }), h('button', { class: 'btn' }, '이름 저장')),
      h('p', { class: 'hint' }, '학교 안에서 쓰는 이름(보결·담당 배정에 쓰이는 이름)은 각 학교 관리자가 정합니다.')),
    h('section', { class: 'card' }, h('h3', {}, '📲 휴대폰 알림'), pushBox),
    mySchools(refresh),
    h('p', {}, h('a', { href: '#/join' }, '+ 다른 학교 가입 / 새 학교 개설')));
}
