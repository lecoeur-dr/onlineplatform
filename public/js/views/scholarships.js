// 🎓 공지·업무 → 장학생: 장학금 사업별로 학년·반·번호·이름·장학금·선정 사유를 한 표에
//   위에는 사업별 인원·금액 요약, 사업·학년으로 걸러 보기, 엑셀 가져오기·내보내기
import { h, api, clear, won } from '../ui.js';
import { state, canEdit, remember } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';
import { seg } from './schedule.js';
import { openFileImport } from './file-import.js';

const order = (a, b) => (Number(a.data.grade) || 9) - (Number(b.data.grade) || 9) || (Number(a.data.cls) || 99) - (Number(b.data.cls) || 99) || (Number(a.data.num) || 999) - (Number(b.data.num) || 999) || String(a.data.name).localeCompare(String(b.data.name), 'ko');

export async function scholarshipsView(root) {
  const rows = (await api(`/api/records/scholarships?year=${state.year}`)).sort(order);
  const reload = () => scholarshipsView(root);
  const prog = remember('sch_prog') || '';
  const grade = remember('sch_grade') || '';
  const programs = [...new Set(rows.map((r) => r.data.program).filter(Boolean))];
  const shown = rows.filter((r) => (!prog || r.data.program === prog) && (!grade || String(r.data.grade) === grade));
  const sum = (list) => list.reduce((a, r) => a + (Number(r.data.amount) || 0), 0);
  const box = h('div', { class: 'sch-box' });
  clear(root,
    h('div', { class: 'sch-sum' },
      h('button', { class: `sch-card ${!prog ? 'on' : ''}`, onclick: () => { remember('sch_prog', ''); reload(); } },
        h('span', {}, '전체'), h('b', {}, `${rows.length}명`), h('small', {}, won(sum(rows)))),
      programs.map((p) => { const l = rows.filter((r) => r.data.program === p); return h('button', { class: `sch-card ${prog === p ? 'on' : ''}`, onclick: () => { remember('sch_prog', prog === p ? '' : p); reload(); } },
        h('span', { title: p }, `🎓 ${p}`), h('b', {}, `${l.length}명`), h('small', {}, won(sum(l)))); })),
    h('div', { class: 'toolbar' },
      h('div', { class: 'sch-grades' }, seg([['', '전체'], ...['1', '2', '3', '4', '5', '6'].map((g) => [g, `${g}학년`])], grade, (v) => { remember('sch_grade', v); reload(); })),
      h('span', { class: 'grow' }),
      canEdit('scholarships') ? h('button', { class: 'btn small', onclick: () => openFileImport('scholarships', { reload }) }, '📥 엑셀 가져오기') : null,
      !rows.length && canEdit('scholarships') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('scholarships', null, { defaults: { program: prog || '', grade: grade || '' }, onSaved: reload }) }, '+ 장학생') : null),
    prog || grade ? h('p', { class: 'muted small' }, `${[prog, grade && `${grade}학년`].filter(Boolean).join(' · ')}: ${shown.length}명 · ${won(sum(shown))}`) : null,
    box,
    h('p', { class: 'hint' }, '학교 교직원이 함께 확인할 수 있습니다. 선정 사유는 서버에 암호화해 저장합니다. 학생 개인정보이니 필요한 내용만 적고, 학년도가 끝나면 정리해 주세요.'));
  if (!rows.length) {
    clear(box, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🎓'),
      h('p', {}, '장학금 사업별로 장학생을 입력하면 사업별 인원·금액이 위에 모이고, 학년·반·번호 순으로 정리됩니다. 엑셀 명단이 있으면 [📥 엑셀 가져오기]로 한 번에 넣을 수 있습니다.')));
    return;
  }
  await tableView(box, 'scholarships', { rows: shown, groupBy: prog ? null : 'program', reload, defaults: { program: prog || '', grade: grade || '' } });
}

