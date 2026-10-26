import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PREFECTURES, REGIONS, type PrefectureShape, type RegionId } from '../../data/japanMap';
import { PICTOGRAM_CREDIT, PICTOGRAM_KIND_LABEL, PICTOGRAM_PREFECTURES, pictogramUrl } from '../../data/japanPictograms';
import { JapanMap, PREFECTURE_BY_ID, REGION_NAME, REGION_STYLE } from './JapanMap';
import type { ProvinceWord } from '../../data/learnContent';
import type { ExploreProvinceWord } from '../../types/explore';
import { useExploreJourney, usePrefectureData } from './exploreStore';
import { THEME_CSS_VARS, T } from './exploreTheme';
import { ChatIcon, MicIcon, PictogramIcon } from './exploreUi';
import { useFurigana } from './furigana';
import { useSpotProgress } from './learnProgress';
import { STOPS_PER_SPOT, nextSpotIndex, prefectureRoute } from './learnRoute';
import { BOUNDARY_CREDIT, prefectureFoods, prefectureLandmarks } from './prefectureDetail';
import { WordCard } from './WordCard';

const PANEL_WIDTH_PX = 360;
const SHEET_HEIGHT_PX = 320;
const PANEL_EXIT_MS = 180;

const PREFECTURE_BY_SLUG = new Map(PREFECTURES.map((p) => [p.slug, p]));
const REGION_JP = new Map(REGIONS.map((r) => [r.id, r.nameJp]));

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Bỏ dấu tiếng Việt + chữ thường để tìm "kyoto", "Kyōto", "京都" đều ra */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Trạng thái lịch sử do trang này đẩy vào: số mục đã đẩy (để "Xem toàn quốc" lùi đúng bấy nhiêu bước) */
type MapNavState = { jmDepth?: number; jmSpot?: boolean } | null;

/**
 * Trang "Khám phá": bản đồ Nhật Bản toàn màn hình, kéo/phóng to tự do. Bấm một tỉnh để bay tới tỉnh đó,
 * bấm một địa điểm để bay tới địa điểm (bản phác thảo, chưa gắn nội dung học).
 * Lựa chọn nằm trên URL (?tinh=kyoto&dd=2) để chia sẻ link và để nút Back lùi lần lượt từng cấp.
 */
export const JapanMapView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isWide = useMediaQuery('(min-width: 1024px)');
  const isTouch = useMediaQuery('(pointer: coarse)');
  const isWideHint = useMediaQuery('(min-width: 761px)');
  const [interacted, setInteracted] = useState(false);
  const [furigana] = useFurigana();
  const journey = useExploreJourney();
  /** Thông báo nổi khi bấm vào tỉnh admin chưa mở ("Sẽ cập nhật trong tương lai") */
  const [notice, setNotice] = useState<{ prefId: number; key: number } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);
  const showClosedNotice = (prefId: number) => setNotice({ prefId, key: Date.now() });

  const selected = PREFECTURE_BY_SLUG.get(searchParams.get('tinh') ?? '') ?? null;
  const selectedId = selected?.id ?? null;
  const spotParam = Number(searchParams.get('dd'));
  // dd = số thứ tự (từ 1) của địa danh trong danh sách địa điểm học của tỉnh
  const activeSpot =
    selected && spotParam >= 1 && spotParam <= prefectureLandmarks(selected.id).length ? spotParam - 1 : null;

  const selectedWord = toProvinceWord(selected ? journey.prefecture(selected.id)?.word : null);

  const navState = (location.state as MapNavState) ?? {};
  const depth = navState.jmDepth ?? 0;

  const selectPrefecture = (id: number | null) => {
    if (id == null) {
      if (!selected) return;
      // Lùi đúng số mục trang đã đẩy, để Back và "Xem toàn quốc" cho cùng kết quả
      if (depth > 0) navigate(-depth);
      else setSearchParams({}, { replace: true });
      return;
    }
    const pref = PREFECTURE_BY_ID.get(id);
    if (!pref || pref.id === selectedId) return;
    setInteracted(true);
    // Tỉnh admin chưa mở: không vào được, chỉ báo "Sẽ cập nhật trong tương lai"
    if (journey.status === 'ok' && !journey.prefecture(id)?.isOpen) {
      showClosedNotice(id);
      return;
    }
    if (selected) setSearchParams({ tinh: pref.slug }, { replace: true, state: { jmDepth: depth, jmSpot: false } });
    else setSearchParams({ tinh: pref.slug }, { state: { jmDepth: depth + 1 } });
  };

  const selectSpot = (n: number | null) => {
    if (!selected) return;
    if (n == null) {
      if (activeSpot == null) return;
      if (navState.jmSpot) navigate(-1);
      else setSearchParams({ tinh: selected.slug }, { replace: true, state: { ...navState, jmSpot: false } });
      return;
    }
    if (n === activeSpot) return;
    const params = { tinh: selected.slug, dd: String(n + 1) };
    if (activeSpot != null) setSearchParams(params, { replace: true, state: navState });
    else setSearchParams(params, { state: { jmDepth: depth + 1, jmSpot: true } });
  };

  const selectedData = usePrefectureData(selectedId);
  useEffect(() => {
    if (selectedId == null) return;
    const closedByJourney = journey.status === 'ok' && !journey.prefecture(selectedId)?.isOpen;
    const closedByDetail = selectedData.status === 'ok' && !selectedData.data?.isOpen;
    if (!closedByJourney && !closedByDetail) return;
    showClosedNotice(selectedId);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, journey.status, selectedData.status]);

  // Esc: lùi một cấp (địa điểm -> tỉnh -> toàn quốc); bỏ qua nếu thành phần khác đã xử lý (ô tìm tỉnh)
  const backRef = useRef(() => {});
  backRef.current = () => (activeSpot != null ? selectSpot(null) : selectPrefecture(null));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) backRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Quản lý focus: mở tỉnh -> focus tiêu đề panel; đóng -> trả focus về đúng tỉnh trên bản đồ
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevSelectedIdRef = useRef<number | null>(selectedId);
  useEffect(() => {
    const prev = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selectedId;
    if (prev === selectedId) return;
    // Đợi khung hình đầu vẽ xong mới chuyển focus: focus() ngay sau khi DOM vừa đổi ép trình duyệt tính lại bố cục
    // cả trang đồng bộ, đúng lúc camera bắt đầu bay (khựng); sau khi vẽ xong thì bố cục đã sẵn, focus gần như miễn phí
    let timer = 0;
    const raf = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (selectedId != null) {
          headingRef.current?.focus({ preventScroll: true });
        } else if (prev != null) {
          document.querySelector<SVGPathElement>(`path[data-pref-id="${prev}"]`)?.focus({ preventScroll: true });
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [selectedId]);

  // Giữ panel thêm một nhịp khi đóng để chạy hiệu ứng thoát.
  // Panel hiển thị `selected` ngay trong lần render đầu (để focus được tiêu đề), chỉ dùng tỉnh cũ khi đang đóng.
  const [lastPref, setLastPref] = useState<PrefectureShape | null>(selected);
  const panelPref = selected ?? lastPref;
  const closing = !selected && lastPref != null;
  useEffect(() => {
    if (selected) {
      setLastPref(selected);
      return;
    }
    const t = window.setTimeout(() => setLastPref(null), PANEL_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [selected]);

  return (
    <div className="jm-ukiyoe h-screen flex flex-col bg-[var(--sea)] text-[var(--ink)] font-sans overflow-hidden">
      {/* Font Nhật: Noto Sans JP cho tên, Shippori Mincho B1 cho chữ Hán kiểu khắc gỗ (React 19 tự đưa lên <head>) */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700&family=Shippori+Mincho+B1:wght@600;800&display=swap"
        precedence="default"
      />

      {/* Thanh trên cùng */}
      <header className="jm-topbar relative h-16 shrink-0 px-3 sm:px-6 flex items-center gap-2 sm:gap-4 z-30">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Về trang chủ"
          className="jm-focus flex items-center gap-2 h-11 min-w-11 justify-center px-3 rounded-[6px] text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)] transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-medium">Về trang chủ</span>
        </button>

        <div className="h-7 w-px bg-[var(--rule)] shrink-0" aria-hidden="true" />

        <nav aria-label="Vị trí hiện tại" className="flex items-center gap-2 min-w-0 flex-1 text-sm">
          <CompassIcon className="w-5 h-5 text-[#0878EE] shrink-0" />
          {selected ? (
            <>
              <button
                type="button"
                onClick={() => selectPrefecture(null)}
                className="jm-focus shrink-0 rounded-md font-semibold text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Nhật Bản
              </button>
              <span className="text-[var(--ghost)]" aria-hidden="true">
                /
              </span>
              {activeSpot != null ? (
                <>
                  <button
                    type="button"
                    onClick={() => selectSpot(null)}
                    className="jm-focus shrink-0 rounded-md font-semibold text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                  >
                    {selected.nameVi}
                  </button>
                  <span className="text-[var(--ghost)]" aria-hidden="true">
                    /
                  </span>
                  <span className="font-bold truncate" aria-current="page">
                    {prefectureLandmarks(selected.id)[activeSpot].pictogram.nameVi}
                  </span>
                </>
              ) : (
                <span className="font-bold truncate" aria-current="page">
                  {selected.nameVi} <span className="font-jp font-medium text-[var(--ink-2)]">{selected.nameJp}</span>
                </span>
              )}
            </>
          ) : (
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight truncate">Khám phá Nhật Bản</h1>
              <p className="hidden sm:block text-xs text-[var(--muted)]">47 tỉnh · 8 vùng</p>
            </div>
          )}
        </nav>

        <PrefecturePicker onPick={selectPrefecture} isClosed={(id) => journey.status === 'ok' && !journey.prefecture(id)?.isOpen} />

        {selected && (
          <button
            type="button"
            onClick={() => selectPrefecture(null)}
            aria-label="Xem toàn quốc"
            className="jm-focus flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-4 rounded-[6px] bg-[var(--primary-soft)] text-[var(--primary-ink)] text-sm font-semibold hover:bg-[#D7E8FD] transition-colors"
          >
            <ZoomOutIcon className="w-5 h-5" />
            <span className="hidden md:inline">Xem toàn quốc</span>
          </button>
        )}
      </header>

      {/* Vùng bản đồ (biển, bờ, đất do JapanMap vẽ) */}
      <main className="relative flex-1 min-h-0 bg-[var(--sea)]">
        <JapanMap
          selectedId={selectedId}
          onSelect={selectPrefecture}
          activeSpot={activeSpot}
          onSpotSelect={selectSpot}
          reserveRight={selected && isWide ? PANEL_WIDTH_PX + 24 : 0}
          reserveBottom={selected && !isWide ? SHEET_HEIGHT_PX : 0}
          onInteract={() => setInteracted(true)}
        />

        {/* Gợi ý thao tác: ẩn sau lần kéo/phóng to/chọn tỉnh đầu tiên */}
        {!selected && !interacted && !notice && journey.status !== 'error' && (
          <div className="pointer-events-none absolute z-10 top-3 sm:top-4 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-2rem)] flex items-center justify-center gap-2 rounded-[8px] sm:rounded-full bg-[var(--paper)] border border-[var(--ink-line)] px-3.5 sm:px-4 py-2 text-[12.5px] sm:text-sm text-center text-balance text-[var(--ink-2)] shadow-[var(--sh-2)]">
            <PointerIcon className="w-4 h-4 text-[var(--shu)]" />
            {isTouch || !isWideHint
              ? 'Kéo, chụm hai ngón để phóng to, chạm vào một tỉnh'
              : 'Kéo để di chuyển · Cuộn để phóng to · Bấm vào một tỉnh'}
          </div>
        )}

        {/* Bấm vào tỉnh admin chưa mở */}
        {notice && (
          <ClosedNotice
            key={notice.key}
            pref={PREFECTURE_BY_ID.get(notice.prefId)!}
            word={toProvinceWord(journey.prefecture(notice.prefId)?.word)}
            furigana={furigana}
            onClose={() => setNotice(null)}
          />
        )}

        {/* Không tải được dữ liệu Khám phá (máy chủ chưa chạy, mất mạng...) */}
        {journey.status === 'error' && !notice && (
          <div role="alert" className="absolute z-20 top-3 sm:top-4 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-2rem)] flex items-center gap-3 rounded-[8px] bg-[var(--paper)] border border-[var(--ink-line)] px-4 py-2.5 text-sm text-[var(--ink)] shadow-[var(--sh-2)]">
            Không tải được dữ liệu bản đồ.
            <button type="button" onClick={journey.retry} className="jm-focus rounded-[6px] bg-[var(--primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--primary-ink)]">
              Thử lại
            </button>
          </div>
        )}

        {/* Ô tên tranh kiểu tranh khắc gỗ: chỉ ở bản đồ toàn quốc, ẩn trên điện thoại */}
        {!selected && (
          <div className="jm-plate" aria-hidden="true">
            <div className="jm-plate-box" lang="ja">
              <span className="jm-plate-t1">日本めぐり</span>
              <span className="jm-plate-t2">四十七都道府県</span>
            </div>
            <div className="jm-plate-vi">Hành trình 47 tỉnh</div>
          </div>
        )}

        {!selected && <PanelWarmUp />}

        {import.meta.env.DEV && <MissingIconsDevNotice />}

        {/* "Một từ ở tỉnh": thẻ nổi góc trên trái ở cấp tỉnh (điện thoại: nằm trong panel) */}
        {selected && activeSpot == null && isWide && selectedWord && (
          <div className="jm-reveal" style={{ animationDelay: '0.5s' }}>
            <WordCard
              key={selected.id}
              variant="floating"
              provinceNameVi={selected.nameVi}
              word={selectedWord}
              furigana={furigana}
              ink={REGION_STYLE[selected.region].ink}
            />
          </div>
        )}

        {/* Thông tin tỉnh: panel bên phải (màn rộng) hoặc ngăn dưới (màn hẹp) */}
        {panelPref && (
          <PrefecturePanel
            key={panelPref.id}
            pref={panelPref}
            isWide={isWide}
            closing={closing}
            activeSpot={selected ? activeSpot : null}
            onSpotSelect={selectSpot}
            onClose={() => selectPrefecture(null)}
            headingRef={headingRef}
          />
        )}

        <style>{`
          .jm-ukiyoe { ${THEME_CSS_VARS} }
          .jm-count { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--paper-2); font-size: 12px;
            font-weight: 600; color: var(--ink-2); display: inline-grid; place-items: center; font-variant-numeric: tabular-nums; }
          .font-jp { font-family: 'Noto Sans JP', 'Inter', system-ui, sans-serif; }
          .jm-focus:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
          .jm-topbar { background: linear-gradient(180deg, var(--sky) 0%, var(--paper) 100%);
            box-shadow: 0 1px 0 var(--ink-line), 0 4px 0 var(--paper), 0 5px 0 var(--ink-line); }
          .jm-plate { position: absolute; z-index: 5; left: 24px; top: 24px; display: flex; align-items: flex-start; gap: 10px; pointer-events: none; }
          .jm-plate-box { display: flex; flex-direction: row-reverse; gap: 6px; padding: 12px 8px; background: var(--paper); border: 1px solid var(--ink-line);
            box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--ink-line), 3px 4px 0 4px rgba(8,20,44,.25); }
          .jm-plate-box span { writing-mode: vertical-rl; text-orientation: upright; font-family: var(--font-mincho); color: var(--ink); line-height: 1; }
          .jm-plate-t1 { font-size: 22px; font-weight: 800; letter-spacing: .16em; }
          .jm-plate-t2 { font-size: 13px; font-weight: 600; letter-spacing: .2em; margin-top: 18px; color: var(--ink-2) !important; }
          .jm-plate-vi { margin-top: 2px; font-size: 12px; font-weight: 600; color: var(--foam); writing-mode: vertical-rl; letter-spacing: .06em; opacity: .9; }
          @media (max-width: 760px) { .jm-plate { display: none; } }
          .jm-paper-panel { background: var(--paper); border: 1px solid var(--ink-line);
            box-shadow: inset 0 0 0 3px var(--paper), inset 0 0 0 4px var(--rule), var(--sh-3); }
          .jm-ph-name { font-family: var(--font-mincho); font-weight: 800; font-size: 38px; line-height: 1.15; letter-spacing: .04em; }
          @media (max-width: 1023px) { .jm-ph-name { font-size: 27px; } }
          .jm-panel-right { animation: jm-slide-left 0.32s cubic-bezier(0.22, 1, 0.36, 1) 0.18s both; }
          .jm-panel-bottom { animation: jm-slide-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) 0.18s both; }
          .jm-panel-right.jm-closing { animation: jm-slide-left-out ${PANEL_EXIT_MS}ms ease-in both; }
          .jm-panel-bottom.jm-closing { animation: jm-slide-down-out ${PANEL_EXIT_MS}ms ease-in both; }
          .jm-reveal { animation: jm-reveal 0.22s ease-out both; }
          @keyframes jm-slide-left { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
          @keyframes jm-slide-up { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: none; } }
          @keyframes jm-slide-left-out { to { opacity: 0; transform: translateX(16px); } }
          @keyframes jm-slide-down-out { to { opacity: 0; transform: translateY(24px); } }
          @keyframes jm-reveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
          @media (prefers-reduced-motion: reduce) {
            .jm-panel-right, .jm-panel-bottom, .jm-reveal { animation: none !important; }
          }
        `}</style>
      </main>
    </div>
  );
};

// ============================================================
// Panel thông tin tỉnh
// ============================================================

/** Một lần cho cả phiên: lần đầu dựng chữ Nhật (phông, bộ nhớ đệm ký tự) rất tốn, không cần làm lại */
let panelWarmed = false;
const WARM_PREF = PREFECTURE_BY_ID.get(13);

/**
 * Dựng sẵn một panel ẩn (ngoài màn hình, visibility hidden) ngay khi trình duyệt rảnh và phông đã tải xong.
 * Lần đầu bấm vào một tỉnh, dựng panel mất ~250ms bố cục (ở máy chậm) và làm khựng đầu chuyến bay; dựng thử trước
 * thì lần bấm thật chỉ còn vài chục ms. Chỉ chạy một lần, rồi gỡ ngay.
 */
const PanelWarmUp: React.FC = () => {
  const [on, setOn] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (panelWarmed || !WARM_PREF) return;
    let cancelled = false;
    let off = 0;
    let idle = 0;
    const start = () => {
      if (cancelled) return;
      panelWarmed = true;
      setOn(true);
      off = window.setTimeout(() => setOn(false), 800);
    };
    const schedule = () => {
      if (cancelled) return;
      // Chờ vài giây cho trang tải xong và người dùng chưa kịp thao tác, rồi dựng lúc rảnh
      idle = window.setTimeout(() => {
        if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 3000 });
        else start();
      }, 1200);
    };
    if (document.fonts?.ready) document.fonts.ready.then(schedule, schedule);
    else schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(idle);
      window.clearTimeout(off);
    };
  }, []);

  if (!on || !WARM_PREF) return null;
  return (
    <div
      className="pointer-events-none fixed"
      style={{ left: -10000, top: 0, width: PANEL_WIDTH_PX + 40, height: 760, visibility: 'hidden' }}
    >
      <PrefecturePanel
        pref={WARM_PREF}
        isWide
        closing={false}
        activeSpot={null}
        onSpotSelect={() => {}}
        onClose={() => {}}
        headingRef={headingRef}
      />
    </div>
  );
};

interface PrefecturePanelProps {
  pref: PrefectureShape;
  isWide: boolean;
  closing: boolean;
  activeSpot: number | null;
  onSpotSelect: (index: number | null) => void;
  onClose: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

const PrefecturePanel: React.FC<PrefecturePanelProps> = ({
  pref,
  isWide,
  closing,
  activeSpot,
  onSpotSelect,
  onClose,
  headingRef,
}) => {
  const region = REGION_STYLE[pref.region];
  const headingId = useId();
  const landmarks = prefectureLandmarks(pref.id);
  const foods = prefectureFoods(pref.id);
  const spotsData = usePrefectureData(pref.id);
  const journeyForWord = useExploreJourney();
  const word = toProvinceWord(journeyForWord.prefecture(pref.id)?.word);

  // Lộ trình học: danh sách đi theo thứ tự lộ trình (không có lộ trình thì theo thứ tự gốc)
  const [furigana] = useFurigana();
  const progressOf = useSpotProgress();
  const route = prefectureRoute(pref.id);
  const order = route ? route.route : landmarks.map((_, i) => i);
  const nextIdx = nextSpotIndex(pref.id, (i) => progressOf(landmarks[i].spotId));
  const doneCount = landmarks.filter((lm) => progressOf(lm.spotId) >= STOPS_PER_SPOT).length;

  // Dải con dấu: mỗi địa điểm một vòng theo thứ tự lộ trình, đủ dấu thì tô son
  const stampStrip = route ? (
    <ol
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5"
      aria-label={`Con dấu: ${doneCount}/${landmarks.length} địa điểm đã có dấu`}
    >
      {order.map((i) => {
        const done = progressOf(landmarks[i].spotId) >= STOPS_PER_SPOT;
        return (
          <li key={landmarks[i].spotId} className="shrink-0">
            <span
              className={`flex ${isWide ? 'h-8 w-8 text-xs' : 'h-6 w-6 text-[11px]'} items-center justify-center rounded-full border-2 font-bold`}
              style={
                done
                  ? { background: T.shu, borderColor: T.shu, color: T.paper, borderStyle: 'solid' }
                  : { borderColor: T.ghost, color: 'var(--ink-2)', borderStyle: 'dashed', background: T.card }
              }
              title={`${route.stop[i]}. ${landmarks[i].pictogram.nameVi}${done ? ' (đã có dấu)' : ''}`}
            >
              {route.stop[i]}
            </span>
          </li>
        );
      })}
    </ol>
  ) : null;

  // Điện thoại: hàng thẻ ngang tự cuộn tới thẻ "Tiếp theo" khi mở tỉnh
  const rowRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    const card = row?.querySelector<HTMLElement>('[data-next]');
    if (!row || !card || isWide) return;
    row.scrollLeft = card.offsetLeft - row.offsetLeft - 8;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref.id, isWide]);

  return (
    <aside
      aria-labelledby={headingId}
      className={`${
        isWide
          ? 'jm-panel-right absolute top-4 right-4 bottom-4 rounded-[10px]'
          : 'jm-panel-bottom absolute left-0 right-0 bottom-0 rounded-t-[10px] !border-b-0'
      } ${closing ? 'jm-closing pointer-events-none' : ''} jm-paper-panel z-20 flex flex-col overflow-hidden`}
      style={isWide ? { width: PANEL_WIDTH_PX } : { height: SHEET_HEIGHT_PX }}
    >
      {/* Đầu panel: dải màu vùng + con dấu (chưa mở khóa) */}
      <div
        className={`relative ${isWide ? 'px-5 pt-5 pb-4' : 'px-4 pt-3.5 pb-3'} border-b border-[var(--rule)]`}
        style={{ background: `linear-gradient(180deg, ${region.tint} 0%, var(--paper) 100%)` }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng và xem toàn quốc"
          className="jm-focus absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)] transition-colors"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        {/* Chip vùng một hàng riêng (đủ chỗ cho tên dài như "Kyushu - Okinawa 九州・沖縄"), nút đóng bên phải */}
        <span
          className="inline-flex max-w-[calc(100%-3rem)] items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--paper)] border border-[var(--rule)] px-2.5 py-0.5 text-xs font-semibold"
          style={{ color: region.ink }}
        >
          <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: region.ink }} aria-hidden="true" />
          Vùng {REGION_NAME[pref.region]}
          <span className="font-jp font-medium text-[var(--ink-2)]">{REGION_JP.get(pref.region)}</span>
        </span>

        <div className={`${isWide ? 'mt-3 gap-4' : 'mt-2 gap-3'} flex items-center`}>
          <StampPreview pref={pref} compact={!isWide} />
          <div className="min-w-0">
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="jm-ph-name text-[var(--ink)] outline-none"
            >
              {pref.nameJp}
            </h2>
            <p className="text-base font-semibold text-[var(--ink-2)]">{pref.nameVi}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-5">
        {/* Lộ trình học: các địa danh của tỉnh theo thứ tự đi (gần thủ phủ trước); bấm để bay tới trên bản đồ */}
        <div className={`${isWide ? 'mb-3' : 'mb-2'} flex items-center justify-between gap-3`}>
          <h3 className="flex shrink-0 items-center gap-2 text-sm font-bold text-[var(--ink)]">
            Lộ trình học <span className="jm-count">{landmarks.length}</span>
          </h3>
          {/* Điện thoại: dải con dấu nằm cùng hàng với tiêu đề để nhường chỗ cho hàng thẻ */}
          {route && !isWide && stampStrip}
        </div>
        {route && isWide && <div className="mb-3">{stampStrip}</div>}

        {landmarks.length === 0 && spotsData.status !== 'ok' && (
          <p className="mb-3 text-sm text-[var(--ink-2)]" role="status">
            {spotsData.status === 'error' ? 'Không tải được các mốc học. Hãy thử mở lại tỉnh.' : 'Đang tải các mốc học…'}
          </p>
        )}
        {landmarks.length === 0 && spotsData.status === 'ok' && (
          <p className="mb-3 text-sm text-[var(--ink-2)]">Tỉnh này chưa có mốc học nào.</p>
        )}

        <ul
          ref={rowRef}
          className={isWide ? 'flex flex-col gap-2' : 'flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2'}
        >
          {order.map((n) => {
            const lm = landmarks[n];
            const p = lm.pictogram;
            const active = activeSpot === n;
            const shared = (PICTOGRAM_PREFECTURES[p.id] ?? []).filter((other) => other !== pref.id);
            const progress = progressOf(lm.spotId);
            const done = progress >= STOPS_PER_SPOT;
            const isNext = n === nextIdx;
            return (
              <li key={lm.spotId} data-next={isNext ? '' : undefined} className={isWide ? '' : 'shrink-0 snap-start w-[250px]'}>
                <button
                  type="button"
                  aria-expanded={active}
                  onClick={() => onSpotSelect(active ? null : n)}
                  className={`jm-focus relative h-full w-full rounded-[8px] border ${isWide ? 'p-3' : 'p-2.5'} text-left transition-colors ${
                    active || isNext ? 'bg-[var(--card)]' : 'border-[var(--rule)] bg-[var(--card)] hover:bg-[var(--paper)]'
                  }`}
                  style={
                    isNext
                      ? { borderColor: T.shu, boxShadow: `0 0 0 1px ${T.shu}` }
                      : active
                        ? { borderColor: region.ink, boxShadow: `0 0 0 1px ${region.ink}` }
                        : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="relative shrink-0">
                      <span
                        className="w-11 h-11 rounded-full flex items-center justify-center border-2 transition-colors"
                        style={
                          done
                            ? { background: T.shu, borderColor: T.shu }
                            : active
                              ? { background: region.ink, borderColor: region.ink }
                              : { borderColor: region.ink, background: 'var(--paper)' }
                        }
                      >
                        <PictogramIcon id={p.id} color={active || done ? 'var(--paper)' : region.ink} className="w-6 h-6" />
                      </span>
                      {route && (
                        <span className="jm-stop-badge" style={{ position: 'absolute', left: -6, top: -6, width: 20, height: 20 }} aria-label={`Điểm ${route.stop[n]}`}>
                          {route.stop[n]}
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      {isNext && <span className={isWide ? 'jm-chip-next mb-1' : 'jm-chip-next absolute right-2 top-2'}>Tiếp theo</span>}
                      <div className="text-sm font-semibold leading-snug text-[var(--ink)]">{p.nameVi}</div>
                      <div className="font-jp text-[13px] leading-relaxed text-[var(--ink-2)]">{p.nameJp}</div>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        {PICTOGRAM_KIND_LABEL[p.kind]}
                        {progress > 0 && ` · ${progress}/${STOPS_PER_SPOT}`}
                        {shared.length > 0 && ` · Cùng với ${shared.map((o) => PREFECTURE_BY_ID.get(o)?.nameVi).join(', ')}`}
                      </div>
                    </div>
                    <ChevronIcon className={`w-4 h-4 text-[var(--muted)] shrink-0 transition-transform ${active ? 'rotate-180' : ''}`} />
                  </div>

                  {active && (
                    <div className="jm-reveal mt-3 grid grid-cols-2 gap-2">
                      <ActivityPlaceholder icon={<ChatIcon className="w-4 h-4" />} label="Hội thoại AI" />
                      <ActivityPlaceholder icon={<MicIcon className="w-4 h-4" />} label="Shadowing" />
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Điện thoại: "Một từ ở tỉnh" là một mục trong panel (trên desktop nó nổi trên bản đồ) */}
        {!isWide && word && (
          <div className="mt-5">
            <WordCard variant="inline" provinceNameVi={pref.nameVi} word={word} furigana={furigana} ink={region.ink} />
          </div>
        )}

        {foods.length > 0 && (
          <>
            <h3 className="mt-6 mb-3 flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
              Đặc sản <span className="jm-count">{foods.length}</span>
            </h3>
            <ul className="grid grid-cols-2 gap-2">
              {foods.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-[6px] bg-[var(--paper-2)] p-2.5">
                  <PictogramIcon id={p.id} color={region.ink} className="w-8 h-8 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-snug text-balance text-[var(--ink)]">{p.nameVi}</div>
                    <div className="font-jp text-xs text-[var(--ink-2)]">{p.nameJp}</div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Ghi nguồn: một dòng cố định ở đáy panel (không cuộn theo danh sách); tên đầy đủ trong title */}
      <p className="shrink-0 truncate px-5 py-2.5 text-xs text-[var(--muted)] bg-[var(--paper)] border-t border-[var(--rule)]">
          Nguồn:{' '}
          <a
            href={PICTOGRAM_CREDIT.url}
            target="_blank"
            rel="noopener noreferrer"
            title={PICTOGRAM_CREDIT.text}
            className="jm-focus rounded underline-offset-2 hover:text-[var(--primary-ink)] hover:underline transition-colors"
          >
            {PICTOGRAM_CREDIT.short}
          </a>
          {' · '}
          <a
            href={BOUNDARY_CREDIT.url}
            target="_blank"
            rel="noopener noreferrer"
            title={BOUNDARY_CREDIT.text}
            className="jm-focus rounded underline-offset-2 hover:text-[var(--primary-ink)] hover:underline transition-colors"
          >
            {BOUNDARY_CREDIT.short}
          </a>
      </p>
    </aside>
  );
};

/** Con dấu của tỉnh ở trạng thái chưa mở khóa: hình dáng phần đất chính của tỉnh trong vòng tròn nét đứt */
const StampPreview: React.FC<{ pref: PrefectureShape; compact?: boolean }> = ({ pref, compact }) => {
  const [x, y, w, h] = pref.main;
  const size = Math.max(w, h);
  const pad = size * 0.12;
  const viewBox = `${x + w / 2 - size / 2 - pad} ${y + h / 2 - size / 2 - pad} ${size + pad * 2} ${size + pad * 2}`;
  return (
    <div className="shrink-0 flex flex-col items-center gap-1">
      <div
        className={`${compact ? 'w-[52px] h-[52px] p-2' : 'w-[72px] h-[72px] p-2.5'} rounded-full border-2 border-dashed border-[var(--ghost)] bg-[var(--card)] flex items-center justify-center`}
        role="img"
        aria-label={`Con dấu ${pref.nameVi}: chưa mở khóa`}
      >
        <svg viewBox={viewBox} className="w-full h-full" aria-hidden="true">
          <path d={pref.d} fillRule="evenodd" fill="#CFC5B1" />
        </svg>
      </div>
      {/* Màn hẹp bỏ chú thích để ngăn dưới đủ chỗ cho danh sách địa điểm (nhãn vẫn có trong aria-label) */}
      {!compact && (
        // Nằm trên dải màu vùng ở đầu panel: dùng ink-2 (≥ 5.4:1) thay cho muted (chỉ ~3.5:1 trên nền đó)
        <span className="flex items-center gap-1 text-xs font-medium text-[var(--ink-2)]">
          <LockIcon className="w-3 h-3" />
          Con dấu
        </span>
      )}
    </div>
  );
};

const ActivityPlaceholder: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col gap-1 rounded-[6px] border-[1.5px] border-dashed border-[var(--ghost)] px-2.5 py-2">
    <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
      {icon}
      {label}
    </div>
    <span className="text-xs text-[var(--muted)]">Sắp có</span>
  </div>
);

/**
 * Chỉ ở môi trường dev: nhắc lập trình viên khi máy chưa có icon EXPERIENCE JAPAN PICTOGRAMS.
 * Thư mục public/pictograms không có trong git (điều khoản NDC không cho phân phối lại), nên máy mới clone sẽ thiếu.
 * Vite trả index.html (200) cho file không tồn tại, nên kiểm tra theo kiểu nội dung chứ không theo mã trạng thái.
 */
const MissingIconsDevNotice: React.FC = () => {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(pictogramUrl('P_asakusa'), { method: 'HEAD' })
      .then((r) => !cancelled && setMissing(!r.ok || !(r.headers.get('content-type') ?? '').includes('svg')))
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!missing) return null;
  return (
    <div
      role="alert"
      className="absolute z-30 left-3 bottom-3 max-w-[min(440px,calc(100%-1.5rem))] rounded-[8px] border-2 border-dashed border-[var(--shu)] bg-[var(--paper)] p-3 text-xs leading-relaxed text-[var(--ink)] shadow-[var(--sh-2)]"
    >
      <div className="font-bold text-[var(--shu)]">[Chỉ hiện khi dev] Máy này chưa có icon NDC</div>
      <p className="mt-1">
        Bản đồ sẽ thiếu biểu tượng tỉnh và địa danh. Tải bộ EXPERIENCE JAPAN PICTOGRAMS tại experience-japan.info, giải nén, rồi trong thư mục{' '}
        <code>jcap-web</code> chạy:
      </p>
      <code className="mt-1 block rounded bg-[var(--paper-2)] px-2 py-1">node scripts/copy-pictograms.mjs &lt;thư-mục-icon&gt;</code>
      <p className="mt-1 text-[var(--ink-2)]">Không commit public/pictograms (điều khoản không cho phân phối lại file icon).</p>
    </div>
  );
};

/** "Một từ ở tỉnh" từ API -> dạng bộ 4 mà WordCard dùng */
function toProvinceWord(w: ExploreProvinceWord | null | undefined): ProvinceWord | null {
  return w ? [w.word, w.kana, w.meaning, w.note ?? ''] : null;
}

/**
 * Thông báo nổi khi bấm vào tỉnh admin chưa mở: tên tỉnh, "Sẽ cập nhật trong tương lai",
 * kèm "Một từ ở tỉnh" nếu có để người học vẫn có chút gì để xem. Tự ẩn sau vài giây.
 */
const ClosedNotice: React.FC<{ pref: PrefectureShape; word: ProvinceWord | null; furigana: boolean; onClose: () => void }> = ({
  pref,
  word,
  furigana,
  onClose,
}) => (
  <div
    role="status"
    className="jm-reveal absolute z-20 top-3 sm:top-4 left-1/2 -translate-x-1/2 w-[min(360px,calc(100%-2rem))] rounded-[8px] bg-[var(--paper)] border border-[var(--ink-line)] px-4 py-3 shadow-[var(--sh-2)]"
  >
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-[var(--ink)]">
          {pref.nameVi} <span className="font-jp font-medium text-[var(--ink-2)]">{pref.nameJp}</span>
        </div>
        <div className="mt-0.5 text-sm text-[var(--ink-2)]">Sẽ cập nhật trong tương lai</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng thông báo"
        className="jm-focus -mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
    {word && (
      <div className="mt-2 border-t border-[var(--rule)] pt-2 text-sm text-[var(--ink-2)]">
        Một từ ở {pref.nameVi}:{' '}
        <span className="font-jp font-bold text-[var(--ink)]" lang="ja">
          {furigana ? (
            <ruby>
              {word[0]}
              <rt>{word[1]}</rt>
            </ruby>
          ) : (
            word[0]
          )}
        </span>{' '}
        · {word[2]}
      </div>
    )}
  </div>
);

// ============================================================
// Ô tìm tỉnh (combobox): cách chọn thay thế cho tỉnh nhỏ khó bấm và cho người dùng bàn phím
// ============================================================

const PrefecturePicker: React.FC<{ onPick: (id: number) => void; isClosed: (id: number) => boolean }> = ({ onPick, isClosed }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const q = normalize(query);
    const list = q
      ? PREFECTURES.filter(
          (p) => normalize(p.nameVi).includes(q) || p.nameJp.includes(query.trim()) || p.slug.includes(q),
        )
      : PREFECTURES;
    // Giữ thứ tự theo vùng để danh sách dễ dò
    const order = new Map(REGIONS.map((r, i) => [r.id, i]));
    return [...list].sort((a, b) => order.get(a.region)! - order.get(b.region)! || a.id - b.id);
  }, [query]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Cuộn mục đang chọn vào tầm nhìn khi dùng phím mũi tên
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (returnFocus) triggerRef.current?.focus();
  };

  const pick = (p: PrefectureShape) => {
    close(false);
    onPick(p.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) pick(results[activeIndex]);
    } else if (e.key === 'Escape') {
      // Chặn để Esc chỉ đóng ô tìm, không thu nhỏ bản đồ
      e.preventDefault();
      e.nativeEvent.preventDefault();
      close(true);
    }
  };

  let lastRegion: RegionId | null = null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Tìm tỉnh"
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`jm-focus flex items-center justify-center gap-2 h-11 min-w-11 px-3 rounded-[6px] border text-sm font-semibold transition-colors ${
          open
            ? 'border-[var(--primary)] text-[var(--primary-ink)] bg-[var(--primary-soft)]'
            : 'border-[var(--rule)] text-[var(--ink)] bg-[var(--paper)] hover:bg-[var(--paper-2)]'
        }`}
      >
        <SearchIcon className="w-5 h-5" />
        <span className="hidden md:inline">Tìm tỉnh</span>
      </button>

      {open && (
        <div className="jm-reveal fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[72px] sm:top-[calc(100%+10px)] sm:w-[320px] rounded-[8px] bg-[var(--paper)] border border-[var(--ink-line)] shadow-[var(--sh-3)] overflow-hidden z-40">
          <div className="p-3 border-b border-[var(--rule)]">
            <label className="flex items-center gap-2 h-11 px-3 rounded-[6px] border-[1.5px] border-[var(--rule)] bg-white focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-soft)]">
              <SearchIcon className="w-4 h-4 text-[var(--muted)] shrink-0" />
              <span className="sr-only">Tên tỉnh</span>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ví dụ: Kyoto, 大阪"
                className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
              />
            </label>
          </div>

          <ul id={listId} role="listbox" aria-label="Danh sách tỉnh" className="max-h-[min(360px,60vh)] overflow-y-auto py-1">
            {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">Không tìm thấy tỉnh phù hợp</li>}
            {results.map((p, i) => {
              const showRegion = p.region !== lastRegion;
              lastRegion = p.region;
              return (
                <React.Fragment key={p.id}>
                  {showRegion && (
                    <li role="presentation" className="flex items-baseline gap-1.5 px-4 pt-2.5 pb-1 text-xs font-semibold text-[var(--muted)]">
                      {REGION_NAME[p.region]} <span className="font-jp font-medium">{REGION_JP.get(p.region)}</span>
                    </li>
                  )}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => pick(p)}
                    className={`mx-1 flex items-center gap-3 min-h-11 px-3 rounded-lg cursor-pointer ${
                      i === activeIndex ? 'bg-[var(--primary-soft)]' : ''
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: REGION_STYLE[p.region].ink }}
                      aria-hidden="true"
                    />
                    <span className={`flex-1 text-sm font-semibold ${isClosed(p.id) ? 'text-[var(--ink-2)]' : 'text-[var(--ink)]'}`}>{p.nameVi}</span>
                    {isClosed(p.id) && (
                      <span className="rounded-full border border-[var(--rule)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-2)]">Sắp có</span>
                    )}
                    <span className="font-jp text-sm text-[var(--ink-2)]">{p.nameJp}</span>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Icons (SVG)
// ============================================================

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function CompassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </svg>
  );
}

function ZoomOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
    </svg>
  );
}

function PointerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
