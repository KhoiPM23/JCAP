import type { FuriganaSegment } from '../types/shadowing';

/**
 * Furigana chỉ được dùng khi các đoạn ghép lại đúng bằng chữ của câu (bỏ khoảng trắng, chuẩn hóa NFKC như backend);
 * lệch (vd. câu vừa được sửa, dữ liệu cũ) thì hiện chữ thường — không hiển thị cách đọc sai.
 */
export function matchingFurigana(text: string, segments: readonly FuriganaSegment[] | undefined | null): FuriganaSegment[] | null {
  if (!segments || segments.length === 0) return null;
  const norm = (s: string) => s.normalize('NFKC').replace(/[\s　]/g, '');
  return norm(segments.map((s) => s.text).join('')) === norm(text) ? [...segments] : null;
}
