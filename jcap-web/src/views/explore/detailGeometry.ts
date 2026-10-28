/**
 * Hình học bản đồ chi tiết của một tỉnh (thuần, không phụ thuộc trình duyệt): đường bao ngoài từ ranh giới
 * thành phố/quận và điểm đặt tên từng quận. Dùng chung cho trình duyệt (dự phòng) và
 * scripts/precompute-prefecture-detail.mjs, script tính sẵn các kết quả này vào public/japan-detail/*.json
 * để lúc bay tới tỉnh không phải tính (mỗi tỉnh mất hàng trăm ms trên máy yếu, chặn hoạt ảnh).
 */

export interface Municipality {
  code: string;
  name: string;
  /** Tên thành phố chỉ định nếu đây là một quận (vd. 京都市 của 京都市北区) */
  city?: string;
  d: string;
}

/** Điểm đặt tên một quận/thành phố: tâm vòng lớn nhất và hộp bao của vòng đó (đơn vị bản đồ) */
export interface DistrictLabel {
  code: string;
  name: string;
  cx: number;
  cy: number;
  /** Rộng/cao hộp bao của vòng lớn nhất */
  bw: number;
  bh: number;
}

/** Vòng lớn nhất (theo diện tích) của một path nhiều vòng "Mx yLx y...", trả về tâm theo diện tích và hộp bao */
function largestRing(d: string): { cx: number; cy: number; bw: number; bh: number } | null {
  let best: { cx: number; cy: number; bw: number; bh: number; area: number } | null = null;
  for (const sub of d.split('M')) {
    if (!sub) continue;
    const pts = sub
      .replace(/Z/g, '')
      .split('L')
      .map((t) => t.trim().split(' ').map(Number))
      .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 3) continue;
    let a = 0;
    let cx = 0;
    let cy = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [x0, y0] = pts[j];
      const [x1, y1] = pts[i];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    }
    const area = Math.abs(a / 2);
    if (!area || (best && area <= best.area)) continue;
    best = { cx: cx / (3 * a), cy: cy / (3 * a), bw: maxX - minX, bh: maxY - minY, area };
  }
  return best;
}

export function buildDistrictLabels(munis: Municipality[]): DistrictLabel[] {
  const out: DistrictLabel[] = [];
  for (const m of munis) {
    const r = largestRing(m.d);
    if (r) out.push({ code: m.code, name: m.name, cx: r.cx, cy: r.cy, bw: r.bw, bh: r.bh });
  }
  return out;
}

/** Đặt chiều vành để đất nằm bên trái hướng đi (ngược chiều kim đồng hồ trên màn hình, trục y hướng xuống) */
function landOnLeft(pts: string[]): string[] {
  const xy = pts.map((p) => p.split(' ').map(Number));
  let s = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) s += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
  return s < 0 ? pts : [...pts].reverse();
}

/**
 * Đường bao ngoài = các cạnh chỉ thuộc về đúng một thành phố/quận (cạnh dùng chung là ranh giới bên trong).
 * Bỏ các đoạn lẻ rất ngắn (do vài đỉnh của hai thành phố kề nhau không trùng khít sau khi đơn giản hoá).
 * Các cạnh giữ chiều "đất bên trái" và được nối thành đường liền, để dải bờ biển vẽ liền mạch, không đứt khúc ở chỗ nối.
 */
export function buildOutline(munis: Municipality[]): string {
  const count = new Map<string, number>();
  /** Cạnh theo chiều đất bên trái, tra theo khoá không hướng */
  const directed = new Map<string, [string, string]>();
  for (const m of munis) {
    for (const sub of m.d.split('M')) {
      if (!sub) continue;
      let pts = sub
        .replace(/Z/g, '')
        .split('L')
        .map((t) => t.trim())
        .filter(Boolean);
      if (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop();
      if (pts.length < 3) continue;
      pts = landOnLeft(pts);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        count.set(key, (count.get(key) ?? 0) + 1);
        directed.set(key, [a, b]);
      }
    }
  }
  // Gom các cạnh ngoài thành từng chuỗi liền nhau (union-find theo đỉnh) và đo tổng chiều dài mỗi chuỗi
  const parent = new Map<string, string>();
  const length = new Map<string, number>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const next = parent.get(x)!;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  const add = (x: string) => {
    if (!parent.has(x)) {
      parent.set(x, x);
      length.set(x, 0);
    }
  };
  const segments: [string, string][] = [];
  for (const [key, n] of count) {
    if (n !== 1) continue;
    const [a, b] = directed.get(key)!;
    add(a);
    add(b);
    const [ax, ay] = a.split(' ').map(Number);
    const [bx, by] = b.split(' ').map(Number);
    let ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(rb, ra);
      length.set(ra, length.get(ra)! + length.get(rb)!);
    }
    ra = find(a);
    length.set(ra, length.get(ra)! + Math.hypot(ax - bx, ay - by));
    segments.push([a, b]);
  }
  const kept = segments.filter(([a]) => length.get(find(a))! > 12);

  // Nối các cạnh nối đuôi nhau thành đường liền: lùi về đầu chuỗi rồi đi tới
  const byStart = new Map<string, number[]>();
  const byEnd = new Map<string, number[]>();
  kept.forEach(([a, b], i) => {
    byStart.set(a, [...(byStart.get(a) ?? []), i]);
    byEnd.set(b, [...(byEnd.get(b) ?? []), i]);
  });
  const used = new Set<number>();
  let d = '';
  for (let i = 0; i < kept.length; i++) {
    if (used.has(i)) continue;
    let head = i;
    for (const seen = new Set([i]); ; ) {
      const prev = (byEnd.get(kept[head][0]) ?? []).find((k) => !used.has(k) && !seen.has(k));
      if (prev == null) break;
      seen.add(prev);
      head = prev;
    }
    used.add(head);
    const pts = [...kept[head]];
    for (;;) {
      const next = (byStart.get(pts[pts.length - 1]) ?? []).find((k) => !used.has(k));
      if (next == null) break;
      used.add(next);
      pts.push(kept[next][1]);
    }
    d += 'M' + pts.join('L');
  }
  return d;
}
