// 🪄 새 학기 자료 가져오기: 한글(HWPX) · 엑셀 · CSV · 붙여넣기 → 학사일정 / 업무분장 자동 인식
//   브라우저 안에서만 읽음 (파일을 서버로 보내지 않음). 인식 결과는 미리보기에서 고친 뒤 저장
import { eventCategory } from './importer.js';

// ---------- 파일 읽기 → { tables: string[][][], lines: string[] } ----------

export async function readSource(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.hwp')) throw new Error('예전 한글 파일(.hwp)은 브라우저에서 읽을 수 없습니다. 한글에서 [파일 → 다른 이름으로 저장 → 파일 형식: HWPX]로 저장해 올리거나, 표를 복사해 아래 붙여넣기 칸에 넣어 주세요.');
  if (name.endsWith('.hwpx')) return readHwpx(await file.arrayBuffer());
  if (/\.(xlsx|xls|xlsm)$/.test(name)) return readXlsx(await file.arrayBuffer());
  if (/\.(csv|tsv|txt)$/.test(name)) return readText(await file.text());
  throw new Error('HWPX, XLSX, CSV, TXT 파일만 읽을 수 있습니다.');
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
//   표: 머리글(교과·영역·성취기준·평가 요소·방법·시기)로 칸 찾기 / 줄글: "과목 | 영역 | 성취기준 | 시기 | 방법"
const EV_COLS = {
  subject: /^(교\s*과|과\s*목|교과목)$/,
  area: /^(영\s*역|단\s*원|영역\s*\(단원\)|단원명|영역·단원)$/,
  standard: /(성취\s*기준)/,
  element: /(평가\s*요소|평가\s*내용)/,
  method: /^(평가\s*방법|방\s*법|평가\s*유형)$/,
  timing: /^(시\s*기|평가\s*시기|월|시행\s*시기)$/,
};
const CODE_RE = /\[(\d{1,2}[가-힣]{1,3}\s?\d{2}-\d{2}(?:-\d{2})?)\]/;

export function parseEvalPlans(src) {
  const out = [];
  const push = (o) => {
    const std = String(o.standard || '').trim();
    const m = std.match(CODE_RE);
    const code = o.code || (m ? `[${m[1].replace(/\s/g, '')}]` : '');
    const standard = m ? std.replace(m[0], '').trim() : std;
    if (!o.subject || !(standard || o.element || o.area)) return;
    out.push({ subject: o.subject.trim(), area: (o.area || '').trim(), code, standard, element: (o.element || '').trim(), method: (o.method || '').trim(), timing: (o.timing || '').trim() });
  };
  for (const table of src.tables) {
    let map = null;
    let last = {};
    for (const row of table) {
      const cells = row.map((c) => String(c || '').replace(/\s+/g, ' ').trim());
      const cand = {};
      cells.forEach((c, i) => { for (const [k, re] of Object.entries(EV_COLS)) if (cand[k] === undefined && re.test(c)) cand[k] = i; });
      if (cand.standard !== undefined && Object.keys(cand).length >= 2) { map = cand; last = {}; continue; }
      if (!map) {
        // 머리글이 없는 붙여넣기: 과목 | 영역 | 성취기준 | 시기 | 방법
        if (cells.length >= 3 && CODE_RE.test(cells.join(' '))) push({ subject: cells[0], area: cells[1], standard: cells[2], timing: cells[3], method: cells[4] });
        continue;
      }
      const get = (k) => (map[k] !== undefined ? cells[map[k]] || '' : '');
      const o = { subject: get('subject') || last.subject, area: get('area') || last.area, standard: get('standard'), element: get('element'), method: get('method'), timing: get('timing') || last.timing };
      if (!o.standard && !o.element) continue;
      last = o;
      push(o);
    }
  }
  for (const line of src.lines) {
    const p = line.split('|').map((x) => x.trim());
    if (p.length >= 3) push({ subject: p[0], area: p[1], standard: p[2], timing: p[3], method: p[4] });
  }
  return out;
}
