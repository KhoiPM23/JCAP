import React from 'react';
import { pictogramUrl } from '../../data/japanPictograms';
import type { StationState } from './spotAreas';

export interface StationBadgeProps {
  state: StationState;
  pictogramId: string;
  size?: 26 | 30;
}

/**
 * Ô vuông chứa biểu tượng của mốc trong ngăn tỉnh, cùng 5 màu trạng thái với ghim trên bản đồ
 * (trang trí: trạng thái được đọc ở aria-label của nút chứa nó). Kiểu ở prefecturePanel.css.
 */
export const StationBadge: React.FC<StationBadgeProps> = ({ state, pictogramId, size = 26 }) => (
  <span className={`jm-stn s${size} is-${state}`} aria-hidden="true">
    <span className="jm-pict" style={{ '--pict': `url("${pictogramUrl(pictogramId)}")` } as React.CSSProperties} />
  </span>
);
