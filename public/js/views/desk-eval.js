// 📝 Deskterior · 평가 v3
//   벤치마킹: 이지에듀류 평가 관리(학급 설정 → 과목·영역·성취기준 선택 → 평가계획 자동 구성 → 성취수준별 평가 → 교과발달상황),
//            Classendo(즉석 평가·특기사항 초안·나이스 입력), 학급다이어리2(평가 통계·검색)
//   흐름: 🏫 우리 반 → 🎯 성취기준 DB → 🧭 계획 마법사(수준 수·수준명·수준별 기준 초안) → 📄 평가계획서(학교 양식 표) → 📝 기록 → ✍️ 교과발달상황
import { h, api, clear, toast, modal, download, confirmBox } from '../ui.js';
import { state, remember } from '../state.js';
import { EVAL_SCALES, EVAL_METHODS, GRADES, DEFAULT_LISTS, scaleOf, bandOf } from '../modules.js';
import { openRecordForm } from '../form.js';
import { readSource, readText, parseEvalPlans, parseStandards, splitStandards, joinStandards, matchScale, bandOfCode, subjectOfCode } from '../smart-import.js';
import { loadStudents, emptyStudents, byteLen, copyText } from './desk-common.js';
import { josa, endDot, elementFrom, autoRubric, toRecordStyle, timingKey, composeRemark, overallLevel } from '../eval-text.js';
import { editCriteria, studentCard, hasCriteria, remarkRequest, importAiRemarks, downloadGuide } from './desk-rubric.js';

const LV_COLORS = ['#30a46c', '#0091ff', '#f5a524', '#e5484d', '#8e4ec6'];
const MARKS = ['◎', '○', '△', '▽', '✕'];
const lvIndex = (plan, lv) => scaleOf(plan).indexOf(lv);
const lvColor = (plan, lv) => { const i = lvIndex(plan, lv); const n = scaleOf(plan).length; return i < 0 ? 'var(--line)' : LV_COLORS[n <= 2 ? (i === 0 ? 0 : 3) : n === 3 ? [0, 1, 2][i] : i] || LV_COLORS[4]; };
const lvMark = (plan, lv) => { const i = lvIndex(plan, lv); const n = scaleOf(plan).length; return i < 0 ? '' : n <= 2 ? (i === 0 ? '○' : '✕') : n === 3 ? ['◎', '○', '△'][i] : MARKS[i] || '·'; };
const unitName = (p) => String(p.data.unit || '').replace(/^\s*\d+\s*[.)]\s*/, '').trim();
const planTitle = (p) => [p.data.subject, p.data.unit || p.data.area || p.data.element].filter(Boolean).join(' · ');
export const standardsOf = (p) => splitStandards(p.data.standard, p.data.code);
const KNOWN_SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '실과', '체육', '음악', '미술', '바른 생활', '슬기로운 생활', '즐거운 생활'];
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const guessSemester = () => { const m = new Date().getMonth() + 1; return m >= 3 && m <= 8 ? '1학기' : '2학기'; };

const sortPlans = (list) => list.slice().sort((a, b) => String(a.data.semester || '').localeCompare(String(b.data.semester || '')) || timingKey(a.data.timing) - timingKey(b.data.timing) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

// ---------- 우리 반 · 성취기준 DB 공통 ----------

export async function loadClass() { return (await api(`/api/records/myClass?year=${state.year}`))[0] || null; }
const loadLibs = () => api(`/api/records/standards?year=${state.year}`);
const classText = (c) => (c ? [c.data.grade, c.data.room].filter(Boolean).join(' ') : '');

function classBar(info, count, reload) {
  return h('div', { class: 'class-bar' },
    h('span', { class: 'cb-ico' }, '🏫'),
    info ? h('strong', {}, classText(info)) : h('span', { class: 'muted' }, '학년·반을 정하면 성취기준 학년군과 평가계획서 머리글이 자동으로 맞춰집니다.'),
    info?.data.semester ? h('span', { class: 'tag ghost' }, info.data.semester) : null,
    h('span', { class: 'tag ghost' }, `학생 ${count}명`),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn small', onclick: () => openRecordForm('myClass', info, { defaults: { semester: guessSemester() }, onSaved: () => reload() }) }, info ? '학급 설정' : '🏫 학급 설정하기'),
    count ? null : h('a', { class: 'btn small', href: '#/desk/class/students' }, '학생 명단 →'));
}

// 성취기준 묶음(과목·학년군)에 합치기: 같은 코드는 건너뜀(빈 영역·문장은 채움)
export async function mergeStandards(groups, source = '') {
  const libs = await loadLibs();
  let added = 0;
  for (const g of groups) {
    if (!g.subject || !g.items?.length) continue;
    const lib = libs.find((l) => l.data.subject === g.subject && (l.data.band || '') === (g.band || ''));
    const items = lib ? [...(lib.data.items || [])] : [];
    for (const it of g.items) {
      const cur = items.find((x) => x.code && x.code === it.code);
      if (!cur) { items.push({ area: it.area || '', code: it.code, text: it.text }); added++; } else { if (!cur.area && it.area) cur.area = it.area; if (!cur.text && it.text) cur.text = it.text; }
    }
    items.sort((a, b) => String(a.code).localeCompare(String(b.code), 'ko', { numeric: true }));
    if (lib) { const saved = await api(`/api/records/standards/${lib.id}`, { method: 'PUT', body: { data: { ...lib.data, items }, version: lib.version } }); Object.assign(lib, saved); }
    else libs.push(await api('/api/records/standards', { method: 'POST', body: { data: { subject: g.subject, band: g.band || '', curriculum: '2022 개정', source, items }, year: state.year } }));
  }
  return added;
}
const groupsFromPlans = (plans) => {
  const map = new Map();
  for (const p of plans) for (const st of splitStandards(p.standard, p.code)) {
    if (!st.code) continue;
    const band = bandOf(p.grade) || bandOfCode(st.code);
    const k = `${p.subject}|${band}`;
    if (!map.has(k)) map.set(k, { subject: p.subject, band, items: [] });
    map.get(k).items.push({ area: p.area || '', code: st.code, text: st.text });
  }
  return [...map.values()];
};

// ---------- 평가 현황·기록 ----------

export async function evalView(root, openId) {
  const [students, plans, info] = await Promise.all([loadStudents(), api(`/api/records/evalPlans?year=${state.year}`), loadClass()]);
  const reload = (id) => evalView(root, id);
  const plan = plans.find((p) => p.id === openId);
  if (plan) return scoreSheet(root, plan, reload);
  const names = students.map((s) => s.data.name);
  const subj = remember('ev_subj') || '';
  const sem = remember('ev_sem') || '';
  const subjects = [...new Set(plans.map((p) => p.data.subject).filter(Boolean))];
  const sems = [...new Set(plans.map((p) => p.data.semester).filter(Boolean))].sort();
  const shown = sortPlans(plans.filter((p) => (!subj || p.data.subject === subj) && (!sem || p.data.semester === sem)));
  const filled = (p) => names.filter((n) => p.data.scores?.[n]?.level).length;
  const totalCells = shown.length * names.length;
  const doneCells = shown.reduce((a, p) => a + filled(p), 0);
  const missing = names.filter((n) => shown.some((p) => !p.data.scores?.[n]?.level));
  const bySubject = new Map();
  for (const p of shown) { const k = p.data.subject || '기타'; if (!bySubject.has(k)) bySubject.set(k, []); bySubject.get(k).push(p); }

  clear(root,
    classBar(info, names.length, () => reload()),
    h('div', { class: 'kpi-grid' },
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '평가 계획'), h('div', { class: 'kpi-value' }, shown.length, h('span', { class: 'muted small' }, ' 개'))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '기록 완료율'), h('div', { class: 'kpi-value' }, totalCells ? `${Math.round((doneCells / totalCells) * 100)}%` : '-'),
        h('div', { class: 'progress-bar' }, h('span', { style: { width: `${totalCells ? (doneCells / totalCells) * 100 : 0}%` } }))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '미기록 있는 학생'), h('div', { class: 'kpi-value' }, missing.length, h('span', { class: 'muted small' }, ` / ${names.length}명`))),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, '교과'), h('div', { class: 'kpi-value' }, subjects.length, h('span', { class: 'muted small' }, ' 개')))),
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, ['', ...subjects].map((x) => h('button', { class: subj === x ? 'on' : '', onclick: () => { remember('ev_subj', x); reload(); } }, x || '전체 교과'))),
      sems.length > 1 ? h('div', { class: 'seg' }, ['', ...sems].map((x) => h('button', { class: sem === x ? 'on' : '', onclick: () => { remember('ev_sem', x); reload(); } }, x || '전체 학기'))) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => importPlans(reload) }, '📥 평가계획서 가져오기'),
      h('button', { class: 'btn', onclick: () => openRecordForm('evalPlans', null, { defaults: { scale: '4단계', subject: subj, grade: info?.data.grade, semester: info?.data.semester || guessSemester() }, onSaved: (r) => r && reload(r.id) }) }, '+ 직접 만들기'),
      h('button', { class: 'btn primary', onclick: () => planWizard(reload, { subject: subj }) }, '🧭 성취기준으로 계획 만들기')),
    !names.length ? emptyStudents() : null,
    plans.length ? [...bySubject].map(([s, list]) => h('section', { class: 'section' }, h('h3', {}, s, h('span', { class: 'muted small' }, ` ${list.length}개`),
      h('a', { class: 'link-btn small', href: '#/desk/eval/plan', onclick: () => remember('pd_subj', s) }, ' 📄 평가계획서')),
      h('div', { class: 'cards' }, list.map((p) => {
        const scale = scaleOf(p);
        const n = filled(p);
        const codes = standardsOf(p).map((x) => x.code).filter(Boolean);
        return h('button', { class: 'card eval-card', onclick: () => reload(p.id) },
          h('div', { class: 'card-head' }, h('strong', {}, p.data.unit || p.data.area || p.data.element || p.data.subject),
            codes.length ? h('span', { class: 'tag ghost' }, codes[0], codes.length > 1 ? ` 외 ${codes.length - 1}` : '') : null),
          p.data.element ? h('div', { class: 'small' }, '🎯 ', p.data.element) : null,
          h('div', { class: 'muted small' }, [p.data.timing, p.data.area, p.data.method, `${scale.length}수준`].filter(Boolean).join(' · ')),
          h('div', { class: 'lv-bar' }, scale.map((lv) => h('i', { title: lv, style: { width: `${names.length ? (names.filter((x) => p.data.scores?.[x]?.level === lv).length / names.length) * 100 : 0}%`, background: lvColor(p, lv) } }))),
          h('div', { class: 'row-actions' }, h('span', { class: `small ${n < names.length ? 'danger' : 'muted'}` }, n < names.length ? `미기록 ${names.length - n}명` : '✓ 모두 기록'), h('span', { class: 'grow' }),
            Object.keys(p.data.rubric || {}).length ? h('span', { class: 'tag ghost' }, '수준별 기준') : h('span', { class: 'tag warn' }, '기준 없음')));
      })))) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '📝'),
      h('p', {}, '① [🧭 성취기준으로 계획 만들기]: 과목 → 영역 → 성취기준을 고르면 평가 요소·수준별 기준까지 초안이 만들어집니다.'),
      h('p', {}, '② [📥 평가계획서 가져오기]: 학교 평가계획서(한글 HWPX)를 올리면 시기·단원·평가 요소·영역·방법·성취기준·성취수준을 그대로 읽어옵니다.')));
}

// ---------- 🧭 계획 마법사: 학년·학기·과목 → 영역별 성취기준 선택 → 수준 → 초안 다듬기 ----------

export async function planWizard(reload, pre = {}) {
  const [info, libs] = await Promise.all([loadClass(), loadLibs()]);
  const st = { grade: pre.grade || info?.data.grade || '', semester: pre.semester || info?.data.semester || guessSemester(), subject: pre.subject || '', picked: new Map(), merge: false, scale: '4단계', custom: '', method: '', q: '' };
  let drafts = [];
  const step1 = h('div', {});
  const step2 = h('div', {});
  const step3 = h('div', {});
  const step4 = h('div', {});
  const libItems = () => libs.filter((l) => l.data.subject === st.subject && (!st.grade || !l.data.band || l.data.band === bandOf(st.grade))).flatMap((l) => l.data.items || []);
  const levels = () => (st.scale === '직접' ? st.custom.split(/[,/·]/).map((x) => x.trim()).filter(Boolean) : EVAL_SCALES[st.scale]);
  const drawStep1 = () => {
    const subjects = [...new Set([...libs.filter((l) => !st.grade || !l.data.band || l.data.band === bandOf(st.grade)).map((l) => l.data.subject), ...(state.settings?.lists?.subjects || DEFAULT_LISTS.subjects)])];
    clear(step1, h('div', { class: 'wz-row' },
      h('label', {}, '학년 ', h('select', { onchange: (e) => { st.grade = e.target.value; st.picked.clear(); drawStep1(); drawStep2(); } }, h('option', { value: '' }, '선택'), GRADES.map((g) => h('option', { value: g, selected: g === st.grade }, g)))),
      h('label', {}, '학기 ', h('select', { onchange: (e) => { st.semester = e.target.value; } }, ['1학기', '2학기'].map((x) => h('option', { value: x, selected: x === st.semester }, x)))),
      h('label', {}, '과목 ', h('select', { onchange: (e) => { st.subject = e.target.value; st.picked.clear(); drawStep2(); } }, h('option', { value: '' }, '선택'), subjects.map((x) => h('option', { value: x, selected: x === st.subject }, `${x}${libs.some((l) => l.data.subject === x && (!st.grade || !l.data.band || l.data.band === bandOf(st.grade))) ? ' ✓' : ''}`)))),
      st.grade ? h('span', { class: 'muted small' }, `학년군 ${bandOf(st.grade)} · ✓ = 성취기준 DB 있음`) : null));
  };
  const drawStep2 = () => {
    if (!st.subject) return clear(step2, h('p', { class: 'muted small' }, '과목을 고르면 영역별 성취기준이 나옵니다.'));
    const items = libItems();
    const q = st.q.trim();
    const shown = items.filter((x) => !q || `${x.code} ${x.text} ${x.area}`.includes(q));
    const areas = [...new Set(shown.map((x) => x.area || '(영역 미지정)'))];
    const paste = h('textarea', { rows: 3, placeholder: '[6과05-01] 성취기준 문장\n[6과05-02] …  (교육과정 문서에서 복사해 붙여넣기)' });
    clear(step2,
      items.length ? h('input', { type: 'search', placeholder: '코드·낱말로 찾기', value: st.q, oninput: (e) => { st.q = e.target.value; drawStep2(); setTimeout(() => step2.querySelector('input[type=search]')?.focus(), 0); } }) : null,
      items.length ? h('div', { class: 'std-pick' }, areas.map((a) => {
        const list = shown.filter((x) => (x.area || '(영역 미지정)') === a);
        return h('details', { class: 'std-area', open: true },
          h('summary', {}, h('strong', {}, a), h('span', { class: 'muted small' }, ` ${list.length}개`),
            h('button', { type: 'button', class: 'link-btn small', onclick: (e) => { e.preventDefault(); const all = list.every((x) => st.picked.has(x.code)); list.forEach((x) => (all ? st.picked.delete(x.code) : st.picked.set(x.code, x))); drawStep2(); } }, ' 모두')),
          list.map((x) => h('label', { class: `std-item ${st.picked.has(x.code) ? 'on' : ''}` },
            h('input', { type: 'checkbox', checked: st.picked.has(x.code), onchange: (e) => { if (e.target.checked) st.picked.set(x.code, x); else st.picked.delete(x.code); e.target.closest('.std-item').classList.toggle('on', e.target.checked); drawCount(); } }),
            h('span', { class: 'tag ghost' }, x.code), h('span', {}, x.text))));
      })) : h('p', { class: 'alert warn' }, `성취기준 DB에 ${st.subject}${st.grade ? ` (${bandOf(st.grade)})` : ''} 성취기준이 없습니다. 아래에 붙여넣거나 [성취기준 DB] 메뉴에서 교육과정 문서·평가계획서로 채워 주세요.`),
      h('details', { class: 'std-area', open: !items.length }, h('summary', {}, '✏️ 성취기준 붙여넣어 추가 (DB에도 저장)'),
        paste, h('button', { type: 'button', class: 'btn small', onclick: async () => {
          const groups = parseStandards(readText(paste.value), { subject: st.subject, band: bandOf(st.grade) }).map((g) => ({ ...g, subject: st.subject }));
          if (!groups.length) { toast('[코드] 가 있는 성취기준 줄을 찾지 못했습니다.', 'error'); return; }
          const n = await mergeStandards(groups, '직접 붙여넣기');
          libs.splice(0, libs.length, ...(await loadLibs()));
          for (const g of groups) for (const it of g.items) st.picked.set(it.code, it);
          toast(`성취기준 ${n}개를 DB에 더했습니다.`); drawStep1(); drawStep2();
        } }, '추가하고 선택')),
      countEl);
    drawCount();
  };
  const countEl = h('p', { class: 'small' });
  const drawCount = () => { countEl.textContent = st.picked.size ? `✓ 성취기준 ${st.picked.size}개 선택 → ${st.merge ? '평가 1개' : `평가 ${st.picked.size}개`}` : '성취기준을 고르세요.'; };
  const drawStep3 = () => {
    const custom = h('input', { value: st.custom, placeholder: '예) 매우잘함, 잘함, 보통, 노력요함', oninput: (e) => { st.custom = e.target.value; } });
    clear(step3, h('div', { class: 'wz-row' },
      h('label', {}, '평가 수준 ', h('select', { onchange: (e) => { st.scale = e.target.value; drawStep3(); } },
        Object.entries(EVAL_SCALES).map(([k, v]) => h('option', { value: k, selected: k === st.scale }, `${v.length}수준 · ${v.join('/')}`)),
        h('option', { value: '직접', selected: st.scale === '직접' }, '직접 입력…'))),
      st.scale === '직접' ? custom : null,
      h('label', {}, '평가 방법 ', h('select', { onchange: (e) => { st.method = e.target.value; } }, h('option', { value: '' }, '(나중에)'), EVAL_METHODS.map((m) => h('option', { value: m, selected: m === st.method }, m)))),
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: st.merge, onchange: (e) => { st.merge = e.target.checked; drawCount(); } }), ' 고른 성취기준을 평가 하나로 묶기')));
  };
  const makeDrafts = () => {
    const lv = levels();
    if (!st.subject || !st.picked.size) { toast('과목과 성취기준을 먼저 고르세요.', 'error'); return; }
    if (lv.length < 2) { toast('평가 수준을 2개 이상 정해 주세요.', 'error'); return; }
    const picks = [...st.picked.values()];
    const groups = st.merge ? [picks] : picks.map((x) => [x]);
    drafts = groups.map((g) => {
      const element = elementFrom(g[0].text);
      return { subject: st.subject, grade: st.grade, semester: st.semester, timing: '', unit: '', content: '', element, area: [...new Set(g.map((x) => x.area).filter(Boolean))].join(', '), method: st.method,
        standard: joinStandards(g), code: g.map((x) => x.code).join(' '), scale: st.scale === '직접' ? '' : st.scale, levels: lv, rubric: autoRubric(element, lv), scores: {} };
    });
    drawStep4();
  };
  const drawStep4 = () => clear(step4, drafts.length ? [
    h('p', { class: 'muted small' }, '시기·단원·평가 요소를 채우고 수준별 기준을 학교 기준에 맞게 다듬으세요. 평가 요소를 고친 뒤 [기준 다시 만들기]를 누르면 수준별 문장이 새 요소로 바뀝니다.'),
    drafts.map((d, i) => {
      const rub = h('div', {});
      const drawRub = () => clear(rub, d.levels.map((lv) => h('div', { class: 'row' }, h('label', {}, lv), h('textarea', { rows: 2, value: d.rubric[lv] || '', oninput: (e) => { d.rubric[lv] = e.target.value; } }))));
      drawRub();
      const inp = (k, ph, wide) => h('input', { value: d[k] || '', placeholder: ph, class: wide ? 'grow' : '', oninput: (e) => { d[k] = e.target.value; } });
      return h('div', { class: 'card wz-draft' },
        h('div', { class: 'card-head' }, h('strong', {}, `${i + 1}. `, d.code), h('span', { class: 'muted small' }, d.area)),
        h('div', { class: 'muted small pre' }, d.standard),
        h('div', { class: 'wz-grid' }, inp('timing', '시기 예) 9월 3주'), inp('unit', '단원명 예) 1. 혼합물의 분리'), inp('element', '평가 요소', true),
          h('select', { onchange: (e) => { d.method = e.target.value; } }, h('option', { value: '' }, '평가 방법'), EVAL_METHODS.map((m) => h('option', { value: m, selected: m === d.method }, m)))),
        h('textarea', { rows: 2, placeholder: '교수학습 내용 (평가계획서의 ▪ 칸)', value: d.content, oninput: (e) => { d.content = e.target.value; } }),
        h('details', {}, h('summary', {}, `수준별 기준 (${d.levels.join(' · ')})`), rub,
          h('button', { type: 'button', class: 'btn small', onclick: () => { d.rubric = autoRubric(d.element, d.levels); drawRub(); } }, '기준 다시 만들기')));
    })] : null);
  drawStep1(); drawStep2(); drawStep3();
  modal('🧭 성취기준으로 평가계획 만들기', h('div', { class: 'form wizard' },
    h('h4', {}, '① 학년 · 학기 · 과목'), step1,
    h('h4', {}, '② 영역별 성취기준 고르기'), step2,
    h('h4', {}, '③ 평가 수준 · 방법'), step3,
    h('button', { type: 'button', class: 'btn primary', onclick: makeDrafts }, '④ 계획 초안 만들기 ↓'),
    step4,
    h('p', { class: 'hint' }, '수준별 기준은 평가 요소를 넣어 만든 기본 문장(초안)입니다. 학교 학업성적관리규정·학년 협의 기준에 맞게 반드시 고쳐 주세요.')), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      if (!drafts.length) { makeDrafts(); if (!drafts.length) return; toast('초안을 확인한 뒤 다시 눌러 주세요.'); return; }
      for (const d of drafts) await api('/api/records/evalPlans', { method: 'POST', body: { data: d, year: state.year } });
      toast(`평가 계획 ${drafts.length}개를 만들었습니다.`); close(); reload();
    } }, '계획 저장'),
  ], { wide: true });
}

// ---------- 📥 평가계획서 가져오기: 학교 양식(HWPX) · 엑셀 · 붙여넣기 ----------

function importPlans(reload) {
  const file = h('input', { type: 'file', accept: '.hwpx,.hwp,.xlsx,.xls,.csv,.txt' });
  const ta = h('textarea', { rows: 5, placeholder: '평가계획표의 표를 복사해 붙여넣거나 한 줄에 하나씩:\n국어 | 3. 글의 짜임 | [6국03-02] 목적에 맞게 글을 쓴다. | 4월 | 서술형' });
  const scale = h('select', {}, Object.entries(EVAL_SCALES).map(([k, v]) => h('option', { value: k }, `${v.length}수준 · ${v.join('/')}`)));
  const toDb = h('input', { type: 'checkbox', checked: true });
  const out = h('div', {});
  let found = [];
  const recognize = async () => {
    try {
      const src = file.files[0] ? await readSource(file.files[0]) : readText(ta.value);
      if (file.files[0] && ta.value.trim()) { const x = readText(ta.value); src.tables.push(...x.tables); src.lines.push(...x.lines); }
      const existing = await api(`/api/records/evalPlans?year=${state.year}`);
      const dup = (p) => existing.some((e) => e.data.subject === p.subject && (e.data.code || '') === (p.code || '') && (e.data.timing || '') === (p.timing || '') && (e.data.element || '') === (p.element || ''));
      found = parseEvalPlans(src).map((p) => ({ ...p, _dup: dup(p), _on: !dup(p) }));
      const subjects = [...new Set(found.map((p) => p.subject))];
      clear(out, found.length ? [
        h('p', { class: 'alert ok' }, `✓ 평가 계획 ${found.length}개 인식 · ${subjects.join(', ')}${found.some((p) => p.levels) ? ' · 성취수준·수준별 기준 포함' : ''}${found.some((p) => p._dup) ? ` · 이미 있는 ${found.filter((p) => p._dup).length}개는 선택 해제` : ''}`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table compact smart-preview' },
          h('thead', {}, h('tr', {}, ['', '과목', '학년·학기', '시기', '단원명', '평가 요소', '평가 영역', '방법', '성취기준', '성취수준'].map((x) => h('th', {}, x)))),
          h('tbody', {}, found.map((p) => h('tr', { class: p._dup ? 'muted' : '' },
            h('td', {}, h('input', { type: 'checkbox', checked: p._on, onchange: (e) => { p._on = e.target.checked; } })),
            ...['subject'].map((k) => h('td', {}, h('input', { value: p[k] || '', oninput: (e) => { p[k] = e.target.value; } }))),
            h('td', { class: 'small' }, [p.grade, p.semester].filter(Boolean).join(' ')),
            ...['timing', 'unit', 'element', 'area', 'method'].map((k) => h('td', {}, h('input', { value: p[k] || '', oninput: (e) => { p[k] = e.target.value; } }))),
            h('td', { class: 'small', title: p.standard }, p.code || p.standard.slice(0, 30)),
            h('td', { class: 'small' }, p.levels ? `${p.levels.join('/')} (기준 ${Object.keys(p.rubric || {}).length})` : '-'))))))] :
        h('p', { class: 'alert warn' }, '평가 계획을 찾지 못했습니다. 표 머리글에 "성취기준"과 "시기·평가 요소·평가 방법" 같은 칸이 있는지 확인해 주세요.'));
    } catch (e) { clear(out, h('p', { class: 'alert error' }, e.message)); }
  };
  modal('📥 평가계획서 가져오기', h('div', { class: 'form' },
    h('p', { class: 'muted small' }, '학교 「교수학습 및 평가 운영계획」(한글 HWPX) 양식을 그대로 읽습니다: 제목의 과목·학년·학기, 시기 · 단원명(교수학습 내용) · 평가 요소 · 평가 영역 · 평가 방법 · 성취기준 · 성취수준(수준명 + 수준별 기준). 파일은 이 브라우저에서만 읽습니다.'),
    h('div', { class: 'row' }, h('label', {}, '파일 (한글 HWPX · 엑셀)'), file),
    h('div', { class: 'row' }, h('label', {}, '또는 붙여넣기'), ta),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', onclick: recognize }, '자동 인식'),
      h('label', { class: 'inline' }, '성취수준이 없는 계획의 수준 ', scale),
      h('label', { class: 'inline' }, toDb, ' 성취기준을 성취기준 DB에도 저장')),
    out), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const chosen = found.filter((p) => p._on);
      if (!chosen.length) { toast('가져올 계획이 없습니다.', 'error'); return; }
      for (const { _on, _dup, ...p } of chosen) {
        const lv = p.levels?.length >= 2 ? p.levels : null;
        await api('/api/records/evalPlans', { method: 'POST', body: { data: { ...p, scale: lv ? matchScale(lv, EVAL_SCALES) : scale.value, levels: lv || [], rubric: p.rubric || {}, scores: {} }, year: state.year } });
      }
      const n = toDb.checked ? await mergeStandards(groupsFromPlans(chosen), '학교 평가계획서') : 0;
      toast(`평가 계획 ${chosen.length}개를 만들었습니다.${n ? ` 성취기준 DB +${n}` : ''}`); close(); reload();
    } }, '선택한 계획 만들기'),
  ], { wide: true });
}

// ---------- 📏 수준·수준별 기준 편집 ----------

function editRubric(plan, onSaved) {
  let scale = scaleOf(plan);
  const rubric = { ...(plan.data.rubric || {}) };
  const elem = plan.data.element || plan.data.area || '학습 내용';
  const names = h('input', { value: scale.join(', ') });
  const preset = h('select', { onchange: (e) => { if (e.target.value) { names.value = EVAL_SCALES[e.target.value].join(', '); e.target.value = ''; drawInputs(); } } },
    h('option', { value: '' }, '수준 체계 바꾸기…'), Object.entries(EVAL_SCALES).map(([k, v]) => h('option', { value: k }, `${v.length}수준 · ${v.join('/')}`)));
  const box = h('div', {});
  const newNames = () => names.value.split(/[,/·]/).map((x) => x.trim()).filter(Boolean);
  const drawInputs = () => {
    const nn = newNames();
    clear(box, nn.map((lv, i) => {
      const old = scale[i];
      if (!rubric[lv] && old && rubric[old] && nn.length === scale.length) rubric[lv] = rubric[old];
      return h('div', { class: 'row' }, h('label', {}, h('span', { style: { color: LV_COLORS[i] } }, `${MARKS[i] || '·'} ${lv}`)),
        h('textarea', { rows: 2, 'data-lv': lv, value: rubric[lv] || '', placeholder: autoRubric(elem, nn)[lv], oninput: (e) => { rubric[lv] = e.target.value; } }));
    }));
  };
  names.addEventListener('change', drawInputs);
  drawInputs();
  modal(`📏 성취수준 · ${planTitle(plan)}`, h('div', { class: 'form' },
    plan.data.standard ? h('p', { class: 'muted small pre' }, plan.data.standard) : null,
    h('div', { class: 'row' }, h('label', {}, '수준명 (높은 순, 쉼표로)'), h('div', { class: 'wz-row' }, names, preset)),
    box,
    h('button', { type: 'button', class: 'btn small', onclick: () => { const nn = newNames(); const auto = autoRubric(elem, nn); nn.forEach((lv) => { if (!rubric[lv]) rubric[lv] = auto[lv]; }); drawInputs(); } }, '빈 칸에 기본 문장 채우기'),
    h('p', { class: 'hint' }, '수준별 기준은 기록할 때 보이고 교과발달상황 초안의 바탕이 됩니다. 수준명을 바꾸면 이미 기록한 결과도 같은 순서의 새 이름으로 옮겨집니다.')), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const nn = newNames();
      if (nn.length < 2) { toast('수준을 2개 이상 적어 주세요.', 'error'); return; }
      const scores = JSON.parse(JSON.stringify(plan.data.scores || {}));
      if (nn.join() !== scale.join()) for (const v of Object.values(scores)) { const i = scale.indexOf(v.level); if (v.level) v.level = i >= 0 && nn[i] ? nn[i] : ''; }
      const rb = Object.fromEntries(nn.map((lv) => [lv, rubric[lv] || '']).filter(([, v]) => v));
      try {
        const saved = await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, levels: nn, scale: matchScale(nn, EVAL_SCALES), rubric: rb, scores }, version: plan.version } });
        scale = nn; toast('저장했습니다.'); close(); onSaved(saved);
      } catch (e) { toast(e.message, 'error'); }
    } }, '저장'),
  ], { wide: true });
}

function scoreSheet(root, plan, reload) {
  const scale = scaleOf(plan);
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
        version = saved.version; plan.data = saved.data; plan.version = saved.version; status.textContent = '✓ 자동 저장됨';
      } catch (e) { status.textContent = ''; toast(e.message, 'error'); }
    }, 700);
  };
  const mode = remember('ev_mode') || 'tap';
  const names = state.students;
  const count = (lv) => names.filter((s) => scores[s]?.level === lv).length;
  const sum = h('div', { class: 'row-actions' });
  const drawSum = () => clear(sum, scale.map((lv) => h('span', { class: 'tag', style: { '--c': lvColor(plan, lv) } }, `${lvMark(plan, lv)} ${lv} ${count(lv)}`)),
    h('span', { class: 'tag ghost' }, `미기록 ${names.length - scale.reduce((a, lv) => a + count(lv), 0)}`));
  const csv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', '교과', '성취기준 코드', '성취기준', '평가 요소', '결과', '관찰 메모'].map(esc).join(',')];
    const sts = standardsOf(plan);
    names.forEach((s, i) => lines.push([i + 1, s, plan.data.subject, sts.map((x) => x.code).join(' '), sts.map((x) => x.text).join(' / '), plan.data.element, scores[s]?.level || '', scores[s]?.note || ''].map(esc).join(',')));
    download(`평가_${plan.data.subject}_${plan.data.area || plan.data.code || ''}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  const rubric = plan.data.rubric || {};
  const body = h('div', {});
  const tile = (s, i) => {
    scores[s] ||= {};
    const el = h('button', { class: 'eval-tile', onclick: () => {
      if (hasCriteria(plan)) { studentCard(plan, s, scores[s], () => { paint(); drawSum(); persist(); }); return; }
      const cur = scale.indexOf(scores[s].level);
      scores[s].level = cur === scale.length - 1 ? '' : scale[cur + 1];
      paint(); drawSum(); persist();
    } });
    const paint = () => {
      const lv = scores[s].level;
      el.style.setProperty('--c', lvColor(plan, lv));
      el.classList.toggle('set', !!lv);
      clear(el, h('span', { class: 'muted small' }, i + 1), h('strong', {}, s), h('span', { class: 'ev-lv' }, lv ? `${lvMark(plan, lv)} ${lv}` : '—'), (scores[s].note || scores[s].evidence || scores[s].good?.length) ? h('span', { class: 'ev-note' }, '📝') : null);
    };
    paint();
    return el;
  };
  const phraseChips = (s, input) => h('div', { class: 'ev-chips' }, ['적극적으로 참여함', '친구를 도와줌', '설명을 듣고 스스로 수정함', '추가 지도 필요'].map((t) => h('button', { type: 'button', class: 'chip-btn', onclick: () => { input.value = input.value ? `${input.value}, ${t}` : t; scores[s].note = input.value; persist(); } }, t)));
  const draw = () => {
    if (mode === 'tap') {
      clear(body, h('div', { class: 'eval-grid' }, names.map(tile)),
        h('p', { class: 'hint' }, hasCriteria(plan) ? '학생을 누르면 평가 카드가 열립니다: 관점별 수준 · 강점/보완 칩 · 산출물 근거 → 교과발달 문장 미리보기.' : `학생을 누를 때마다 ${scale.join(' → ')} → 지움 순서로 바뀌고 자동 저장됩니다. 체육·음악 실기처럼 그 자리에서 평가할 때 쓰세요. 학생마다 다른 문장이 필요하면 [🧩 평가 관점 만들기]를 쓰세요.`));
    } else if (hasCriteria(plan)) {
      const crits = plan.data.criteria;
      clear(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table score' },
        h('thead', {}, h('tr', {}, ['번호', '이름', ...crits.map((c) => c.name), '종합', '근거 (강점·보완·산출물)'].map((x) => h('th', {}, x)))),
        h('tbody', {}, names.map((s, i) => {
          scores[s] ||= {};
          const sc = scores[s];
          const tr = h('tr', {});
          const paintRow = () => clear(tr, h('td', { class: 'num' }, i + 1), h('td', {}, h('strong', {}, s)),
            crits.map((c) => h('td', {}, h('select', { onchange: (e) => { (sc.crit ||= {})[c.name] = e.target.value; if (!e.target.value) delete sc.crit[c.name]; if (!sc.manual) sc.level = overallLevel(scale, sc.crit) || sc.level; paintRow(); drawSum(); persist(); } },
              h('option', { value: '' }, '-'), scale.map((lv) => h('option', { value: lv, selected: sc.crit?.[c.name] === lv }, lv))))),
            h('td', {}, h('select', { style: sc.level ? { color: lvColor(plan, sc.level), fontWeight: '800' } : {}, onchange: (e) => { sc.level = e.target.value; sc.manual = !!e.target.value; paintRow(); drawSum(); persist(); } },
              h('option', { value: '' }, '-'), scale.map((lv) => h('option', { value: lv, selected: sc.level === lv }, lv)))),
            h('td', {}, h('button', { class: 'link-btn small', onclick: () => studentCard(plan, s, sc, () => { paintRow(); drawSum(); persist(); }) },
              [sc.good?.length ? `👍${sc.good.length}` : '', sc.need?.length ? `🌱${sc.need.length}` : '', sc.evidence ? '📎' : '', sc.note ? '📝' : ''].filter(Boolean).join(' ') || '+ 근거')));
          paintRow();
          return tr;
        })))),
        h('p', { class: 'hint' }, '관점별 수준을 고르면 종합 수준이 자동 계산됩니다(직접 바꾸면 그 값 유지). [근거]에서 강점·보완 칩과 산출물 내용을 남기면 학생마다 다른 교과발달 문장이 만들어집니다.'));
    } else {
      clear(body, h('div', { class: 'table-wrap' }, h('table', { class: 'table score' },
        h('thead', {}, h('tr', {}, ['번호', '이름', ...scale, '관찰 메모 (특기사항 참고)'].map((x) => h('th', {}, x)))),
        h('tbody', {}, names.map((s, i) => {
          scores[s] ||= {};
          const note = h('input', { value: scores[s].note || '', placeholder: '관찰 내용', oninput: (e) => { scores[s].note = e.target.value; persist(); } });
          return h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, h('strong', {}, s)),
            scale.map((lv) => h('td', { class: 'center' }, h('input', { type: 'radio', name: `lv_${i}`, checked: scores[s].level === lv, 'aria-label': `${s} ${lv}`, onchange: () => { scores[s].level = lv; drawSum(); persist(); } }))),
            h('td', {}, note, phraseChips(s, note)));
        })))));
    }
  };
  const fillRest = h('select', { onchange: (e) => {
    const lv = e.target.value; e.target.value = '';
    if (!lv) return;
    names.forEach((s) => { scores[s] ||= {}; if (!scores[s].level) scores[s].level = lv; });
    draw(); drawSum(); persist(); toast(`미기록 학생을 "${lv}"(으)로 채웠습니다.`);
  } }, h('option', { value: '' }, '미기록 일괄 지정…'), scale.map((lv) => h('option', { value: lv }, lv)));
  clear(root,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => reload() }, '← 현황'),
      h('strong', {}, planTitle(plan)), plan.data.code ? h('span', { class: 'tag ghost' }, plan.data.code) : null,
      h('div', { class: 'seg' }, [['tap', '즉석 평가'], ['table', '표·메모']].map(([v, l]) => h('button', { class: mode === v ? 'on' : '', onclick: () => { remember('ev_mode', v); reload(plan.id); } }, l))),
      status, h('span', { class: 'grow' }),
      fillRest,
      h('button', { class: `btn ${hasCriteria(plan) ? '' : 'primary'}`, onclick: () => editCriteria(plan, async (patch) => { try { const saved = await api(`/api/records/evalPlans/${plan.id}`, { method: 'PUT', body: { data: { ...plan.data, ...patch, scores }, version } }); toast('저장했습니다.'); reload(saved.id); } catch (e) { toast(e.message, 'error'); } }) }, hasCriteria(plan) ? `🧩 평가 관점 ${plan.data.criteria.length}` : '🧩 평가 관점 만들기'),
      h('button', { class: 'btn', onclick: () => editRubric(plan, (p) => reload(p.id)) }, '📏 성취수준'),
      h('button', { class: 'btn', onclick: () => openRecordForm('evalPlans', plan, { onSaved: (r) => reload(r?.id) }) }, '계획 수정'),
      h('button', { class: 'btn', onclick: csv }, 'CSV (나이스 입력용)')),
    h('div', { class: 'ev-head' },
      h('div', { class: 'muted small' }, [plan.data.grade, plan.data.semester, plan.data.timing, plan.data.area, plan.data.method].filter(Boolean).join(' · ')),
      standardsOf(plan).map((x) => h('div', {}, x.code ? h('span', { class: 'tag ghost' }, x.code) : h('span', { class: 'muted small' }, '성취기준 '), ' ', x.text)),
      plan.data.element ? h('div', {}, h('span', { class: 'muted small' }, '평가 요소 '), h('strong', {}, plan.data.element)) : null,
      hasCriteria(plan) ? h('details', { class: 'crit-matrix' }, h('summary', {}, `🧩 평가 관점 ${plan.data.criteria.length}개 · 수준별 기준 보기`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table compact' }, h('thead', {}, h('tr', {}, h('th', {}, '관점'), scale.map((lv) => h('th', { style: { color: lvColor(plan, lv) } }, lv)))),
          h('tbody', {}, plan.data.criteria.map((c) => h('tr', {}, h('td', {}, h('strong', {}, c.name)), scale.map((lv) => h('td', { class: 'small' }, c.rubric?.[lv] || '')))))))) : null,
      Object.keys(rubric).length ? h('div', { class: 'rubric-row' }, scale.map((lv) => rubric[lv] ? h('div', { class: 'rubric-cell', style: { '--c': lvColor(plan, lv) } }, h('strong', {}, `${lvMark(plan, lv)} ${lv}`), h('div', { class: 'small' }, rubric[lv])) : null))
        : h('button', { class: 'link-btn', onclick: () => editRubric(plan, (p) => reload(p.id)) }, '+ 성취수준별 기준 정하기')),
    !names.length ? emptyStudents() : [sum, body]);
  drawSum(); draw();
}

// ---------- 학생별 결과 ----------

export async function studentEvalView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const all = (await api(`/api/records/evalPlans?year=${state.year}`)).sort((a, b) => String(a.data.subject).localeCompare(String(b.data.subject), 'ko'));
  if (!all.length) return clear(root, h('p', { class: 'muted' }, '평가 기록이 없습니다.'));
  const subj = remember('ev_subj2') || '';
  const plans = all.filter((p) => !subj || p.data.subject === subj);
  const subjects = [...new Set(all.map((p) => p.data.subject).filter(Boolean))];
  const detail = h('div', {});
  const show = (name) => clear(detail, h('div', { class: 'card' }, h('h3', {}, `🧒 ${name}`),
    h('ul', { class: 'list' }, plans.filter((p) => p.data.scores?.[name]).map((p) => h('li', {},
      h('span', { class: 'tag', style: { '--c': lvColor(p, p.data.scores[name].level) } }, p.data.scores[name].level || '-'), ' ', h('strong', {}, planTitle(p)),
      p.data.scores[name].note ? h('div', { class: 'small muted' }, p.data.scores[name].note) : null))),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn small', onclick: () => copyText(draftFor(name, plans)) }, '✨ 초안 복사'),
      h('a', { class: 'btn small', href: '#/desk/eval/remarks' }, '특기사항 쓰기 →'))));
  clear(root,
    h('div', { class: 'toolbar' }, h('div', { class: 'seg' }, ['', ...subjects].map((x) => h('button', { class: subj === x ? 'on' : '', onclick: () => { remember('ev_subj2', x); studentEvalView(root); } }, x || '전체 교과')))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table compact eval-matrix' },
      h('thead', {}, h('tr', {}, h('th', {}, '이름'), plans.map((p) => h('th', { title: `${p.data.code || ''} ${p.data.standard || ''}` }, h('div', {}, p.data.subject), h('div', { class: 'muted small' }, p.data.area || p.data.code || ''))), h('th', {}, '미기록'))),
      h('tbody', {}, students.map((s) => {
        const n = s.data.name;
        const miss = plans.filter((p) => !p.data.scores?.[n]?.level).length;
        return h('tr', { class: 'click', onclick: () => show(n) }, h('td', {}, h('strong', {}, n)),
          plans.map((p) => { const lv = p.data.scores?.[n]?.level; return h('td', { class: 'center', title: lv || '', style: lv ? { color: lvColor(p, lv), fontWeight: '800' } : {} }, lv ? lvMark(p, lv) : ''); }),
          h('td', { class: `center ${miss ? 'danger' : 'muted'}` }, miss || '✓'));
      })))),
    h('p', { class: 'hint' }, '◎ 최상 · ○ 중간 · △ 낮음 (단계 수에 따라 달라짐). 줄을 누르면 그 학생의 결과·메모와 특기사항 초안을 봅니다.'),
    detail);
}

// 교과발달상황 초안: 단원 + 그 학생 수준의 기준 문장(없으면 기본 문장)을 생활기록부 문체로 + 관찰 메모
//   기록에 없는 내용은 만들지 않음. 시기 순서로 이어 붙임
export function draftFor(name, plans) {
  const parts = [];
  for (const p of sortPlans(plans)) {
    const sc = p.data.scores?.[name];
    if (!sc?.level) continue;
    const scale = scaleOf(p);
    if (hasCriteria(p) || sc.good?.length || sc.need?.length || sc.evidence || p.data.rubric?.[sc.level]) {
      const t = composeRemark({ ...p.data, levels: scale }, sc, name);
      if (t) { parts.push(t); continue; }
    }
    const i = scale.indexOf(sc.level);
    const elem = p.data.element || p.data.area || '학습 내용';
    const u = unitName(p);
    const topic = u ? `'${u}' 단원에서 ` : p.data.area && p.data.element ? `'${p.data.area}' 영역에서 ` : '';
    const base = p.data.rubric?.[sc.level]
      || (i === 0 ? `${josa(elem)} 정확히 이해하고 능숙하게 수행함`
        : i === scale.length - 1 ? `${josa(elem)} 익히기 위해 꾸준히 노력하고 있으며 지속적인 지도가 필요함`
          : `${josa(elem)} 이해하고 대체로 바르게 수행함`);
    parts.push(toRecordStyle(`${topic}${base}`));
    if (sc.note) parts.push(endDot(sc.note));
  }
  return parts.join(' ');
}

// ---------- 특기사항 ----------

export async function remarksView(root) {
  const students = await loadStudents();
  if (!students.length) return clear(root, emptyStudents());
  const d = await api(`/api/bundle?year=${state.year}&modules=remarks,notes,evalPlans`);
  const area = remember('rm_area') || '교과학습발달상황';
  const subjects = [...new Set(d.evalPlans.map((p) => p.data.subject).filter(Boolean))];
  const subject = remember('rm_subj') || subjects[0] || '';
  const limit = Number(remember('rm_limit')) || 1500;
  const reload = () => remarksView(root);
  const areas = ['교과학습발달상황', '행동특성 및 종합의견', '창체-자율', '창체-동아리', '창체-진로', '기타'];
  const subjPlans = sortPlans(d.evalPlans.filter((p) => p.data.subject === subject));
  const find = (name) => d.remarks.find((r) => r.data.student === name && r.data.area === area && (area !== '교과학습발달상황' || (r.data.subject || '') === subject));
  const refs = (name) => [
    ...d.notes.filter((n) => n.data.student === name).map((n) => `[${n.data.date} ${n.data.category || ''}] ${n.data.content}`),
    ...d.evalPlans.filter((p) => p.data.scores?.[name]?.level && (area !== '교과학습발달상황' || p.data.subject === subject)).map((p) => `[${planTitle(p)} · ${p.data.scores[name].level}] ${p.data.scores[name].note || ''}`),
  ];
  const draftOf = (name) => (area === '교과학습발달상황'
    ? draftFor(name, subjPlans)
    : d.notes.filter((n) => n.data.student === name && ['칭찬', '관찰', '생활', '학습'].includes(n.data.category)).slice(-4).map((n) => endDot(n.data.content)).join(' '));
  const rows = [];
  const row = (s) => {
    const name = s.data.name;
    let rec = find(name);
    const ta = h('textarea', { rows: 3, value: rec?.data.content || '', placeholder: '특기사항' });
    const cnt = h('span', { class: 'muted small' });
    const st = h('span', { class: 'muted small' });
    const paint = () => { const b = byteLen(ta.value); cnt.textContent = `${[...ta.value].length}자 · ${b}바이트`; cnt.classList.toggle('danger', b > limit); };
    let timer;
    const save = () => {
      paint(); st.textContent = '…';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const data = { student: name, area, subject: area === '교과학습발달상황' ? subject : '', content: ta.value };
        try {
          rec = rec ? await api(`/api/records/remarks/${rec.id}`, { method: 'PUT', body: { data, version: rec.version } }) : await api('/api/records/remarks', { method: 'POST', body: { data, year: state.year } });
          st.textContent = '✓';
        } catch (e) { st.textContent = ''; toast(e.message, 'error'); }
      }, 800);
    };
    ta.addEventListener('input', save);
    paint();
    const r = refs(name);
    rows.push({ name, ta, save });
    return h('div', { class: 'remark-row' },
      h('div', { class: 'rm-name' }, h('span', { class: 'muted small' }, s.data.num ?? ''), ' ', h('strong', {}, name)),
      h('div', { class: 'rm-body' }, ta, h('div', { class: 'row-actions' }, cnt, st,
        h('button', { class: 'link-btn', onclick: () => { const t = draftOf(name); if (!t) { toast('초안을 만들 평가 결과·기록이 없습니다.', 'error'); return; } ta.value = ta.value ? `${ta.value} ${t}` : t; save(); } }, '✨ 초안'),
        h('span', { class: 'grow' }),
        r.length ? h('details', { class: 'rm-ref' }, h('summary', {}, `참고 ${r.length}건`), h('ul', { class: 'list small' }, r.map((x) => h('li', {}, x)))) : h('span', { class: 'muted small' }, '참고 기록 없음'))));
  };
  const bulk = () => {
    let n = 0;
    for (const x of rows) if (!x.ta.value.trim()) { const t = draftOf(x.name); if (t) { x.ta.value = t; x.save(); n++; } }
    toast(n ? `빈칸 ${n}명에 초안을 넣었습니다. 꼭 읽고 고쳐 주세요.` : '초안을 넣을 빈칸(또는 평가 결과)이 없습니다.', n ? 'ok' : 'error');
  };
  const exportCsv = () => {
    const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const lines = [['번호', '이름', '영역', '과목', '내용', '바이트'].map(esc).join(',')];
    for (const s of students) { const r = find(s.data.name); lines.push([s.data.num, s.data.name, area, area === '교과학습발달상황' ? subject : '', r?.data.content || '', byteLen(r?.data.content)].map(esc).join(',')); }
    download(`특기사항_${area}${area === '교과학습발달상황' ? `_${subject}` : ''}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  clear(root,
    h('div', { class: 'toolbar' },
      h('select', { onchange: (e) => { remember('rm_area', e.target.value); reload(); } }, areas.map((a) => h('option', { value: a, selected: a === area }, a))),
      area === '교과학습발달상황' ? h('select', { onchange: (e) => { remember('rm_subj', e.target.value); reload(); } },
        [...new Set([...subjects, subject].filter(Boolean))].map((x) => h('option', { value: x, selected: x === subject }, x))) : null,
      h('label', { class: 'inline' }, '기준 ', h('input', { type: 'number', value: limit, style: { width: '80px' }, onchange: (e) => { remember('rm_limit', Number(e.target.value) || 1500); reload(); } }), '바이트'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: bulk }, '✨ 빈칸 모두 초안 채우기'),
      h('button', { class: 'btn', onclick: () => copyText(students.map((s) => `${s.data.num ?? ''}\t${s.data.name}\t${find(s.data.name)?.data.content || ''}`).join('\n')) }, '전체 복사'),
      h('button', { class: 'btn', onclick: exportCsv }, 'CSV')),
    area === '교과학습발달상황' ? h('div', { class: 'toolbar ai-bar' },
      h('span', { class: 'small' }, '🤖 AI와 주고받기 (Claude 프로젝트·스킬, 젬스 등 · 학생 이름은 보내지 않음)'), h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: () => { if (!subjPlans.length) { toast('이 과목의 평가 기록이 없습니다.', 'error'); return; } copyText(remarkRequest({ subject, plans: subjPlans, students, limit })); } }, '① 📋 AI 요청문 복사'),
      h('button', { class: 'btn small', onclick: () => importAiRemarks(students, (get, over) => { let n = 0; rows.forEach((x, i) => { const t = get(i); if (t && t !== '기록 없음' && (over || !x.ta.value.trim())) { x.ta.value = t; x.save(); n++; } }); return n; }) }, '② 📥 AI 결과 붙여넣기'),
      h('button', { class: 'btn small', onclick: () => downloadGuide(limit) }, '⬇ AI 지침(스킬) 파일')) : null,
    area === '교과학습발달상황' && !subjPlans.length ? h('p', { class: 'alert warn' }, `${subject || '이 교과'}의 평가 기록이 없어 자동 초안을 만들 수 없습니다. 평가 → 평가 현황·기록에서 먼저 기록해 주세요.`) : null,
    h('div', { class: 'remarks' }, students.map(row)),
    h('p', { class: 'hint' }, '✨ 교과학습발달상황 초안은 평가계획의 단원 + 학생이 받은 성취수준의 기준 문장(생활기록부 문체 ~함/~음으로 바꿈)과 관찰 메모를 시기 순서로 이어 붙인 것이며, 기록에 없는 내용은 만들지 않습니다. 반드시 읽고 다듬어 주세요. 입력하면 자동 저장(암호화)됩니다. 바이트는 한글 3·영문 1·줄바꿈 2로 계산한 참고값입니다 [확인 필요].'));
}

// ---------- 📄 평가계획서: 학교 양식(교수학습 및 평가 운영계획) 표로 보기·인쇄·한글로 복사 ----------

const docTitle = (subject) => `${KNOWN_SUBJECTS.includes(subject) ? `${subject}과` : subject} 교수학습 및 평가 운영계획`;
function docTable({ subject, semester, grade, plans }) {
  const br = (t) => esc(t).replace(/\n/g, '<br>');
  const rows = plans.map((p) => {
    const lv = scaleOf(p);
    const n = lv.length;
    const unit = `${p.data.unit ? `<b>${esc(p.data.unit)}</b>` : ''}${p.data.content ? `${p.data.unit ? '<br><br>' : ''}${p.data.content.split('\n').map((x) => `▪ ${esc(x)}`).join('<br>')}` : ''}`;
    const std = standardsOf(p).map((x) => `${esc(x.code)} ${esc(x.text)}`.trim()).join('<br>');
    return lv.map((name, i) => `<tr>${i === 0 ? `<td rowspan="${n}" class="c">${br(p.data.timing)}</td><td rowspan="${n}" class="l">${unit}</td><td rowspan="${n}" class="l">${br(p.data.element)}</td><td rowspan="${n}" class="c">${br(p.data.area)}</td><td rowspan="${n}" class="c">${br(p.data.method)}</td><td rowspan="${n}" class="l">${std}</td>` : ''}<td class="c lv">${esc(name)}</td><td class="l">${br(p.data.rubric?.[name] || '')}</td></tr>`).join('');
  }).join('');
  return `<table class="evdoc"><colgroup><col style="width:8%"><col style="width:17%"><col style="width:12%"><col style="width:8%"><col style="width:8%"><col style="width:17%"><col style="width:7%"><col style="width:23%"></colgroup>
<tr><th colspan="8" class="title">${esc(docTitle(subject))}</th></tr>
<tr><td colspan="5" class="c">${esc(`${state.year}학년도 ${semester || ''}`.trim())}</td><td colspan="3" class="c">${esc(grade || '')}</td></tr>
<tr><th>시기</th><th>단원명<br>(교수학습 내용)</th><th>평가 요소</th><th>평가 영역</th><th>평가 방법</th><th>성취기준</th><th colspan="2">성취수준</th></tr>
${rows}
<tr><td colspan="8" class="l">▶ ${esc(`${semester || ''} ${subject}`.trim())} 총 횟수: ${plans.length}회</td></tr></table>`;
}
const DOC_CSS = `body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;margin:16px;color:#000}
table.evdoc{border-collapse:collapse;width:100%;font-size:9.5pt;margin-bottom:28px;page-break-inside:auto}
.evdoc th,.evdoc td{border:1px solid #000;padding:4px 5px;vertical-align:middle}
.evdoc th{background:#e8edf5;font-weight:700;text-align:center}
.evdoc th.title{font-size:15pt;background:#fff;border:none;padding:6px 0 10px}
.evdoc .c{text-align:center}.evdoc .l{text-align:left}.evdoc .lv{white-space:nowrap}
.evdoc tr{page-break-inside:avoid}`;
const fullDoc = (tables) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>교수학습 및 평가 운영계획</title><style>${DOC_CSS}</style></head><body>${tables.join('\n')}</body></html>`;

export async function planDocView(root) {
  const [all, info] = await Promise.all([api(`/api/records/evalPlans?year=${state.year}`), loadClass()]);
  const reload = () => planDocView(root);
  if (!all.length) {
    return clear(root, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '📄'), h('p', {}, '평가 계획이 없습니다.'),
      h('div', { class: 'row-actions center' }, h('button', { class: 'btn primary', onclick: () => planWizard(reload) }, '🧭 성취기준으로 계획 만들기'), h('a', { class: 'btn', href: '#/desk/eval/overview' }, '평가 현황으로'))));
  }
  const subjects = [...new Set(all.map((p) => p.data.subject).filter(Boolean))];
  const sems = [...new Set(all.map((p) => p.data.semester || info?.data.semester || '').filter(Boolean))].sort();
  let subj = remember('pd_subj') || '';
  if (subj && !subjects.includes(subj)) subj = '';
  const sem = remember('pd_sem') || '';
  const pick = subj ? [subj] : subjects;
  const docs = pick.map((s) => {
    const plans = sortPlans(all.filter((p) => p.data.subject === s && (!sem || (p.data.semester || info?.data.semester) === sem)));
    return { subject: s, semester: sem || plans[0]?.data.semester || info?.data.semester || '', grade: plans[0]?.data.grade || info?.data.grade || '', plans };
  }).filter((d) => d.plans.length);
  const tables = docs.map(docTable);
  const html = fullDoc(tables);
  const sheet = h('div', { class: 'evdoc-wrap' });
  sheet.innerHTML = `<style>${DOC_CSS.replace(/body\{[^}]*\}/, '')}</style>${tables.join('')}`;
  const name = `교수학습및평가운영계획_${subj || '전체'}${sem ? `_${sem}` : ''}`;
  const print = () => { const w = window.open('', '_blank'); if (!w) { toast('팝업이 막혔습니다. 팝업을 허용해 주세요.', 'error'); return; } w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); };
  const copyHwp = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([sheet.innerText], { type: 'text/plain' }) })]);
      toast('복사했습니다. 한글 문서에서 붙여넣기(Ctrl+V) 하면 표 모양 그대로 들어갑니다.');
    } catch {
      const range = document.createRange(); range.selectNodeContents(sheet);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      const ok = document.execCommand('copy'); sel.removeAllRanges();
      toast(ok ? '복사했습니다. 한글에서 붙여넣기 하세요.' : '복사하지 못했습니다. [HTML 저장]을 써 주세요.', ok ? 'ok' : 'error');
    }
  };
  const csv = () => {
    const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const lines = [['과목', '학년', '학기', '시기', '단원명', '교수학습 내용', '평가 요소', '평가 영역', '평가 방법', '성취기준', '성취수준', '수준별 기준'].map(q).join(',')];
    for (const d of docs) for (const p of d.plans) for (const lv of scaleOf(p)) lines.push([d.subject, p.data.grade || d.grade, p.data.semester || d.semester, p.data.timing, p.data.unit, p.data.content, p.data.element, p.data.area, p.data.method, p.data.standard, lv, p.data.rubric?.[lv] || ''].map(q).join(','));
    download(`${name}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  clear(root,
    h('div', { class: 'toolbar no-print' },
      h('div', { class: 'seg' }, ['', ...subjects].map((x) => h('button', { class: subj === x ? 'on' : '', onclick: () => { remember('pd_subj', x); reload(); } }, x || '전체 과목'))),
      sems.length ? h('div', { class: 'seg' }, ['', ...sems].map((x) => h('button', { class: sem === x ? 'on' : '', onclick: () => { remember('pd_sem', x); reload(); } }, x || '전체 학기'))) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => planWizard(reload, { subject: subj }) }, '🧭 계획 추가'),
      h('button', { class: 'btn primary', onclick: copyHwp }, '📋 한글로 복사'),
      h('button', { class: 'btn', onclick: print }, '🖨 인쇄·PDF'),
      h('button', { class: 'btn', onclick: () => download(`${name}.html`, html, 'text/html') }, 'HTML 저장'),
      h('button', { class: 'btn', onclick: csv }, 'CSV')),
    !info ? h('p', { class: 'alert warn no-print' }, '학년 칸이 비어 있으면 [평가 현황·기록 → 학급 설정]에서 학년·학기를 정해 주세요.') : null,
    sheet,
    h('p', { class: 'hint no-print' }, '학교 「교수학습 및 평가 운영계획」 양식과 같은 칸 구성(시기 · 단원명(교수학습 내용) · 평가 요소 · 평가 영역 · 평가 방법 · 성취기준 · 성취수준)입니다. [📋 한글로 복사] 후 한글 문서에 붙여넣거나, HTML 저장 파일을 한글에서 열어 HWPX로 저장할 수 있습니다 [확인 필요: 한글 버전별 서식 차이]. 계획 내용은 [평가 현황·기록]에서 카드를 눌러 고칩니다.'));
}

// ---------- 🎯 성취기준 DB ----------

export async function standardsView(root) {
  const [libs, info] = await Promise.all([loadLibs(), loadClass()]);
  const reload = () => standardsView(root);
  const band = remember('sd_band') ?? (info ? bandOf(info.data.grade) : '');
  const subj = remember('sd_subj') || '';
  const q = remember('sd_q') || '';
  const bands = ['', '1~2학년', '3~4학년', '5~6학년'];
  const inBand = libs.filter((l) => !band || !l.data.band || l.data.band === band);
  const subjects = [...new Set(inBand.map((l) => l.data.subject))];
  const shown = inBand.filter((l) => !subj || l.data.subject === subj);
  const total = shown.reduce((a, l) => a + (l.data.items || []).length, 0);
  const saveItems = async (lib, items) => { await api(`/api/records/standards/${lib.id}`, { method: 'PUT', body: { data: { ...lib.data, items }, version: lib.version } }); reload(); };
  const addOne = (lib) => {
    const f = { area: h('input', { placeholder: '예) 물질' }), code: h('input', { placeholder: '[6과05-01]' }), text: h('textarea', { rows: 3, placeholder: '성취기준 문장' }) };
    modal(`+ 성취기준 · ${lib.data.subject} ${lib.data.band || ''}`, h('div', { class: 'form' }, ...Object.entries({ area: '영역', code: '코드', text: '성취기준' }).map(([k, l]) => h('div', { class: 'row' }, h('label', {}, l), f[k]))), [
      (close) => h('button', { class: 'btn', onclick: close }, '취소'),
      (close) => h('button', { class: 'btn primary', onclick: async () => {
        const code = f.code.value.trim() ? `[${f.code.value.trim().replace(/^\[|\]$/g, '')}]` : '';
        if (!f.text.value.trim()) { toast('성취기준 문장을 적어 주세요.', 'error'); return; }
        close(); await saveItems(lib, [...(lib.data.items || []), { area: f.area.value.trim(), code, text: f.text.value.trim() }]);
      } }, '추가'),
    ]);
  };
  const exportJson = () => download(`성취기준DB_${subj || '전체'}.json`, JSON.stringify(shown.map((l) => ({ subject: l.data.subject, band: l.data.band, curriculum: l.data.curriculum, source: l.data.source, items: l.data.items || [] })), null, 1));
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, bands.map((b) => h('button', { class: band === b ? 'on' : '', onclick: () => { remember('sd_band', b); reload(); } }, b || '전체 학년군'))),
      subjects.length ? h('div', { class: 'seg' }, ['', ...subjects].map((x) => h('button', { class: subj === x ? 'on' : '', onclick: () => { remember('sd_subj', x); reload(); } }, x || '전체 과목'))) : null,
      h('input', { type: 'search', placeholder: '코드·낱말', value: q, onchange: (e) => { remember('sd_q', e.target.value); reload(); } }),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: exportJson, disabled: !shown.length }, '내보내기'),
      h('button', { class: 'btn primary', onclick: () => importStandards(reload, { subject: subj, band }) }, '📥 성취기준 넣기')),
    h('p', { class: 'muted small' }, `과목·학년군 ${shown.length}묶음 · 성취기준 ${total}개. 앱에 미리 넣어 둔 성취기준은 없습니다 — 정확성을 위해 교육과정 문서(국가교육과정정보센터 NCIC 등)나 학교 평가계획서에서 직접 가져옵니다.`),
    shown.length ? shown.map((lib) => {
      const items = (lib.data.items || []).filter((x) => !q || `${x.code} ${x.text} ${x.area}`.includes(q));
      const areas = [...new Set(items.map((x) => x.area || '(영역 미지정)'))];
      return h('section', { class: 'card std-lib' },
        h('div', { class: 'card-head' }, h('strong', {}, `${lib.data.subject}`), h('span', { class: 'tag ghost' }, lib.data.band || '학년군 미지정'), lib.data.curriculum ? h('span', { class: 'tag ghost' }, lib.data.curriculum) : null,
          h('span', { class: 'muted small' }, `${(lib.data.items || []).length}개${lib.data.source ? ` · 출처: ${lib.data.source}` : ''}`), h('span', { class: 'grow' }),
          h('button', { class: 'btn small primary', onclick: () => planWizard(() => { location.hash = '#/desk/eval/overview'; }, { subject: lib.data.subject }) }, '🧭 계획 만들기'),
          h('button', { class: 'btn small', onclick: () => addOne(lib) }, '+'),
          h('button', { class: 'btn small', onclick: () => openRecordForm('standards', lib, { onSaved: reload }) }, '⚙')),
        areas.map((a) => h('details', { class: 'std-area', open: areas.length <= 4 || !!q },
          h('summary', {}, h('strong', {}, a), h('span', { class: 'muted small' }, ` ${items.filter((x) => (x.area || '(영역 미지정)') === a).length}개`)),
          h('ul', { class: 'std-list' }, items.filter((x) => (x.area || '(영역 미지정)') === a).map((x) => h('li', {},
            h('span', { class: 'tag ghost' }, x.code || '-'), h('span', { class: 'grow' }, x.text),
            h('button', { class: 'icon-btn small', title: '삭제', onclick: async () => { if (await confirmBox(`${x.code} 성취기준을 DB에서 뺄까요?`)) saveItems(lib, (lib.data.items || []).filter((y) => y !== x)); } }, '✕')))))));
    }) : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🎯'),
      h('p', {}, '성취기준 DB가 비어 있습니다. 세 가지 방법으로 채울 수 있습니다.'),
      h('ol', { class: 'small left' },
        h('li', {}, '교육과정 문서(국가교육과정정보센터 NCIC의 과목별 교육과정 HWP/PDF)에서 성취기준 부분을 복사해 [📥 성취기준 넣기]에 붙여넣기 — 영역 제목 줄과 [코드] 줄을 자동으로 나눕니다.'),
        h('li', {}, '[평가 현황·기록 → 📥 평가계획서 가져오기]로 학교 평가계획서를 올리면 성취기준이 자동으로 쌓입니다.'),
        h('li', {}, '동료 선생님이 [내보내기]한 JSON 파일 넣기.'))));
}

function importStandards(reload, pre = {}) {
  const file = h('input', { type: 'file', accept: '.hwpx,.xlsx,.csv,.txt,.json' });
  const ta = h('textarea', { rows: 8, placeholder: '예) 교육과정 문서에서 복사:\n(1) 물질\n[6과05-01] 알갱이의 크기가 다른 …\n[6과05-02] …\n(2) 지구와 우주\n[6과06-01] …' });
  const subj = h('input', { value: pre.subject || '', placeholder: '코드로 과목을 알 수 없을 때 (예: 디지털온)' });
  const out = h('div', {});
  let groups = [];
  const recognize = async () => {
    try {
      const f = file.files[0];
      if (f && f.name.toLowerCase().endsWith('.json')) {
        groups = JSON.parse(await f.text()).filter((g) => g.subject && Array.isArray(g.items));
      } else {
        const src = f ? await readSource(f) : readText(ta.value);
        if (f && ta.value.trim()) { const x = readText(ta.value); src.tables.push(...x.tables); src.lines.push(...x.lines); }
        groups = parseStandards(src, { subject: subj.value.trim() || undefined, band: pre.band || undefined });
      }
      clear(out, groups.length ? h('div', {}, groups.map((g) => h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('input', { value: g.subject, placeholder: '과목', style: { width: '120px' }, oninput: (e) => { g.subject = e.target.value; } }),
          h('select', { onchange: (e) => { g.band = e.target.value; } }, ['', '1~2학년', '3~4학년', '5~6학년'].map((b) => h('option', { value: b, selected: b === g.band }, b || '학년군'))),
          h('span', { class: 'muted small' }, `${g.items.length}개 · 영역 ${new Set(g.items.map((x) => x.area)).size}개`)),
        h('ul', { class: 'std-list small' }, g.items.slice(0, 6).map((x) => h('li', {}, h('span', { class: 'tag ghost' }, x.code), h('span', { class: 'muted' }, x.area ? `[${x.area}] ` : ''), x.text)),
          g.items.length > 6 ? h('li', { class: 'muted' }, `… 외 ${g.items.length - 6}개`) : null))))
        : h('p', { class: 'alert warn' }, '[6과05-01] 같은 코드가 있는 성취기준 줄을 찾지 못했습니다.'));
    } catch (e) { clear(out, h('p', { class: 'alert error' }, e.message)); }
  };
  modal('📥 성취기준 넣기', h('div', { class: 'form' },
    h('p', { class: 'muted small' }, '[코드] 성취기준 줄은 성취기준으로, 그 위의 짧은 제목 줄("(1) 물질", "[물질]")은 영역으로 읽습니다. 코드 앞 숫자로 학년군(2→1~2, 4→3~4, 6→5~6학년), 코드 글자로 과목(국·수·사·과·영·도·실·체·음·미 등)을 정합니다.'),
    h('div', { class: 'row' }, h('label', {}, '파일 (HWPX·엑셀·JSON)'), file),
    h('div', { class: 'row' }, h('label', {}, '또는 붙여넣기'), ta),
    h('div', { class: 'row' }, h('label', {}, '과목 (선택)'), subj),
    h('button', { class: 'btn primary', onclick: recognize }, '자동 인식'), out), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      if (!groups.length) { await recognize(); if (!groups.length) return; }
      const n = await mergeStandards(groups.filter((g) => g.subject), file.files[0]?.name || '붙여넣기');
      toast(`성취기준 ${n}개를 더했습니다. (이미 있는 코드는 건너뜀)`); close(); reload();
    } }, 'DB에 저장'),
  ], { wide: true });
}
