import { MODULES } from './modules.js';

export const state = {
  me: null,       // { email, name, role, dept }
  settings: null, // { currentYear, schoolName, lists }
  year: null,     // 화면에서 보고 있는 학년도
};

const RANK = { viewer: 1, staff: 2, admin: 3 };

export function canEdit(moduleId) {
  return (RANK[state.me?.role] || 0) >= RANK[MODULES[moduleId].edit];
}

export const isAdmin = () => state.me?.role === 'admin';

export function listOf(field) {
  if (field.options) return field.options;
  if (field.list) return state.settings?.lists?.[field.list] || [];
  return [];
}

export function setYear(y) {
  state.year = Number(y);
  try { localStorage.setItem('gy_year', String(y)); } catch { /* 저장 불가 환경 */ }
}
