import assert from 'node:assert';
import test from 'node:test';
import { ANALYSIS_SAMPLE_RATE, blobToAnalysisWav, encodeWavPcm16 } from './wavEncoder.ts';

const ascii = (view: DataView, offset: number, len: number) =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

test('WAV: header PCM 16-bit mono đúng tần số và kích thước', () => {
  const samples = new Float32Array(1600); // 100 ms ở 16 kHz
  const view = new DataView(encodeWavPcm16(samples, ANALYSIS_SAMPLE_RATE));

  assert.strictEqual(ascii(view, 0, 4), 'RIFF');
  assert.strictEqual(ascii(view, 8, 4), 'WAVE');
  assert.strictEqual(ascii(view, 12, 4), 'fmt ');
  assert.strictEqual(view.getUint16(20, true), 1); // PCM
  assert.strictEqual(view.getUint16(22, true), 1); // mono
  assert.strictEqual(view.getUint32(24, true), 16000);
  assert.strictEqual(view.getUint32(28, true), 32000);
  assert.strictEqual(view.getUint16(34, true), 16);
  assert.strictEqual(ascii(view, 36, 4), 'data');
  assert.strictEqual(view.getUint32(40, true), 3200);
  assert.strictEqual(view.byteLength, 44 + 3200);
  assert.strictEqual(view.getUint32(4, true), view.byteLength - 8);
});

test('WAV: giá trị mẫu được ánh xạ và kẹp trong [-32768, 32767]', () => {
  const view = new DataView(encodeWavPcm16(new Float32Array([0, 0.5, -0.5, 1, -1, 5, -5]), 16000));
  const at = (i: number) => view.getInt16(44 + i * 2, true);
  assert.strictEqual(at(0), 0);
  assert.strictEqual(at(1), 16384);
  assert.strictEqual(at(2), -16384);
  assert.strictEqual(at(3), 32767);
  assert.strictEqual(at(4), -32768);
  assert.strictEqual(at(5), 32767); // vượt biên bị kẹp
  assert.strictEqual(at(6), -32768);
});

test('WAV: NaN/Infinity không làm hỏng dữ liệu', () => {
  const view = new DataView(encodeWavPcm16(new Float32Array([NaN, Infinity, -Infinity]), 16000));
  assert.strictEqual(view.getInt16(44, true), 0);
  assert.strictEqual(view.getInt16(46, true), 0);
  assert.strictEqual(view.getInt16(48, true), 0);
});

test('WAV: không có Web Audio thì trả null thay vì ném lỗi', async () => {
  const result = await blobToAnalysisWav(new Blob([new Uint8Array(10)]));
  assert.strictEqual(result, null);
});
