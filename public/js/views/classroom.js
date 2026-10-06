// 🏫 Teachshop → 내 교실: 교실 TV에 띄워 둘 화면을 위젯·기본 도구로 직접 구성 (설정은 계정에 저장 → 어느 기기에서나 같은 화면)
import { h, clear, toast, modal } from '../ui.js';
import { TOOLS, WIDGETS, loadScreenExtra, screenWidget, widgetName } from '../tools.js';
import { roster } from './workshop.js';
import { loadPrefs, savePrefs, orderPicker } from './desk-more.js';

const BGS = [['plain', '기본'], ['sky', '하늘'], ['mint', '민트'], ['peach', '복숭아'], ['night', '밤(어두운)'], ['board', '칠판']];
const DEFAULT = { title: '우리 반', cols: 3, bg: 'plain', widgets: ['clock', 'lessons', 'note', 'timer', 'signal', 'picker'], wide: ['note'], big: false };

const candidates = () => [
  ...WIDGETS.map(([id, label]) => ({ id, label })),
  ...TOOLS.filter((t) => t.id !== 'screen').map((t) => ({ id: `t:${t.id}`, label: `${t.icon} ${t.name} (도구)` })),
];

export async function classroomView(root) {
  const [prefs, students, extra] = await Promise.all([loadPrefs(), roster().catch(() => []), loadScreenExtra()]);
  const cfg = { ...DEFAULT, ...(prefs.screen || {}) };
  const reload = () => classroomView(root);
  const ctx = (k) => ({
    students,
    save: (key, v) => { try { localStorage.setItem(`gy_room_${k}_${key}`, JSON.stringify(v)); } catch { /* 무시 */ } },
    load: (key) => { try { return JSON.parse(localStorage.getItem(`gy_room_${k}_${key}`)); } catch { return null; } },
  });
  const stage = h('div', { class: `room-stage room-bg-${cfg.bg} ${cfg.big ? 'room-big' : ''}` },
    h('div', { class: 'room-head' }, h('h2', {}, cfg.title || '우리 반'), h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn room-full', title: '전체 화면', onclick: () => (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.().catch(() => {})) }, '⛶')),
    cfg.widgets.length
      ? h('div', { class: 'room-grid', style: { gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` } }, cfg.widgets.map((k) => h('section', { class: `scr-card scr-w-${k.replace(':', '-')} ${cfg.wide.includes(k) ? 'room-wide' : ''}` },
        h('div', { class: 'scr-title' }, widgetName(k)), screenWidget(k, ctx(k), extra))))
      : h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, '🏫'), h('p', {}, '[⚙ 교실 화면 꾸미기]에서 띄울 위젯을 골라 주세요.')));
  clear(root,
    h('div', { class: 'toolbar' },
      h('span', { class: 'muted small' }, `위젯 ${cfg.widgets.length}개 · ${cfg.cols}열 · 명단 ${students.length}명`), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => settings(cfg, reload) }, '⚙ 교실 화면 꾸미기'),
      h('button', { class: 'btn primary', onclick: () => stage.requestFullscreen?.().catch(() => toast('전체 화면을 열 수 없습니다.', 'error')) }, '⛶ 교실 TV에 띄우기')),
    stage,
    h('p', { class: 'hint' }, '구성은 내 계정에 저장되어 교실 컴퓨터에서 로그인해도 같은 화면이 나옵니다. 타이머·메모 같은 위젯 안의 값은 그 기기에만 저장됩니다.'));
}

function settings(cfg, reload) {
  const next = { ...cfg, widgets: [...cfg.widgets], wide: [...cfg.wide] };
  const wideBox = h('div', { class: 'chips' });
  const drawWide = () => clear(wideBox, next.widgets.length ? next.widgets.map((k) => h('label', { class: 'inline chip-check' },
    h('input', { type: 'checkbox', checked: next.wide.includes(k), onchange: (e) => { next.wide = e.target.checked ? [...next.wide, k] : next.wide.filter((x) => x !== k); } }), ` ${widgetName(k)}`)) : h('span', { class: 'muted small' }, '위젯을 먼저 켜 주세요.'));
  drawWide();
  modal('⚙ 교실 화면 꾸미기', h('div', { class: 'form' },
    h('label', {}, h('span', {}, '화면 제목'), h('input', { value: next.title, placeholder: '예) 5학년 1반 · 오늘도 반짝', oninput: (e) => { next.title = e.target.value; } })),
    h('div', { class: 'grid-2' },
      h('label', {}, h('span', {}, '한 줄에 몇 칸'), h('select', { onchange: (e) => { next.cols = Number(e.target.value); } }, [2, 3, 4].map((n) => h('option', { value: n, selected: n === next.cols }, `${n}칸`)))),
      h('label', {}, h('span', {}, '배경'), h('select', { onchange: (e) => { next.bg = e.target.value; } }, BGS.map(([v, l]) => h('option', { value: v, selected: v === next.bg }, l))))),
    h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: next.big, onchange: (e) => { next.big = e.target.checked; } }), ' 글씨 크게 (교실 뒤에서도 잘 보이게)'),
    h('div', {}, h('strong', {}, '띄울 위젯'), h('p', { class: 'muted small' }, '체크하면 화면에 나오고, ⠿를 끌거나 ↑↓로 순서를 바꿉니다. 기본 도구(룰렛·모둠 뽑기 등)도 넣을 수 있습니다.'),
      orderPicker(candidates(), next.widgets, (ids) => { next.widgets = ids; next.wide = next.wide.filter((x) => ids.includes(x)); drawWide(); })),
    h('div', {}, h('strong', {}, '두 칸 넓이로 크게'), wideBox)), [
    (close) => h('button', { class: 'btn', onclick: async () => { await savePrefs({ screen: DEFAULT }); close(); toast('기본 구성으로 되돌렸습니다.'); reload(); } }, '기본값'),
    (close) => h('button', { class: 'btn', onclick: close }, '취소'),
    (close) => h('button', { class: 'btn primary', onclick: async () => { try { await savePrefs({ screen: next }); close(); toast('저장했습니다.'); reload(); } catch (e) { toast(e.message, 'error'); } } }, '저장'),
  ], { wide: true });
}
