import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useTheme } from '../../../contexts/ThemeContext';
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
 * Các trang đã làm lại theo design system nên có chế độ tối. Trang còn lại (Credit, Flashcard, Kết quả, chi tiết kịch bản…)
 * vẫn dùng màu cứng của giao diện cũ, nên ở chế độ tối được đặt trong một tấm sáng để chữ không bị chìm.
 */
const THEMED_PATHS = ['/stamps', '/scenarios', '/shadowing', '/shadowing/catalog', '/profile', '/subscription', '/credits/subscription', '/settings'];
const isThemedPath = (p: string) => THEMED_PATHS.includes(p.replace(/\/+$/, '') || '/');

/**
 * Một trang trong khung. Khi bị gỡ vì đã sang trang khác, để lại một bản sao DOM (chỉ để nhìn) mờ dần trong 0,14s như prototype
 * (trang cũ mất .on: opacity 0,14s, transform 0,2s), trang mới vào sau đó 0,14s. Không có bản sao thì trang cũ biến mất tức thì.
 */
const PageFrame: React.FC<{ routeKey: string; currentKey: React.MutableRefObject<string>; ghostRef: React.RefObject<HTMLDivElement | null>; className: string; children: React.ReactNode }> = ({
  routeKey,
  currentKey,
  ghostRef,
  className,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      const host = ghostRef.current;
      // currentKey đã là đường dẫn mới khi trang bị gỡ vì điều hướng; StrictMode (dev) chạy dọn dẹp giả thì đường dẫn chưa đổi nên bỏ qua
      if (!el || !host || !el.isConnected || currentKey.current === routeKey) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.className = clone.className.replace('jx-page-inner', 'jx-ghost-inner');
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      clone.setAttribute('inert', '');
      const scrollTop = el.closest('.jx-page')?.scrollTop ?? 0;
      clone.style.width = `${el.getBoundingClientRect().width}px`;
      clone.style.transform = scrollTop ? `translateY(${-scrollTop}px)` : '';
      const ghost = document.createElement('div');
      ghost.className = 'jx-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.appendChild(clone);
      host.appendChild(ghost);
      window.setTimeout(() => ghost.remove(), 260);
    };
  }, [routeKey, currentKey, ghostRef]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
};

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
  const { isDark, themeFor } = useTheme();
  const mapRoute = isMapPath(pathname);
  // Chuyển cảnh chỉ bắt đầu sau khi phần việc nặng đã xong, để hoạt ảnh chạy trên luồng chính rảnh:
  // - rời bản đồ: trang mới được dựng và bố cục khi còn ẩn (render, tính style, đo chữ), hai khung hình sau mới chạy hiệu ứng;
  // - về bản đồ: bản đồ được đánh thức (hết content-visibility: hidden) khi còn nằm sau nền trang đặc, hai khung hình sau mới mờ nền đi.
  const [looksMap, setLooksMap] = useState(mapRoute);
  useEffect(() => {
    if (looksMap === mapRoute) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setLooksMap(mapRoute));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [mapRoute, looksMap]);
  const map = looksMap;
  const pending = !mapRoute && looksMap;
  const asleep = !mapRoute && !looksMap;
  const currentKey = useRef(pathname);
  currentKey.current = pathname;
  const ghostRef = useRef<HTMLDivElement>(null);
  const lightIsland = isDark && !mapRoute && !isThemedPath(pathname);

  // Nền ngoài khung (vùng cuộn thừa, đầu trang) theo màu tối khi bật chế độ tối; chỉ đặt khi khung học viên đang hiện
  useEffect(() => {
    if (!isDark) return;
    document.body.dataset.theme = themeFor('learn');
    return () => {
      delete document.body.dataset.theme;
    };
  }, [isDark, themeFor]);
  const inPrefecture = mapRoute && !!params.get('tinh');

  // Lớp bản đồ dựng một lần rồi giữ. Vào thẳng một trang khác thì dựng sẵn lúc trình duyệt rảnh, để lần đầu về bản đồ không bị khựng
  const [mapMounted, setMapMounted] = useState(mapRoute);
  useEffect(() => {
    if (mapRoute) setMapMounted(true);
  }, [mapRoute]);
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
    <div className={cx('jx-app', !map && 'is-page', collapsed && 'is-collapsed', inPrefecture && 'is-pref')} data-theme={themeFor('learn')}>
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggle} onMap={map} />

      {/* Lớp bản đồ: ở trang khác thì ẩn (inert: không nhận focus, không bấm được) nhưng vẫn giữ nguyên trạng thái */}
      {mapMounted && (
        <div className={cx('jx-maplayer', asleep && 'is-hidden')} aria-hidden={!mapRoute} inert={!mapRoute}>
          <React.Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-paper-100">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-ai" />
              </div>
            }
          >
            <JapanMapView active={mapRoute} />
          </React.Suspense>
        </div>
      )}

      {/* Nền trang phủ lên bản đồ bằng cross-fade */}
      <div className="jx-pgbg" aria-hidden="true" />

      {!mapRoute && (
        <main className={cx('jx-page', pending && 'is-pending')}>
          <PageFrame key={pathname} routeKey={pathname} currentKey={currentKey} ghostRef={ghostRef} className="jx-page-inner px-4 py-5 md:p-8">
            {lightIsland ? (
              <div data-theme="hoc-tap" className="jx-light-island">
                <Outlet />
              </div>
            ) : (
              <Outlet />
            )}
          </PageFrame>
        </main>
      )}

      {/* Bản sao mờ dần của trang vừa rời đi */}
      <div ref={ghostRef} className="jx-ghosts" aria-hidden="true" />
    </div>
  );
};
