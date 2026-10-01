// 🔔 알림함 + 휴대폰 알림(웹 푸시) 켜기
import { h, api, clear, toast, modal } from '../ui.js';
import { state } from '../state.js';

let bell;
let timer;

export function bellButton() {
  bell = h('button', { class: 'icon-btn bell', 'aria-label': '알림', onclick: openInbox }, '🔔');
  return bell;
}

export async function refreshBell() {
  clearTimeout(timer);
  try {
    const { unread } = await api('/api/inbox');
    if (bell) {
      bell.querySelector('.nbadge')?.remove();
      if (unread) bell.append(h('span', { class: 'nbadge' }, unread > 99 ? '99+' : unread));
    }
  } catch { /* 표시만 안 함 */ }
  timer = setTimeout(refreshBell, 120000);
}

async function openInbox() {
  const box = h('div', { class: 'inbox' }, h('p', { class: 'muted' }, '불러오는 중…'));
  const close = modal('🔔 알림', box);
  const { items } = await api('/api/inbox');
  clear(box,
    pushStatusLine(),
    items.length ? h('ul', { class: 'list' }, items.map((n) => h('li', { class: `click ${n.read ? '' : 'unread'}`, onclick: () => { close(); if (n.url) location.href = n.url; } },
      h('strong', {}, n.title), n.body ? h('div', { class: 'small' }, n.body) : null,
      h('div', { class: 'muted small' }, [n.school_name, n.created_at].filter(Boolean).join(' · '))))) : h('p', { class: 'muted' }, '알림이 없습니다.'));
  if (items.some((n) => !n.read)) { await api('/api/inbox/read', { method: 'POST' }).catch(() => {}); refreshBell(); }
}

function pushStatusLine() {
  if (!pushSupported()) return h('p', { class: 'muted small' }, '이 브라우저는 휴대폰 알림을 지원하지 않습니다. (아이폰은 홈 화면에 추가한 앱에서만 가능)');
  if (!state.push) return null;
  return h('p', { class: 'small' }, h('a', { href: '#/me' }, '📲 이 기기에서 휴대폰 알림 받기 설정 →'));
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function pushState() {
  if (!pushSupported() || !state.push) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) return 'on';
  return Notification.permission === 'denied' ? 'denied' : 'off';
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('알림 권한이 허용되지 않았습니다. 브라우저 설정에서 허용해 주세요.', 'error'); return false; }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.push) });
  await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
  toast('이 기기에서 알림을 받습니다.');
  return true;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  toast('이 기기의 알림을 껐습니다.');
}
