import React, { memo, useCallback } from 'react';
import { PREFECTURES } from '../../data/japanMap';
import type { AdminExplorePrefecture } from '../../types/adminExplore';

/**
 * Bản đồ tĩnh cho admin: chỉ tô màu theo trạng thái tỉnh, không hoạt ảnh, không phóng to.
 * 47 đường vẽ được ghi nhớ (memo) nên đổi tỉnh đang chọn chỉ vẽ lại vài tỉnh liên quan.
 */

export type PrefectureState = 'open' | 'ready' | 'closed';

export function prefectureState(p: AdminExplorePrefecture | undefined): PrefectureState {
  if (!p) return 'closed';
  if (p.isOpen) return 'open';
  return p.publishedSpotCount > 0 ? 'ready' : 'closed';
}

export const STATE_LABEL: Record<PrefectureState, string> = {
  open: 'Đang mở',
  ready: 'Chưa mở · đã có mốc',
  closed: 'Chưa mở',
};

const FILL: Record<PrefectureState, string> = {
  open: 'fill-emerald-500 hover:fill-emerald-600',
  ready: 'fill-emerald-200 hover:fill-emerald-300',
  closed: 'fill-slate-200 hover:fill-slate-300',
};

// Khung bao các đảo chính (bỏ phần biển trống); Okinawa ở xa phía tây nam nên vẽ trong ô phụ ở góc biển trống
export const ADMIN_MAP_VIEWBOX: [number, number, number, number] = [480, 20, 1500, 1560];
const VIEWBOX = ADMIN_MAP_VIEWBOX.join(' ');
const OKINAWA_ID = 47;
const INSET = { x: 500, y: 40, w: 440, h: 330, scale: 1.05 };
const OKINAWA_FOCUS = PREFECTURES.find((p) => p.id === OKINAWA_ID)!.focus;
const INSET_TRANSFORM = `translate(${INSET.x + 20 - OKINAWA_FOCUS[0] * INSET.scale} ${INSET.y + 20 - OKINAWA_FOCUS[1] * INSET.scale}) scale(${INSET.scale})`;

interface Props {
  prefectures: Map<number, AdminExplorePrefecture>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export const AdminExploreMap: React.FC<Props> = ({ prefectures, selectedId, onSelect }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const id = Number((e.target as Element).getAttribute('data-id'));
      if (id) onSelect(id);
    },
    [onSelect],
  );

  // Vẽ tỉnh thường trước, tỉnh có viền nháp và tỉnh đang chọn sau cùng để viền không bị tỉnh bên cạnh che
  const rank = (id: number) => (id === selectedId ? 2 : (prefectures.get(id)?.draftSpotCount ?? 0) > 0 ? 1 : 0);
  const ordered = PREFECTURES.filter((p) => p.id !== OKINAWA_ID).sort((a, b) => rank(a.id) - rank(b.id));
  const okinawa = PREFECTURES.find((p) => p.id === OKINAWA_ID)!;
  const renderPath = (shape: (typeof PREFECTURES)[number]) => {
    const p = prefectures.get(shape.id);
    return (
      <PrefecturePath
        key={shape.id}
        id={shape.id}
        d={shape.d}
        name={`${shape.nameVi} ${shape.nameJp}`}
        state={prefectureState(p)}
        hasDraft={(p?.draftSpotCount ?? 0) > 0}
        selected={shape.id === selectedId}
      />
    );
  };

  return (
    <svg
      viewBox={VIEWBOX}
      className="w-full h-full select-none"
      onClick={handleClick}
      role="img"
      aria-label="Bản đồ 47 tỉnh: chọn một tỉnh để xem và chỉnh"
    >
      {ordered.map(renderPath)}

      {/* Ô phụ Okinawa */}
      <defs>
        <clipPath id="admin-okinawa-inset">
          <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} />
        </clipPath>
      </defs>
      <rect
        x={INSET.x}
        y={INSET.y}
        width={INSET.w}
        height={INSET.h}
        rx={12}
        className="fill-white stroke-slate-300"
        strokeDasharray="6 5"
        vectorEffect="non-scaling-stroke"
      />
      <g clipPath="url(#admin-okinawa-inset)">
        <g transform={INSET_TRANSFORM}>{renderPath(okinawa)}</g>
      </g>
      <text x={INSET.x + INSET.w - 16} y={INSET.y + INSET.h - 18} textAnchor="end" className="fill-slate-500" fontSize={26} fontWeight={600}>
        Okinawa
      </text>
    </svg>
  );
};

interface PathProps {
  id: number;
  d: string;
  name: string;
  state: PrefectureState;
  hasDraft: boolean;
  selected: boolean;
}

const PrefecturePath = memo(function PrefecturePath({ id, d, name, state, hasDraft, selected }: PathProps) {
  const fill = selected ? 'fill-[#0878EE]' : FILL[state];
  const stroke = selected ? 'stroke-[#0550a0]' : hasDraft ? 'stroke-orange-500' : 'stroke-white';
  return (
    <path
      data-id={id}
      d={d}
      fillRule="evenodd"
      vectorEffect="non-scaling-stroke"
      strokeWidth={selected || hasDraft ? 2 : 0.75}
      strokeLinejoin="round"
      className={`${fill} ${stroke} cursor-pointer`}
    >
      <title>{`${name} · ${STATE_LABEL[state]}${hasDraft ? ' · có mốc nháp' : ''}`}</title>
    </path>
  );
});
