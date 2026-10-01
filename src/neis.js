// 나이스 교육정보 개방포털 연동 (https://open.neis.go.kr)
//   학교 검색 · 학사일정 → 학사일정 메뉴로 동기화 · 급식 조회
//   인증키: wrangler secret / 대시보드 비밀값 NEIS_API_KEY
import { yearRange } from '../public/js/modules.js';
import { eventCategory } from '../public/js/importer.js';

const BASE = 'https://open.neis.go.kr/hub';

export class NeisError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// 나이스 응답: { 서비스명: [ {head:[{list_total_count},{RESULT}]}, {row:[...]} ] } 또는 { RESULT:{CODE,MESSAGE} }
export function parseNeis(service, json) {
  if (json?.RESULT) {
    if (json.RESULT.CODE === 'INFO-200') return { rows: [], total: 0 };
    throw new NeisError(`나이스 오류: ${json.RESULT.MESSAGE || json.RESULT.CODE}`);
  }
  const body = json?.[service];
  if (!Array.isArray(body)) throw new NeisError('나이스 응답 형식이 예상과 다릅니다.');
  const head = body[0]?.head || [];
  const total = head.find((x) => x.list_total_count !== undefined)?.list_total_count ?? 0;
  const result = head.find((x) => x.RESULT)?.RESULT;
  if (result && result.CODE !== 'INFO-000') throw new NeisError(`나이스 오류: ${result.MESSAGE || result.CODE}`);
  return { rows: body[1]?.row || [], total };
}

// 나이스 서버는 브라우저가 아닌 요청(User-Agent 없음)에 500을 돌려주는 경우가 있어 헤더를 붙이고,
// https 실패 시 http로 한 번 더 시도함
const HEADERS = {
  accept: 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'accept-language': 'ko-KR,ko;q=0.9',
};

async function neisGet(path, fetchImpl) {
  let last = '';
  for (const base of [BASE, BASE.replace('https://', 'http://')]) {
    let res;
    try { res = await fetchImpl(`${base}/${path}`, { headers: HEADERS }); }
    catch (e) { last = `연결 실패(${e.message || e})`; continue; }
    const text = await res.text();
    if (res.ok) {
      try { return JSON.parse(text); }
      catch { last = `응답 해석 실패: ${text.slice(0, 120)}`; continue; }
    }
    last = `${res.status} ${text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}`;
    console.error('neis', base, path.split('?')[0], last);
  }
  throw new NeisError(`나이스 서버 응답 오류: ${last}`, 502);
}

export async function neisFetch(env, service, params, fetchImpl = fetch) {
  const key = String(env.NEIS_API_KEY || '').trim();
  if (!key) throw new NeisError('나이스 인증키(NEIS_API_KEY)가 등록되지 않았습니다. Cloudflare 비밀값에 등록해 주세요.', 412);
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({ KEY: key, Type: 'json', pIndex: String(page), pSize: '1000', ...params });
    const { rows, total } = parseNeis(service, await neisGet(`${service}?${q}`, fetchImpl));
    all.push(...rows);
    if (all.length >= total || rows.length < 1000) break;
  }
  return all;
}

export async function searchSchools(env, name, fetchImpl) {
  const rows = await neisFetch(env, 'schoolInfo', { SCHUL_NM: name }, fetchImpl);
  return rows.slice(0, 30).map((r) => ({
    atpt: r.ATPT_OFCDC_SC_CODE, code: r.SD_SCHUL_CODE, name: r.SCHUL_NM,
    office: r.ATPT_OFCDC_SC_NM, kind: r.SCHUL_KND_SC_NM, address: r.ORG_RDNMA,
  }));
}

const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const compact = (d) => d.replace(/-/g, '');
const norm = (t) => String(t || '').replace(/[\s·.,()[\]{}~\-_/•]/g, '');
const GRADES = ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'];

function gradesOf(r) {
  const on = GRADES.map((g, i) => (r[`${g}_GRADE_EVENT_YN`] === 'Y' ? i + 1 : 0)).filter(Boolean);
  if (!on.length || on.length === 6) return '';
  return `${on.join(',')}학년`;
}

function addDay(d, n) {
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return t.toISOString().slice(0, 10);
}

// 나이스 학사일정 행 → 학사일정 기록. 토요휴업일은 빼고, 이어지는 같은 일정(방학 등)은 하나로 묶음
export function scheduleToEvents(rows) {
  const items = rows
    .filter((r) => r.EVENT_NM && !/^토요휴업일$/.test(String(r.EVENT_NM).trim()))
    .map((r) => {
      const title = String(r.EVENT_NM).trim();
      const off = /휴업일|공휴일/.test(r.SBTR_DD_SC_NM || '');
      return {
        date: ymd(r.AA_YMD), title,
        category: off || /방학(?!식)/.test(title) ? '휴일·방학' : eventCategory(title),
        target: gradesOf(r),
        note: r.EVENT_CNTNT && r.EVENT_CNTNT !== title ? String(r.EVENT_CNTNT) : '',
        source: '나이스',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const out = [];
  for (const it of items) {
    const prev = out.findLast((x) => x.title === it.title);
    // 이어지는 같은 일정: 평일 일정은 주말을 건너뛴 정도(3일)까지, 휴일·방학은 7일까지 하나로
    const gap = it.category === '휴일·방학' ? 7 : 3;
    if (prev && it.date > (prev.endDate || prev.date) && it.date <= addDay(prev.endDate || prev.date, gap)) { prev.endDate = it.date; continue; }
    out.push({ ...it });
  }
  return out;
}

// 학사일정 동기화: 기존 '나이스' 일정을 지우고 새로 넣음. 직접 입력한 같은 날·같은 이름 일정이 있으면 건너뜀
export async function syncSchedule(env, db, year, cfg, email, fetchImpl) {
  if (!cfg?.atpt || !cfg?.code) throw new NeisError('관리자 → 설정 → 나이스 연동에서 학교를 먼저 선택해 주세요.');
  const { from, to } = yearRange(year);
  const rows = await neisFetch(env, 'SchoolSchedule', { ATPT_OFCDC_SC_CODE: cfg.atpt, SD_SCHUL_CODE: cfg.code, AA_FROM_YMD: compact(from), AA_TO_YMD: compact(to) }, fetchImpl);
  const events = scheduleToEvents(rows);
  const existing = await db.prepare("SELECT date, data FROM records WHERE module = 'events' AND date BETWEEN ? AND ? AND COALESCE(json_extract(data, '$.source'), '') != '나이스'").bind(from, to).all();
  const manual = existing.results.map((r) => ({ date: r.date, t: norm(JSON.parse(r.data).title) }));
  const dup = (e) => manual.some((m) => m.date === e.date && m.t && (m.t.includes(norm(e.title)) || norm(e.title).includes(m.t)));
  const keep = events.filter((e) => !dup(e));
  const stmts = [db.prepare("DELETE FROM records WHERE module = 'events' AND date BETWEEN ? AND ? AND json_extract(data, '$.source') = '나이스'").bind(from, to)];
  for (const e of keep) {
    const data = Object.fromEntries(Object.entries(e).filter(([, v]) => v));
    stmts.push(db.prepare('INSERT INTO records (id, module, year, date, sort, data, created_by, updated_by) VALUES (?, ?, NULL, ?, 0, ?, ?, ?)')
      .bind(crypto.randomUUID().replace(/-/g, '').slice(0, 16), 'events', e.date, JSON.stringify(data), email, email));
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  return { fetched: rows.length, inserted: keep.length, skipped: events.length - keep.length };
}

// 급식: 날짜별 [{ meal: '중식', dishes: [...], kcal }]
export async function getMeals(env, cfg, from, to, fetchImpl) {
  const atpt = cfg?.mealAtpt || cfg?.atpt;
  const code = cfg?.mealCode || cfg?.code;
  if (!atpt || !code) throw new NeisError('나이스 연동 학교가 설정되지 않았습니다.');
  const rows = await neisFetch(env, 'mealServiceDietInfo', { ATPT_OFCDC_SC_CODE: atpt, SD_SCHUL_CODE: code, MLSV_FROM_YMD: compact(from), MLSV_TO_YMD: compact(to) }, fetchImpl);
  const out = {};
  for (const r of rows) {
    const d = ymd(r.MLSV_YMD);
    const dishes = String(r.DDISH_NM || '').split(/<br\s*\/?>/i).map((x) => x.replace(/\([\d.\s]+\)/g, '').replace(/[*#]/g, '').trim()).filter(Boolean);
    (out[d] ||= []).push({ meal: r.MMEAL_SC_NM || '', dishes, kcal: r.CAL_INFO || '' });
  }
  return out;
}

// 초등 학급 시간표: [{ date, period, subject }]. 학년도(AY)는 3월 기준
export async function getTimetable(env, cfg, grade, cls, from, to, fetchImpl) {
  if (!cfg?.atpt || !cfg?.code) throw new NeisError('나이스 연동 학교가 설정되지 않았습니다.');
  const [y, mo] = from.split('-').map(Number);
  const rows = await neisFetch(env, 'elsTimetable', {
    ATPT_OFCDC_SC_CODE: cfg.atpt, SD_SCHUL_CODE: cfg.code, AY: String(mo < 3 ? y - 1 : y),
    GRADE: String(grade), CLASS_NM: String(cls), TI_FROM_YMD: compact(from), TI_TO_YMD: compact(to),
  }, fetchImpl);
  return rows.map((r) => ({ date: ymd(r.ALL_TI_YMD), period: Number(r.PERIO) || 0, subject: String(r.ITRT_CNTNT || '').replace(/^-/, '').trim() }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
}
