import type { RegionId } from '../../data/japanMap';

/**
 * Token giao diện trang Khám phá - phong cách tranh khắc gỗ ukiyo-e: biển xanh Phổ có bọt sóng ở bờ,
 * đất tô màu bột phẳng viền mực, giấy ngà cho panel/thẻ. Nút chính và viền focus giữ xanh JCAP.
 * Bản mẫu thiết kế: explore-ukiyoe (source/app.css, khối "Ukiyo-e theme").
 */
export const T = {
  sea: '#26497B',
  sea2: '#3B6898',
  sea3: '#8EB0CD',
  foam: '#F6F1E6',
  sky: '#E6D2B5',
  paper: '#F6EFE2',
  paper2: '#ECE2CF',
  card: '#FBF7EE',
  rule: '#D9CCB3',
  inkLine: '#1E2C48',
  ghost: '#B3A68E',
  shu: '#BF2E28',
  shuSoft: '#F2D8CF',
  ink: '#071A44',
  ink2: '#3E4E69',
  muted: '#5B6B85',
  mapLabel: '#22324D',
  /** Màu pha để làm nhạt các tỉnh không được chọn (thành màu giấy) */
  dimMix: '#E7DCC6',
  shadow: '#081A38',
} as const;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Trộn hai màu hex theo tỉ lệ t (0 = a, 1 = b) */
export const mix = (a: string, b: string, t: number) =>
  '#' +
  hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0'))
    .join('');

/**
 * Màu bột theo vùng. fill = nền đất, hover = khi trỏ chuột, ink = chữ/viền/ghim (đậm),
 * tint = nhạt hơn (đầu panel), dim = tỉnh không được chọn khi đang xem một tỉnh.
 * Độ tương phản ink trên giấy 6.4–8.5:1, ink trên nền vùng 4.7–5.8:1.
 */
const WOODBLOCK: Record<RegionId, [string, string, string]> = {
  hokkaido: ['#BCCAD6', '#9DB2C6', '#294669'],
  tohoku: ['#C5C9A2', '#ABB27F', '#45521C'],
  kanto: ['#E5C3B3', '#D9A693', '#843526'],
  chubu: ['#E4CC97', '#D6B46E', '#6E5112'],
  kansai: ['#CDBDCB', '#B7A0B5', '#563B5D'],
  chugoku: ['#BFCAC3', '#A0B1A8', '#2F4D43'],
  shikoku: ['#E9D5B4', '#DBBD8F', '#714A1C'],
  kyushu: ['#D4B597', '#C29A76', '#623C20'],
};

export const REGION_STYLE: Record<RegionId, { fill: string; hover: string; ink: string; tint: string; dim: string }> =
  Object.fromEntries(
    Object.entries(WOODBLOCK).map(([id, [fill, hover, ink]]) => {
      const tint = mix(fill, T.paper, 0.4);
      return [id, { fill, hover, ink, tint, dim: mix(tint, T.dimMix, 0.55) }];
    }),
  ) as Record<RegionId, { fill: string; hover: string; ink: string; tint: string; dim: string }>;

/** Biến CSS cho cả trang (dùng trong class Tailwind dạng bg-[var(--paper)]) */
export const THEME_CSS_VARS = `
  --sea:${T.sea}; --sea-2:${T.sea2}; --sea-3:${T.sea3}; --foam:${T.foam}; --sky:${T.sky};
  --paper:${T.paper}; --paper-2:${T.paper2}; --card:${T.card}; --rule:${T.rule}; --ink-line:${T.inkLine};
  --ghost:${T.ghost}; --shu:${T.shu}; --shu-soft:${T.shuSoft};
  --ink:${T.ink}; --ink-2:${T.ink2}; --muted:${T.muted}; --map-label:${T.mapLabel};
  /* Nút chính và viền focus theo token của direction kham-pha (data-theme ở gốc trang) */
  --primary:var(--ai); --primary-ink:var(--ai-hover); --primary-soft:var(--ai-soft);
  --r-sm:6px; --r-md:8px; --r-lg:10px;
  --sh-1:0 1px 2px rgba(11,22,46,.18);
  --sh-2:0 1px 2px rgba(11,22,46,.16),0 8px 22px rgba(11,22,46,.22);
  --sh-3:0 2px 4px rgba(11,22,46,.16),0 20px 48px rgba(11,22,46,.30);
  --font-mincho:"Shippori Mincho B1","Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif;
`;

/** Hoa văn sóng seigaiha cho mặt biển (ô 56×28px) */
export const SEIGAIHA = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='28' viewBox='0 0 56 28'%3E%3Cg fill='none' stroke='%23335C8F' stroke-width='1.1'%3E%3Cpath d='M0 28a14 14 0 0 1 28 0M28 28a14 14 0 0 1 28 0M-14 14a14 14 0 0 1 28 0M14 14a14 14 0 0 1 28 0M42 14a14 14 0 0 1 28 0'/%3E%3Cpath d='M5 28a9 9 0 0 1 18 0M33 28a9 9 0 0 1 18 0M-9 14a9 9 0 0 1 18 0M19 14a9 9 0 0 1 18 0M47 14a9 9 0 0 1 18 0'/%3E%3Cpath d='M10 28a4 4 0 0 1 8 0M38 28a4 4 0 0 1 8 0M-4 14a4 4 0 0 1 8 0M24 14a4 4 0 0 1 8 0M52 14a4 4 0 0 1 8 0' opacity='.7'/%3E%3C/g%3E%3C/svg%3E")`;

/**
 * Hạt giấy: ảnh nhiễu 180×180 tạo một lần bằng canvas (chỉ để trang trí, lỗi thì bỏ qua).
 * Phủ bình thường, không dùng mix-blend-mode: nhân với màu sáng s (độ phủ a) bằng đúng phủ màu đen độ phủ a·(1-s),
 * nên tính sẵn độ phủ đó vào ảnh. Nhìn như hạt giấy "multiply" cũ (độ mờ 0.6) nhưng GPU không phải trộn lớp này
 * với toàn bộ bản đồ bên dưới ở mỗi khung hình khi kéo.
 */
let grainUrl: string | null | undefined;
export function paperGrainUrl(): string | null {
  if (grainUrl !== undefined) return grainUrl;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d')!;
    const im = g.createImageData(180, 180);
    const cover = 0.6 * 26; // độ mờ lớp cũ × độ phủ của mỗi hạt (thang 0..255)
    for (let i = 0; i < im.data.length; i += 4) {
      const v = 196 + Math.random() * 55;
      const alpha = Math.random() < 0.5 ? cover * (1 - v / 255) : 0;
      im.data[i] = 24;
      im.data[i + 1] = 16;
      im.data[i + 2] = 8;
      // Làm tròn ngẫu nhiên để giữ đúng độ phủ trung bình (giá trị chỉ vài đơn vị)
      im.data[i + 3] = Math.floor(alpha + Math.random());
    }
    g.putImageData(im, 0, 0);
    grainUrl = c.toDataURL();
  } catch {
    grainUrl = null;
  }
  return grainUrl;
}
