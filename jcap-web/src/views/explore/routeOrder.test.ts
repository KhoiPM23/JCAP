import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderForAdmin } from './routeOrder.ts';

const spot = (id: number, status = 'Published') => ({ id, status });
const order = (spots: ReturnType<typeof spot>[]) => orderForAdmin(spots).map(({ spot: s, no }) => [s.id, no]);

test('orderForAdmin: mốc đang dùng giữ thứ tự tạo, số trùng với người học', () => {
  assert.deepEqual(order([spot(18), spot(20), spot(21), spot(22)]), [[18, 1], [20, 2], [21, 3], [22, 4]]);
});

test('orderForAdmin: mốc nháp xếp sau và không làm đổi số của mốc đang dùng', () => {
  assert.deepEqual(order([spot(1), spot(2, 'Draft'), spot(3)]), [[1, 1], [3, 2], [2, 3]]);
});

test('orderForAdmin: tỉnh chỉ có nháp hoặc chưa có mốc vẫn đánh số được', () => {
  assert.deepEqual(order([spot(5, 'Draft'), spot(6, 'Draft')]), [[5, 1], [6, 2]]);
  assert.deepEqual(order([]), []);
});
