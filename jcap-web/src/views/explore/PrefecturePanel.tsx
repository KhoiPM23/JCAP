import React, { useId } from 'react';
import type { PrefectureShape } from '../../data/japanMap';
import type { ProvinceWord } from '../../data/learnContent';
import { loadPrefecture, useExploreJourney, usePrefectureData } from './exploreStore';
import { REGION_STYLE } from './exploreTheme';
import { isStamped } from './learnProgress';
import { nextSpotIndex } from './learnRoute';
import { toPanelSpot } from './panelSpot';
import { PrefectureOverview } from './PrefectureOverview';
import './prefecturePanel.css';

export interface PrefecturePanelProps {
  pref: PrefectureShape;
  isWide: boolean;
  /** Bề rộng ngăn ở màn rộng (px) */
  width: number;
  closing: boolean;
  word: ProvinceWord | null;
  onSpotSelect: (index: number | null) => void;
  /** Mở bài học của địa điểm */
  onSpotLearn: (index: number) => void;
  /** Mốc đang được rê chuột trên bản đồ hoặc trong ngăn */
  highlight: number | null;
  onHover: (index: number | null) => void;
  /** Địa điểm đang luyện Shadowing ở khung bên cạnh */
  practicingSpot?: number | null;
  onClose: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

/** Ngăn thông tin tỉnh: bên phải (màn rộng) hoặc tấm kéo từ dưới (màn hẹp) */
export const PrefecturePanel: React.FC<PrefecturePanelProps> = ({
  pref,
  isWide,
  width,
  closing,
  word,
  onSpotSelect,
  onSpotLearn,
  highlight,
  onHover,
  practicingSpot = null,
  onClose,
  headingRef,
}) => {
  const headingId = useId();
  const spotsData = usePrefectureData(pref.id);
  const summary = useExploreJourney().prefecture(pref.id);
  const spots = (spotsData.data?.spots ?? []).map(toPanelSpot);
  const nextIndex = nextSpotIndex(pref.id, (i) => !!spots[i] && isStamped(spots[i].stamp));
  const stamp = spotsData.data?.stamp ?? summary?.stamp ?? null;

  return (
    <aside
      aria-labelledby={headingId}
      className={`jm-pp ${isWide ? 'is-wide jm-panel-right' : 'is-sheet jm-panel-bottom'}${closing ? ' jm-closing pointer-events-none' : ''}`}
      style={{ width: isWide ? width : undefined, '--jm-region-ink': REGION_STYLE[pref.region].ink } as React.CSSProperties}
    >
      {!isWide && <span className="jm-pp-grab" aria-hidden="true" />}
      <PrefectureOverview
        pref={pref}
        spots={spots}
        status={spotsData.status}
        onRetry={() => loadPrefecture(pref.id, true)}
        word={word}
        prefStamp={stamp ? (stamp.redStampedAt ? 'red' : 'stamp') : 'none'}
        nextIndex={nextIndex}
        highlight={highlight}
        onHover={onHover}
        onOpen={onSpotSelect}
        onContinue={onSpotLearn}
        practicing={practicingSpot != null}
        onClose={onClose}
        headingId={headingId}
        headingRef={headingRef}
      />
    </aside>
  );
};
