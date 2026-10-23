import React, { memo } from 'react';
import { T, mix } from './exploreTheme';

/** Vòng ngoài ~7 km và vòng trong ~3.5 km quanh mỗi địa điểm (đơn vị bản đồ: ~1 độ = 100) */
const OUTER_UNITS = 6.5;
const INNER_UNITS = 3.6;
/** Trên màn hình, vòng không được to quá mức này (px) */
const OUTER_MAX_PX = 62;
const INNER_MAX_PX = 34;
/** Màu son nhạt pha vào vòng trong của địa điểm đã đủ dấu */
const DONE_TINT = mix(T.shu, T.paper, 0.5);

/** Hệ số lượng tử hoá của độ phóng: vòng chỉ đổi cỡ khi zoom đổi hơn 2% */
export const ZONE_ZOOM_STEP = 1.02;

export interface Zone {
  key: string;
  x: number;
  y: number;
  done: boolean;
}

/**
 * Hai vòng tròn "vùng khám phá" quanh mỗi địa điểm, cắt theo hình tỉnh (một clipPath chung cho cả nhóm).
 * `pxQ` = 1 / độ phóng đã lượng tử hoá (đơn vị bản đồ trên mỗi px): nhờ vậy component memo không vẽ lại ở mọi khung hình.
 */
interface ZoneCirclesProps {
  zones: Zone[];
  clipId: string;
  clipD: string;
  color: string;
  pxQ: number;
}

const sameZones = (a: Zone[], b: Zone[]) =>
  a.length === b.length && a.every((z, i) => z.key === b[i].key && z.x === b[i].x && z.y === b[i].y && z.done === b[i].done);

export const ZoneCircles = memo<ZoneCirclesProps>(
  ({ zones, clipId, clipD, color, pxQ }) => {
    if (!zones.length) return null;
    const rOut = Math.min(OUTER_UNITS, OUTER_MAX_PX * pxQ);
    const rIn = Math.min(INNER_UNITS, INNER_MAX_PX * pxQ);
    return (
      <g pointerEvents="none" aria-hidden="true">
        <clipPath id={clipId}>
          <path d={clipD} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          {zones.map((z) => (
            <g key={z.key}>
              <circle cx={z.x} cy={z.y} r={rOut} fill={color} fillOpacity={0.32} />
              <circle cx={z.x} cy={z.y} r={rIn} fill={z.done ? mix(color, DONE_TINT, 0.45) : color} fillOpacity={0.7} />
            </g>
          ))}
        </g>
      </g>
    );
  },
  (a, b) => a.clipId === b.clipId && a.clipD === b.clipD && a.color === b.color && a.pxQ === b.pxQ && sameZones(a.zones, b.zones),
);
