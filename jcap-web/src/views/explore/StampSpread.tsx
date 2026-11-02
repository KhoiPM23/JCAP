import React from 'react';
import { Badge, Button, Icon } from '../../components/jcap';
import { PREFECTURES } from '../../data/japanMap';
import type { ExplorePrefectureSummary, ExploreStampedSpot } from '../../types/explore';
import { PrefectureStampMark, SpotStampMark, type PrefectureStampState } from './ExploreStamp';
import { prefectureWatermark, regionByKey, watermarkSize, type BookPage } from './stampBook';

/**
 * Một trang đôi của Sổ con dấu = một tỉnh. Trang trái: tỉnh, con dấu tỉnh, tiến độ. Trang phải: con dấu mốc đã đóng, sau đó là
 * ô trống tròn nét đứt cho mốc chưa học (không ghi tên). Tỉnh chưa mở được: trang phải để trống, chỉ có ấn 未開放.
 * Con dấu là SpotStampMark / PrefectureStampMark, giống hệt con dấu trên bản đồ.
 */

export const PREFECTURE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));

export const prefectureState = (p: ExplorePrefectureSummary | undefined): PrefectureStampState =>
  p?.stamp?.redStampedAt ? 'red' : p?.stamp ? 'stamp' : 'none';

export interface TurnNav {
  label: string;
  aria: string;
  onClick: () => void;
}

interface SpreadFrameProps {
  /** Hướng lật để hiện hoạt ảnh vào: fwd = sang trang sau, back = về trang trước, rỗng = không hoạt ảnh */
  motion: '' | 'fwd' | 'back';
  prev: TurnNav | null;
  next: TurnNav | null;
  /** Thẻ đánh dấu sách 栞 treo ở mép trên trang phải */
  shiori?: boolean;
  children: React.ReactNode;
}

const SpreadFrame: React.FC<SpreadFrameProps> = ({ motion, prev, next, shiori, children }) => (
  <div className={`sb-spread ${motion}`} data-theme="kham-pha">
    {children}
    {prev && (
      <button type="button" className="sb-turn l" onClick={prev.onClick} aria-label={prev.aria}>
        <Icon name="chevron_left" size={20} />
        {prev.label}
      </button>
    )}
    {next && (
      <button type="button" className="sb-turn r" onClick={next.onClick} aria-label={next.aria}>
        {next.label}
        <Icon name="chevron_right" size={20} />
      </button>
    )}
    {shiori && <Shiori />}
  </div>
);

/** Thẻ đánh dấu sách (shiori): dải giấy hẹp viền đỏ son, chữ dọc 学習中, dây đỏ và tua */
const Shiori: React.FC = () => (
  <svg className="sb-shiori" viewBox="0 0 44 170" role="img" aria-label="Tỉnh đang học">
    <title>Tỉnh đang học</title>
    <g stroke="var(--shu)" strokeWidth="1.1" strokeLinecap="round" fill="none">
      <path d="M22 6 L15 -14" />
      <path d="M22 6 L19 -16" />
      <path d="M22 6 L23 -16" />
      <path d="M22 6 L27 -15" />
      <path d="M22 6 L30 -12" />
    </g>
    <path d="M22 44 C 14 32, 30 20, 22 8" fill="none" stroke="var(--shu)" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="22" cy="7" r="3" fill="var(--shu)" />
    <rect x="11" y="36" width="22" height="122" rx="1.5" fill="var(--paper-50)" stroke="var(--line-strong)" strokeWidth=".8" />
    <rect x="14" y="39" width="16" height="116" fill="none" stroke="var(--shu)" strokeWidth=".6" opacity=".55" />
    <circle cx="22" cy="44" r="1.8" fill="var(--sumi-faint)" />
    <text
      x="22"
      y="58"
      textAnchor="start"
      fontSize="12.5"
      fontWeight="700"
      letterSpacing="3"
      fill="var(--shu)"
      style={{ fontFamily: 'var(--font-mincho)', writingMode: 'vertical-rl' }}
    >
      学習中
    </text>
  </svg>
);

// ---------------------------------------------------------------------------

interface PrefectureSpreadProps {
  page: BookPage;
  /** Con dấu mốc đã đóng ở tỉnh này */
  spots: ExploreStampedSpot[];
  /** Dòng giải thích vì sao chưa mở (chỉ dùng khi tỉnh chưa mở được) */
  condition: string;
  isLearning: boolean;
  motion: SpreadFrameProps['motion'];
  prev: TurnNav | null;
  next: TurnNav | null;
  onOpen: (slug: string) => void;
}

export const PrefectureSpread: React.FC<PrefectureSpreadProps> = ({ page, spots, condition, isLearning, motion, prev, next, onOpen }) => {
  const summary = page.prefecture;
  const shape = PREFECTURE_BY_ID.get(summary.id);
  if (!shape) return null;
  const region = regionByKey(page.region);
  const unlocked = !summary.isLocked;
  const state = prefectureState(summary);
  const watermark = prefectureWatermark(shape.nameJp);
  const empty = Math.max(0, summary.spotCount - spots.length);

  return (
    <SpreadFrame motion={motion} prev={prev} next={next} shiori={isLearning && unlocked}>
      <section className="sb-pg-l" aria-label={`${shape.nameVi}, ${region.name}${unlocked ? '' : ', chưa mở'}`}>
        <span className="sb-wm" style={{ fontSize: watermarkSize(watermark) }} lang="ja" aria-hidden="true">
          {watermark}
        </span>
        <div className="relative flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-semibold text-sumi-muted">
          <span>{region.name}</span>
          {isLearning && unlocked && <Badge tone="shu">Đang học</Badge>}
          {!unlocked && (
            <Badge tone="neutral" icon="lock">
              Chưa mở
            </Badge>
          )}
        </div>
        <div className="relative flex items-baseline gap-3">
          <h2 className="m-0 text-[28px] font-bold leading-[38px]">{shape.nameVi}</h2>
          <span lang="ja" className="font-mincho text-base text-sumi-muted">
            {shape.nameJp}
          </span>
        </div>

        {unlocked ? (
          <>
            <div className="sb-prow relative">
              <PrefectureStampMark
                d={shape.d}
                main={shape.main}
                nameJp={shape.nameJp}
                caption={`${summary.stampCount}/${summary.spotCount}`}
                state={state}
                size={96}
                seed={summary.id}
              />
              <div className="flex min-w-[150px] flex-[1_1_150px] flex-col gap-0.5">
                {state === 'red' && (
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold leading-5 text-shu">
                    <Icon name="workspace_premium" size={16} fill />
                    Đã có dấu son tỉnh
                  </span>
                )}
                {state === 'stamp' && (
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold leading-5 text-success">
                    <Icon name="check_circle" size={16} fill />
                    Đã có con dấu tỉnh
                  </span>
                )}
                {state === 'none' && (
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold leading-5 text-sumi-muted">
                    <Icon name="radio_button_unchecked" size={16} fill />
                    Chưa có con dấu tỉnh
                  </span>
                )}
                <span className="text-[13px] leading-5 text-sumi-muted">
                  {summary.stampCount}/{summary.spotCount} địa điểm có con dấu
                  {summary.redStampCount > 0 && ` · ${summary.redStampCount} dấu son`}
                </span>
              </div>
              <Button size="sm" variant="ghost" icon="map" onClick={() => onOpen(shape.slug)} aria-label={`Mở ${shape.nameVi} trên bản đồ`}>
                Mở
              </Button>
            </div>
          </>
        ) : (
          <div className="relative flex max-w-[390px] gap-3 rounded-jc-lg border border-line bg-paper-100 px-4 py-3.5">
            <Icon name="lock" size={22} className="text-sumi-muted" />
            <span className="min-w-0 flex-1 text-sm leading-[22px]">{condition}</span>
          </div>
        )}
      </section>

      {unlocked ? (
        <section className="sb-pg-r sb-grain" aria-label={`Con dấu đã đóng ở ${shape.nameVi}`}>
          <ul className="sb-slotgrid">
            {spots.map((s) => (
              <li key={s.spotId} className="sb-cell">
                <SpotStampMark
                  iconId={s.iconId}
                  nameJp={s.nameJp}
                  sub={shape.nameJp}
                  date={s.redStampedAt ?? s.stampedAt}
                  state={s.redStampedAt ? 'red' : 'stamp'}
                  size={72}
                  seed={s.spotId}
                />
                <span className="text-xs leading-4 text-sumi">{s.nameVi}</span>
                <span className="sr-only">{s.redStampedAt ? 'Có dấu son' : 'Có con dấu'}</span>
              </li>
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <li key={`empty-${i}`} className="sb-cell" aria-hidden="true">
                <span className="sb-slot" style={{ width: 72, height: 72 }} />
              </li>
            ))}
          </ul>
          {summary.spotCount === 0 && <p className="m-0 text-sm leading-[22px] text-sumi-muted">Tỉnh này chưa có địa điểm nào.</p>}
        </section>
      ) : (
        <section className="sb-pg-r sb-grain items-center justify-center" aria-hidden="true">
          <span
            lang="ja"
            className="inline-flex h-[168px] w-[168px] items-center justify-center rounded-[12px] border-[3px] border-double border-sumi-faint font-mincho text-[44px] font-bold tracking-[.1em] text-sumi-faint opacity-55"
            style={{ transform: 'rotate(-9deg)' }}
          >
            未開放
          </span>
          <p className="absolute bottom-11 left-9 right-9 m-0 text-center text-[13px] leading-5 text-sumi-muted">
            Trang này còn trống. Mốc và con dấu sẽ hiện khi bạn mở tỉnh.
          </p>
        </section>
      )}
    </SpreadFrame>
  );
};
