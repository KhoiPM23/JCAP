import assert from 'node:assert';
import fs from 'node:fs';
import test from 'node:test';
import { buildDistrictLabels, buildOutline } from './detailGeometry.ts';

// Dữ liệu tính sẵn trong public/japan-detail phải khớp với code hiện tại (quên chạy lại
// scripts/precompute-prefecture-detail.mjs sau khi sửa thuật toán hay sinh lại ranh giới thì test này báo)
const DIR = new URL('../../../public/japan-detail/', import.meta.url);

for (const id of [12, 13, 26, 29, 47]) {
  test(`tỉnh ${id}: đường bao và điểm đặt tên tính sẵn khớp với code`, () => {
    const data = JSON.parse(fs.readFileSync(new URL(`${id}.json`, DIR), 'utf8'));
    assert.ok(data.outline, 'thiếu outline: chạy node scripts/precompute-prefecture-detail.mjs');
    assert.strictEqual(data.outline, buildOutline(data.municipalities));
    const expected = buildDistrictLabels(data.municipalities);
    assert.strictEqual(data.districts.length, expected.length);
    data.districts.forEach((d: { code: string; cx: number; cy: number }, i: number) => {
      assert.strictEqual(d.code, expected[i].code);
      assert.ok(Math.abs(d.cx - expected[i].cx) <= 0.01 && Math.abs(d.cy - expected[i].cy) <= 0.01);
    });
  });
}
