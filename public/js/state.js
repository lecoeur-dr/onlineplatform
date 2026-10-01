import { MODULES, DEFAULT_LISTS, spaceOf } from './modules.js';

export const state = {
  me: null,       // { email, name, role(학교 권한), dept, super, accountName }
  account: null,  // 구글 계정 { email, name, picture, super }
  schools: [],    // 내가 속한(신청한) 학교 [{ id, name, status, role }]
  member: null,   // 지금 학교에서의 내 자격 (없으면 학교 가입 전)
  settings: null, // { currentYear, schoolName, lists, neis }
  space: 'school', // school(OnlineFlatform) | desk(Deskterior)
  year: null,     // 화면에서 보고 있는 학년도
  budgetSources: [], // 물품 신청의 '예산 구분' 드롭다운 (예산·공모사업 이름)
  staff: [],         // 승인된 교직원 [{name, dept}] — 이름 드롭다운용
  students: [],      // Deskterior 학생 이름 (누가기록 드롭다운)
  push: null,        // 웹 푸시 공개키 (없으면 휴대폰 알림 미설정)
};

export const defaultSettings = () => ({ currentYear: new Date().getFullYear(), schoolName: '', lists: { ...DEFAULT_LISTS }, neis: null });

const RANK = { viewer: 1, staff: 2, admin: 3 };

export function canEdit(moduleId) {
  if (spaceOf(moduleId) !== 'school') return true; // 개인 공간·마켓(본인 글)은 서버가 확인
  return (RANK[state.me?.role] || 0) >= RANK[MODULES[moduleId].edit];
}

export const isAdmin = () => state.me?.role === 'admin';
export const hasSchool = () => !!state.member;

export function listOf(field) {
  if (field.options) return field.options;
  if (field.list === 'budgetSources') return state.budgetSources;
  if (field.list === 'staff') return state.staff.map((x) => x.name).filter(Boolean);
  if (field.list === 'students') return state.students;
  if (field.list) return state.settings?.lists?.[field.list] || DEFAULT_LISTS[field.list] || [];
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

export const myName = () => state.me?.name || state.me?.email || '';
