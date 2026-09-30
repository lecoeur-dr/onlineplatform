// 화면 공통 도구: DOM 만들기, 모달, 알림, 서버 호출

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv); // CSS 변수(색 분류 등)
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'gyomusil' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) {
    const err = new Error(data?.error || `오류 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function toast(msg, kind = 'ok') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 2500);
}

export function modal(title, body, actions = [], { wide = false } = {}) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'modal-wrap', onmousedown: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': '닫기' }, '✕')),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => a(close))) : null));
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  setTimeout(() => wrap.querySelector('input,textarea,select')?.focus(), 30);
  return close;
}

export function confirmBox(msg) {
  return new Promise((resolve) => {
    modal('확인', h('p', { class: 'pre' }, msg), [
      (close) => h('button', { class: 'btn', onclick: () => { close(); resolve(false); } }, '취소'),
      (close) => h('button', { class: 'btn danger', onclick: () => { close(); resolve(true); } }, '확인'),
    ]);
  });
}

export const won = (n) => (n === '' || n === null || n === undefined || Number.isNaN(Number(n)) ? (n ?? '') : `${Number(n).toLocaleString('ko-KR')}원`);

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export function fmtDate(s, withDow = true) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dow = DOW[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}${withDow ? `(${dow})` : ''}`;
}
export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
export { DOW };

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`불러오기 실패: ${src}`));
    document.head.append(s);
  });
}

export function download(filename, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}
