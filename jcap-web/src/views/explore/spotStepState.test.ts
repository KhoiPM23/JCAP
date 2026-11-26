import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentStep, rowMeta, stepHint, type SpotStepInput } from './spotStepState.ts';

const spot = (over: Partial<SpotStepInput> = {}): SpotStepInput => ({
  stamp: 'none',
  hasLesson: true,
  hasShadowing: true,
  hasRoleplay: false,
  resume: null,
  ...over,
});

test('currentStep: Hiểu, rồi Shadowing, rồi Hội thoại AI', () => {
  assert.equal(currentStep(spot()), 'understand');
  assert.equal(currentStep(spot({ stamp: 'understood' })), 'shadowing');
  assert.equal(currentStep(spot({ stamp: 'stamp', hasRoleplay: true })), 'roleplay');
  assert.equal(currentStep(spot({ stamp: 'stamp' })), null);
  assert.equal(currentStep(spot({ stamp: 'red', hasRoleplay: true })), null);
});

test('currentStep: mốc thiếu nội dung thì không có bước để làm', () => {
  assert.equal(currentStep(spot({ hasLesson: false })), null);
  assert.equal(currentStep(spot({ stamp: 'understood', hasShadowing: false })), null);
});

test('rowMeta: ưu tiên "Tiếp theo", rồi phiên đang dở, rồi phần còn thiếu', () => {
  const resume = { index: 1, total: 8 };
  assert.deepEqual(rowMeta(spot({ resume }), true), { text: 'Tiếp theo', tone: 'next' });
  assert.deepEqual(rowMeta(spot({ resume }), false), { text: 'Câu 2/8', tone: 'progress' });
  assert.deepEqual(rowMeta(spot({ stamp: 'understood' }), false), { text: 'Còn Shadowing', tone: 'muted' });
  assert.deepEqual(rowMeta(spot({ hasShadowing: false }), false), { text: 'Chưa có Shadowing', tone: 'muted' });
  assert.equal(rowMeta(spot(), false), null);
  assert.equal(rowMeta(spot({ stamp: 'stamp', resume }), false), null);
});

test('stepHint: tên bước hiện tại, kèm câu đang dở', () => {
  assert.equal(stepHint(spot()), 'Hiểu câu mẫu');
  assert.equal(stepHint(spot({ stamp: 'understood', resume: { index: 1, total: 8 } })), 'Shadowing, câu 2/8');
  assert.equal(stepHint(spot({ stamp: 'understood', hasShadowing: false })), '');
});
