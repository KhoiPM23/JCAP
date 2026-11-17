import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isResumableShadowing } from './shadowingContinue.ts';

const p = (status: 'IN_PROGRESS' | 'COMPLETED', done: number, total = 5) => ({ status, completedSentenceCount: done, totalSentenceCount: total });

test('isResumableShadowing: đang học dở thì hiện', () => {
  assert.equal(isResumableShadowing(p('IN_PROGRESS', 1)), true);
  assert.equal(isResumableShadowing(p('IN_PROGRESS', 4)), true);
});

test('isResumableShadowing: chưa học câu nào thì không hiện', () => {
  assert.equal(isResumableShadowing(p('IN_PROGRESS', 0)), false);
});

test('isResumableShadowing: đã xong đủ câu hoặc đã hoàn thành thì không hiện', () => {
  assert.equal(isResumableShadowing(p('IN_PROGRESS', 5)), false);
  assert.equal(isResumableShadowing(p('COMPLETED', 5)), false);
  assert.equal(isResumableShadowing(p('COMPLETED', 2)), false);
});
