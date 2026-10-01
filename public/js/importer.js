// 기존 구글 시트(.xlsx 로 내려받은 파일) → 웹앱 기록으로 변환
// 브라우저와 Node(테스트) 양쪽에서 사용. XLSX(SheetJS) 객체를 인자로 받음.
//
// 원칙
//  - 시트 이름이 달라도 내용(머리글)으로 형식을 찾음
//  - 모양이 불규칙한 시트는 '자유 표'로 그대로 옮김 → 빠지는 정보 없음
//  - 어떤 규칙에도 쓰이지 않은 칸은 warnings 로 알려줌

const HOLIDAY = /신정|설날|설 연휴|추석|삼일절|3·1절|어린이날|부처님|석가|현충일|광복절|개천절|한글날|성탄|크리스마스|대체\s*휴일|대체공휴일|연휴|선거일/;
const BULLET = /^\s*[•·▪◦‣∙]\s*/;

const pad = (n) => String(n).padStart(2, '0');

// 엑셀 날짜 일련번호 → {y,m,d} (시간대 영향 없이 계산)
function serialToYMD(serial) {
  const ms = Math.round((serial - 25569) * 86400) * 1000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

class Sheet {
  constructor(XLSX, ws, name) {
    this.X = XLSX;
    this.ws = ws;
    this.name = name;
    const ref = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    this.maxR = ref.e.r;
    this.maxC = ref.e.c;
    this.used = new Set();
    this.mergeOf = new Map();
    this.merges = ws['!merges'] || [];
    for (const m of this.merges) {
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) this.mergeOf.set(`${r},${c}`, m);
    }
  }

  raw(r, c) {
    return this.ws[this.X.utils.encode_cell({ r, c })];
  }

  // 값: string | number | boolean | {ymd} | null. merged=true 면 병합 칸의 대표값
  get(r, c, merged = false) {
    let rr = r, cc = c;
    if (merged) {
      const m = this.mergeOf.get(`${r},${c}`);
      if (m) { rr = m.s.r; cc = m.s.c; }
    }
    const cell = this.raw(rr, cc);
    if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return null;
    this.used.add(`${rr},${cc}`);
    if (cell.t === 'n' && cell.z && this.X.SSF.is_date(cell.z)) return { ymd: serialToYMD(cell.v), fmt: String(cell.z), w: cell.w };
    if (cell.t === 's' && !String(cell.v).trim()) return null;
    return cell.v;
  }

  link(r, c) {
    const cell = this.raw(r, c);
    return cell?.l?.Target || null;
  }

  // 줄 위치를 보존한 글자 (앞뒤 빈 줄을 지우지 않음 — 담당·장소 줄 맞춤용)
  lines(r, c) {
    const v = this.get(r, c);
    return typeof v === 'string' ? v.replace(/\r/g, '') : toText(v);
  }

  // 사람이 읽는 글자. 날짜로 잘못 바뀐 학급명(1-1 → 1월 1일)은 '1-1' 로 되돌림
  text(r, c, merged = false) {
    return toText(this.get(r, c, merged));
  }

  isDate(v) {
    return v && typeof v === 'object' && v.ymd;
  }

  findCell(pred, rowFrom = 0) {
    for (let r = rowFrom; r <= this.maxR; r++) {
      for (let c = 0; c <= this.maxC; c++) {
        const cell = this.raw(r, c);
        if (cell && cell.v !== undefined && pred(String(cell.v).trim(), r, c)) return { r, c };
      }
    }
    return null;
  }

  leftovers() {
    const out = [];
    for (let r = 0; r <= this.maxR; r++) {
      for (let c = 0; c <= this.maxC; c++) {
        const cell = this.raw(r, c);
        if (!cell || cell.v === undefined || cell.v === null || String(cell.v).trim() === '') continue;
        if (cell.f && cell.t !== 's' && cell.t !== 'b') continue; // 계산식 결과(합계 등)는 제외
        if (cell.v === false) continue; // 빈 체크박스
        if (!this.used.has(`${r},${c}`)) out.push({ cell: this.X.utils.encode_cell({ r, c }), value: String(cell.v).slice(0, 40) });
      }
    }
    return out;
  }
}

function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.ymd) {
    // '1-1' 처럼 입력한 학급명은 시트가 날짜(m-d 서식)로 바꿔 저장함 → 원래 글자로 복원
    if (/^m+-d+$/i.test(v.fmt || '')) return `${v.ymd.m}-${v.ymd.d}`;
    return v.w || `${v.ymd.m}/${v.ymd.d}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'TRUE' : '';
  return String(v).replace(/\r/g, '').trim();
}

const ymdStr = (o) => `${o.y}-${pad(o.m)}-${pad(o.d)}`;

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,원\s]/g, ''));
    return Number.isFinite(n) && v.trim() !== '' ? n : null;
  }
  return null;
}

// 제목으로 학사일정 색 분류 추정 (docs/03_재구조화_설계.md 2장)
export function eventCategory(title) {
  if (HOLIDAY.test(title) || /재량휴업|휴업일|방학(?!식)/.test(title)) return '휴일·방학';
  if (/대회|대표선발|출전/.test(title)) return '대회출전';
  if (/수업공개|공개수업|자율장학|동료장학/.test(title)) return '동료장학';
  if (/SW·AI|SW ?AI|국악|무용|연극|뮤지컬|인형극|음악 ?줄넘기/.test(title)) return '특별수업';
  if (/회의|협의회|위원회/.test(title)) return '회의';
  if (/연수|워크숍/.test(title)) return '연수';
  if (/\d-\d/.test(title) && /교시/.test(title)) return '학급수업';
  return '전체행사';
}

// ---------------- 시트별 변환기 ----------------

// 월별교육활동: 한 달 = 6칸 묶음 (일/요일/학교 행사/담당자/비고(장소)/출장명)
function parseMonthly(s, out) {
  const blocks = [];
  for (let r = 0; r <= Math.min(s.maxR, 10); r++) {
    for (let c = 0; c <= s.maxC; c++) {
      if (toText(s.raw(r, c)?.v) === '일' && toText(s.raw(r, c + 1)?.v) === '요일' && /행사/.test(toText(s.raw(r, c + 2)?.v))) blocks.push({ hr: r, c });
    }
  }
  for (const { hr, c } of blocks) {
    for (let k = 0; k < 6; k++) s.get(hr, c + k);
    s.get(hr - 2, c, true); // '9월 교육활동(행사) 일정' 제목
    let cur = null;
    let ym = null;
    const noteLines = [];
    let schoolDays = '';
    for (let r = hr + 1; r <= s.maxR; r++) {
      const v = s.get(r, c);
      if (s.isDate(v)) { cur = v.ymd; ym = { y: cur.y, m: cur.m }; }
      else if (typeof v === 'number' && ym && v >= 1 && v <= 31) cur = { y: ym.y, m: ym.m, d: v };
      else if (typeof v === 'string') {
        const t = v.trim();
        if (/수업일수/.test(t)) { const m = t.match(/(\d+)\s*일/); schoolDays = m ? `${m[1]}일` : ''; break; }
        if (t) noteLines.push(t);
        continue;
      } else if (v === null) {
        if (!s.text(r, c + 2) && !s.text(r, c + 5)) continue;
        if (!cur) continue;
      }
      if (!cur) continue;
      s.get(r, c + 1); // 요일
      const date = ymdStr(cur);
      splitEvents(s.lines(r, c + 2), s.lines(r, c + 3), s.lines(r, c + 4)).forEach((e) => out.push({ module: 'events', data: { date, ...e } }));
      for (const line of s.text(r, c + 5).split('\n').map((x) => x.trim()).filter(Boolean)) {
        const parts = line.split('/').map((x) => x.trim());
        out.push({ module: 'trips', data: { date, kind: '출장', title: line, person: parts.length >= 2 ? parts[1] : '' } });
      }
    }
    if (!ym) continue;
    const head = s.text(hr - 1, c, true);
    const content = [head.split('\n').slice(1).join('\n'), ...noteLines]
      .join('\n').split('\n').map((x) => x.trim()).filter((x) => x && x !== '-').join('\n');
    if (content || schoolDays) out.push({ module: 'notices', data: { title: `${ym.m}월 교육과정 주요 안내`, category: '월별 안내', pinned: true, month: `${ym.y}-${pad(ym.m)}`, dept: '교무', content: content || '-', schoolDays } });
  }
  return blocks.length;
}

// 한 칸에 줄바꿈으로 여러 행사 → 행사별 기록. 담당·장소는 같은 줄 번호로 짝지음
export function splitEvents(text, deptText, placeText) {
  const lines = text.split('\n');
  const events = [];
  lines.forEach((line, i) => {
    if (BULLET.test(line) || events.length === 0) {
      const t = line.replace(BULLET, '').trim();
      events.push({ start: i, lines: t ? [t] : [] });
    } else if (line.trim()) events[events.length - 1].lines.push(line.trim());
  });
  const list = events.filter((e) => e.lines.length);
  if (!list.length) return [];
  const dl = deptText.split('\n').map((x) => x.trim());
  const pl = placeText.split('\n').map((x) => x.trim());
  const starts = new Set(list.map((e) => e.start));
  // 담당/장소 줄이 행사 시작 줄과 어긋나면 확인필요 표시
  const misaligned = [...dl.entries(), ...pl.entries()].some(([i, v]) => v && !starts.has(i) && !list.some((e) => i > e.start && i < e.start + 1 + (e.extra || 0)));
  return list.map((e) => {
    const title = e.lines.join('\n');
    const rec = { title, category: eventCategory(title), dept: dl[e.start] || '', place: pl[e.start] || '' };
    if (list.length === 1) {
      rec.dept = dl.filter(Boolean).join(', ');
      rec.place = pl.filter(Boolean).join(', ');
    } else if (misaligned) {
      rec.review = true;
      rec.note = `원본 담당: ${dl.filter(Boolean).join(', ')} / 장소: ${pl.filter(Boolean).join(', ')}`;
    }
    return rec;
  });
}

// 회의: 날짜 / 안건 / 결과
function parseMeetings(s, out) {
  const h = s.findCell((t) => /회의\s*안건/.test(t));
  if (!h) return 0;
  s.get(h.r, h.c); s.get(h.r, h.c + 1);
  // 머리글 위 제목 칸 → 회의명 (예: '서부초등학교 전체회의(안건 및 결과)' → 전체회의)
  let meeting = '';
  for (let r = 0; r < h.r; r++) for (let c = 0; c <= s.maxC; c++) {
    const t = s.text(r, c);
    const m = t.match(/(\S*회의)/);
    if (m && !meeting) meeting = m[1].replace(/^.*(초등학교|학교)/, '') || '전체회의';
  }
  let date = null;
  let n = 0;
  for (let r = h.r + 1; r <= s.maxR; r++) {
    const d = s.get(r, h.c - 1, true);
    if (s.isDate(d)) date = ymdStr(d.ymd);
    const agenda = s.text(r, h.c);
    const result = s.text(r, h.c + 1);
    if (!agenda && !result) continue;
    if (!date) continue;
    out.push({ module: 'meetings', data: { date, meeting: /월례회의/.test(agenda) ? '월례회의' : meeting || '전체회의', agenda, result, status: /재논의/.test(result) ? '재논의' : '완료' } });
    n++;
  }
  return n;
}

// 링크: 시트 안의 모든 하이퍼링크
function collectLinks(s, out) {
  let n = 0;
  for (let r = 0; r <= s.maxR; r++) {
    for (let c = 0; c <= s.maxC; c++) {
      const url = s.link(r, c);
      if (!url) continue;
      const t = s.text(r, c);
      let label = '';
      for (let cc = c - 1; cc >= 0 && !label; cc--) { if (!s.link(r, cc)) label = s.text(r, cc, true); }
      const title = [label.replace(/\n/g, ' '), t !== url ? t : ''].filter(Boolean).join(' ') || url;
      const category = /폴더|drive\.google/.test(title + url) ? '업무 폴더' : /시트|설문|신청|forms|docs\.google/.test(title + url) ? '신청·설문' : /padlet|에듀|AI/i.test(title + url) ? '에듀테크' : '기타';
      out.push({ module: 'links', data: { category, title, url } });
      n++;
    }
  }
  return n;
}

// 안내사항: 부서 머리글이 한 줄에 나열되고 아래로 안내가 쌓이는 형태
function parseNotices(s, out, lists) {
  collectLinks(s, out);
  let best = null;
  for (let r = 0; r <= s.maxR; r++) {
    let hits = 0;
    for (let c = 0; c <= s.maxC; c++) if (lists.depts.includes(toText(s.raw(r, c)?.v))) hits++;
    if (hits >= 3 && (!best || hits > best.hits)) best = { r, hits };
  }
  if (!best) return 0;
  let n = 0;
  for (let c = 0; c <= s.maxC; c++) {
    const head = s.text(best.r, c, true);
    if (!head) continue;
    if (s.mergeOf.get(`${best.r},${c}`) && s.mergeOf.get(`${best.r},${c}`).s.c !== c) continue;
    const dept = lists.depts.includes(head) ? head : '전체';
    const items = [];
    for (let r = best.r + 1; r <= s.maxR; r++) {
      const m = s.mergeOf.get(`${r},${c}`);
      if (m && m.s.c !== c) continue;
      const t = s.text(r, c);
      if (t) items.push(t);
    }
    // 짧은 항목이 이어지는 목록(예: 학급별 현황)은 하나로 묶음
    const groups = [];
    for (const t of items) {
      if (groups.length && !/^[-ㅇ•·*#]/.test(t) && t.length <= 12 && !t.includes('\n')) groups[groups.length - 1] += `\n${t}`;
      else groups.push(t);
    }
    for (const content of groups) { out.push({ module: 'notices', data: { title: content.split('\n')[0].replace(/^[-ㅇ•·*#\s]+/, '').slice(0, 40), category: dept === '전체' ? '일반' : '부서 안내', dept, content } }); n++; }
  }
  return n;
}

// 시간표: '구분 | 월 | 화 | 수 | 목 | 금' 머리글 아래 1~6교시
function parseTimetables(s, out, sheetName) {
  let n = 0;
  for (let r = 0; r <= s.maxR; r++) {
    for (let c = 0; c <= s.maxC; c++) {
      if (toText(s.raw(r, c)?.v) !== '구분' || toText(s.raw(r, c + 1)?.v) !== '월' || toText(s.raw(r, c + 2)?.v) !== '화') continue;
      const days = [];
      for (let k = 1; k <= 7; k++) {
        const d = toText(s.raw(r, c + k)?.v);
        if (!/^[월화수목금토일](\(.*\))?$/.test(d)) break;
        days.push(d);
        s.get(r, c + k);
      }
      s.get(r, c);
      const title = s.text(r - 1, c, true) || `${sheetName} ${n + 1}`;
      const periods = [];
      const cells = [];
      for (let rr = r + 1; rr <= s.maxR; rr++) {
        const p = s.text(rr, c);
        if (!/교시|점심|아침|방과후/.test(p)) break;
        periods.push(p);
        cells.push(days.map((_, k) => s.text(rr, c + 1 + k)));
      }
      const kind = timetableKind(title);
      out.push({ module: 'timetables', data: { title, kind, semester: '연간', grid: { days, periods, cells } } });
      n++;
    }
  }
  return n;
}

export function timetableKind(title) {
  if (/^\d-\d$|^\d학년|반$/.test(title)) return '학급';
  if (/국악|무용|연극|배달|강사|외부|방과후|프로그램|출강/.test(title)) return '외부강의';
  if (/^(AI\s?교실|과학실|컴퓨터실|체육관|도서관|음악실|미술실|영어체험|특별실)/.test(title)) return '특별실';
  return '전담';
}

// 달력 모양 일정표 (SW·AI, 예술): '📅 2026년 9월' 아래 요일 머리글 + 주별 칸
function parseCalendarPrograms(s, out, defaultProgram) {
  let n = 0;
  for (let r = 0; r <= s.maxR; r++) {
    for (let c = 0; c <= s.maxC; c++) {
      const t = toText(s.raw(r, c)?.v);
      const m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
      if (!m) continue;
      s.get(r, c);
      const y = Number(m[1]);
      const mo = Number(m[2]);
      // 프로그램 이름: 맨 위 머리글(국악/무용/연극…). 학기 표시는 기본값 사용
      const top = s.text(0, c, true);
      const program = top && !/학기|\d{4}\s*년/.test(top) ? top.split('\n')[0] : defaultProgram;
      const hr = r + 1;
      for (let k = 0; k < 7; k++) s.get(hr, c + k);
      for (let w = hr + 1; w <= Math.min(s.maxR, hr + 6); w++) {
        for (let k = 0; k < 7; k++) {
          const v = s.get(w, c + k);
          if (v === null) continue;
          if (typeof v === 'number') continue;
          const lines = toText(v).split('\n');
          const day = parseInt(lines[0], 10);
          const content = lines.slice(1).map((x) => x.trim()).filter(Boolean).join('\n');
          if (!day || !content) continue;
          // 휴일 표시(추석, 개천절 등)는 학사일정에 이미 있으므로 특별수업으로 넣지 않음
          if ((HOLIDAY.test(content) || /휴업|휴일|방학|개천절|한글날|삼일절|현충일|석가|성탄/.test(content)) && !/\d-\d|교시/.test(content)) continue;
          const status = /변경/.test(content) ? '변경' : /취소/.test(content) ? '취소' : '예정';
          out.push({ module: 'programs', data: { program, date: `${y}-${pad(mo)}-${pad(day)}`, content, status } });
          n++;
        }
      }
    }
  }
  return n;
}

// 공모사업: 왼쪽 현황 표 + 오른쪽 공모 안내 목록
function parseContests(s, out) {
  let n = 0;
  const h = s.findCell((t) => t === '공모신청자');
  if (h) {
    for (let k = 0; k < 4; k++) s.get(h.r, h.c + k);
    const t = s.findCell((x) => /공모사업 하고|공모사업.*알려/.test(x));
    if (t) s.get(t.r, t.c);
    for (let r = h.r + 1; r <= s.maxR; r++) {
      const applicant = s.text(r, h.c);
      if (applicant === '계') { s.get(r, h.c); break; }
      const name = s.text(r, h.c + 1);
      if (!applicant && !name) continue;
      out.push({ module: 'contests', data: { applicant, name, grades: s.text(r, h.c + 2), budget: toNumber(s.get(r, h.c + 3)) ?? '' } });
      n++;
    }
  }
  const g = s.findCell((t) => t === '주제');
  if (g) {
    for (let k = 0; k < 5; k++) s.get(g.r, g.c + k);
    const t = s.findCell((x) => /공모사업 목록/.test(x));
    if (t) s.get(t.r, t.c);
    let topic = '';
    for (let r = g.r + 1; r <= s.maxR; r++) {
      const tp = s.text(r, g.c, true);
      if (tp) topic = tp;
      const content = s.text(r, g.c + 1);
      const period = s.text(r, g.c + 2);
      const amtV = s.get(r, g.c + 3);
      const note = s.text(r, g.c + 4);
      if (!content && !period && !note && amtV === null && !tp) continue;
      const amount = typeof amtV === 'number' ? amtV.toLocaleString('ko-KR') : toText(amtV);
      out.push({ module: 'contestInfo', data: { topic, content: content || topic, period, amount, note } });
      n++;
    }
  }
  return n;
}

// 위임전결: '1. 교직원복무' 같은 영역 제목 + 구분/규정/시간/절차 표
function parseRules(s, out) {
  let section = '';
  let n = 0;
  let cols = null;
  for (let r = 0; r <= s.maxR; r++) {
    let first = null;
    for (let c = 0; c <= s.maxC; c++) if (toText(s.raw(r, c)?.v)) { first = c; break; }
    if (first === null) continue;
    const t = s.text(r, first);
    const m = s.mergeOf.get(`${r},${first}`);
    const rowCells = [];
    for (let c = first; c <= s.maxC; c++) rowCells.push(toText(s.raw(r, c)?.v));
    const filled = rowCells.filter(Boolean).length;
    if (t === '구분') { cols = first; for (let c = first; c <= s.maxC; c++) s.get(r, c); continue; }
    if ((/^\d+\.\s*\S/.test(t) || /유의사항/.test(t)) && filled === 1 && !(m && m.e.r > m.s.r)) { section = t; continue; }
    if (!cols && cols !== 0) continue;
    if (section && /유의사항/.test(section)) {
      out.push({ module: 'rules', data: { section, process: t } });
      n++;
      continue;
    }
    const group = s.text(r, cols, true).replace(/\s*\n\s*/g, ' ');
    const rule = s.text(r, cols + 1, true).replace(/\s*\n\s*/g, ' ');
    const detail = s.text(r, cols + 2, true);
    const process = s.text(r, cols + 3, true);
    if (!rule && !detail && !process) continue;
    out.push({ module: 'rules', data: { section, group, rule, detail, process } });
    n++;
  }
  return n;
}

// 운영물품: 이름/품목/단가/수량/금액/링크/수령여부
function parsePurchases(s, out) {
  const h = s.findCell((t, r, c) => t === '이름' && toText(s.raw(r, c + 1)?.v) === '품목');
  if (!h) return 0;
  for (let k = 0; k <= 6; k++) s.get(h.r, h.c + k);
  const titleCell = s.findCell((t) => /[<＜].+[>＞]/.test(t));
  let budget = '';
  if (titleCell) {
    const t = s.text(titleCell.r, titleCell.c);
    budget = (t.match(/[<＜]\s*(.+?)\s*[>＞]/) || [])[1] || '';
    const guide = [];
    for (let r = 0; r < h.r; r++) {
      for (let c = 0; c <= s.maxC; c++) {
        const v = s.raw(r, c);
        if (!v || v.f) continue;
        const tx = s.text(r, c);
        if (tx && !/^총금액$/.test(tx)) guide.push(tx);
      }
    }
    if (guide.length) out.push({ module: 'notices', data: { title: `${budget || '물품'} 신청 안내`, category: '일반', dept: '정보', content: guide.join('\n') } });
  }
  let n = 0;
  for (let r = h.r + 1; r <= s.maxR; r++) {
    const requester = s.text(r, h.c);
    const item = s.text(r, h.c + 1);
    s.get(r, h.c - 1); // 번호
    if (!requester && !item) continue;
    const price = toNumber(s.get(r, h.c + 2));
    const qty = toNumber(s.get(r, h.c + 3));
    const amount = toNumber(s.get(r, h.c + 4));
    const linkText = s.text(r, h.c + 5);
    const link = s.link(r, h.c + 5) || linkText;
    const received = s.get(r, h.c + 6) === true;
    const data = { budget, requester, item, price: price ?? '', qty: qty ?? '', link, received };
    if (amount !== null && price !== null && qty !== null && amount !== price * qty) data.note = `원본 금액 ${amount.toLocaleString('ko-KR')}원 (단가×수량과 다름)`;
    out.push({ module: 'purchases', data });
    n++;
  }
  return n;
}

// 예산: 세부사업/세부항목/비목/산출내역/산출식/금액 …
function parseBudget(s, out) {
  const h = s.findCell((t) => t === '세부사업');
  if (!h) return 0;
  for (let r = h.r; r <= h.r + 1; r++) for (let c = h.c; c <= s.maxC; c++) s.get(r, c);
  let n = 0;
  let prog = '';
  let item = '';
  for (let r = h.r + 2; r <= s.maxR; r++) {
    const vals = [];
    for (let k = 0; k <= 9; k++) vals.push(s.get(r, h.c + k));
    if (vals.every((v) => v === null)) continue;
    const t = vals.map(toText);
    if (t[0]) prog = t[0];
    if (t[1]) item = t[1];
    const amount = toNumber(vals[5]);
    const amount2 = toNumber(vals[8]);
    let note = t[9];
    if (amount2 !== null && amount !== null && amount2 !== amount) note = [note, `항목금액 ${amount2.toLocaleString('ko-KR')}`].filter(Boolean).join(' / ');
    out.push({ module: 'budget', data: { program: prog, item, category: t[2], detail: t[3], formula: t[4], amount: amount ?? t[5], consult: t[6], label: t[7], note } });
    n++;
  }
  return n;
}

// 동료장학: 왼쪽 공개수업 표 + 오른쪽 참관 희망 체크 표
function parseOpenClasses(s, out) {
  const h = s.findCell((t) => t === '수업교사');
  if (!h) return 0;
  const col = (name) => { for (let c = 0; c <= s.maxC; c++) if (toText(s.raw(h.r, c)?.v).replace(/\s/g, '').startsWith(name)) return c; return -1; };
  const C = { group: col('그룹'), date: col('희망일자'), cls: col('학급'), teacher: h.c, subject: col('수업과목'), room: col('수업교실'), pre: col('수업설계'), open: col('수업나눔'), post: col('수업성찰') };
  for (const c of Object.values(C)) if (c >= 0) s.get(h.r, c);
  const recs = [];
  let group = '';
  for (let r = h.r + 1; r <= s.maxR; r++) {
    const teacher = s.text(r, C.teacher);
    if (!teacher) continue;
    const g = C.group >= 0 ? s.text(r, C.group, true) : '';
    if (g) group = g;
    const d = { group: group ? `${group}그룹` : '', openDate: s.text(r, C.open >= 0 ? C.open : C.date) || s.text(r, C.date), className: s.text(r, C.cls), teacher, subject: s.text(r, C.subject), room: s.text(r, C.room), pre: s.text(r, C.pre), post: s.text(r, C.post), observers: [] };
    s.get(r, C.date);
    recs.push(d);
  }
  // 참관 표
  const mt = s.findCell((t) => t.replace(/\s/g, '') === '수업교사', h.r);
  const matrix = mt && mt.c !== h.c ? mt : s.findCell((t, r, c) => t.replace(/\s/g, '') === '수업교사' && c > h.c + 1);
  if (matrix) {
    const lab = (name) => { for (let r = 0; r <= s.maxR; r++) if (toText(s.raw(r, matrix.c)?.v).replace(/\s/g, '').includes(name)) return r; return -1; };
    const rDate = lab('수업공개날짜'), rCls = lab('수업공개반'), rSub = lab('수업과목');
    const rGroup = matrix.r - 1;
    for (const r of [matrix.r, rDate, rCls, rSub, rGroup, 0]) if (r >= 0) s.get(r, matrix.c, true);
    const firstObs = Math.max(matrix.r, rDate, rCls, rSub) + 1;
    for (let c = matrix.c + 2; c <= s.maxC; c++) {
      const teacher = s.text(matrix.r, c);
      if (!teacher) continue;
      s.get(0, c, true);
      let rec = recs.find((x) => x.teacher === teacher && !x._m);
      if (!rec) {
        rec = { group: s.text(rGroup, c, true), teacher, className: rCls >= 0 ? s.text(rCls, c) : '', subject: rSub >= 0 ? s.text(rSub, c) : '', observers: [] };
        recs.push(rec);
      }
      rec._m = true;
      if (rDate >= 0 && s.text(rDate, c)) rec.openDate = s.text(rDate, c).replace(/\s*\n\s*/g, ' ');
      if (rCls >= 0) s.get(rCls, c);
      if (rSub >= 0 && s.text(rSub, c) && rec.subject && !rec.subject.includes('(')) rec.subject = s.text(rSub, c);
      if (!rec.group) rec.group = s.text(rGroup, c, true);
      else s.get(rGroup, c, true);
      for (let r = firstObs; r <= s.maxR; r++) {
        const name = s.text(r, matrix.c + 1);
        s.get(r, matrix.c);
        if (!name) continue;
        if (s.get(r, c) === true) rec.observers.push(name);
      }
    }
  }
  for (const d of recs) {
    delete d._m;
    // '9.22.(화) 2교시' → 날짜 + 교시 (연도는 가져오기 끝에서 채움)
    const m = String(d.openDate || '').match(/(\d{1,2})\s*\.\s*(\d{1,2})/);
    if (m) d._md = [Number(m[1]), Number(m[2])];
    const p = String(d.openDate || '').match(/(\d)\s*교시/);
    if (p) d.period = `${p[1]}교시`;
    out.push({ module: 'openClasses', data: d });
  }
  return recs.length;
}

// 비번및내선: 계정·비밀번호 표 + 출입구 비밀번호 표 + 내선번호 표(2열)
function parseSecretsAndContacts(s, out) {
  let n = 0;
  const h = s.findCell((t, r, c) => t === '아이디' && /비밀번호/.test(toText(s.raw(r, c + 1)?.v)));
  if (h) {
    const c0 = h.c - 2; // 품목
    for (let k = 0; k <= 4; k++) s.get(h.r, c0 + k);
    s.get(h.r - 2, c0, true);
    let cat = '';
    for (let r = h.r + 1; r <= s.maxR; r++) {
      const cv = s.text(r, c0, true);
      if (cv) cat = cv.replace(/\s*\n\s*/g, ' ');
      const site = s.text(r, c0 + 1);
      const account = s.text(r, c0 + 2);
      const password = s.text(r, c0 + 3);
      const note = s.text(r, c0 + 4);
      if (site === '업체명') continue;
      if (!site && !account && !password && !note) continue;
      const links = [s.link(r, c0 + 1), s.link(r, c0 + 4)].filter(Boolean);
      out.push({ module: 'secrets', data: { category: cat, site: site || cat, account, password, note: [note, ...links.filter((l) => !note.includes(l) && !site.includes(l))].filter(Boolean).join(' ') } });
      n++;
    }
  }
  // 출입구 및 잠금장치 (장소 / 비밀번호 / 비고)
  const d = s.findCell((t, r, c) => t === '장소' && /비밀번호/.test(toText(s.raw(r, c + 1)?.v)));
  if (d) {
    for (let k = 0; k <= 2; k++) s.get(d.r, d.c + k);
    const cat = s.text(d.r - 2, d.c, true) || '출입구 및 잠금장치';
    let place = '';
    let wifi = false;
    for (let r = d.r + 1; r <= s.maxR; r++) {
      const a = s.text(r, d.c, true);
      const b = s.text(r, d.c + 1);
      const cc = s.text(r, d.c + 2);
      if (!a && !b && !cc) continue;
      if (b === 'ID' && cc === 'PW') { place = a; wifi = true; continue; }
      if (wifi && a && a !== place && !b && !cc) { place = a; continue; }
      const site = wifi ? place : a || place;
      if (!wifi && a) place = a;
      out.push({ module: 'secrets', data: wifi ? { category: cat, site, account: a !== place ? a : b, password: a !== place ? b : cc, note: a !== place ? cc : '' } : { category: cat, site, password: b, note: cc } });
      n++;
    }
  }
  // 내선번호: 부서명/사용자명/내선번호 (여러 묶음)
  const heads = [];
  for (let r = 0; r <= s.maxR; r++) for (let c = 0; c <= s.maxC; c++) if (toText(s.raw(r, c)?.v) === '부서명' && toText(s.raw(r, c + 1)?.v) === '사용자명') heads.push({ r, c });
  for (const hc of heads) {
    for (let k = 0; k <= 2; k++) s.get(hc.r, hc.c + k);
    s.get(hc.r - 1, hc.c, true);
    let dept = '';
    for (let r = hc.r + 1; r <= s.maxR; r++) {
      const dv = s.text(r, hc.c, true);
      if (dv) dept = dv;
      let name = s.text(r, hc.c + 1, true);
      let phone = s.text(r, hc.c + 2);
      if (!name && !phone) continue;
      if (!phone && /\d{2,}/.test(name)) { phone = name; name = ''; }
      out.push({ module: 'contacts', data: { dept, name, phone } });
      n++;
    }
  }
  return n;
}

// 자유 표: 시트 모양 그대로 (병합 포함)
function parseBoard(s, out, title) {
  let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
  for (let r = 0; r <= s.maxR; r++) {
    for (let c = 0; c <= s.maxC; c++) {
      if (s.get(r, c) === null) continue;
      r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c);
    }
  }
  if (r1 < 0) return 0;
  const rows = [];
  for (let r = r0; r <= r1; r++) {
    const row = [];
    for (let c = c0; c <= c1; c++) {
      const v = s.get(r, c);
      const url = s.link(r, c);
      if (typeof v === 'boolean') row.push(v);
      else {
        const t = toText(v);
        row.push(url && !t.includes(url) ? `${t} ${url}`.trim() : t);
      }
    }
    rows.push(row);
  }
  const merges = s.merges
    .filter((m) => m.s.r >= r0 && m.e.r <= r1 && m.s.c >= c0 && m.e.c <= c1)
    .map((m) => ({ r: m.s.r - r0, c: m.s.c - c0, rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 }));
  // 체크박스 시트에서 빈 칸이 된 FALSE 는 false 로 유지 (체크박스 모양 보존)
  out.push({ module: 'boards', data: { title, rows, merges } });
  return 1;
}

// 시간표 시트 안의 '프로그램 운영' 같은 일반 표 → 자유 표
function parseBoardRegion(s, out, title, r0, c0, r1, c1) {
  const rows = [];
  for (let r = r0; r <= r1; r++) {
    const row = [];
    for (let c = c0; c <= c1; c++) row.push(toText(s.get(r, c)));
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((x) => !x)) rows.pop();
  const merges = s.merges
    .filter((m) => m.s.r >= r0 && m.e.r <= r1 && m.s.c >= c0 && m.e.c <= c1)
    .map((m) => ({ r: m.s.r - r0, c: m.s.c - c0, rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 }));
  out.push({ module: 'boards', data: { title, rows, merges } });
}

// 남은 칸들을 빈 줄 3줄 이상 떨어진 덩어리로 나눠 자유 표로 만듦
function leftoverBoards(s, out, name) {
  const left = s.leftovers().map((l) => s.X.utils.decode_cell(l.cell));
  if (left.length < 2) return 0;
  left.sort((a, b) => a.r - b.r);
  const clusters = [];
  for (const p of left) {
    const last = clusters[clusters.length - 1];
    if (last && p.r - last.r1 <= 3) { last.cells.push(p); last.r1 = Math.max(last.r1, p.r); }
    else clusters.push({ r0: p.r, r1: p.r, cells: [p] });
  }
  let n = 0;
  for (const cl of clusters) {
    const keys = new Set(cl.cells.map((p) => `${p.r},${p.c}`));
    const c0 = Math.min(...cl.cells.map((p) => p.c));
    const c1 = Math.max(...cl.cells.map((p) => p.c));
    const rows = [];
    for (let r = cl.r0; r <= cl.r1; r++) {
      const row = [];
      for (let c = c0; c <= c1; c++) row.push(keys.has(`${r},${c}`) ? toText(s.get(r, c)) : '');
      if (row.some(Boolean)) rows.push(row);
    }
    const title = rows[0].find(Boolean);
    out.push({ module: 'boards', data: { title: `${name} · ${title.split('\n')[0].slice(0, 30)}`, rows, merges: [] } });
    n++;
  }
  return n;
}

// ---------------- 진입점 ----------------

const SENSITIVE = /비번|비밀번호|계정|내선/;

export function parseWorkbook(XLSX, wb, { lists }) {
  const items = [];
  const report = [];
  const warnings = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const s = new Sheet(XLSX, ws, name);
    const before = items.length;
    let how = '';
    const has = (re) => !!s.findCell((t) => re.test(t));
    const isEmpty = !ws['!ref'] || !Object.keys(ws).some((k) => k[0] !== '!' && ws[k].v !== undefined && String(ws[k].v).trim() !== '');

    if (isEmpty) how = '빈 시트 (건너뜀)';
    else if (/달력/.test(name) && has(/VLOOKUP/) === false && !has(/행사/)) {
      how = '학사일정 화면이 자동으로 만들어 주므로 가져오지 않음';
      s.leftovers = () => [];
    } else if (has(/교육활동\(행사\)|학교 행사/) && parseMonthly(s, items)) how = '학사일정 · 출장 · 월별 안내';
    else if (has(/회의\s*안건/) && parseMeetings(s, items)) how = '회의록';
    else if (has(/공모신청자|공모사업 목록/) && parseContests(s, items)) how = '공모사업 · 공모 안내';
    else if (has(/^이름$/) && has(/^품목$/) && parsePurchases(s, items)) how = '물품 신청';
    else if (has(/^세부사업$/) && parseBudget(s, items)) how = '예산';
    else if (has(/^수업교사$/) && has(/수업나눔|참관/) && parseOpenClasses(s, items)) how = '동료장학 (참관 신청 포함)';
    else if (has(/^아이디$/) && has(/^사용자명$|^비밀번호$/) && parseSecretsAndContacts(s, items)) how = '계정·비밀번호 · 내선번호';
    else if (has(/복무|전결/) && has(/^구분$/) && parseRules(s, items)) how = '위임전결';
    else if (has(/📅|\d{4}\s*년\s*\d{1,2}\s*월$/) && parseCalendarPrograms(s, items, /SW|AI/.test(name) ? 'SW·AI' : name.replace(/\s*시간표\s*/, ''))) {
      how = '특별수업';
      if (parseTimetables(s, items, name)) how += ' · 시간표';
    }
    else if (has(/^구분$/) && parseTimetables(s, items, name)) {
      how = '시간표';
      const p = s.findCell((t) => /프로그램 운영/.test(t));
      if (p) { parseBoardRegion(s, items, p ? s.text(p.r, p.c) : name, p.r, p.c, s.maxR, Math.min(s.maxC, p.c + 6)); how += ' · 자유 표(프로그램 운영)'; }
    } else if (has(/주요 사항|업무폴더/) && parseNotices(s, items, lists)) how = '안내사항 · 바로가기';
    else if (parseBoard(s, items, name)) how = '자유 표 (시트 모양 그대로)';

    // 어느 규칙에도 쓰이지 않은 부분은 '자유 표'로 보관 (빠지는 정보 없도록)
    if (how && !how.startsWith('자유 표') && !isEmpty && !/가져오지 않음/.test(how)) {
      const n = leftoverBoards(s, items, name);
      if (n) how += ` · 나머지 ${n}개 영역은 자유 표로 보관`;
    }

    const counts = {};
    for (const it of items.slice(before)) counts[it.module] = (counts[it.module] || 0) + 1;
    report.push({ sheet: name, how, counts });
    const left = s.leftovers();
    if (left.length) {
      const mask = SENSITIVE.test(name);
      warnings.push({ sheet: name, cells: left.map((l) => ({ cell: l.cell, value: mask ? '(숨김)' : l.value })) });
    }
  }
  // 동료장학 공개일: 학사일정에서 추정한 연도로 날짜 완성
  const year = guessYear(wb, items);
  for (const it of items) {
    if (it.module !== 'openClasses') continue;
    const md = it.data._md;
    delete it.data._md;
    if (md) it.data.date = `${md[0] <= 2 ? year + 1 : year}-${pad(md[0])}-${pad(md[1])}`;
  }
  return { items, report, warnings };
}

// 파일 제목·일정에서 연도 추정
export function guessYear(wb, items) {
  const counts = {};
  for (const it of items) if (it.module === 'events') { const y = it.data.date.slice(0, 4); counts[y] = (counts[y] || 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? Number(top[0]) : new Date().getFullYear();
}
