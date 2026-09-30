// 구글 계정(개인 Gmail 포함) 로그인 — OAuth 2.0 / OpenID Connect
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomToken } from './crypto.js';

const SESSION_DAYS = 30;
const COOKIE = 'gy_session';

export function adminEmails(env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function redirectUri(c) {
  return new URL('/auth/callback', c.req.url).toString();
}

function secureCookie(c) {
  return new URL(c.req.url).protocol === 'https:';
}

export function mountAuth(app) {
  app.get('/auth/login', (c) => {
    const env = c.env;
    if (!env.GOOGLE_CLIENT_ID) return c.text('GOOGLE_CLIENT_ID 가 설정되지 않았습니다. docs/02_배포_가이드.md 를 확인하세요.', 500);
    const state = randomToken(16);
    setCookie(c, 'gy_state', state, { httpOnly: true, secure: secureCookie(c), sameSite: 'Lax', path: '/auth', maxAge: 600 });
    const p = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(c),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  });

  app.get('/auth/callback', async (c) => {
    const env = c.env;
    const { code, state } = c.req.query();
    const saved = getCookie(c, 'gy_state');
    deleteCookie(c, 'gy_state', { path: '/auth' });
    if (!code || !state || state !== saved) return c.text('로그인 요청이 만료되었습니다. 다시 시도해 주세요.', 400);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(c),
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) return c.text('구글 로그인에 실패했습니다.', 400);
    const tok = await res.json();
    // 토큰 엔드포인트에서 TLS 로 직접 받은 id_token 이므로 서명 검증 없이 내용 사용 가능 (OIDC Core 3.1.3.7)
    const info = decodeJwtPayload(tok.id_token);
    if (info.aud !== env.GOOGLE_CLIENT_ID || !info.email_verified) return c.text('확인되지 않은 계정입니다.', 403);
    await startSession(c, String(info.email).toLowerCase(), info.name || '', info.picture || '');
    return c.redirect('/');
  });

  // 로컬 개발 전용 로그인 (DEV_LOGIN=1 일 때만)
  app.get('/auth/dev', async (c) => {
    if (c.env.DEV_LOGIN !== '1') return c.notFound();
    const email = String(c.req.query('email') || '').toLowerCase();
    if (!email.includes('@')) return c.text('email 필요', 400);
    await startSession(c, email, c.req.query('name') || email.split('@')[0], '');
    return c.redirect('/');
  });

  app.post('/auth/logout', async (c) => {
    const token = getCookie(c, COOKIE);
    if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
}

// base64url → UTF-8 JSON (한글 이름이 깨지지 않도록 바이트로 복원)
function decodeJwtPayload(jwt) {
  let s = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bytes = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function startSession(c, email, name, picture) {
  const db = c.env.DB;
  const isAdmin = adminEmails(c.env).includes(email);
  const existing = await db.prepare('SELECT role, name FROM users WHERE email = ?').bind(email).first();
  if (!existing) {
    await db.prepare('INSERT INTO users (email, name, role, picture, last_login) VALUES (?, ?, ?, ?, datetime(\'now\'))')
      .bind(email, name, isAdmin ? 'admin' : 'pending', picture).run();
  } else {
    await db.prepare('UPDATE users SET last_login = datetime(\'now\'), picture = ?, role = ?, name = CASE WHEN name = \'\' THEN ? ELSE name END WHERE email = ?')
      .bind(picture, isAdmin ? 'admin' : existing.role, name, email).run();
  }
  const token = randomToken();
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await db.prepare('INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)').bind(token, email, expires).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  setCookie(c, COOKIE, token, { httpOnly: true, secure: secureCookie(c), sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

// 요청마다 세션 확인 → c.get('user')
export async function loadUser(c) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    'SELECT u.email, u.name, u.role, u.dept, u.picture FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = ? AND s.expires_at > ?'
  ).bind(token, Date.now()).first();
  if (!row) return null;
  if (adminEmails(c.env).includes(row.email)) row.role = 'admin';
  return row;
}
