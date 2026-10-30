import React, { memo, useEffect, useMemo, useRef } from 'react';
import { PREFECTURES, projectLonLat } from '../../data/japanMap';
import type { ExploreSpotStatus } from '../../types/adminExplore';
import { unproject } from './adminExploreSpots';

/**
 * Bản đồ tĩnh của một tỉnh cho admin: không hoạt ảnh, không phóng to.
 * Dùng để xem vị trí các mốc, và (khi có onPick) bấm để đặt vị trí mốc đang soạn.
 */

export interface MapSpot {
  id: number;
  /** Số thứ tự của mốc trong tỉnh (khớp danh sách mốc), không phụ thuộc mốc nào đang được vẽ */
  no: number;
  lat: number;
  lon: number;
  status: ExploreSpotStatus;
  label: string;
}

interface Props {
  prefectureId: number;
  spots: MapSpot[];
  /** Mốc đang được chọn/soạn: vẽ nổi bật */
  highlightId?: number | null;
  onSpotClick?: (id: number) => void;
  /** Vị trí đang đặt (trình soạn) */
  pick?: { lat: number; lon: number } | null;
  /** Số thứ tự của mốc đang soạn, hiện trong chấm vị trí (mốc mới thì không có) */
  pickNo?: number | null;
  /** Bấm lên bản đồ để đặt vị trí; inside = điểm nằm trong tỉnh */
  onPick?: (lat: number, lon: number, inside: boolean) => void;
  /** Báo điểm đang đặt (kể cả gõ tay) có nằm trong tỉnh không */
  onPickInside?: (inside: boolean) => void;
  className?: string;
}

const PAD = 0.12;

export const AdminExplorePrefectureMap: React.FC<Props> = ({
  prefectureId,
  spots,
  highlightId,
  onSpotClick,
  pick,
  pickNo,
  onPick,
  onPickInside,
  className,
}) => {
  const shape = PREFECTURES.find((p) => p.id === prefectureId)!;
  const svgRef = useRef<SVGSVGElement>(null);
  const prefRef = useRef<SVGPathElement>(null);

  // Khung nhìn: vùng chính của tỉnh, nới ra để chứa các mốc đã lưu. Không theo điểm đang đặt,
  // để bấm gần mép không làm bản đồ đổi tỉ lệ dưới tay người dùng.
  const view = useMemo(() => {
    let [x0, y0, w, h] = shape.focus;
    let x1 = x0 + w;
    let y1 = y0 + h;
    const pts = spots.map((s) => projectLonLat(s.lat, s.lon));
    for (const [x, y] of pts) {
      // Bỏ qua điểm quá xa (toạ độ nhập sai) để bản đồ không bị thu nhỏ hết cỡ
      if (Math.abs(x - (x0 + x1) / 2) > 400 || Math.abs(y - (y0 + y1) / 2) > 400) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    w = Math.max(x1 - x0, 30);
    h = Math.max(y1 - y0, 30);
    return { x: x0 - w * PAD, y: y0 - h * PAD, w: w * (1 + 2 * PAD), h: h * (1 + 2 * PAD) };
  }, [shape, spots]);

  const neighbors = useMemo(
    () =>
      PREFECTURES.filter((p) => {
        if (p.id === prefectureId) return false;
        const [x, y, w, h] = p.bbox;
        return x < view.x + view.w && x + w > view.x && y < view.y + view.h && y + h > view.y;
      }),
    [prefectureId, view],
  );

  const unit = Math.max(view.w, view.h) / 100;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const spotId = target.closest('[data-spot-id]')?.getAttribute('data-spot-id');
    if (spotId && onSpotClick) {
      onSpotClick(Number(spotId));
      return;
    }
    if (!onPick || !svgRef.current) return;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const inside = prefRef.current?.isPointInFill(new DOMPoint(p.x, p.y)) ?? true;
    const [lat, lon] = unproject(p.x, p.y);
    onPick(Number(lat.toFixed(6)), Number(lon.toFixed(6)), inside);
  };

  const pickXY = pick ? projectLonLat(pick.lat, pick.lon) : null;

  useEffect(() => {
    if (!pickXY || !onPickInside || !prefRef.current) return;
    onPickInside(prefRef.current.isPointInFill(new DOMPoint(pickXY[0], pickXY[1])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.lat, pick?.lon, prefectureId]);

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className={`w-full h-full select-none ${onPick ? 'cursor-crosshair' : ''} ${className ?? ''}`}
      onClick={handleClick}
      role="img"
      aria-label={`Bản đồ ${shape.nameVi}${onPick ? ': bấm để đặt vị trí mốc' : ''}`}
    >
      <rect x={view.x} y={view.y} width={view.w} height={view.h} className="fill-sky-50" />
      <StaticShapes neighbors={neighbors} />
      <path
        ref={prefRef}
        d={shape.d}
        fillRule="evenodd"
        vectorEffect="non-scaling-stroke"
        strokeWidth={1.5}
        className="fill-white stroke-slate-400"
      />

      {spots.map((s) => {
        const [x, y] = projectLonLat(s.lat, s.lon);
        const hi = s.id === highlightId;
        return (
          <g key={s.id} data-spot-id={s.id} className={onSpotClick ? 'cursor-pointer' : undefined}>
            <title>{`${s.label} · ${s.status === 'Published' ? 'Đang dùng' : 'Nháp'}`}</title>
            {hi && <circle cx={x} cy={y} r={unit * 2.4} className="fill-[#0878EE]/15 stroke-[#0878EE]" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            <circle
              cx={x}
              cy={y}
              r={unit * 1.5}
              className={s.status === 'Published' ? 'fill-emerald-500' : 'fill-orange-500'}
              stroke="white"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <text x={x} y={y + unit * 0.55} textAnchor="middle" fontSize={unit * 1.5} fontWeight={700} className="fill-white pointer-events-none">
              {s.no}
            </text>
          </g>
        );
      })}

      {pickXY && (
        <g className="pointer-events-none">
          <circle cx={pickXY[0]} cy={pickXY[1]} r={unit * 2.2} className="fill-[#0878EE]/20 stroke-[#0878EE]" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {pickNo ? (
            <>
              <circle cx={pickXY[0]} cy={pickXY[1]} r={unit * 1.5} className="fill-[#0878EE]" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <text x={pickXY[0]} y={pickXY[1] + unit * 0.55} textAnchor="middle" fontSize={unit * 1.5} fontWeight={700} className="fill-white">
                {pickNo}
              </text>
            </>
          ) : (
            <circle cx={pickXY[0]} cy={pickXY[1]} r={unit * 0.7} className="fill-[#0878EE]" />
          )}
        </g>
      )}
    </svg>
  );
};

/** Các tỉnh lân cận chỉ để làm nền, không đổi theo thao tác nên ghi nhớ lại */
const StaticShapes = memo(function StaticShapes({ neighbors }: { neighbors: typeof PREFECTURES }) {
  return (
    <g className="pointer-events-none">
      {neighbors.map((p) => (
        <path key={p.id} d={p.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" strokeWidth={0.75} className="fill-slate-100 stroke-slate-300" />
      ))}
    </g>
  );
});
