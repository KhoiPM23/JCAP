/**
 * Hàm thuần cho bản đồ tỉnh (design-handoff mục 9k): tên ngắn, gom khu vực, chữ đọc trạng thái mốc.
 * Khu vực không phải dữ liệu mới, chỉ tách từ tên mốc: "Sân bay Narita · Sảnh đón khách" thuộc "Sân bay Narita".
 */
import type { SpotStamp } from './learnProgress';

const SEPARATOR = ' · ';
/** Một khu vực cần ít nhất chừng này mốc liền nhau trên lộ trình */
const AREA_MIN_SPOTS = 2;

/** Phần sau " · " của tên mốc; tên không có dấu phân cách thì giữ nguyên */
export function shortName(nameVi: string): string {
  const at = nameVi.indexOf(SEPARATOR);
  return at < 0 ? nameVi : nameVi.slice(at + SEPARATOR.length).trim();
}

const prefixOf = (nameVi: string): string | null => {
  const at = nameVi.indexOf(SEPARATOR);
  return at < 0 ? null : nameVi.slice(0, at).trim() || null;
};

export interface SpotArea {
  name: string;
  /** Chỉ số mốc (trong mảng tên đưa vào) thuộc khu vực, theo thứ tự lộ trình */
  members: number[];
}

/** Gom các mốc liền nhau (theo thứ tự đưa vào) có cùng tiền tố trước " · " */
export function spotAreas(names: readonly string[]): SpotArea[] {
  const areas: SpotArea[] = [];
  let run: SpotArea | null = null;
  const flush = () => {
    if (run && run.members.length >= AREA_MIN_SPOTS) areas.push(run);
    run = null;
  };
  names.forEach((nameVi, i) => {
    const prefix = prefixOf(nameVi);
    if (!prefix) return flush();
    if (run && run.name === prefix) {
      run.members.push(i);
      return;
    }
    flush();
    run = { name: prefix, members: [i] };
  });
  flush();
  return areas;
}

export const STAMP_TEXT: Record<SpotStamp, string> = {
  none: 'chưa học',
  understood: 'đã hiểu',
  stamp: 'có con dấu',
  red: 'có dấu son',
};
