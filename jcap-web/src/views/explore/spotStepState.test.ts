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

test('rowMeta: chỉ ghi câu đang dở của mốc chưa có dấu', () => {
  const resume = { index: 1, total: 8 };
  assert.equal(rowMeta(spot({ resume })), 'Câu 2/8');
  assert.equal(rowMeta(spot({ stamp: 'understood', resume })), 'Câu 2/8');
  assert.equal(rowMeta(spot({ stamp: 'understood' })), null);
  assert.equal(rowMeta(spot()), null);
  assert.equal(rowMeta(spot({ stamp: 'stamp', resume })), null);
});

test('stepHint: tên bước hiện tại, kèm câu đang dở', () => {
  assert.equal(stepHint(spot()), 'Hiểu câu mẫu');
  assert.equal(stepHint(spot({ stamp: 'understood', resume: { index: 1, total: 8 } })), 'Shadowing, câu 2/8');
  assert.equal(stepHint(spot({ stamp: 'understood', hasShadowing: false })), '');
});
