// ✍️ 회의록 전자서명 서버 (인사자문위원회 등)
//   관리(관리자 + 학교 관리 → 권한의 '회의록 서명' 담당자): 회의록·위원 입력, 위원별 링크·6자리 비밀번호 발급, 마감, 원본 PDF 등록, 파기
//   위원(로그인 없음): /sign#k=코드 → 비밀번호 → 회의록 확인 → 서명·동의
//   누구나: PDF 파일 확인값(SHA-256)으로 위변조 확인
import { SIGN_FIELDS, MAX_FAILS, docHash, newCode, newPassword, newId, checkInput, checkSignature, clean, toHex } from '../public/js/sign-logic.js';

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const MEMBER_TTL = 2 * 3600 * 1000; // 위원 접속 2시간

// 비밀번호: PBKDF2 (6자리 숫자라도 서버 기록만으로는 쉽게 풀리지 않도록) + 5번 틀리면 잠금
async function pwHash(salt, pw) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 3000, hash: 'SHA-256' }, key, 256); // 6자리라 진짜 방어는 5회 잠금 — 반복 수는 워커 CPU 한도 안으로
  return toHex(bits);
}
const same = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

// 위원 접속 증표: 회의·위원·만료시각에 서버 비밀값으로 서명 (서버에 따로 저장하지 않음)
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`sign:${env.DATA_KEY || 'dev'}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
async function issueToken(env, meetingId, memberId) {
  const body = `${meetingId}.${memberId}.${Date.now() + MEMBER_TTL}`;
  return `${body}.${await hmac(env, body)}`;
}
async function readToken(env, token) {
  const p = String(token || '').split('.');
  if (p.length !== 4) return null;
  const body = p.slice(0, 3).join('.');
  if (!same(await hmac(env, body), p[3]) || Number(p[2]) < Date.now()) return null;
  return { meetingId: p[0], memberId: p[1] };
}

const nowKst = () => new Date(Date.now() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
const device = (b) => clean(b?.device || '알 수 없음').slice(0, 200);

export function mountSign(app, { requireSchool, getSettings, err, encryptText, decryptText }) {
  const DB = (c) => c.env.DB;
  const log = (c, meetingId, memberId, action, detail = '') => DB(c).prepare('INSERT INTO sign_log (meeting_id, member_id, action, detail, at) VALUES (?, ?, ?, ?, ?)').bind(meetingId, memberId || '', action, String(detail).slice(0, 500), nowKst()).run();
  const rowToMeeting = (r) => ({ id: r.id, ...JSON.parse(r.data), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, year: r.year });
  const membersOf = async (c, id) => (await DB(c).prepare('SELECT * FROM sign_members WHERE meeting_id = ? ORDER BY ord').bind(id).all()).results.map((m) => ({
    memberId: m.member_id, ord: m.ord, role: m.role, position: m.position, name: m.name, code: m.code, signedAt: m.signed_at || '', signature: m.signature || '', docHash: m.doc_hash || '',
    failCount: m.fail_count || 0, device: m.device || '', pwHash: m.pw_hash, salt: m.salt,
  }));

  // 관리 권한: 관리자 + 회의록 서명 담당자
  async function manager(c) {
    const mem = await requireSchool(c, 'staff');
    if (mem.role === 'admin') return mem;
    const s = await getSettings(c.env.DB, mem.schoolId);
    if ((s.signEditors || []).includes(String(c.get('user').email).toLowerCase())) return mem;
    throw err(403, '회의록 서명은 관리자와 학교 관리 → 권한에서 지정한 담당자(교감 등)만 관리할 수 있습니다.');
  }
  async function myMeeting(c, mem, id) {
    const r = await DB(c).prepare('SELECT * FROM sign_meetings WHERE id = ? AND school_id = ?').bind(id, mem.schoolId).first();
    if (!r) throw err(404, '회의록을 찾을 수 없습니다.');
    return rowToMeeting(r);
  }
  const fieldsOf = (m) => Object.fromEntries(SIGN_FIELDS.map((f) => [f, m[f] || '']));

  // ---------- 관리 ----------
  app.get('/api/sign', async (c) => {
    const mem = await manager(c);
    const rows = (await DB(c).prepare(`SELECT m.*, (SELECT COUNT(*) FROM sign_members x WHERE x.meeting_id = m.id) AS total,
      (SELECT COUNT(*) FROM sign_members x WHERE x.meeting_id = m.id AND x.signed_at IS NOT NULL AND x.signed_at != '') AS signed,
      (SELECT COUNT(*) FROM sign_pdfs p WHERE p.meeting_id = m.id) AS pdfs
      FROM sign_meetings m WHERE m.school_id = ? ORDER BY m.created_at DESC`).bind(mem.schoolId).all()).results;
    const purged = (await DB(c).prepare(`SELECT meeting_id, title, confirm_date, MAX(created_at) AS created_at, COUNT(*) AS n FROM sign_pdfs WHERE school_id = ? AND meeting_id NOT IN (SELECT id FROM sign_meetings) GROUP BY meeting_id ORDER BY created_at DESC LIMIT 50`).bind(mem.schoolId).all()).results;
    return c.json({ meetings: rows.map((r) => ({ ...rowToMeeting(r), total: r.total, signed: r.signed, pdfs: r.pdfs })), purged });
  });

  app.get('/api/sign/:id', async (c) => {
    const mem = await manager(c);
    const m = await myMeeting(c, mem, c.req.param('id'));
    const members = await membersOf(c, m.id);
    for (const x of members) if (x.signature) { try { x.signature = await decryptText(c.env, x.signature); } catch { x.signature = ''; } }
    const logs = (await DB(c).prepare('SELECT * FROM sign_log WHERE meeting_id = ? ORDER BY id').bind(m.id).all()).results;
    const pdfs = (await DB(c).prepare('SELECT name, sha256, created_at FROM sign_pdfs WHERE meeting_id = ? ORDER BY id').bind(m.id).all()).results;
    return c.json({ meeting: m, docHash: await docHash(m, members), logs, pdfs,
      members: members.map(({ pwHash, salt, failCount, ...x }) => ({ ...x, locked: failCount >= MAX_FAILS })) });
  });

  // 새로 만들기·수정: 새 위원에게만 비밀번호를 발급해 이때 한 번 돌려줌. 서명 뒤 내용이 바뀌면 서명을 모두 초기화(확인 받음)
  app.post('/api/sign', async (c) => {
    const mem = await manager(c);
    const b = await c.req.json().catch(() => ({}));
    const v = checkInput(b.meeting, b.members);
    if (v.error) throw err(400, v.error);
    const isNew = !b.meeting?.id;
    let meeting; let existing = [];
    if (isNew) {
      const s = await getSettings(c.env.DB, mem.schoolId);
      meeting = { id: newId(), status: 'open', year: s.currentYear };
    } else {
      meeting = await myMeeting(c, mem, b.meeting.id);
      if (meeting.status === 'closed') throw err(409, '마감된 회의록은 고칠 수 없습니다. 먼저 [서명 다시 열기]를 눌러 주세요.');
      existing = await membersOf(c, meeting.id);
    }
    const before = isNew ? '' : await docHash(meeting, existing);
    Object.assign(meeting, v.meeting);
    const byId = new Map(existing.map((x) => [x.memberId, x]));
    const used = new Set((await DB(c).prepare('SELECT code FROM sign_members').all()).results.map((r) => r.code));
    const issued = []; const next = [];
    for (const x of v.members) {
      const prev = x.memberId && byId.get(x.memberId);
      if (prev) { next.push({ ...prev, ord: x.ord, role: x.role, position: x.position, name: x.name }); continue; }
      const pw = newPassword(); const salt = newId();
      const row = { memberId: newId(), ord: x.ord, role: x.role, position: x.position, name: x.name, pwHash: await pwHash(salt, pw), salt, code: newCode(used), signedAt: '', signature: '', docHash: '', failCount: 0, device: '' };
      issued.push({ memberId: row.memberId, code: row.code, name: row.name, password: pw });
      next.push(row);
    }
    const after = await docHash(meeting, next);
    const signedCount = existing.filter((x) => x.signedAt).length;
    let reset = false;
    if (!isNew && before !== after && signedCount) {
      if (!b.confirmReset) return c.json({ error: `이미 ${signedCount}명이 서명했습니다. 내용을 바꾸면 서명이 모두 초기화됩니다.`, code: 'SIGNED_EXISTS', signed: signedCount }, 409);
      for (const x of next) Object.assign(x, { signedAt: '', signature: '', docHash: '' });
      reset = true;
    }
    const db = DB(c); const t = nowKst();
    const stmts = [];
    if (isNew) stmts.push(db.prepare('INSERT INTO sign_meetings (id, school_id, year, data, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(meeting.id, mem.schoolId, meeting.year, JSON.stringify(fieldsOf(meeting)), 'open', c.get('user').email, t, t));
    else stmts.push(db.prepare('UPDATE sign_meetings SET data = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(fieldsOf(meeting)), t, meeting.id));
    stmts.push(db.prepare('DELETE FROM sign_members WHERE meeting_id = ?').bind(meeting.id));
    for (const x of next) stmts.push(db.prepare('INSERT INTO sign_members (meeting_id, member_id, ord, role, position, name, pw_hash, salt, code, signed_at, signature, doc_hash, fail_count, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(meeting.id, x.memberId, x.ord, x.role, x.position, x.name, x.pwHash, x.salt, x.code, x.signedAt || null, x.signature || null, x.docHash || null, x.failCount || 0, x.device || null));
    await db.batch(stmts);
    await log(c, meeting.id, '', isNew ? 'create' : 'update', reset ? '내용 변경으로 서명 초기화' : '');
    for (const x of issued) await log(c, meeting.id, x.memberId, 'issue-password', x.name);
    return c.json({ id: meeting.id, issued, reset });
  });

  app.delete('/api/sign/:id', async (c) => {
    const mem = await manager(c);
    const m = await myMeeting(c, mem, c.req.param('id'));
    await DB(c).batch([DB(c).prepare('DELETE FROM sign_members WHERE meeting_id = ?').bind(m.id), DB(c).prepare('DELETE FROM sign_log WHERE meeting_id = ?').bind(m.id), DB(c).prepare('DELETE FROM sign_meetings WHERE id = ?').bind(m.id)]);
    return c.json({ ok: true });
  });

  app.post('/api/sign/:id/status', async (c) => {
    const mem = await manager(c);
    const m = await myMeeting(c, mem, c.req.param('id'));
    const { status } = await c.req.json().catch(() => ({}));
    if (!['open', 'closed'].includes(status)) throw err(400, '잘못된 상태 값입니다.');
    await DB(c).prepare('UPDATE sign_meetings SET status = ?, updated_at = ? WHERE id = ?').bind(status, nowKst(), m.id).run();
    await log(c, m.id, '', status === 'closed' ? 'close' : 'reopen');
    return c.json({ ok: true });
  });

  app.post('/api/sign/:id/reissue', async (c) => {
    const mem = await manager(c);
    const m = await myMeeting(c, mem, c.req.param('id'));
    const { memberId } = await c.req.json().catch(() => ({}));
    const x = (await membersOf(c, m.id)).find((y) => y.memberId === memberId);
    if (!x) throw err(404, '위원을 찾을 수 없습니다.');
    const pw = newPassword(); const salt = newId();
    await DB(c).prepare('UPDATE sign_members SET pw_hash = ?, salt = ?, fail_count = 0 WHERE meeting_id = ? AND member_id = ?').bind(await pwHash(salt, pw), salt, m.id, x.memberId).run();
    await log(c, m.id, x.memberId, 'reissue-password', x.name);
    return c.json({ memberId: x.memberId, code: x.code, name: x.name, password: pw });
  });

  app.post('/api/sign/:id/reset', async (c) => {
    const mem = await manager(c);
    const m = await myMeeting(c, mem, c.req.param('id'));
    if (m.status === 'closed') throw err(409, '마감된 회의록입니다. 먼저 [서명 다시 열기]를 눌러 주세요.');
    const { memberId } = await c.req.json().catch(() => ({}));
    const x = (await membersOf(c, m.id)).find((y) => y.memberId === memberId);
    if (!x) throw err(404, '위원을 찾을 수 없습니다.');
    await DB(c).prepare('UPDATE sign_members SET signed_at = NULL, signature = NULL, doc_hash = NULL, device = NULL WHERE meeting_id = ? AND member_id = ?').bind(m.id, x.memberId).run();
    await log(c, m.id, x.memberId, 'reset-signature', x.name);
    return c.json({ ok: true });
  });

  // 원본 PDF 등록: 브라우저에서 만든 PDF의 확인값(SHA-256)만 받음 (파일은 서버에 올리지 않음)
  app.post('/api/sign/:id/pdf', async (c) => {
    const mem = await manager(c);
    const m = await myMeeting(c, mem, c.req.param('id'));
    const b = await c.req.json().catch(() => ({}));
    const sha = String(b.sha256 || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) throw err(400, '파일 확인값이 올바르지 않습니다.');
    const members = await membersOf(c, m.id);
    const signers = members.map((x) => ({ name: x.name, role: x.role, position: x.position, signedAt: x.signedAt }));
    const name = clean(b.name).slice(0, 120) || `${m.title}.pdf`;
    await DB(c).prepare('INSERT INTO sign_pdfs (school_id, meeting_id, name, sha256, doc_hash, title, school, confirm_date, signers, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(mem.schoolId, m.id, name, sha, await docHash(m, members), m.title, m.school, m.confirmDate, JSON.stringify(signers), nowKst()).run();
    await log(c, m.id, '', 'save-pdf', `${name} / 파일확인값 ${sha.slice(0, 16)}`);
    return c.json({ ok: true });
  });

  // 클라우드 데이터 파기: 회의록·위원·비밀번호·서명·이력 삭제, 위변조 확인 기록만 남김 (마감된 회의록만)
  app.post('/api/sign/:id/purge', async (c) => {
    const mem = await manager(c);
    const m = await myMeeting(c, mem, c.req.param('id'));
    if (m.status !== 'closed') throw err(409, '서명이 마감된 회의록만 파기할 수 있습니다.');
    const kept = (await DB(c).prepare('SELECT COUNT(*) AS n FROM sign_pdfs WHERE meeting_id = ?').bind(m.id).first())?.n || 0;
    if (!kept) throw err(409, '먼저 [원본 PDF 만들기]로 PDF를 내려받고 원본으로 등록해 주세요. 파기 뒤에는 회의록을 다시 만들 수 없습니다.');
    await DB(c).batch([DB(c).prepare('DELETE FROM sign_members WHERE meeting_id = ?').bind(m.id), DB(c).prepare('DELETE FROM sign_log WHERE meeting_id = ?').bind(m.id), DB(c).prepare('DELETE FROM sign_meetings WHERE id = ?').bind(m.id)]);
    return c.json({ ok: true, kept });
  });

  // ---------- 위원 (로그인 없음) ----------
  const pubGuard = (c) => { if (c.req.header('x-requested-with') !== 'gyomusil-pub') throw err(400, '잘못된 요청입니다.'); };
  async function byCode(c, code) {
    const k = String(code || '').toUpperCase();
    if (!/^[23456789A-HJ-NP-Z]{6}$/.test(k)) return null;
    const x = await DB(c).prepare('SELECT * FROM sign_members WHERE code = ?').bind(k).first();
    if (!x) return null;
    const r = await DB(c).prepare('SELECT * FROM sign_meetings WHERE id = ?').bind(x.meeting_id).first();
    return r ? { meeting: rowToMeeting(r), memberId: x.member_id } : null;
  }
  async function memberView(c, meeting, memberId) {
    const members = await membersOf(c, meeting.id);
    const me = members.find((x) => x.memberId === memberId);
    let signature = '';
    if (me?.signature) { try { signature = await decryptText(c.env, me.signature); } catch { /* 무시 */ } }
    return {
      meeting: { ...fieldsOf(meeting), status: meeting.status },
      me: { name: me.name, role: me.role, position: me.position, signedAt: me.signedAt, signature },
      members: members.map((x) => ({ role: x.role, position: x.position, name: x.name, signed: !!x.signedAt, me: x.memberId === memberId })), // 다른 위원의 서명 이미지는 보내지 않음
      docHash: await docHash(meeting, members),
    };
  }
  app.get('/pub/sign/:code', async (c) => {
    const f = await byCode(c, c.req.param('code'));
    if (!f) return c.json({ error: '회의록을 찾을 수 없습니다. 링크를 다시 확인해 주세요.' }, 404);
    const x = (await membersOf(c, f.meeting.id)).find((y) => y.memberId === f.memberId);
    return c.json({ title: f.meeting.title, school: f.meeting.school, committee: f.meeting.committee, status: f.meeting.status, name: x.name, role: x.role, signed: !!x.signedAt, locked: x.failCount >= MAX_FAILS });
  });
  app.post('/pub/sign/:code/login', async (c) => {
    pubGuard(c);
    const f = await byCode(c, c.req.param('code'));
    if (!f) return c.json({ error: '회의록을 찾을 수 없습니다.' }, 404);
    const b = await c.req.json().catch(() => ({}));
    const x = (await membersOf(c, f.meeting.id)).find((y) => y.memberId === f.memberId);
    if (x.failCount >= MAX_FAILS) return c.json({ error: '비밀번호를 여러 번 틀려 잠겼습니다. 담당자에게 비밀번호 재발급을 요청해 주세요.' }, 423);
    if (!same(await pwHash(x.salt, String(b.password || '').trim()), x.pwHash)) {
      const n = x.failCount + 1;
      await DB(c).prepare('UPDATE sign_members SET fail_count = ? WHERE meeting_id = ? AND member_id = ?').bind(n, f.meeting.id, x.memberId).run();
      await log(c, f.meeting.id, x.memberId, 'login-fail', x.name);
      return c.json({ error: n < MAX_FAILS ? `비밀번호가 올바르지 않습니다. (남은 시도 ${MAX_FAILS - n}회)` : '비밀번호를 여러 번 틀려 잠겼습니다. 담당자에게 비밀번호 재발급을 요청해 주세요.' }, 401);
    }
    if (x.failCount) await DB(c).prepare('UPDATE sign_members SET fail_count = 0 WHERE meeting_id = ? AND member_id = ?').bind(f.meeting.id, x.memberId).run();
    await log(c, f.meeting.id, x.memberId, 'login', `${x.name} / ${device(b)}`);
    return c.json({ token: await issueToken(c.env, f.meeting.id, x.memberId), ...(await memberView(c, f.meeting, x.memberId)) });
  });
  app.post('/pub/sign/:code/sign', async (c) => {
    pubGuard(c);
    const b = await c.req.json().catch(() => ({}));
    const who = await readToken(c.env, b.token);
    const f = await byCode(c, c.req.param('code'));
    if (!who || !f || who.memberId !== f.memberId || who.meetingId !== f.meeting.id) return c.json({ error: '접속이 만료되었습니다. 비밀번호를 다시 입력해 주세요.', code: 'AUTH' }, 401);
    const bad = checkSignature(b.signature);
    if (bad) return c.json({ error: bad }, 400);
    if (b.consent !== true || b.consentEsign !== true) return c.json({ error: '회의록 내용 확인과 전자서명 사용에 동의해 주세요.' }, 400);
    const meeting = f.meeting;
    if (meeting.status !== 'open') return c.json({ error: '서명이 마감된 회의록입니다.' }, 409);
    const members = await membersOf(c, meeting.id);
    const me = members.find((x) => x.memberId === who.memberId);
    if (me.signedAt) return c.json({ error: '이미 서명하셨습니다.' }, 409);
    const h = await docHash(meeting, members);
    // 위원이 본 내용과 지금 내용이 다르면(그사이 수정) 받지 않음 — 원본은 확인값이 없으면 건너뛰었지만 여기서는 꼭 확인
    if (String(b.docHash || '') !== h) return c.json({ error: '회의록 내용이 그사이 수정되었습니다. 새로고침한 뒤 다시 확인해 주세요.', code: 'CHANGED' }, 409);
    const t = nowKst();
    const r = await DB(c).prepare("UPDATE sign_members SET signed_at = ?, signature = ?, doc_hash = ?, device = ? WHERE meeting_id = ? AND member_id = ? AND (signed_at IS NULL OR signed_at = '')")
      .bind(t, await encryptText(c.env, b.signature), h, device(b), meeting.id, me.memberId).run();
    if (!r.meta?.changes) return c.json({ error: '이미 서명하셨습니다.' }, 409);
    await log(c, meeting.id, me.memberId, 'sign', `${me.name} / 내용 확인·동의, 전자서명 사용 동의 / 문서확인값 ${h.slice(0, 16)} / ${device(b)}`);
    const left = (await DB(c).prepare("SELECT COUNT(*) AS n FROM sign_members WHERE meeting_id = ? AND (signed_at IS NULL OR signed_at = '')").bind(meeting.id).first())?.n || 0;
    if (!left) {
      await DB(c).prepare("UPDATE sign_meetings SET status = 'closed', updated_at = ? WHERE id = ?").bind(t, meeting.id).run();
      await log(c, meeting.id, '', 'auto-close', '모든 위원 서명 완료');
      meeting.status = 'closed';
    }
    return c.json(await memberView(c, meeting, me.memberId));
  });

  // 위변조 확인: PDF 확인값으로 원본 기록 찾기 (누구나)
  app.get('/pub/sign-verify/:sha', async (c) => {
    const sha = String(c.req.param('sha')).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) return c.json({ error: '파일 확인값이 올바르지 않습니다.' }, 400);
    const r = await DB(c).prepare('SELECT * FROM sign_pdfs WHERE sha256 = ? ORDER BY id DESC LIMIT 1').bind(sha).first();
    if (!r) return c.json({ match: false });
    const alive = await DB(c).prepare('SELECT 1 FROM sign_meetings WHERE id = ?').bind(r.meeting_id).first();
    let signers = []; try { signers = JSON.parse(r.signers || '[]'); } catch { /* 무시 */ }
    return c.json({ match: true, name: r.name, createdAt: r.created_at, title: r.title, school: r.school, confirmDate: r.confirm_date, signers, purged: !alive });
  });
}
