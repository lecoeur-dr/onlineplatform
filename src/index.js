import { Hono } from 'hono';
import { MODULES, DEFAULT_LISTS, SELF_TOGGLE, yearRange, normalizeData, spaceOf } from '../public/js/modules.js';
import { searchSchools, syncSchedule, getMeals, getTimetable, getDayTimetable } from './neis.js';
import { mountAuth, loadUser, adminEmails } from './auth.js';
import { randomToken, encryptText, decryptText } from './crypto.js';
import { evalFormula } from '../public/js/calc.js';
import { presetQuestions, tallyOf, checkAnswers } from '../public/js/collect.js';
import { notify, pushReady, sendPush } from './push.js';

const app = new Hono();
const RANK = { viewer: 1, staff: 2, admin: 3 };
const ACTIVE_ROLES = ['admin', 'staff', 'viewer'];
const MASK = '••••••';
const err = (status, message) => Object.assign(new Error(message), { status });

mountAuth(app);

// ---------- 학교·설정 ----------

async function getSettings(db, schoolId) {
  const school = await db.prepare('SELECT name FROM schools WHERE id = ?').bind(schoolId).first();
  const rows = await db.prepare('SELECT key, value FROM school_settings WHERE school_id = ?').bind(schoolId).all();
  const s = Object.fromEntries(rows.results.map((r) => [r.key, JSON.parse(r.value)]));
  return {
    currentYear: s.currentYear || new Date().getFullYear(),
    schoolName: school?.name || s.schoolName || '',
    lists: { ...DEFAULT_LISTS, ...(s.lists || {}) },
    neis: s.neis || null, // { atpt, code, name, office, lastSync }
    theme: s.theme || null, // { accent }
    access: s.access || {}, // 행정·예산 탭별 권한 { 탭: [이메일] }
  };
}

const putSetting = (db, schoolId, key, value) => db.prepare('INSERT INTO school_settings (school_id, key, value) VALUES (?, ?, ?) ON CONFLICT(school_id, key) DO UPDATE SET value = excluded.value')
  .bind(schoolId, key, JSON.stringify(value));

// 요청한 학교(x-school 머리글, 없으면 첫 학교)에서의 내 자격. 없으면 null
async function memberOf(c) {
  if (c.get('member') !== undefined) return c.get('member');
  const user = c.get('user');
  const want = c.req.header('x-school') || '';
  const rows = await c.env.DB.prepare(`SELECT m.school_id, m.role, m.name, m.dept, s.name AS school_name, s.status
    FROM members m JOIN schools s ON s.id = m.school_id WHERE m.email = ? ORDER BY m.created_at`).bind(user.email).all();
  const ok = (r) => r.status === 'active' && ACTIVE_ROLES.includes(r.role);
  const row = rows.results.find((r) => r.school_id === want && ok(r)) || (!want ? rows.results.find(ok) : null) || null;
  const member = row ? { schoolId: row.school_id, role: row.role, name: row.name || user.name, dept: row.dept, schoolName: row.school_name } : null;
  c.set('member', member);
  return member;
}

async function requireSchool(c, min = 'viewer') {
  const m = await memberOf(c);
  if (!m) throw err(403, '학교에 가입 승인된 뒤 사용할 수 있습니다.');
  if ((RANK[m.role] || 0) < RANK[min]) throw err(403, min === 'admin' ? '학교 관리자만 사용할 수 있습니다.' : '권한이 없습니다.');
  return m;
}

async function audit(c, action, module, recordId, detail) {
  const u = c.get('user');
  const m = c.get('member');
  await c.env.DB.prepare('INSERT INTO audit (email, action, module, record_id, detail, school_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(u?.email || null, action, module || null, recordId || null, detail ? String(detail).slice(0, 500) : null, m?.schoolId || null).run();
}

// 모듈별 '누구의 기록인가' : 학교 기록 → school_id, 개인 기록 → owner, 마켓 → 모두 읽기
async function tenant(c, m) {
  const user = c.get('user');
  const space = spaceOf(m);
  if (space === 'desk') return { col: 'owner', val: user.email, canEdit: true, space };
  if (space === 'market') return { col: null, val: null, canEdit: true, space };
  const mem = await requireSchool(c);
  return { col: 'school_id', val: mem.schoolId, canEdit: (RANK[mem.role] || 0) >= RANK[MODULES[m].edit], space, member: mem };
}

const secretKeys = (m) => MODULES[m].fields.filter((f) => f.type === 'secret').map((f) => f.key);
const encKeys = (m) => MODULES[m].fields.filter((f) => f.enc).map((f) => f.key);

async function encryptSecrets(env, m, data, previous) {
  for (const k of secretKeys(m)) {
    if (data[k] === undefined || data[k] === MASK) {
      if (previous?.[k] !== undefined) data[k] = previous[k];
      else delete data[k];
    } else if (data[k] !== '') data[k] = await encryptText(env, data[k]);
  }
  for (const k of encKeys(m)) if (typeof data[k] === 'string' && data[k] !== '') data[k] = await encryptText(env, data[k]);
  return data;
}

async function toClient(env, row) {
  const data = JSON.parse(row.data);
  for (const k of secretKeys(row.module)) if (data[k]) data[k] = MASK;
  for (const k of encKeys(row.module)) if (data[k]) { try { data[k] = await decryptText(env, data[k]); } catch { data[k] = '(복호화 실패)'; } }
  const out = { id: row.id, year: row.year, date: row.date, sort: row.sort, version: row.version, data, updatedBy: row.updated_by, updatedAt: row.updated_at };
  if (row.author_name !== undefined) { out.author = row.author_name || ''; out.owner = row.owner; }
  if (row.module === 'boards' || row.module === 'collections') out.createdBy = row.created_by;
  return out;
}

function placement(m, data, year) {
  const scope = MODULES[m].scope;
  return { year: scope === 'year' ? Number(year) : null, date: scope === 'date' ? data.date || null : null };
}

function scopeWhere(m, year, t) {
  const scope = MODULES[m].scope;
  const parts = ['module = ?'];
  const args = [m];
  if (t.col) { parts.push(`${t.col} = ?`); args.push(t.val); }
  if (scope === 'date') { const r = yearRange(year); parts.push('date BETWEEN ? AND ?'); args.push(r.from, r.to); }
  if (scope === 'year') { parts.push('year = ?'); args.push(Number(year)); }
  return { sql: parts.join(' AND '), args };
}


// 행정·예산 권한: 공모 안내·기한 안내는 모두에게, 나머지 탭은 관리자 + 관리자가 탭별로 권한을 준 사람만
//   access 설정 = { overview: [이메일…], school: […], contests: […], spend: […], purchases: […] }
//   공모사업은 그 사업 담당자(contests.managers)도 자기 사업만 봄
const MONEY_AREAS = ['overview', 'school', 'contests', 'spend', 'purchases'];
const MONEY_SCOPED = ['contests', 'budget', 'spending', 'purchases', 'purchaseRequests'];
// 자유 표 '나만 보기': 만든 사람만 보고 고침
const isPrivateOther = (row, email) => row.module === 'boards' && JSON.parse(row.data).visibility === '나만 보기' && row.created_by !== email;
async function moneyAccess(c, mem) {
  if (!mem) return null;
  const cached = c.get('moneyAcc');
  if (cached) return cached;
  let acc;
  if (mem.role === 'admin') acc = { admin: true, areas: new Set(MONEY_AREAS), mine: new Set(), all: new Set(), has: () => true };
  else {
    const email = String(c.get('user').email || '').toLowerCase();
    const access = (await c.env.DB.prepare("SELECT value FROM school_settings WHERE school_id = ? AND key = 'access'").bind(mem.schoolId).first())?.value;
    const grants = access ? JSON.parse(access) : {};
    const areas = new Set(MONEY_AREAS.filter((a) => (grants[a] || []).includes(email)));
    const rows = (await c.env.DB.prepare("SELECT data FROM records WHERE module = 'contests' AND school_id = ?").bind(mem.schoolId).all()).results.map((r) => JSON.parse(r.data));
    const me = String(mem.name || '').replace(/\s/g, '');
    const all = new Set(rows.map((d) => d.name).filter(Boolean));
    const mine = new Set(rows.filter((d) => me && (d.managers || []).map((x) => String(x).replace(/\s/g, '')).includes(me)).map((d) => d.name));
    // 구매신청 건별 공개: 공개 범위가 '전체 교직원'이거나 '지정한 사람'에 내 이름이 있으면 그 건만 보고 품목을 담음
    const reqRows = (await c.env.DB.prepare("SELECT id, data FROM records WHERE module = 'purchaseRequests' AND school_id = ?").bind(mem.schoolId).all()).results;
    const reqs = new Set();
    const reqsOpen = new Set();
    for (const r of reqRows) {
      const d = JSON.parse(r.data);
      const names = (Array.isArray(d.members) ? d.members : String(d.members || '').split(/[,，\n]/)).map((x) => x.replace(/\s/g, '')).filter(Boolean);
      if (d.audience === '전체 교직원' || (d.audience === '지정한 사람' && me && names.includes(me))) { reqs.add(r.id); if (d.open) reqsOpen.add(r.id); }
    }
    acc = { admin: false, areas, mine, all, reqs, reqsOpen, me, has: (a) => areas.has(a) };
  }
  c.set('moneyAcc', acc);
  return acc;
}
// 이 사람에게 보이는 행정·예산 탭 (메뉴 표시용)
async function myMoneyTabs(c, mem) {
  const acc = await moneyAccess(c, mem);
  if (!acc) return [];
  const tabs = new Set(acc.areas);
  if (acc.mine.size) tabs.add('contests');
  if (acc.reqs?.size) tabs.add('purchases');
  return [...tabs];
}
const isContestRow = (acc, m, d) => (m === 'purchases' ? acc.all.has(d.budget) : d.source === '공모사업' || acc.all.has(d.program));
function moneyCanSee(acc, m, d, id) {
  if (acc.admin) return true;
  if (m === 'contests') return acc.has('contests') || acc.mine.has(d.name);
  if (m === 'purchaseRequests') return acc.has('purchases') || acc.reqs.has(id);
  if (m === 'purchases') return acc.has('purchases') || (isContestRow(acc, m, d) && acc.mine.has(d.budget)) || acc.reqs.has(d.requestId);
  if (isContestRow(acc, m, d)) return acc.has('contests') || acc.mine.has(d.program);
  return acc.has('overview') || acc.has('school') || (m === 'spending' && acc.has('spend'));
}
async function moneyFilter(c, mem) {
  const acc = await moneyAccess(c, mem);
  if (!acc || acc.admin) return null;
  return (m, d, id) => moneyCanSee(acc, m, d, id);
}

async function listRecords(c, m, year) {
  const t = await tenant(c, m);
  const w = scopeWhere(m, year, t);
  const order = MODULES[m].scope === 'date' ? 'date, sort, created_at' : t.space === 'market' ? 'created_at DESC' : 'sort, created_at';
  const sql = t.space === 'market'
    ? `SELECT r.*, COALESCE(NULLIF(u.name, ''), '선생님') AS author_name FROM records r LEFT JOIN users u ON u.email = r.owner WHERE ${w.sql.replace(/\bmodule\b/, 'r.module')} ORDER BY r.${order.replace(/, /g, ', r.')} LIMIT 500`
    : `SELECT * FROM records WHERE ${w.sql} ORDER BY ${order}`;
  const rows = await c.env.DB.prepare(sql).bind(...w.args).all();
  let list = rows.results;
  if (m === 'boards') list = list.filter((r) => !isPrivateOther(r, c.get('user').email));
  if (MONEY_SCOPED.includes(m) && t.member) {
    const ok = await moneyFilter(c, t.member);
    if (ok) list = list.filter((r) => ok(m, JSON.parse(r.data), r.id));
  }
  return Promise.all(list.map((r) => toClient(c.env, r)));
}

// 기록 하나 (권한 범위 안에서만)
async function findRecord(c, m, id, t) {
  const cond = t.col ? ` AND ${t.col} = ?` : '';
  return c.env.DB.prepare(`SELECT * FROM records WHERE id = ? AND module = ?${cond}`).bind(id, m, ...(t.col ? [t.val] : [])).first();
}

const canWrite = (c, t, row) => (t.space === 'market' ? !row || row.owner === c.get('user').email || c.get('user').super : t.canEdit);

// ---------- 인증 미들웨어 ----------

app.use('/api/*', async (c, next) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: '로그인이 필요합니다.' }, 401);
  if (user.role === 'blocked') return c.json({ error: '사용이 제한된 계정입니다.' }, 403);
  c.set('user', user);
  if (c.req.method !== 'GET' && c.req.header('x-requested-with') !== 'gyomusil') {
    return c.json({ error: '잘못된 요청입니다.' }, 400); // CSRF 방지
  }
  return next();
});

app.use('/api/admin/*', async (c, next) => { await requireSchool(c, 'admin'); return next(); });
app.use('/api/platform/*', async (c, next) => {
  if (!c.get('user').super) return c.json({ error: '플랫폼 운영자만 사용할 수 있습니다.' }, 403);
  return next();
});

app.onError((e, c) => {
  if (!e.status) console.error(e);
  return c.json({ error: e.message || '서버 오류' }, e.status || 500);
});

// ---------- 나 · 학교 가입 ----------

app.get('/api/me', async (c) => {
  const user = c.get('user');
  const schools = await c.env.DB.prepare(`SELECT s.id, s.name, s.status, m.role FROM members m JOIN schools s ON s.id = m.school_id WHERE m.email = ? ORDER BY m.created_at`).bind(user.email).all();
  const member = await memberOf(c);
  const settings = member ? await getSettings(c.env.DB, member.schoolId) : null;
  return c.json({
    user: { email: user.email, name: user.name, picture: user.picture, super: !!user.super },
    schools: schools.results,
    member: member ? { ...member, moneyTabs: await myMoneyTabs(c, member), moneyGrants: [...(await moneyAccess(c, member)).areas] } : null,
    settings: settings ? { ...settings, neisKey: !!c.env.NEIS_API_KEY } : null,
    push: pushReady(c.env) ? c.env.VAPID_PUBLIC : null,
  });
});

app.put('/api/me', async (c) => {
  const b = await c.req.json();
  const name = String(b.name || '').trim().slice(0, 30);
  if (!name) return c.json({ error: '이름을 입력해 주세요.' }, 400);
  await c.env.DB.prepare('UPDATE users SET name = ? WHERE email = ?').bind(name, c.get('user').email).run();
  return c.json({ ok: true });
});

app.get('/api/schools/search', async (c) => {
  const q = String(c.req.query('q') || '').trim();
  if (q.length < 2) return c.json([]);
  const rows = await c.env.DB.prepare("SELECT id, name FROM schools WHERE status = 'active' AND name LIKE ? ORDER BY name LIMIT 20").bind(`%${q}%`).all();
  return c.json(rows.results);
});

const schoolAdmins = async (db, schoolId) => (await db.prepare("SELECT email FROM members WHERE school_id = ? AND role = 'admin'").bind(schoolId).all()).results.map((r) => r.email);

// 가입 요청: 학교 검색으로 고르거나 초대 코드. 학교 관리자가 승인해야 사용 가능
app.post('/api/schools/join', async (c) => {
  const user = c.get('user');
  const b = await c.req.json();
  const db = c.env.DB;
  const school = b.code
    ? await db.prepare("SELECT id, name FROM schools WHERE invite_code = ? AND status = 'active'").bind(String(b.code).trim().toLowerCase()).first()
    : await db.prepare("SELECT id, name FROM schools WHERE id = ? AND status = 'active'").bind(String(b.schoolId || '')).first();
  if (!school) return c.json({ error: b.code ? '초대 코드가 맞지 않습니다.' : '학교를 찾을 수 없습니다.' }, 404);
  const name = String(b.name || user.name || '').trim().slice(0, 30);
  const prev = await db.prepare('SELECT role FROM members WHERE school_id = ? AND email = ?').bind(school.id, user.email).first();
  if (prev) return c.json({ ok: true, status: prev.role, school });
  const note = String(b.note || '').trim().slice(0, 300);
  await db.prepare("INSERT INTO members (school_id, email, role, name, note) VALUES (?, ?, 'pending', ?, ?)").bind(school.id, user.email, name, note).run();
  await notify(c, await schoolAdmins(db, school.id), { title: '🙋 학교 가입 요청', body: `${name || user.email} 선생님이 가입을 요청했습니다.${note ? ` 「${note.slice(0, 60)}」` : ''}`, url: '/#/admin' }, school.id);
  return c.json({ ok: true, status: 'pending', school });
});

// 새 학교 개설: 플랫폼 운영자가 승인하면 사용 가능 (운영자가 만들면 바로 사용)
app.post('/api/schools', async (c) => {
  const user = c.get('user');
  const b = await c.req.json();
  const db = c.env.DB;
  const name = String(b.name || '').trim().slice(0, 40);
  if (name.length < 2) return c.json({ error: '학교 이름을 입력해 주세요.' }, 400);
  const mine = await db.prepare("SELECT COUNT(*) n FROM schools WHERE created_by = ? AND status = 'pending'").bind(user.email).first();
  if (mine.n >= 2) return c.json({ error: '승인 대기 중인 학교가 이미 있습니다.' }, 400);
  if (b.neisCode) {
    const dup = await db.prepare("SELECT name FROM schools WHERE neis_code = ? AND status != 'closed'").bind(String(b.neisCode)).first();
    if (dup) return c.json({ error: `이미 개설된 학교입니다 (${dup.name}). 학교 찾기로 가입을 요청해 주세요.` }, 409);
  }
  const id = `s${randomToken(5)}`;
  const status = user.super ? 'active' : 'pending';
  await db.batch([
    db.prepare('INSERT INTO schools (id, name, status, invite_code, neis_code, created_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, name, status, randomToken(4), b.neisCode || null, user.email, String(b.note || '').trim().slice(0, 300)),
    db.prepare("INSERT INTO members (school_id, email, role, name, dept) VALUES (?, ?, 'admin', ?, ?)").bind(id, user.email, String(b.myName || user.name || ''), String(b.dept || '')),
    putSetting(db, id, 'currentYear', new Date().getFullYear()),
  ]);
  if (b.neis?.atpt && b.neis?.code) await putSetting(db, id, 'neis', { atpt: String(b.neis.atpt), code: String(b.neis.code), name: String(b.neis.name || name), office: String(b.neis.office || '') }).run();
  if (status === 'pending') await notify(c, adminEmails(c.env), { title: '🏫 새 학교 개설 신청', body: `${name} (${user.email})${b.note ? ` 「${String(b.note).slice(0, 60)}」` : ''}`, url: '/#/platform' });
  return c.json({ ok: true, id, status });
});

// 학교에서 나가기 (마지막 관리자는 못 나감)
app.delete('/api/schools/:id/membership', async (c) => {
  const id = c.req.param('id');
  const email = c.get('user').email;
  const admins = await schoolAdmins(c.env.DB, id);
  if (admins.length === 1 && admins[0] === email) return c.json({ error: '마지막 관리자는 나갈 수 없습니다. 다른 관리자를 먼저 지정해 주세요.' }, 400);
  await c.env.DB.prepare('DELETE FROM members WHERE school_id = ? AND email = ?').bind(id, email).run();
  return c.json({ ok: true });
});

// ---------- 플랫폼 운영자 (ADMIN_EMAILS) ----------

app.get('/api/platform/schools', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM members m WHERE m.school_id = s.id AND m.role IN ('admin','staff','viewer')) AS members,
    (SELECT COUNT(*) FROM records r WHERE r.school_id = s.id) AS records FROM schools s ORDER BY s.status = 'pending' DESC, s.created_at DESC`).all();
  return c.json(rows.results.map(({ invite_code, ...r }) => r));
});

app.put('/api/platform/schools/:id', async (c) => {
  const { status } = await c.req.json();
  if (!['active', 'pending', 'closed'].includes(status)) return c.json({ error: '잘못된 상태' }, 400);
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE schools SET status = ? WHERE id = ?').bind(status, id).run();
  const s = await c.env.DB.prepare('SELECT name, created_by FROM schools WHERE id = ?').bind(id).first();
  if (status === 'active' && s?.created_by) await notify(c, [s.created_by], { title: '🏫 학교 개설 승인', body: `${s.name}을(를) 이제 사용할 수 있습니다.`, url: '/' }, id);
  return c.json({ ok: true });
});

// ---------- 학교 공통 ----------

app.get('/api/staff', async (c) => {
  const m = await requireSchool(c);
  const rows = await c.env.DB.prepare("SELECT name, dept FROM members WHERE school_id = ? AND role IN ('admin','staff','viewer') AND name != '' ORDER BY name").bind(m.schoolId).all();
  // 업무분장표에만 있는 교직원(아직 가입 전)도 이름 드롭다운에 포함
  const { currentYear } = await getSettings(c.env.DB, m.schoolId);
  const extra = await c.env.DB.prepare("SELECT DISTINCT json_extract(data, '$.name') AS name, json_extract(data, '$.dept') AS dept FROM records WHERE school_id = ? AND module = 'assignments' AND year IN (?, ?)").bind(m.schoolId, currentYear, currentYear + 1).all();
  const have = new Set(rows.results.map((r) => r.name));
  for (const r of extra.results) if (r.name && !have.has(r.name)) { have.add(r.name); rows.results.push({ name: r.name, dept: r.dept || '' }); }
  rows.results.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return c.json(rows.results);
});

// ---------- 기록 CRUD ----------

function requireModule(c) {
  const m = c.req.param('module');
  if (!MODULES[m]) throw err(404, '알 수 없는 메뉴입니다.');
  return m;
}

const yearOf = async (c, q) => Number(q) || (await memberOf(c) ? (await getSettings(c.env.DB, c.get('member').schoolId)).currentYear : new Date().getFullYear());

app.get('/api/bundle', async (c) => {
  const year = await yearOf(c, c.req.query('year'));
  const mods = String(c.req.query('modules') || '').split(',').filter((m) => MODULES[m]);
  const out = {};
  for (const m of mods) out[m] = await listRecords(c, m, year);
  return c.json(out);
});

app.get('/api/records/:module', async (c) => {
  const m = requireModule(c);
  return c.json(await listRecords(c, m, await yearOf(c, c.req.query('year'))));
});

// 이름 → 이 학교 구성원 이메일
async function emailsByName(db, schoolId, names) {
  const list = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
  if (!list.length) return [];
  const rows = await db.prepare(`SELECT email FROM members WHERE school_id = ? AND role IN ('admin','staff','viewer') AND name IN (${list.map(() => '?').join(',')})`).bind(schoolId, ...list).all();
  return rows.results.map((r) => r.email);
}
async function allMembers(db, schoolId) {
  return (await db.prepare("SELECT email FROM members WHERE school_id = ? AND role IN ('admin','staff','viewer')").bind(schoolId).all()).results.map((r) => r.email);
}

// 저장 뒤 알림: 보결·담당은 그 사람에게, 전체 공지·수합·전달사항은 학교 전체에
async function notifyChange(c, m, data, prev, schoolId) {
  const db = c.env.DB;
  const short = (s) => String(s || '').split('\n')[0].slice(0, 60);
  const d = data.date ? `${Number(data.date.slice(5, 7))}/${Number(data.date.slice(8, 10))} ` : '';
  if (m === 'substitutes' && data.substitute && data.substitute !== prev?.substitute) {
    return notify(c, await emailsByName(db, schoolId, [data.substitute]), { title: '🔁 보결 배정', body: `${d}${data.period || ''} ${data.className || ''} ${data.subject || ''} (${data.absent || ''} ${data.reason || ''})`, url: '/#/class/substitutes' }, schoolId);
  }
  if (m === 'duties' && data.person && data.person !== prev?.person) {
    return notify(c, await emailsByName(db, schoolId, [data.person]), { title: '🧑‍🏫 담당 배정', body: `${d}${data.title} ${data.role ? `· ${data.role}` : ''}`, url: '/#/notice/duties' }, schoolId);
  }
  if (m === 'notices' && data.pinned && !prev?.pinned) {
    return notify(c, await allMembers(db, schoolId), { title: '📌 전체 공지', body: short(data.title || data.content), url: '/#/notice/notices' }, schoolId);
  }
  if (m === 'collections' && !prev) {
    const to = data.target?.length ? await emailsByName(db, schoolId, data.target) : await allMembers(db, schoolId);
    return notify(c, to, { title: '📥 새 취합', body: `${short(data.title)}${data.due ? ` (마감 ${data.due.slice(5)})` : ''}`, url: '/#/notice/collections' }, schoolId);
  }
  if (m === 'briefings' && !prev) {
    return notify(c, await allMembers(db, schoolId), { title: `📣 ${data.kind || ''} 전달사항`, body: `${d}${short(data.content)}`, url: '/#/notice/briefings' }, schoolId);
  }
}

// 특별실 예약: 같은 학교·날·장소·교시 중복 금지
async function reservationClash(db, m, data, schoolId, id) {
  if (m !== 'reservations') return null;
  const row = await db.prepare("SELECT data FROM records WHERE module = 'reservations' AND school_id = ? AND date = ? AND id != ? AND json_extract(data, '$.place') = ? AND json_extract(data, '$.period') = ?")
    .bind(schoolId, data.date, id || '', data.place || '', data.period || '').first();
  if (!row) return null;
  const d = JSON.parse(row.data);
  return `이미 예약되어 있습니다: ${data.place} ${data.period} (${d.user || ''}${d.className ? ` ${d.className}` : ''})`;
}


// 행정·예산 쓰기 권한: 학교본예산 → '학교본예산' 권한, 집행내역 → '학교본예산'·'집행내역', 구매신청 → '구매신청',
//   공모사업 편성·집행 → '공모사업' 권한 또는 그 사업 담당자. 공모사업 등록·담당자 지정은 관리자만
async function contestGuard(c, t, m, data, prevData) {
  if (!MONEY_SCOPED.includes(m) || !t.member || t.member.role === 'admin') return null;
  const acc = await moneyAccess(c, t.member);
  if (m === 'contests') return '공모사업 등록·담당자 지정은 학교 관리자만 할 수 있습니다.';
  if (m === 'purchaseRequests') return acc.has('purchases') ? null : '구매신청은 관리자가 권한을 준 사람만 입력할 수 있습니다.';
  for (const d of [data, prevData].filter(Boolean)) {
    if (m === 'purchases') {
      if (acc.has('purchases') || (acc.all.has(d.budget) && acc.mine.has(d.budget))) continue;
      // 나에게 열린 건: 접수 중일 때 내 이름으로만 담고, 내가 담은 품목만 고치거나 지움
      if (acc.reqs.has(d.requestId)) {
        if (!acc.reqsOpen.has(d.requestId)) return '마감된 구매신청 건입니다.';
        if (String(d.requester || '').replace(/\s/g, '') !== acc.me) return '내 이름으로 신청한 품목만 담거나 고칠 수 있습니다.';
        continue;
      }
      return '구매신청은 관리자가 권한을 주거나 열어 준 건에만 입력할 수 있습니다.';
    }
    if (isContestRow(acc, m, d)) {
      if (!acc.all.has(d.program)) return `공모사업 「${d.program || ''}」을(를) 먼저 [공모사업] 탭에서 등록해 주세요.`;
      if (acc.has('contests') || acc.mine.has(d.program)) continue;
      return `「${d.program}」 공모사업은 관리자가 지정한 담당자만 입력할 수 있습니다.`;
    }
    if (acc.has('school') || (m === 'spending' && acc.has('spend'))) continue;
    return m === 'budget' ? '학교본예산은 관리자가 권한을 준 사람만 입력할 수 있습니다.' : '집행내역은 관리자가 권한을 준 사람만 입력할 수 있습니다.';
  }
  return null;
}

// 학사일정 → 공지사항: '공지사항에도 올리기'를 체크한 일정은 공지 하나를 만들고(noticeId), 일정을 고치면 공지도 고침
async function syncEventNotice(c, schoolId, eventId, d) {
  if (!d.toNotice || !schoolId) return;
  const db = c.env.DB;
  const email = c.get('user').email;
  const md = (x) => `${Number(x.slice(5, 7))}월 ${Number(x.slice(8, 10))}일`;
  const when = d.endDate && d.endDate !== d.date ? `${md(d.date)} ~ ${md(d.endDate)}` : md(d.date);
  const title = String(d.title || '').split('\n')[0].slice(0, 80);
  const content = [`📅 ${when}  ${String(d.title || '').replace(/\n/g, ' ')}`, [d.target && `대상: ${d.target}`, d.place && `장소: ${d.place}`, d.dept && `담당: ${d.dept}`].filter(Boolean).join(' · '), d.note || ''].filter(Boolean).join('\n');
  const old = d.noticeId ? await db.prepare("SELECT id, data FROM records WHERE id = ? AND module = 'notices' AND school_id = ?").bind(d.noticeId, schoolId).first() : null;
  if (old) {
    const nd = { ...JSON.parse(old.data), title, content, dept: d.dept || JSON.parse(old.data).dept || '', due: d.endDate || d.date };
    await db.prepare("UPDATE records SET data = ?, updated_by = ?, updated_at = datetime('now'), version = version + 1 WHERE id = ?").bind(JSON.stringify(nd), email, old.id).run();
    return;
  }
  const [y, mo] = d.date.split('-').map(Number);
  const year = mo <= 2 ? y - 1 : y; // 1·2월 일정은 앞 학년도
  const nd = normalizeData('notices', { title, category: '일반', content, dept: d.dept || '', month: d.date.slice(0, 7), due: d.endDate || d.date }); // 일정이 끝나면 공지도 자동으로 내림
  const id = randomToken(8);
  await db.batch([
    db.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by, school_id, owner) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)').bind(id, 'notices', year, Date.now() % 1e9, JSON.stringify(nd), email, email, schoolId),
    db.prepare("UPDATE records SET data = json_set(data, '$.noticeId', ?) WHERE id = ?").bind(id, eventId),
  ]);
  await audit(c, 'create', 'notices', id, '학사일정에서 자동 등록');
}

// 자동으로 만든 연결 기록(학사일정·공지) 만들기·고치기·지우기. 연결 기록 id 를 돌려줌
async function upsertLinked(c, schoolId, m, linkedId, data, year) {
  const db = c.env.DB;
  const email = c.get('user').email;
  const old = linkedId ? await db.prepare('SELECT id, data FROM records WHERE id = ? AND module = ? AND school_id = ?').bind(linkedId, m, schoolId).first() : null;
  const p = placement(m, data, year);
  if (old) {
    await db.prepare("UPDATE records SET data = ?, date = ?, updated_by = ?, updated_at = datetime('now'), version = version + 1 WHERE id = ?").bind(JSON.stringify({ ...JSON.parse(old.data), ...data }), p.date, email, old.id).run();
    return old.id;
  }
  const id = randomToken(8);
  await db.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by, school_id, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)')
    .bind(id, m, p.year, p.date, Date.now() % 1e9, JSON.stringify(data), email, email, schoolId).run();
  await audit(c, 'create', m, id, '회의 예정에서 자동 등록');
  return id;
}
const dropLinked = async (c, schoolId, m, id) => {
  if (!id) return;
  await c.env.DB.prepare('DELETE FROM records WHERE id = ? AND module = ? AND school_id = ?').bind(id, m, schoolId).run();
  if (m === 'collections') await c.env.DB.prepare('DELETE FROM responses WHERE collection_id = ? AND school_id = ?').bind(id, schoolId).run();
};
const schoolYearOf = (date) => { const [y, mo] = date.split('-').map(Number); return mo <= 2 ? y - 1 : y; };

// 회의 예정 → 학사일정(분류 '회의')·공지 자동 등록/수정/해제
async function syncMeetingPlan(c, schoolId, planId, d) {
  if (!schoolId || !d.date) return;
  const md = (x) => `${Number(x.slice(5, 7))}월 ${Number(x.slice(8, 10))}일`;
  const head = [d.meeting, d.title].filter(Boolean).join(' · ') || '회의';
  const who = (d.attendees || []).length ? (d.attendees || []).join(', ') : '전체 교직원';
  let eventId = d.eventId || '';
  let noticeId = d.noticeId || '';
  if (d.toCalendar) {
    eventId = await upsertLinked(c, schoolId, 'events', eventId, normalizeData('events', { date: d.date, title: `${head}${d.time ? ` (${d.time})` : ''}`, category: '회의', target: (d.attendees || []).length ? who : '', dept: d.dept || '', place: d.place || '', note: d.note || '', source: '회의 예정' }), schoolYearOf(d.date));
  } else if (eventId) { await dropLinked(c, schoolId, 'events', eventId); eventId = ''; }
  if (d.toNotice) {
    const content = [`🗓 ${md(d.date)}${d.time ? ` ${d.time}` : ''} · ${head}`, [d.place && `장소: ${d.place}`, `참석: ${who}`, d.dept && `주관: ${d.dept}`].filter(Boolean).join(' · '),
      d.agenda ? `안건\n${String(d.agenda).split('\n').filter(Boolean).map((x) => `- ${x.replace(/^[-·•]\s*/, '')}`).join('\n')}` : '', d.note ? `안내: ${d.note}` : ''].filter(Boolean).join('\n');
    noticeId = await upsertLinked(c, schoolId, 'notices', noticeId, normalizeData('notices', { title: `[회의] ${head} (${md(d.date)})`, category: '부서 안내', content, dept: d.dept || '', due: d.date }), schoolYearOf(d.date));
  } else if (noticeId) { await dropLinked(c, schoolId, 'notices', noticeId); noticeId = ''; }
  let collectionId = d.collectionId || '';
  if (d.askAttend) {
    const base = { kind: '참석 조사', title: `[참석] ${head} (${md(d.date)})`, due: d.date, target: d.attendees || [], content: [`🗓 ${md(d.date)}${d.time ? ` ${d.time}` : ''}${d.place ? ` · ${d.place}` : ''}`, d.agenda ? `안건: ${String(d.agenda).split('\n').filter(Boolean).join(' / ')}` : ''].filter(Boolean).join('\n'), meetingId: planId };
    const exists = collectionId && await c.env.DB.prepare("SELECT id FROM records WHERE id = ? AND module = 'collections' AND school_id = ?").bind(collectionId, schoolId).first();
    collectionId = await upsertLinked(c, schoolId, 'collections', exists ? collectionId : '', exists ? base : { ...base, questions: presetQuestions('참석 조사'), allowEdit: true, showResults: false, done: [] }, schoolYearOf(d.date));
  } else if (collectionId) { await dropLinked(c, schoolId, 'collections', collectionId); collectionId = ''; }
  await c.env.DB.prepare("UPDATE records SET data = json_set(data, '$.eventId', ?, '$.noticeId', ?, '$.collectionId', ?) WHERE id = ?").bind(eventId, noticeId, collectionId, planId).run();
}

// 취합 → 공지 (공지에도 올리기). 마감일 = 취합 마감일 → 지나면 공지도 자동으로 내려감
async function syncCollectionNotice(c, schoolId, id, d) {
  if (!schoolId) return;
  let noticeId = d.noticeId || '';
  if (d.toNotice) {
    const content = [d.content || '', d.due ? `마감: ${Number(d.due.slice(5, 7))}월 ${Number(d.due.slice(8, 10))}일` : '', '공지·업무 → 취합에서 응답해 주세요.'].filter(Boolean).join('\n');
    noticeId = await upsertLinked(c, schoolId, 'notices', noticeId, normalizeData('notices', { title: `[취합] ${d.title || ''}`, category: '일반', content, due: d.due || '' }), d.due ? schoolYearOf(d.due) : (await getSettings(c.env.DB, schoolId)).currentYear);
  } else if (noticeId) { await dropLinked(c, schoolId, 'notices', noticeId); noticeId = ''; }
  if (noticeId !== (d.noticeId || '')) await c.env.DB.prepare("UPDATE records SET data = json_set(data, '$.noticeId', ?) WHERE id = ?").bind(noticeId, id).run();
}

app.post('/api/records/:module', async (c) => {
  const m = requireModule(c);
  const user = c.get('user');
  const t = await tenant(c, m);
  if (!canWrite(c, t)) return c.json({ error: '수정 권한이 없습니다.' }, 403);
  const body = await c.req.json();
  const clean = normalizeData(m, body.data);
  if (m === 'market') { clean.likes = []; if (String(clean.html || '').length > 300000) return c.json({ error: 'HTML 도구는 300KB까지 올릴 수 있습니다.' }, 413); }
  if (m === 'activities') clean.token = randomToken(16); // 학생 링크 토큰은 서버가 만듦
  if (m === 'events') clean.noticeId = '';
  if (m === 'meetingPlans') { clean.eventId = ''; clean.noticeId = ''; clean.collectionId = ''; }
  if (m === 'collections') { clean.tally = {}; clean.noticeId = ''; clean.meetingId = ''; clean.done = []; if (!Array.isArray(clean.questions) || !clean.questions.length) clean.questions = presetQuestions(clean.kind || '확인'); }
  if (m === 'budget' && evalFormula(clean.formula) !== null) clean.amount = evalFormula(clean.formula);
  const denied = await contestGuard(c, t, m, clean, null);
  if (denied) return c.json({ error: denied }, 403);
  const year = body.year || (t.member ? (await getSettings(c.env.DB, t.member.schoolId)).currentYear : new Date().getFullYear());
  const p = placement(m, clean, year);
  if (MODULES[m].scope === 'date' && !p.date) return c.json({ error: '날짜를 입력해 주세요.' }, 400);
  const clash = t.member && await reservationClash(c.env.DB, m, clean, t.member.schoolId);
  if (clash) return c.json({ error: clash, conflict: true }, 409);
  const data = await encryptSecrets(c.env, m, { ...clean });
  const id = randomToken(8);
  await c.env.DB.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by, school_id, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, m, p.year, p.date, Number(body.sort) || Date.now() % 1e9, JSON.stringify(data), user.email, user.email, t.member?.schoolId || null, t.space === 'school' ? null : user.email).run();
  if (t.space === 'school') { await audit(c, 'create', m, id); await notifyChange(c, m, clean, null, t.member.schoolId); }
  if (m === 'events') await syncEventNotice(c, t.member?.schoolId, id, { ...clean, noticeId: '' });
  if (m === 'meetingPlans') await syncMeetingPlan(c, t.member?.schoolId, id, clean);
  if (m === 'collections') await syncCollectionNotice(c, t.member?.schoolId, id, clean);
  return c.json(await toClient(c.env, await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first()));
});

app.put('/api/records/:module/:id', async (c) => {
  const m = requireModule(c);
  const user = c.get('user');
  const t = await tenant(c, m);
  const id = c.req.param('id');
  const prev = await findRecord(c, m, id, t);
  if (!prev) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  if (!canWrite(c, t, prev)) return c.json({ error: '수정 권한이 없습니다.' }, 403);
  if (isPrivateOther(prev, user.email)) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  const body = await c.req.json();
  const prevData = JSON.parse(prev.data);
  const clean = normalizeData(m, body.data);
  if (m === 'activities') clean.token = prevData.token || randomToken(16);
  if (m === 'events') clean.noticeId = prevData.noticeId || '';
  if (m === 'meetingPlans') { clean.eventId = prevData.eventId || ''; clean.noticeId = prevData.noticeId || ''; clean.collectionId = prevData.collectionId || ''; }
  if (m === 'collections') { clean.tally = prevData.tally || {}; clean.noticeId = prevData.noticeId || ''; clean.meetingId = prevData.meetingId || ''; if (!Array.isArray(clean.questions)) clean.questions = prevData.questions || []; }
  if (m === 'budget' && evalFormula(clean.formula) !== null) clean.amount = evalFormula(clean.formula);
  const denied = await contestGuard(c, t, m, clean, prevData);
  if (denied) return c.json({ error: denied }, 403);
  if (m === 'market') { clean.likes = prevData.likes || []; if (String(clean.html || '').length > 300000) return c.json({ error: 'HTML 도구는 300KB까지 올릴 수 있습니다.' }, 413); } // 좋아요는 각자 버튼으로만
  const p = placement(m, clean, prev.year);
  if (MODULES[m].scope === 'date' && !p.date) return c.json({ error: '날짜를 입력해 주세요.' }, 400);
  const clash = t.member && await reservationClash(c.env.DB, m, clean, t.member.schoolId, id);
  if (clash) return c.json({ error: clash, conflict: true }, 409);
  const data = await encryptSecrets(c.env, m, { ...clean }, prevData);
  // 버전이 다르면 그사이 다른 사람이 저장한 것 → 덮어쓰지 않음
  const res = await c.env.DB.prepare("UPDATE records SET data = ?, date = ?, updated_by = ?, updated_at = datetime('now'), version = version + 1 WHERE id = ? AND version = ?")
    .bind(JSON.stringify(data), p.date, user.email, id, body.version ?? prev.version).run();
  if (!res.meta.changes) {
    const who = await c.env.DB.prepare('SELECT u.name, r.updated_by FROM records r LEFT JOIN users u ON u.email = r.updated_by WHERE r.id = ?').bind(id).first();
    return c.json({ error: `그사이 ${who?.name || who?.updated_by || '다른 사용자'}님이 이 기록을 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 수정해 주세요.`, conflict: true }, 409);
  }
  if (t.space === 'school') {
    await audit(c, 'update', m, id);
    const plain = { ...prevData };
    await notifyChange(c, m, clean, plain, t.member.schoolId);
    if (m === 'events') await syncEventNotice(c, t.member.schoolId, id, clean);
    if (m === 'meetingPlans') await syncMeetingPlan(c, t.member.schoolId, id, clean);
    if (m === 'collections') await syncCollectionNotice(c, t.member.schoolId, id, clean);
  }
  return c.json(await toClient(c.env, await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first()));
});

app.delete('/api/records/:module/:id', async (c) => {
  const m = requireModule(c);
  const t = await tenant(c, m);
  const id = c.req.param('id');
  const prev = await findRecord(c, m, id, t);
  if (!prev) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  if (!canWrite(c, t, prev)) return c.json({ error: '수정 권한이 없습니다.' }, 403);
  if (isPrivateOther(prev, c.get('user').email)) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  const denied = await contestGuard(c, t, m, null, JSON.parse(prev.data));
  if (denied) return c.json({ error: denied }, 403);
  await c.env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
  if (m === 'activities') await c.env.DB.prepare('DELETE FROM submissions WHERE activity_id = ?').bind(id).run();
  if (m === 'meetingPlans' && t.member) { const pd = JSON.parse(prev.data); await dropLinked(c, t.member.schoolId, 'events', pd.eventId); await dropLinked(c, t.member.schoolId, 'notices', pd.noticeId); await dropLinked(c, t.member.schoolId, 'collections', pd.collectionId); }
  if (m === 'collections' && t.member) { const pd = JSON.parse(prev.data); await c.env.DB.prepare('DELETE FROM responses WHERE collection_id = ? AND school_id = ?').bind(id, t.member.schoolId).run(); await dropLinked(c, t.member.schoolId, 'notices', pd.noticeId); }
  if (t.space === 'school') await audit(c, 'delete', m, id, m === 'secrets' ? null : prev.data);
  return c.json({ ok: true });
});

// 비밀번호 보기 (기록이 남음)
app.get('/api/records/:module/:id/reveal', async (c) => {
  const m = requireModule(c);
  if (!secretKeys(m).length) return c.json({ error: '대상이 아닙니다.' }, 400);
  const t = await tenant(c, m);
  const row = await findRecord(c, m, c.req.param('id'), t);
  if (!row) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
  const data = JSON.parse(row.data);
  const out = {};
  for (const k of secretKeys(m)) out[k] = data[k] ? await decryptText(c.env, data[k]) : '';
  await audit(c, 'reveal', m, c.req.param('id'));
  return c.json(out);
});

// 이름 목록에 본인 이름 넣기/빼기 (동료장학 참관 신청, 수합 제출 완료, 마켓 좋아요)
async function toggleSelf(c, m) {
  const field = SELF_TOGGLE[m];
  if (!field) return c.json({ error: '대상이 아닙니다.' }, 400);
  const user = c.get('user');
  const t = await tenant(c, m);
  if (t.member?.role === 'viewer') return c.json({ error: '권한이 없습니다.' }, 403);
  const { on } = await c.req.json();
  const id = c.req.param('id');
  const name = t.space === 'market' ? user.email : (t.member?.name || user.name || user.email);
  // 여러 명이 동시에 눌러도 서로의 이름이 지워지지 않게, 버전이 맞을 때만 저장하고 다시 시도
  for (let attempt = 0; ; attempt++) {
    const row = await findRecord(c, m, id, t);
    if (!row) return c.json({ error: '기록을 찾을 수 없습니다.' }, 404);
    const data = JSON.parse(row.data);
    const set = new Set(data[field] || []);
    if (on) set.add(name); else set.delete(name);
    data[field] = [...set];
    const res = await c.env.DB.prepare("UPDATE records SET data = ?, updated_at = CASE WHEN ? THEN updated_at ELSE datetime('now') END, version = version + 1 WHERE id = ? AND version = ?")
      .bind(JSON.stringify(data), t.space === 'market' ? 1 : 0, id, row.version).run();
    if (res.meta.changes) break;
    if (attempt >= 4) return c.json({ error: '잠시 후 다시 시도해 주세요.' }, 409);
  }
  if (t.space === 'school') await audit(c, on ? 'self-on' : 'self-off', m, id, field);
  const saved = await c.env.DB.prepare(t.space === 'market' ? "SELECT r.*, COALESCE(NULLIF(u.name, ''), '선생님') AS author_name FROM records r LEFT JOIN users u ON u.email = r.owner WHERE r.id = ?" : 'SELECT * FROM records WHERE id = ?').bind(id).first();
  return c.json(await toClient(c.env, saved));
}
app.post('/api/records/openClasses/:id/observe', (c) => toggleSelf(c, 'openClasses'));
app.post('/api/records/:module/:id/self', (c) => toggleSelf(c, requireModule(c)));

// ---------- 📥 취합 응답 ----------
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
async function loadCollection(c) {
  const mem = await requireSchool(c);
  const row = await c.env.DB.prepare("SELECT * FROM records WHERE id = ? AND module = 'collections' AND school_id = ?").bind(c.req.param('id'), mem.schoolId).first();
  if (!row) throw Object.assign(new Error('취합을 찾을 수 없습니다.'), { status: 404 });
  const data = JSON.parse(row.data);
  const owner = row.created_by === c.get('user').email || mem.role === 'admin';
  const targets = data.target?.length ? data.target : (await c.env.DB.prepare("SELECT name FROM members WHERE school_id = ? AND role IN ('admin','staff','viewer') AND name != ''").bind(mem.schoolId).all()).results.map((r) => r.name);
  return { mem, row, data, owner, targets };
}
// 응답 집계·응답자 명단을 취합 기록에 반영 (여러 명이 동시에 내도 서로 덮어쓰지 않게 버전 확인 후 재시도)
async function refreshCollection(c, id) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
    if (!row) return;
    const data = JSON.parse(row.data);
    const rs = (await c.env.DB.prepare('SELECT name, answers FROM responses WHERE collection_id = ?').bind(id).all()).results;
    data.tally = tallyOf(data.questions || [], rs.map((r) => JSON.parse(r.answers)));
    // 확인 유형은 [확인했어요] 체크(done)가 곧 응답, 나머지는 응답한 사람으로 done 을 맞춤
    if (data.kind && data.kind !== '확인') data.done = [...new Set(rs.map((r) => r.name).filter(Boolean))];
    const res = await c.env.DB.prepare("UPDATE records SET data = ?, version = version + 1 WHERE id = ? AND version = ?").bind(JSON.stringify(data), id, row.version).run();
    if (res.meta.changes) return;
  }
}
app.get('/api/collections/:id/responses', async (c) => {
  const { mem, data, owner, targets } = await loadCollection(c);
  const rows = (await c.env.DB.prepare('SELECT email, name, answers, updated_at FROM responses WHERE collection_id = ? ORDER BY updated_at').bind(c.req.param('id')).all()).results.map((r) => ({ name: r.name, answers: JSON.parse(r.answers), at: r.updated_at, mine: r.email === c.get('user').email }));
  const canSeeAll = owner || !!data.showResults;
  return c.json({ owner, canSeeAll, targets, mine: rows.find((r) => r.mine) || null, rows: canSeeAll ? rows : [], me: mem.name });
});
app.post('/api/collections/:id/respond', async (c) => {
  const { mem, row, data, owner, targets } = await loadCollection(c);
  if (mem.role === 'viewer') return c.json({ error: '열람 권한으로는 응답할 수 없습니다.' }, 403);
  const email = c.get('user').email;
  const name = mem.name || c.get('user').name || email;
  if (!targets.includes(name) && !owner) return c.json({ error: '이 취합의 대상이 아닙니다.' }, 403);
  if (data.due && data.due < kstToday()) return c.json({ error: '마감된 취합입니다.' }, 409);
  const prev = await c.env.DB.prepare('SELECT id FROM responses WHERE collection_id = ? AND email = ?').bind(row.id, email).first();
  if (prev && data.allowEdit === false) return c.json({ error: '이미 응답했습니다. 이 취합은 수정할 수 없습니다.' }, 409);
  const b = await c.req.json();
  const others = (await c.env.DB.prepare('SELECT answers FROM responses WHERE collection_id = ? AND email != ?').bind(row.id, email).all()).results.map((r) => JSON.parse(r.answers));
  const chk = checkAnswers(data.questions || [], b.answers || {}, { othersTally: tallyOf(data.questions || [], others), linkGiven: !!data.link });
  if (chk.error) return c.json({ error: chk.error }, 400);
  const answers = JSON.stringify(chk.clean);
  if (prev) await c.env.DB.prepare("UPDATE responses SET answers = ?, name = ?, updated_at = datetime('now') WHERE id = ?").bind(answers, name, prev.id).run();
  else await c.env.DB.prepare('INSERT INTO responses (school_id, collection_id, email, name, answers) VALUES (?, ?, ?, ?, ?)').bind(mem.schoolId, row.id, email, name, answers).run();
  await refreshCollection(c, row.id);
  await audit(c, 'respond', 'collections', row.id);
  return c.json(await toClient(c.env, await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(row.id).first()));
});
app.delete('/api/collections/:id/respond', async (c) => {
  const { row, data } = await loadCollection(c);
  if (data.due && data.due < kstToday()) return c.json({ error: '마감된 취합입니다.' }, 409);
  if (data.allowEdit === false) return c.json({ error: '이 취합은 응답을 고치거나 취소할 수 없습니다.' }, 409);
  await c.env.DB.prepare('DELETE FROM responses WHERE collection_id = ? AND email = ?').bind(row.id, c.get('user').email).run();
  await refreshCollection(c, row.id);
  return c.json(await toClient(c.env, await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(row.id).first()));
});
// 미응답자에게 다시 알림 (만든 사람·관리자)
app.post('/api/collections/:id/remind', async (c) => {
  const { mem, data, owner, targets } = await loadCollection(c);
  if (!owner) return c.json({ error: '만든 사람이나 관리자만 보낼 수 있습니다.' }, 403);
  const missing = targets.filter((n) => !(data.done || []).includes(n));
  await notify(c, await emailsByName(c.env.DB, mem.schoolId, missing), { title: '⏰ 취합 응답 요청', body: `${data.title}${data.due ? ` (마감 ${data.due.slice(5)})` : ''}`, url: '/#/notice/collections' }, mem.schoolId);
  return c.json({ ok: true, sent: missing.length });
});

// 새 글 표시: since 이후 다른 사람이 만들거나 고친 학교 기록
const LABEL_KEYS = ['title', 'agenda', 'item', 'name', 'text', 'program', 'site', 'content', 'teacher', 'requester'];
app.get('/api/changes', async (c) => {
  const now = (await c.env.DB.prepare("SELECT datetime('now') AS t").first()).t;
  const mem = await memberOf(c);
  const since = String(c.req.query('since') || '');
  if (!mem || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(since)) return c.json({ now, items: [] });
  const rows = await c.env.DB.prepare(`SELECT r.id, r.module, r.date, r.data, r.updated_at, r.created_at, m.name FROM records r LEFT JOIN members m ON m.email = r.updated_by AND m.school_id = r.school_id
    WHERE r.school_id = ? AND r.updated_at > ? AND r.updated_by != ? AND r.updated_by != 'neis-auto' ORDER BY r.updated_at DESC LIMIT 300`).bind(mem.schoolId, since, c.get('user').email).all();
  const ok = await moneyFilter(c, mem);
  const items = rows.results.filter((r) => MODULES[r.module] && !(r.module === 'events' && r.data.includes('"source":"나이스"')) && !(r.module === 'boards' && JSON.parse(r.data).visibility === '나만 보기') && (!ok || !MONEY_SCOPED.includes(r.module) || ok(r.module, JSON.parse(r.data), r.id))).map((r) => {
    const d = r.module === 'secrets' ? {} : JSON.parse(r.data);
    const key = LABEL_KEYS.find((k) => d[k]);
    return { id: r.id, module: r.module, date: r.date, at: r.updated_at, isNew: r.created_at === r.updated_at, by: r.name || '', label: key ? String(d[key]).split('\n')[0].slice(0, 60) : MODULES[r.module].label };
  });
  return c.json({ now, items });
});

// ---------- 알림함 · 휴대폰 알림 ----------

app.get('/api/inbox', async (c) => {
  const email = c.get('user').email;
  const rows = await c.env.DB.prepare('SELECT i.*, s.name AS school_name FROM inbox i LEFT JOIN schools s ON s.id = i.school_id WHERE i.email = ? ORDER BY i.id DESC LIMIT 50').bind(email).all();
  return c.json({ items: rows.results, unread: rows.results.filter((r) => !r.read).length });
});
app.post('/api/inbox/read', async (c) => {
  await c.env.DB.prepare('UPDATE inbox SET read = 1 WHERE email = ? AND read = 0').bind(c.get('user').email).run();
  return c.json({ ok: true });
});
// 서비스 워커가 푸시 신호를 받았을 때 보여 줄 내용
app.get('/api/inbox/latest', async (c) => {
  const row = await c.env.DB.prepare('SELECT title, body, url FROM inbox WHERE email = ? ORDER BY id DESC LIMIT 1').bind(c.get('user').email).first();
  return c.json(row || { title: '새 알림', body: '', url: '/' });
});
app.post('/api/push/subscribe', async (c) => {
  const b = await c.req.json();
  if (!/^https:\/\//.test(b.endpoint || '')) return c.json({ error: '잘못된 구독 정보' }, 400);
  await c.env.DB.prepare('INSERT INTO push_subs (endpoint, email, p256dh, auth) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email')
    .bind(b.endpoint, c.get('user').email, b.keys?.p256dh || '', b.keys?.auth || '').run();
  return c.json({ ok: true });
});
app.post('/api/push/unsubscribe', async (c) => {
  const b = await c.req.json();
  await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND email = ?').bind(String(b.endpoint || ''), c.get('user').email).run();
  return c.json({ ok: true });
});
app.post('/api/push/test', async (c) => {
  const email = c.get('user').email;
  await c.env.DB.prepare("INSERT INTO inbox (email, title, body, url) VALUES (?, '🔔 알림 시험', '이 기기에서 알림을 받을 수 있습니다.', '/')").bind(email).run();
  c.executionCtx.waitUntil(sendPush(c.env, c.env.DB, [email], new URL(c.req.url).origin));
  return c.json({ ok: true });
});

// ---------- 나이스 ----------

async function neisCfg(c) {
  const m = await requireSchool(c);
  return (await getSettings(c.env.DB, m.schoolId)).neis;
}

app.get('/api/neis/timetable', async (c) => {
  const neis = await neisCfg(c);
  if (!neis || !c.env.NEIS_API_KEY) return c.json({ configured: false, rows: [] });
  const cls = String(c.req.query('cls') || '');
  const from = c.req.query('from');
  const to = c.req.query('to') || from;
  const m = cls.match(/^(\d)\s*-\s*(\d+)$/);
  if (!m) return c.json({ error: '학급은 "3-1" 형식이어야 합니다.' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return c.json({ error: '날짜 형식 오류' }, 400);
  const cache = caches.default;
  const key = new Request(`https://cache.local/tt/${neis.atpt}/${neis.code}/${m[1]}-${m[2]}/${from}/${to}`);
  const hit = await cache.match(key);
  if (hit) return c.json({ configured: true, rows: await hit.json() });
  const rows = await getTimetable(c.env, neis, m[1], m[2], from, to);
  c.executionCtx.waitUntil(cache.put(key, new Response(JSON.stringify(rows), { headers: { 'cache-control': 'max-age=21600' } })));
  return c.json({ configured: true, rows });
});

// 학교 전체 학급의 하루 시간표 (수업 전체 화면의 '오늘 시간표 한눈에'에 합쳐 보여 줌)
app.get('/api/neis/timetable-day', async (c) => {
  const neis = await neisCfg(c);
  if (!neis || !c.env.NEIS_API_KEY) return c.json({ configured: false, rows: [] });
  const date = c.req.query('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return c.json({ error: '날짜 형식 오류' }, 400);
  const cache = caches.default;
  const key = new Request(`https://cache.local/ttday/${neis.atpt}/${neis.code}/${date}`);
  const hit = await cache.match(key);
  if (hit) return c.json({ configured: true, rows: await hit.json() });
  const rows = await getDayTimetable(c.env, neis, date);
  c.executionCtx.waitUntil(cache.put(key, new Response(JSON.stringify(rows), { headers: { 'cache-control': 'max-age=21600' } })));
  return c.json({ configured: true, rows });
});

app.get('/api/neis/meals', async (c) => {
  const neis = await neisCfg(c);
  if (!neis || !c.env.NEIS_API_KEY) return c.json({ configured: false, meals: {} });
  const from = c.req.query('from');
  const to = c.req.query('to') || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return c.json({ error: '날짜 형식 오류' }, 400);
  // 같은 학교·기간은 6시간 동안 재사용 (나이스 호출 줄이기)
  const cache = caches.default;
  const key = new Request(`https://cache.local/meals/${neis.atpt}/${neis.code}/${from}/${to}`);
  const hit = await cache.match(key);
  if (hit) return c.json({ configured: true, meals: await hit.json() });
  const meals = await getMeals(c.env, neis, from, to);
  c.executionCtx.waitUntil(cache.put(key, new Response(JSON.stringify(meals), { headers: { 'cache-control': 'max-age=21600' } })));
  return c.json({ configured: true, meals });
});

// 학교 검색은 학교 개설 화면에서도 쓰므로 로그인한 누구나
app.get('/api/neis/schools', async (c) => {
  const name = String(c.req.query('name') || '').trim();
  if (name.length < 2) return c.json({ error: '학교 이름을 두 글자 이상 입력해 주세요.' }, 400);
  return c.json(await searchSchools(c.env, name));
});

// ---------- 학교 관리자 ----------

app.get('/api/admin/neis/schools', async (c) => {
  const name = String(c.req.query('name') || '').trim();
  if (name.length < 2) return c.json({ error: '학교 이름을 두 글자 이상 입력해 주세요.' }, 400);
  return c.json(await searchSchools(c.env, name));
});

app.post('/api/admin/neis/config', async (c) => {
  const { schoolId } = c.get('member');
  const b = await c.req.json();
  const neis = b && b.atpt && b.code ? { atpt: String(b.atpt), code: String(b.code), name: String(b.name || ''), office: String(b.office || '') } : null;
  await putSetting(c.env.DB, schoolId, 'neis', neis).run();
  await c.env.DB.prepare('UPDATE schools SET neis_code = ? WHERE id = ?').bind(neis?.code || null, schoolId).run();
  await audit(c, 'settings', null, null, `neis ${neis?.name || '해제'}`);
  return c.json({ ok: true, neis });
});

app.post('/api/admin/neis/sync', async (c) => {
  const { schoolId } = c.get('member');
  const settings = await getSettings(c.env.DB, schoolId);
  const { year } = await c.req.json().catch(() => ({}));
  const result = await syncSchedule(c.env, c.env.DB, schoolId, Number(year) || settings.currentYear, settings.neis, c.get('user').email);
  await saveLastSync(c.env.DB, schoolId, settings.neis, result);
  await audit(c, 'neis-sync', 'events', null, JSON.stringify(result));
  return c.json(result);
});

async function saveLastSync(db, schoolId, neis, result) {
  if (!neis) return;
  neis.lastSync = { at: new Date().toISOString(), ...result };
  await putSetting(db, schoolId, 'neis', neis).run();
}

app.get('/api/admin/users', async (c) => {
  const { schoolId } = c.get('member');
  const rows = await c.env.DB.prepare(`SELECT m.email, m.name, m.role, m.dept, m.note, m.created_at, u.last_login, u.name AS account_name FROM members m LEFT JOIN users u ON u.email = m.email
    WHERE m.school_id = ? ORDER BY m.role = 'pending' DESC, m.role, m.name`).bind(schoolId).all();
  return c.json(rows.results);
});

app.put('/api/admin/users/:email', async (c) => {
  const { schoolId } = c.get('member');
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  const b = await c.req.json();
  if (b.role && !['admin', 'staff', 'viewer', 'pending', 'blocked'].includes(b.role)) return c.json({ error: '잘못된 권한' }, 400);
  if (email === c.get('user').email && b.role && b.role !== 'admin') return c.json({ error: '자기 자신의 관리자 권한은 내릴 수 없습니다.' }, 400);
  const prev = await c.env.DB.prepare('SELECT role FROM members WHERE school_id = ? AND email = ?').bind(schoolId, email).first();
  if (!prev) return c.json({ error: '구성원을 찾을 수 없습니다.' }, 404);
  await c.env.DB.prepare('UPDATE members SET name = COALESCE(?, name), role = COALESCE(?, role), dept = COALESCE(?, dept) WHERE school_id = ? AND email = ?')
    .bind(b.name ?? null, b.role ?? null, b.dept ?? null, schoolId, email).run();
  if (prev.role === 'pending' && ACTIVE_ROLES.includes(b.role)) {
    await notify(c, [email], { title: '✅ 학교 가입 승인', body: `${c.get('member').schoolName}에 가입되었습니다.`, url: '/' }, schoolId);
  }
  await audit(c, 'user', null, email, JSON.stringify(b));
  return c.json({ ok: true });
});

// 미리 교직원 이메일 등록 (첫 로그인 때 바로 사용)
app.post('/api/admin/users', async (c) => {
  const { schoolId } = c.get('member');
  const b = await c.req.json();
  const email = String(b.email || '').trim().toLowerCase();
  if (!email.includes('@')) return c.json({ error: '이메일을 확인해 주세요.' }, 400);
  await c.env.DB.prepare('INSERT INTO members (school_id, email, name, role, dept) VALUES (?, ?, ?, ?, ?) ON CONFLICT(school_id, email) DO UPDATE SET role = excluded.role, name = excluded.name, dept = excluded.dept')
    .bind(schoolId, email, b.name || '', ACTIVE_ROLES.includes(b.role) ? b.role : 'staff', b.dept || '').run();
  await audit(c, 'user', null, email, 'add');
  return c.json({ ok: true });
});

app.delete('/api/admin/users/:email', async (c) => {
  const { schoolId } = c.get('member');
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  if (email === c.get('user').email) return c.json({ error: '자기 자신은 내보낼 수 없습니다.' }, 400);
  await c.env.DB.prepare('DELETE FROM members WHERE school_id = ? AND email = ?').bind(schoolId, email).run();
  await audit(c, 'user', null, email, 'delete');
  return c.json({ ok: true });
});

// 초대 코드 (보기 · 새로 만들기)
app.get('/api/admin/invite', async (c) => {
  const row = await c.env.DB.prepare('SELECT invite_code FROM schools WHERE id = ?').bind(c.get('member').schoolId).first();
  return c.json({ code: row?.invite_code || '' });
});
app.post('/api/admin/invite', async (c) => {
  const code = randomToken(4);
  await c.env.DB.prepare('UPDATE schools SET invite_code = ? WHERE id = ?').bind(code, c.get('member').schoolId).run();
  await audit(c, 'settings', null, null, 'invite code');
  return c.json({ code });
});

app.put('/api/admin/settings', async (c) => {
  const { schoolId } = c.get('member');
  const b = await c.req.json();
  const db = c.env.DB;
  const stmts = [];
  for (const key of ['currentYear', 'lists']) if (b[key] !== undefined) stmts.push(putSetting(db, schoolId, key, b[key]));
  if (b.access !== undefined) {
    const clean = {};
    for (const a of MONEY_AREAS) clean[a] = [...new Set((b.access?.[a] || []).map((x) => String(x).trim().toLowerCase()).filter((x) => x.includes('@')))].slice(0, 200);
    stmts.push(putSetting(db, schoolId, 'access', clean));
  }
  if (b.theme !== undefined) stmts.push(putSetting(db, schoolId, 'theme', { accent: String(b.theme?.accent || 'indigo').replace(/[^a-z]/g, '').slice(0, 12) }));
  if (b.schoolName) stmts.push(db.prepare('UPDATE schools SET name = ? WHERE id = ?').bind(String(b.schoolName).slice(0, 40), schoolId));
  if (stmts.length) await db.batch(stmts);
  await audit(c, 'settings', null, null, Object.keys(b).join(','));
  return c.json(await getSettings(db, schoolId));
});

const SCHOOL_MODULES = Object.keys(MODULES).filter((m) => spaceOf(m) === 'school');

// 엑셀 가져오기 결과 저장. mode=replace 이면 해당 연도(범위)의 같은 모듈 기록을 지우고 넣음
app.post('/api/admin/import', async (c) => {
  const user = c.get('user');
  const { schoolId } = c.get('member');
  const { year, mode, items } = await c.req.json();
  if (!Number(year) || !Array.isArray(items)) return c.json({ error: '잘못된 요청' }, 400);
  const db = c.env.DB;
  const t = { col: 'school_id', val: schoolId };
  const modules = [...new Set(items.map((i) => i.module))].filter((m) => SCHOOL_MODULES.includes(m));
  const stmts = [];
  if (mode === 'replace') {
    // 규격이 바뀌며 없어진 메뉴(예: v1 '월별 안내')의 기록 정리
    const known = Object.keys(MODULES);
    stmts.push(db.prepare(`DELETE FROM records WHERE school_id = ? AND module NOT IN (${known.map(() => '?').join(',')})`).bind(schoolId, ...known));
    for (const m of modules) {
      const w = scopeWhere(m, year, t);
      // 나이스에서 가져온 일정은 남겨 둠 (엑셀에 없으므로)
      const keepNeis = m === 'events' ? " AND COALESCE(json_extract(data, '$.source'), '') != '나이스'" : '';
      stmts.push(db.prepare(`DELETE FROM records WHERE ${w.sql}${keepNeis}`).bind(...w.args));
    }
  }
  let n = 0;
  for (const it of items) {
    if (!SCHOOL_MODULES.includes(it.module)) continue;
    const data = await encryptSecrets(c.env, it.module, normalizeData(it.module, it.data));
    const p = placement(it.module, data, year);
    if (MODULES[it.module].scope === 'date' && !p.date) continue;
    stmts.push(db.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by, school_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(randomToken(8), it.module, p.year, p.date, n, JSON.stringify(data), user.email, user.email, schoolId));
    n++;
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await audit(c, 'import', modules.join(','), null, `${year} ${mode} ${n}건`);
  return c.json({ ok: true, inserted: n, modules });
});

// 연도별 기록(시간표 등)을 다음 해로 복사
app.post('/api/admin/copy-year', async (c) => {
  const user = c.get('user');
  const { schoolId } = c.get('member');
  const { from, to, modules } = await c.req.json();
  const db = c.env.DB;
  let n = 0;
  const stmts = [];
  for (const m of modules || []) {
    if (MODULES[m]?.scope !== 'year' || !SCHOOL_MODULES.includes(m)) continue;
    const rows = await db.prepare('SELECT * FROM records WHERE module = ? AND school_id = ? AND year = ? ORDER BY sort').bind(m, schoolId, Number(from)).all();
    for (const r of rows.results) {
      const data = JSON.parse(r.data);
      if (m === 'openClasses') delete data.observers;
      if (m === 'purchases') delete data.received;
      if (m === 'collections') delete data.done;
      stmts.push(db.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by, school_id) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)')
        .bind(randomToken(8), m, Number(to), r.sort, JSON.stringify(data), user.email, user.email, schoolId));
      n++;
    }
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await audit(c, 'copy-year', (modules || []).join(','), null, `${from}→${to} ${n}건`);
  return c.json({ ok: true, copied: n });
});

// 변경 기록: 학교별 · 아이디(이메일)별 · 작업·메뉴별로 거르고, 오래된 기록은 before(id)로 이어 보기
//   다른 학교는 그 학교 관리자일 때만 내용까지, 플랫폼 운영자는 누가·언제·무엇(메뉴)만 (내용은 숨김)
async function auditList(c, defaultSchool) {
  const user = c.get('user');
  const q = c.req.query();
  const db = c.env.DB;
  const mine = (await db.prepare("SELECT s.id, s.name FROM members m JOIN schools s ON s.id = m.school_id WHERE m.email = ? AND m.role = 'admin' ORDER BY s.name").bind(user.email).all()).results;
  const schools = user.super ? (await db.prepare('SELECT id, name FROM schools ORDER BY name').all()).results : mine;
  const sid = q.school || defaultSchool || schools[0]?.id;
  if (!schools.some((s) => s.id === sid)) return c.json({ error: '이 학교의 변경 기록을 볼 권한이 없습니다.' }, 403);
  const full = mine.some((s) => s.id === sid);
  const where = ['a.school_id = ?'];
  const args = [sid];
  if (q.email) { where.push('a.email = ?'); args.push(q.email); }
  if (q.action) { where.push('a.action = ?'); args.push(q.action); }
  if (q.module) { where.push("(a.module = ? OR ',' || a.module || ',' LIKE ?)"); args.push(q.module, `%,${q.module},%`); }
  if (q.from) { where.push('a.at >= ?'); args.push(q.from); }
  if (q.to) { where.push('a.at < ?'); args.push(q.to); }
  if (Number(q.before)) { where.push('a.id < ?'); args.push(Number(q.before)); }
  const limit = Math.min(Number(q.limit) || 200, 1000);
  const rows = (await db.prepare(`SELECT a.id, a.at, a.email, a.action, a.module, a.record_id, a.detail, m.name FROM audit a LEFT JOIN members m ON m.email = a.email AND m.school_id = a.school_id
    WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ?`).bind(...args, limit).all()).results;
  const users = (await db.prepare(`SELECT a.email, MAX(m.name) AS name, MAX(m.role) AS role, COUNT(*) AS n, MAX(a.at) AS last FROM audit a LEFT JOIN members m ON m.email = a.email AND m.school_id = a.school_id
    WHERE a.school_id = ? GROUP BY a.email ORDER BY n DESC`).bind(sid).all()).results;
  return c.json({
    school: sid, schools, full, more: rows.length === limit, users,
    rows: rows.map((r) => (full ? r : { ...r, detail: null })),
  });
}
app.get('/api/admin/audit', (c) => auditList(c, c.get('member').schoolId));
app.get('/api/platform/audit', (c) => auditList(c, ''));

// 백업 (비밀번호는 암호화된 상태 그대로, 이 학교 것만)
app.get('/api/admin/export', async (c) => {
  const { schoolId } = c.get('member');
  const db = c.env.DB;
  const [records, settings, members] = await Promise.all([
    db.prepare('SELECT * FROM records WHERE school_id = ? ORDER BY module, date, sort').bind(schoolId).all(),
    db.prepare('SELECT key, value FROM school_settings WHERE school_id = ?').bind(schoolId).all(),
    db.prepare('SELECT email, name, role, dept FROM members WHERE school_id = ?').bind(schoolId).all(),
  ]);
  await audit(c, 'export');
  return c.json({ exportedAt: new Date().toISOString(), schoolId, records: records.results, settings: settings.results, users: members.results });
});

app.all('/api/*', (c) => c.json({ error: '없는 주소입니다.' }, 404));

// 매일 새벽 자동: 학교마다 나이스 학사일정 동기화 (wrangler.toml [triggers])
// ---------- 학생 제출 (로그인 없이 링크로) ----------
//   /pub/a/:token  GET  활동 정보(+보드 글) · POST 제출. 교사 화면은 /api/activities/:id/submissions
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
async function activityByToken(db, token) {
  if (!/^[a-f0-9]{24,64}$/.test(String(token))) return null;
  const row = await db.prepare("SELECT id, owner, data FROM records WHERE module = 'activities' AND json_extract(data, '$.token') = ?").bind(token).first();
  return row ? { id: row.id, owner: row.owner, data: JSON.parse(row.data) } : null;
}
const subLimit = (a) => Number(a.data.limit) || (a.data.kind === '클래스 보드' ? 300 : a.data.kind === '실시간 퀴즈' ? 6000 : 2000);
async function boardPosts(env, a) {
  const rows = (await env.DB.prepare('SELECT id, num, name, body, created_at FROM submissions WHERE activity_id = ? AND hidden = 0 ORDER BY id DESC LIMIT 200').bind(a.id).all()).results;
  const out = [];
  for (const r of rows) out.push({ id: r.id, name: a.data.showNames ? await decryptText(env, r.name).catch(() => '') : '', body: await decryptText(env, r.body).catch(() => ''), at: r.created_at });
  return out;
}
app.get('/pub/a/:token', async (c) => {
  const a = await activityByToken(c.env.DB, c.req.param('token'));
  if (!a) return c.json({ error: '활동을 찾을 수 없습니다. 선생님께 링크를 다시 받아 주세요.' }, 404);
  const base = { title: a.data.title, kind: a.data.kind, subject: a.data.subject || '', question: a.data.question || '', open: !!a.data.open, limit: subLimit(a), showNames: !!a.data.showNames };
  if (a.data.kind === '클래스 보드') base.posts = await boardPosts(c.env, a);
  // 퀴즈: 문제·보기만 보냄 (정답은 학생 화면에 보내지 않음)
  if (a.data.kind === '실시간 퀴즈') base.questions = (a.data.questions || []).map((q) => ({ q: q.q, choices: q.choices || [], type: q.choices?.length ? '객관식' : '단답형' }));
  return c.json(base);
});
app.post('/pub/a/:token', async (c) => {
  if (c.req.header('x-requested-with') !== 'gyomusil-pub') return c.json({ error: '잘못된 요청입니다.' }, 400);
  const a = await activityByToken(c.env.DB, c.req.param('token'));
  if (!a) return c.json({ error: '활동을 찾을 수 없습니다.' }, 404);
  if (!a.data.open) return c.json({ error: '지금은 제출을 받지 않습니다.' }, 403);
  const b = await c.req.json().catch(() => ({}));
  const num = String(b.num || '').trim().slice(0, 4);
  const name = String(b.name || '').trim().slice(0, 20);
  const body = String(b.body || '').trim();
  if (!body) return c.json({ error: '내용을 입력해 주세요.' }, 400);
  if ([...body].length > subLimit(a)) return c.json({ error: `${subLimit(a)}자 이내로 써 주세요.` }, 400);
  if (a.data.kind !== '클래스 보드' && !name) return c.json({ error: '이름을 입력해 주세요.' }, 400);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE activity_id = ? AND created_at > datetime('now', '-1 minute')").bind(a.id).first();
  if ((recent?.n || 0) > 150) return c.json({ error: '잠시 후 다시 시도해 주세요.' }, 429);
  const encName = await encryptText(c.env, name);
  const encBody = await encryptText(c.env, body);
  if (a.data.kind === '클래스 보드') {
    await c.env.DB.prepare('INSERT INTO submissions (activity_id, owner, num, name, body) VALUES (?, ?, ?, ?, ?)').bind(a.id, a.owner, num, encName, encBody).run();
    return c.json({ ok: true, posts: await boardPosts(c.env, a) });
  }
  const who = await sha(`${a.id}|${num}|${name.replace(/\s/g, '')}`);
  const prev = await c.env.DB.prepare('SELECT id FROM submissions WHERE activity_id = ? AND who = ?').bind(a.id, who).first();
  if (prev) await c.env.DB.prepare("UPDATE submissions SET body = ?, name = ?, num = ?, hidden = 0, updated_at = datetime('now') WHERE id = ?").bind(encBody, encName, num, prev.id).run();
  else await c.env.DB.prepare('INSERT INTO submissions (activity_id, owner, who, num, name, body) VALUES (?, ?, ?, ?, ?, ?)').bind(a.id, a.owner, who, num, encName, encBody).run();
  return c.json({ ok: true, updated: !!prev });
});
app.get('/api/activities/:id/submissions', async (c) => {
  const id = c.req.param('id');
  const a = await c.env.DB.prepare("SELECT id FROM records WHERE id = ? AND module = 'activities' AND owner = ?").bind(id, c.get('user').email).first();
  if (!a) return c.json({ error: '활동을 찾을 수 없습니다.' }, 404);
  const rows = (await c.env.DB.prepare('SELECT * FROM submissions WHERE activity_id = ? ORDER BY id').bind(id).all()).results;
  const out = [];
  for (const r of rows) out.push({ id: r.id, num: r.num, name: await decryptText(c.env, r.name).catch(() => ''), body: await decryptText(c.env, r.body).catch(() => '(복호화 실패)'), hidden: !!r.hidden, createdAt: r.created_at, updatedAt: r.updated_at });
  return c.json(out);
});
app.post('/api/activities/:id/submissions/:sid/hide', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const r = await c.env.DB.prepare('UPDATE submissions SET hidden = ? WHERE id = ? AND activity_id = ? AND owner = ?').bind(b.hidden === false ? 0 : 1, Number(c.req.param('sid')), c.req.param('id'), c.get('user').email).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: '찾을 수 없습니다.' }, 404);
});
app.delete('/api/activities/:id/submissions', async (c) => {
  await c.env.DB.prepare('DELETE FROM submissions WHERE activity_id = ? AND owner = ?').bind(c.req.param('id'), c.get('user').email).run();
  return c.json({ ok: true });
});

// 마감 전날(한국 시각) 아침: 아직 응답하지 않은 대상자에게만 취합 알림
async function remindDueCollections(env, ctx) {
  const tomorrow = new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
  const rows = (await env.DB.prepare("SELECT r.id, r.school_id, r.data FROM records r JOIN schools s ON s.id = r.school_id AND s.status = 'active' WHERE r.module = 'collections' AND json_extract(r.data, '$.due') = ?").bind(tomorrow).all()).results;
  const fake = { env, get: () => null, req: { url: env.APP_ORIGIN || 'https://onlineplatform.lecoeur.workers.dev/' }, executionCtx: ctx };
  for (const r of rows) {
    try {
      const d = JSON.parse(r.data);
      const targets = d.target?.length ? d.target : (await env.DB.prepare("SELECT name FROM members WHERE school_id = ? AND role IN ('admin','staff') AND name != ''").bind(r.school_id).all()).results.map((x) => x.name);
      const missing = targets.filter((n) => !(d.done || []).includes(n));
      if (missing.length) await notify(fake, await emailsByName(env.DB, r.school_id, missing), { title: '⏰ 내일 마감 취합', body: d.title || '', url: '/#/notice/collections' }, r.school_id);
    } catch (e) { console.error('collection remind', r.id, e.message); }
  }
}

async function scheduled(_event, env, ctx) {
  ctx.waitUntil(remindDueCollections(env, ctx).catch((e) => console.error('remind', e.message)));
  ctx.waitUntil((async () => {
    if (!env.NEIS_API_KEY) return;
    const schools = await env.DB.prepare("SELECT s.id FROM schools s JOIN school_settings t ON t.school_id = s.id AND t.key = 'neis' WHERE s.status = 'active' AND t.value != 'null'").all();
    for (const { id } of schools.results.slice(0, 20)) {
      try {
        const settings = await getSettings(env.DB, id);
        if (!settings.neis) continue;
        const result = await syncSchedule(env, env.DB, id, settings.currentYear, settings.neis, 'neis-auto');
        await saveLastSync(env.DB, id, settings.neis, result);
      } catch (e) { console.error('neis auto sync', id, e.message); }
    }
  })());
}

export default { fetch: app.fetch, scheduled };
