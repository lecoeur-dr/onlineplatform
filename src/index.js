import { Hono } from 'hono';
import { MODULES, DEFAULT_LISTS, yearRange, normalizeData } from '../public/js/modules.js';
import { mountAuth, loadUser } from './auth.js';
import { randomToken, encryptText, decryptText } from './crypto.js';

const app = new Hono();
const RANK = { viewer: 1, staff: 2, admin: 3 };
const MASK = '••••••';

mountAuth(app);

// ---------- 공통 ----------

async function getSettings(db) {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.results.map((r) => [r.key, JSON.parse(r.value)]));
  return {
    currentYear: s.currentYear || new Date().getFullYear(),
    schoolName: s.schoolName || '',
    lists: { ...DEFAULT_LISTS, ...(s.lists || {}) },
  };
}

async function audit(c, action, module, recordId, detail) {
  const u = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit (email, action, module, record_id, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(u?.email || null, action, module || null, recordId || null, detail ? String(detail).slice(0, 500) : null).run();
}

function canEdit(user, moduleId) {
  return (RANK[user.role] || 0) >= RANK[MODULES[moduleId].edit];
}

const secretKeys = (moduleId) => MODULES[moduleId].fields.filter((f) => f.type === 'secret').map((f) => f.key);

async function encryptSecrets(env, moduleId, data, previous) {
  for (const k of secretKeys(moduleId)) {
    if (data[k] === undefined || data[k] === MASK) {
      if (previous?.[k] !== undefined) data[k] = previous[k];
      else delete data[k];
    } else if (data[k] !== '') data[k] = await encryptText(env, data[k]);
  }
  return data;
}

function toClient(row) {
  const data = JSON.parse(row.data);
  for (const k of secretKeys(row.module)) if (data[k]) data[k] = MASK;
  return { id: row.id, year: row.year, date: row.date, sort: row.sort, data, updatedBy: row.updated_by, updatedAt: row.updated_at };
}

// scope 에 맞는 year/date 컬럼 값
function placement(moduleId, data, year) {
  const scope = MODULES[moduleId].scope;
  return {
    year: scope === 'year' ? Number(year) : null,
    date: scope === 'date' ? data.date || null : null,
  };
}

function scopeWhere(moduleId, year) {
  const scope = MODULES[moduleId].scope;
  if (scope === 'date') {
    const r = yearRange(year);
    return { sql: 'module = ? AND date BETWEEN ? AND ?', args: [moduleId, r.from, r.to] };
  }
  if (scope === 'year') return { sql: 'module = ? AND year = ?', args: [moduleId, Number(year)] };
  return { sql: 'module = ?', args: [moduleId] };
}

async function listRecords(db, moduleId, year) {
  const w = scopeWhere(moduleId, year);
  const order = MODULES[moduleId].scope === 'date' ? 'date, sort, created_at' : 'sort, created_at';
  const rows = await db.prepare(`SELECT * FROM records WHERE ${w.sql} ORDER BY ${order}`).bind(...w.args).all();
  return rows.results.map(toClient);
}

// ---------- 인증 미들웨어 ----------

app.use('/api/*', async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: '로그인이 필요합니다.' }, 401);
  c.set('user', user);
  if (c.req.method !== 'GET' && c.req.header('x-requested-with') !== 'gyomusil') {
    return c.json({ error: '잘못된 요청입니다.' }, 400); // CSRF 방지
  }
  if (c.req.path === '/api/me') return next();
  if (!RANK[user.role]) return c.json({ error: '관리자 승인 후 사용할 수 있습니다.' }, 403);
  return next();
});

app.use('/api/admin/*', async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json({ error: '관리자만 사용할 수 있습니다.' }, 403);
  return next();
});

app.onError((err, c) => {
  if (!err.status) console.error(err);
  return c.json({ error: err.message || '서버 오류' }, err.status || 500);
});

// ---------- 사용자·설정 ----------

app.get('/api/me', async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.json({ user: c.get('user'), settings: { ...settings, schoolName: settings.schoolName || c.env.SCHOOL_NAME || '' } });
});

app.get('/api/staff', async (c) => {
  const rows = await c.env.DB.prepare("SELECT name, dept FROM users WHERE role IN ('admin','staff','viewer') ORDER BY name").all();
  return c.json(rows.results);
});

// ---------- 기록 CRUD ----------

function requireModule(c) {
  const m = c.req.param('module');
  if (!MODULES[m]) throw Object.assign(new Error('알 수 없는 메뉴입니다.'), { status: 404 });
  return m;
}

// 여러 모듈을 한 번에 (달력·대시보드용)
app.get('/api/bundle', async (c) => {
  const year = Number(c.req.query('year')) || (await getSettings(c.env.DB)).currentYear;
  const mods = String(c.req.query('modules') || '').split(',').filter((m) => MODULES[m]);
  const out = {};
  for (const m of mods) out[m] = await listRecords(c.env.DB, m, year);
  return c.json(out);
});

app.get('/api/records/:module', async (c) => {
  const m = requireModule(c);
  const year = Number(c.req.query('year')) || (await getSettings(c.env.DB)).currentYear;
  return c.json(await listRecords(c.env.DB, m, year));
});

app.post('/api/records/:module', async (c) => {
  const m = requireModule(c);
  const user = c.get('user');
  if (!canEdit(user, m)) return c.json({ error: '수정 권한이 없습니다.' }, 403);
  const body = await c.req.json();
  const data = await encryptSecrets(c.env, m, normalizeData(m, body.data));
  const year = body.year || (await getSettings(c.env.DB)).currentYear;
  const p = placement(m, data, year);
  if (MODULES[m].scope === 'date' && !p.date) return c.json({ error: '날짜를 입력해 주세요.' }, 400);
  const id = randomToken(8);
  await c.env.DB.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, m, p.year, p.date, Number(body.sort) || Date.now() % 1e9, JSON.stringify(data), user.email, user.email).run();
  await audit(c, 'create', m, id);
  const row = await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
  return c.json(toClient(row));
});

app.put('/api/records/:module/:id', async (c) => {
  const m = requireModule(c);
  const user = c.get('user');
  if (!canEdit(user, m)) return c.json({ error: '수정 권한이 없습니다.' }, 403);
  const id = c.req.param('id');
  const prev = await c.env.DB.prepare('SELECT * FROM records WHERE id = ? AND module = ?').bind(id, m).first();
  if (!prev) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  const body = await c.req.json();
  const data = await encryptSecrets(c.env, m, normalizeData(m, body.data), JSON.parse(prev.data));
  const p = placement(m, data, prev.year);
  if (MODULES[m].scope === 'date' && !p.date) return c.json({ error: '날짜를 입력해 주세요.' }, 400);
  await c.env.DB.prepare("UPDATE records SET data = ?, date = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(data), p.date, user.email, id).run();
  await audit(c, 'update', m, id);
  const row = await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
  return c.json(toClient(row));
});

app.delete('/api/records/:module/:id', async (c) => {
  const m = requireModule(c);
  if (!canEdit(c.get('user'), m)) return c.json({ error: '수정 권한이 없습니다.' }, 403);
  const id = c.req.param('id');
  const prev = await c.env.DB.prepare('SELECT data FROM records WHERE id = ? AND module = ?').bind(id, m).first();
  if (!prev) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  await c.env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
  await audit(c, 'delete', m, id, m === 'secrets' ? null : prev.data);
  return c.json({ ok: true });
});

// 비밀번호 보기 (기록이 남음)
app.get('/api/records/:module/:id/reveal', async (c) => {
  const m = requireModule(c);
  if (!secretKeys(m).length) return c.json({ error: '대상이 아닙니다.' }, 400);
  const row = await c.env.DB.prepare('SELECT data FROM records WHERE id = ? AND module = ?').bind(c.req.param('id'), m).first();
  if (!row) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  const data = JSON.parse(row.data);
  const out = {};
  for (const k of secretKeys(m)) out[k] = data[k] ? await decryptText(c.env, data[k]) : '';
  await audit(c, 'reveal', m, c.req.param('id'));
  return c.json(out);
});

// 동료장학 참관 신청/취소 (본인 이름으로)
app.post('/api/records/openClasses/:id/observe', async (c) => {
  const user = c.get('user');
  if (user.role === 'viewer') return c.json({ error: '권한이 없습니다.' }, 403);
  const { on } = await c.req.json();
  const id = c.req.param('id');
  const row = await c.env.DB.prepare("SELECT * FROM records WHERE id = ? AND module = 'openClasses'").bind(id).first();
  if (!row) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  const data = JSON.parse(row.data);
  const name = user.name || user.email;
  const set = new Set(data.observers || []);
  if (on) set.add(name); else set.delete(name);
  data.observers = [...set];
  await c.env.DB.prepare("UPDATE records SET data = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(data), user.email, id).run();
  await audit(c, on ? 'observe' : 'unobserve', 'openClasses', id);
  return c.json(toClient({ ...row, data: JSON.stringify(data) }));
});

// ---------- 관리자 ----------

app.get('/api/admin/users', async (c) => {
  const rows = await c.env.DB.prepare('SELECT email, name, role, dept, created_at, last_login FROM users ORDER BY role, name').all();
  return c.json(rows.results);
});

app.put('/api/admin/users/:email', async (c) => {
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  const b = await c.req.json();
  if (b.role && !['admin', 'staff', 'viewer', 'pending', 'blocked'].includes(b.role)) return c.json({ error: '잘못된 권한' }, 400);
  await c.env.DB.prepare('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), dept = COALESCE(?, dept) WHERE email = ?')
    .bind(b.name ?? null, b.role ?? null, b.dept ?? null, email).run();
  if (b.role === 'blocked') await c.env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(email).run();
  await audit(c, 'user', null, email, JSON.stringify(b));
  return c.json({ ok: true });
});

// 미리 교직원 이메일 등록 (첫 로그인 전에 승인해 둘 때)
app.post('/api/admin/users', async (c) => {
  const b = await c.req.json();
  const email = String(b.email || '').trim().toLowerCase();
  if (!email.includes('@')) return c.json({ error: '이메일을 확인해 주세요.' }, 400);
  await c.env.DB.prepare('INSERT INTO users (email, name, role, dept) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, name = excluded.name, dept = excluded.dept')
    .bind(email, b.name || '', b.role || 'staff', b.dept || '').run();
  await audit(c, 'user', null, email, 'add');
  return c.json({ ok: true });
});

app.delete('/api/admin/users/:email', async (c) => {
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(email),
    c.env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email),
  ]);
  await audit(c, 'user', null, email, 'delete');
  return c.json({ ok: true });
});

app.put('/api/admin/settings', async (c) => {
  const b = await c.req.json();
  const stmts = [];
  for (const key of ['currentYear', 'schoolName', 'lists']) {
    if (b[key] !== undefined) {
      stmts.push(c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(key, JSON.stringify(b[key])));
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  await audit(c, 'settings', null, null, Object.keys(b).join(','));
  return c.json(await getSettings(c.env.DB));
});

// 엑셀 가져오기 결과 저장. mode=replace 이면 해당 연도(범위)의 같은 모듈 기록을 지우고 넣음
app.post('/api/admin/import', async (c) => {
  const user = c.get('user');
  const { year, mode, items } = await c.req.json();
  if (!Number(year) || !Array.isArray(items)) return c.json({ error: '잘못된 요청' }, 400);
  const db = c.env.DB;
  const modules = [...new Set(items.map((i) => i.module))].filter((m) => MODULES[m]);
  const stmts = [];
  if (mode === 'replace') {
    for (const m of modules) {
      const w = scopeWhere(m, year);
      stmts.push(db.prepare(`DELETE FROM records WHERE ${w.sql}`).bind(...w.args));
    }
  }
  let n = 0;
  for (const it of items) {
    if (!MODULES[it.module]) continue;
    const data = await encryptSecrets(c.env, it.module, normalizeData(it.module, it.data));
    const p = placement(it.module, data, year);
    if (MODULES[it.module].scope === 'date' && !p.date) continue;
    stmts.push(db.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(randomToken(8), it.module, p.year, p.date, n, JSON.stringify(data), user.email, user.email));
    n++;
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await audit(c, 'import', modules.join(','), null, `${year} ${mode} ${n}건`);
  return c.json({ ok: true, inserted: n, modules });
});

// 연도별 기록(시간표 등)을 다음 해로 복사
app.post('/api/admin/copy-year', async (c) => {
  const user = c.get('user');
  const { from, to, modules } = await c.req.json();
  const db = c.env.DB;
  let n = 0;
  const stmts = [];
  for (const m of modules || []) {
    if (MODULES[m]?.scope !== 'year') continue;
    const rows = await db.prepare('SELECT * FROM records WHERE module = ? AND year = ? ORDER BY sort').bind(m, Number(from)).all();
    for (const r of rows.results) {
      const data = JSON.parse(r.data);
      if (m === 'openClasses') delete data.observers;
      if (m === 'purchases') delete data.received;
      stmts.push(db.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)')
        .bind(randomToken(8), m, Number(to), r.sort, JSON.stringify(data), user.email, user.email));
      n++;
    }
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await audit(c, 'copy-year', (modules || []).join(','), null, `${from}→${to} ${n}건`);
  return c.json({ ok: true, copied: n });
});

app.get('/api/admin/audit', async (c) => {
  const rows = await c.env.DB.prepare('SELECT a.*, u.name FROM audit a LEFT JOIN users u ON u.email = a.email ORDER BY a.id DESC LIMIT 300').all();
  return c.json(rows.results);
});

// 백업 (비밀번호는 암호화된 상태 그대로)
app.get('/api/admin/export', async (c) => {
  const [records, settings, users] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM records ORDER BY module, date, sort').all(),
    c.env.DB.prepare('SELECT * FROM settings').all(),
    c.env.DB.prepare('SELECT email, name, role, dept FROM users').all(),
  ]);
  await audit(c, 'export');
  return c.json({ exportedAt: new Date().toISOString(), records: records.results, settings: settings.results, users: users.results });
});

app.all('/api/*', (c) => c.json({ error: '없는 주소입니다.' }, 404));

export default app;
