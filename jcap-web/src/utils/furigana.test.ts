import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingFurigana, readReferenceRate } from './furigana.ts';

const segs = [
  { text: '学校', reading: 'がっこう' },
  { text: 'に', reading: null },
  { text: '行', reading: 'い' },
  { text: 'きます', reading: null },
];

test('furigana dùng được khi các đoạn ghép đúng bằng chữ của câu (bỏ khoảng trắng, NFKC)', () => {
  assert.deepEqual(matchingFurigana('学校に行きます', segs), segs);
  assert.deepEqual(matchingFurigana('学校に 行きます', segs), segs);
});

test('câu đã đổi chữ hoặc không có dữ liệu: không hiển thị cách đọc', () => {
  assert.equal(matchingFurigana('学校へ行きます', segs), null);
  assert.equal(matchingFurigana('学校に行きます', []), null);
  assert.equal(matchingFurigana('学校に行きます', undefined), null);
});

test('tốc độ giọng mẫu: chỉ nhận giá trị cho phép, mặc định 1', () => {
  assert.equal(readReferenceRate({ getItem: () => '0.75' }), 0.75);
  assert.equal(readReferenceRate({ getItem: () => '0.5' }), 1);
  assert.equal(readReferenceRate({ getItem: () => null }), 1);
  assert.equal(readReferenceRate({ getItem: () => { throw new Error('blocked'); } }), 1);
});
