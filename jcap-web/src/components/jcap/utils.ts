import { useState } from 'react';

/** Ghép tên class, bỏ giá trị rỗng/false */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Giá trị có thể điều khiển từ ngoài (value + onChange) hoặc tự giữ (defaultValue) */
export function useControlled<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  return [
    controlled ? (value as T) : inner,
    (v: T) => {
      if (!controlled) setInner(v);
      onChange?.(v);
    },
  ];
}

/** Số theo kiểu Việt Nam (3.800) */
export const fmt = (n: number | string) => (typeof n === 'number' ? n.toLocaleString('vi-VN') : n);

export type Jlpt = 'N5' | 'N4' | 'N3';
export type Tone = 'info' | 'success' | 'warning' | 'danger';

/** Mức điểm: ≥80 tốt, ≥50 trung bình, còn lại thấp */
export type Verdict = 'good' | 'mid' | 'low';
export const verdict = (v: number): Verdict => (v >= 80 ? 'good' : v >= 50 ? 'mid' : 'low');
export const VERDICT: Record<Verdict, [label: string, icon: string]> = {
  good: ['Khớp tốt', 'check_circle'],
  mid: ['Khớp một phần', 'change_history'],
  low: ['Chưa khớp', 'cancel'],
};
