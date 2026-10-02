// 💰 예산·물품: 전체 대시보드 · 학교본예산 · 공모사업 · 집행 입력 · 물품 신청 · 공모 안내
//   구조는 같고 재원만 다름: 재원(학교본예산 | 공모사업) → 사업(세부사업 | 공모사업명) → 비목 → 편성액
//   날짜별 집행 내역(spending)을 입력하면 재원·사업·비목별 사용액·사용률에 바로 반영
import { h, api, clear, won, toast, confirmBox, today } from '../ui.js';
import { state, canEdit, remember } from '../state.js';
import { yearMonths } from '../modules.js';
import { tableView } from './table.js';
import { openRecordForm } from '../form.js';

export const KINDS = ['학교본예산', '공모사업'];
const UNSET = '(비목 미지정)';
const norm = (s) => String(s || '').replace(/[\s()（）<>·,.\-_/]/g, '').toLowerCase();
// a 의 글자가 b 안에 순서대로 모두 있으면 같은 사업으로 봄 (예: 'AI디지털선도학교' ⊂ 'AI 디지털 활용 선도학교 운영물품')
const subseq = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return a.length > 1 && i === a.length; };
const amountOf = (p) => (Number(p.data.price) || 0) * (Number(p.data.qty) || 0);
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
  const budgetBox = h('div', {});
  const spendBox = h('div', {});
  const contestBox = h('div', {});
  clear(root,
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg wrap' }, ['', ...list.map((p) => p.name)].map((n) => h('button', { class: pick === n ? 'on' : '', onclick: () => choose(n) }, n || `전체 ${kind}`))),
      h('span', { class: 'grow' }),
      kind === '공모사업' && canEdit('contests') ? h('button', { class: 'btn', onclick: () => openRecordForm('contests', null, { onSaved: reload }) }, '+ 공모사업 등록') : null,
      canEdit('spending') ? h('button', { class: 'btn primary', onclick: () => openRecordForm('spending', null, { defaults: { date: today(), source: kind, program: pick }, onSaved: reload }) }, '+ 집행 입력') : null),
    pick && kind === '공모사업' && focus[0]?.contest ? h('p', { class: 'muted small' }, [focus[0].contest.data.agency, focus[0].contest.data.period, focus[0].contest.data.applicant && `담당 ${focus[0].contest.data.applicant}`, focus[0].contest.data.grades].filter(Boolean).join(' · ')) : null,
    kpiRow(focus),
    h('div', { class: 'two-col' }, catTable(d.m.catsOf(focus), pick ? `${pick} · 비목별 사용 현황` : '비목별 사용 현황'), monthChart(spendRows)),
    pick ? null : programTable(list, (p) => choose(p.name)),
    h('section', { class: 'section' }, h('h3', {}, '📒 편성 내역 (사업 · 비목 · 금액)'), budgetBox),
    h('section', { class: 'section' }, h('h3', {}, '🧾 집행 내역'), spendBox),
    kind === '공모사업' ? h('section', { class: 'section' }, h('h3', {}, '🏆 공모사업 목록'), contestBox) : null);
  await tableView(budgetBox, 'budget', { rows: budgetRows, groupBy: 'program', embed: true, hide: ['source', 'consult', 'label'], defaults: { source: kind, program: pick }, reload });
  await tableView(spendBox, 'spending', { rows: spendRows.slice().sort((a, b) => String(b.data.date).localeCompare(String(a.data.date))), embed: true, hide: ['source'], defaults: { date: today(), source: kind, program: pick }, reload });
  if (kind === '공모사업') await tableView(contestBox, 'contests', { rows: d.contests.filter((c) => !pick || c.data.name === pick), embed: true, reload });
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
    clear(progSel, h('option', { value: '' }, '사업 선택'), list.map((p) => h('option', { value: p.name, selected: p.name === f.program }, p.name)), h('option', { value: '__new' }, '✏️ 직접 입력…'));
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
  const amount = inp('amount', { inputmode: 'numeric', placeholder: '금액 (원)', oninput: (e) => { f.amount = e.target.value.replace(/[^\d]/g, ''); e.target.value = f.amount ? Number(f.amount).toLocaleString() : ''; } });
  const add = async () => {
    const data = { ...f, amount: Number(f.amount) || 0 };
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
        h('label', {}, '금액', amount),
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
  const head = h('div', { class: 'kpis' },
    kpi('신청', `${d.purchases.length}건`, won(d.purchases.reduce((a, x) => a + amountOf(x), 0))),
    kpi('미수령', `${d.purchases.filter((x) => !x.data.received).length}건`),
    kpi('집행 등록 전', `${waiting.length}건`, won(waiting.reduce((a, x) => a + amountOf(x), 0))));
  const box = h('div', {});
  clear(root, head, box, h('p', { class: 'hint' }, '물건을 받고 지출이 끝나면 [집행 등록]을 누르세요. 사업·비목·금액이 채워진 집행 입력 창이 열리고, 저장하면 대시보드에 반영됩니다.'));
  await tableView(box, 'purchases', { rows: d.purchases, groupBy: 'budget', reload, rowAction: (x) => (d.m.spentPurchase.has(x.id) ? h('span', { class: 'tag ok' }, '집행 완료') : canEdit('spending') ? h('button', { class: 'btn small', onclick: () => toSpend(x) }, '집행 등록') : null) });
}

// 예전 주소(#/money/budget) 호환
export const budgetView = schoolBudgetView;
