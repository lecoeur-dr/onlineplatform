// 사용법: node scripts/try-import.mjs <파일.xlsx> [모듈명]
// 가져오기 결과를 미리 확인 (비밀번호는 가림)
import XLSX from 'xlsx';
import { parseWorkbook, guessYear } from '../public/js/importer.js';
import { DEFAULT_LISTS } from '../public/js/modules.js';

const [file, only] = process.argv.slice(2);
const wb = XLSX.readFile(file, { cellNF: true, cellDates: false });
const { items, report, warnings } = parseWorkbook(XLSX, wb, { lists: DEFAULT_LISTS });
console.log('year guess', guessYear(wb, items));
for (const r of report) console.log(`- ${r.sheet}: ${r.how}`, JSON.stringify(r.counts));
console.log('\n남은 칸 경고:');
for (const w of warnings) console.log(`  ${w.sheet}: ${w.cells.length}칸`, w.cells.slice(0, 8).map((c) => `${c.cell}=${c.value}`).join(' | '));
if (only) {
  for (const it of items.filter((i) => i.module === only)) {
    const d = { ...it.data };
    if (only === 'secrets') { d.password = d.password ? '***' : ''; d.account = d.account ? '***' : ''; }
    if (only === 'contacts') d.phone = d.phone ? '***' : '';
    console.log(JSON.stringify(d));
  }
}
