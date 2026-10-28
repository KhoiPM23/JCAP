import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { cx } from '../utils';
import { AppSidebar } from './AppSidebar';

const COLLAPSE_KEY = 'jcap.sidebar.collapsed';

/** Bản đồ nặng nên tải riêng; cùng chunk với route /explore của admin */
const JapanMapView = React.lazy(() => import('../../../views/explore/JapanMapView').then((m) => ({ default: m.JapanMapView })));

function readCollapsed(): boolean {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY);
    if (v !== null) return v === '1';
  } catch {
    /* bỏ qua */
  }
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

/** Trang bản đồ Hành trình (trang chủ): thanh bên nổi trên bản đồ thay vì áp sát mép */
export const isMapPath = (p: string) => p === '/' || p.startsWith('/explore');

/**
 * Khung ứng dụng của học viên: một thanh bên (240px, thu gọn 72px, nhớ trạng thái) và nội dung bên phải.
 *
 * Chuyển cảnh làm theo prototype (design-handoff/prototype, class .pgbg / .pg): bản đồ là một lớp luôn nằm dưới và KHÔNG bị
 * gỡ khi sang trang khác. Rời bản đồ: nền trang phủ dần lên (0,28s), thanh bên biến từ dạng nổi sang dạng áp mép (0,3s), rồi
 * nội dung trang hiện lên. Quay về bản đồ: nền trang mờ dần để lộ bản đồ đã sẵn sàng, không phải tải và dựng lại (dựng bản đồ
 * lần đầu mất hàng trăm ms và là nguyên nhân gây khựng).
 */
export const LearnerShell: React.FC = () => {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const map = isMapPath(pathname);
  const inPrefecture = map && !!params.get('tinh');

  // Lớp bản đồ dựng một lần rồi giữ. Vào thẳng một trang khác thì dựng sẵn lúc trình duyệt rảnh, để lần đầu về bản đồ không bị khựng
  const [mapMounted, setMapMounted] = useState(map);
  useEffect(() => {
    if (map) setMapMounted(true);
  }, [map]);
  useEffect(() => {
    if (mapMounted) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(() => setMapMounted(true), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(h);
    }
    const t = window.setTimeout(() => setMapMounted(true), 1500);
    return () => window.clearTimeout(t);
  }, [mapMounted]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !c;
    });
  };

  return (
    <div className={cx('jx-app', !map && 'is-page', collapsed && 'is-collapsed', inPrefecture && 'is-pref')} data-theme="hoc-tap">
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggle} />

      {/* Lớp bản đồ: ở trang khác thì ẩn (inert: không nhận focus, không bấm được) nhưng vẫn giữ nguyên trạng thái */}
      {mapMounted && (
        <div className={cx('jx-maplayer', !map && 'is-hidden')} aria-hidden={!map} inert={!map}>
          <React.Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-paper-100">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-ai" />
              </div>
            }
          >
            <JapanMapView active={map} />
          </React.Suspense>
        </div>
      )}

      {/* Nền trang phủ lên bản đồ bằng cross-fade */}
      <div className="jx-pgbg" aria-hidden="true" />

      {!map && (
        <main className="jx-page">
          <div key={pathname} className="jx-page-inner px-4 py-5 md:p-8">
            <Outlet />
          </div>
        </main>
      )}
    </div>
  );
};
