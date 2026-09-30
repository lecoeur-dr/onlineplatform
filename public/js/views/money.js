// 💰 예산·물품 영역: 사용 현황 · 물품 신청 · 예산 · 공모사업 · 공모 안내
import { h, api, clear, won, toast, confirmBox } from '../ui.js';
import { state, canEdit } from '../state.js';
import { tableView } from './table.js';

const norm = (s) => String(s || '').replace(/[\s()（）<>·,.\-_/]/g, '').toLowerCase();
// a 의 글자가 b 안에 순서대로 모두 있으면 같은 재원으로 봄 (예: 'AI디지털선도학교' ⊂ 'AI 디지털 활용 선도학교 운영물품')
const subseq = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return a.length > 1 && i === a.length; };
const amountOf = (p) => (Number(p.data.price) || 0) * (Number(p.data.qty) || 0);

export function budgetSources(budget, contests) {
  const list = [];
  for (const c of contests) if (c.data.name) list.push({ name: c.data.name, kind: '공모사업', amount: Number(c.data.budget) || 0 });
  for (const b of budget) {
    const name = b.data.label || b.data.item;
    if (name) list.push({ name, kind: '예산', amount: Number(b.data.amount) || 0, program: b.data.program });
  }
  return list;
}

async function loadSources() {
  const d = await api(`/api/bundle?year=${state.year}&modules=budget,contests,purchases`);
  const sources = budgetSources(d.budget, d.contests);
  state.budgetSources = sources.map((s) => s.name);
  return { ...d, sources };
}

function matchSource(sources, label) {
  const n = norm(label);
  if (!n) return null;
  return sources.find((s) => norm(s.name) === n) || sources.find((s) => subseq(norm(s.name), n) || subseq(n, norm(s.name))) || null;
}

function bar(used, total) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return h('div', { class: `bar ${used > total && total > 0 ? 'over' : ''}`, title: `${pct}%` }, h('span', { style: { width: `${pct}%` } }), h('em', {}, total > 0 ? `${pct}%` : '-'));
}

// 사용 현황: 재원별 배정 · 신청 · 수령 · 잔액
export async function moneyOverview(root) {
  const d = await loadSources();
  const reload = () => moneyOverview(root);
  const rows = new Map();
  for (const s of d.sources) rows.set(s.name, { ...s, req: 0, got: 0, n: 0, labels: new Set() });
  const unlinked = new Map();
  for (const p of d.purchases) {
    const src = matchSource(d.sources, p.data.budget);
    const a = amountOf(p);
    if (src) {
      const r = rows.get(src.name);
      r.req += a; r.n++; if (p.data.received) r.got += a;
      if (p.data.budget) r.labels.add(p.data.budget);
    } else {
      const k = p.data.budget || '(예산 구분 없음)';
      if (!unlinked.has(k)) unlinked.set(k, { list: [], req: 0, got: 0 });
      const u = unlinked.get(k); u.list.push(p); u.req += a; if (p.data.received) u.got += a;
    }
  }
  const all = [...rows.values()];
  const totAssign = all.reduce((a, r) => a + r.amount, 0);
  const totReq = d.purchases.reduce((a, p) => a + amountOf(p), 0);
  const totGot = d.purchases.filter((p) => p.data.received).reduce((a, p) => a + amountOf(p), 0);
  const waiting = d.purchases.filter((p) => !p.data.received).length;

  // 신청자별
  const byPerson = new Map();
  for (const p of d.purchases) { const k = p.data.requester || '-'; byPerson.set(k, (byPerson.get(k) || 0) + amountOf(p)); }

  const link = async (label, list) => {
    const sel = document.querySelector(`[data-link="${CSS.escape(label)}"]`);
    const target = sel?.value;
    if (!target) return toast('연결할 재원을 고르세요.', 'error');
    if (!(await confirmBox(`'${label}' 물품 ${list.length}건의 예산 구분을 '${target}'(으)로 바꿉니다.`))) return;
    try {
      for (const p of list) await api(`/api/records/purchases/${p.id}`, { method: 'PUT', body: { data: { ...p.data, budget: target }, version: p.version } });
      toast('연결했습니다.');
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  const linkCell = (k, u) => {
    if (!canEdit('purchases')) return '';
    const options = d.sources.map((src) => h('option', { value: src.name }, `${src.name} (${src.kind})`));
    return h('div', { class: 'inline-form' },
      h('select', { 'data-link': k }, h('option', { value: '' }, '재원 선택'), options),
      h('button', { class: 'btn small', onclick: () => link(k, u.list) }, '연결'));
  };
  const unlinkedRows = [...unlinked].map(([k, u]) => h('tr', {},
    h('td', {}, k), h('td', { class: 'num' }, u.list.length), h('td', { class: 'num' }, won(u.req)), h('td', {}, linkCell(k, u))));
  const unlinkedSection = unlinked.size ? h('section', { class: 'section' }, h('h3', {}, '재원에 연결되지 않은 물품 신청'),
    h('p', { class: 'hint' }, '예산 구분이 예산·공모사업 이름과 맞지 않는 신청입니다. 재원을 골라 한 번에 연결하면 위 현황에 반영됩니다.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['예산 구분(입력값)', '건수', '신청액', '재원 연결'].map((t) => h('th', {}, t)))),
      h('tbody', {}, unlinkedRows)))) : null;

  clear(root,
    h('div', { class: 'kpis' },
      kpi('배정 합계', won(totAssign), '예산 + 공모사업'),
      kpi('물품 신청액', won(totReq), `${d.purchases.length}건`),
      kpi('수령 완료', won(totGot), `미수령 ${waiting}건`),
      kpi('잔액(연결된 재원)', won(all.reduce((a, r) => a + r.amount - r.req, 0)), '배정 − 신청')),
    h('section', { class: 'section' }, h('h3', {}, '재원별 사용 현황'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['재원', '구분', '배정액', '신청액', '수령 완료', '잔액', '사용률'].map((t) => h('th', {}, t)))),
        h('tbody', {}, all.sort((a, b) => b.req - a.req || b.amount - a.amount).map((r) => h('tr', { class: r.req ? '' : 'dim' },
          h('td', {}, r.name, r.program ? h('div', { class: 'muted small' }, r.program) : null),
          h('td', {}, h('span', { class: 'tag' }, r.kind)),
          h('td', { class: 'num' }, won(r.amount)),
          h('td', { class: 'num' }, r.req ? won(r.req) : '-', r.n ? h('div', { class: 'muted small' }, `${r.n}건`) : null),
          h('td', { class: 'num' }, r.got ? won(r.got) : '-'),
          h('td', { class: `num ${r.amount - r.req < 0 ? 'neg' : ''}` }, won(r.amount - r.req)),
          h('td', { style: { minWidth: '120px' } }, bar(r.req, r.amount)))))))),
    unlinkedSection,
    h('section', { class: 'section' }, h('h3', {}, '신청자별 합계'),
      h('div', { class: 'chips-row' }, [...byPerson].sort((a, b) => b[1] - a[1]).map(([k, v]) => h('span', { class: 'tag big' }, `${k} ${won(v)}`)))));
}

function kpi(label, value, sub) {
  return h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), h('div', { class: 'muted small' }, sub));
}

export async function purchasesView(root) {
  const d = await loadSources();
  await tableView(root, 'purchases', { rows: d.purchases, groupBy: 'budget', reload: () => purchasesView(root) });
}

export async function budgetView(root) {
  await tableView(root, 'budget', { groupBy: 'program' });
}
