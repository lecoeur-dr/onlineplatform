// 🪄 학교 관리 → 새 학기 가져오기: 한글(HWPX)·엑셀·붙여넣기로 학사일정·업무분장 한 번에
import { h, api, clear, toast, fmtDate } from '../ui.js';
import { state } from '../state.js';
import { EVENT_CATEGORIES } from '../modules.js';
import { readSource, readText, parseSchedule, parseRoster } from '../smart-import.js';

export async function smartTab(root, refreshApp) {
  let kind = 'schedule';
  let src = null;
  let items = [];
  const out = h('div', {});
  const ta = h('textarea', { rows: 7, placeholder: '한글·엑셀에서 표를 복사해 여기에 붙여넣거나, 한 줄에 하나씩 적어도 됩니다.\n예) 3. 2.(월) 입학식\n    7월 24일 ~ 8월 18일 여름방학' });
  const fileIn = h('input', { type: 'file', accept: '.hwpx,.hwp,.xlsx,.xls,.csv,.txt' });

  const recognize = async () => {
    try {
      src = fileIn.files[0] ? await readSource(fileIn.files[0]) : readText(ta.value);
      if (fileIn.files[0] && ta.value.trim()) { const extra = readText(ta.value); src.tables.push(...extra.tables); src.lines.push(...extra.lines); }
      items = kind === 'schedule' ? parseSchedule(src, state.year) : parseRoster(src);
      items.forEach((it) => { it._on = true; });
      draw();
    } catch (e) { clear(out, h('p', { class: 'alert error' }, e.message)); }
  };

  const cell = (it, key, type = 'text', opts) => {
    if (opts) return h('td', {}, h('select', { onchange: (e) => { it[key] = e.target.value; } }, opts.map((o) => h('option', { value: o, selected: o === it[key] }, o))));
    return h('td', {}, h(type === 'textarea' ? 'textarea' : 'input', { type: type === 'textarea' ? undefined : type, rows: type === 'textarea' ? 2 : undefined, value: it[key] || '', oninput: (e) => { it[key] = e.target.value; } }));
  };

  const draw = () => {
    if (!src) return clear(out);
    if (!items.length) {
      return clear(out, h('div', { class: 'alert warn' }, kind === 'schedule'
        ? '날짜와 행사를 찾지 못했습니다. 날짜(예: 3. 2. / 3월 2일)와 행사명이 같은 줄에 있는지 확인해 주세요.'
        : '업무분장표의 머리글(성명·부서·담당 업무 등)을 찾지 못했습니다. 표 첫 줄에 머리글이 있는지 확인해 주세요.'),
      h('p', { class: 'muted small' }, `읽은 표 ${src.tables.length}개 · 줄글 ${src.lines.length}줄`));
    }
    const head = kind === 'schedule' ? ['', '날짜', '종료일', '행사', '분류'] : ['', '이름', '직위', '부서', '담임', '담당 업무', '내선'];
    const replace = h('input', { type: 'checkbox', checked: kind === 'roster' });
    const addLists = h('input', { type: 'checkbox', checked: true });
    clear(out,
      h('div', { class: 'toolbar' },
        h('strong', {}, `인식 ${items.length}건`),
        h('button', { class: 'btn small', onclick: () => { items.forEach((x) => { x._on = true; }); draw(); } }, '모두 선택'),
        h('button', { class: 'btn small', onclick: () => { items.forEach((x) => { x._on = false; }); draw(); } }, '모두 해제'),
        h('span', { class: 'grow' }),
        h('label', { class: 'inline' }, replace, kind === 'schedule' ? ` ${state.year}학년도 학사일정을 지우고 바꾸기 (나이스 일정은 유지)` : ` ${state.year}학년도 업무분장을 지우고 바꾸기`),
        kind === 'roster' ? h('label', { class: 'inline' }, addLists, ' 부서·학급 목록에도 추가') : null,
        h('button', { class: 'btn primary', onclick: () => save(replace.checked, addLists.checked) }, '선택한 항목 저장')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table compact smart-preview' },
        h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))),
        h('tbody', {}, items.map((it) => h('tr', { class: it._on ? '' : 'off' },
          h('td', {}, h('input', { type: 'checkbox', checked: it._on, onchange: (e) => { it._on = e.target.checked; e.target.closest('tr').classList.toggle('off', !it._on); } })),
          ...(kind === 'schedule'
            ? [cell(it, 'date', 'date'), cell(it, 'endDate', 'date'), cell(it, 'title'), cell(it, 'category', 'text', EVENT_CATEGORIES)]
            : [cell(it, 'name'), cell(it, 'position'), cell(it, 'dept'), cell(it, 'homeroom'), cell(it, 'duties', 'textarea'), cell(it, 'phone')])))))),
      h('p', { class: 'hint' }, kind === 'schedule'
        ? `날짜는 ${state.year}학년도(3월~다음 해 2월) 기준으로 읽었습니다. 칸을 눌러 바로 고칠 수 있고, 빼고 싶은 줄은 체크를 해제하세요.`
        : '저장하면 학교 정보 → 업무분장에 들어가고, 이름은 보결·담당 배정 등의 교직원 드롭다운에 바로 나옵니다 (가입 전이어도).'));
  };

  const save = async (replace, addLists) => {
    const chosen = items.filter((x) => x._on);
    if (!chosen.length) { toast('저장할 항목을 선택해 주세요.', 'error'); return; }
    const module = kind === 'schedule' ? 'events' : 'assignments';
    const strip = ({ _on, ...rest }) => Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== ''));
    try {
      const r = await api('/api/admin/import', { method: 'POST', body: { year: state.year, mode: replace ? 'replace' : 'append', items: chosen.map((x) => ({ module, data: strip(x) })) } });
      if (kind === 'roster' && addLists) {
        const lists = JSON.parse(JSON.stringify(state.settings.lists));
        const merge = (key, vals) => { lists[key] = [...new Set([...(lists[key] || []), ...vals.filter(Boolean)])]; };
        merge('depts', chosen.map((x) => x.dept));
        merge('classes', chosen.map((x) => x.homeroom).filter((c) => /^\d-\d+$/.test(c)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })));
        await api('/api/admin/settings', { method: 'PUT', body: { lists } });
      }
      toast(`${r.inserted}건을 저장했습니다.`);
      clear(out, h('div', { class: 'alert' }, `✅ ${r.inserted}건 저장 완료. `, h('a', { href: kind === 'schedule' ? '#/schedule/overview' : '#/info/assignments' }, kind === 'schedule' ? '학사일정 달력에서 보기 →' : '업무분장 보기 →')));
      src = null; items = [];
      if (kind === 'roster') refreshApp?.();
    } catch (e) { toast(e.message, 'error'); }
  };

  const kindSeg = () => h('div', { class: 'seg' }, [['schedule', '📅 학사일정'], ['roster', '🧩 업무분장표']].map(([v, l]) => h('button', { class: kind === v ? 'on' : '', onclick: () => { kind = v; src = null; items = []; render(); } }, l)));
  const render = () => clear(root,
    h('section', { class: 'card' },
      h('h3', {}, '🪄 새 학기 자료 가져오기'),
      h('p', { class: 'muted small' }, '학교에서 만든 학사일정표·업무분장표 파일을 올리면 날짜·행사, 이름·부서·담당 업무를 자동으로 찾아 넣습니다. 파일은 이 브라우저 안에서만 읽고 서버로 보내지 않습니다.'),
      kindSeg(),
      h('div', { class: 'smart-in' },
        h('div', { class: 'row' }, h('label', {}, '파일 (한글 HWPX · 엑셀 · CSV)'), fileIn,
          h('small', { class: 'hint' }, '예전 한글(.hwp)은 [다른 이름으로 저장 → HWPX]로 저장하거나, 표를 통째로 복사해 아래에 붙여넣어 주세요.')),
        h('div', { class: 'row' }, h('label', {}, '또는 붙여넣기'), ta)),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: recognize }, '자동 인식'),
        h('span', { class: 'muted small' }, `${state.year}학년도 기준`))),
    out);
  render();
}

export { fmtDate };
