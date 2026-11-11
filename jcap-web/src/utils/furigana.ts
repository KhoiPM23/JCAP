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

/** Tốc độ phát giọng mẫu cho phép (1 = bình thường). */
export const REFERENCE_RATES = [0.75, 0.9, 1] as const;
export const REFERENCE_RATE_KEY = 'jcap.shadowing.referenceRate';

export function readReferenceRate(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): number {
  try {
    const value = Number(storage?.getItem(REFERENCE_RATE_KEY));
    return (REFERENCE_RATES as readonly number[]).includes(value) ? value : 1;
  } catch {
    return 1;
  }
}
