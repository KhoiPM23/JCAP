import { prefectureCities, prefectureLandmarks } from './prefectureDetail';

/**
 * Lộ trình học của một tỉnh: bắt đầu ở địa điểm gần thủ phủ nhất, sau đó luôn đi tới địa điểm gần nhất chưa ghé.
 * Tính một lần cho mỗi tỉnh (theo toạ độ bản đồ, cùng hệ với vị trí ghim).
 */
export interface LearnRoute {
  /** Chỉ số địa điểm (trong prefectureLandmarks) theo thứ tự đi */
  route: number[];
  /** stop[i] = số thứ tự (từ 1) của địa điểm i trên lộ trình */
  stop: number[];
}

/** Nhớ theo mảng mốc (mỗi lần tải dữ liệu tỉnh là một mảng mới, nên dữ liệu mới thì tính lại) */
const routeCache = new WeakMap<object, LearnRoute | null>();

/** Tỉnh chỉ có 0-1 địa điểm thì không có lộ trình (không vẽ đường, không đánh số) */
export function prefectureRoute(prefId: number): LearnRoute | null {
  const spots = prefectureLandmarks(prefId);
  const cached = routeCache.get(spots);
  if (cached !== undefined) return cached;
  let result: LearnRoute | null = null;
  if (spots.length >= 2) {
    const capital = prefectureCities(prefId).find((c) => c.capital);
    // Không có thủ phủ thì xuất phát từ trọng tâm các địa điểm
    const origin: [number, number] = capital
      ? capital.xy
      : [spots.reduce((s, p) => s + p.xy[0], 0) / spots.length, spots.reduce((s, p) => s + p.xy[1], 0) / spots.length];
    const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const left = new Set(spots.map((_, i) => i));
    const route: number[] = [];
    let at = origin;
    while (left.size) {
      let best = -1;
      let bestD = Infinity;
      for (const i of left) {
        const d = dist(at, spots[i].xy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      left.delete(best);
      route.push(best);
      at = spots[best].xy;
    }
    const stop: number[] = [];
    route.forEach((spot, n) => (stop[spot] = n + 1));
    result = { route, stop };
  }
  routeCache.set(spots, result);
  return result;
}

/**
 * Địa điểm "Tiếp theo": điểm đầu tiên trên lộ trình chưa có con dấu (null nếu không có lộ trình hoặc đã có hết).
 * Chỉ là gợi ý: người học được học theo thứ tự tuỳ ý.
 */
export function nextSpotIndex(prefId: number, isDone: (spotIndex: number) => boolean): number | null {
  const r = prefectureRoute(prefId);
  if (!r) return null;
  const found = r.route.find((i) => !isDone(i));
  return found ?? null;
}
