import { projectLonLat } from '../../data/japanMap';
import type { ExploreSpotCheckKey, ExploreSpotStatus } from '../../types/adminExplore';

/** Nhãn các mục kiểm tra trước khi chuyển mốc sang "Đang dùng" (thứ tự hiển thị) */
export const SPOT_CHECKS: { key: ExploreSpotCheckKey; label: string; hint: string }[] = [
  { key: 'place', label: 'Tên và vị trí', hint: 'Tên tiếng Việt, tên tiếng Nhật, biểu tượng, vị trí trong nước Nhật.' },
  { key: 'sentence', label: 'Câu mẫu và nghĩa', hint: 'Câu tiếng Nhật người học sẽ nói, kèm nghĩa tiếng Việt.' },
  { key: 'target', label: 'Ngữ pháp/từ vựng mục tiêu', hint: 'Ít nhất một điểm ngữ pháp hoặc từ vựng theo cấp độ.' },
  { key: 'situation', label: 'Tình huống', hint: 'Chuyện gì xảy ra ở đúng địa điểm này.' },
  { key: 'realUse', label: 'Dùng thật', hint: 'Người học dùng câu này ngoài đời khi nào.' },
  { key: 'shadowing', label: 'Bài Shadowing', hint: 'Gắn một bài Shadowing đang dùng (bước ② của mốc).' },
];

export const STATUS_LABEL: Record<ExploreSpotStatus, string> = {
  Draft: 'Nháp',
  Published: 'Đang dùng',
};

export const STATUS_BADGE: Record<ExploreSpotStatus, string> = {
  Draft: 'bg-orange-50 text-orange-700 border-orange-200',
  Published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

/** Hệ số kinh độ của phép chiếu bản đồ (khớp projectLonLat trong data/japanMap.ts) */
const LON_SCALE = projectLonLat(0, 123)[0] - projectLonLat(0, 122)[0];

/** [x, y] trên bản đồ -> [vĩ độ, kinh độ] (phép ngược của projectLonLat) */
export function unproject(x: number, y: number): [number, number] {
  return [46 - y / 100, 122 + x / LON_SCALE];
}

/** Đọc toạ độ dán từ Google Maps ("35.7147, 139.7967") hoặc hai số cách nhau bởi dấu cách */
export function parseLatLon(text: string): [number, number] | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

export const inJapan = (lat: number, lon: number) => lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154;

export const formatCoord = (v: number) => (Number.isFinite(v) ? v.toFixed(5).replace(/0+$/, '').replace(/\.$/, '') : '');
