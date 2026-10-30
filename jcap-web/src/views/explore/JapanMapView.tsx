import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PREFECTURES, REGIONS, type PrefectureShape, type RegionId } from '../../data/japanMap';
import { PICTOGRAM_CREDIT, PICTOGRAM_KIND_LABEL, PICTOGRAM_PREFECTURES, pictogramUrl } from '../../data/japanPictograms';
import { JapanMap, PREFECTURE_BY_ID, REGION_NAME, REGION_STYLE } from './JapanMap';
import type { ProvinceWord } from '../../data/learnContent';
import type { ExploreProvinceWord } from '../../types/explore';
import { cachedSpot, useExploreJourney, usePrefectureData, type JourneyState } from './exploreStore';
import { AwardOverlay } from './AwardOverlay';
import { PrefectureStampMark, STAMP_CSS, STAMP_INK, SpotStampMark } from './ExploreStamp';
import { THEME_CSS_VARS, T } from './exploreTheme';
import { PictogramIcon } from './exploreUi';
import { Button, Icon, IconButton } from '../../components/jcap';
import { speakJa, useCanSpeakJa } from './speak';
import { useFurigana } from './furigana';
import { isStamped, useSpotProgress, type SpotStamp } from './learnProgress';
import { nextSpotIndex, prefectureRoute } from './learnRoute';
import { BOUNDARY_CREDIT, prefectureFoods, prefectureLandmarks } from './prefectureDetail';
import { SpotFocusCard } from './SpotFocusCard';
import { SpotLesson, shadowingPracticeUrl } from './SpotLesson';
import { WordCard } from './WordCard';

const PANEL_WIDTH_PX = 400;
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
type MapNavState = { jmDepth?: number; jmSpot?: boolean; jmLesson?: boolean } | null;

/**
 * Trang "Khám phá": bản đồ Nhật Bản toàn màn hình, kéo/phóng to tự do. Bấm một tỉnh để bay tới tỉnh đó,
 * bấm một địa điểm để bay tới địa điểm (bản phác thảo, chưa gắn nội dung học).
 * Lựa chọn nằm trên URL (?tinh=kyoto&dd=2, thêm &hoc=1 khi mở bài học của địa điểm) để chia sẻ link và để nút Back
 * lùi lần lượt từng cấp.
 */
export const JapanMapView: React.FC<{
  /** false khi bản đồ đang nằm ẩn dưới trang khác (khung học viên giữ nó sống để chuyển cảnh mượt): không bắt phím, không cướp focus */
  active?: boolean;
}> = ({ active = true }) => {
  const activeRef = useRef(active);
  activeRef.current = active;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isWide = useMediaQuery('(min-width: 1024px)');
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
  const lessonSpot =
    selected && activeSpot != null && searchParams.get('hoc') === '1'
      ? cachedSpot(prefectureLandmarks(selected.id)[activeSpot].spotId)
      : undefined;

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

  /** Mở bài học của địa điểm n: đẩy thêm một mục lịch sử để Back đóng bài học (về đúng địa điểm đó) */
  const openLesson = (n: number) => {
    if (!selected) return;
    const params = { tinh: selected.slug, dd: String(n + 1) };
    // Đổi địa điểm đang chọn trước (thay mục hiện tại), rồi đẩy mục bài học
    if (activeSpot !== n) {
      if (activeSpot != null) setSearchParams(params, { replace: true, state: navState });
      else setSearchParams(params, { state: { jmDepth: depth + 1, jmSpot: true } });
    }
    const base = activeSpot != null ? navState : { jmDepth: depth + 1, jmSpot: true };
    setSearchParams({ ...params, hoc: '1' }, { state: { ...base, jmDepth: (base.jmDepth ?? 0) + 1, jmLesson: true } });
  };
  const closeLesson = () => {
    if (!selected || activeSpot == null) return;
    if (navState.jmLesson) navigate(-1);
    else setSearchParams({ tinh: selected.slug, dd: String(activeSpot + 1) }, { replace: true, state: { ...navState, jmLesson: false } });
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
  backRef.current = () => (lessonSpot ? closeLesson() : activeSpot != null ? selectSpot(null) : selectPrefecture(null));
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
      <main className="relative h-full">
        <JapanMap
          selectedId={selectedId}
          onSelect={selectPrefecture}
          activeSpot={activeSpot}
          onSpotSelect={selectSpot}
          onSpotLearn={openLesson}
          reserveRight={selected && isWide ? PANEL_WIDTH_PX + 24 : 0}
          reserveBottom={selected && !isWide ? SHEET_HEIGHT_PX : 0}
          onInteract={() => setInteracted(true)}
          legend={<MapLegend />}
          search={<PrefecturePicker onPick={selectPrefecture} isClosed={(id) => journey.status === 'ok' && !journey.prefecture(id)?.isOpen} />}
        />

        {/* Đang xem một tỉnh: nút về toàn quốc + đường dẫn (thanh bên đã trượt ra ngoài) */}
        {selected && (
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
              word={toProvinceWord(journey.prefecture(notice.prefId)?.word)}
              furigana={furigana}
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

        {import.meta.env.DEV && <MissingIconsDevNotice />}

        {/* Thông tin tỉnh: panel bên phải (màn rộng) hoặc ngăn dưới (màn hẹp) */}
        {panelPref && (
          <PrefecturePanel
            key={panelPref.id}
            pref={panelPref}
            isWide={isWide}
            closing={closing}
            activeSpot={selected ? activeSpot : null}
            onSpotSelect={selectSpot}
            onSpotLearn={openLesson}
            onClose={() => selectPrefecture(null)}
            headingRef={headingRef}
          />
        )}

        {/* Bài học của địa điểm (?hoc=1): ngăn nổi trên bản đồ */}
        {selected && lessonSpot && (
          <SpotLesson key={lessonSpot.id} spot={lessonSpot} spotIndex={activeSpot!} pref={selected} furigana={furigana} isWide={isWide} onClose={closeLesson} />
        )}

        {/* Vừa đạt con dấu / con dấu tỉnh / chương mới */}
        <AwardOverlay lessonSpotId={lessonSpot?.id ?? null} journey={journey} isWide={isWide} />

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
          .jm-legend { position: absolute; right: 0; bottom: calc(100% + 10px); width: 300px; box-sizing: border-box; display: flex; flex-direction: column;
            gap: 2px; padding: 14px 16px 12px; border-radius: 18px; background: var(--paper-50); border: 1px solid var(--line);
            box-shadow: 0 14px 32px rgba(8,26,56,.3); color: var(--sumi); }
          .jm-legend-btn { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line);
            background: var(--paper-50); color: var(--sumi); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
          .jm-legend-btn:hover { background: var(--paper-100); }
          .jm-legend-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
          .jm-lg-sw { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 26px; border-radius: 6px; }
          .jm-lg-seal { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%;
            border: 2px solid var(--shu); color: var(--shu); font-family: var(--font-mincho); font-size: 12px; font-weight: 700; }
          .jm-lg-region { writing-mode: vertical-rl; padding: 2px 1px; background: var(--paper-50); border: 3px double var(--sumi);
            font-family: var(--font-mincho); font-size: 10px; line-height: 11px; font-weight: 700; }
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
          .jm-ph-name { font-family: var(--font-mincho); font-weight: 700; font-size: 42px; line-height: 50px; margin: 0; }
          @media (max-width: 1023px) { .jm-ph-name { font-size: 28px; line-height: 36px; } }
          .jm-ppanel { background: var(--paper-100); border: 1px solid var(--line); box-shadow: 0 14px 40px rgba(8,26,56,.38); color: var(--sumi); }
          .jm-region-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px;
            background: var(--paper-50); border: 1px solid var(--line); font-size: 12px; font-weight: 600; white-space: nowrap; }
          .jm-word { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 14px; background: var(--sora-soft); }
          .jm-word rt { font-size: 11px; }
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
        onSpotLearn={() => {}}
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
  /** Mở bài học của địa điểm */
  onSpotLearn: (index: number) => void;
  onClose: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}


const PrefecturePanel: React.FC<PrefecturePanelProps> = ({
  pref,
  isWide,
  closing,
  activeSpot,
  onSpotSelect,
  onSpotLearn,
  onClose,
  headingRef,
}) => {
  const navigate = useNavigate();
  const region = REGION_STYLE[pref.region];
  const headingId = useId();
  const landmarks = prefectureLandmarks(pref.id);
  const foods = prefectureFoods(pref.id);
  const spotsData = usePrefectureData(pref.id);
  const journeyForWord = useExploreJourney();
  const summary = journeyForWord.prefecture(pref.id);
  const word = toProvinceWord(summary?.word);

  // Lộ trình học: danh sách đi theo thứ tự lộ trình (không có lộ trình thì theo thứ tự gốc)
  const [furigana] = useFurigana();
  const progressOf = useSpotProgress();
  const route = prefectureRoute(pref.id);
  const order = route ? route.route : landmarks.map((_, i) => i);
  const nextIdx = nextSpotIndex(pref.id, (i) => isStamped(progressOf(landmarks[i].spotId)));
  const stampCount = landmarks.filter((lm) => isStamped(progressOf(lm.spotId))).length;
  const redCount = landmarks.filter((lm) => progressOf(lm.spotId) === 'red').length;
  // Dấu son chỉ có ở mốc có Hội thoại AI
  const redTotal = (spotsData.data?.spots ?? []).filter((s) => s.lesson?.activities.some((a) => a.type === 'Roleplay')).length;
  const prefStamp = spotsData.data?.stamp ?? summary?.stamp ?? null;
  const prefStampState = prefStamp ? (prefStamp.redStampedAt ? 'red' : 'stamp') : 'none';

  // Thẻ "đang học" ghim đầu danh sách: địa điểm đang chọn, chưa chọn thì địa điểm "Tiếp theo"
  const focusIdx = activeSpot ?? nextIdx;
  const rest = order.filter((n) => n !== focusIdx);
  const spotData = (n: number) => spotsData.data?.spots.find((s) => s.id === landmarks[n].spotId);

  // Đổi thẻ đang học (bấm một địa điểm khác): cuộn danh sách lên đầu để thấy thẻ vừa ghim
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef(focusIdx);
  useEffect(() => {
    if (lastFocus.current === focusIdx) return;
    lastFocus.current = focusIdx;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [focusIdx]);

  const canSpeak = useCanSpeakJa();

  return (
    <aside
      aria-labelledby={headingId}
      className={`${
        isWide
          ? 'jm-panel-right absolute top-3 right-3 bottom-3 rounded-[20px]'
          : 'jm-panel-bottom absolute left-0 right-0 bottom-0 rounded-t-[20px] !border-b-0'
      } ${closing ? 'jm-closing pointer-events-none' : ''} jm-ppanel z-20 flex flex-col overflow-hidden`}
      style={isWide ? { width: PANEL_WIDTH_PX } : { height: SHEET_HEIGHT_PX }}
    >
      <div ref={scrollRef} className={`flex flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain ${isWide ? 'px-5 pt-[18px] pb-4' : 'px-4 pt-3 pb-3'}`}>
        {/* Vùng + nút đóng */}
        <div className="flex items-center justify-between">
          <span className="jm-region-chip">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: region.ink }} aria-hidden="true" />
            Vùng {REGION_NAME[pref.region]}
            <span className="font-jp font-medium" lang="ja">
              {REGION_JP.get(pref.region)}
            </span>
          </span>
          <IconButton icon="close" label="Đóng, về toàn quốc" size="sm" onClick={onClose} />
        </div>

        {/* Tên tỉnh + con dấu tỉnh và số con dấu */}
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="jm-ph-name text-[var(--sumi)] outline-none" lang="ja">
              {pref.nameJp}
            </h2>
            <span className="flex items-center gap-1 text-base font-semibold text-[var(--sumi)]">
              {pref.nameVi}
              {canSpeak && <IconButton icon="volume_up" label="Nghe tên tỉnh" size="sm" onClick={() => speakJa(pref.nameJp)} />}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              role="img"
              aria-label={
                prefStampState === 'red'
                  ? `Con dấu ${pref.nameVi}: dấu son`
                  : prefStampState === 'stamp'
                    ? `Con dấu ${pref.nameVi}: đã có`
                    : `Con dấu ${pref.nameVi}: chưa có, cần con dấu của mọi địa điểm`
              }
            >
              <PrefectureStampMark d={pref.d} main={pref.main} nameJp={pref.nameJp} state={prefStampState} size={isWide ? 56 : 44} seed={pref.id} />
            </span>
            {landmarks.length > 0 && (
              <span className="flex flex-col items-end">
                <span className="text-[28px] font-bold leading-8 text-[var(--shu)]">{`${stampCount}/${landmarks.length}`}</span>
                <span className="text-xs text-[var(--sumi-muted)]">con dấu</span>
                {redTotal > 0 && <span className="text-xs font-semibold text-[var(--shu)]">{`Dấu son ${redCount}/${redTotal}`}</span>}
              </span>
            )}
          </div>
        </div>

        {/* Một từ ở tỉnh */}
        {word && (
          <section aria-label="Một từ ở tỉnh" className="jm-word">
            <span className="font-jp text-2xl font-bold leading-[34px]" lang="ja">
              {furigana && word[1] ? (
                <ruby>
                  {word[0]}
                  <rt className="text-[11px] font-medium text-[var(--sumi-muted)]">{word[1]}</rt>
                </ruby>
              ) : (
                word[0]
              )}
            </span>
            <span className="flex min-w-0 flex-grow flex-col">
              <span className="text-xs font-semibold leading-4 text-[var(--sumi-muted)]">Một từ ở tỉnh</span>
              <span className="text-[15px] font-semibold leading-[22px]">{word[2]}</span>
              {word[3] && <span className="text-xs leading-[18px] text-[var(--sumi-muted)]">{word[3]}</span>}
            </span>
            {canSpeak && <IconButton icon="volume_up" label={`Nghe từ ${word[0]}`} size="sm" onClick={() => speakJa(word[1] || word[0])} />}
          </section>
        )}

        <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[15px] font-bold leading-[22px] text-[var(--sumi)]">
          Địa điểm học <span className="font-medium text-[var(--sumi-muted)]">{landmarks.length}</span>
        </h3>

        {landmarks.length === 0 && spotsData.status !== 'ok' && (
          <p className="mb-3 text-sm text-[var(--ink-2)]" role="status">
            {spotsData.status === 'error' ? 'Không tải được các mốc học. Hãy thử mở lại tỉnh.' : 'Đang tải các mốc học…'}
          </p>
        )}
        {landmarks.length === 0 && spotsData.status === 'ok' && (
          <p className="mb-3 text-sm text-[var(--ink-2)]">Tỉnh này chưa có mốc học nào.</p>
        )}

        {focusIdx != null && landmarks[focusIdx] && (
          <SpotFocusCard
            key={landmarks[focusIdx].spotId}
            spot={spotData(focusIdx)}
            pictogramId={landmarks[focusIdx].pictogram.id}
            nameVi={landmarks[focusIdx].pictogram.nameVi}
            nameJp={landmarks[focusIdx].pictogram.nameJp}
            stopN={route ? route.stop[focusIdx] : null}
            phrase={landmarks[focusIdx].phrase}
            state={progressOf(landmarks[focusIdx].spotId)}
            furigana={furigana}
            compact={!isWide}
            active={activeSpot === focusIdx}
            isNext={focusIdx === nextIdx}
            ink={region.ink}
            onToggle={() => onSpotSelect(activeSpot === focusIdx ? null : focusIdx)}
            onLearn={() => onSpotLearn(focusIdx)}
            onShadowing={(id) => navigate(shadowingPracticeUrl(id, pref.slug, focusIdx))}
            onRoleplay={(id) => navigate(`/scenarios/${id}`)}
          />
        )}

        <ul className="flex flex-col">
          {rest.map((n) => {
            const lm = landmarks[n];
            const p = lm.pictogram;
            const shared = (PICTOGRAM_PREFECTURES[p.id] ?? []).filter((other) => other !== pref.id);
            const state = progressOf(lm.spotId);
            const color = state === 'red' ? T.shu : state === 'stamp' ? STAMP_INK : state === 'understood' ? region.ink : 'var(--sumi-muted)';
            return (
              <li key={lm.spotId}>
                <button
                  type="button"
                  onClick={() => onSpotSelect(n)}
                  className="jm-focus flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--paper-200)]"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ border: state === 'none' ? '2px dashed var(--sumi)' : `2.5px solid ${color}`, background: 'var(--paper-50)' }}
                  >
                    <PictogramIcon id={p.id} color={state === 'none' ? 'var(--sumi-muted)' : color} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-grow flex-col">
                    <span className="text-sm font-semibold leading-5 text-[var(--sumi)]">
                      {route && `${route.stop[n]}. `}
                      {p.nameVi}
                    </span>
                    <span className="font-jp text-xs text-[var(--sumi-muted)]" lang="ja">
                      {p.nameJp}
                      {shared.length > 0 && (
                        <span className="font-sans">{` · Cùng với ${shared.map((o) => PREFECTURE_BY_ID.get(o)?.nameVi).join(', ')}`}</span>
                      )}
                    </span>
                  </span>
                  <SpotStatus state={state} />
                </button>
              </li>
            );
          })}
        </ul>
        </div>

        {foods.length > 0 && (
          <>
            <h3 className="m-0 flex items-center gap-2 text-[15px] font-bold text-[var(--sumi)]">
              Đặc sản <span className="font-medium text-[var(--sumi-muted)]">{foods.length}</span>
            </h3>
            <ul className="-mt-2 grid grid-cols-2 gap-2">
              {foods.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-[12px] bg-[var(--paper-50)] p-2.5">
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
      <p className="shrink-0 truncate px-5 py-2.5 text-xs text-[var(--sumi-muted)] bg-[var(--paper-100)] border-t border-[var(--line)]">
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

/** Trạng thái ở cuối hàng địa điểm: con dấu màu mực chàm, dấu son màu son */
const SpotStatus: React.FC<{ state: SpotStamp }> = ({ state }) =>
  state === 'none' ? null : (
    <span
      className="shrink-0 text-xs font-bold"
      style={{ color: state === 'red' ? T.shu : state === 'stamp' ? STAMP_INK : 'var(--ink-2)' }}
    >
      {state === 'red' ? 'Dấu son' : state === 'stamp' ? 'Đã có dấu' : 'Đã hiểu'}
    </span>
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
const MapLegend: React.FC = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
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
        <div className="jm-legend" role="dialog" aria-label="Chú giải bản đồ">
          <div className="mb-1 flex items-center justify-between">
            <strong className="text-[15px]">Chú giải bản đồ</strong>
            <IconButton icon="close" label="Đóng chú giải" size="sm" onClick={() => setOpen(false)} />
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
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--shu)]" style={{ boxShadow: '0 0 0 5px var(--shu-soft)' }} />
              </span>
            }
            title="Chấm đỏ"
            text="Mốc tiếp theo nên học"
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
      <button type="button" className="jm-legend-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="map" size={20} />
        Chú giải
      </button>
    </div>
  );
};

const LegendRow: React.FC<{ sw: React.ReactNode; title: string; text: string }> = ({ sw, title, text }) => (
  <div className="flex items-center gap-3 py-[7px] text-[13px] leading-[18px]">
    {sw}
    <div>
      <b className="block text-sm font-semibold leading-5">{title}</b>
      <span className="text-[var(--sumi-muted)]">{text}</span>
    </div>
  </div>
);

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
    {word && (
      <div className="mt-2 border-t border-[var(--line)] pt-2 text-sm text-[var(--sumi-muted)]">
        Một từ ở {pref.nameVi}:{' '}
        <span className="font-jp font-bold text-[var(--sumi)]" lang="ja">
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
    <div ref={rootRef} className="relative shrink-0" data-map-ui>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Tìm tỉnh"
        onClick={() => (open ? close(false) : setOpen(true))}
        title="Tìm tỉnh"
        className={`jm-mapctl ${open ? 'on' : ''}`}
      >
        <Icon name="search" size={22} />
      </button>

      {open && (
        <div className="jm-reveal fixed sm:absolute left-3 right-3 sm:left-auto sm:right-[calc(100%+10px)] top-3 sm:top-auto sm:bottom-0 sm:w-[320px] rounded-[16px] bg-[var(--paper-50)] border border-[var(--line)] shadow-[0_14px_32px_rgba(8,26,56,.3)] overflow-hidden z-40">
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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
