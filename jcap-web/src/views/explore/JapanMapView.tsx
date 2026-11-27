import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PREFECTURES, REGIONS, type PrefectureShape, type RegionId } from '../../data/japanMap';
import { PICTOGRAM_KIND_LABEL, pictogramUrl } from '../../data/japanPictograms';
import { JapanMap, PREFECTURE_BY_ID, REGION_NAME, REGION_STYLE } from './JapanMap';
import type { ProvinceWord } from '../../data/learnContent';
import type { ExploreProvinceWord, ExplorePrefectureSummary } from '../../types/explore';
import { cachedSpot, useExploreJourney, usePrefectureData, type JourneyState } from './exploreStore';
import { AwardOverlay } from './AwardOverlay';
import { STAMP_CSS, STAMP_INK } from './ExploreStamp';
import { THEME_CSS_VARS } from './exploreTheme';
import { PrefecturePanel } from './PrefecturePanel';
import { Button, Icon, IconButton } from '../../components/jcap';
import { useFurigana } from './furigana';
import { prefectureLandmarks } from './prefectureDetail';
import { SpotShadowing } from './SpotShadowing';
import { WordCard } from './WordCard';

const PANEL_WIDTH_PX = 400;
/** Màn hẹp: ngăn tỉnh là tấm kéo từ dưới, cao 70% màn hình (khớp .jm-pp.is-sheet) */
const SHEET_RATIO = 0.7;
const PANEL_EXIT_MS = 180;
/** Điểm đạt Shadowing mặc định (khớp AdminExploreSpotService.DefaultShadowingPass) */
const DEFAULT_SHADOWING_PASS = 60;
/** Khung chat Shadowing tại mốc (khớp --cw trong spotShadowing.css): clamp(420px, 37.5vw, 540px), cách ngăn tỉnh 12px */
const practiceChatWidth = (vw: number) => Math.min(540, Math.max(420, vw * 0.375));

function useViewportWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

function useViewportHeight(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return h;
}

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
type MapNavState = { jmDepth?: number; jmSpot?: boolean; jmPractice?: boolean } | null;

/**
 * Trang "Khám phá": bản đồ Nhật Bản toàn màn hình, kéo/phóng to tự do. Bấm một tỉnh để bay tới tỉnh đó,
 * bấm một địa điểm để bay tới địa điểm (bản phác thảo, chưa gắn nội dung học).
 * Lựa chọn nằm trên URL (?tinh=kyoto&dd=2; &hoc=1 mở mốc với bước Hiểu mở sẵn) để chia sẻ link và để nút Back
 * lùi lần lượt từng cấp.
 */
export const JapanMapView: React.FC<{
  /** false khi bản đồ đang nằm ẩn dưới trang khác (khung học viên giữ nó sống để chuyển cảnh mượt): không bắt phím, không cướp focus */
  active?: boolean;
  mobileLayout?: boolean;
}> = ({ active = true, mobileLayout = false }) => {
  const activeRef = useRef(active);
  activeRef.current = active;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isWide = useMediaQuery('(min-width: 1024px)');
  const viewportWidth = useViewportWidth();
  const viewportHeight = useViewportHeight();
  const mapRef = useRef<HTMLElement>(null);
  const [mapHeight, setMapHeight] = useState(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!mobileLayout || !map) return;
    const observer = new ResizeObserver(([entry]) => setMapHeight(entry.contentRect.height));
    observer.observe(map);
    return () => observer.disconnect();
  }, [mobileLayout]);
  const reserveBottom = Math.round(mobileLayout && mapHeight ? mapHeight * 0.62 : viewportHeight * SHEET_RATIO);
  const isTouch = useMediaQuery('(pointer: coarse)');
  const isWideHint = useMediaQuery('(min-width: 761px)');
  const [interacted, setInteracted] = useState(false);
  // Gợi ý thao tác tắt ngay khi người dùng làm bất kỳ thao tác nào trên trang (bấm, chạm, cuộn, bàn phím), không chỉ khi kéo/phóng bản đồ
  useEffect(() => {
    if (interacted || !active) return;
    const dismiss = () => setInteracted(true);
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, dismiss, { capture: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, dismiss, { capture: true }));
  }, [interacted, active]);
  const [furigana] = useFurigana();
  const journey = useExploreJourney();
  /** Mốc đang được rê chuột (trong ngăn hoặc trên bản đồ): làm nổi ở cả hai bên */
  const [hoverSpot, setHoverSpot] = useState<number | null>(null);
  /** Thông báo nổi khi bấm vào tỉnh admin chưa mở ("Sẽ cập nhật trong tương lai") hoặc thuộc chương chưa mở */
  const [notice, setNotice] = useState<{ prefId: number; key: number; locked: boolean } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.locked ? 6500 : 4500);
    return () => window.clearTimeout(t);
  }, [notice]);
  const showClosedNotice = (prefId: number) => setNotice({ prefId, key: Date.now(), locked: false });
  const showLockedNotice = (prefId: number) => setNotice({ prefId, key: Date.now(), locked: true });

  const selected = PREFECTURE_BY_SLUG.get(searchParams.get('tinh') ?? '') ?? null;
  const selectedId = selected?.id ?? null;
  const spotParam = Number(searchParams.get('dd'));
  // dd = số thứ tự (từ 1) của địa danh trong danh sách địa điểm học của tỉnh
  const activeSpot =
    selected && spotParam >= 1 && spotParam <= prefectureLandmarks(selected.id).length ? spotParam - 1 : null;
  // Đang luyện Shadowing của địa điểm (?luyen=1): khung chat mở cạnh ngăn thông tin tỉnh
  const practiceSpotRaw =
    selected && activeSpot != null && searchParams.get('luyen') === '1'
      ? cachedSpot(prefectureLandmarks(selected.id)[activeSpot].spotId)
      : undefined;
  const practiceActivity = practiceSpotRaw?.lesson?.activities.find((a) => a.type === 'Shadowing' && a.referenceId);
  const practiceSpot = practiceActivity ? practiceSpotRaw : undefined;
  /** Thông báo trên bản đồ sau khi đóng khung luyện giữa chừng ("Đã lưu. Lần sau bạn tiếp tục từ câu N.") */
  const [practiceToast, setPracticeToast] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    if (!practiceToast) return;
    const t = window.setTimeout(() => setPracticeToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [practiceToast]);

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
    // Tỉnh thuộc chương chưa mở: báo cần bao nhiêu con dấu
    if (journey.prefecture(id)?.isLocked) {
      showLockedNotice(id);
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

  /**
   * Mở khung luyện Shadowing của địa điểm n cạnh ngăn thông tin (?luyen=1): đẩy thêm một mục lịch sử để Back đóng khung.
   */
  const openPractice = (n: number) => {
    if (!selected) return;
    const params = { tinh: selected.slug, dd: String(n + 1), luyen: '1' };
    if (activeSpot !== n) {
      const spotParams = { tinh: selected.slug, dd: String(n + 1) };
      if (activeSpot != null) setSearchParams(spotParams, { replace: true, state: navState });
      else setSearchParams(spotParams, { state: { jmDepth: depth + 1, jmSpot: true } });
    }
    const base = activeSpot != null ? navState : { jmDepth: depth + 1, jmSpot: true };
    setSearchParams(params, { state: { ...base, jmDepth: (base.jmDepth ?? 0) + 1, jmPractice: true } });
  };
  const closePractice = (toast: string | null) => {
    if (toast) setPracticeToast({ text: toast, key: Date.now() });
    if (!selected || activeSpot == null) return;
    if (navState.jmPractice) navigate(-1);
    else setSearchParams({ tinh: selected.slug, dd: String(activeSpot + 1) }, { replace: true, state: { ...navState, jmPractice: false } });
  };

  const selectedData = usePrefectureData(selectedId);
  useEffect(() => {
    if (selectedId == null) return;
    const closedByJourney = journey.status === 'ok' && !journey.prefecture(selectedId)?.isOpen;
    const closedByDetail = selectedData.status === 'ok' && !selectedData.data?.isOpen;
    const locked =
      (journey.status === 'ok' && !!journey.prefecture(selectedId)?.isLocked) || (selectedData.status === 'ok' && !!selectedData.data?.isLocked);
    if (!closedByJourney && !closedByDetail && !locked) return;
    if (closedByJourney || closedByDetail) showClosedNotice(selectedId);
    else showLockedNotice(selectedId);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, journey.status, selectedData.status, selectedData.data?.isLocked]);

  // Esc: lùi một cấp (địa điểm -> tỉnh -> toàn quốc); bỏ qua nếu thành phần khác đã xử lý (ô tìm tỉnh)
  const backRef = useRef(() => {});
  backRef.current = () => (activeSpot != null ? selectSpot(null) : selectPrefecture(null));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && activeRef.current) backRef.current();
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
        if (!activeRef.current) return; // đang sang trang khác: không kéo focus khỏi thanh bên
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

  useEffect(() => setHoverSpot(null), [selectedId, activeSpot]);

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
    <div data-theme="kham-pha" className="jm-ukiyoe relative h-full overflow-hidden text-[var(--ink)] font-sans" style={{ background: 'var(--sea)' }}>
      {/* Font Nhật: Noto Sans JP cho tên, Shippori Mincho B1 cho chữ Hán kiểu khắc gỗ (React 19 tự đưa lên <head>) */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700&family=Shippori+Mincho+B1:wght@600;800&display=swap"
        precedence="default"
      />

      {/* Vùng bản đồ (biển, bờ, đất do JapanMap vẽ) */}
      <main ref={mapRef} className="relative h-full">
        <JapanMap
          selectedId={selectedId}
          onSelect={selectPrefecture}
          activeSpot={activeSpot}
          onSpotSelect={selectSpot}
          practicing={!!practiceSpot}
          highlightSpot={hoverSpot}
          onSpotHover={setHoverSpot}
          reserveRight={
            selected && isWide ? PANEL_WIDTH_PX + 28 + (practiceSpot ? practiceChatWidth(viewportWidth) + 12 : 0) : 0
          }
          reserveBottom={selected && !isWide ? reserveBottom : 0}
          onInteract={() => setInteracted(true)}
          legend={<MapLegend />}
          search={
            <PrefecturePicker
              onPick={selectPrefecture}
              isClosed={(id) => journey.status === 'ok' && !journey.prefecture(id)?.isOpen}
              summaryOf={journey.prefecture}
              currentId={selectedId}
            />
          }
        />

        {/* Đang xem một tỉnh: nút về toàn quốc + đường dẫn (thanh bên đã trượt ra ngoài) */}
        {/* Đang luyện Shadowing ở khung bên cạnh: ẩn để không che trang ghi chú (đóng khung bằng nút X hoặc Esc) */}
        {selected && !practiceSpot && (
          <div className="jm-backbar">
            <button type="button" onClick={() => selectPrefecture(null)} className="jm-back">
              <Icon name="arrow_back" size={22} />
              Toàn quốc
            </button>
            <nav aria-label="Vị trí" className="jm-crumb">
              <span className="text-[var(--sumi-muted)]">{`Nhật Bản / ${REGION_NAME[selected.region]} /`}</span>
              {activeSpot != null ? (
                <>
                  <button type="button" onClick={() => selectSpot(null)} className="jm-crumb-link">
                    {selected.nameVi}
                  </button>
                  <span className="text-[var(--sumi-muted)]">/</span>
                  <span aria-current="page">{prefectureLandmarks(selected.id)[activeSpot].pictogram.nameVi}</span>
                </>
              ) : (
                <span aria-current="page">{selected.nameVi}</span>
              )}
            </nav>
          </div>
        )}

        {/* Gợi ý thao tác: ẩn sau lần kéo/phóng to/chọn tỉnh đầu tiên */}
        {!selected && !interacted && !notice && journey.status !== 'error' && (
          <div className="jm-hint pointer-events-none absolute z-10 flex items-center gap-2 rounded-[8px] sm:rounded-full border border-[var(--line)] bg-[var(--paper-50)] px-3.5 sm:px-4 py-2 text-[12.5px] sm:text-sm text-[var(--sumi)] shadow-[0_6px_18px_rgba(8,26,56,.28)]">
            <PointerIcon className="w-4 h-4 shrink-0 text-[var(--shu)]" />
            {isTouch || !isWideHint
              ? 'Kéo, chụm hai ngón để phóng to, chạm vào một tỉnh'
              : 'Kéo để di chuyển · Cuộn để phóng to · Bấm vào một tỉnh'}
          </div>
        )}

        {/* Bấm vào tỉnh admin chưa mở */}
        {notice &&
          (notice.locked ? (
            <LockedNotice
              key={notice.key}
              pref={PREFECTURE_BY_ID.get(notice.prefId)!}
              journey={journey}
              onGo={(id) => {
                setNotice(null);
                selectPrefecture(id);
              }}
              onClose={() => setNotice(null)}
            />
          ) : (
            <ClosedNotice
              key={notice.key}
              pref={PREFECTURE_BY_ID.get(notice.prefId)!}
              onClose={() => setNotice(null)}
            />
          ))}

        {/* Không tải được dữ liệu Khám phá (máy chủ chưa chạy, mất mạng...) */}
        {journey.status === 'error' && !notice && (
          <div role="alert" className="absolute z-20 top-3 sm:top-4 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-2rem)] flex items-center gap-3 rounded-[8px] bg-[var(--paper)] border border-[var(--ink-line)] px-4 py-2.5 text-sm text-[var(--ink)] shadow-[var(--sh-2)]">
            Không tải được dữ liệu bản đồ.
            <button type="button" onClick={journey.retry} className="jm-focus rounded-[6px] bg-[var(--primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--primary-ink)]">
              Thử lại
            </button>
          </div>
        )}

        {!selected && <PanelWarmUp />}

        {import.meta.env.DEV && !mobileLayout && <MissingIconsDevNotice />}

        {/* Thông tin tỉnh: panel bên phải (màn rộng) hoặc ngăn dưới (màn hẹp) */}
        {panelPref && (
          <PrefecturePanel
            key={panelPref.id}
            pref={panelPref}
            isWide={isWide}
            width={PANEL_WIDTH_PX}
            closing={closing}
            word={toProvinceWord(journey.prefecture(panelPref.id)?.word)}
            activeSpot={selected ? activeSpot : null}
            onSpotSelect={selectSpot}
            onShadowing={openPractice}
            furigana={furigana}
            openUnderstand={searchParams.get('hoc') === '1'}
            highlight={hoverSpot}
            onHover={setHoverSpot}
            practicingSpot={selected && practiceSpot ? activeSpot : null}
            onClose={() => selectPrefecture(null)}
            headingRef={headingRef}
          />
        )}

        {/* Shadowing tại mốc (?luyen=1): khung chat bên trái ngăn thông tin, bản đồ trượt sang trái */}
        {selected && practiceSpot && practiceActivity?.referenceId && (
          <SpotShadowing
            key={`${practiceSpot.id}:${practiceActivity.referenceId}`}
            spot={practiceSpot}
            pref={selected}
            dialogueId={practiceActivity.referenceId}
            pass={practiceActivity.passThreshold ?? DEFAULT_SHADOWING_PASS}
            regionInk={REGION_STYLE[selected.region].ink}
            furigana={furigana}
            onClosed={closePractice}
          />
        )}

        {practiceToast && !practiceSpot && (
          <p key={practiceToast.key} className="jm-practice-toast" role="status">
            <Icon name="check_circle" size={20} />
            {practiceToast.text}
          </p>
        )}

        {/* Vừa đạt con dấu / con dấu tỉnh / chương mới */}
        <AwardOverlay lessonSpotId={practiceSpot?.id ?? null} journey={journey} isWide={isWide} />

        <style>{`
          .jm-ukiyoe { ${THEME_CSS_VARS} }
          ${STAMP_CSS}
          .jm-count { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--paper-2); font-size: 12px;
            font-weight: 600; color: var(--ink-2); display: inline-grid; place-items: center; font-variant-numeric: tabular-nums; }
          .font-jp { font-family: 'Noto Sans JP', 'Inter', system-ui, sans-serif; }
          .jm-focus:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
          .jm-paper-panel { background: var(--paper); border: 1px solid var(--ink-line);
            box-shadow: inset 0 0 0 3px var(--paper), inset 0 0 0 4px var(--rule), var(--sh-3); }
          .jm-lock { position: absolute; z-index: 30; top: 20px; left: 50%; transform: translateX(-50%); width: min(300px, calc(100% - 2rem)); box-sizing: border-box;
            display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 14px; border-radius: 16px; background: var(--paper-50);
            border: 1px solid var(--line); box-shadow: 0 14px 36px rgba(8,26,56,.38); color: var(--sumi); }
          /* Chú giải: bảng gọn mở sang trái cột nút, mép dưới ngang đáy cột nút (102px = phần cột nằm dưới nút chú giải:
             nút tìm 2+40, đệm 3+1, khe 8, cụm về khung khi gập 48) để bảng không tràn khỏi màn hình */
          .jm-legend { position: absolute; right: calc(100% + 14px); bottom: -102px; width: 248px; box-sizing: border-box; display: flex; flex-direction: column;
            gap: 0; padding: 8px 8px 10px 14px; border-radius: 14px; background: var(--paper-50); border: 1px solid var(--line);
            box-shadow: 0 14px 32px rgba(8,26,56,.3); color: var(--sumi); transform-origin: right calc(100% - 122px); animation: jm-pop-in .22s cubic-bezier(.2,.7,.2,1) both; }
          /* Bảng nổi bung ra từ nút và thu về nút khi đóng (tâm co giãn đặt ở chính nút) */
          .jm-legend.is-closing, .jm-pk.is-closing { animation: jm-pop-out ${POP_OUT_MS}ms cubic-bezier(.4,0,1,1) both; pointer-events: none; }
          @keyframes jm-pop-in { from { opacity: 0; transform: translateX(14px) scale(.9); } to { opacity: 1; transform: none; } }
          @keyframes jm-pop-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(14px) scale(.86); } }
          @media (prefers-reduced-motion: reduce) { .jm-legend, .jm-pk, .jm-legend.is-closing, .jm-pk.is-closing { animation: none; } }
          /* Ô tìm tỉnh: giấy ngà, vùng dính đầu danh sách, ô màu theo vùng như trên bản đồ */
          .jm-pk { position: absolute; right: calc(100% + 14px); bottom: -4px; z-index: 40; width: 340px; display: flex; flex-direction: column;
            border-radius: 16px; background: var(--paper-50); border: 1px solid var(--line); box-shadow: 0 14px 32px rgba(8,26,56,.3); overflow: hidden; color: var(--sumi);
            transform-origin: right calc(100% - 24px); animation: jm-pop-in .22s cubic-bezier(.2,.7,.2,1) both; }
          .jm-pk-head { display: flex; flex-direction: column; gap: 6px; padding: 12px 12px 8px; border-bottom: 1px solid var(--line); }
          .jm-pk-field { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 6px 0 12px; border-radius: 10px; border: 1px solid var(--line);
            background: var(--paper-100); color: var(--sumi-muted); transition: border-color .12s, box-shadow .12s, background .12s; }
          .jm-pk-field:focus-within { border-color: var(--ai); background: var(--paper-50); box-shadow: 0 0 0 3px var(--ai-soft); }
          .jm-pk-field input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; outline: none; font: inherit; font-size: 14px; color: var(--sumi); }
          .jm-pk-field input::placeholder { color: var(--sumi-faint); }
          .jm-pk-clear { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 8px;
            background: transparent; color: var(--sumi-muted); cursor: pointer; }
          .jm-pk-clear:hover { background: var(--paper-200); color: var(--sumi); }
          .jm-pk-clear:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
          .jm-pk-count { margin: 0; padding: 0 4px; font-size: 12px; line-height: 16px; color: var(--sumi-muted); }
          .jm-pk-list { max-height: min(380px, 56vh); overflow-y: auto; overscroll-behavior: contain; margin: 0; padding: 0 6px 6px; list-style: none; }
          @supports not selector(::-webkit-scrollbar) {
            .jm-pk-list { scrollbar-width: thin; scrollbar-color: transparent transparent; }
            .jm-pk-list:hover { scrollbar-color: color-mix(in srgb, var(--line-strong) 45%, transparent) transparent; }
          }
          .jm-pk-list::-webkit-scrollbar { width: 10px; }
          .jm-pk-list::-webkit-scrollbar-track { background: transparent; margin: 6px 0; }
          .jm-pk-list::-webkit-scrollbar-thumb { border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; background-color: transparent; }
          .jm-pk-list:hover::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, var(--line-strong) 45%, transparent); }
          .jm-pk-list::-webkit-scrollbar-button { display: none; height: 0; }
          .jm-pk-region { position: sticky; top: 0; z-index: 1; display: flex; align-items: baseline; gap: 6px; margin: 0 -6px; padding: 10px 16px 5px;
            background: var(--paper-50); border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
          .jm-pk-rname { font-size: 12px; font-weight: 700; color: var(--sumi); }
          .jm-pk-rjp { font-family: var(--font-mincho); font-size: 12px; font-weight: 600; color: var(--sumi-muted); }
          .jm-pk-rcount { margin-left: auto; font-size: 11px; color: var(--sumi-faint); font-variant-numeric: tabular-nums; }
          .jm-pk-opt { position: relative; display: flex; align-items: center; gap: 10px; min-height: 40px; margin-top: 2px; padding: 0 10px; border-radius: 8px; cursor: pointer; }
          .jm-pk-opt.is-active { background: var(--paper-200); }
          .jm-pk-opt.is-active::before { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 0 2px 2px 0; background: var(--pk-ink); }
          .jm-pk-sw { flex: none; width: 14px; height: 14px; border-radius: 4px; border: 1.5px dashed var(--line-strong); }
          .jm-pk-name { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; overflow: hidden; }
          .jm-pk-vi { font-size: 14px; font-weight: 600; color: var(--sumi); white-space: nowrap; }
          .jm-pk-jp { font-family: var(--font-mincho); font-size: 13px; font-weight: 600; color: var(--sumi-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .jm-pk-opt.is-muted .jm-pk-vi { color: var(--sumi-muted); font-weight: 500; }
          .jm-pk-opt.is-muted .jm-pk-jp { color: var(--sumi-faint); }
          .jm-pk-mark { background: transparent; color: var(--ai); text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
          .jm-pk-st { flex: none; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: var(--sumi-faint); font-variant-numeric: tabular-nums; }
          .jm-pk-st.is-current { color: var(--ai); }
          .jm-pk-st.is-done { color: var(--shu); }
          .jm-pk-seal { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid currentColor;
            font-family: var(--font-mincho); font-size: 9px; font-weight: 700; }
          .jm-pk-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 28px 16px; text-align: center; font-size: 13px; color: var(--sumi-muted); }
          .jm-pk-empty .jc-icon { color: var(--sumi-faint); margin-bottom: 4px; }
          .jm-pk-empty b { color: var(--sumi); font-size: 14px; }
          @media (max-width: 639px) { .jm-pk { position: fixed; left: 12px; right: 12px; top: 12px; bottom: auto; width: auto; } }
          .jm-lg-sw { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 22px; border-radius: 5px; }
          .jm-lg-seal { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%;
            border: 2px solid var(--shu); color: var(--shu); font-family: var(--font-mincho); font-size: 11px; font-weight: 700; }
          .jm-lg-region { writing-mode: vertical-rl; padding: 1px; background: var(--paper-50); border: 3px double var(--sumi);
            font-family: var(--font-mincho); font-size: 9px; line-height: 10px; font-weight: 700; }
          /* Gợi ý thao tác nằm ngay bên phải thanh bên (240px + lề 12px + khe 12px; thanh bên thu gọn: 72px) */
          .jm-hint { left: 264px; top: 20px; max-width: calc(100% - 264px - 16px); transition: left .2s cubic-bezier(.2,.7,.2,1); }
          .jx-app.is-collapsed .jm-hint { left: 96px; max-width: calc(100% - 96px - 16px); }
          .jm-backbar { position: absolute; z-index: 25; left: 20px; top: 20px; display: flex; align-items: center; gap: 12px; animation: jm-reveal .2s ease-out .5s both; }
          .jm-back { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 18px 0 14px; border-radius: 999px; border: 1px solid var(--line);
            background: var(--paper-50); color: var(--sumi); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(8,26,56,.3); }
          .jm-back:hover { background: var(--paper-100); }
          .jm-back:focus-visible, .jm-crumb-link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
          .jm-crumb { display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 999px; background: rgba(246,239,226,.9);
            font-size: 13px; font-weight: 600; color: var(--sumi); }
          .jm-crumb-link { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
          .jm-crumb-link:hover { text-decoration: underline; }
          @media (max-width: 760px) { .jm-crumb { display: none; } .jm-backbar { left: 12px; top: 12px; } }
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
        width={PANEL_WIDTH_PX}
        closing={false}
        word={null}
        activeSpot={null}
        furigana={false}
        openUnderstand={false}
        onShadowing={() => {}}
        highlight={null}
        onHover={() => {}}
        onSpotSelect={() => {}}
        onClose={() => {}}
        headingRef={headingRef}
      />
    </div>
  );
};

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
 * Tỉnh thuộc chương chưa mở: nói rõ cần bao nhiêu con dấu ở chương trước, đang có bao nhiêu, và gợi ý học tiếp ở một
 * tỉnh đang mở của chương trước. Khác với tỉnh admin chưa mở ("Sẽ cập nhật trong tương lai").
 */
const LockedNotice: React.FC<{ pref: PrefectureShape; journey: JourneyState; onGo: (prefId: number) => void; onClose: () => void }> = ({
  pref,
  journey,
  onGo,
  onClose,
}) => {
  const chapters = journey.data?.chapters ?? [];
  const at = chapters.findIndex((c) => c.prefectureIds.includes(pref.id));
  const chapter = chapters[at];
  const prev = chapters[at - 1];
  const need = chapter && prev ? Math.ceil((chapter.unlockThresholdPercent * prev.spotCount) / 100) : 0;
  const more = prev ? Math.max(0, need - prev.stampCount) : 0;
  // Gợi ý: tỉnh đang mở của chương trước còn mốc chưa có dấu
  const suggest = prev?.prefectureIds
    .map((id) => ({ id, s: journey.prefecture(id) }))
    .find(({ s }) => s?.isOpen && !s.isLocked && s.stampCount < s.spotCount);
  const suggestPref = suggest ? PREFECTURE_BY_ID.get(suggest.id) : undefined;
  return (
    <div role="dialog" aria-label={`${pref.nameVi} đang khoá`} className="jm-reveal jm-lock">
      <div className="flex items-start gap-2.5">
        <span className="flex flex-grow flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="text-[17px] font-bold leading-6">{pref.nameVi}</span>
            <span className="text-[15px] font-bold" lang="ja" style={{ fontFamily: 'var(--font-mincho)' }}>
              {pref.nameJp}
            </span>
          </span>
          {chapter && <span className="text-[13px] leading-5 text-[var(--sumi-muted)]">{chapter.title}</span>}
        </span>
        <IconButton icon="close" label="Đóng" size="sm" onClick={onClose} />
      </div>
      {chapter && prev ? (
        <>
          <p className="m-0 text-sm leading-[22px]">
            {`Mở khi đạt ${chapter.unlockThresholdPercent}% con dấu ${prev.title}. Bạn đang có `}
            <strong>{`${prev.stampCount}/${prev.spotCount}`}</strong>
            {more > 0 ? `, cần thêm ${more} dấu.` : '.'}
          </p>
          <div className="relative h-2 rounded bg-[var(--paper-200)]" role="img" aria-label={`${prev.stampCount} trên ${prev.spotCount} dấu`}>
            <span
              className="absolute inset-y-0 left-0 rounded bg-[var(--shu)]"
              style={{ width: `${prev.spotCount ? (prev.stampCount / prev.spotCount) * 100 : 0}%` }}
            />
            <span className="absolute -top-1 h-4 w-0.5 bg-[var(--sumi)]" style={{ left: `${chapter.unlockThresholdPercent}%` }} />
          </div>
          <div className="flex justify-between text-xs leading-4 text-[var(--sumi-muted)]">
            <span>{`${prev.stampCount} dấu`}</span>
            <span>{`Mở khoá ở ${need} dấu`}</span>
          </div>
          {suggestPref && (
            <Button variant="primary" block icon="travel_explore" onClick={() => onGo(suggestPref.id)}>
              {`Học mốc tiếp theo ở ${suggestPref.nameVi}`}
            </Button>
          )}
        </>
      ) : (
        <p className="m-0 text-sm leading-[22px]">Thuộc chương bạn chưa mở.</p>
      )}
    </div>
  );
};

/** Chú giải bản đồ: nút ở góc dưới phải, bảng mở lên phía trên */
/** Thời gian thu bảng nổi về nút (khớp jm-pop-out) */
const POP_OUT_MS = 160;
const popOutMs = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : POP_OUT_MS);

const MapLegend: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  /** Đóng: chạy hiệu ứng thu về nút rồi mới gỡ bảng */
  const close = () => {
    if (!open || closing) return;
    window.clearTimeout(closeTimer.current);
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, popOutMs());
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && closeRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" data-map-ui>
      {open && (
        <div className={`jm-legend ${closing ? 'is-closing' : ''}`} role="dialog" aria-label="Chú giải bản đồ">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Chú giải</strong>
            <IconButton icon="close" label="Đóng chú giải" size="sm" onClick={close} />
          </div>
          <LegendRow sw={<span className="jm-lg-sw" style={{ background: 'var(--paper)', boxShadow: 'inset 0 0 0 2px var(--sumi)' }} />} title="Tỉnh đã mở" text="Bấm vào để vào tỉnh và học" />
          <LegendRow
            sw={<span className="jm-lg-sw" style={{ background: 'rgba(246,239,226,.38)', boxShadow: 'inset 0 0 0 1px var(--line)' }} />}
            title="Tỉnh đang khoá"
            text="Mở khi đủ con dấu của chương trước"
          />
          <LegendRow
            sw={
              <span className="jm-lg-sw">
                <span className="jm-lg-seal" style={{ borderColor: STAMP_INK, color: STAMP_INK }}>
                  印
                </span>
              </span>
            }
            title="Con dấu"
            text="Mốc đã học xong (Hiểu + Shadowing)"
          />
          <LegendRow
            sw={
              <span className="jm-lg-sw">
                <span className="jm-lg-seal">朱</span>
              </span>
            }
            title="Dấu son"
            text="Đã làm thêm Hội thoại AI ở mốc"
          />
          <LegendRow
            sw={
              <span className="jm-lg-sw">
                <span className="jm-lg-region" lang="ja">
                  関東
                </span>
              </span>
            }
            title="Nhãn vùng"
            text="Tên các vùng lớn của Nhật"
          />
          <LegendRow
            sw={
              <span className="jm-lg-sw">
                <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
                  <path d="M2 5h30" stroke="var(--shu)" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" fill="none" />
                </svg>
              </span>
            }
            title="Lộ trình trong tỉnh"
            text="Đi qua các mốc theo thứ tự học"
          />
        </div>
      )}
      <button
        type="button"
        className={`jm-mapctl ${open && !closing ? 'is-open' : ''}`}
        onClick={() => {
          if (open && !closing) return close();
          // Bấm lại khi bảng đang thu về: huỷ việc đóng, mở lại ngay
          window.clearTimeout(closeTimer.current);
          setClosing(false);
          setOpen(true);
        }}
        aria-expanded={open && !closing}
        aria-label="Chú giải bản đồ"
        data-tip="Chú giải"
      >
        <Icon name="map" size={22} />
      </button>
    </div>
  );
};

const LegendRow: React.FC<{ sw: React.ReactNode; title: string; text: string }> = ({ sw, title, text }) => (
  <div className="flex items-center gap-2.5 py-[5px] text-xs leading-4">
    {sw}
    <div className="min-w-0">
      <b className="block text-[13px] font-bold leading-[18px]">{title}</b>
      <span className="text-[var(--sumi-muted)]">{text}</span>
    </div>
  </div>
);

/**
 * Thông báo nổi khi bấm vào tỉnh admin chưa mở: tên tỉnh và "Sẽ cập nhật trong tương lai". Tự ẩn sau vài giây.
 */
const ClosedNotice: React.FC<{ pref: PrefectureShape; onClose: () => void }> = ({ pref, onClose }) => (
  <div
    role="status"
    className="jm-reveal absolute z-20 top-5 left-1/2 -translate-x-1/2 w-[min(360px,calc(100%-2rem))] rounded-[16px] bg-[var(--paper-50)] border border-[var(--line)] px-4 py-3 shadow-[0_14px_36px_rgba(8,26,56,.38)] text-[var(--sumi)]"
  >
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">
          {pref.nameVi} <span className="font-jp font-medium text-[var(--sumi-muted)]">{pref.nameJp}</span>
        </div>
        <div className="mt-0.5 text-sm text-[var(--sumi-muted)]">Sẽ cập nhật trong tương lai</div>
      </div>
      <IconButton icon="close" label="Đóng thông báo" size="sm" onClick={onClose} />
    </div>
  </div>
);

// ============================================================
// Ô tìm tỉnh (combobox): cách chọn thay thế cho tỉnh nhỏ khó bấm và cho người dùng bàn phím
// ============================================================

/** Tô phần chữ khớp từ khoá (so như ô tìm: bỏ dấu, chữ thường), giữ nguyên chữ gốc */
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = normalize(query);
  if (!q) return text;
  const chars = [...text];
  const normChars = chars.map((c) => normalize(c));
  const joined = normChars.join('');
  const at = joined.indexOf(q);
  if (at < 0) {
    const jp = text.indexOf(query.trim());
    if (jp < 0 || !query.trim()) return text;
    return (
      <>
        {text.slice(0, jp)}
        <mark className="jm-pk-mark">{text.slice(jp, jp + query.trim().length)}</mark>
        {text.slice(jp + query.trim().length)}
      </>
    );
  }
  // Đổi vị trí trong chuỗi đã chuẩn hoá về vị trí ký tự gốc
  let pos = 0;
  let start = -1;
  let end = chars.length;
  for (let i = 0; i < chars.length; i++) {
    if (start < 0 && pos >= at) start = i;
    pos += normChars[i].length;
    if (start >= 0 && pos >= at + q.length) {
      end = i + 1;
      break;
    }
  }
  if (start < 0) return text;
  return (
    <>
      {chars.slice(0, start).join('')}
      <mark className="jm-pk-mark">{chars.slice(start, end).join('')}</mark>
      {chars.slice(end).join('')}
    </>
  );
}

const PrefecturePicker: React.FC<{
  onPick: (id: number) => void;
  isClosed: (id: number) => boolean;
  /** Tóm tắt tỉnh từ hành trình (số mốc, số con dấu, khoá theo chương) */
  summaryOf?: (id: number) => ExplorePrefectureSummary | undefined;
  /** Tỉnh đang xem */
  currentId?: number | null;
}> = ({ onPick, isClosed, summaryOf, currentId = null }) => {
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

  // Đóng: bảng thu về nút tìm rồi mới gỡ
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const finishClose = () => {
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setQuery('');
    }, popOutMs());
  };
  const finishCloseRef = useRef(finishClose);
  finishCloseRef.current = finishClose;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) finishCloseRef.current();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Cuộn mục đang chọn vào tầm nhìn khi dùng phím mũi tên
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const close = (returnFocus: boolean) => {
    finishClose();
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
    <div ref={rootRef} className="relative shrink-0" data-map-ui>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open && !closing}
        aria-label="Tìm tỉnh"
        onClick={() => {
          if (open && !closing) return close(false);
          window.clearTimeout(closeTimer.current);
          setClosing(false);
          setOpen(true);
        }}
        data-tip="Tìm kiếm"
        className={`jm-mapctl ${open && !closing ? 'is-open' : ''}`}
      >
        <Icon name="search" size={22} />
      </button>

      {open && (
        <div className={`jm-pk ${closing ? 'is-closing' : ''}`} role="dialog" aria-label="Tìm tỉnh">
          <div className="jm-pk-head">
            <label className="jm-pk-field">
              <Icon name="search" size={18} />
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
              />
              {query && (
                <button
                  type="button"
                  className="jm-pk-clear"
                  aria-label="Xoá từ khoá"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </label>
            <p className="jm-pk-count" aria-live="polite">
              {query.trim() ? `${results.length} tỉnh khớp` : `${PREFECTURES.length} tỉnh · ${REGIONS.length} vùng`}
            </p>
          </div>

          <ul id={listId} role="listbox" aria-label="Danh sách tỉnh" className="jm-pk-list">
            {results.length === 0 && (
              <li className="jm-pk-empty">
                <Icon name="travel_explore" size={28} />
                <b>Không tìm thấy tỉnh phù hợp</b>
                <span>Thử tên không dấu (kyoto) hoặc chữ Nhật (京都).</span>
              </li>
            )}
            {results.map((p, i) => {
              const showRegion = p.region !== lastRegion;
              lastRegion = p.region;
              const style = REGION_STYLE[p.region];
              const sum = summaryOf?.(p.id);
              const closed = isClosed(p.id);
              const locked = !closed && !!sum?.isLocked;
              const muted = closed || locked;
              const current = p.id === currentId;
              let status: React.ReactNode = null;
              if (current) {
                status = (
                  <span className="jm-pk-st is-current">
                    <Icon name="check" size={16} />
                    Đang xem
                  </span>
                );
              } else if (closed) {
                status = <span className="jm-pk-st">Sắp có</span>;
              } else if (locked) {
                status = (
                  <span className="jm-pk-st">
                    <Icon name="lock" size={14} />
                    Chương sau
                  </span>
                );
              } else if (sum && sum.spotCount > 0) {
                status = sum.stamp ? (
                  <span className="jm-pk-st is-done" title="Đã có con dấu tỉnh">
                    <span className="jm-pk-seal" aria-hidden="true">
                      印
                    </span>
                    {`${sum.stampCount}/${sum.spotCount}`}
                  </span>
                ) : (
                  <span className="jm-pk-st" title={`${sum.stampCount} trên ${sum.spotCount} mốc đã có con dấu`}>
                    {sum.stampCount > 0 ? `${sum.stampCount}/${sum.spotCount} dấu` : `${sum.spotCount} mốc`}
                  </span>
                );
              }
              const count = showRegion ? results.filter((r) => r.region === p.region).length : 0;
              return (
                <React.Fragment key={p.id}>
                  {showRegion && (
                    <li role="presentation" className="jm-pk-region">
                      <span className="jm-pk-rname">{REGION_NAME[p.region]}</span>
                      <span className="jm-pk-rjp" lang="ja">
                        {REGION_JP.get(p.region)}
                      </span>
                      <span className="jm-pk-rcount">{`${count} tỉnh`}</span>
                    </li>
                  )}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    aria-disabled={closed || undefined}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => pick(p)}
                    className={`jm-pk-opt ${i === activeIndex ? 'is-active' : ''} ${muted ? 'is-muted' : ''}`}
                    style={{ '--pk-ink': style.ink } as React.CSSProperties}
                  >
                    <span
                      className="jm-pk-sw"
                      aria-hidden="true"
                      style={muted ? undefined : { background: style.fill, borderColor: style.ink }}
                    />
                    <span className="jm-pk-name">
                      <span className="jm-pk-vi">{highlightMatch(p.nameVi, query)}</span>
                      <span className="jm-pk-jp" lang="ja">
                        {highlightMatch(p.nameJp, query)}
                      </span>
                    </span>
                    {status}
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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
