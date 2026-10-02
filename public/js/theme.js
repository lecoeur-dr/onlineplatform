// 🎨 화면 테마: 밝게(기본) · 어둡게 · 기기 설정 따름 + 주 색
//   개인 선택(이 기기) > 학교 기본 색(학교 관리 → 설정) > 기본(인디고·밝게)
import { h } from './ui.js';
import { state } from './state.js';

export const ACCENTS = [
  { id: 'indigo', label: '인디고', color: '#4f46e5' },
  { id: 'blue', label: '파랑', color: '#2563eb' },
  { id: 'teal', label: '청록', color: '#0d9488' },
  { id: 'violet', label: '보라', color: '#7c3aed' },
  { id: 'rose', label: '로즈', color: '#e11d48' },
  { id: 'orange', label: '주황', color: '#ea580c' },
  { id: 'slate', label: '차분한 회색', color: '#334155' },
  { id: 'warm', label: '따뜻한 베이지', color: '#e07b39' },
];
export const MODES = [['light', '☀️ 밝게'], ['dark', '🌙 어둡게'], ['auto', '💻 기기 설정 따름']];

export function myTheme() {
  try { return JSON.parse(localStorage.getItem('gy_theme')) || {}; } catch { return {}; }
}
export function setMyTheme(patch) {
  const t = { ...myTheme(), ...patch };
  for (const k of Object.keys(t)) if (!t[k]) delete t[k];
  try { localStorage.setItem('gy_theme', JSON.stringify(t)); } catch { /* 무시 */ }
  applyTheme();
}

const media = window.matchMedia?.('(prefers-color-scheme: dark)');
export function applyTheme() {
  const mine = myTheme();
  const mode = mine.mode || 'light';
  const accent = mine.accent || state.settings?.theme?.accent || 'indigo';
  const dark = mode === 'dark' || (mode === 'auto' && media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.accent = accent;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1116' : '#ffffff');
}
media?.addEventListener?.('change', applyTheme);

// 색 고르기 (onPick(id), current, 맨 앞에 '기본' 칸을 둘지)
export function swatches(current, onPick, { withDefault = false } = {}) {
  return h('div', { class: 'swatches' },
    withDefault ? h('button', { class: `swatch ${!current ? 'on' : ''}`, title: '학교 기본', style: { background: 'conic-gradient(#4f46e5, #0d9488, #ea580c, #e11d48, #4f46e5)' }, onclick: () => onPick('') }) : null,
    ACCENTS.map((a) => h('button', { class: `swatch ${current === a.id ? 'on' : ''}`, title: a.label, 'aria-label': a.label, style: { background: a.color }, onclick: () => onPick(a.id) })));
}
