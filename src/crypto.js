// 비밀번호 필드 암호화 (AES-GCM). DATA_KEY 는 wrangler secret 으로 등록한 32바이트 base64 값

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}

let cachedKey = null;
let cachedRaw = null;

async function getKey(env) {
  const raw = env.DATA_KEY;
  if (!raw) throw new Error('DATA_KEY 가 설정되지 않았습니다 (wrangler secret put DATA_KEY)');
  if (cachedKey && cachedRaw === raw) return cachedKey;
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error('DATA_KEY 는 32바이트 base64 값이어야 합니다');
  cachedKey = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  cachedRaw = raw;
  return cachedKey;
}

export async function encryptText(env, text) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return `enc:${b64(iv)}:${b64(ct)}`;
}

export async function decryptText(env, value) {
  if (typeof value !== 'string' || !value.startsWith('enc:')) return value;
  const [, iv, ct] = value.split(':');
  const key = await getKey(env);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return dec.decode(pt);
}
