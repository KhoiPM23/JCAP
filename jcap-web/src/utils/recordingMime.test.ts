import assert from 'node:assert';
import test from 'node:test';
import {
  baseMimeType,
  fileExtensionForMime,
  pickRecordingMimeType,
  resolveRecordedMime,
} from './recordingMime.ts';

test('10. Chrome/Edge: chọn webm;codecs=opus', () => {
  const mime = pickRecordingMimeType((t) => t.startsWith('audio/webm'));
  assert.strictEqual(mime, 'audio/webm;codecs=opus');
});

test('10b. Safari chỉ hỗ trợ mp4: không gắn nhãn webm', () => {
  const mime = pickRecordingMimeType((t) => t === 'audio/mp4');
  assert.strictEqual(mime, 'audio/mp4');
  assert.strictEqual(fileExtensionForMime(mime), 'm4a');
});

test('10c. Firefox: ogg', () => {
  assert.strictEqual(pickRecordingMimeType((t) => t.startsWith('audio/ogg')), 'audio/ogg;codecs=opus');
});

test('Không có MIME nào được hỗ trợ → undefined (để trình duyệt tự chọn), không đoán', () => {
  assert.strictEqual(pickRecordingMimeType(() => false), undefined);
  assert.strictEqual(pickRecordingMimeType(undefined), undefined);
});

test('isTypeSupported ném lỗi không làm hỏng việc chọn', () => {
  const mime = pickRecordingMimeType((t) => {
    if (t === 'audio/webm;codecs=opus') throw new Error('boom');
    return t === 'audio/webm';
  });
  assert.strictEqual(mime, 'audio/webm');
});

test('resolveRecordedMime: ưu tiên MIME thực recorder báo cáo, không mặc định audio/webm', () => {
  assert.strictEqual(resolveRecordedMime('audio/mp4', 'audio/webm'), 'audio/mp4');
  assert.strictEqual(resolveRecordedMime('', 'audio/ogg;codecs=opus'), 'audio/ogg;codecs=opus');
  assert.strictEqual(resolveRecordedMime(undefined, undefined), '');
});

test('baseMimeType và phần mở rộng tệp', () => {
  assert.strictEqual(baseMimeType('Audio/WebM; codecs=opus'), 'audio/webm');
  assert.strictEqual(baseMimeType(''), '');
  assert.strictEqual(fileExtensionForMime('audio/webm;codecs=opus'), 'webm');
  assert.strictEqual(fileExtensionForMime('audio/ogg'), 'ogg');
  assert.strictEqual(fileExtensionForMime('application/octet-stream'), 'bin');
});
