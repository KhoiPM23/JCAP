/**
 * Kiểu dữ liệu học của bản đồ "Khám phá". Nội dung (câu mẫu, "Một từ ở tỉnh", cách đọc tên mốc) nằm trong CSDL,
 * admin quản lý và lấy qua API (xem services/exploreService.ts); ở đây chỉ còn cách đọc tên thành phố (dữ liệu
 * hiển thị tĩnh). Chỗ nào thiếu dữ liệu thì giao diện tự ẩn phần đó, không báo lỗi.
 */

/** Một đoạn của câu: chuỗi = chữ giữ nguyên; [chữ, cách đọc] = chữ có furigana */
export type FuriganaSegment = string | [kanji: string, kana: string];

export type LearnLevel = 'N5' | 'N4' | 'N3';

export interface Phrase {
  /** Câu tiếng Nhật chia đoạn (để vẽ furigana) */
  s: FuriganaSegment[];
  /** Nghĩa tiếng Việt */
  vi: string;
  lv: LearnLevel;
  /** Thời lượng học dự kiến (phút) */
  min: number;
}

/** "Một từ ở tỉnh": [từ, cách đọc, nghĩa, ghi chú] */
export type ProvinceWord = [jp: string, kana: string, vi: string, note: string];

/** Cách đọc tên thành phố, theo tên tiếng Nhật */
export const CITY_KANA: Record<string, string> = {
  // Các tỉnh đang mở ở bản ra mắt (Chiba, Tokyo, Kyoto, Nara)
  '千葉市': 'ちばし',
  '船橋市': 'ふなばしし',
  '柏市': 'かしわし',
  '新宿区': 'しんじゅくく',
  '八王子市': 'はちおうじし',
  '京都市': 'きょうとし',
  '奈良市': 'ならし',
};

/** Toàn bộ chữ của câu (bỏ furigana) */
export const phraseText = (s: FuriganaSegment[]) => s.map((x) => (typeof x === 'string' ? x : x[0])).join('');

/** Toàn bộ câu viết bằng kana (dùng cho giọng đọc: chữ Hán đã thay bằng cách đọc) */
export const phraseKana = (s: FuriganaSegment[]) => s.map((x) => (typeof x === 'string' ? x : x[1])).join('');
