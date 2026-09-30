import { MODULES } from './modules.js';

export const state = {
  me: null,       // { email, name, role, dept }
  settings: null, // { currentYear, schoolName, lists }
  year: null,     // 화면에서 보고 있는 학년도
  budgetSources: [], // 물품 신청의 '예산 구분' 드롭다운 (예산·공모사업 이름)
};

const RANK = { viewer: 1, staff: 2, admin: 3 };

export function canEdit(moduleId) {
  return (RANK[state.me?.role] || 0) >= RANK[MODULES[moduleId].edit];
}

export const isAdmin = () => state.me?.role === 'admin';

export function listOf(field) {
  if (field.options) return field.options;
  if (field.list === 'budgetSources') return state.budgetSources;
  if (field.list) return state.settings?.lists?.[field.list] || [];
  return [];
}

export function setYear(y) {
  state.year = Number(y);
  try { localStorage.setItem('gy_year', String(y)); } catch { /* 저장 불가 환경 */ }
}

// 브라우저에 기억하는 화면 선택값 (탭, 보기 방식 등). 저장 불가 환경에서는 기본값
export function remember(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(`gy_${key}`));
    localStorage.setItem(`gy_${key}`, JSON.stringify(value));
  } catch { /* 무시 */ }
  return value;
}
