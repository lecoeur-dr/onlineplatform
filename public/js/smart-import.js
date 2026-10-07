// 🪄 새 학기 자료 가져오기: 한글(HWPX) · 엑셀 · CSV · 붙여넣기 → 학사일정 / 업무분장 자동 인식
//   브라우저 안에서만 읽음 (파일을 서버로 보내지 않음). 인식 결과는 미리보기에서 고친 뒤 저장
import { eventCategory } from './importer.js';

// ---------- 파일 읽기 → { tables: string[][][], lines: string[] } ----------

export async function readSource(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.hwp')) throw new Error('예전 한글 파일(.hwp)은 브라우저에서 읽을 수 없습니다. 한글에서 [파일 → 다른 이름으로 저장 → 파일 형식: HWPX]로 저장해 올리거나, 표를 복사해 아래 붙여넣기 칸에 넣어 주세요.');
  if (name.endsWith('.hwpx')) return readHwpx(await file.arrayBuffer());
  if (/\.(xlsx|xls|xlsm)$/.test(name)) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.csv')) return readCsv(await file.text());
  if (/\.(tsv|txt)$/.test(name)) return readText(await file.text());
  throw new Error('HWPX, XLSX, CSV, TXT 파일만 읽을 수 있습니다.');
}

// CSV(쉼표로 나뉜 표, 따옴표 안의 쉼표·줄바꿈 허용). 탭으로 나뉜 글이면 그대로 readText
export function readCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (src.includes('\t') && !src.includes(',')) return readText(src);
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return { tables: [rows.filter((r) => r.some(Boolean))], lines: [] };
}

// 붙여넣은 글: 탭으로 나뉜 표(한글·엑셀에서 표 복사) 또는 줄글
export function readText(text) {
  const rows = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.split('\t').map((c) => c.trim()));
  const hasTabs = rows.some((r) => r.length > 1);
  if (hasTabs) return { tables: [rows.filter((r) => r.some(Boolean))], lines: [] };
  return { tables: [], lines: rows.map((r) => r[0]).filter(Boolean) };
}

async function readXlsx(buf) {
  if (!window.XLSX) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('엑셀 읽기 도구를 불러오지 못했습니다.')); document.head.append(s); });
  }
  const wb = window.XLSX.read(buf, { type: 'array', cellDates: false });
  const tables = wb.SheetNames.map((n) => window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim())));
  // 병합 셀은 왼쪽 위 칸에만 값이 있으므로 아래로 채움
  wb.SheetNames.forEach((n, i) => {
    for (const m of wb.Sheets[n]['!merges'] || []) {
      const v = tables[i][m.s.r]?.[m.s.c] ?? '';
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) { tables[i][r] ||= []; tables[i][r][c] = v; }
    }
  });
  return { tables, lines: [] };
}

// HWPX = ZIP 안의 Contents/section*.xml. ZIP 은 브라우저 기본 기능(DecompressionStream)으로 풂
async function unzip(buf) {
  const dv = new DataView(buf);
  let eocd = buf.byteLength - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('HWPX 파일 형식이 올바르지 않습니다.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nLen = dv.getUint16(off + 28, true);
    const xLen = dv.getUint16(off + 30, true);
    const cLen = dv.getUint16(off + 32, true);
    const local = dv.getUint32(off + 42, true);
    const name = dec.decode(new Uint8Array(buf, off + 46, nLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    files[name] = { method, data: new Uint8Array(buf, start, csize) };
    off += 46 + nLen + xLen + cLen;
  }
  return files;
}
async function inflate({ method, data }) {
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('이 브라우저에서는 HWPX를 읽을 수 없습니다. 최신 크롬·엣지·사파리를 써 주세요.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

export async function readHwpx(buf) {
  const files = await unzip(buf);
  const sections = Object.keys(files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!sections.length) throw new Error('HWPX 안에서 본문을 찾지 못했습니다.');
  const tables = [];
  const lines = [];
  for (const n of sections) {
    const xml = new DOMParser().parseFromString(await inflate(files[n]), 'application/xml');
    const all = [...xml.getElementsByTagName('*')];
    const isA = (el, local) => el.localName === local;
    const owner = (el, local) => { let p = el.parentNode; while (p && p.nodeType === 1) { if (isA(p, local)) return p; p = p.parentNode; } return null; };
    // 칸 글자: 그 칸에 바로 속한 문단마다 줄바꿈 (안쪽 표는 따로 읽음)
    const paraText = (p) => [...p.getElementsByTagName('*')].filter((t) => isA(t, 't') && owner(t, 'p') === p).map((t) => t.textContent).join('');
    const textOf = (tc) => [...tc.getElementsByTagName('*')].filter((x) => isA(x, 'p') && owner(x, 'tc') === tc).map(paraText).join('\n').trim();
    for (const tbl of all.filter((el) => isA(el, 'tbl'))) {
      const grid = [];
      const rows = [...tbl.getElementsByTagName('*')].filter((el) => isA(el, 'tr') && owner(el, 'tbl') === tbl);
      rows.forEach((tr, ri) => {
        const cells = [...tr.getElementsByTagName('*')].filter((el) => isA(el, 'tc') && owner(el, 'tr') === tr);
        let ci = 0;
        for (const tc of cells) {
          const addr = [...tc.children].find((x) => isA(x, 'cellAddr'));
          const span = [...tc.children].find((x) => isA(x, 'cellSpan'));
          const r = addr ? Number(addr.getAttribute('rowAddr')) : ri;
          let c = addr ? Number(addr.getAttribute('colAddr')) : ci;
          if (!addr) while (grid[r]?.[c] !== undefined) c++;
          const rs = Number(span?.getAttribute('rowSpan')) || 1;
          const cs = Number(span?.getAttribute('colSpan')) || 1;
          const text = textOf(tc);
          for (let y = r; y < r + rs; y++) for (let x = c; x < c + cs; x++) { grid[y] ||= []; grid[y][x] = text; }
          ci = c + cs;
        }
      });
      tables.push(grid.map((row) => Array.from({ length: row.length }, (_, i) => row[i] ?? '')));
    }
    for (const p of all.filter((el) => isA(el, 'p') && !owner(el, 'tbl'))) {
      const t = [...p.getElementsByTagName('*')].filter((x) => isA(x, 't') && owner(x, 'p') === p).map((x) => x.textContent).join('').trim();
      if (t) lines.push(t);
    }
  }
  return { tables, lines };
}

// ---------- 학사일정 인식 ----------

const WEEKDAY = /^\(?[월화수목금토일](요일)?\)?$/;
const HOLIDAY = /(방학(?!식)|휴업|공휴|대체\s*휴|재량\s*휴|휴일|설날|추석|성탄|현충일|광복절|개천절|한글날|삼일절|3[·.]?1절|어린이날|석가|부처님|신정|선거일)/;
const pad = (n) => String(n).padStart(2, '0');

function makeDate(year, m, d) {
  m = Number(m); d = Number(d);
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const y = m <= 2 ? year + 1 : year;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 글 안의 날짜: 2026.3.2 / 3. 2.(월) / 3월 2일 / 3/2 / 03-02 (+ ~ 범위)
const DATE_RE = /(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*일?\.?\s*(?:\(?[월화수목금토일]\)?)?(?:\s*[~∼-]\s*(?:(\d{1,2})\s*(?:월|[.\-/])\s*)?(\d{1,2})\s*일?\.?\s*(?:\(?[월화수목금토일]\)?)?)?/;

function cleanTitle(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/^[\s,·:\-–—]+|[\s,·:\-–—]+$/g, '').trim();
}

export function parseSchedule(src, year) {
  const out = [];
  const add = (date, endDate, title) => {
    for (const t of String(title).split(/\n+/).map(cleanTitle).filter((x) => x.length >= 2 && !/^\d+$/.test(x) && !WEEKDAY.test(x))) {
      const category = HOLIDAY.test(t) ? '휴일·방학' : eventCategory(t);
      out.push({ date, endDate: endDate && endDate > date ? endDate : undefined, title: t, category });
    }
  };
  const fromText = (text) => {
    const m = String(text).match(DATE_RE);
    if (!m || !/[월.\-/]/.test(m[0])) return false;
    const date = makeDate(m[1] ? (Number(m[2]) <= 2 ? Number(m[1]) - 1 : Number(m[1])) : year, m[2], m[3]);
    if (!date) return false;
    const end = m[5] ? makeDate(year, m[4] || m[2], m[5]) : null;
    const title = text.replace(m[0], ' ');
    if (cleanTitle(title).length < 2) return false;
    add(date, end, title);
    return true;
  };
  for (const table of src.tables) {
    let month = null;
    for (const row of table) {
      const cells = row.map((c) => String(c || '').trim());
      // '3월' 처럼 달만 있는 칸 → 아래 줄들에 이어짐 (병합 셀 포함)
      const mCell = cells.find((c) => /^(\d{1,2})\s*월$/.test(c));
      if (mCell) month = Number(mCell.match(/\d+/)[0]);
      const CAL = /^(\d{1,2})\s*일?\s*[\n ]\s*([\s\S]+)$/;
      const calRow = month && cells.some((c) => CAL.test(c) && !DATE_RE.test(c.replace(CAL, '$2')));
      const dayIdx = calRow ? -1 : cells.findIndex((c) => /^(\d{1,2})\s*일?$/.test(c) && Number(c.match(/\d+/)[0]) <= 31);
      if (month && dayIdx >= 0) {
        // 표 형식: 월 | 일 | 요일 | 행사
        const date = makeDate(year, month, cells[dayIdx].match(/\d+/)[0]);
        const rest = cells.filter((c, i) => i !== dayIdx && c !== mCell && !WEEKDAY.test(c) && !/^\d+\s*(월|일)?$/.test(c)).join('\n');
        if (date && rest) { add(date, null, rest); continue; }
      }
      let used = false;
      for (const c of cells) {
        // 달력 칸: '2 입학식' 또는 '2\n입학식'
        const cal = calRow && c.match(CAL);
        if (cal && !DATE_RE.test(cal[2])) { const date = makeDate(year, month, cal[1]); if (date) { add(date, null, cal[2]); used = true; continue; } }
        if (fromText(c)) used = true;
      }
      if (!used) fromText(cells.join(' '));
    }
  }
  for (const line of src.lines) fromText(line);
  // 같은 날 같은 제목은 하나만
  const seen = new Set();
  return out.filter((e) => { const k = `${e.date}|${e.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- 업무분장 인식 ----------

const COLS = {
  name: /^(성\s*명|이\s*름|교사\s*명|담당자|교사|성명\(직위\))$/,
  position: /^(직\s*위|직\s*명|직\s*급|보\s*직|직책)$/,
  dept: /^(부\s*서|업무\s*부서|소\s*속|부서명)$/,
  homeroom: /^(담\s*임|담임\s*학급|학\s*급|학년\s*반|학년반|담당\s*학급)$/,
  duties: /(담당\s*업무|업\s*무|분\s*장|주요\s*업무|업무\s*내용)/,
  room: /^(교\s*실|위\s*치|근무\s*장소)$/,
  phone: /^(내\s*선|전\s*화|연락처|내선번호)$/,
  subject: /^(담당\s*교과|교\s*과|과\s*목)$/,
};
const NAME_RE = /^[가-힣]{2,4}$/;

export function parseRoster(src) {
  const out = [];
  for (const table of src.tables) {
    let map = null;
    let lastDept = '';
    for (const row of table) {
      const cells = row.map((c) => String(c || '').replace(/\s+/g, ' ').trim());
      // 머리글 줄 찾기
      const cand = {};
      cells.forEach((c, i) => { for (const [k, re] of Object.entries(COLS)) if (cand[k] === undefined && re.test(c.replace(/\s/g, ' '))) cand[k] = i; });
      if (cand.name !== undefined && Object.keys(cand).length >= 2) { map = cand; lastDept = ''; continue; }
      if (!map) continue;
      const rawName = cells[map.name] || '';
      const name = rawName.replace(/\(.*?\)|\s/g, '');
      if (!NAME_RE.test(name)) continue;
      const get = (k) => (map[k] !== undefined ? cells[map[k]] || '' : '');
      const dept = get('dept') || lastDept;
      lastDept = dept;
      const pos = get('position') || (rawName.match(/\((.+?)\)/)?.[1] ?? '');
      out.push({ name, position: pos, dept, homeroom: normClass(get('homeroom')), subject: get('subject'), duties: get('duties'), room: get('room'), phone: get('phone') });
    }
  }
  const seen = new Set();
  return out.filter((r) => { const k = `${r.name}|${r.dept}|${r.duties}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// '3학년 1반' · '3-1' · '3 - 1' → '3-1'
export function normClass(s) {
  const t = String(s || '').trim();
  const m = t.match(/(\d)\s*(?:학년|-)\s*(\d{1,2})\s*반?/);
  return m ? `${m[1]}-${m[2]}` : t;
}

// ---------- 평가 계획 인식 ----------
//   ① 학교 평가계획서 양식: 제목 줄("과학과 교수학습 및 평가 운영계획")·학년·학기 + 머리글
//      (시기 | 단원명(교수학습 내용) | 평가 요소 | 평가 영역 | 평가 방법 | 성취기준 | 성취수준)
//      한 계획 = 여러 줄(성취수준마다 한 줄: 수준명 + 수준별 기준)
//   ② 간단한 표: 교과 | 영역 | 성취기준 | 평가 요소 | 방법 | 시기  ③ 줄글: "과목 | 영역 | 성취기준 | 시기 | 방법"
const EV_COLS = {
  subject: /^(교\s*과|과\s*목|교과목)$/,
  unit: /^(단\s*원|영역\s*[(·]\s*단원)/,
  area: /^(영\s*역|평가\s*영역|내용\s*영역)$/,
  standard: /(성취\s*기준)/,
  element: /(평가\s*요소|평가\s*내용)/,
  method: /^(평가\s*방법|방\s*법|평가\s*유형)$/,
  timing: /^(시\s*기|평가\s*시기|월|시행\s*시기)$/,
  levels: /(성취\s*수준|평가\s*기준|채점\s*기준|수준별\s*기준)/,
};
export const CODE_RE = /\[(\d{1,2}[가-힣]{1,3}\s?\d{2}-\d{2}(?:-\d{2})?)\]/;
const CODE_G = new RegExp(CODE_RE.source, 'g');
const KNOWN_SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '실과', '체육', '음악', '미술', '바른 생활', '슬기로운 생활', '즐거운 생활'];

// "[6도03-01] 문장\n[6도03-02] 문장" → [{code, text}] (코드 없는 줄은 앞 문장에 이어 붙임)
export function splitStandards(text, fallbackCode = '') {
  const out = [];
  for (const raw of String(text || '').split(/\n+/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const parts = line.split(CODE_G);
    if (parts.length === 1) { if (out.length) out.at(-1).text = `${out.at(-1).text} ${line}`.trim(); else out.push({ code: fallbackCode, text: line }); continue; }
    if (parts[0].trim() && out.length) out.at(-1).text = `${out.at(-1).text} ${parts[0].trim()}`;
    for (let k = 1; k < parts.length; k += 2) out.push({ code: `[${parts[k].replace(/\s/g, '')}]`, text: (parts[k + 1] || '').trim() });
  }
  return out;
}
export const joinStandards = (list) => list.map((x) => [x.code, x.text].filter(Boolean).join(' ')).join('\n');

// 제목 칸 → 과목: "과학과 교수학습 및 평가 운영계획" → 과학, "실과과 …" → 실과, "디지털온 교수학습 …" → 디지털온
function subjectFromTitle(t) {
  const m = String(t).replace(/\s+/g, ' ').trim().match(/^(?:\d{4}\s*학년도\s*)?(.+?)\s*(교수\s*·?\s*학습|평가\s*(?:운영\s*)?계획)/);
  if (!m) return '';
  let s = m[1].replace(/[\s·]+$/, '');
  if (s.endsWith('과') && !KNOWN_SUBJECTS.includes(s)) s = s.slice(0, -1);
  return s.trim();
}
// 단원명 칸: 첫 줄 = 단원명, 나머지(▪ …) = 교수학습 내용
function splitUnit(text) {
  const lines = String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return { unit: '', content: '' };
  const first = lines[0].startsWith('▪') ? '' : lines.shift();
  return { unit: first, content: lines.map((x) => x.replace(/^[▪•·○◦\-]\s*/, '')).join('\n') };
}
const sameLevels = (a, b) => a.length === b.length && a.every((x, i) => x.replace(/\s/g, '') === b[i].replace(/\s/g, ''));
export const matchScale = (levels, scales) => Object.keys(scales).find((k) => sameLevels(scales[k], levels)) || '';

export function parseEvalPlans(src) {
  const out = [];
  const push = (o) => {
    const list = splitStandards(o.standard, o.code);
    const subject = String(o.subject || '').trim();
    if (!subject || !(list.length || o.element || o.area || o.unit)) return;
    const rec = { subject, area: (o.area || '').trim(), unit: (o.unit || '').trim(), code: list.map((x) => x.code).filter(Boolean).join(' '), standard: joinStandards(list),
      element: (o.element || '').trim(), method: (o.method || '').trim(), timing: (o.timing || '').trim() };
    for (const k of ['grade', 'semester', 'content']) if (o[k]) rec[k] = o[k];
    if (o.levels?.length >= 2) { rec.levels = o.levels; rec.rubric = o.rubric || {}; }
    out.push(rec);
  };
  for (const table of src.tables) {
    let map = null;
    let last = {};
    const meta = {};
    let block = null;
    const flush = () => { if (block) push(block); block = null; };
    for (const row of table) {
      const raw = row.map((c) => String(c || '').trim());
      const cells = raw.map((c) => c.replace(/\s+/g, ' '));
      if (!map) {
        // 머리글 전: 제목·학년·학기
        for (const c of new Set(cells)) {
          if (!meta.subject && subjectFromTitle(c)) meta.subject = subjectFromTitle(c);
          if (!meta.grade && /^[1-6]\s*학년$/.test(c)) meta.grade = c.replace(/\s/g, '');
          const sm = c.match(/([12])\s*학기/);
          if (!meta.semester && sm) meta.semester = `${sm[1]}학기`;
        }
      }
      // 머리글 줄: 칸 범위(병합 포함)까지 기억
      const cand = {};
      cells.forEach((c, i) => { for (const [k, re] of Object.entries(EV_COLS)) if (re.test(c) && (cand[k] === undefined || cand[k][1] === i - 1)) cand[k] = cand[k] ? [cand[k][0], i] : [i, i]; });
      if (cand.standard && Object.keys(cand).length >= 2) { flush(); map = cand; last = {}; continue; }
      if (!map) {
        if (cells.length >= 3 && CODE_RE.test(cells.join(' '))) push({ subject: cells[0], area: cells[1], standard: raw[2], timing: cells[3], method: cells[4] });
        continue;
      }
      const vals = (k) => (map[k] ? [...new Set(raw.slice(map[k][0], map[k][1] + 1).filter(Boolean))] : []);
      const get = (k) => (k === 'standard' ? (vals(k).find((v) => CODE_RE.test(v)) ?? vals(k).at(-1) ?? '') : vals(k)[0] ?? '');
      if (new Set(cells.filter(Boolean)).size <= 1 && !map.levels) continue;
      if (/^▶|총\s*횟수|^※/.test(cells.find(Boolean) || '')) { flush(); continue; }
      const { unit, content } = splitUnit(get('unit'));
      const o = { subject: get('subject') || last.subject || meta.subject, grade: meta.grade, semester: meta.semester, area: get('area') || (map.levels ? '' : last.area),
        unit, content, standard: get('standard'), element: get('element'), method: get('method'), timing: get('timing') || (map.levels ? '' : last.timing) };
      if (map.levels) {
        const lv = vals('levels');
        const name = lv[0] && lv[0].length <= 10 ? lv[0].replace(/\s+/g, ' ') : '';
        const desc = lv.length > 1 ? lv.at(-1) : '';
        const key = [o.timing, unit, o.element, o.standard].join('|');
        if (!key.replace(/\|/g, '')) continue;
        if (!block || block._key !== key || (name && block.levels.includes(name))) { flush(); block = { ...o, _key: key, levels: [], rubric: {} }; }
        if (name) { block.levels.push(name); if (desc && desc !== name) block.rubric[name] = desc.replace(/\s+/g, ' '); }
        continue;
      }
      if (!o.standard && !o.element) continue;
      last = o;
      push(o);
    }
    flush();
  }
  for (const line of src.lines) {
    const p = line.split('|').map((x) => x.trim());
    if (p.length >= 3) push({ subject: p[0], area: p[1], standard: p[2], timing: p[3], method: p[4] });
  }
  return out;
}

// ---------- 성취기준 목록 인식 (교육과정 문서·평가계획 붙여넣기) ----------
//   [코드] 문장 줄 → 성취기준, 코드 없는 짧은 줄 → 그 아래 성취기준의 영역 이름
const CODE_SUBJECT = { 국: '국어', 수: '수학', 사: '사회', 과: '과학', 영: '영어', 도: '도덕', 실: '실과', 체: '체육', 음: '음악', 미: '미술', 바: '바른 생활', 슬: '슬기로운 생활', 즐: '즐거운 생활' };
export const subjectOfCode = (code) => { const m = String(code).match(/\d{1,2}([가-힣]{1,3})\d/); return m ? CODE_SUBJECT[m[1]] || '' : ''; };
export const bandOfCode = (code) => ({ 2: '1~2학년', 4: '3~4학년', 6: '5~6학년' }[String(code).match(/\[?(\d)/)?.[1]] || '');

export function parseStandards(src, defaults = {}) {
  const lines = [];
  for (const table of src.tables) for (const row of table) {
    let prev = null;
    for (const c of row) { if (c && c !== prev) lines.push(...String(c).split('\n')); prev = c; }
  }
  lines.push(...src.lines);
  const items = [];
  let area = defaults.area || '';
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (!CODE_RE.test(line)) {
      // 영역 머리: "(1) 물질", "[물질]", "가. 듣기·말하기", "영역: 물질" 처럼 짧은 줄
      const head = line.replace(/^(\(\d+\)|\d+[.)]|[가-하][.)]|[①-⑳]|영역\s*[:：])\s*/, '').replace(/^\[(.+)\]$/, '$1').trim();
      if (head.length >= 2 && head.length <= 24 && !/[.。]$/.test(head) && !/(있다|한다|이다)$/.test(head)) area = head;
      else if (items.length && !/^[▪•※]/.test(line) && line.length > 24) items.at(-1).text = `${items.at(-1).text} ${line}`;
      continue;
    }
    for (const st of splitStandards(line)) if (st.code) items.push({ area, code: st.code, text: st.text });
  }
  const seen = new Set();
  const groups = new Map();
  for (const it of items) {
    if (seen.has(it.code)) continue;
    seen.add(it.code);
    const subject = defaults.subject || subjectOfCode(it.code) || '';
    const band = bandOfCode(it.code) || defaults.band || '';
    const k = `${subject}|${band}`;
    if (!groups.has(k)) groups.set(k, { subject, band, items: [] });
    groups.get(k).items.push(it);
  }
  return [...groups.values()];
}

// ---------- 💰 예산 엑셀(편성표·세부산출내역) → 예산 입력 줄 ----------
//   머리글 줄을 찾아 칸을 맞춤: 세부사업·세부항목·비목(원가통계비목)·산출내역·산출식·금액·비고
//   사업명은 아래로 이어 쓰고(병합 셀·빈칸), 합계·소계 줄은 건너뜀. '(단위: 천원)'이면 1,000을 곱함
const BCOLS = {
  group: /^(정\s*책\s*사\s*업(명)?)$/,
  unit: /^(단\s*위\s*사\s*업(명)?)$/,
  program: /^(세부\s*사업(명)?|사업\s*명|공모\s*사업(명)?|사업)$/,
  item: /^(세부\s*항목|항\s*목(명)?|품\s*명|내\s*역\s*사업|세세\s*항목)$/,
  category: /(비\s*목|통\s*계\s*목|원가\s*통계)/,
  detail: /^(산출\s*(내역|근거|기초)|세부\s*산출\s*(내역|근거)|내\s*용|적\s*요)$/,
  formula: /^(산출\s*식|계산\s*식|수\s*식)$/,
  amount: /^(금\s*액|예\s*산\s*(액|금액)?|편\s*성\s*(액|금액)|배\s*정\s*액|본\s*예\s*산|계)(\s*\(.*\))?$/,
  spent: /^(집\s*행\s*(액|금액)?|지\s*출\s*(액|금액)|누계\s*집행(액)?|집행\s*누계)(\s*\(.*\))?$/,
  note: /^(비\s*고|협\s*의)$/,
};
// 합계·소계 줄: '[ 세 부 항 목 소 계 ]'처럼 글자 사이 띄어쓰기·괄호가 있어도 알아봄
export const isSubtotalLabel = (x) => { const t = String(x || '').replace(/[\s\[\]()<>【】]/g, ''); return /^(총?합계|소계|총계|계|합)$/.test(t) || /(소계|합계|총계)$/.test(t); };
const TOTAL_RE = /^(총?\s*합\s*계|소\s*계|총\s*계|계|합)$/;
const num = (s) => { const t = String(s ?? '').replace(/[,\s원₩]/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };

export function parseBudgetSheet(src, evalFn = () => null) {
  const out = [];
  for (const table of src.tables) {
    let map = null;
    let unit = 1;
    let lastProgram = '';
    let lastGroup = '';
    let lastUnit = '';
    for (const row of table) {
      const cells = row.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
      if (cells.some((c) => /단위\s*[:：]?\s*천\s*원/.test(c))) unit = 1000;
      const cand = {};
      cells.forEach((c, i) => { const k = c.replace(/\s*\((천?원)\)\s*$/, ''); for (const [key, re] of Object.entries(BCOLS)) if (cand[key] === undefined && re.test(k)) { cand[key] = i; if (/천\s*원/.test(c)) unit = 1000; } });
      if (cand.amount !== undefined && ['program', 'item', 'category', 'detail'].some((k) => cand[k] !== undefined)) { map = cand; lastProgram = ''; lastGroup = ''; lastUnit = ''; continue; }
      if (!map || !cells.some(Boolean)) continue;
      const get = (k) => (map[k] !== undefined ? cells[map[k]] || '' : '');
      const labels = [get('group'), get('unit'), get('program'), get('item'), get('category'), get('detail')];
      if (labels.some((x) => TOTAL_RE.test(x.replace(/\s/g, '')) || isSubtotalLabel(x))) continue;
      const program = get('program') || lastProgram;
      if (get('program')) lastProgram = get('program');
      if (get('group')) lastGroup = get('group');
      if (get('unit')) lastUnit = get('unit');
      let amount = num(get('amount'));
      let formula = get('formula');
      const detail = get('detail');
      if (!formula && detail && /\d\s*[×xX*✕]\s*\d|\d[^\d\s]*\s*[×xX*✕]/.test(detail)) {
        const v = evalFn(detail);
        if (v !== null && (amount === null || Math.abs(v - amount * unit) < 1)) formula = detail;
      }
      if (amount === null && formula) amount = evalFn(formula) !== null ? evalFn(formula) / unit : null;
      if (amount === null) continue; // 금액 없는 줄 = 사업 제목·설명 줄
      if (!get('item') && !get('category') && !detail && !formula) continue; // 사업 합계 줄
      const spent = num(get('spent'));
      out.push({ program, item: get('item'), category: get('category'), detail: formula === detail ? '' : detail, formula, amount: Math.round(amount * unit), note: get('note'),
        ...(spent !== null ? { spent: Math.round(spent * unit) } : {}), ...(lastGroup ? { group: lastGroup } : {}), ...(lastUnit ? { unit: lastUnit } : {}) });
    }
  }
  return out;
}
