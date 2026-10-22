import { useEffect, useState } from 'react';

/**
 * Đo bề rộng chữ bằng canvas để xếp nhãn chống chồng nhau trước khi vẽ (không phải đo DOM từng nhãn mỗi khung hình).
 * Kết quả được nhớ theo (chữ, phông); khi phông web tải xong thì bộ nhớ đệm bị xoá và `useFontVersion` báo để xếp lại.
 */
let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();
let fontVersion = 0;
const listeners = new Set<() => void>();

if (typeof document !== 'undefined' && document.fonts) {
  // Phông tải xong -> số đo cũ (đo bằng phông dự phòng) không còn đúng
  document.fonts.addEventListener('loadingdone', () => {
    cache.clear();
    fontVersion++;
    listeners.forEach((l) => l());
  });
}

/** Tăng mỗi khi có phông mới tải xong: đưa vào deps của phép xếp nhãn để xếp lại */
export function useFontVersion(): number {
  const [v, setV] = useState(fontVersion);
  useEffect(() => {
    const l = () => setV(fontVersion);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

export const JP_FONT = "'Noto Sans JP', 'Inter', system-ui, sans-serif";
export const LATIN_FONT = "Inter, 'Noto Sans', 'Plus Jakarta Sans', sans-serif";

/** Bề rộng (px) của `text` với phông CSS rút gọn, vd. textWidth('奈良', `700 13px ${JP_FONT}`) */
export function textWidth(text: string, font: string): number {
  const key = `${font}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d');
  let w: number;
  if (ctx) {
    ctx.font = font;
    w = ctx.measureText(text).width;
  } else {
    // Không có canvas: ước lượng thô (chữ Nhật ~ 1em, chữ Latin ~ 0.56em)
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12);
    w = [...text].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? px : px * 0.56), 0);
  }
  cache.set(key, w);
  return w;
}

/** Kích thước một nhãn: [furigana 9px] / tên Nhật 13px / tên Việt 11.5px, nhân `scale` */
export interface LabelStyleSpec {
  jpPx: number;
  kanaPx: number;
  viPx: number;
  /** Tối đa bề rộng nội dung (px) trước khi cắt bằng dấu ... */
  maxW: number;
}

export const LABEL_SPEC: LabelStyleSpec = { jpPx: 13, kanaPx: 9, viPx: 11.5, maxW: 168 };
const PAD_X = 4;
const PAD_Y = 2;

export interface LabelContent {
  jp: string;
  /** Cách đọc (hiện khi bật furigana) */
  kana?: string;
  vi?: string;
}

/** Chiều cao các dòng (px, ở scale 1): đặt cố định trong CSS để khớp với số đo */
export const LINE_H = { kana: 11, jp: 16, vi: 14 };

export function labelSize(c: LabelContent, furigana: boolean, scale = 1, spec = LABEL_SPEC): { w: number; h: number } {
  // Đo ở cỡ gốc (bộ nhớ đệm trúng) rồi nhân theo tỉ lệ: bề rộng chữ tỉ lệ thuận với cỡ chữ. Nhãn thành phố đổi cỡ liên tục
  // khi zoom, đo lại ở mỗi cỡ mới là vài chục lần canvas.measureText mỗi khung hình.
  const jpW = textWidth(c.jp, `700 ${spec.jpPx}px ${JP_FONT}`) * scale;
  const kanaW = furigana && c.kana ? textWidth(c.kana, `500 ${spec.kanaPx}px ${JP_FONT}`) * scale : 0;
  const viW = c.vi ? textWidth(c.vi, `700 ${spec.viPx}px ${LATIN_FONT}`) * scale : 0;
  const w = Math.min(Math.max(jpW, kanaW, viW), spec.maxW * scale) + PAD_X * 2;
  const h = ((furigana && c.kana ? LINE_H.kana : 0) + LINE_H.jp + (c.vi ? LINE_H.vi : 0)) * scale + PAD_Y * 2;
  return { w, h };
}

export const LABEL_PAD = { x: PAD_X, y: PAD_Y };
