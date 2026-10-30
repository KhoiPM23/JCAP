import assert from 'node:assert';
import test from 'node:test';
import { sessionRankTitle, summarizeSessionScores } from './shadowingSessionScores.ts';

type R = Parameters<typeof summarizeSessionScores>[1] extends Map<number, infer V> ? V : never;

const result = (id: number, overall: number, extra: Partial<R> = {}): R => ({
  sentenceId: id,
  orderIndex: id,
  targetText: 't',
  recognizedText: 'r',
  contentMatchScore: overall,
  fluencyScore: null,
  overallScore: overall,
  accuracyScore: overall,
  audioGateStatus: 'unmeasured',
  audioGateLabel: '',
  isValidForBestAttempt: true,
  attemptsCount: 1,
  evaluationTier: overall >= 80 ? 'green' : overall >= 65 ? 'yellow' : 'red',
  ...extra,
} as R);

test('Không có kết quả nào: tất cả 0, fluency null (không bịa)', () => {
  const s = summarizeSessionScores([1, 2], new Map());
  assert.strictEqual(s.overall, 0);
  assert.strictEqual(s.fluency, null);
  assert.strictEqual(s.practicedSentences, 0);
  assert.strictEqual(s.gateStatus, 'unmeasured');
});

test('Trung bình trên TỔNG số câu của vai người học (câu chưa luyện tính 0)', () => {
  const s = summarizeSessionScores([1, 2], new Map([[1, result(1, 100)]]));
  assert.strictEqual(s.overall, 50);
  assert.strictEqual(s.contentMatch, 50);
  assert.strictEqual(s.practicedSentences, 1);
});

test('Fluency vẫn null khi không câu nào đo được; overall = trung bình điểm backend, không áp lại 60/40', () => {
  const s = summarizeSessionScores([1, 2], new Map([[1, result(1, 80)], [2, result(2, 60)]]));
  assert.strictEqual(s.fluency, null);
  assert.strictEqual(s.overall, 70);
});

test('Chỉ tính fluency của câu đã đo', () => {
  const s = summarizeSessionScores(
    [1, 2],
    new Map([[1, result(1, 80, { fluencyScore: 90 })], [2, result(2, 80, { fluencyScore: null })]])
  );
  assert.strictEqual(s.fluency, 45); // 90 / 2 câu
});

test('Câu không hợp lệ bị loại khỏi điểm tổng', () => {
  const s = summarizeSessionScores(
    [1, 2],
    new Map([[1, result(1, 100, { isValidForBestAttempt: false })], [2, result(2, 60)]])
  );
  assert.strictEqual(s.overall, 30);
  assert.strictEqual(s.practicedSentences, 1);
});

test('Tier và cổng âm thanh được tổng hợp từ dữ liệu đã lưu', () => {
  const s = summarizeSessionScores(
    [1, 2, 3],
    new Map([
      [1, result(1, 90, { audioGateStatus: 'good' })],
      [2, result(2, 70, { audioGateStatus: 'acceptable' })],
      [3, result(3, 10, { audioGateStatus: 'good' })],
    ])
  );
  assert.deepStrictEqual([s.greenCount, s.yellowCount, s.redCount], [1, 1, 1]);
  assert.strictEqual(s.gateStatus, 'acceptable');
});

test('Hạng buổi luyện dùng đúng ngưỡng của backend (90/80/65)', () => {
  assert.strictEqual(sessionRankTitle(90), 'Hạng S · Rất xuất sắc');
  assert.strictEqual(sessionRankTitle(89), 'Hạng A · Rất tốt');
  assert.strictEqual(sessionRankTitle(80), 'Hạng A · Rất tốt');
  assert.strictEqual(sessionRankTitle(65), 'Hạng B · Đạt chuẩn');
  assert.strictEqual(sessionRankTitle(64), 'Hạng C · Cần luyện thêm');
});
