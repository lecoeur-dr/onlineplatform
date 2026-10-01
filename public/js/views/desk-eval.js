// 📝 Deskterior · 평가: 평가 기록(즉석 평가) · 학생별 결과 · 특기사항(바이트 계산)
import { h, api, clear, toast, download } from '../ui.js';
import { state, remember } from '../state.js';
import { openRecordForm } from '../form.js';
import { loadStudents, emptyStudents, byteLen, copyText } from './desk-common.js';

export const LEVELS = ['잘함', '보통', '노력 요함'];
const MARK = { 잘함: '◎', 보통: '○', '노력 요함': '△' };
const LV_COLOR = { 잘함: '#30a46c', 보통: '#0091ff', '노력 요함': '#f5a524' };

export async function evalView(root, openId) {
  const students = await loadStudents();
  const plans = await api(`/api/records/evalPlans?year=${state.year}`);
  const reload = (id) => evalView(root, id);
  const plan = plans.find((p) => p.id === openId);
  if (plan) return scoreSheet(root, plan, reload);
  const bySubject = new Map();
  for (const p of plans) { const k = p.data.subject || '기타'; if (!bySubject.has(k)) bySubject.set(k, []); bySubject.get(k).push(p); }
  const n = students.length;
  clear(root,
    h('div', { class: 'toolbar' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => openRecordForm('evalPlans', null, { onSaved: (r) => r && reload(r.id) }) }, '+ 평가 계획')),
    !n ? emptyStudents() : null,
    plans.length ? [...bySubject].map(([subj, list]) => h('section', { class: 'section' }, h('h3', {}, subj),
      h('div', { class: 'cards' }, list.map((p) => {
        const sc = p.data.scores || {};
        const done = state.students.filter((s) => sc[s]?.level).length;
        return h('button', { class: 'card eval-card', onclick: () => reload(p.id) },
          h('strong', {}, p.data.area || p.data.subject), h('div', { class: 'muted small' }, [p.data.timing, p.data.method].filter(Boolean).join(' · ')),
          p.data.standard ? h('div', { class: 'small clamp' }, p.data.standard) : null,
          h('div', { class: 'lv-bar' }, LEVELS.map((lv) => h('i', { style: { width: `${n ? (state.students.filter((s) => sc[s]?.level === lv).length / n) * 100 : 0}%`, background: LV_COLOR[lv] } }))),
          h('div', { class: 'muted small' }, `기록 ${done} / ${n}명`));
      })))) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '📝'), h('p', {}, '평가 계획을 추가한 뒤, 학생 칸을 눌러 바로 기록합니다 (즉석 평가).')));
}

function scoreSheet(root, plan, reload) {
  const scores = JSON.parse(JSON.stringify(plan.data.scores || {}));
  let version = plan.version;
  let timer = null;
  const status = h('span', { class: 'muted small' });
  const persist = () => {
    clearTimeout(timer);
    status.textContent = '저장 대기…';
    timer = setTimeout(async () => {
      try {
        const saved = await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, scores }, version } });
        version = saved.version; plan.data = saved.data; status.textContent = '✓ 자동 저장됨';
      } catch (e) { status.textContent = ''; toast(e.message, 'error'); }
    }, 700);
  };
  const mode = remember('ev_mode') || 'tap';
  const count = (lv) => state.students.filter((s) => scores[s]?.level === lv).length;
  const sum = h('div', { class: 'row-actions' });
  const drawSum = () => clear(sum, LEVELS.map((lv) => h('span', { class: 'tag', style: { '--c': LV_COLOR[lv] } }, `${MARK[lv]} ${lv} ${count(lv)}`)), h('span', { class: 'tag ghost' }, `미기록 ${state.students.length - LEVELS.reduce((a, lv) => a + count(lv), 0)}`));
  const csv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', '결과', '메모'].map(esc).join(',')];
    state.students.forEach((s, i) => lines.push([i + 1, s, scores[s]?.level || '', scores[s]?.note || ''].map(esc).join(',')));
    download(`평가_${plan.data.subject}_${plan.data.area || ''}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  const body = h('div', {});
  const tile = (s, i) => {
    scores[s] ||= {};
    const el = h('button', { class: 'eval-tile', onclick: () => {
      const cur = LEVELS.indexOf(scores[s].level);
      scores[s].level = cur === LEVELS.length - 1 ? '' : LEVELS[cur + 1];
      paint(); drawSum(); persist();
    } });
    const paint = () => {
      const lv = scores[s].level;
      el.style.setProperty('--c', LV_COLOR[lv] || 'var(--line)');
      el.classList.toggle('set', !!lv);
      clear(el, h('span', { class: 'muted small' }, i + 1), h('strong', {}, s), h('span', { class: 'ev-lv' }, lv ? `${MARK[lv]} ${lv}` : '—'));
    };
    paint();
    return el;
  };
  const draw = () => {
    if (mode === 'tap') clear(body, h('div', { class: 'eval-grid' }, state.students.map(tile)), h('p', { class: 'hint' }, '학생을 누를 때마다 잘함 → 보통 → 노력 요함 → 지움 순서로 바뀌고 자동 저장됩니다. 체육·음악 실기처럼 그 자리에서 평가할 때 쓰세요.'));
    else {
      clear(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table score' },
        h('thead', {}, h('tr', {}, ['번호', '이름', ...LEVELS, '관찰 메모'].map((x) => h('th', {}, x)))),
        h('tbody', {}, state.students.map((s, i) => {
          scores[s] ||= {};
          return h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, h('strong', {}, s)),
            LEVELS.map((lv) => h('td', { class: 'center' }, h('input', { type: 'radio', name: `lv_${i}`, checked: scores[s].level === lv, 'aria-label': `${s} ${lv}`, onchange: () => { scores[s].level = lv; drawSum(); persist(); } }))),
            h('td', {}, h('input', { value: scores[s].note || '', placeholder: '관찰 내용 (특기사항 참고 자료)', oninput: (e) => { scores[s].note = e.target.value; persist(); } })));
        })))));
    }
  };
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => reload() }, '← 목록'),
      h('strong', {}, `${plan.data.subject} · ${plan.data.area || ''}`),
      h('div', { class: 'seg' }, [['tap', '즉석 평가'], ['table', '표·메모']].map(([v, l]) => h('button', { class: mode === v ? 'on' : '', onclick: () => { remember('ev_mode', v); reload(plan.id); } }, l))),
      status,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => openRecordForm('evalPlans', plan, { onSaved: (r) => reload(r?.id) }) }, '계획 수정'),
      h('button', { class: 'btn', onclick: csv }, 'CSV')),
    plan.data.standard ? h('p', { class: 'muted pre' }, plan.data.standard) : null,
    sum, body);
  drawSum(); draw();
}

// 학생별 결과: 줄 = 학생, 칸 = 평가
export async function studentEvalView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const plans = (await api(`/api/records/evalPlans?year=${state.year}`)).sort((a, b) => String(a.data.subject).localeCompare(String(b.data.subject), 'ko'));
  if (!plans.length) return clear(root, h('p', { class: 'muted' }, '평가 기록이 없습니다.'));
  const detail = h('div', {});
  const show = (name) => clear(detail, h('div', { class: 'card' }, h('h3', {}, `${name} 평가 메모`),
    h('ul', { class: 'list' }, plans.filter((p) => p.data.scores?.[name]).map((p) => h('li', {}, h('strong', {}, `${p.data.subject} ${p.data.area || ''}`), ` ${p.data.scores[name].level || '-'}`, p.data.scores[name].note ? h('div', { class: 'small' }, p.data.scores[name].note) : null))),
    h('a', { class: 'btn small', href: '#/desk/eval/remarks' }, '특기사항 쓰기 →')));
  clear(root,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table compact eval-matrix' },
      h('thead', {}, h('tr', {}, h('th', {}, '이름'), plans.map((p) => h('th', { title: p.data.standard || '' }, h('div', {}, p.data.subject), h('div', { class: 'muted small' }, p.data.area || ''))))),
      h('tbody', {}, students.map((s) => h('tr', { class: 'click', onclick: () => show(s.data.name) }, h('td', {}, h('strong', {}, s.data.name)),
        plans.map((p) => { const lv = p.data.scores?.[s.data.name]?.level; return h('td', { class: 'center', style: lv ? { color: LV_COLOR[lv], fontWeight: '700' } : {} }, lv ? MARK[lv] : ''); })))))),
    h('p', { class: 'hint' }, '◎ 잘함 · ○ 보통 · △ 노력 요함. 줄을 누르면 그 학생의 평가 메모를 모아 봅니다.'),
    detail);
}

// 특기사항: 학생별로 쓰고 글자·바이트 수 확인, 누가기록·평가 메모를 참고로 불러오기
export async function remarksView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const d = await api(`/api/bundle?year=${state.year}&modules=remarks,notes,evalPlans`);
  const area = remember('rm_area') || '행동특성 및 종합의견';
  const subject = remember('rm_subj') || '';
  const limit = Number(remember('rm_limit')) || 1500;
  const reload = () => remarksView(root);
  const areas = ['교과학습발달상황', '행동특성 및 종합의견', '창체-자율', '창체-동아리', '창체-진로', '기타'];
  const find = (name) => d.remarks.find((r) => r.data.student === name && r.data.area === area && (area !== '교과학습발달상황' || (r.data.subject || '') === subject));
  const refs = (name) => [
    ...d.notes.filter((n) => n.data.student === name).map((n) => `[${n.data.date} ${n.data.category || ''}] ${n.data.content}`),
    ...d.evalPlans.filter((p) => p.data.scores?.[name]?.note && (area !== '교과학습발달상황' || !subject || p.data.subject === subject)).map((p) => `[${p.data.subject} ${p.data.area || ''} ${p.data.scores[name].level || ''}] ${p.data.scores[name].note}`),
  ];
  const row = (s) => {
    const name = s.data.name;
    let rec = find(name);
    const ta = h('textarea', { rows: 3, value: rec?.data.content || '', placeholder: '특기사항 초안' });
    const cnt = h('span', { class: 'muted small' });
    const st = h('span', { class: 'muted small' });
    const paint = () => { const b = byteLen(ta.value); cnt.textContent = `${[...ta.value].length}자 · ${b}바이트`; cnt.classList.toggle('danger', b > limit); };
    let timer;
    ta.addEventListener('input', () => {
      paint(); st.textContent = '…';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const data = { student: name, area, subject: area === '교과학습발달상황' ? subject : '', content: ta.value };
        try {
          rec = rec ? await api(`/api/records/remarks/${rec.id}`, { method: 'PUT', body: { data, version: rec.version } }) : await api('/api/records/remarks', { method: 'POST', body: { data, year: state.year } });
          st.textContent = '✓';
        } catch (e) { st.textContent = ''; toast(e.message, 'error'); }
      }, 900);
    });
    paint();
    const r = refs(name);
    return h('div', { class: 'remark-row' },
      h('div', { class: 'rm-name' }, h('span', { class: 'muted small' }, s.data.num ?? ''), ' ', h('strong', {}, name)),
      h('div', { class: 'rm-body' }, ta, h('div', { class: 'row-actions' }, cnt, st, h('span', { class: 'grow' }),
        r.length ? h('details', { class: 'rm-ref' }, h('summary', {}, `참고 ${r.length}건`), h('ul', { class: 'list small' }, r.map((x) => h('li', {}, x)))) : h('span', { class: 'muted small' }, '참고 기록 없음'))));
  };
  const exportCsv = () => {
    const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', '영역', '과목', '내용', '바이트'].map(esc).join(',')];
    for (const s of students) { const r = find(s.data.name); lines.push([s.data.num, s.data.name, area, subject, r?.data.content || '', byteLen(r?.data.content)].map(esc).join(',')); }
    download(`특기사항_${area}${subject ? `_${subject}` : ''}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  clear(root,
    h('div', { class: 'toolbar' },
      h('select', { onchange: (e) => { remember('rm_area', e.target.value); reload(); } }, areas.map((a) => h('option', { value: a, selected: a === area }, a))),
      area === '교과학습발달상황' ? h('input', { placeholder: '과목 (예: 국어)', value: subject, onchange: (e) => { remember('rm_subj', e.target.value.trim()); reload(); } }) : null,
      h('label', { class: 'inline' }, '기준 ', h('input', { type: 'number', value: limit, style: { width: '80px' }, onchange: (e) => { remember('rm_limit', Number(e.target.value) || 1500); reload(); } }), '바이트'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => copyText(students.map((s) => `${s.data.num ?? ''}\t${s.data.name}\t${find(s.data.name)?.data.content || ''}`).join('\n')) }, '전체 복사'),
      h('button', { class: 'btn', onclick: exportCsv }, 'CSV')),
    h('div', { class: 'remarks' }, students.map(row)),
    h('p', { class: 'hint' }, '입력하면 자동 저장(암호화)됩니다. 바이트는 한글 3·영문 1·줄바꿈 2로 계산한 참고값이며, 학교 나이스의 실제 제한은 학교급·영역마다 다를 수 있습니다 [확인 필요]. "참고"에는 누가기록과 평가 메모가 모입니다.'));
}
