import React, { useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PrefectureShape } from '../../data/japanMap';
import type { ProvinceWord } from '../../data/learnContent';
import { loadPrefecture, useExploreJourney, usePrefectureData } from './exploreStore';
import { REGION_STYLE } from './exploreTheme';
import { isStamped } from './learnProgress';
import { nextSpotIndex } from './learnRoute';
import { PanelCredit } from './PanelCredit';
import { PanelSwitch } from './PanelSwitch';
import { toPanelSpot } from './panelSpot';
import { PrefectureOverview } from './PrefectureOverview';
import { spotAreas } from './spotAreas';
import { SpotDetail } from './SpotDetail';
import './prefecturePanel.css';

export interface PrefecturePanelProps {
  pref: PrefectureShape;
  isWide: boolean;
  /** Bề rộng ngăn ở màn rộng (px) */
  width: number;
  closing: boolean;
  word: ProvinceWord | null;
  /** Mốc đang mở (tầng 2); null = đang ở danh sách (tầng 1) */
  activeSpot: number | null;
  onSpotSelect: (index: number | null) => void;
  /** Mở khung luyện Shadowing của địa điểm cạnh ngăn này */
  onShadowing: (index: number) => void;
  furigana: boolean;
  /** Đường dẫn cũ ?hoc=1: mở mốc với bước Hiểu mở sẵn */
  openUnderstand: boolean;
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
  activeSpot,
  onSpotSelect,
  onShadowing,
  furigana,
  openUnderstand,
  highlight,
  onHover,
  practicingSpot = null,
  onClose,
  headingRef,
}) => {
  const navigate = useNavigate();
  const headingId = useId();
  const spotsData = usePrefectureData(pref.id);
  const summary = useExploreJourney().prefecture(pref.id);
  const spots = (spotsData.data?.spots ?? []).map(toPanelSpot);
  const nextIndex = nextSpotIndex(pref.id, (i) => !!spots[i] && isStamped(spots[i].stamp));
  const stamp = spotsData.data?.stamp ?? summary?.stamp ?? null;
  const open = activeSpot != null ? spots[activeSpot] : undefined;
  const openArea = open ? spotAreas(spots.map((s) => s.data.nameVi)).find((a) => a.members.includes(open.index)) : undefined;
  /** Mốc vừa xem: quay về danh sách thì focus lại đúng dòng đó */
  const lastOpen = useRef<number | null>(null);
  if (open) lastOpen.current = open.index;
  /** Vị trí cuộn của danh sách, để quay về đúng chỗ */
  const listScroll = useRef(0);
  const ghostRef = useRef<HTMLHeadingElement>(null);

  const openRoleplay = (index: number, scenarioId: number) => {
    const returnUrl = `/explore?tinh=${pref.slug}&spot=${index}`;
    navigate(`/scenarios/${scenarioId}?return=${encodeURIComponent(returnUrl)}`);
  };

  return (
    <aside
      aria-labelledby={headingId}
      className={`jm-pp ${isWide ? 'is-wide jm-panel-right' : 'is-sheet jm-panel-bottom'}${closing ? ' jm-closing pointer-events-none' : ''}`}
      style={{ width: isWide ? width : undefined, '--jm-region-ink': REGION_STYLE[pref.region].ink } as React.CSSProperties}
    >
      {!isWide && <span className="jm-pp-grab" aria-hidden="true" />}
      <PanelSwitch
        id={open ? `spot-${open.data.id}` : 'list'}
        order={open ? open.index : -1}
        leavingProps={{ headingRef: ghostRef, headingId: `${headingId}-old` }}
      >
        {open ? (
          <SpotDetail
            key={open.data.id}
            pref={pref}
            spots={spots}
            spot={open}
            area={openArea?.name ?? null}
            furigana={furigana}
            openUnderstand={openUnderstand}
            practicing={practicingSpot === open.index}
            onBack={() => onSpotSelect(null)}
            onSelect={onSpotSelect}
            onShadowing={onShadowing}
            onRoleplay={openRoleplay}
            headingId={headingId}
            headingRef={headingRef}
          />
        ) : (
          <PrefectureOverview
            pref={pref}
            spots={spots}
            status={spotsData.status}
            onRetry={() => loadPrefecture(pref.id, true)}
            word={word}
            furigana={furigana}
            prefStamp={stamp ? (stamp.redStampedAt ? 'red' : 'stamp') : 'none'}
            nextIndex={nextIndex}
            highlight={highlight}
            onHover={onHover}
            onOpen={onSpotSelect}
            restoreRow={lastOpen.current}
            scrollMemory={listScroll}
            practicing={practicingSpot != null}
            onClose={onClose}
            headingId={headingId}
            headingRef={headingRef}
          />
        )}
      </PanelSwitch>
      <PanelCredit />
    </aside>
  );
};
