import { useEffect, useSyncExternalStore } from 'react';
import { exploreService } from '../../services/exploreService';
import type { ApiResponse } from '../../types/auth';
import type { ExploreJourney, ExplorePrefectureDetail, ExplorePrefectureSummary } from '../../types/explore';

/**
 * Dữ liệu bản đồ Khám phá lấy từ API (hành trình, mốc của từng tỉnh), dùng chung cho mọi component của trang.
 *
 * Dữ liệu đã tải được giữ lại để hiện ngay, nhưng mỗi lần vào trang hoặc mở một tỉnh đều được tải lại ngầm:
 * admin có thể đã sửa nội dung (vị trí mốc, mốc mới, tỉnh vừa mở) trong lúc trang người học vẫn giữ bản cũ.
 * Tải lại ngầm không đưa trang về trạng thái "đang tải"; lỗi mạng khi tải lại thì giữ dữ liệu cũ.
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

/** Nhiều component cùng xin một dữ liệu trong một lúc thì chỉ gọi API một lần */
const inflight = new Set<string>();
/** Lần tải xong gần nhất (ms), để không gọi lại liên tục khi nhiều component cùng gắn vào */
const fetchedAt = new Map<string, number>();
/** Trong khoảng này coi dữ liệu là mới, không tải lại */
const FRESH_MS = 2000;
/** Quay lại tab: chỉ tải lại khi lần tải trước đã cách ít nhất khoảng này */
const REFOCUS_MS = 15000;

function fetchInto<T>(
  key: string,
  get: () => Load<T> | undefined,
  set: (v: Load<T>) => void,
  request: () => Promise<ApiResponse<T>>,
  force: boolean,
  freshMs = FRESH_MS,
) {
  if (inflight.has(key)) return;
  const cur = get();
  const at = fetchedAt.get(key) ?? 0;
  if (!force && cur?.status === 'ok' && Date.now() - at < freshMs) return;
  inflight.add(key);
  // Chưa có dữ liệu thì hiện "đang tải"; đã có thì tải lại ngầm, giữ dữ liệu cũ trên màn hình
  if (cur?.status !== 'ok') {
    set({ status: 'loading' });
    emit();
  }
  request().then((res) => {
    inflight.delete(key);
    fetchedAt.set(key, Date.now());
    const prev = get();
    if (res.success && res.data) {
      // Không đổi gì thì giữ nguyên object cũ: tránh vẽ lại bản đồ và tính lại lộ trình vô ích
      if (prev?.status === 'ok' && JSON.stringify(prev.data) === JSON.stringify(res.data)) return;
      set({ status: 'ok', data: res.data });
    } else if (prev?.status === 'ok') {
      return; // tải lại ngầm lỗi: giữ dữ liệu đang hiện
    } else {
      set({ status: 'error', message: res.message });
    }
    emit();
  });
}

export function loadJourney(force = false, freshMs = FRESH_MS) {
  fetchInto('journey', () => journey, (v) => (journey = v), () => exploreService.getJourney(), force, freshMs);
}

export function loadPrefecture(id: number, force = false, freshMs = FRESH_MS) {
  fetchInto(
    `prefecture:${id}`,
    () => prefectures.get(id),
    (v) => prefectures.set(id, v),
    () => exploreService.getPrefecture(id),
    force,
    freshMs,
  );
}

// Quay lại tab Khám phá đang mở sẵn (admin có thể vừa sửa ở tab khác): tải lại những gì đã tải
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || listeners.size === 0) return;
    if (journey) loadJourney(false, REFOCUS_MS);
    prefectures.forEach((_, id) => loadPrefecture(id, false, REFOCUS_MS));
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

/** Hành trình (tải khi vào trang; đã có thì hiện ngay và tải lại ngầm) */
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

/** Các mốc của một tỉnh (tải khi id đổi; đã có thì hiện ngay và tải lại ngầm); null id = không cần */
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
