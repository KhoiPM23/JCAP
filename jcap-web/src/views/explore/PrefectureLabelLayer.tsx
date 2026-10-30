import React, { memo } from 'react';
import { PictogramIcon } from './exploreUi';

/**
 * Tên tỉnh (và biểu tượng tỉnh) dạng HTML, đặt theo khung bản đồ đã vẽ (renderView), nằm trong lớp nhãn mà
 * camera dịch/co giãn bằng transform giống ảnh bản đồ (JapanMap.applyCamera).
 *
 * Trước đây tên tỉnh là <text> trong <svg> bản đồ: mỗi lần bản đồ vẽ lại theo tỉ lệ mới (vài lần trong một lần
 * cuộn), trình duyệt phải dàn lại toàn bộ chữ SVG (cỡ chữ SVG phụ thuộc tỉ lệ màn hình) - mỗi lần 50-200ms,
 * gây giật khi zoom. Biểu tượng là <image> có filter đổi màu, bị đặt lại vị trí và vẽ lại filter mỗi khung hình.
 * Ở đây giữa hai lần vẽ lại không có việc gì cho luồng chính, và mỗi nhãn chỉ dùng transform (không left/top,
 * không đổi cỡ chữ) nên khi vẽ lại cũng không phải tính lại bố cục.
 */

export interface PrefectureLabelItem {
  id: number;
  /** Toạ độ px (theo khung đã vẽ) của điểm đặt nhãn */
  x: number;
  y: number;
  nameVi: string;
  nameJp: string;
  /** Biểu tượng chính của tỉnh (chỉ ở bản đồ toàn quốc) */
  icon?: string;
}

interface Props {
  items: PrefectureLabelItem[];
  /** Hệ số phóng của nhãn so với cỡ gốc (chữ 12px) */
  scale: number;
  /** 'main': tên tỉnh ở bản đồ toàn quốc; 'neighbor': tên tỉnh lân cận khi đang xem một tỉnh (nhỏ, nhạt) */
  variant: 'main' | 'neighbor';
  iconColor: string;
}

export const PrefectureLabels = memo(function PrefectureLabels({ items, scale, variant, iconColor }: Props) {
  const s = scale.toFixed(4);
  return (
    <>
      {items.map((it) => (
        <div
          key={it.id}
          className={`jm-plabel jm-plabel-${variant}`}
          // Mép trên-giữa của nhãn đặt đúng điểm (x, y): co giãn quanh điểm đó rồi dịch nửa bề rộng sang trái
          style={{ transform: `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, 0) scale(${s})` }}
        >
          {it.icon && <PictogramIcon id={it.icon} color={iconColor} className="jm-plabel-icon" />}
          <span className="jm-plabel-vi">{it.nameVi}</span>
          <span className="jm-plabel-jp font-jp" lang="ja">
            {it.nameJp}
          </span>
        </div>
      ))}
    </>
  );
});
