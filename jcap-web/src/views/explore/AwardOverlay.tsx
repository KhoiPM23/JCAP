import React, { useEffect, useId, useRef } from 'react';
import { PREFECTURES } from '../../data/japanMap';
import { cachedPrefecture, cachedSpot, dismissAward, useAwardQueue, type AwardEvent, type JourneyState } from './exploreStore';
import { PrefectureStampMark, SpotStampMark } from './ExploreStamp';
import { T } from './exploreTheme';
import { stampOf } from './learnProgress';

const PREFECTURE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));
/** Thông báo nhỏ (chỉ con dấu mốc) tự ẩn sau khoảng này */
const TOAST_MS = 4500;

/**
 * Báo những gì vừa đạt, mỗi sự kiện đúng một lần (server chỉ báo "vừa đạt" ở lần đồng bộ cấp nó):
 * - Con dấu tỉnh, dấu son tỉnh, chương mới mở: hộp thoại giữa màn hình, con dấu tỉnh "đóng cộp".
 * - Chỉ con dấu mốc: thông báo nhỏ ở góc. Nếu đang mở bài học của chính mốc đó thì bỏ qua,
 *   vì con dấu trong ngăn bài học đã tự "đóng cộp".
 */
export const AwardOverlay: React.FC<{ lessonSpotId: number | null; journey: JourneyState; isWide: boolean }> = ({ lessonSpotId, journey, isWide }) => {
  const queue = useAwardQueue();
  const event = queue[0];
  if (!event) return null;
  const a = event.awards;
  const big = a.prefectureStamp || a.prefectureRedStamp || a.unlockedChapterIds.length > 0;
  if (big) return <BigAward key={event.key} event={event} journey={journey} />;
  const spotIds = [...new Set([...a.redStampSpotIds, ...a.stampSpotIds])].filter((id) => id !== lessonSpotId);
  return <SpotToast key={event.key} event={event} spotIds={spotIds} isWide={isWide} />;
};

const SpotToast: React.FC<{ event: AwardEvent; spotIds: number[]; isWide: boolean }> = ({ event, spotIds, isWide }) => {
  useEffect(() => {
    const t = window.setTimeout(() => dismissAward(event.key), spotIds.length ? TOAST_MS : 0);
    return () => window.clearTimeout(t);
  }, [event.key, spotIds.length]);
  const spot = spotIds.length ? cachedSpot(spotIds[0]) : undefined;
  if (!spot) return null;
  const red = event.awards.redStampSpotIds.includes(spot.id);
  const more = spotIds.length - 1;
  return (
    <div
      role="status"
      className={`jm-reveal absolute z-50 flex items-center gap-3 rounded-[8px] border border-[var(--ink-line)] bg-[var(--paper)] py-2.5 pl-2.5 pr-4 shadow-[var(--sh-2)] ${
        isWide ? 'left-4 bottom-4' : 'left-3 right-3 top-3'
      }`}
    >
      <SpotStampMark iconId={spot.iconId} nameJp={spot.nameJp} state={stampOf(spot.progress)} size={52} seed={spot.id} pressing />
      <div className="min-w-0">
        <div className="text-sm font-bold" style={{ color: red ? T.shu : 'var(--ink)' }}>
          {red ? 'Dấu son mới' : 'Con dấu mới'}
        </div>
        <div className="truncate text-sm text-[var(--ink-2)]">
          {spot.nameVi}
          {more > 0 && ` và ${more} địa điểm khác`}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismissAward(event.key)}
        aria-label="Đóng thông báo"
        className="jm-focus -mr-2 ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

const BigAward: React.FC<{ event: AwardEvent; journey: JourneyState }> = ({ event, journey }) => {
  const headingId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const a = event.awards;
  const pref = PREFECTURE_BY_ID.get(event.prefectureId);
  const detail = cachedPrefecture(event.prefectureId);
  const chapters = (journey.data?.chapters ?? []).filter((c) => a.unlockedChapterIds.includes(c.id));
  const prefAward = a.prefectureStamp || a.prefectureRedStamp;
  const red = a.prefectureRedStamp || !!detail?.stamp?.redStampedAt;
  const close = () => dismissAward(event.key);

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc đóng hộp thoại này, không lùi bản đồ
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.key]);

  const title = a.prefectureRedStamp
    ? `Dấu son tỉnh ${pref?.nameVi ?? ''}`
    : a.prefectureStamp
      ? `Con dấu tỉnh ${pref?.nameVi ?? ''}`
      : chapters.length > 1
        ? 'Chương mới đã mở'
        : `Đã mở ${chapters[0]?.title ?? 'chương mới'}`;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(8,20,44,0.45)] p-4 jm-reveal">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="jm-paper-panel flex w-[min(380px,100%)] flex-col items-center rounded-[10px] px-6 pb-5 pt-6 text-center"
      >
        {prefAward && pref && (
          <PrefectureStampMark
            d={pref.d}
            main={pref.main}
            nameJp={pref.nameJp}
            caption={detail ? `${detail.spots.length}/${detail.spots.length}` : undefined}
            state={red ? 'red' : 'stamp'}
            size={150}
            seed={pref.id}
            pressing
          />
        )}
        <h2 id={headingId} className="mt-4 text-lg font-bold" style={{ color: a.prefectureRedStamp ? T.shu : 'var(--ink)' }}>
          {title}
        </h2>
        {prefAward && (
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            {a.prefectureRedStamp
              ? 'Bạn đã có dấu son ở mọi địa điểm có Hội thoại AI của tỉnh.'
              : 'Bạn đã có con dấu ở mọi địa điểm của tỉnh.'}
          </p>
        )}
        {chapters.map((c) => (
          <p key={c.id} className="mt-2 rounded-[6px] bg-[var(--primary-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-ink)]">
            Đã mở {c.title} ({c.minLevel === c.maxLevel ? c.minLevel : `${c.minLevel}–${c.maxLevel}`})
          </p>
        ))}
        <button
          ref={buttonRef}
          type="button"
          onClick={close}
          className="jm-focus mt-5 h-11 w-full rounded-[6px] text-sm font-semibold text-white"
          style={{ background: 'var(--primary)' }}
        >
          Tiếp tục
        </button>
      </section>
    </div>
  );
};
