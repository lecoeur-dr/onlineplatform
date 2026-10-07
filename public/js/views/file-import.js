// 📥 학교 정보 메뉴 공통: 한글(HWPX)·엑셀·CSV 표 또는 복사한 표 → 머리글을 찾아 칸 맞추기 → 미리보기 → 한 번에 넣기
//   파일은 서버로 보내지 않고 이 브라우저에서 읽음. 서버에는 고른 줄의 값만 보냄
import { h, api, clear, toast, modal, confirmBox } from '../ui.js';
import { state } from '../state.js';
import { MODULES } from '../modules.js';
import { readSource, readText } from '../smart-import.js';

// 칸 이름이 다르게 적힌 표도 알아보도록 (공백 무시)
const SYN = {
  name: ['이름', '성명', '사용자', '담당자', '교사명'], position: ['직위', '직급', '직책'], dept: ['부서', '부서명', '소속', '부서장소', '부서·장소'],
  homeroom: ['담임', '담임학급', '학급', '학년반'], subject: ['교과', '담당교과', '과목'], duties: ['업무', '담당업무', '업무내용', '분장업무'],
  room: ['교실', '위치', '교실위치', '근무장소'], phone: ['내선', '전화', '번호', '전화번호', '내선번호', '연락처'],
  category: ['분류', '구분', '종류', '품목'], title: ['자료명', '제목', '이름', '명칭', '사이트명'], url: ['링크', '주소', 'url', '사이트주소', '바로가기', '홈페이지'],
  note: ['비고', '설명', '메모', '참고'], section: ['영역', '장', '대분류'], group: ['구분', '항목', '중분류'], rule: ['규정', '사무', '업무', '전결사항'],
  detail: ['세부', '시간', '세부내용', '시간세부'], process: ['절차', '결재', '전결', '결재절차', '전결권자'],
  site: ['사이트', '사이트장소', '업체명', '사이트명', '기관', '장소'], account: ['아이디', 'id', '계정'], password: ['비밀번호', '비번', 'pw', '패스워드'],
};
const CARRY = ['dept', 'category', 'section', 'group']; // 합친 칸(병합 셀)은 위 줄 값을 이어받음
const norm = (x) => String(x || '').replace(/[\s·()\-_/:]/g, '').toLowerCase();

function scoreCell(f, cell) {
  const c = norm(cell);
  if (!c || c.length > 14) return 0;
  const names = [f.label, ...(SYN[f.key] || [])].map(norm);
  if (names.includes(c)) return 3;
  if (names.some((n) => n.length > 1 && (c.includes(n) || n.includes(c)))) return 1;
  return 0;
}
// 한 줄을 머리글로 볼 때 열 → 칸 연결
function mapRow(fields, row) {
  const used = new Set();
  const map = row.map(() => '');
  const pairs = [];
  row.forEach((cell, i) => fields.forEach((f) => { const s = scoreCell(f, cell); if (s) pairs.push([s, i, f.key]); }));
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, i, k] of pairs) if (!map[i] && !used.has(k)) { map[i] = k; used.add(k); }
  return { map, score: pairs.length ? used.size : 0 };
}
// 모든 표·앞쪽 8줄 중 머리글로 가장 그럴듯한 줄
function findHeader(fields, tables) {
  let best = null;
  tables.forEach((tb, ti) => tb.slice(0, 8).forEach((row, ri) => {
    const { map, score } = mapRow(fields, row);
    if (score && (!best || score > best.score)) best = { ti, ri, map, score };
  }));
  return best;
}

export function openFileImport(moduleId, { reload } = {}) {
  const def = MODULES[moduleId];
  const fields = def.fields.filter((f) => !['bool', 'names'].includes(f.type));
  let tables = [];
  let ti = 0; let ri = -1; let map = [];
  let rows = [];
  let mode = 'add';
  const preview = h('div', {});
  const info = h('div', { class: 'muted small' });
  const tablePick = h('span', {});
  const build = () => {
    const tb = tables[ti] || [];
    let prev = {};
    rows = tb.slice(ri + 1).map((r) => {
      const d = {};
      map.forEach((k, i) => { if (k && r[i] !== undefined && String(r[i]).trim()) d[k] = d[k] ? `${d[k]} ${String(r[i]).trim()}` : String(r[i]).trim(); });
      if (!Object.keys(d).length) return null;
      for (const k of CARRY) if (map.includes(k) && !d[k] && prev[k]) d[k] = prev[k];
      if (d.url) { const u = d.url.match(/https?:\/\/\S+/); d.url = u ? u[0] : /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(d.url) ? `https://${d.url}` : d.url; }
      prev = d;
      const missing = fields.filter((f) => f.required && !d[f.key]).map((f) => f.label);
      return { d, on: !missing.length, missing };
    }).filter(Boolean);
    draw();
  };
  const draw = () => {
    const on = rows.filter((r) => r.on);
    info.textContent = rows.length ? `인식 ${rows.length}줄 · 넣을 줄 ${on.length}줄${ri < 0 ? ' · 머리글을 못 찾아 왼쪽 칸부터 순서대로 맞췄습니다' : ''}` : '';
    const tb = tables[ti] || [];
    const width = Math.max(0, ...tb.map((r) => r.length));
    clear(tablePick, tables.length > 1 ? h('select', { onchange: (e) => { ti = Number(e.target.value); guess(true); } }, tables.map((t, i) => h('option', { value: i, selected: i === ti }, `표 ${i + 1} (${t.length}줄)`))) : null);
    if (!tb.length) { clear(preview, h('p', { class: 'muted small' }, '파일을 고르거나 표를 붙여넣으면 여기에 미리보기가 나옵니다.')); return; }
    // 머리 줄: 열마다 어느 칸으로 넣을지 직접 바꿀 수 있음
    const head = Array.from({ length: width }, (_, i) => h('th', {}, h('select', { class: 'small', onchange: (e) => { map[i] = e.target.value; build(); } },
      h('option', { value: '' }, '(넣지 않음)'), fields.map((f) => h('option', { value: f.key, selected: map[i] === f.key }, f.label))),
      ri >= 0 ? h('div', { class: 'muted small' }, tb[ri][i] || '') : null));
    clear(preview, h('div', { class: 'table-wrap', style: { maxHeight: '46vh' } }, h('table', { class: 'table compact' },
      h('thead', {}, h('tr', {}, h('th', {}, h('input', { type: 'checkbox', checked: rows.length && rows.every((r) => r.on), onchange: (e) => { rows.forEach((r) => { r.on = e.target.checked && !r.missing.length; }); draw(); } })), head)),
      h('tbody', {}, rows.map((r) => h('tr', { class: r.missing.length ? 'locked' : '' },
        h('td', {}, h('input', { type: 'checkbox', checked: r.on, disabled: !!r.missing.length, title: r.missing.length ? `${r.missing.join(', ')} 없음` : '', onchange: (e) => { r.on = e.target.checked; draw(); } })),
        Array.from({ length: width }, (_, i) => h('td', { class: 'small' }, map[i] ? (map[i] === 'password' && r.d[map[i]] ? '••••' : r.d[map[i]] || '') : h('span', { class: 'muted' }, '—')))))))));
  };
  const guess = (sameTable) => {
    const found = sameTable ? findHeader(fields, [tables[ti]]) : findHeader(fields, tables);
    if (found) { if (!sameTable) ti = found.ti; ri = found.ri; map = found.map; } else { ri = -1; map = fields.map((f) => f.key); }
    build();
  };
  const take = (src) => {
    tables = (src.tables || []).filter((t) => t.length);
    if (!tables.length && src.lines?.length) tables = [src.lines.map((l) => [l])];
    if (!tables.length) { toast('표를 찾지 못했습니다. 머리글 줄이 있는 표인지 확인해 주세요.', 'error'); return; }
    ti = 0; guess(false);
  };
  const paste = h('textarea', { rows: 3, placeholder: '한글·엑셀에서 머리글 줄까지 표를 복사해 붙여넣어도 됩니다' });
  const admin = state.me?.role === 'admin';
  const scopeLabel = def.scope === 'year' ? `${state.year}학년도 ` : '';
  modal(`📥 ${def.label} 가져오기 (한글·엑셀)`, h('div', { class: 'form' },
    h('p', { class: 'muted small' }, `한글(HWPX)·엑셀(XLSX)·CSV 파일의 표를 읽어 머리글(${fields.map((f) => f.label).join('·')})에 맞춰 넣습니다. 칸이 다르게 잡히면 미리보기 맨 위 칸 이름을 바꿔 주세요. 합쳐진 칸은 위 줄 값을 이어받습니다. 파일은 서버로 보내지 않습니다.`),
    h('input', { type: 'file', accept: '.hwpx,.xlsx,.xls,.xlsm,.csv,.tsv,.txt', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { take(await readSource(f)); } catch (err) { toast(err.message, 'error'); } } }),
    paste, h('button', { type: 'button', class: 'btn small', onclick: () => take(readText(paste.value)) }, '붙여넣은 표 읽기'),
    h('div', { class: 'grid-2' },
      h('label', {}, h('span', {}, '표 고르기'), tablePick),
      h('label', {}, h('span', {}, '넣는 방법'), h('select', { onchange: (e) => { mode = e.target.value; } },
        h('option', { value: 'add' }, '기존 자료 뒤에 추가 (똑같은 줄은 건너뜀)'),
        admin ? h('option', { value: 'replace' }, `바꾸기 (${scopeLabel}${def.label} 기존 자료를 모두 지우고 새로)`) : null))),
    info, preview), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async (e) => {
      const items = rows.filter((r) => r.on).map((r) => r.d);
      if (!items.length) { toast('넣을 줄을 골라 주세요.', 'error'); return; }
      if (mode === 'replace' && !(await confirmBox(`${scopeLabel}${def.label}의 기존 자료를 모두 지우고 ${items.length}줄로 바꿉니다. 계속할까요?`))) return;
      e.target.disabled = true;
      try {
        const r = await api(`/api/records/${moduleId}/bulk`, { method: 'POST', body: { year: state.year, mode, items } });
        toast(`${r.inserted}줄을 넣었습니다.${r.removed ? ` 기존 ${r.removed}줄 삭제.` : ''}${r.skipped ? ` ${r.skipped}줄은 이미 있거나 필수 칸이 비어 건너뜀.` : ''}`);
        close(); reload?.();
      } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
    } }, '넣기'),
  ], { wide: true });
  draw();
}
