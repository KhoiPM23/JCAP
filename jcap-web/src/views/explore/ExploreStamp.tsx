import React, { useId } from 'react';
import { pictogramUrl } from '../../data/japanPictograms';
import type { SpotStamp } from './learnProgress';
import { T } from './exploreTheme';

/**
 * Con dấu kiểu ga tàu Nhật (eki stamp), vẽ hoàn toàn bằng SVG từ dữ liệu sẵn có: không có file ảnh con dấu nào.
 * - Con dấu mốc: vòng tròn đôi, biểu tượng NDC ở giữa, tên tiếng Nhật chạy theo vành trên, tỉnh + ngày ở vành dưới.
 * - Con dấu tỉnh: khung bát giác, hình dáng tỉnh lấy từ chính dữ liệu bản đồ, tên tỉnh và số mốc.
 * Con dấu thường in màu mực chàm, dấu son in đỏ son. Ở cỡ lớn có mép mực loang và chỗ mực nhạt như đóng tay thật.
 * Không xuất con dấu thành ảnh để tải về: biểu tượng NDC không được phân phối lại.
 */

/** Màu mực chàm của con dấu thường (khác màu chữ để không lẫn với nội dung) */
export const STAMP_INK = '#24407A';

export type PrefectureStampState = 'none' | 'stamp' | 'red';

const colorOf = (state: SpotStamp | PrefectureStampState) =>
  state === 'red' ? T.shu : state === 'stamp' ? STAMP_INK : T.ghost;

const inked = (state: SpotStamp | PrefectureStampState) => state === 'stamp' || state === 'red';

/** Độ nghiêng cố định theo id (mỗi con dấu nghiêng một kiểu, lần nào mở cũng như nhau) */
function tiltOf(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return ((x - Math.floor(x)) * 2 - 1) * 7;
}

/** "2026-10-27T..." -> "2026.10.27" (theo giờ máy người học) */
export function stampDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** Mép mực loang + chỗ mực nhạt (chỉ dùng ở cỡ lớn; cỡ nhỏ thì nhìn như bẩn) */
const InkFilter: React.FC<{ id: string; seed: number }> = ({ id, seed }) => (
  <filter id={id} x="-6%" y="-6%" width="112%" height="112%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={seed % 97} result="warp" />
    <feDisplacementMap in="SourceGraphic" in2="warp" scale={3.2} xChannelSelector="R" yChannelSelector="G" result="rough" />
    <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves={1} seed={(seed % 89) + 7} result="grain" />
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4.2 0 0 0 3.35" result="holes" />
    <feComposite in="rough" in2="holes" operator="in" />
  </filter>
);

/** Tô biểu tượng NDC (đen trên nền trong) thành màu của con dấu, giữ nguyên hình */
const TintFilter: React.FC<{ id: string; color: string }> = ({ id, color }) => (
  <filter id={id} x="0" y="0" width="100%" height="100%">
    <feFlood floodColor={color} />
    <feComposite in2="SourceAlpha" operator="in" />
  </filter>
);

/** Cỡ chữ để cả chuỗi vừa một cung dài arcLen */
const fitFont = (text: string, arcLen: number, max: number) => Math.min(max, arcLen / Math.max([...text].length, 1));

export interface SpotStampProps {
  iconId: string;
  nameJp: string;
  /** Dòng ở vành dưới, vd. tên tỉnh bằng kanji */
  sub?: string;
  /** Ngày đóng dấu (ISO); chỉ hiện khi đã có dấu */
  date?: string | null;
  state: SpotStamp;
  /** Cạnh (px) */
  size: number;
  /** Id mốc, để độ nghiêng và vết mực cố định */
  seed: number;
  /** Chạy hiệu ứng "đóng cộp" khi vừa có dấu */
  pressing?: boolean;
  className?: string;
}

/**
 * Con dấu của một mốc. Dưới 64px chỉ còn vành và biểu tượng (chữ quanh vành không đọc được),
 * dưới 96px bỏ vết mực.
 */
export const SpotStampMark: React.FC<SpotStampProps> = ({ iconId, nameJp, sub, date, state, size, seed, pressing, className }) => {
  const uid = useId().replace(/:/g, '');
  const color = colorOf(state);
  const on = inked(state);
  const withText = size >= 64;
  const rough = on && size >= 96;
  const dateText = on ? stampDate(date) : null;
  const bottom = [sub, dateText].filter(Boolean).join(' · ');
  const topFs = fitFont(nameJp, 170, 24);
  // Chữ Latin (ngày) hẹp hơn chữ Nhật: tính theo nửa ô cho phần số
  const bottomUnits = [...bottom].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.58), 0);
  const bottomFs = Math.min(17, 176 / Math.max(bottomUnits, 1));
  const iconSize = withText ? 74 : 104;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      className={`${pressing ? 'jm-stamp-press' : ''} ${className ?? ''}`}
      style={{ overflow: 'visible', transform: on ? `rotate(${tiltOf(seed).toFixed(1)}deg)` : undefined }}
    >
      <defs>
        <TintFilter id={`${uid}-tint`} color={color} />
        {rough && <InkFilter id={`${uid}-ink`} seed={seed} />}
        <path id={`${uid}-top`} d="M 38 100 A 62 62 0 0 1 162 100" />
        <path id={`${uid}-bottom`} d="M 30 100 A 70 70 0 0 0 170 100" />
      </defs>
      {!on && <circle cx={100} cy={100} r={96} fill={T.card} />}
      <g filter={rough ? `url(#${uid}-ink)` : undefined} style={on ? { mixBlendMode: 'multiply' } : undefined}>
        <circle
          cx={100}
          cy={100}
          r={92}
          fill="none"
          stroke={color}
          strokeWidth={on ? 8 : 5}
          strokeDasharray={on ? undefined : '14 10'}
        />
        {withText && <circle cx={100} cy={100} r={80} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={on ? 1 : 0.7} />}
        <image
          href={pictogramUrl(iconId)}
          x={100 - iconSize / 2}
          y={100 - iconSize / 2 + (withText ? 2 : 0)}
          width={iconSize}
          height={iconSize}
          filter={`url(#${uid}-tint)`}
          opacity={on ? 1 : state === 'understood' ? 0.75 : 0.55}
          preserveAspectRatio="xMidYMid meet"
        />
        {withText && (
          <text
            fill={color}
            fontSize={topFs}
            fontWeight={700}
            fontFamily="'Noto Sans JP', 'Inter', system-ui, sans-serif"
            letterSpacing={topFs * 0.08}
          >
            <textPath href={`#${uid}-top`} startOffset="50%" textAnchor="middle">
              {nameJp}
            </textPath>
          </text>
        )}
        {withText && bottom && (
          <text fill={color} fontSize={bottomFs} fontWeight={700} fontFamily="'Noto Sans JP', 'Inter', system-ui, sans-serif" dominantBaseline="hanging">
            <textPath href={`#${uid}-bottom`} startOffset="50%" textAnchor="middle">
              {bottom}
            </textPath>
          </text>
        )}
        {/* Dấu son: thêm ô dấu vuông nhỏ chữ 朱 ở góc */}
        {withText && state === 'red' && (
          <g transform="translate(148 142) rotate(-6)">
            <rect x={0} y={0} width={30} height={30} rx={3} fill={T.shu} />
            <text x={15} y={22} textAnchor="middle" fontSize={19} fontWeight={800} fill={T.paper} fontFamily="'Shippori Mincho B1', serif">
              朱
            </text>
          </g>
        )}
      </g>
    </svg>
  );
};

export interface PrefectureStampProps {
  /** Hình dáng tỉnh (path) và khung bao phần đất chính [x, y, w, h] trong toạ độ bản đồ */
  d: string;
  main: [number, number, number, number];
  nameJp: string;
  /** Dòng dưới, vd. "12/12 · 関東" */
  caption?: string;
  state: PrefectureStampState;
  size: number;
  seed: number;
  pressing?: boolean;
  className?: string;
}

/** Bát giác nội tiếp khung 200x200 (cạnh xiên cắt 56) */
const OCTAGON = 'M 60 6 H 140 L 194 60 V 140 L 140 194 H 60 L 6 140 V 60 Z';
const OCTAGON_INNER = 'M 64 18 H 136 L 182 64 V 136 L 136 182 H 64 L 18 136 V 64 Z';

/** Con dấu tỉnh: bát giác, hình dáng tỉnh ở giữa. Chưa có dấu: nét đứt màu giấy cũ */
export const PrefectureStampMark: React.FC<PrefectureStampProps> = ({ d, main, nameJp, caption, state, size, seed, pressing, className }) => {
  const uid = useId().replace(/:/g, '');
  const color = colorOf(state);
  const on = inked(state);
  const withText = size >= 64;
  const rough = on && size >= 96;
  const [x, y, w, h] = main;
  const side = Math.max(w, h);
  const viewBox = `${x + w / 2 - side / 2} ${y + h / 2 - side / 2} ${side} ${side}`;
  const shape = withText ? { x: 50, y: 54, s: 100 } : { x: 34, y: 34, s: 132 };
  const nameFs = fitFont(nameJp, 100, 30);

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      className={`${pressing ? 'jm-stamp-press' : ''} ${className ?? ''}`}
      style={{ overflow: 'visible', transform: on ? `rotate(${(tiltOf(seed + 101) * 0.6).toFixed(1)}deg)` : undefined }}
    >
      <defs>{rough && <InkFilter id={`${uid}-ink`} seed={seed + 101} />}</defs>
      {!on && <path d={OCTAGON} fill={T.card} />}
      <g filter={rough ? `url(#${uid}-ink)` : undefined} style={on ? { mixBlendMode: 'multiply' } : undefined}>
        <path d={OCTAGON} fill="none" stroke={color} strokeWidth={on ? 8 : 5} strokeLinejoin="round" strokeDasharray={on ? undefined : '14 10'} />
        {withText && <path d={OCTAGON_INNER} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={on ? 1 : 0.7} />}
        <svg x={shape.x} y={shape.y} width={shape.s} height={shape.s} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <path d={d} fillRule="evenodd" fill={on ? color : '#CFC5B1'} />
        </svg>
        {withText && (
          <text x={100} y={50} textAnchor="middle" fill={color} fontSize={nameFs} fontWeight={800} fontFamily="'Shippori Mincho B1', serif" letterSpacing={nameFs * 0.1}>
            {nameJp}
          </text>
        )}
        {withText && caption && (
          <text x={100} y={174} textAnchor="middle" fill={color} fontSize={Math.min(24, 150 / Math.max(caption.length * 0.6, 1))} fontWeight={800} fontFamily="'Noto Sans JP', 'Inter', system-ui, sans-serif">
            {caption}
          </text>
        )}
      </g>
    </svg>
  );
};

/** CSS của hiệu ứng "đóng cộp" (gắn một lần ở trang Khám phá) */
export const STAMP_CSS = `
  .jm-stamp-press { animation: jm-stamp-press 0.46s cubic-bezier(0.2, 0.9, 0.3, 1.25) both; transform-origin: center; }
  @keyframes jm-stamp-press {
    0% { opacity: 0; scale: 1.7; filter: blur(1px); }
    55% { opacity: 1; scale: 0.94; filter: none; }
    100% { opacity: 1; scale: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .jm-stamp-press { animation: jm-stamp-fade 0.3s ease-out both; }
    @keyframes jm-stamp-fade { from { opacity: 0; } to { opacity: 1; } }
  }
`;
