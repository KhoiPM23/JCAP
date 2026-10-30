import type { ExploreSpotProgress } from '../../types/explore';
import { cachedSpot, useStoreVersion } from './exploreStore';

/**
 * Tiến độ của từng mốc, lấy từ dữ liệu tỉnh của API (server cấp con dấu, client chỉ đọc).
 * - none: chưa làm gì; understood: đã bấm "Đã hiểu", chưa có con dấu
 * - stamp: có con dấu (Hiểu + Shadowing đạt); red: có thêm dấu son (Hội thoại AI)
 */
export type SpotStamp = 'none' | 'understood' | 'stamp' | 'red';

export function stampOf(progress: ExploreSpotProgress | undefined): SpotStamp {
  if (progress?.redStampedAt) return 'red';
  if (progress?.stampedAt) return 'stamp';
  if (progress?.understoodAt) return 'understood';
  return 'none';
}

/** Mốc đã có con dấu (kể cả dấu son) */
export const isStamped = (s: SpotStamp) => s === 'stamp' || s === 'red';

/** Hook: component vẽ lại ngay khi tiến độ đổi. Trả hàm đọc trạng thái con dấu của một mốc (theo id trong CSDL) */
export function useSpotProgress(): (spotId: number) => SpotStamp {
  useStoreVersion();
  return (spotId) => stampOf(cachedSpot(spotId)?.progress);
}
