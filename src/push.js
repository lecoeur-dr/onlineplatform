// 알림: 알림함(inbox)에 남기고, 휴대폰 알림(웹 푸시)을 구독한 기기에 신호를 보냄
//   - 푸시에는 내용을 싣지 않음(암호화 불필요). 기기가 신호를 받으면 /api/inbox/latest 로 내용을 가져와 표시
//   - VAPID 키: VAPID_PUBLIC(공개키, base64url) · VAPID_PRIVATE_JWK(개인키 JWK, 비밀값)

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();

let keyCache = null;
async function signingKey(env) {
  if (keyCache?.raw === env.VAPID_PRIVATE_JWK) return keyCache.key;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  keyCache = { raw: env.VAPID_PRIVATE_JWK, key };
  return key;
}

async function vapidJwt(env, aud, sub) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export const pushReady = (env) => !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE_JWK);

// 구독한 기기들에 빈 푸시 보내기 (무료 요금제 하위 요청 한도를 고려해 최대 40개)
export async function sendPush(env, db, emails, origin) {
  if (!pushReady(env) || !emails.length) return;
  const list = [...new Set(emails)].slice(0, 200);
  const subs = await db.prepare(`SELECT endpoint FROM push_subs WHERE email IN (${list.map(() => '?').join(',')}) LIMIT 40`).bind(...list).all();
  const jwts = {};
  await Promise.all(subs.results.map(async ({ endpoint }) => {
    try {
      const aud = new URL(endpoint).origin;
      jwts[aud] ||= await vapidJwt(env, aud, origin);
      const res = await fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'normal', Authorization: `vapid t=${jwts[aud]}, k=${env.VAPID_PUBLIC}` } });
      if (res.status === 404 || res.status === 410) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
    } catch (e) { console.error('push', e.message); }
  }));
}

// 알림함에 넣고 푸시. emails 는 받을 사람들
export async function notify(c, emails, { title, body = '', url = '' }, schoolId = null) {
  const db = c.env.DB;
  const actor = c.get('user')?.email;
  const to = [...new Set(emails.filter((e) => e && e !== actor))];
  if (!to.length) return;
  const stmts = to.map((e) => db.prepare('INSERT INTO inbox (email, school_id, title, body, url) VALUES (?, ?, ?, ?, ?)').bind(e, schoolId, title.slice(0, 120), body.slice(0, 300), url));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  const origin = new URL(c.req.url).origin;
  c.executionCtx.waitUntil(sendPush(c.env, db, to, origin));
}
