import { prefectureLandmarks } from './prefectureDetail';

/**
 * Lộ trình học của một tỉnh: đi theo thứ tự admin tạo mốc (API trả mốc theo ID tăng dần).
 * Tính một lần cho mỗi tỉnh.
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
    const route = spots.map((_, i) => i);
    result = { route, stop: route.map((i) => i + 1) };
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
