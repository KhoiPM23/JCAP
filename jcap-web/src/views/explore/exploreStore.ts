import { useEffect, useSyncExternalStore } from 'react';
import { exploreService } from '../../services/exploreService';
import type { ExploreJourney, ExplorePrefectureDetail, ExplorePrefectureSummary } from '../../types/explore';

/**
 * Dữ liệu bản đồ Khám phá lấy từ API (hành trình, mốc của từng tỉnh), dùng chung cho mọi component của trang.
 * Mỗi thứ chỉ tải một lần trong phiên; component đăng ký qua hook để vẽ lại khi dữ liệu về.
 */
type Load<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; message: string };

let journey: Load<ExploreJourney> | undefined;
const prefectures = new Map<number, Load<ExplorePrefectureDetail>>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function loadJourney(force = false) {
  if (journey && !force && journey.status !== 'error') return;
  journey = { status: 'loading' };
  emit();
  exploreService.getJourney().then((res) => {
    journey = res.success && res.data ? { status: 'ok', data: res.data } : { status: 'error', message: res.message };
    emit();
  });
}

export function loadPrefecture(id: number, force = false) {
  const cur = prefectures.get(id);
  if (cur && !force && cur.status !== 'error') return;
  prefectures.set(id, { status: 'loading' });
  emit();
  exploreService.getPrefecture(id).then((res) => {
    prefectures.set(id, res.success && res.data ? { status: 'ok', data: res.data } : { status: 'error', message: res.message });
    emit();
  });
}

/** Dữ liệu tỉnh đã tải xong (đọc đồng bộ, không gây tải) */
export function cachedPrefecture(id: number): ExplorePrefectureDetail | undefined {
  const p = prefectures.get(id);
  return p?.status === 'ok' ? p.data : undefined;
}

function useStoreVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}

export interface JourneyState {
  status: 'loading' | 'ok' | 'error';
  data?: ExploreJourney;
  message?: string;
  /** Trạng thái một tỉnh; undefined khi hành trình chưa tải xong */
  prefecture: (id: number) => ExplorePrefectureSummary | undefined;
  retry: () => void;
}

/** Hành trình (tự tải lần đầu) */
export function useExploreJourney(): JourneyState {
  useStoreVersion();
  useEffect(() => loadJourney(), []);
  const j = journey ?? { status: 'loading' as const };
  const data = j.status === 'ok' ? j.data : undefined;
  return {
    status: j.status,
    data,
    message: j.status === 'error' ? j.message : undefined,
    prefecture: (id) => data?.prefectures.find((p) => p.id === id),
    retry: () => loadJourney(true),
  };
}

/** Các mốc của một tỉnh (tự tải khi id đổi); null id = không cần */
export function usePrefectureData(id: number | null): { status: 'idle' | 'loading' | 'ok' | 'error'; data?: ExplorePrefectureDetail } {
  useStoreVersion();
  useEffect(() => {
    if (id != null) loadPrefecture(id);
  }, [id]);
  if (id == null) return { status: 'idle' };
  const p = prefectures.get(id);
  if (!p) return { status: 'loading' };
  return p.status === 'ok' ? { status: 'ok', data: p.data } : { status: p.status };
}
