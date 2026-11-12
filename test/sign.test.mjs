import test from 'node:test';
import assert from 'node:assert/strict';
import { docHash, docBody, newCode, newPassword, checkInput, checkSignature } from '../public/js/sign-logic.js';

const meeting = { title: '제1회 인사자문위원회 회의록', datetime: '2026. 11. 12. 15:30', place: '교무실', committee: '인사자문위원회', agenda: '1. 업무분장', result: '가결', confirmDate: '2026. 11. 12.', school: '○○초' };
const members = [{ memberId: 'a', ord: 2, role: '위원', position: '교사', name: '김' }, { memberId: 'b', ord: 1, role: '위원장', position: '교감', name: '이' }];

test('문서확인값: 같은 내용이면 같고, 한 글자만 바뀌어도 다름 (위원 순서 반영)', async () => {
  const h1 = await docHash(meeting, members);
  assert.equal(h1, await docHash({ ...meeting }, members.slice().reverse()));
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(h1, await docHash({ ...meeting, result: '부결' }, members));
  assert.notEqual(h1, await docHash(meeting, members.map((m) => (m.memberId === 'a' ? { ...m, name: '박' } : m))));
  assert.ok(docBody(meeting, members).indexOf('"b"') < docBody(meeting, members).indexOf('"a"')); // ord 순
});

test('링크 코드·비밀번호 형식', () => {
  const used = new Set();
  for (let i = 0; i < 200; i++) assert.match(newCode(used), /^[23456789A-HJ-NP-Z]{6}$/);
  assert.equal(used.size, 200);
  for (let i = 0; i < 50; i++) assert.match(newPassword(), /^\d{6}$/);
});

test('입력 확인: 제목·위원·성명 필수, 빈 줄은 빼고 순서 매김', () => {
  assert.match(checkInput({}, [{ name: '김' }]).error, /제목/);
  assert.match(checkInput({ title: 't' }, []).error, /위원/);
  assert.match(checkInput({ title: 't' }, [{ role: '위원' }]).error, /성명/);
  const r = checkInput({ title: '  t  ', agenda: '1. 가\r\n2. 나  ' }, [{ name: ' 김 ' }, { name: '', role: '', position: '' }, { name: '이', role: '간사' }]);
  assert.equal(r.meeting.title, 't'); assert.equal(r.meeting.agenda, '1. 가\n2. 나');
  assert.deepEqual(r.members.map((m) => [m.name, m.ord]), [['김', 1], ['이', 2]]);
});

test('서명 이미지 확인', () => {
  assert.match(checkSignature('javascript:alert(1)'), /올바르지/);
  assert.match(checkSignature('data:image/png;base64,AAAA'), /짧/);
  assert.equal(checkSignature(`data:image/png;base64,${'A'.repeat(2000)}`), '');
  assert.match(checkSignature(`data:image/png;base64,${'A'.repeat(70000)}`), /큽/);
});
