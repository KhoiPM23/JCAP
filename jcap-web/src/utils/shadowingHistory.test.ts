import assert from 'node:assert';
import test from 'node:test';
import {
  fromServerSession,
  isLegacyHistorySession,
  mergeHistory,
  measuredScore,
  normalizeHistoryList,
  normalizeHistorySession,
} from './shadowingHistory.ts';

// Bản ghi lịch sử theo định dạng CŨ (trước khi có scoringVersion, chỉ có các trường thời đó).
const legacyRecord = {
  id: 'abc',
  learnerId: 'u1',
  dialogueId: 7,
  dialogueTitle: 'Lesson',
  role: 'A',
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:02:00.000Z',
  sentenceScores: [80, 90],
  averageScore: 85,
  fluencyScore: 88,
  intonationScore: 85,
  totalSentences: 2,
  completed: true,
};

test('12. Bản ghi cũ thiếu trường mới vẫn đọc được, không bịa giá trị còn thiếu', () => {
  const s = normalizeHistorySession(legacyRecord);

  assert.ok(s);
  assert.strictEqual(s.id, 'abc');
  assert.deepStrictEqual(s.sentenceScores, [80, 90]);
  assert.deepStrictEqual(s.sentenceResults, []); // thiếu → mảng rỗng
  assert.strictEqual(s.scoringVersion, undefined); // không gán phiên bản giả
  assert.strictEqual(s.durationSeconds, undefined); // không gán 120s mặc định
  assert.strictEqual(s.textbookTitle, undefined); // không gán giáo trình mặc định
  assert.strictEqual(isLegacyHistorySession(s), true);
});

test('12b. Bản ghi mới có scoringVersion không bị coi là cũ', () => {
  const s = normalizeHistorySession({ ...legacyRecord, scoringVersion: 'shadowing-score/p1-content-only', fluencyScore: null });
  assert.ok(s);
  assert.strictEqual(isLegacyHistorySession(s), false);
  assert.strictEqual(s.fluencyScore, null);
});

test('12c. Dữ liệu hỏng trong localStorage bị loại, không làm sập danh sách', () => {
  const list = normalizeHistoryList([legacyRecord, null, 'x', { id: 5 }, { id: 'ok', dialogueId: 1 }, 42]);
  assert.deepStrictEqual(list.map((s) => s.id), ['abc', 'ok']);

  assert.deepStrictEqual(normalizeHistoryList(undefined), []);
  assert.deepStrictEqual(normalizeHistoryList({ not: 'an array' }), []);
});

test('sentenceScores/sentenceResults sai kiểu được làm sạch', () => {
  const s = normalizeHistorySession({ ...legacyRecord, sentenceScores: [70, 'x', null, 90], sentenceResults: 'bad' });
  assert.ok(s);
  assert.deepStrictEqual(s.sentenceScores, [70, 90]);
  assert.deepStrictEqual(s.sentenceResults, []);
});

test('measuredScore: chỉ số hữu hạn mới là điểm đo được; thiếu → null (hiển thị "Chưa đo")', () => {
  assert.strictEqual(measuredScore(0), 0); // 0 hợp lệ
  assert.strictEqual(measuredScore(73), 73);
  assert.strictEqual(measuredScore(null), null);
  assert.strictEqual(measuredScore(undefined), null);
  assert.strictEqual(measuredScore(NaN), null);
});

const serverRecord = {
  id: 'srv-1',
  dialogueId: 7,
  dialogueTitle: 'Tại sân bay',
  scenarioTitle: 'Sân bay',
  jlptLevel: 'N5',
  learnerRole: 'A' as const,
  startedAt: '2026-10-18T01:00:00Z',
  completedAt: '2026-10-18T01:05:00Z',
  durationSeconds: 300,
  contentMatchScore: 70,
  fluencyScore: null,
  weightedOverallScore: 70,
  scoringVersion: 'shadowing-score/p2-content-word',
  audioQualityStatus: 'good',
  rankTitle: 'Hạng B - Đạt chuẩn',
  learnerSentenceCount: 3,
  scoredSentenceCount: 2,
  sentences: [
    { evaluationId: 'e1', sentenceId: 11, orderIndex: 0, targetText: 'A1', recognizedText: 'A1', contentMatchScore: 80, overallScore: 80, tier: 'green' as const, feedback: '', scoringVersion: 'v', diffTokens: [], evaluatedAt: '2026-10-18T01:01:00Z' },
    { evaluationId: 'e2', sentenceId: 13, orderIndex: 2, targetText: 'A2', recognizedText: 'A', contentMatchScore: 60, overallScore: 60, tier: 'red' as const, feedback: '', scoringVersion: 'v', diffTokens: [], evaluatedAt: '2026-10-18T01:03:00Z' },
  ],
};

test('Buổi luyện từ backend giữ nguyên điểm backend, fluency chưa đo vẫn là null', () => {
  const s = fromServerSession(serverRecord, 'u1');
  assert.strictEqual(s.id, 'srv-1');
  assert.strictEqual(s.averageScore, 70);
  assert.strictEqual(s.contentMatchScore, 70);
  assert.strictEqual(s.fluencyScore, null);
  assert.deepStrictEqual(s.sentenceScores, [80, 60]);
  assert.strictEqual(s.totalSentences, 3);
  assert.strictEqual(s.sentenceResults?.[1].sentenceId, 13);
  assert.strictEqual(s.sentenceResults?.[1].evaluationTier, 'red');
  assert.strictEqual(isLegacyHistorySession(s), false);
});

test('Ghép lịch sử: backend + bản ghi cũ trong trình duyệt, mới nhất trước, không trùng', () => {
  const server = [fromServerSession(serverRecord, 'u1')];
  const local = normalizeHistoryList([
    { id: 'old', dialogueId: 1, dialogueTitle: 'Cũ', role: 'A', startedAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-01T00:10:00Z', sentenceScores: [50], averageScore: 50, totalSentences: 1, learnerId: 'u1' },
    { id: 'srv-1', dialogueId: 7, dialogueTitle: 'Trùng', role: 'A', startedAt: '2026-10-18T01:00:00Z', completedAt: '2026-10-18T01:05:00Z', sentenceScores: [], averageScore: 0, totalSentences: 0, learnerId: 'u1' },
  ]);
  const merged = mergeHistory(server, local);
  assert.deepStrictEqual(merged.map((s) => s.id), ['srv-1', 'old']);
  assert.strictEqual(merged[0].dialogueTitle, 'Tại sân bay'); // bản backend được ưu tiên
});

