import React, { memo } from 'react';
import { T } from './exploreTheme';

export interface RoutePoint {
  x: number;
  y: number;
  /** Địa điểm này đã đủ dấu (4/4) */
  done: boolean;
}

/** Đường cong bậc hai từ a tới b, lệch vuông góc 18% độ dài đoạn (tối đa 40px) */
function curve(a: RoutePoint, b: RoutePoint): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = Math.min(len * 0.18, 40);
  const cx = (a.x + b.x) / 2 - (dy / len) * off;
  const cy = (a.y + b.y) / 2 + (dx / len) * off;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/**
 * Lộ trình học nối vị trí thật của các địa điểm theo thứ tự, nằm dưới lớp ghim (toạ độ màn hình).
 * Nét lót màu giấy bên dưới; đoạn mà cả hai đầu đã đủ dấu tô son, đoạn còn lại là chấm mực chàm.
 */
export const RouteLayer = memo<{ points: RoutePoint[] }>(({ points }) => {
  if (points.length < 2) return null;
  const segs = points.slice(1).map((p, i) => ({ d: curve(points[i], p), done: points[i].done && p.done }));
  return (
    <g className="jm-route" pointerEvents="none" aria-hidden="true">
      <path d={segs.map((s) => s.d).join('')} fill="none" stroke={T.paper} strokeWidth={7} strokeOpacity={0.85} strokeLinecap="round" />
      {segs.map((s, i) =>
        s.done ? (
          <path key={i} d={s.d} fill="none" stroke={T.shu} strokeWidth={3.2} strokeLinecap="round" />
        ) : (
          <path key={i} d={s.d} fill="none" stroke={T.inkLine} strokeWidth={2.2} strokeDasharray="1 7" strokeLinecap="round" strokeOpacity={0.75} />
        ),
      )}
    </g>
  );
});
