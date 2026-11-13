import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingFurigana } from './furigana.ts';

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
