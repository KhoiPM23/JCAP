// Sinh src/data/japanMap.ts (đường vẽ SVG 47 tỉnh) từ GeoJSON ranh giới tỉnh của Nhật Bản.
//
// Nguồn dữ liệu: https://github.com/dataofjapan/land (japan.geojson, dựa trên 国土数値情報,
// CC BY 4.0 - cần ghi nguồn khi công bố). Tải file về rồi chạy:
//   node scripts/generate-japan-map.mjs <đường-dẫn/japan.geojson> [src/data/japanMap.ts]
//
// Các bước: chiếu kinh/vĩ độ sang mặt phẳng (giữ đúng vị trí địa lý, kể cả Okinawa), bỏ các đảo
// rất xa (Ogasawara...), đơn giản hóa đường biên (Douglas-Peucker), tính "vùng trọng tâm" của tỉnh
// (các đảo lớn, để phóng to không bị đảo nhỏ ở xa kéo lệch), rồi tối ưu vị trí nhãn tên tỉnh/vùng.

import fs from 'node:fs';
import path from 'node:path';
import { COS, project } from './japan-projection.mjs';

const [, , input, output = 'src/data/japanMap.ts'] = process.argv;
if (!input) {
  console.error('Usage: node scripts/generate-japan-map.mjs <japan.geojson> [output.ts]');
  process.exit(1);
}

// id = mã JIS của tỉnh (1..47)
const PREFS = [
  [1, 'hokkaido', 'Hokkaido', '北海道', 'hokkaido'],
  [2, 'aomori', 'Aomori', '青森県', 'tohoku'],
  [3, 'iwate', 'Iwate', '岩手県', 'tohoku'],
  [4, 'miyagi', 'Miyagi', '宮城県', 'tohoku'],
  [5, 'akita', 'Akita', '秋田県', 'tohoku'],
  [6, 'yamagata', 'Yamagata', '山形県', 'tohoku'],
  [7, 'fukushima', 'Fukushima', '福島県', 'tohoku'],
  [8, 'ibaraki', 'Ibaraki', '茨城県', 'kanto'],
  [9, 'tochigi', 'Tochigi', '栃木県', 'kanto'],
  [10, 'gunma', 'Gunma', '群馬県', 'kanto'],
  [11, 'saitama', 'Saitama', '埼玉県', 'kanto'],
  [12, 'chiba', 'Chiba', '千葉県', 'kanto'],
  [13, 'tokyo', 'Tokyo', '東京都', 'kanto'],
  [14, 'kanagawa', 'Kanagawa', '神奈川県', 'kanto'],
  [15, 'niigata', 'Niigata', '新潟県', 'chubu'],
  [16, 'toyama', 'Toyama', '富山県', 'chubu'],
  [17, 'ishikawa', 'Ishikawa', '石川県', 'chubu'],
  [18, 'fukui', 'Fukui', '福井県', 'chubu'],
  [19, 'yamanashi', 'Yamanashi', '山梨県', 'chubu'],
  [20, 'nagano', 'Nagano', '長野県', 'chubu'],
  [21, 'gifu', 'Gifu', '岐阜県', 'chubu'],
  [22, 'shizuoka', 'Shizuoka', '静岡県', 'chubu'],
  [23, 'aichi', 'Aichi', '愛知県', 'chubu'],
  [24, 'mie', 'Mie', '三重県', 'kansai'],
  [25, 'shiga', 'Shiga', '滋賀県', 'kansai'],
  [26, 'kyoto', 'Kyoto', '京都府', 'kansai'],
  [27, 'osaka', 'Osaka', '大阪府', 'kansai'],
  [28, 'hyogo', 'Hyogo', '兵庫県', 'kansai'],
  [29, 'nara', 'Nara', '奈良県', 'kansai'],
  [30, 'wakayama', 'Wakayama', '和歌山県', 'kansai'],
  [31, 'tottori', 'Tottori', '鳥取県', 'chugoku'],
  [32, 'shimane', 'Shimane', '島根県', 'chugoku'],
  [33, 'okayama', 'Okayama', '岡山県', 'chugoku'],
  [34, 'hiroshima', 'Hiroshima', '広島県', 'chugoku'],
  [35, 'yamaguchi', 'Yamaguchi', '山口県', 'chugoku'],
  [36, 'tokushima', 'Tokushima', '徳島県', 'shikoku'],
  [37, 'kagawa', 'Kagawa', '香川県', 'shikoku'],
  [38, 'ehime', 'Ehime', '愛媛県', 'shikoku'],
  [39, 'kochi', 'Kochi', '高知県', 'shikoku'],
  [40, 'fukuoka', 'Fukuoka', '福岡県', 'kyushu'],
  [41, 'saga', 'Saga', '佐賀県', 'kyushu'],
  [42, 'nagasaki', 'Nagasaki', '長崎県', 'kyushu'],
  [43, 'kumamoto', 'Kumamoto', '熊本県', 'kyushu'],
  [44, 'oita', 'Oita', '大分県', 'kyushu'],
  [45, 'miyazaki', 'Miyazaki', '宮崎県', 'kyushu'],
  [46, 'kagoshima', 'Kagoshima', '鹿児島県', 'kyushu'],
  [47, 'okinawa', 'Okinawa', '沖縄県', 'kyushu'],
];

const REGIONS = [
  ['hokkaido', 'Hokkaido'],
  ['tohoku', 'Tohoku'],
  ['kanto', 'Kanto'],
  ['chubu', 'Chubu'],
  ['kansai', 'Kansai'],
  ['chugoku', 'Chugoku'],
  ['shikoku', 'Shikoku'],
  ['kyushu', 'Kyushu - Okinawa'],
];

/** Tên vùng bằng chữ Hán (in dọc trong ô giấy trên bản đồ) */
const REGION_JP = {
  hokkaido: '北海道',
  tohoku: '東北',
  kanto: '関東',
  chubu: '中部',
  kansai: '関西',
  chugoku: '中国',
  shikoku: '四国',
  kyushu: '九州・沖縄',
};

// ---- Tham số hình học ----
const SIMPLIFY_TOLERANCE = 0.5;
const MIN_ISLAND_AREA = 6; // đơn vị SVG^2, bỏ đảo nhỏ hơn
/** Đảo có diện tích >= tỉ lệ này so với đảo lớn nhất của tỉnh mới tính vào vùng trọng tâm */
const FOCUS_AREA_RATIO = 0.15;

// Bỏ các đảo rất xa đất liền (Ogasawara, Minamitorishima thuộc Tokyo) để bản đồ không quá rộng
const MIN_LAT = { 13: 32.0 };
const MAX_LON = {};

// ---- Tiện ích hình học ----
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
      let d2;
      if (len2 === 0) d2 = (px - x1) ** 2 + (py - y1) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
        d2 = (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2;
      }
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

const round1 = (v) => Math.round(v * 10) / 10;

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToRing(x, y, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
    if (d < best) best = d;
  }
  return best;
}

const bboxOf = (points) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [round1(minX), round1(minY), round1(Math.max(...xs) - minX), round1(Math.max(...ys) - minY)];
};

// ---- Đọc và biến đổi dữ liệu ----
const geo = JSON.parse(fs.readFileSync(input, 'utf8'));
const byId = new Map(geo.features.map((f) => [f.properties.id, f]));

/** @returns {number[][][]} danh sách vành ngoài (đã chiếu) của các đa giác được giữ lại */
function extractPolygons(feature, id) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const out = [];
  for (const rings of polys) {
    const outer = rings[0];
    const avgLat = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    const avgLon = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    if (MIN_LAT[id] && avgLat < MIN_LAT[id]) continue;
    if (MAX_LON[id] && avgLon > MAX_LON[id]) continue;
    out.push(outer.map(project));
  }
  const largest = Math.max(...out.map(ringArea));
  return out.filter((r) => ringArea(r) >= MIN_ISLAND_AREA || ringArea(r) === largest);
}

const shapes = [];
/** Phần đất lớn nhất của từng tỉnh (dùng để chọn vị trí nhãn) */
const mainRings = new Map();
/**
 * Đặt chiều vành sao cho đất luôn nằm bên trái hướng đi (trên màn hình, trục y hướng xuống, tức là
 * ngược chiều kim đồng hồ quanh mỗi đảo): lớp chấm bọt chạy theo chiều đường vẽ nên sóng đi cùng một chiều khắp nơi.
 */
function landOnLeft(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return s < 0 ? ring : [...ring].reverse();
}
/** Vành ngoài (đã chiếu, chưa đơn giản hoá, đất bên trái) của mọi tỉnh, để dựng đường bờ biển */
const rawRings = [];

for (const [id, slug, nameVi, nameJp, region] of PREFS) {
  const feature = byId.get(id);
  if (!feature) throw new Error(`Thiếu tỉnh id=${id} (${slug}) trong GeoJSON`);
  let rings = extractPolygons(feature, id);
  rawRings.push(...rings.map(landOnLeft));

  rings = rings
    .map((r) => simplify(r, SIMPLIFY_TOLERANCE).map(([x, y]) => [round1(x), round1(y)]))
    .map((r) => r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]))
    .filter((r) => r.length >= 3);

  const maxArea = Math.max(...rings.map(ringArea));
  const focusRings = rings.filter((r) => ringArea(r) >= maxArea * FOCUS_AREA_RATIO);
  const mainRing = rings.find((r) => ringArea(r) === maxArea);
  mainRings.set(id, mainRing);

  const d = rings.map((r) => 'M' + r.map(([x, y]) => `${x} ${y}`).join('L') + 'Z').join('');
  shapes.push({
    id,
    slug,
    nameVi,
    nameJp,
    region,
    d,
    bbox: bboxOf(rings.flat()),
    focus: bboxOf(focusRings.flat()),
    main: bboxOf(mainRing),
    labelPos: [0, 0], // tính ở bước tối ưu vị trí nhãn bên dưới
  });
}

// ---- Vị trí nhãn và ngưỡng zoom hiển thị nhãn ----
// Nhãn tỉnh: biểu tượng 22px phía trên + 2 dòng chữ (tên Việt 12px + tên Nhật 11px), căn giữa tại labelPos;
// nhãn vùng: ô giấy khung đôi in dọc chữ Hán 17px + tên Latin 11px bên dưới (kiểu tranh khắc gỗ).
// Kích thước ước lượng theo số ký tự; giao diện dùng ngưỡng xuất ra ở LABEL_MIN_PX_PER_UNIT.
const LABEL_GAP_PX = 6;
const PREF_LABEL_H_PX = 54;
const prefLabelW = (s) => Math.max(s.nameVi.length * 7, s.nameJp.length * 11.5) + 8;
/** Kích thước nhãn vùng (px, cỡ máy tính): ô chữ dọc (mỗi chữ ~19.4px + đệm + khung đôi) và tên Latin bên dưới */
const regionLabelBox = (rid, nameVi) => {
  const chars = [...REGION_JP[rid]].length;
  return { w: Math.max(33, nameVi.length * 6.6 + 4), h: chars * 19.4 + 41 };
};
/** Màn hẹp: chữ Hán 11.5px, tên Latin 9.5px; `compact` = chỉ ô chữ dọc, chưa có tên Latin */
const regionLabelBoxNarrow = (rid, nameVi, compact) => {
  const chars = [...REGION_JP[rid]].length;
  return compact ? { w: 22, h: chars * 13.1 + 15 } : { w: Math.max(22, nameVi.length * 5.7 + 4), h: chars * 13.1 + 30 };
};

/** Mức phóng to (px trên 1 đơn vị bản đồ) tối thiểu để hai nhãn không chồng lên nhau */
const pairNeed = (pa, wa, pb, wb, ha, hb = ha) => {
  const dx = Math.abs(pa[0] - pb[0]);
  const dy = Math.abs(pa[1] - pb[1]);
  const nx = dx === 0 ? Infinity : ((wa + wb) / 2 + LABEL_GAP_PX) / dx;
  const ny = dy === 0 ? Infinity : ((ha + hb) / 2 + LABEL_GAP_PX) / dy;
  return Math.min(nx, ny);
};

// Ứng viên vị trí nhãn: các điểm nằm khá sâu trong phần đất lớn nhất của tỉnh
const labelCands = new Map();
for (const s of shapes) {
  const ring = mainRings.get(s.id);
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const step = Math.max(maxX - minX, maxY - minY, 1) / 30;
  const cands = [];
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let y = minY + step / 2; y < maxY; y += step) {
      if (pointInRing(x, y, ring)) cands.push({ p: [x, y], d: distToRing(x, y, ring) });
    }
  }
  const maxD = Math.max(...cands.map((c) => c.d));
  const deep = cands.filter((c) => c.d >= maxD * 0.45);
  labelCands.set(s.id, deep);
  s.labelPos = deep.reduce((a, b) => (b.d > a.d ? b : a)).p;
}

// Lần lượt dời nhãn từng tỉnh sang ứng viên làm giảm mức chồng lấn tệ nhất với các tỉnh khác
const worstFor = (s, pos) => {
  let worst = 0;
  for (const o of shapes) {
    if (o !== s) worst = Math.max(worst, pairNeed(pos, prefLabelW(s), o.labelPos, prefLabelW(o), PREF_LABEL_H_PX));
  }
  return worst;
};
for (let round = 0; round < 12; round++) {
  let moved = false;
  for (const s of shapes) {
    let best = s.labelPos;
    let bestV = worstFor(s, s.labelPos);
    for (const c of labelCands.get(s.id)) {
      const v = worstFor(s, c.p);
      if (v < bestV - 1e-9) {
        bestV = v;
        best = c.p;
      }
    }
    if (best !== s.labelPos) {
      s.labelPos = best;
      moved = true;
    }
  }
  if (!moved) break;
}
for (const s of shapes) s.labelPos = [round1(s.labelPos[0]), round1(s.labelPos[1])];

let prefLabelMinPpu = 0;
for (let i = 0; i < shapes.length; i++) {
  for (let j = i + 1; j < shapes.length; j++) {
    const a = shapes[i];
    const b = shapes[j];
    prefLabelMinPpu = Math.max(prefLabelMinPpu, pairNeed(a.labelPos, prefLabelW(a), b.labelPos, prefLabelW(b), PREF_LABEL_H_PX));
  }
}

// Nhãn vùng: bắt đầu ở điểm gần trọng tâm (theo diện tích) các nhãn tỉnh trong vùng, rồi dời sang điểm nằm sâu
// trong một tỉnh của vùng sao cho các ô chữ dọc cách nhau xa nhất. Okinawa ở xa nên không tính cho Kyushu.
// Ô chữ phải nằm gọn trong khung nhìn ban đầu (mức zoom ~0.5 px/đơn vị trên máy tính) để không bị cắt ở mép.
const HOME_LABEL_PPU = 0.5;
const homeArea = (() => {
  const boxes = shapes.filter((s) => s.id !== 47).map((s) => s.focus);
  return {
    x0: Math.min(...boxes.map((b) => b[0])),
    y0: Math.min(...boxes.map((b) => b[1])),
    x1: Math.max(...boxes.map((b) => b[0] + b[2])),
    y1: Math.max(...boxes.map((b) => b[1] + b[3])),
  };
})();
const fitsHome = (box, p) => {
  const hw = box.w / 2 / HOME_LABEL_PPU;
  const hh = box.h / 2 / HOME_LABEL_PPU;
  return p[0] - hw >= homeArea.x0 && p[0] + hw <= homeArea.x1 && p[1] - hh >= homeArea.y0 && p[1] + hh <= homeArea.y1;
};
const regionLabels = REGIONS.map(([rid, nameVi]) => {
  let x = 0;
  let y = 0;
  let a = 0;
  const cands = [];
  for (const s of shapes) {
    if (s.region !== rid || s.id === 47) continue;
    const w = s.focus[2] * s.focus[3];
    x += s.labelPos[0] * w;
    y += s.labelPos[1] * w;
    a += w;
    for (const c of labelCands.get(s.id)) cands.push(c.p);
  }
  const box = regionLabelBox(rid, nameVi);
  const fitting = cands.filter((c) => fitsHome(box, c));
  if (!fitting.length) throw new Error(`Không có chỗ đặt nhãn vùng ${rid} trong khung nhìn ban đầu`);
  const cx = x / a;
  const cy = y / a;
  const start = fitting.reduce((b, c) => (Math.hypot(c[0] - cx, c[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? c : b));
  return { id: rid, nameVi, nameJp: REGION_JP[rid], box, labelPos: start, cands: fitting };
});
const regionWorst = (r, pos) => {
  let worst = 0;
  for (const o of regionLabels) {
    if (o !== r) worst = Math.max(worst, pairNeed(pos, r.box.w, o.labelPos, o.box.w, r.box.h, o.box.h));
  }
  return worst;
};
for (let round = 0; round < 20; round++) {
  let moved = false;
  for (const r of regionLabels) {
    let best = r.labelPos;
    let bestV = regionWorst(r, r.labelPos);
    for (const c of r.cands) {
      const v = regionWorst(r, c);
      if (v < bestV - 1e-9) {
        bestV = v;
        best = c;
      }
    }
    if (best !== r.labelPos) {
      r.labelPos = best;
      moved = true;
    }
  }
  if (!moved) break;
}
for (const r of regionLabels) r.labelPos = [round1(r.labelPos[0]), round1(r.labelPos[1])];
const regionThreshold = (boxOf) => {
  let need = 0;
  for (let i = 0; i < regionLabels.length; i++) {
    for (let j = i + 1; j < regionLabels.length; j++) {
      const a = regionLabels[i];
      const b = regionLabels[j];
      const A = boxOf(a);
      const B = boxOf(b);
      need = Math.max(need, pairNeed(a.labelPos, A.w, b.labelPos, B.w, A.h, B.h));
    }
  }
  return need;
};
const regionLabelMinPpu = regionThreshold((r) => r.box);
const regionNarrowMinPpu = regionThreshold((r) => regionLabelBoxNarrow(r.id, r.nameVi, false));
const regionNarrowCompactMinPpu = regionThreshold((r) => regionLabelBoxNarrow(r.id, r.nameVi, true));

// Khung nhìn ban đầu: các đảo chính (Hokkaido -> Kyushu); Okinawa vẫn ở đúng vị trí, kéo xuống để tới
const homeBoxes = shapes.filter((s) => s.id !== 47).map((s) => s.focus);
const HOME_PAD = 10;
const homeX = Math.min(...homeBoxes.map((b) => b[0])) - HOME_PAD;
const homeY = Math.min(...homeBoxes.map((b) => b[1])) - HOME_PAD;
const homeViewBox = [
  round1(homeX),
  round1(homeY),
  round1(Math.max(...homeBoxes.map((b) => b[0] + b[2])) + HOME_PAD - homeX),
  round1(Math.max(...homeBoxes.map((b) => b[1] + b[3])) + HOME_PAD - homeY),
];

// ---- Đường bờ biển (chỉ bờ biển, không có ranh giới giữa các tỉnh) cho lớp bọt sóng ----
// Cạnh chỉ thuộc về một tỉnh là bờ biển (ranh giới hai tỉnh dùng chung đỉnh nên xuất hiện hai lần).
// Nối các cạnh thành từng đường rồi làm mượt mạnh hơn hình đất: dải bọt dày 28px không cần chi tiết từng mét,
// và ít đỉnh hơn giúp kéo/phóng bản đồ mượt hơn nhiều.
const COAST_TOLERANCE = 1.2;
const coastD = (() => {
  const key = (p) => `${p[0]},${p[1]}`;
  const edgeCount = new Map();
  for (const ring of rawRings) {
    for (let i = 0; i < ring.length; i++) {
      const a = key(ring[i]);
      const b = key(ring[(i + 1) % ring.length]);
      if (a === b) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }
  // Đi lại từng vành, gom các đoạn liên tiếp toàn cạnh bờ biển thành một đường
  const lines = [];
  for (const ring of rawRings) {
    const n = ring.length;
    const isCoast = (i) => {
      const a = key(ring[i]);
      const b = key(ring[(i + 1) % n]);
      return edgeCount.get(a < b ? `${a}|${b}` : `${b}|${a}`) === 1;
    };
    const flags = Array.from({ length: n }, (_, i) => isCoast(i));
    if (flags.every(Boolean)) {
      lines.push({ pts: [...ring, ring[0]], closed: true });
      continue;
    }
    if (!flags.some(Boolean)) continue;
    // Bắt đầu ngay sau một cạnh không phải bờ biển để không cắt đôi một đoạn bờ
    const start = flags.findIndex((f, i) => !f && flags[(i + 1) % n]) + 1;
    let cur = null;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (flags[i]) {
        if (!cur) cur = [ring[i]];
        cur.push(ring[(i + 1) % n]);
      } else if (cur) {
        lines.push({ pts: cur, closed: false });
        cur = null;
      }
    }
    if (cur) lines.push({ pts: cur, closed: false });
  }
  // Nối các đoạn bờ của hai tỉnh giáp nhau ở bờ biển (cuối đoạn này là đầu đoạn kia) thành một đường liền,
  // để chuỗi chấm bọt chạy qua ranh giới tỉnh không bị đứt nhịp
  const first = (k) => key(lines[k].pts[0]);
  const last = (k) => key(lines[k].pts[lines[k].pts.length - 1]);
  const index = (end) => {
    const m = new Map();
    lines.forEach((l, k) => !l.closed && m.set(end(k), [...(m.get(end(k)) ?? []), k]));
    return m;
  };
  const byFirst = index(first);
  const byLast = index(last);
  const used = new Set();
  const joined = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (lines[i].closed) {
      used.add(i);
      joined.push(lines[i]);
      continue;
    }
    // Lùi về đầu chuỗi (đoạn kết thúc đúng ở điểm đầu đoạn hiện tại), rồi đi tới và nối dần
    let head = i;
    for (const seen = new Set([i]); ; ) {
      const prev = (byLast.get(first(head)) ?? []).find((k) => !used.has(k) && !seen.has(k));
      if (prev == null) break;
      seen.add(prev);
      head = prev;
    }
    used.add(head);
    const pts = [...lines[head].pts];
    for (;;) {
      const next = (byFirst.get(key(pts[pts.length - 1])) ?? []).find((k) => !used.has(k));
      if (next == null) break;
      used.add(next);
      pts.push(...lines[next].pts.slice(1));
    }
    joined.push({ pts, closed: key(pts[0]) === key(pts[pts.length - 1]) });
  }
  console.log(`Bờ biển: ${lines.length} đoạn -> ${joined.length} đường liền`);
  return joined
    .map(({ pts, closed }) => {
      const sp = simplify(pts, COAST_TOLERANCE).map(([x, y]) => [round1(x), round1(y)]);
      if (sp.length < 2) return '';
      return 'M' + sp.map(([x, y]) => `${x} ${y}`).join('L') + (closed ? 'Z' : '');
    })
    .join('');
})();

const PAD = 20;
const minX = Math.min(...shapes.map((s) => s.bbox[0])) - PAD;
const minY = Math.min(...shapes.map((s) => s.bbox[1])) - PAD;
const maxX = Math.max(...shapes.map((s) => s.bbox[0] + s.bbox[2])) + PAD;
const maxY = Math.max(...shapes.map((s) => s.bbox[1] + s.bbox[3])) + PAD;
const viewBox = [round1(minX), round1(minY), round1(maxX - minX), round1(maxY - minY)];

// ---- Ghi file TypeScript ----
const header = `// FILE ĐƯỢC SINH TỰ ĐỘNG bởi scripts/generate-japan-map.mjs - không sửa tay.
// Dữ liệu ranh giới tỉnh: dataofjapan/land (dựa trên 国土数値情報), giấy phép CC BY 4.0.
// Toạ độ là đơn vị SVG (1 độ kinh/vĩ ≈ 100 đơn vị); giữ đúng vị trí địa lý của mọi tỉnh.

export type RegionId = 'hokkaido' | 'tohoku' | 'kanto' | 'chubu' | 'kansai' | 'chugoku' | 'shikoku' | 'kyushu';

export interface JapanRegion {
  id: RegionId;
  nameVi: string;
  /** Tên chữ Hán, in dọc trong ô giấy */
  nameJp: string;
  /** Điểm đặt nhãn tên vùng */
  labelPos: [number, number];
}

export interface PrefectureShape {
  /** Mã JIS của tỉnh (1..47) */
  id: number;
  slug: string;
  nameVi: string;
  nameJp: string;
  region: RegionId;
  /** Đường vẽ SVG (dùng fill-rule evenodd) */
  d: string;
  /** [x, y, rộng, cao] bao toàn bộ tỉnh (kể cả đảo nhỏ) trong hệ toạ độ bản đồ */
  bbox: [number, number, number, number];
  /** [x, y, rộng, cao] vùng trọng tâm (các đảo lớn): khung dùng khi phóng to vào tỉnh */
  focus: [number, number, number, number];
  /** [x, y, rộng, cao] của đảo/phần đất lớn nhất: dùng cho hình con dấu */
  main: [number, number, number, number];
  /** Điểm đặt nhãn tên (nằm sâu trong phần đất lớn nhất) */
  labelPos: [number, number];
}

`;

const body =
  `/** Khung bao toàn bộ nước Nhật (giới hạn kéo bản đồ) */\n` +
  `/** [vĩ độ, kinh độ] -> [x, y] trên bản đồ (cùng phép chiếu với scripts/japan-projection.mjs) */\n` +
  `export const projectLonLat = (lat: number, lon: number): [number, number] => [(lon - 122) * ${COS} * 100, (46 - lat) * 100];\n\n` +
  `/** Đường bờ biển toàn quốc (không gồm ranh giới giữa các tỉnh), đã làm mượt: dùng cho lớp bọt sóng */\n` +
  `export const COAST_D = ${JSON.stringify(coastD)};\n\n` +
  `export const JAPAN_VIEWBOX: [number, number, number, number] = ${JSON.stringify(viewBox)};\n\n` +
  `/** Khung nhìn ban đầu: các đảo chính, chưa gồm Okinawa */\n` +
  `export const HOME_VIEWBOX: [number, number, number, number] = ${JSON.stringify(homeViewBox)};\n\n` +
  `/** Mức phóng to tối thiểu (px trên 1 đơn vị bản đồ) để các nhãn không chồng nhau: vùng (máy tính), vùng trên màn hẹp (có / chưa có tên Latin), tỉnh */\n` +
  `export const LABEL_MIN_PX_PER_UNIT = { region: ${regionLabelMinPpu.toFixed(3)}, regionNarrow: ${regionNarrowMinPpu.toFixed(3)}, regionNarrowCompact: ${regionNarrowCompactMinPpu.toFixed(3)}, prefecture: ${prefLabelMinPpu.toFixed(3)} };\n\n` +
  `export const REGIONS: JapanRegion[] = [\n${regionLabels.map((r) => `  { id: '${r.id}', nameVi: '${r.nameVi}', nameJp: '${r.nameJp}', labelPos: ${JSON.stringify(r.labelPos)} },`).join('\n')}\n];\n\n` +
  `export const PREFECTURES: PrefectureShape[] = [\n${shapes.map((s) => '  ' + JSON.stringify(s) + ',').join('\n')}\n];\n`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, header + body, 'utf8');
console.log(`Đã ghi ${output} (${(fs.statSync(output).size / 1024).toFixed(0)} KB), ${shapes.length} tỉnh, viewBox=${viewBox}, home=${homeViewBox}`);
console.log(`Bờ biển: ${(coastD.length / 1024).toFixed(0)} KB (hình đất toàn quốc: ${(shapes.reduce((a, x) => a + x.d.length, 0) / 1024).toFixed(0)} KB)`);
console.log(`Ngưỡng nhãn: vùng ${regionLabelMinPpu.toFixed(3)}, tỉnh ${prefLabelMinPpu.toFixed(3)} px/đơn vị`);
