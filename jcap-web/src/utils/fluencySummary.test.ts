import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFluency } from './fluencySummary.ts';
import type { ShadowingFluencyMetrics } from '../types/shadowing.ts';

const base = (over: Partial<ShadowingFluencyMetrics> = {}, cmp: Record<string, unknown> = {}): ShadowingFluencyMetrics => ({
  status: 'available',
  version: 'fluency-metrics/v1',
  pauseCount: 1,
  meanRunMoras: 6,
  reference: { source: 'voicevox', metrics: { status: 'available', version: 'v1', meanRunMoras: 12 } },
  comparison: { status: 'available', articulationRateRatio: 0.95, learnerPauseCount: 1, referencePauseCount: 1, extraPauseCount: 0, ...cmp },
  observations: [],
  ...over,
});

test('không so được với giọng mẫu thì không hiện gì', () => {
  assert.equal(summarizeFluency(null), null);
  assert.equal(summarizeFluency(base({}, { status: 'unavailable', reasonCode: 'CONTENT_BELOW_THRESHOLD' })), null);
  assert.equal(summarizeFluency(base({ status: 'unavailable' })), null);
});

test('nhịp gần bằng mẫu: các ô ở trạng thái bình thường', () => {
  const s = summarizeFluency(base())!;
  assert.deepEqual(s.chips.map((c) => c.label), [
    'Tốc độ: tương đương giọng mẫu',
    'Dừng giữa câu: 1 lần (mẫu: 1)',
    'Nói liền trung bình: 6 âm (mẫu: 12)',
  ]);
  assert.ok(s.chips.every((c) => c.tone === 'neutral'));
});

test('chậm rõ, dừng thừa và ngập ngừng giữa từ được đánh dấu', () => {
  const s = summarizeFluency(base({ observations: [{ code: 'extra_pause', message: 'Bạn dừng 0.8 giây ngay giữa từ 「映画」…' } as never] },
    { articulationRateRatio: 0.6, learnerPauseCount: 3, extraPauseCount: 2, hesitationCount: 1 }))!;
  assert.equal(s.chips[0].label, 'Tốc độ: chậm hơn mẫu 40%');
  assert.equal(s.chips[0].tone, 'warning');
  assert.equal(s.chips[1].tone, 'warning');
  assert.ok(s.chips.some((c) => c.label === 'Ngập ngừng giữa từ: 1 lần'));
  assert.equal(s.notes.length, 1);
});

test('nhanh hơn mẫu chỉ ghi lại, không đánh dấu (người bản xứ thường nhanh hơn VOICEVOX)', () => {
  const chip = summarizeFluency(base({}, { articulationRateRatio: 1.5 }))!.chips[0];
  assert.equal(chip.label, 'Tốc độ: nhanh hơn mẫu 50%');
  assert.equal(chip.tone, 'neutral');
  assert.equal(summarizeFluency(base({}, { articulationRateRatio: 1.1 }))!.chips[0].label, 'Tốc độ: tương đương giọng mẫu');
});
