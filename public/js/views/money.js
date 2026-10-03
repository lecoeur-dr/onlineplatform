// 💰 예산·물품: 전체 대시보드 · 학교본예산 · 공모사업 · 집행 입력 · 물품 신청 · 공모 안내
//   구조는 같고 재원만 다름: 재원(학교본예산 | 공모사업) → 사업(세부사업 | 공모사업명) → 비목 → 편성액
//   날짜별 집행 내역(spending)을 입력하면 재원·사업·비목별 사용액·사용률에 바로 반영
import { h, api, clear, won, toast, confirmBox, today, modal } from '../ui.js';
import { state, canEdit, remember, listOf } from '../state.js';
import { yearMonths } from '../modules.js';
import { tableView } from './table.js';
import { openRecordForm } from '../form.js';
import { evalFormula, amountFrom } from '../calc.js';


export const KINDS = ['학교본예산', '공모사업'];
const UNSET = '(비목 미지정)';
const norm = (s) => String(s || '').replace(/[\s()（）<>·,.\-_/]/g, '').toLowerCase();
// a 의 글자가 b 안에 순서대로 모두 있으면 같은 사업으로 봄 (예: 'AI디지털선도학교' ⊂ 'AI 디지털 활용 선도학교 운영물품')
const subseq = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return a.length > 1 && i === a.length; };
const amountOf = (p) => (Number(p.data.price) || 0) * (Number(p.data.qty) || 0);
const myName = () => String(state.me?.name || '').replace(/\s/g, '');
const contestManagers = (c) => (c?.data.managers?.length ? c.data.managers : [c?.data.applicant]).filter(Boolean);
// 공모사업은 입력 담당자(없으면 신청자)와 관리자만 입력 (서버도 같은 규칙으로 막음). 학교본예산은 교직원 누구나
export function canEditProgram(p) {
  if (!p || p.kind !== '공모사업') return canEdit('budget');
  if (state.me?.role === 'admin') return true;
  if (!p.contest) return false;
  const list = contestManagers(p.contest).map((x) => String(x).replace(/\s/g, ''));
  return canEdit('budget') && (!list.length || list.includes(myName()));
}
const pctOf = (used, total) => (total > 0 ? Math.round((used / total) * 1000) / 10 : 0);

// 예전 화면·홈 대시보드 호환: 재원 이름 목록
export function budgetSources(budget, contests) {
  const list = [];
  for (const c of contests) if (c.data.name) list.push({ name: c.data.name, kind: '공모사업', amount: Number(c.data.budget) || 0 });
  for (const b of budget) {
    const name = b.data.label || b.data.item;
    if (name) list.push({ name, kind: '예산', amount: Number(b.data.amount) || 0, program: b.data.program });
  }
  return list;
}

// ---------- 집계 ----------

export function buildMoney(d) {
  const contestNames = new Set(d.contests.map((c) => c.data.name).filter(Boolean));
  const kindOfBudget = (b) => b.data.source || (contestNames.has(b.data.program) ? '공모사업' : '학교본예산');
  const programOfBudget = (b) => b.data.program || b.data.label || b.data.item || '(사업 미지정)';
  // programs: key `${kind}|${program}` → { kind, name, assigned, used, cats: Map(cat → {assigned, used}) }
  const programs = new Map();
  const prog = (kind, name) => {
    const k = `${kind}|${name}`;
    if (!programs.has(k)) programs.set(k, { kind, name, assigned: 0, used: 0, pending: 0, cats: new Map(), contest: null, spends: [] });
    return programs.get(k);
  };
  const cat = (p, c) => { const k = c || UNSET; if (!p.cats.has(k)) p.cats.set(k, { name: k, assigned: 0, used: 0 }); return p.cats.get(k); };
  for (const b of d.budget) {
    const p = prog(kindOfBudget(b), programOfBudget(b));
    const a = Number(b.data.amount) || 0;
    p.assigned += a; cat(p, b.data.category).assigned += a;
  }
  for (const c of d.contests) {
    if (!c.data.name) continue;
    const p = prog('공모사업', c.data.name);
    p.contest = c;
    const total = Number(c.data.budget) || 0;
    if (total > p.assigned) { cat(p, p.assigned ? '(미배분)' : UNSET).assigned += total - p.assigned; p.assigned = total; }
  }
  // 예전 물품 신청의 '예산 구분'(세부항목 이름 등) → 사업
  const alias = new Map();
  for (const b of d.budget) for (const n of [b.data.label, b.data.item]) if (n) alias.set(norm(n), `${kindOfBudget(b)}|${programOfBudget(b)}`);
  const findProgram = (label, kind) => {
    const n = norm(label);
    if (!n) return null;
    const list = [...programs.values()].filter((p) => !kind || p.kind === kind);
    return list.find((p) => norm(p.name) === n) || (alias.has(n) && programs.get(alias.get(n))) || list.find((p) => subseq(norm(p.name), n) || subseq(n, norm(p.name))) || null;
  };
  const unlinked = [];
  for (const s of d.spending) {
    const p = findProgram(s.data.program, s.data.source) || prog(s.data.source || '학교본예산', s.data.program || '(사업 미지정)');
    const a = Number(s.data.amount) || 0;
    p.used += a; cat(p, s.data.category).used += a; p.spends.push(s);
  }
  const spentPurchase = new Set(d.spending.map((s) => s.data.purchaseId).filter(Boolean));
  const purchaseProgram = new Map();
  for (const x of d.purchases) {
    const p = findProgram(x.data.budget);
    purchaseProgram.set(x.id, p);
    if (!spentPurchase.has(x.id)) { if (p) p.pending += amountOf(x); else unlinked.push(x); }
  }
  const byKind = (kind) => [...programs.values()].filter((p) => p.kind === kind);
  const catsOf = (list) => {
    const m = new Map();
    for (const p of list) for (const c of p.cats.values()) { if (!m.has(c.name)) m.set(c.name, { name: c.name, assigned: 0, used: 0 }); const x = m.get(c.name); x.assigned += c.assigned; x.used += c.used; }
    return [...m.values()].sort((a, b) => b.assigned - a.assigned || b.used - a.used);
  };
  return { programs, byKind, catsOf, findProgram, unlinked, spentPurchase, purchaseProgram };
}

async function loadMoney() {
  const d = await api(`/api/bundle?year=${state.year}&modules=budget,contests,purchases,spending`);
  const m = buildMoney(d);
  state.budgetSources = budgetSources(d.budget, d.contests).map((s) => s.name);
  state.budgetPrograms = [...new Set([...m.programs.values()].map((p) => p.name))];
  state.budgetCategories = [...new Set([...d.budget, ...d.spending].map((r) => r.data.category).filter(Boolean))];
  return { ...d, m };
}

// ---------- 그리기 도구 ----------

function bar(used, total) {
  const pct = pctOf(used, total);
  return h('div', { class: `bar ${used > total && total > 0 ? 'over' : ''}`, title: `${pct}%` }, h('span', { style: { width: `${Math.min(100, pct)}%` } }), h('em', {}, total > 0 ? `${pct}%` : '-'));
}
function kpi(label, value, sub, cls = '') {
  return h('div', { class: `kpi ${cls}` }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), sub ? h('div', { class: 'muted small' }, sub) : null);
}
const sumOf = (list, k) => list.reduce((a, x) => a + (x[k] || 0), 0);

function kpiRow(list, extra = []) {
  const assigned = sumOf(list, 'assigned');
  const used = sumOf(list, 'used');
  const pending = sumOf(list, 'pending');
  return h('div', { class: 'kpis' },
    kpi('편성액', won(assigned), `${list.length}개 사업`),
    kpi('집행액', won(used), `사용률 ${pctOf(used, assigned)}%`),
    kpi('잔액', won(assigned - used), used > assigned ? '편성액 초과' : '편성 − 집행', used > assigned ? 'warn' : ''),
    kpi('물품 신청 대기', won(pending), '집행 전 신청액'), ...extra);
}

function catTable(cats, title = '비목별 사용 현황') {
  return h('section', { class: 'section' }, h('h3', {}, title),
    cats.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['비목', '편성액', '집행액', '잔액', '사용률'].map((t) => h('th', {}, t)))),
      h('tbody', {}, cats.map((c) => h('tr', { class: c.used || c.assigned ? '' : 'dim' },
        h('td', {}, c.name), h('td', { class: 'num' }, won(c.assigned)), h('td', { class: 'num' }, c.used ? won(c.used) : '-'),
        h('td', { class: `num ${c.assigned - c.used < 0 ? 'neg' : ''}` }, won(c.assigned - c.used)), h('td', { style: { minWidth: '140px' } }, bar(c.used, c.assigned))))),
      h('tfoot', {}, h('tr', {}, h('td', { class: 'strong' }, '합계'), h('td', { class: 'num strong' }, won(sumOf(cats, 'assigned'))), h('td', { class: 'num strong' }, won(sumOf(cats, 'used'))),
        h('td', { class: 'num strong' }, won(sumOf(cats, 'assigned') - sumOf(cats, 'used'))), h('td', {}, bar(sumOf(cats, 'used'), sumOf(cats, 'assigned'))))))) : h('p', { class: 'muted' }, '편성·집행 내역이 없습니다.'));
}

function programTable(list, onPick, title = '사업별 사용 현황') {
  return h('section', { class: 'section' }, h('h3', {}, title),
    list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['사업', '재원', '편성액', '집행액', '신청 대기', '잔액', '사용률'].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.slice().sort((a, b) => b.assigned - a.assigned).map((p) => h('tr', { class: onPick ? 'click' : '', onclick: onPick ? () => onPick(p) : null },
        h('td', {}, h('strong', {}, p.name)), h('td', {}, h('span', { class: `tag ${p.kind === '공모사업' ? 'violet' : 'blue'}` }, p.kind)),
        h('td', { class: 'num' }, won(p.assigned)), h('td', { class: 'num' }, p.used ? won(p.used) : '-'), h('td', { class: 'num muted' }, p.pending ? won(p.pending) : '-'),
        h('td', { class: `num ${p.assigned - p.used < 0 ? 'neg' : ''}` }, won(p.assigned - p.used)), h('td', { style: { minWidth: '140px' } }, bar(p.used, p.assigned))))))) : h('p', { class: 'muted' }, '사업이 없습니다.'));
}

// 월별 집행액 막대 (3월 ~ 다음 해 2월)
function monthChart(spends) {
  const months = yearMonths(state.year).filter((x) => !(x.y === state.year && x.m < 3));
  const vals = months.map((x) => spends.filter((s) => String(s.data.date).startsWith(`${x.y}-${String(x.m).padStart(2, '0')}`)).reduce((a, s) => a + (Number(s.data.amount) || 0), 0));
  const max = Math.max(1, ...vals);
  let acc = 0;
  return h('section', { class: 'section' }, h('h3', {}, '월별 집행액'),
    h('div', { class: 'month-chart' }, months.map((x, i) => { acc += vals[i]; return h('div', { class: 'mc-col', title: `${x.m}월 ${won(vals[i])} · 누계 ${won(acc)}` },
      h('div', { class: 'mc-val' }, vals[i] ? `${Math.round(vals[i] / 10000).toLocaleString()}만` : ''), h('div', { class: 'mc-bar' }, h('span', { style: { height: `${(vals[i] / max) * 100}%` } })), h('div', { class: 'mc-lbl' }, `${x.m}월`)); })));
}

function recentSpends(spends, reload) {
  const list = spends.slice().sort((a, b) => String(b.data.date).localeCompare(String(a.data.date))).slice(0, 8);
  return h('section', { class: 'section' }, h('h3', {}, '최근 집행', h('a', { class: 'more-link', href: '#/money/spend' }, ' 집행 입력 →')),
    list.length ? h('ul', { class: 'list' }, list.map((s) => h('li', { class: 'click spend-li', onclick: () => openRecordForm('spending', s, { onSaved: reload }) },
      h('span', { class: 'muted' }, String(s.data.date).slice(5).replace('-', '.')), ' ', h('strong', {}, s.data.content), h('span', { class: 'muted' }, ` · ${s.data.program} · ${s.data.category}`), h('span', { class: 'grow' }), h('span', { class: 'num' }, won(s.data.amount))))) : h('p', { class: 'muted' }, '집행 내역이 없습니다.'));
}

// ---------- 전체 대시보드 ----------

export async function moneyOverview(root) {
  const d = await loadMoney();
  const reload = () => moneyOverview(root);
  const all = [...d.m.programs.values()];
  const kindCard = (kind) => {
    const list = d.m.byKind(kind);
    const a = sumOf(list, 'assigned'); const u = sumOf(list, 'used');
    return h('a', { class: `card kind-card ${kind === '공모사업' ? 'violet' : 'blue'}`, href: kind === '공모사업' ? '#/money/contests' : '#/money/school' },
      h('div', { class: 'kc-head' }, h('strong', {}, kind === '공모사업' ? '🏆 공모사업' : '🏫 학교본예산'), h('span', { class: 'muted small' }, `${list.length}개 사업 →`)),
      h('div', { class: 'kc-pct' }, `${pctOf(u, a)}%`),
      bar(u, a),
      h('div', { class: 'kc-nums' }, h('span', {}, '편성 ', h('strong', {}, won(a))), h('span', {}, '집행 ', h('strong', {}, won(u))), h('span', {}, '잔액 ', h('strong', { class: a - u < 0 ? 'neg' : '' }, won(a - u)))));
  };
  const link = async (x, target) => {
    if (!target) return toast('연결할 사업을 고르세요.', 'error');
    try { await api(`/api/records/purchases/${x.id}`, { method: 'PUT', body: { data: { ...x.data, budget: target }, version: x.version } }); toast('연결했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  clear(root,
    kpiRow(all),
    h('div', { class: 'kind-grid' }, KINDS.map(kindCard)),
    h('div', { class: 'two-col' }, catTable(d.m.catsOf(all), '비목별 사용 현황 (전체)'), monthChart(d.spending)),
    programTable(all, (p) => { remember('mn_prog', p.name); location.hash = p.kind === '공모사업' ? '#/money/contests' : '#/money/school'; }),
    recentSpends(d.spending, reload),
    d.m.unlinked.length && canEdit('purchases') ? h('section', { class: 'section' }, h('h3', {}, '사업에 연결되지 않은 물품 신청'),
      h('p', { class: 'hint' }, '사업(재원) 이름이 편성된 사업과 맞지 않는 신청입니다. 사업을 골라 연결하면 "신청 대기"에 반영됩니다.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('tbody', {}, d.m.unlinked.map((x) => {
        const sel = h('select', {}, h('option', { value: '' }, '사업 선택'), all.map((p) => h('option', { value: p.name }, `${p.name} (${p.kind})`)));
        return h('tr', {}, h('td', {}, x.data.item), h('td', { class: 'muted' }, x.data.budget || '(없음)'), h('td', { class: 'num' }, won(amountOf(x))), h('td', {}, h('div', { class: 'inline-form' }, sel, h('button', { class: 'btn small', onclick: () => link(x, sel.value) }, '연결'))));
      }))))) : null,
    h('p', { class: 'hint' }, '사용률 = 집행액 ÷ 편성액. 집행액은 [집행 입력]에 날짜별로 넣은 금액만 셉니다(물품 신청은 [집행 등록]을 눌러야 반영). 비목 목록은 학교 관리 → 설정의 "예산 비목"에서 바꿀 수 있습니다.'));
}

// ---------- 재원별 화면 (학교본예산 · 공모사업 공통) ----------


// ---------- 📒 편성표: 스프레드시트처럼 바로 입력 (산출식 → 금액 자동 계산) ----------

function budgetGrid(box, rows, o) {
  const showProg = !o.program;
  const lines = rows.slice().sort((a, b) => String(a.data.program || '').localeCompare(String(b.data.program || ''), 'ko') || (a.sort || 0) - (b.sort || 0)).map((r) => ({ r, d: { ...r.data } }));
  const tbody = h('tbody', {});
  const foot = h('div', { class: 'grid-foot' });
  const cats = listOf({ list: 'budgetCategories' });
  const progs = state.budgetPrograms;
  const canLine = (ln) => o.canEdit(ln.d.program || o.program);
  const paintFoot = () => {
    const by = new Map();
    for (const ln of lines) { const k = ln.d.category || '(비목 없음)'; by.set(k, (by.get(k) || 0) + amountFrom(ln.d.formula, ln.d.amount)); }
    const total = [...by.values()].reduce((a, b) => a + b, 0);
    clear(foot, h('strong', {}, `합계 ${won(total)}`), [...by].map(([k, v]) => h('span', { class: 'tag' }, `${k} ${won(v)}`)));
  };
  const COLS = [...(showProg ? [['program', '사업', 'list-progs']] : []), ['item', '세부항목'], ['category', '비목', 'list-cats'], ['detail', '산출내역'], ['formula', '산출식 (예: 5,000×20×3)'], ['amount', '금액'], ['note', '비고']];
  const save = (ln, st) => {
    clearTimeout(ln.t);
    st.textContent = '…';
    ln.t = setTimeout(async () => {
      const data = { ...ln.d, source: o.kind, program: ln.d.program || o.program, amount: amountFrom(ln.d.formula, ln.d.amount) };
      if (!data.program && !data.item && !data.amount) { st.textContent = ''; return; }
      try {
        const saved = ln.r ? await api(`/api/records/budget/${ln.r.id}`, { method: 'PUT', body: { data, version: ln.r.version } }) : await api('/api/records/budget', { method: 'POST', body: { data, year: state.year } });
        ln.r = saved; ln.d = { ...saved.data }; st.textContent = '✓'; st.title = '저장됨';
      } catch (e) { st.textContent = '⚠'; st.title = e.message; toast(e.message, 'error'); }
    }, 700);
  };
  const rowEl = (ln) => {
    const editable = canLine(ln);
    const st = h('td', { class: 'grid-st muted small' });
    const amt = h('input', { class: 'num', inputmode: 'numeric' });
    const paintAmt = () => {
      const v = evalFormula(ln.d.formula);
      amt.readOnly = v !== null || !editable; amt.classList.toggle('calc', v !== null);
      amt.value = (v ?? (Number(ln.d.amount) || '')) ? Number(v ?? ln.d.amount).toLocaleString() : '';
      amt.title = v !== null ? '산출식으로 계산된 금액' : '금액을 직접 입력하거나 산출식을 쓰세요';
    };
    const cell = ([k, , list]) => {
      if (k === 'amount') {
        amt.oninput = () => { ln.d.amount = amt.value.replace(/[^\d]/g, ''); paintFoot(); save(ln, st); };
        paintAmt();
        return h('td', {}, amt);
      }
      const inp = h('input', { value: ln.d[k] || '', readOnly: !editable, list: list || null, oninput: (e) => { ln.d[k] = e.target.value; if (k === 'formula') paintAmt(); paintFoot(); save(ln, st); } });
      if (k === 'formula') inp.classList.add('formula');
      return h('td', {}, inp);
    };
    const tr = h('tr', { class: editable ? '' : 'locked' }, COLS.map(cell), st,
      h('td', {}, editable ? h('button', { class: 'icon-btn small', title: '줄 삭제', onclick: async () => {
        if (ln.r && !(await confirmBox(`'${ln.d.item || ln.d.category || '이 줄'}' 편성을 삭제할까요?`))) return;
        try { if (ln.r) await api(`/api/records/budget/${ln.r.id}`, { method: 'DELETE' }); lines.splice(lines.indexOf(ln), 1); tr.remove(); paintFoot(); } catch (e) { toast(e.message, 'error'); }
      } }, '✕') : h('span', { title: '입력 권한 없음' }, '🔒')));
    // Enter: 아래 줄 같은 칸으로 (마지막 줄이면 새 줄)
    tr.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const col = [...tr.querySelectorAll('input')].indexOf(e.target);
      let next = tr.nextElementSibling;
      if (!next && o.canEdit(o.program)) { addLine(); next = tbody.lastElementChild; }
      next?.querySelectorAll('input')[col]?.focus();
    });
    return tr;
  };
  const addLine = () => { const ln = { r: null, d: { program: o.program || '', category: '' } }; lines.push(ln); tbody.append(rowEl(ln)); return ln; };
  clear(tbody, lines.map(rowEl));
  paintFoot();
  clear(box,
    h('datalist', { id: 'list-cats' }, cats.map((c) => h('option', { value: c }))),
    h('datalist', { id: 'list-progs' }, progs.map((c) => h('option', { value: c }))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table grid-sheet' },
      h('thead', {}, h('tr', {}, COLS.map(([, l]) => h('th', {}, l)), h('th', {}, ''), h('th', {}, ''))), tbody)),
    h('div', { class: 'row-actions' }, foot, h('span', { class: 'grow' }),
      o.canEdit(o.program) ? h('button', { class: 'btn', onclick: () => { addLine(); tbody.lastElementChild.querySelector('input')?.focus(); } }, '+ 줄 추가') : null,
      h('button', { class: 'btn', onclick: o.reload }, '↻ 대시보드 새로 계산')),
    h('p', { class: 'hint' }, '칸을 바로 고치면 자동 저장됩니다(✓). 산출식에 "5,000원 × 20명 × 3회", "=12000*4+3000"처럼 쓰면 금액이 계산됩니다. Enter 는 아래 줄로, 마지막 줄에서 Enter 는 새 줄.'));
}

async function kindView(root, kind) {
  const d = await loadMoney();
  const reload = () => kindView(root, kind);
  const list = d.m.byKind(kind);
  let pick = remember('mn_prog') || '';
  if (pick && !list.some((p) => p.name === pick)) pick = '';
  const focus = list.filter((p) => !pick || p.name === pick);
  const budgetRows = d.budget.filter((b) => (b.data.source || (d.contests.some((c) => c.data.name === b.data.program) ? '공모사업' : '학교본예산')) === kind && (!pick || (b.data.program || b.data.label || b.data.item) === pick));
  const spendRows = focus.flatMap((p) => p.spends);
  const choose = (name) => { remember('mn_prog', name); reload(); };
  const progOf = (name) => list.find((p) => p.name === name) || (kind === '공모사업' ? { kind, name, contest: d.contests.find((c) => c.data.name === name) } : { kind, name });
  const editHere = pick ? canEditProgram(progOf(pick)) : kind === '학교본예산' ? canEdit('budget') : list.some(canEditProgram);
  const pc = pick && kind === '공모사업' ? progOf(pick).contest : null;
  const budgetBox = h('div', {});
  const spendBox = h('div', {});
  const contestBox = h('div', {});
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg wrap' }, ['', ...list.map((p) => p.name)].map((n) => h('button', { class: pick === n ? 'on' : '', onclick: () => choose(n) }, n || `전체 ${kind}`))),
      h('span', { class: 'grow' }),
      kind === '공모사업' && canEdit('contests') ? h('button', { class: 'btn', onclick: () => openRecordForm('contests', null, { onSaved: reload }) }, '+ 공모사업 등록') : null,
      editHere && canEdit('spending') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('spending', null, { defaults: { date: today(), source: kind, program: pick }, onSaved: reload }) }, '+ 집행 입력') : null),
    pc ? h('div', { class: `contest-info ${editHere ? '' : 'locked'}` }, h('span', {}, editHere ? '✏️ 입력 가능' : '🔒 열람만 가능'),
      h('span', { class: 'muted small' }, [pc.data.agency, pc.data.period, pc.data.grades, `입력 담당: ${contestManagers(pc).join(', ') || '(미지정)'} · 관리자`].filter(Boolean).join(' · ')),
      !editHere ? h('span', { class: 'muted small' }, '— 편성·집행은 입력 담당자에게 요청하세요.') : null) : null,
    kind === '공모사업' && !pick ? h('p', { class: 'hint' }, '🔒 공모사업은 사업마다 정한 입력 담당자와 관리자만 편성·집행을 입력할 수 있습니다. 공모사업을 눌러 확인하세요.') : null,
    kpiRow(focus),
    h('div', { class: 'two-col' }, catTable(d.m.catsOf(focus), pick ? `${pick} · 비목별 사용 현황` : '비목별 사용 현황'), monthChart(spendRows)),
    pick ? null : programTable(list, (p) => choose(p.name)),
    h('section', { class: 'section' }, h('h3', {}, '📒 편성표 (항목 · 비목 · 산출식 · 금액)'), budgetBox),
    h('section', { class: 'section' }, h('h3', {}, '🧾 집행 내역'), spendBox),
    kind === '공모사업' ? h('section', { class: 'section' }, h('h3', {}, '🏆 공모사업 목록'), contestBox) : null);
  budgetGrid(budgetBox, budgetRows, { kind, program: pick, reload, canEdit: (name) => (name ? canEditProgram(progOf(name)) : kind === '학교본예산' && canEdit('budget')) });
  await tableView(spendBox, 'spending', { rows: spendRows.slice().sort((a, b) => String(b.data.date).localeCompare(String(a.data.date))), embed: true, hide: ['source'], defaults: { date: today(), source: kind, program: pick }, reload });
  if (kind === '공모사업') await tableView(contestBox, 'contests', { rows: d.contests.filter((c) => !pick || c.data.name === pick), embed: true, reload, rowClass: (c) => (canEditProgram({ kind: '공모사업', contest: c }) ? '' : 'locked') });
}

export const schoolBudgetView = (root) => kindView(root, '학교본예산');
export const contestBudgetView = (root) => kindView(root, '공모사업');

// ---------- 집행 입력 (날짜별) ----------

export async function spendView(root) {
  const d = await loadMoney();
  const reload = () => spendView(root);
  const all = [...d.m.programs.values()];
  const f = { date: today(), source: remember('sp_src') || '학교본예산', program: '', category: '', content: '', amount: '', person: state.me?.name || '' };
  const progSel = h('select', {});
  const catSel = h('select', {});
  const fillProg = () => {
    const list = all.filter((p) => p.kind === f.source);
    clear(progSel, h('option', { value: '' }, '사업 선택'), list.map((p) => h('option', { value: p.name, selected: p.name === f.program, disabled: !canEditProgram(p) }, canEditProgram(p) ? p.name : `🔒 ${p.name} (담당자만)`)), f.source === '학교본예산' ? h('option', { value: '__new' }, '✏️ 직접 입력…') : null);
    fillCat();
  };
  const fillCat = () => {
    const p = all.find((x) => x.kind === f.source && x.name === f.program);
    const cats = [...new Set([...(p ? [...p.cats.keys()].filter((c) => !c.startsWith('(')) : []), ...(state.settings?.lists?.budgetCategories || []), ...state.budgetCategories])];
    clear(catSel, h('option', { value: '' }, '비목 선택'), cats.map((c) => {
      const x = p?.cats.get(c);
      return h('option', { value: c, selected: c === f.category }, x ? `${c} (잔액 ${won(x.assigned - x.used)})` : c);
    }), h('option', { value: '__new' }, '✏️ 직접 입력…'));
  };
  progSel.onchange = () => { if (progSel.value === '__new') { const v = prompt('사업 이름'); f.program = v?.trim() || ''; if (f.program) { all.push({ kind: f.source, name: f.program, cats: new Map() }); } fillProg(); } else { f.program = progSel.value; fillCat(); } };
  catSel.onchange = () => { if (catSel.value === '__new') { const v = prompt('비목 이름'); f.category = v?.trim() || ''; if (f.category) state.budgetCategories.push(f.category); fillCat(); } else f.category = catSel.value; };
  fillProg();
  const inp = (k, attrs) => h('input', { value: f[k], oninput: (e) => { f[k] = e.target.value; }, ...attrs });
  const calcOut = h('small', { class: 'muted' });
  const amount = inp('amount', { placeholder: '금액 또는 계산식 (예: 32,000×6)', oninput: (e) => { f.amount = e.target.value; const v = evalFormula(f.amount); calcOut.textContent = v !== null && /[×xX*+\-/÷]/.test(f.amount) ? `= ${won(v)}` : ''; } });
  const add = async () => {
    const data = { ...f, amount: evalFormula(f.amount) || 0 };
    if (!data.date || !data.program || !data.category || !data.content.trim() || !data.amount) { toast('집행일·사업·비목·내용·금액을 모두 넣어 주세요.', 'error'); return; }
    try { await api('/api/records/spending', { method: 'POST', body: { data } }); remember('sp_src', f.source); toast(`${won(data.amount)} 집행을 반영했습니다.`); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const mon = remember('sp_mon') || '';
  const src = remember('sp_filter') || '';
  const rows = d.spending.filter((s) => (!mon || String(s.data.date).startsWith(mon)) && (!src || (s.data.source || '학교본예산') === src)).sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
  const months = [...new Set(d.spending.map((s) => String(s.data.date).slice(0, 7)))].sort();
  const box = h('div', {});
  clear(root,
    canEdit('spending') ? h('div', { class: 'card spend-form' },
      h('h3', {}, '🧾 집행 입력', h('span', { class: 'muted small' }, ' · 입력하면 대시보드의 사용액·사용률에 바로 반영')),
      h('div', { class: 'sf-grid' },
        h('label', {}, '집행일', inp('date', { type: 'date' })),
        h('label', {}, '재원', h('div', { class: 'seg' }, KINDS.map((k) => h('button', { type: 'button', class: f.source === k ? 'on' : '', onclick: (e) => { f.source = k; f.program = ''; f.category = ''; e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); fillProg(); } }, k)))),
        h('label', {}, '사업', progSel),
        h('label', {}, '비목', catSel),
        h('label', { class: 'wide' }, '내용', inp('content', { placeholder: '예) 수학 교구 구입, 강사 수당 3월분' })),
        h('label', {}, '금액', amount, calcOut),
        h('label', {}, '담당', inp('person', { list: 'staff-names' }))),
      h('datalist', { id: 'staff-names' }, state.staff.map((x) => h('option', { value: x.name }))),
      h('div', { class: 'row-actions' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: add }, '+ 집행 반영'))) : null,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, ['', ...KINDS].map((k) => h('button', { class: src === k ? 'on' : '', onclick: () => { remember('sp_filter', k); reload(); } }, k || '전체 재원'))),
      h('select', { onchange: (e) => { remember('sp_mon', e.target.value); reload(); } }, h('option', { value: '' }, '전체 기간'), months.map((x) => h('option', { value: x, selected: x === mon }, `${Number(x.slice(5))}월`))),
      h('span', { class: 'muted' }, `${rows.length}건 · ${won(rows.reduce((a, s) => a + (Number(s.data.amount) || 0), 0))}`)),
    box);
  await tableView(box, 'spending', { rows, groupBy: 'source', embed: true, defaults: { date: today() }, reload });
}

// ---------- 물품 신청 ----------

export async function purchasesView(root) {
  const d = await loadMoney();
  const reload = () => purchasesView(root);
  const toSpend = (x) => {
    const p = d.m.purchaseProgram.get(x.id);
    openRecordForm('spending', null, { defaults: { date: today(), source: p?.kind || '학교본예산', program: p?.name || x.data.budget || '', category: '일반수용비', content: String(x.data.item || '').split('\n')[0], amount: amountOf(x), person: x.data.requester || '', purchaseId: x.id }, onSaved: reload });
  };
  const waiting = d.purchases.filter((x) => !d.m.spentPurchase.has(x.id));
  const view = remember('pc_view') || 'item';
  const head = h('div', { class: 'kpis' },
    kpi('신청', `${d.purchases.length}건`, won(d.purchases.reduce((a, x) => a + amountOf(x), 0))),
    kpi('미수령', `${d.purchases.filter((x) => !x.data.received).length}건`),
    kpi('집행 등록 전', `${waiting.length}건`, won(waiting.reduce((a, x) => a + amountOf(x), 0))));
  const box = h('div', {});
  const rows = view === 'date' ? d.purchases.slice().sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || ''))) : d.purchases;
  clear(root, head,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg' }, [['item', '건별 보기'], ['date', '날짜별 보기']].map(([v, l]) => h('button', { class: view === v ? 'on' : '', onclick: () => { remember('pc_view', v); reload(); } }, l))),
      h('span', { class: 'grow' }),
      canEdit('purchases') ? h('button', { class: 'btn', onclick: () => openRecordForm('purchases', null, { defaults: { date: today(), requester: state.me?.name || '' }, onSaved: reload }) }, '+ 건별 신청') : null,
      canEdit('purchases') ? h('button', { class: 'btn primary', onclick: () => batchPurchase(reload) }, '+ 날짜별 일괄 신청') : null),
    box, h('p', { class: 'hint' }, '건별 신청은 한 품목씩, 날짜별 일괄 신청은 같은 날·같은 사업의 여러 품목을 표에 한 번에 넣습니다(엑셀 표 붙여넣기 가능). 물건을 받고 지출이 끝나면 [집행 등록]을 누르면 대시보드에 반영됩니다.'));
  await tableView(box, 'purchases', { rows, groupBy: view === 'date' ? 'date' : 'budget', embed: true, defaults: { date: today(), requester: state.me?.name || '' }, reload,
    rowAction: (x) => (d.m.spentPurchase.has(x.id) ? h('span', { class: 'tag ok' }, '집행 완료') : canEdit('spending') ? h('button', { class: 'btn small', onclick: () => toSpend(x) }, '집행 등록') : null) });
}

// 날짜별 일괄 신청: 신청일·사업·신청자 + 품목 표(단가 칸은 계산식 가능)
function batchPurchase(reload) {
  const headF = { date: today(), budget: '', requester: state.me?.name || '' };
  const items = [];
  const tbody = h('tbody', {});
  const total = h('strong', {});
  const paintTotal = () => { total.textContent = `합계 ${won(items.reduce((a, it) => a + (evalFormula(it.price) || 0) * (Number(it.qty) || 0), 0))} · ${items.filter((it) => it.item.trim()).length}건`; };
  const KEYS = [['item', '품목', 'grow'], ['spec', '규격'], ['price', '단가'], ['qty', '수량'], ['link', '구매 링크'], ['note', '비고']];
  const addRow = (v = {}) => {
    const it = { item: '', spec: '', price: '', qty: '1', link: '', note: '', ...v };
    items.push(it);
    const amt = h('td', { class: 'num muted' });
    const paint = () => { const a = (evalFormula(it.price) || 0) * (Number(it.qty) || 0); amt.textContent = a ? won(a) : ''; paintTotal(); };
    const tr = h('tr', {}, KEYS.map(([k]) => h('td', {}, h('input', { value: it[k], inputmode: k === 'qty' ? 'numeric' : null, placeholder: k === 'price' ? '예) 12,000' : '', oninput: (e) => { it[k] = e.target.value; paint(); } }))), amt,
      h('td', {}, h('button', { type: 'button', class: 'icon-btn small', onclick: () => { items.splice(items.indexOf(it), 1); tr.remove(); paintTotal(); } }, '✕')));
    tr.addEventListener('keydown', (e) => { if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return; e.preventDefault(); const col = [...tr.querySelectorAll('input')].indexOf(e.target); if (!tr.nextElementSibling) addRow(); tr.nextElementSibling?.querySelectorAll('input')[col]?.focus(); });
    tbody.append(tr); paint();
  };
  for (let i = 0; i < 4; i++) addRow();
  const paste = h('textarea', { rows: 3, placeholder: '엑셀·스프레드시트에서 표를 복사해 붙여넣기 (품목 | 규격 | 단가 | 수량 | 링크 순서)' });
  paste.addEventListener('paste', () => setTimeout(() => {
    const rows = paste.value.split('\n').map((l) => l.split('\t')).filter((r) => r[0]?.trim());
    if (!rows.length) return;
    for (const it of items.filter((x) => !x.item.trim())) items.splice(items.indexOf(it), 1);
    clear(tbody); const keep = items.splice(0);
    for (const it of keep) addRow(it);
    for (const r of rows) addRow({ item: r[0].trim(), spec: (r[1] || '').trim(), price: (r[2] || '').trim(), qty: (r[3] || '1').replace(/[^\d]/g, '') || '1', link: (r[4] || '').trim() });
    paste.value = ''; toast(`${rows.length}줄을 넣었습니다.`);
  }, 0));
  const progs = state.budgetPrograms;
  modal('🛒 날짜별 일괄 신청', h('div', { class: 'form' },
    h('div', { class: 'sf-grid' },
      h('label', {}, '신청일', h('input', { type: 'date', value: headF.date, oninput: (e) => { headF.date = e.target.value; } })),
      h('label', {}, '사업(재원)', h('input', { list: 'batch-progs', value: headF.budget, placeholder: '사업 선택·입력', oninput: (e) => { headF.budget = e.target.value; } })),
      h('label', {}, '신청자', h('input', { list: 'batch-staff', value: headF.requester, oninput: (e) => { headF.requester = e.target.value; } }))),
    h('datalist', { id: 'batch-progs' }, progs.map((p) => h('option', { value: p }))),
    h('datalist', { id: 'batch-staff' }, state.staff.map((x) => h('option', { value: x.name }))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table grid-sheet' }, h('thead', {}, h('tr', {}, KEYS.map(([, l]) => h('th', {}, l)), h('th', {}, '금액'), h('th', {}, ''))), tbody)),
    h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn small', onclick: () => { addRow(); tbody.lastElementChild.querySelector('input').focus(); } }, '+ 줄 추가'), h('span', { class: 'grow' }), total),
    paste), [
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => {
      const list = items.filter((it) => it.item.trim());
      if (!list.length) { toast('품목을 한 개 이상 넣어 주세요.', 'error'); return; }
      if (!headF.requester.trim()) { toast('신청자를 넣어 주세요.', 'error'); return; }
      try {
        for (const it of list) await api('/api/records/purchases', { method: 'POST', body: { data: { date: headF.date, budget: headF.budget, requester: headF.requester, item: it.item.trim(), spec: it.spec, price: evalFormula(it.price) || 0, qty: Number(it.qty) || 1, link: it.link, note: it.note }, year: state.year } });
        toast(`${list.length}건을 신청했습니다.`); close(); reload();
      } catch (e) { toast(e.message, 'error'); }
    } }, '일괄 신청'),
  ], { wide: true });
}

// 예전 주소(#/money/budget) 호환
export const budgetView = schoolBudgetView;
