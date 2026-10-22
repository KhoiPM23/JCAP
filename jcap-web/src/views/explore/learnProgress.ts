import { useSyncExternalStore } from 'react';
import { STOPS_PER_SPOT } from './learnRoute';

/**
 * Tiến độ học của từng địa điểm (0..STOPS_PER_SPOT), lưu ở trình duyệt.
 * TODO: tạm thời chưa có API; khi có thì thay phần đọc/ghi ở đây, mọi nơi dùng hook không phải đổi.
 * Khoá theo id mốc trong CSDL (nhiều mốc có thể chung một biểu tượng, vd. ba mốc ở sân bay Narita).
 */
const STORAGE_KEY = 'jcap.explore.progress.v2';

type Progress = Readonly<Record<string, number>>;

const keyOf = (spotId: number) => String(spotId);

function load(): Progress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let state: Progress = typeof window === 'undefined' ? {} : load();
const listeners = new Set<() => void>();

function commit(next: Progress, persist: boolean) {
  state = next;
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* không lưu được (chế độ riêng tư...) thì vẫn giữ trong phiên */
    }
  }
  listeners.forEach((l) => l());
}

/** Đặt tiến độ của một địa điểm (kẹp trong 0..STOPS_PER_SPOT) */
export function setSpotProgress(spotId: number, value: number) {
  const n = Math.min(Math.max(Math.round(value), 0), STOPS_PER_SPOT);
  const k = keyOf(spotId);
  if ((state[k] ?? 0) === n) return;
  commit({ ...state, [k]: n }, true);
}

export function getSpotProgress(spotId: number): number {
  return state[keyOf(spotId)] ?? 0;
}

/** Hook: component vẽ lại ngay khi tiến độ đổi (kể cả từ tab khác). Trả hàm đọc tiến độ của một địa điểm */
export function useSpotProgress(): (spotId: number) => number {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
  return (spotId) => snapshot[keyOf(spotId)] ?? 0;
}

// Đồng bộ giữa các tab (và để kiểm thử tự động ghi thẳng vào localStorage rồi phát sự kiện storage)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) commit(load(), false);
  });
  // Môi trường dev: thử đóng dấu từ Console, vd. __jcapStamp(12, 4) (id mốc, số bước)
  if (import.meta.env.DEV) {
    (window as unknown as { __jcapStamp?: typeof setSpotProgress }).__jcapStamp = setSpotProgress;
  }
}
