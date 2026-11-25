import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGain, playbackGain } from './playbackLevel.ts';

const tone = (amp: number, n = 16000) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 5));

test('bản thu nhỏ được khuếch đại tới khoảng −3 dBFS', () => {
  const gain = playbackGain(tone(0.1));
  assert.ok(Math.abs(gain * 0.1 - 0.7) < 0.02, `gain ${gain}`);
});

test('không bao giờ giảm âm lượng bản đã đủ to', () => {
  assert.equal(playbackGain(tone(0.9)), 1);
});

test('khuếch đại tối đa +18 dB; im lặng thì giữ nguyên', () => {
  assert.equal(playbackGain(tone(0.001)), 8);
  assert.equal(playbackGain(new Float32Array(1000)), 1);
  assert.equal(playbackGain(new Float32Array(0)), 1);
});

test('một tiếng click lẻ không làm hỏng việc chuẩn hoá', () => {
  const s = tone(0.1);
  s[100] = 1; // chạm micro
  assert.ok(playbackGain(s) > 5);
});

test('khuếch đại kẹp trong [−1, 1]', () => {
  assert.deepEqual([...applyGain(Float32Array.from([0.5, -0.5, 0.1]), 4)].map((x) => +x.toFixed(3)), [1, -1, 0.4]);
});
