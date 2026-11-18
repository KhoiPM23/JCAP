import assert from 'node:assert';
import test from 'node:test';
import { isSpeechMicTrackEnabled, startRecognitionOnTrack } from './speechRecognitionStart.ts';

test('Công tắc truyền track mặc định TẮT; chỉ bật khi đặt đúng "1"', () => {
  assert.strictEqual(isSpeechMicTrackEnabled({ getItem: () => null }), false);
  assert.strictEqual(isSpeechMicTrackEnabled({ getItem: () => 'true' }), false);
  assert.strictEqual(isSpeechMicTrackEnabled({ getItem: () => '1' }), true);
  assert.strictEqual(isSpeechMicTrackEnabled(undefined), false);
  assert.strictEqual(
    isSpeechMicTrackEnabled({ getItem: () => { throw new Error('blocked'); } }),
    false,
  );
});

const liveTrack = { kind: 'audio', readyState: 'live' } as const;

function fakeRecognition(behavior: (arg?: unknown) => void = () => {}) {
  const calls: unknown[][] = [];
  return {
    calls,
    start(...args: unknown[]) {
      calls.push(args);
      behavior(args[0]);
    },
  };
}

test('Có track micro đang chạy: truyền track vào start()', () => {
  const rec = fakeRecognition();
  assert.strictEqual(startRecognitionOnTrack(rec, liveTrack), 'track');
  assert.deepStrictEqual(rec.calls, [[liveTrack]]);
});

test('Không có track (mở micro thất bại): start() như cũ', () => {
  const rec = fakeRecognition();
  assert.strictEqual(startRecognitionOnTrack(rec, null), 'default');
  assert.deepStrictEqual(rec.calls, [[]]);
});

test('Track đã dừng: không truyền track chết, start() như cũ', () => {
  const rec = fakeRecognition();
  assert.strictEqual(startRecognitionOnTrack(rec, { kind: 'audio', readyState: 'ended' }), 'default');
  assert.deepStrictEqual(rec.calls, [[]]);
});

test('Track không phải âm thanh: không truyền', () => {
  const rec = fakeRecognition();
  assert.strictEqual(startRecognitionOnTrack(rec, { kind: 'video', readyState: 'live' }), 'default');
  assert.deepStrictEqual(rec.calls, [[]]);
});

test('Trình duyệt không nhận tham số (TypeError): quay về start() không tham số', () => {
  const rec = fakeRecognition((arg) => {
    if (arg !== undefined) throw new TypeError('Failed to execute start: parameter 1 is not of type MediaStreamTrack');
  });
  assert.strictEqual(startRecognitionOnTrack(rec, liveTrack), 'default');
  assert.deepStrictEqual(rec.calls, [[liveTrack], []]);
});

test('Lỗi khác (vd. thiếu quyền) không bị nuốt', () => {
  const rec = fakeRecognition(() => {
    const err = new Error('not allowed');
    (err as Error & { name: string }).name = 'NotAllowedError';
    throw err;
  });
  assert.throws(() => startRecognitionOnTrack(rec, liveTrack), /not allowed/);
});
