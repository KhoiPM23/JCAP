import assert from 'node:assert';
import test from 'node:test';
import { SpeechTranscriptCollector, type SpeechSegmentLike } from './speechTranscriptCollector.ts';

const seg = (transcript: string, isFinal: boolean): SpeechSegmentLike => ({ isFinal, 0: { transcript } });

test('8. Web Speech tự khởi động lại: đoạn đã chốt của phiên trước được giữ lại', () => {
  const c = new SpeechTranscriptCollector();

  const s1 = c.startSession();
  c.handleResult(s1, [seg('ひとりです', true)]);
  c.endSession(s1); // trình duyệt tự kết thúc phiên

  const s2 = c.startSession(); // khởi động lại: event.results bắt đầu lại từ 0
  c.handleResult(s2, [seg('お願いします', true)]);

  assert.strictEqual(c.finalTranscript, 'ひとりですお願いします');
});

test('8b. Phiên mới chưa có kết quả không làm mất đoạn cũ; phiên cũ bị ghi đè snapshot không nhân đôi chữ', () => {
  const c = new SpeechTranscriptCollector();
  const s1 = c.startSession();
  c.handleResult(s1, [seg('こんにちは', true)]);
  c.handleResult(s1, [seg('こんにちは', true)]); // sự kiện lặp
  c.handleResult(s1, [seg('こんにちは', true), seg('です', true)]);
  c.endSession(s1);
  c.endSession(s1); // endSession lặp cũng không commit hai lần

  const s2 = c.startSession();
  assert.strictEqual(c.finalTranscript, 'こんにちはです');
  c.handleResult(s2, []);
  assert.strictEqual(c.finalTranscript, 'こんにちはです');
});

test('9. Kết quả interim không bao giờ nằm trong transcript dùng để chấm', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('ひとり', true), seg('でカウンタ', false)]);

  assert.strictEqual(c.finalTranscript, 'ひとり');
  assert.strictEqual(c.snapshot().transcript, 'ひとり');
});

test('9b. Interim còn sót khi phiên kết thúc bị bỏ, không được coi là đã chốt', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('ひとり', true), seg('です', false)]);
  c.endSession(s);

  assert.strictEqual(c.finalTranscript, 'ひとり');
});

test('Chỉ có interim → snapshot là empty, không phải final', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('ひと', false)]);
  c.endSession(s);

  const snap = c.snapshot();
  assert.strictEqual(snap.status, 'empty');
  assert.strictEqual(snap.transcript, '');
  assert.strictEqual(snap.error, undefined);
});

test('Sự kiện của phiên cũ đến muộn bị bỏ qua', () => {
  const c = new SpeechTranscriptCollector();
  const s1 = c.startSession();
  c.handleResult(s1, [seg('A', true)]);
  c.endSession(s1);
  const s2 = c.startSession();
  c.handleResult(s2, [seg('B', true)]);

  c.handleResult(s1, [seg('XXX', true)]); // đến muộn từ phiên 1
  assert.strictEqual(c.finalTranscript, 'AB');
});

test('Sau lock() các sự kiện đến muộn không ghi đè kết quả đã chốt', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('ひとりです', true)]);
  c.lock();

  c.handleResult(s, [seg('ghi đè', true)]);
  c.handleError(s, 'network');
  const s2 = c.startSession();
  c.handleResult(s2, [seg('mới', true)]);

  assert.strictEqual(c.isLocked, true);
  assert.deepStrictEqual(c.snapshot(), { status: 'final', transcript: 'ひとりです', error: undefined });
});

test('reset() cho phép ghi âm lượt mới và vô hiệu hóa sự kiện của lượt trước', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('cũ', true)]);
  c.lock();
  c.reset();

  c.handleResult(s, [seg('muộn', true)]);
  assert.strictEqual(c.finalTranscript, '');
  const s2 = c.startSession();
  c.handleResult(s2, [seg('mới', true)]);
  assert.strictEqual(c.finalTranscript, 'mới');
});

test('Phân loại trạng thái: unsupported / error / empty', () => {
  const unsupported = new SpeechTranscriptCollector();
  unsupported.markUnsupported();
  assert.strictEqual(unsupported.snapshot().status, 'unsupported');

  const errored = new SpeechTranscriptCollector();
  const s = errored.startSession();
  errored.handleError(s, 'network');
  errored.endSession(s);
  assert.deepStrictEqual(errored.snapshot(), { status: 'error', transcript: '', error: 'network' });

  const quiet = new SpeechTranscriptCollector();
  const q = quiet.startSession();
  quiet.handleError(q, 'no-speech'); // im lặng không phải lỗi
  quiet.endSession(q);
  assert.strictEqual(quiet.snapshot().status, 'empty');
});

test('Lỗi nghiêm trọng (not-allowed) được nhận diện để không tự khởi động lại vô ích', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleError(s, 'not-allowed');
  assert.strictEqual(c.hasFatalError, true);

  const n = new SpeechTranscriptCollector();
  const s2 = n.startSession();
  n.handleError(s2, 'network');
  assert.strictEqual(n.hasFatalError, false);
});

test('Có transcript đã chốt thì vẫn là final dù về sau gặp lỗi', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('ひとりです', true)]);
  c.handleError(s, 'network');
  c.endSession(s);

  const snap = c.snapshot();
  assert.strictEqual(snap.status, 'final');
  assert.strictEqual(snap.transcript, 'ひとりです');
});

test('whenSettled: chờ theo sự kiện onend thay vì độ trễ cố định', async () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('こんにちは', true)]);
  c.requestStop();

  const pending = c.whenSettled(2000);
  setTimeout(() => c.endSession(s), 20); // onend đến sau khi bấm dừng
  const outcome = await pending;

  assert.strictEqual(outcome, 'settled');
  assert.strictEqual(c.finalTranscript, 'こんにちは');
});

test('whenSettled: có chặn trên khi onend không bao giờ đến', async () => {
  const c = new SpeechTranscriptCollector();
  c.startSession();
  const started = Date.now();
  const outcome = await c.whenSettled(60);

  assert.strictEqual(outcome, 'timeout');
  assert.ok(Date.now() - started < 1000);
});

test('whenSettled: trả về ngay khi không có phiên nào đang chạy', async () => {
  const c = new SpeechTranscriptCollector();
  assert.strictEqual(await c.whenSettled(5000), 'settled');
});

test('Phiên cuối còn đang chạy khi lock(): đoạn đã chốt vẫn được giữ', () => {
  const c = new SpeechTranscriptCollector();
  const s = c.startSession();
  c.handleResult(s, [seg('ひとりです', true), seg('そして', false)]);
  c.lock();

  assert.strictEqual(c.snapshot().transcript, 'ひとりです');
});
