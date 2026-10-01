// 🗂 학교 정보 영역: 계정·바로가기 · 내선번호 · 위임전결 · 자유 표
import { h, api, clear } from '../ui.js';
import { state, canEdit } from '../state.js';
import { openRecordForm } from '../form.js';
import { tableView } from './table.js';

// 계정·바로가기: 바로가기 카드(분류별) + 계정·비밀번호(구분별)
export async function infoOverview(root) {
  const d = await api(`/api/bundle?year=${state.year}&modules=links,secrets`);
  const reload = () => infoOverview(root);
  const groups = new Map();
  for (const l of d.links) { const k = l.data.category || '기타'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
  const secretsBox = h('div', {});
  clear(root,
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', {}, '🔗 바로가기'),
        canEdit('links') ? h('button', { class: 'btn primary small', onclick: () => openRecordForm('links', null, { onSaved: reload }) }, '+ 바로가기') : null),
      groups.size ? [...groups].map(([k, list]) => h('div', { class: 'link-group' },
        h('div', { class: 'muted small strong' }, k),
        h('div', { class: 'link-cards' }, list.map((l) => h('div', { class: 'link-card' },
          /^https?:/.test(l.data.url || '') ? h('a', { href: l.data.url, target: '_blank', rel: 'noopener' }, l.data.title) : h('span', {}, l.data.title),
          l.data.note ? h('div', { class: 'muted small' }, l.data.note) : null,
          canEdit('links') ? h('button', { class: 'link-btn', onclick: () => openRecordForm('links', l, { onSaved: reload }) }, '수정') : null))))) : h('p', { class: 'muted' }, '바로가기가 없습니다.')),
    h('section', { class: 'section' }, h('h3', {}, '🔐 계정·비밀번호'),
      h('p', { class: 'hint' }, '비밀번호는 [보기]를 눌러야 나타나며, 누가 봤는지 변경 기록에 남습니다.'), secretsBox));
  await tableView(secretsBox, 'secrets', { rows: d.secrets, groupBy: 'category', embed: true, reload });
}

// 자료실: 서식·양식·매뉴얼 링크를 분류별로
export const resourcesView = (root) => tableView(root, 'resources', { groupBy: 'category' });
export const contactsView = (root) => tableView(root, 'contacts', { groupBy: 'dept' });
export const rulesView = (root) => tableView(root, 'rules', { groupBy: 'section' });
