import React, { useSyncExternalStore } from 'react';
import type { FuriganaSegment } from '../../data/learnContent';

/** Bật/tắt furigana cho cả trang Khám phá, nhớ trong trình duyệt (mặc định bật) */
const STORAGE_KEY = 'jcap.explore.furigana';

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

let on = typeof window === 'undefined' ? true : read();
const listeners = new Set<() => void>();

export function setFurigana(value: boolean) {
  if (value === on) return;
  on = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* không lưu được thì vẫn giữ trong phiên */
  }
  listeners.forEach((l) => l());
}

/** [đang bật, hàm đảo] */
export function useFurigana(): [boolean, () => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => on,
  );
  return [value, () => setFurigana(!on)];
}

/** Câu tiếng Nhật chia đoạn: chuỗi giữ nguyên, [chữ, cách đọc] có furigana khi `show` */
export const FuriganaText: React.FC<{ segments: FuriganaSegment[]; show: boolean }> = ({ segments, show }) => (
  <>
    {segments.map((seg, i) =>
      typeof seg === 'string' ? (
        <React.Fragment key={i}>{seg}</React.Fragment>
      ) : show ? (
        <ruby key={i}>
          {seg[0]}
          <rt>{seg[1]}</rt>
        </ruby>
      ) : (
        <React.Fragment key={i}>{seg[0]}</React.Fragment>
      ),
    )}
  </>
);
