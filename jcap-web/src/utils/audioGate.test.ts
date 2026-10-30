import assert from 'node:assert';
import test from 'node:test';
import { computeGateMetrics, frameRmsFromPcm } from './audioGate.ts';

const repeat = (v: number, n: number) => Array.from({ length: n }, () => v);
// ~3 giây ở 60 khung/giây
const FRAMES = 180;

test('Im lặng số: needs_retry (không phải unmeasured, không phải good)', () => {
  const m = computeGateMetrics(repeat(0, FRAMES), 0, 3000);
  assert.strictEqual(m.gateStatus, 'needs_retry');
  assert.strictEqual(m.isValidForAssessment, false);
  assert.strictEqual(m.isMeasured, true);
});

test('Không có khung nào: needs_retry', () => {
  assert.strictEqual(computeGateMetrics([], 0, 3000).gateStatus, 'needs_retry');
});

test('Giọng nói rõ (có nhịp, có quãng nghỉ): good', () => {
  const frames = [...repeat(0.004, 30), ...repeat(0.12, 100), ...repeat(0.004, 30), ...repeat(0.1, 20)];
  const m = computeGateMetrics(frames, 0, 3000);
  assert.strictEqual(m.gateStatus, 'good');
  assert.strictEqual(m.isValidForAssessment, true);
});

test('Tiếng ồn phẳng không có giọng (RMS ngang nhau): needs_retry vì SNR thấp', () => {
  const m = computeGateMetrics(repeat(0.06, FRAMES), 0, 3000);
  assert.strictEqual(m.gateStatus, 'needs_retry');
  assert.ok(m.snrDb < 6);
});

test('Âm lượng quá nhỏ: needs_retry', () => {
  const m = computeGateMetrics([...repeat(0.001, 90), ...repeat(0.006, 90)], 0, 3000);
  assert.strictEqual(m.gateStatus, 'needs_retry');
});

test('Vỡ tiếng vài chục khung: chỉ cảnh báo (acceptable), vẫn cho chấm', () => {
  const frames = [...repeat(0.004, 30), ...repeat(0.2, 150)];
  const m = computeGateMetrics(frames, 40, 3000); // 40/180 khung vỡ
  assert.strictEqual(m.gateStatus, 'acceptable');
  assert.strictEqual(m.isValidForAssessment, true);
});

test('Vỡ tiếng nặng (> 30% khung): needs_retry', () => {
  const frames = [...repeat(0.004, 30), ...repeat(0.2, 150)];
  assert.strictEqual(computeGateMetrics(frames, 60, 3000).gateStatus, 'needs_retry');
});

test('Giọng nói hơi nhỏ/ồn nhẹ: acceptable', () => {
  const frames = [...repeat(0.004, 40), ...repeat(0.02, 140)]; // SNR ~14 dB nhưng RMS < 0.025
  const m = computeGateMetrics(frames, 0, 3000);
  assert.strictEqual(m.gateStatus, 'acceptable');
});

test('Số đo khoảng lặng chỉ để chẩn đoán và đếm quãng nghỉ dài > 1.2s', () => {
  const frames = [...repeat(0.1, 20), ...repeat(0.001, 80), ...repeat(0.1, 20)];
  const m = computeGateMetrics(frames, 0, 2000);
  assert.strictEqual(m.unnaturalPausesCount, 1);
  assert.ok(m.pauseRatio > 0.5);
});

test('frameRmsFromPcm: PCM lặng cho RMS 0, PCM to đếm khung vỡ tiếng', () => {
  const silent = frameRmsFromPcm(new Float32Array(48000), 48000);
  assert.strictEqual(silent.rmsFrames.length, 60);
  assert.ok(silent.rmsFrames.every((r) => r === 0));

  const loud = frameRmsFromPcm(new Float32Array(48000).fill(0.99), 48000);
  assert.strictEqual(loud.clippingCount, 60);
  assert.ok(loud.rmsFrames[0] > 0.98);
});

// ---- Thông báo rõ nguyên nhân + không phụ thuộc độ dài bản ghi ----

test('Bản ghi quá ngắn: thông báo hướng dẫn nói trọn câu, KHÔNG nói về âm lượng', () => {
  const m = computeGateMetrics(repeat(0.12, 18), 0, 300); // giọng to nhưng chỉ 0.3 giây
  assert.strictEqual(m.gateStatus, 'needs_retry');
  assert.match(m.gateDetail, /nói trọn câu/);
  assert.doesNotMatch(m.gateDetail, /Âm lượng/);
});

test('Mic quá nhỏ: thông báo về âm lượng (không phải độ dài) và ghi mức đo vào volumeDb', () => {
  const m = computeGateMetrics([...repeat(0.001, 90), ...repeat(0.006, 90)], 0, 3000);
  assert.strictEqual(m.gateStatus, 'needs_retry');
  assert.match(m.gateDetail, /Âm lượng mic quá nhỏ/);
  assert.strictEqual(m.volumeDb, -44); // 20·log10(0.006) ≈ -44
  assert.doesNotMatch(m.gateDetail, /nói trọn câu/);
});

test('Bản ghi dài mà nói ít (nhiều khoảng lặng) không bị báo mic nhỏ nhầm', () => {
  // 40 giây, chỉ 2.5 giây là giọng to. Cách tính cũ (trung bình nửa khung to nhất) cho ~0.0075 < 0.008 và chặn nhầm.
  const frames = [...repeat(0.002, 1050), ...repeat(0.05, 150), ...repeat(0.002, 1200)];
  const m = computeGateMetrics(frames, 0, 40000);
  assert.notStrictEqual(m.gateStatus, 'needs_retry');
  assert.ok(m.isValidForAssessment);
  assert.ok(m.volumeRms >= 0.04);
});

test('Mức giọng không đổi khi bản ghi dài thêm khoảng lặng', () => {
  const speech = repeat(0.05, 120);
  const short = computeGateMetrics([...repeat(0.002, 30), ...speech, ...repeat(0.002, 30)], 0, 3000);
  const long = computeGateMetrics([...repeat(0.002, 600), ...speech, ...repeat(0.002, 600)], 0, 20000);
  assert.strictEqual(short.volumeRms, long.volumeRms);
});

test('volumeDb khớp volumeRms (0.1 ≈ -20 dB)', () => {
  const m = computeGateMetrics([...repeat(0.004, 30), ...repeat(0.1, 150)], 0, 3000);
  assert.strictEqual(m.volumeDb, -20);
});
