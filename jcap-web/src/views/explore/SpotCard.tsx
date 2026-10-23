import React, { useLayoutEffect, useRef, useState } from 'react';
import { phraseKana, type Phrase } from '../../data/learnContent';
import { ChatIcon, ListenButton, MicIcon, PictogramIcon } from './exploreUi';
import { FuriganaText } from './furigana';
import { T } from './exploreTheme';
import type { Box } from './labelLayout';
import { speakJa } from './speak';

export interface SpotCardProps {
  /** Vị trí ghim đang chọn trên màn hình */
  pin: { x: number; y: number };
  /** Vật cản (ghim, nhóm ghim) mà thẻ không được che, kể cả chính ghim này */
  obstacles: Box[];
  /** Vùng bản đồ còn trống (không tính panel/ngăn kéo) */
  bounds: Box;
  pictogramId: string;
  nameVi: string;
  nameJp: string;
  kana?: string;
  stop: { n: number; total: number } | null;
  status: 'next' | 'done' | null;
  phrase?: Phrase;
  furigana: boolean;
  /** Điện thoại: bỏ hai ô hoạt động, cấp độ và dòng "Câu bạn sẽ học" cho gọn */
  compact: boolean;
  canSpeak: boolean;
  ink: string;
}

const GAP = 34;
/** Lùi dần khỏi ghim khi chỗ sát ghim bị ghim khác chiếm (ví dụ nhóm ghim vừa xòe ra quanh địa điểm này) */
const GAP_STEPS = [GAP, 56, 84, 118, 160];
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/**
 * Chọn chỗ đặt thẻ: ưu tiên trên, dưới, phải, trái ghim; sát ghim trước rồi lùi dần, mỗi bên thử vài vị trí dịch dọc theo cạnh.
 * Lấy chỗ đầu tiên không che ghim nào và nằm trọn trong vùng trống; hết chỗ thì lấy chỗ che ít nhất (không bao giờ ném lỗi).
 */
export function placeCard(pin: { x: number; y: number }, w: number, h: number, bounds: Box, obstacles: Box[]): { x: number; y: number } {
  const shifts = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1, 1];
  let best: { x: number; y: number; cost: number } | null = null;
  for (const gap of GAP_STEPS) {
    for (const side of ['top', 'bottom', 'right', 'left'] as const) {
      for (const k of shifts) {
        let x: number;
        let y: number;
        if (side === 'top' || side === 'bottom') {
          x = clamp(pin.x - w / 2 + k * (w / 2), bounds.x0, bounds.x1 - w);
          y = side === 'top' ? pin.y - gap - h : pin.y + gap;
        } else {
          y = clamp(pin.y - h / 2 + k * (h / 2), bounds.y0, bounds.y1 - h);
          x = side === 'right' ? pin.x + gap : pin.x - gap - w;
        }
        const box: Box = { x0: x, y0: y, x1: x + w, y1: y + h };
        const out = Math.max(0, bounds.x0 - box.x0) + Math.max(0, bounds.y0 - box.y0) + Math.max(0, box.x1 - bounds.x1) + Math.max(0, box.y1 - bounds.y1);
        const cover = obstacles.reduce((sum, o) => sum + overlapArea(box, o), 0);
        if (out === 0 && cover === 0) return { x, y };
        // Hết chỗ: chọn chỗ che ít nhất (tràn ra ngoài vùng trống bị phạt nặng hơn)
        const cost = cover + out * 400;
        if (!best || cost < best.cost) best = { x, y, cost };
      }
    }
  }
  return best ? { x: best.x, y: best.y } : { x: bounds.x0, y: bounds.y0 };
}

/** Thẻ nổi của địa điểm đang chọn: vị trí trong lộ trình, câu sẽ học, hai hoạt động sắp có */
export const SpotCard: React.FC<SpotCardProps> = ({
  pin,
  obstacles,
  bounds,
  pictogramId,
  nameVi,
  nameJp,
  kana,
  stop,
  status,
  phrase,
  furigana,
  compact,
  canSpeak,
  ink,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: compact ? 260 : 300, h: compact ? 170 : 240 });
  const width = Math.min(compact ? 260 : 300, Math.max(bounds.x1 - bounds.x0 - 8, 160));

  // Đo thẻ thật (chiều cao đổi theo nội dung, furigana, cỡ màn) rồi mới đặt chỗ
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && (Math.abs(el.offsetWidth - dim.w) > 0.5 || Math.abs(el.offsetHeight - dim.h) > 0.5)) {
      setDim({ w: el.offsetWidth, h: el.offsetHeight });
    }
  });

  const at = placeCard(pin, dim.w, dim.h, bounds, obstacles);
  const done = status === 'done';
  const stampColor = done ? T.shu : ink;

  return (
    <div
      ref={ref}
      data-map-ui
      className="jm-spotcard"
      style={{ width, transform: `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)` }}
      role="dialog"
      aria-label={`${nameVi} (${nameJp})`}
    >
      {compact ? (
        // Điện thoại: con dấu bên trái, bên phải xếp "Điểm n/N" + chip, tên Việt, tên Nhật (thẻ thấp để còn chỗ tránh ghim)
        <div className="flex items-center gap-2.5">
          <Stamp pictogramId={pictogramId} color={stampColor} done={done} size={36} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {stop && <span className="text-xs font-semibold text-[var(--ink-2)]">Điểm {stop.n}/{stop.total}</span>}
              <StatusChip status={status} />
            </div>
            <div className="text-sm font-bold leading-snug" style={{ color: ink }}>{nameVi}</div>
            <JpName nameJp={nameJp} kana={kana} furigana={furigana} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {stop && <span className="text-xs font-semibold text-[var(--ink-2)]">Điểm {stop.n}/{stop.total}</span>}
            <StatusChip status={status} />
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <Stamp pictogramId={pictogramId} color={stampColor} done={done} size={44} />
            <div className="min-w-0">
              <div className="text-sm font-bold leading-snug text-balance" style={{ color: ink }}>{nameVi}</div>
              <JpName nameJp={nameJp} kana={kana} furigana={furigana} />
            </div>
          </div>
        </>
      )}

      {phrase ? (
        <div className={`${compact ? 'mt-2' : 'mt-3 border-t border-[var(--rule)] pt-2.5'}`}>
          {!compact && <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Câu bạn sẽ học</div>}
          <div className="flex items-start gap-2">
            <p className="jm-phrase font-jp min-w-0 flex-1" lang="ja">
              <FuriganaText segments={phrase.s} show={furigana} />
            </p>
            {canSpeak && <ListenButton label="Nghe cả câu" onClick={() => speakJa(phraseKana(phrase.s))} />}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-[var(--ink-2)]">{phrase.vi}</p>
          <div className="mt-2 flex items-center gap-2">
            {!compact && (
              <span className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-bold" style={{ background: T.inkLine, color: T.paper }}>
                {phrase.lv}
              </span>
            )}
            <span className="text-xs text-[var(--muted)]">Khoảng {phrase.min} phút</span>
          </div>
        </div>
      ) : (
        <p className={`${compact ? 'mt-2' : 'mt-3 border-t border-[var(--rule)] pt-2.5'} text-xs text-[var(--muted)]`}>Nội dung bài học đang được chuẩn bị.</p>
      )}

      {!compact && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Soon icon={<ChatIcon className="h-4 w-4" />} label="Hội thoại AI" />
          <Soon icon={<MicIcon className="h-4 w-4" />} label="Shadowing" />
        </div>
      )}
    </div>
  );
};

const Soon: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col gap-0.5 rounded-[6px] border-[1.5px] border-dashed border-[var(--ghost)] px-2.5 py-1.5">
    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink)]">
      {icon}
      {label}
    </div>
    <span className="text-[11px] text-[var(--muted)]">Sắp có</span>
  </div>
);

const Stamp: React.FC<{ pictogramId: string; color: string; done: boolean; size: number }> = ({ pictogramId, color, done, size }) => (
  <span
    className="flex shrink-0 items-center justify-center rounded-full border-2"
    style={{ width: size, height: size, borderColor: color, borderStyle: done ? 'solid' : 'dashed', background: T.card }}
    aria-hidden="true"
  >
    <PictogramIcon id={pictogramId} color={color} className={size > 40 ? 'h-6 w-6' : 'h-5 w-5'} />
  </span>
);

const StatusChip: React.FC<{ status: 'next' | 'done' | null }> = ({ status }) =>
  status === 'next' ? (
    <span className="jm-chip-next">Tiếp theo</span>
  ) : status === 'done' ? (
    <span className="jm-chip-done" style={{ color: T.shu, borderColor: T.shu }}>
      Đã có dấu
    </span>
  ) : null;

const JpName: React.FC<{ nameJp: string; kana?: string; furigana: boolean }> = ({ nameJp, kana, furigana }) => (
  <div className="font-jp text-[13px] leading-snug text-[var(--ink-2)]">
    {furigana && kana ? (
      <ruby>
        {nameJp}
        <rt>{kana}</rt>
      </ruby>
    ) : (
      nameJp
    )}
  </div>
);
