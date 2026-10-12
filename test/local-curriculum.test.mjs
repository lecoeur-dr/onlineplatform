import test from 'node:test';
import assert from 'node:assert/strict';
import { localCurriculumToProgram } from '../public/js/local-curriculum.js';

test('지역교육과정 일정 → 특별수업', () => {
  assert.deepEqual(localCurriculumToProgram('지역교육과정(피아노) 1교시 3-1, 2교시 3-2'), { program: '지역교육과정', activity: '피아노', content: '피아노\n(3-1) 1교시\n(3-2) 2교시' });
  assert.equal(localCurriculumToProgram('지역교육과정(종이접기) 1-2교시 2-1/ 3-4교시 2-2').content, '종이접기\n(2-1) 1-2교시\n(2-2) 3-4교시');
  assert.equal(localCurriculumToProgram('지역교육과정(마술) 1교시 3-1, 2교시 3-2, 3교시 2-1, 4교시 2-2').content.split('\n').length, 5);
  assert.equal(localCurriculumToProgram('지역교육과정(마을선생님) - 플라워 디자인 (1-1) 1-2교시').content, '마을선생님 · 플라워 디자인\n(1-1) 1-2교시');
  assert.equal(localCurriculumToProgram('가을 운동회'), null);
});
