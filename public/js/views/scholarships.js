// 🎓 공지·업무 → 장학생: 장학생선정위원회 회차별(또는 선정일별)로 장학금 사업·학년·반·번호·이름·장학금·선정 사유를 한 표에
//   위에는 회차별 인원·금액 카드(눌러서 거르기), 회차별/날짜별 묶어 보기, 사업으로 거르기, 엑셀 가져오기
import { h, api, clear, won, fmtDate, today } from '../ui.js';
import { state, canEdit, remember } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { seg } from './schedule.js';
import { openFileImport } from './file-import.js';

const NONE = '(회차 없음)';
const roundNo = (r) => Number(String(r || '').match(/\d+/)?.[0]) || 0;
const inGroup = (a, b) => String(a.data.program || '').localeCompare(String(b.data.program || ''), 'ko') || (Number(a.data.grade) || 9) - (Number(b.data.grade) || 9) || (Number(a.data.cls) || 99) - (Number(b.data.cls) || 99) || (Number(a.data.num) || 999) - (Number(b.data.num) || 999);
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : '');

export async function scholarshipsView(root) {
  const all = await api(`/api/records/scholarships?year=${state.year}`);
  const reload = () => scholarshipsView(root);
  const by = remember('sch_by') || 'round'; // round = 회차별, date = 날짜별
  const sel = remember('sch_round') ?? '';
  const prog = remember('sch_prog') || '';
  const sum = (list) => list.reduce((a, r) => a + (Number(r.data.amount) || 0), 0);
  // 회차 묶음: 회차 번호가 큰(최근) 것부터, 같은 번호면 날짜 늦은 것부터
  const rounds = new Map();
  for (const r of all) { const k = r.data.round || NONE; if (!rounds.has(k)) rounds.set(k, []); rounds.get(k).push(r); }
  const datesOf = (list) => [...new Set(list.map((r) => r.data.date).filter(Boolean))].sort();
  const lastDate = (list) => datesOf(list).at(-1) || '';
  const roundList = [...rounds].sort(([a, la], [b, lb]) => (a === NONE) - (b === NONE) || roundNo(b) - roundNo(a) || lastDate(lb).localeCompare(lastDate(la)) || a.localeCompare(b, 'ko'));
  const programs = [...new Set(all.map((r) => r.data.program).filter(Boolean))];
  const shown = all.filter((r) => (!sel || (r.data.round || NONE) === sel) && (!prog || r.data.program === prog));
  // 표 정렬: 회차별이면 회차(최근 먼저) → 사업 → 학년·반·번호 / 날짜별이면 선정일(최근 먼저) → 사업 → …
  const rIdx = new Map(roundList.map(([k], i) => [k, i]));
  shown.sort((a, b) => (by === 'date'
    ? ((!a.data.date) - (!b.data.date) || String(b.data.date || '').localeCompare(String(a.data.date || '')))
    : (rIdx.get(a.data.round || NONE) - rIdx.get(b.data.round || NONE))) || inGroup(a, b));
  // 새로 넣을 때 기본값: 고른 회차(없으면 가장 최근 회차)와 그 날짜
  const cur = sel && sel !== NONE ? sel : roundList.find(([k]) => k !== NONE)?.[0] || '';
  const defaults = { round: cur, date: (cur && lastDate(rounds.get(cur) || [])) || today(), program: prog || '' };
  const nextRound = `제${roundList.reduce((m, [k]) => Math.max(m, roundNo(k)), 0) + 1}회`;
  const box = h('div', { class: 'sch-box' });
  const editable = canEdit('scholarships');
  clear(root,
    h('div', { class: 'sch-sum' },
      h('button', { class: `sch-card ${!sel ? 'on' : ''}`, onclick: () => { remember('sch_round', ''); reload(); } },
        h('span', {}, '전체'), h('b', {}, `${all.length}명`), h('small', {}, won(sum(all)))),
      roundList.map(([k, list]) => {
        const ds = datesOf(list);
        return h('button', { class: `sch-card ${sel === k ? 'on' : ''}`, onclick: () => { remember('sch_round', sel === k ? '' : k); reload(); } },
          h('span', { title: k }, k === NONE ? '회차 없음' : `🗂 ${k}`), h('b', {}, `${list.length}명`),
          h('small', {}, `${ds.length ? `${md(ds[0])}${ds.length > 1 ? `~${md(ds.at(-1))}` : ''} · ` : ''}${won(sum(list))}`));
      })),
    h('div', { class: 'toolbar' },
      seg([['round', '🗂 회차별'], ['date', '📅 날짜별']], by, (v) => { remember('sch_by', v); reload(); }),
      programs.length > 1 ? h('select', { class: 'small', onchange: (e) => { remember('sch_prog', e.target.value); reload(); } },
        h('option', { value: '' }, '모든 장학금 사업'), programs.map((p) => h('option', { value: p, selected: p === prog }, p))) : null,
      h('span', { class: 'grow' }),
      editable ? h('button', { class: 'btn small', title: '다음 회차로 새 장학생 입력', onclick: () => openRecordForm('scholarships', null, { defaults: { round: nextRound, date: today(), program: prog || '' }, onSaved: reload }) }, `+ 새 회차 (${nextRound})`) : null,
      editable ? h('button', { class: 'btn small', onclick: () => openFileImport('scholarships', { reload }) }, '📥 엑셀 가져오기') : null,
      !all.length && editable ? h('button', { class: 'btn primary', onclick: () => openRecordForm('scholarships', null, { defaults, onSaved: reload }) }, '+ 장학생') : null),
    sel || prog ? h('p', { class: 'muted small' }, `${[sel === NONE ? '회차 없음' : sel, prog].filter(Boolean).join(' · ')}: ${shown.length}명 · ${won(sum(shown))}`) : null,
    box,
    h('p', { class: 'hint' }, '회차별 = 장학생선정위원회 회차마다, 날짜별 = 선정일마다 묶어 최근 것이 위에 옵니다. 묶음 안에서는 장학금 사업 → 학년·반·번호 순. 학교 교직원이 함께 확인할 수 있고, 선정 사유는 서버에 암호화해 저장합니다.'));
  if (!all.length) {
    clear(box, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🎓'),
      h('p', {}, '장학생선정위원회 회차(예: 제1회)와 선정일을 함께 입력하면 회차별·날짜별로 묶여 정리됩니다. 엑셀 명단이 있으면 [📥 엑셀 가져오기]로 한 번에 넣을 수 있습니다.')));
    return;
  }
  const roundsIn = (list) => [...new Set(list.map((r) => r.data.round).filter(Boolean))];
  await tableView(box, 'scholarships', {
    rows: shown, reload, defaults,
    groupBy: by === 'date' ? 'date' : 'round',
    groupLabel: (k, list) => (by === 'date'
      ? (k === '(구분 없음)' ? '선정일 없음' : `📅 ${fmtDate(k)}${roundsIn(list).length ? ` · ${roundsIn(list).join(', ')}` : ''}`)
      : (k === '(구분 없음)' ? '회차 없음' : `🗂 ${k}${datesOf(list).length ? ` · ${datesOf(list).map(md).join(', ')}` : ''}`)),
    groupDefaults: (k, list) => (by === 'date' ? { round: roundsIn(list)[0] || '' } : { date: lastDate(list) || today() }),
  });
}
