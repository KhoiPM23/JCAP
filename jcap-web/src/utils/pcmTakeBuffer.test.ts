import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PcmTakeBuffer, allowedPrerollMs } from './pcmTakeBuffer.ts';

const ramp = (from: number, n: number) => Float32Array.from({ length: n }, (_, i) => from + i);

test('lượt ghi bắt đầu bằng phần âm thanh gần nhất trước khi bấm', () => {
  const buf = new PcmTakeBuffer(1000, 5); // giữ 5 mẫu
  buf.push(ramp(0, 3));
  buf.push(ramp(3, 4)); // ring: 2..6
  buf.startTake();
  buf.push(ramp(100, 2));
  assert.deepEqual([...buf.stopTake()], [2, 3, 4, 5, 6, 100, 101]);
  assert.equal(buf.prerollSampleCount, 5);
});

test('giới hạn thu trước theo maxPrerollMs', () => {
  const buf = new PcmTakeBuffer(1000, 5);
  buf.push(ramp(0, 10));
  buf.startTake(2); // 2 ms = 2 mẫu
  assert.deepEqual([...buf.stopTake()], [8, 9]);
});

test('thu trước bằng 0 thì bản ghi chỉ có phần sau khi bấm', () => {
  const buf = new PcmTakeBuffer(1000, 5);
  buf.push(ramp(0, 10));
  buf.startTake(0);
  buf.push(ramp(50, 1));
  assert.deepEqual([...buf.stopTake()], [50]);
});

test('chưa đủ âm thanh để đầy bộ thu trước thì lấy phần có được', () => {
  const buf = new PcmTakeBuffer(1000, 5);
  buf.push(ramp(0, 2));
  buf.startTake();
  assert.deepEqual([...buf.stopTake()], [0, 1]);
});

test('lượt sau không dùng lại âm thanh của lượt trước làm thu trước', () => {
  const buf = new PcmTakeBuffer(1000, 5);
  buf.push(ramp(0, 5));
  buf.startTake();
  buf.push(ramp(10, 3));
  buf.stopTake();
  buf.startTake();
  assert.deepEqual([...buf.stopTake()], []);
});

test('chặn trên độ dài bản ghi', () => {
  const buf = new PcmTakeBuffer(10, 0, 1); // tối đa 10 mẫu
  buf.startTake();
  buf.push(ramp(0, 8));
  buf.push(ramp(8, 8));
  assert.equal(buf.stopTake().length, 10);
});

test('huỷ lượt ghi không trả dữ liệu', () => {
  const buf = new PcmTakeBuffer(1000, 5);
  buf.startTake();
  buf.push(ramp(0, 3));
  buf.cancelTake();
  assert.equal(buf.isRecording, false);
  assert.equal(buf.stopTake().length, 0);
});

test('không thu trước khi đang phát âm thanh và chừa khoảng an toàn sau khi phát', () => {
  assert.equal(allowedPrerollMs(true, null, 1000, 500), 0);
  assert.equal(allowedPrerollMs(false, null, 1000, 500), 500);
  assert.equal(allowedPrerollMs(false, 900, 1000, 500), 0); // mới dừng 100 ms < 150 ms an toàn
  assert.equal(allowedPrerollMs(false, 700, 1000, 500), 150);
  assert.equal(allowedPrerollMs(false, 0, 5000, 500), 500);
});
