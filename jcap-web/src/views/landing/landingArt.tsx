import React from 'react';
import { PREFECTURES } from '../../data/japanMap';
import './stamps.css';

/**
 * Phần hình dùng chung giữa landing (mục 9d) và các trang đăng nhập/đăng ký (mục 9e):
 * khung bản đồ các đảo chính, bộ lọc vệt mực của con dấu, icon Material Symbols.
 * File này kéo theo dữ liệu 47 tỉnh nên chỉ import từ các chunk tải lazy.
 */

/** Khung bản đồ các đảo chính (bỏ Okinawa), như prototype */
export const MAP_VB = [563.5, 37.8, 1336.1, 1472.8] as const;
export const MAP_VB_ATTR = MAP_VB.join(' ');
export const MAINLAND = PREFECTURES.filter((p) => p.id !== 47);

/** Bộ lọc vệt mực cho con dấu minh hoạ (CSS dùng url(#jc-inkfx)); mỗi trang chỉ đặt một lần */
export const InkFilter: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <defs>
      <filter id="jc-inkfx" x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={4} result="n1" />
        <feDisplacementMap in="SourceGraphic" in2="n1" scale={1.7} result="d" />
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves={3} seed={11} result="n2" />
        <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.6 2.75" result="m" />
        <feComposite in="d" in2="m" operator="in" />
      </filter>
    </defs>
  </svg>
);

/** Icon Material Symbols Rounded (class .msr trong landing.css / auth.css) */
export const Msr: React.FC<{ name: string; style?: React.CSSProperties }> = ({ name, style }) => (
  <span className="msr" aria-hidden="true" style={style}>
    {name}
  </span>
);

/** Ba con dấu minh hoạ (コンビニ, 駅, 食堂) dùng ở landing và trang đăng nhập */
export const DemoStamp: React.FC<{ kind: 'konbini' | 'eki' | 'shokudo'; size: number; rotate: number }> = ({ kind, size, rotate }) => {
  const style = { '--s': `${size}px`, '--r': `${rotate}deg` } as React.CSSProperties;
  if (kind === 'konbini')
    return (
      <span className="stp stp--ring" role="img" aria-label="Con dấu Cửa hàng tiện lợi" style={style}>
        <span className="in">
          <Msr name="storefront" />
          <b lang="ja">コンビニ</b>
          <i>—</i>
        </span>
      </span>
    );
  if (kind === 'eki')
    return (
      <span className="stp stp--sq" role="img" aria-label="Con dấu Nhà ga" style={style}>
        <span className="in">
          <b lang="ja">駅</b>
          <i>—</i>
        </span>
      </span>
    );
  return (
    <span className="stp stp--band" role="img" aria-label="Con dấu Quán ăn" style={style}>
      <span className="top">
        <b lang="ja">食堂</b>
      </span>
      <span className="in">
        <Msr name="restaurant" />
        <i>—</i>
      </span>
    </span>
  );
};
