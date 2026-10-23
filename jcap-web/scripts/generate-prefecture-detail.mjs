// Sinh ranh giới thành phố/quận (市区町村) cho bản đồ chi tiết từng tỉnh: public/japan-detail/{mã tỉnh}.json
//
// Nguồn: https://github.com/smartnews-smri/japan-topography (data/municipality/geojson/s0010/N03-21_{xx}_210101.json),
// đã đơn giản hoá từ 国土交通省「国土数値情報（行政区域データ）」N03 (2021). Dùng miễn phí kể cả thương mại,
// bắt buộc ghi nguồn MLIT. Tải 47 file về một thư mục (đặt tên 01.json ... 47.json) rồi chạy:
//   node scripts/generate-prefecture-detail.mjs <thư-mục-geojson>
//
// Mỗi file đầu ra: { municipalities: [{ code, name, city?, d }] } với toạ độ cùng phép chiếu bản đồ chính.
// Quận của thành phố chỉ định (vd. 京都市北区) giữ riêng từng quận, kèm `city` = tên thành phố.

import fs from 'node:fs';
import path from 'node:path';
import { project } from './japan-projection.mjs';

const [, , inputDir, outputDir = 'public/japan-detail'] = process.argv;
if (!inputDir) {
  console.error('Usage: node scripts/generate-prefecture-detail.mjs <geojson dir> [output dir]');
  process.exit(1);
}

const SIMPLIFY_TOLERANCE = 0.04; // đơn vị bản đồ (~ 40 m)
const MIN_ISLAND_AREA = 0.02; // bỏ đảo rất nhỏ
const round2 = (v) => Math.round(v * 100) / 100;

const ringArea = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
};

function simplify(points, tol) {
  const n = points.length;
  if (n <= 3) return points;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0;
    let idx = -1;
    const [x1, y1] = points[s];
    const [x2, y2] = points[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
      const d2 = (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2;
      if (d2 > max) {
        max = d2;
        idx = i;
      }
    }
    if (max > tol * tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

fs.mkdirSync(outputDir, { recursive: true });
let total = 0;
for (let pref = 1; pref <= 47; pref++) {
  const file = path.join(inputDir, `${String(pref).padStart(2, '0')}.json`);
  const geo = JSON.parse(fs.readFileSync(file, 'utf8'));
  const municipalities = [];
  for (const f of geo.features) {
    const p = f.properties;
    if (!p.N03_004 || !p.N03_007) continue; // bỏ vùng chưa xác định thuộc về đâu (所属未定地)
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = [];
    for (const poly of polys) {
      for (const ring of poly) {
        const r = simplify(ring.map(project), SIMPLIFY_TOLERANCE)
          .map(([x, y]) => [round2(x), round2(y)])
          .filter((pt, i, arr) => i === 0 || pt[0] !== arr[i - 1][0] || pt[1] !== arr[i - 1][1]);
        if (r.length >= 3 && ringArea(r) >= MIN_ISLAND_AREA) rings.push(r);
      }
    }
    if (!rings.length) continue;
    // Thành phố chỉ định: N03_003 là tên thành phố (kết thúc bằng 市), N03_004 là tên quận (区)
    const city = p.N03_003 && p.N03_003.endsWith('市') && p.N03_004.endsWith('区') ? p.N03_003 : undefined;
    municipalities.push({
      code: p.N03_007,
      name: p.N03_004,
      ...(city ? { city } : {}),
      d: rings.map((r) => 'M' + r.map(([x, y]) => `${x} ${y}`).join('L') + 'Z').join(''),
    });
  }
  const out = path.join(outputDir, `${pref}.json`);
  fs.writeFileSync(out, JSON.stringify({ municipalities }), 'utf8');
  total += fs.statSync(out).size;
}
console.log(`Đã ghi 47 file vào ${outputDir}, tổng ${(total / 1024).toFixed(0)} KB`);
