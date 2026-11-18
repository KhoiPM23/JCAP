import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverToLocalProgress, suggestedIndexFromLocal } from './shadowingProgressSync.ts';
import type { ShadowingServerProgress } from '../types/shadowing';
import type { ShadowingProgress } from '../types/shadowingProgress';

const server = (over: Partial<ShadowingServerProgress> = {}): ShadowingServerProgress => ({
  id: 'p-1',
  dialogueId: 7,
  dialogueTitle: 'Sân bay',
  jlptLevel: 'N5',
  learnerRole: 'B',
  status: 'in_progress',
  currentSentenceIndex: 3,
  currentSentenceText: 'パスポートを見せてください',
  totalSentenceCount: 8,
  learnerSentenceCount: 4,
  evaluatedSentenceCount: 1,
  startedAt: '2026-11-12T01:00:00Z',
  lastActivityAt: '2026-11-12T01:05:00Z',
  created: false,
  sentences: [],
  ...over,
});

test('phiên đang luyện ở server → bản ghi localStorage cùng định dạng cũ', () => {
  const local = serverToLocalProgress(server(), 'u1', { scenarioTitle: 'Du lịch' })!;
  assert.equal(local.sessionId, 'p-1');
  assert.equal(local.status, 'IN_PROGRESS');
  assert.equal(local.role, 'B');
  assert.equal(local.currentSentenceIndex, 3);
  assert.equal(local.completedSentenceCount, 3);
  assert.equal(local.totalSentenceCount, 8);
  assert.equal(local.jlptLevel, 'N5');
  assert.equal(local.scenarioTitle, 'Du lịch');
  assert.equal(local.lastPracticedAt, '2026-11-12T01:05:00Z');
  assert.equal('completedAt' in local, false);
});

test('không ghi đè thông tin cũ bằng undefined (vd. tiêu đề chương không có trong dữ liệu server)', () => {
  const local = serverToLocalProgress(server({ dialogueTitle: '', currentSentenceText: '' }), 'u1')!;
  assert.equal('chapterTitle' in local, false);
  assert.equal('dialogueTitle' in local, false);
  assert.equal('currentSentenceText' in local, false);
});

test('phiên đã hoàn thành → COMPLETED đủ câu; phiên đã bỏ → không ghi', () => {
  const done = serverToLocalProgress(server({ status: 'completed', completedAt: '2026-11-12T02:00:00Z' }), 'u1')!;
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.completedSentenceCount, 8);
  assert.equal(done.currentSentenceIndex, 7);
  assert.equal(done.completedAt, '2026-11-12T02:00:00Z');
  assert.equal(serverToLocalProgress(server({ status: 'abandoned' }), 'u1'), null);
});

const local = (over: Partial<ShadowingProgress> = {}): ShadowingProgress => ({
  learnerId: 'u1', dialogueId: 7, role: 'A', status: 'IN_PROGRESS', currentSentenceIndex: 4,
  completedSentenceCount: 4, totalSentenceCount: 8, startedAt: '', lastPracticedAt: '', ...over,
});

test('chỉ gợi ý vị trí từ localStorage khi đang luyện dở đúng vai', () => {
  assert.equal(suggestedIndexFromLocal(local(), 'A'), 4);
  assert.equal(suggestedIndexFromLocal(local(), 'B'), undefined);
  assert.equal(suggestedIndexFromLocal(local({ status: 'COMPLETED' }), 'A'), undefined);
  assert.equal(suggestedIndexFromLocal(local({ currentSentenceIndex: 0 }), 'A'), undefined);
  assert.equal(suggestedIndexFromLocal(null, 'A'), undefined);
});
