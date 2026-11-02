import React, { useMemo } from 'react';
import { Button } from '../../components/jcap';
import { HOME_VIEWBOX, PREFECTURES } from '../../data/japanMap';
import type { ExploreChapter, ExplorePrefectureSummary, ExploreStampedSpot } from '../../types/explore';
import { SpotStampMark } from './ExploreStamp';
import { regionByKey, regionKeyOf, type BookPage, type StampRegionKey } from './stampBook';

/**
 * Bảng Tổng quan (nổi, neo dưới nút "Tổng quan"): 4 số liệu, bản đồ nhỏ các tỉnh đã đi và cách đọc sổ.
 * Đóng bằng bấm ra ngoài hoặc Esc (do trang cha xử lý).
 */

interface Props {
  stamps: ExploreStampedSpot[];
  /** Chương chỉ dùng để xếp thứ tự đường đã đi trên bản đồ nhỏ */
  chapters: ExploreChapter[];
  pages: BookPage[];
  prefectures: ExplorePrefectureSummary[];
  /** Vùng đang xem trong sổ: tô trên bản đồ nhỏ */
  region: StampRegionKey;
  onOpenMap: () => void;
}

const SAMPLE_ICON = 'P_chuson-ji';

export const StampOverview: React.FC<Props> = ({ stamps, chapters, pages, prefectures, region, onOpenMap }) => {
  const red = stamps.filter((s) => s.redStampedAt).length;
  const prefStamps = prefectures.filter((p) => p.stamp).length;
  const unlocked = pages.filter((p) => !p.prefecture.isLocked).length;

  const { marks, route } = useMemo(() => {
    const orderOfChapter = new Map(chapters.map((c) => [c.id, c.orderIndex]));
    const visited = prefectures
      .filter((p) => p.stamp || p.stampCount > 0)
      .sort((a, b) => (orderOfChapter.get(a.chapterId ?? -1) ?? 999) - (orderOfChapter.get(b.chapterId ?? -1) ?? 999) || a.id - b.id);
    const shapes = new Map(PREFECTURES.map((p) => [p.id, p]));
    const point = (id: number): [number, number] | null => {
      const m = shapes.get(id)?.main;
      return m ? [m[0] + m[2] / 2, m[1] + m[3] / 2] : null;
    };
    const items = visited.flatMap((p) => {
      const at = point(p.id);
      return at ? [{ id: p.id, at, ring: !!p.stamp }] : [];
    });
    return { marks: items, route: items.map((m) => m.at.join(',')).join(' ') };
  }, [chapters, prefectures]);

  return (
    <section id="stamp-overview" className="sb-ovp" data-theme="kham-pha" aria-label="Tổng quan sổ con dấu">
      <ul className="sb-ovs" aria-label="Số liệu">
        <li>
          <b>{stamps.length}</b>
          <span>con dấu địa điểm</span>
        </li>
        <li>
          <b style={{ color: 'var(--shu)' }}>{red}</b>
          <span>dấu son</span>
        </li>
        <li>
          <b>{prefStamps}</b>
          <span>con dấu tỉnh</span>
        </li>
        <li>
          <b>
            {unlocked}/{pages.length}
          </b>
          <span>tỉnh đã mở</span>
        </li>
      </ul>

      <div className="sb-ovmap">
        <svg className="sb-mini" viewBox={HOME_VIEWBOX.join(' ')} role="img" aria-label={`Bản đồ Nhật Bản, đang xem vùng ${regionByKey(region).name}`}>
          {PREFECTURES.map((p) => (
            <path key={p.id} d={p.d} className={regionKeyOf(p.region) === region ? 'on' : undefined} fillRule="evenodd" />
          ))}
          {marks.length > 1 && (
            <polyline points={route} fill="none" stroke="var(--shu)" strokeWidth="10" strokeDasharray="26 20" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--shu)', fill: 'none' }} />
          )}
          {marks.map((m) =>
            m.ring ? (
              <circle key={m.id} cx={m.at[0]} cy={m.at[1]} r="62" fill="none" stroke="var(--shu)" strokeWidth="16" style={{ stroke: 'var(--shu)', fill: 'none' }} />
            ) : (
              <circle key={m.id} cx={m.at[0]} cy={m.at[1]} r="38" style={{ fill: 'var(--ai)', stroke: 'none' }} />
            ),
          )}
        </svg>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs leading-4 text-sumi-muted">Đang xem vùng</span>
          <span className="text-base font-bold leading-[22px]">{regionByKey(region).name}</span>
          <span className="flex flex-col gap-0.5 text-xs leading-4 text-sumi-muted">
            <span>
              <i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full border-2 border-shu align-[-1px]" aria-hidden="true" />
              Tỉnh có con dấu tỉnh
            </span>
            <span>
              <i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-ai align-[-1px]" aria-hidden="true" />
              Tỉnh có con dấu địa điểm
            </span>
          </span>
          <div>
            <Button size="sm" variant="secondary" icon="map" onClick={onOpenMap}>
              Mở bản đồ
            </Button>
          </div>
        </div>
      </div>

      <div className="sb-howto">
        <b className="text-sm">Cách đọc sổ</b>
        <p className="m-0 mb-2 mt-0.5 text-[13px] leading-5 text-sumi-muted">Mỗi con dấu là một địa điểm bạn đã học xong.</p>
        <div className="sb-hrow">
          <SpotStampMark iconId={SAMPLE_ICON} nameJp="" state="stamp" size={40} seed={3} />
          <span>Mực xanh: đã học xong địa điểm</span>
        </div>
        <div className="sb-hrow">
          <SpotStampMark iconId={SAMPLE_ICON} nameJp="" state="red" size={40} seed={5} />
          <span>Dấu son đỏ: đã làm cả Hội thoại AI ở đó</span>
        </div>
        <div className="sb-hrow">
          <span className="sb-slot" style={{ width: 40, height: 40 }} aria-hidden="true" />
          <span>Ô còn trống: địa điểm chưa học (không hiện tên)</span>
        </div>
      </div>
    </section>
  );
};
