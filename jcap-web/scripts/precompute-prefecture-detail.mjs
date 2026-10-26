// Tính sẵn hình học bản đồ chi tiết vào public/japan-detail/{mã tỉnh}.json:
//   outline   = đường bao ngoài của tỉnh (bờ biển + ranh giới với tỉnh khác), dựng từ ranh giới thành phố/quận
//   districts = điểm đặt tên từng thành phố/quận
// Trình duyệt dùng thẳng hai giá trị này thay vì tự tính khi bay tới tỉnh (mỗi tỉnh mất hàng trăm ms trên máy yếu,
// lại tính cho cả các tỉnh lân cận, nên chặn hoạt ảnh bay). Dùng chung code với trình duyệt (detailGeometry.ts).
//
// Chạy lại mỗi khi sinh lại ranh giới bằng generate-prefecture-detail.mjs:
//   node scripts/precompute-prefecture-detail.mjs [thư mục, mặc định public/japan-detail]

import fs from 'node:fs';
import path from 'node:path';
import { buildDistrictLabels, buildOutline } from '../src/views/explore/detailGeometry.ts';

const dir = process.argv[2] ?? 'public/japan-detail';
const round2 = (v) => Math.round(v * 100) / 100;

let before = 0;
let after = 0;
const files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
for (const f of files) {
  const file = path.join(dir, f);
  const raw = fs.readFileSync(file, 'utf8');
  const { municipalities } = JSON.parse(raw);
  const outline = buildOutline(municipalities);
  const districts = buildDistrictLabels(municipalities).map((d) => ({
    ...d,
    cx: round2(d.cx),
    cy: round2(d.cy),
    bw: round2(d.bw),
    bh: round2(d.bh),
  }));
  const out = JSON.stringify({ municipalities, outline, districts });
  fs.writeFileSync(file, out, 'utf8');
  before += Buffer.byteLength(raw);
  after += Buffer.byteLength(out);
}
console.log(`${files.length} tỉnh · ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
