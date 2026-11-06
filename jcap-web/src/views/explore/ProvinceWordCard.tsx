import React, { useEffect, useId, useRef, useState } from 'react';
import type { ProvinceWord } from '../../data/learnContent';
import { IconButton } from '../../components/jcap';
import { cx } from '../../components/jcap/utils';
import { speakJa, useCanSpeakJa } from './speak';

/** Chiều cao 1 dòng mô tả (line-height 18px) */
const CLAMP_PX = 18;
/** Trễ trước khi mở khi di chuột vào, để lướt ngang qua thẻ không làm danh sách bên dưới nhảy */
const HOVER_DELAY_MS = 120;
/** Khớp thời lượng .jm-word-note: chờ thu xong mới hiện lại dấu "..." */
const TRANSITION_MS = 280;

/**
 * "Một từ ở tỉnh" trong bảng tỉnh. Mô tả dài rút gọn còn 1 dòng; di chuột vào thẻ hoặc bấm vào mô tả thì xổ ra đủ nội dung.
 * Bấm là ghim mở (dùng được trên điện thoại và bằng bàn phím), bấm lại để thu. Mô tả ngắn thì hiện nguyên, không có gì để bấm.
 */
export const ProvinceWordCard: React.FC<{ word: ProvinceWord; furigana: boolean }> = ({ word, furigana }) => {
  const [jp, kana, vi, note] = word;
  const canSpeak = useCanSpeakJa();
  const titleId = useId();
  const noteRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const [fullHeight, setFullHeight] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [settled, setSettled] = useState(true);

  const long = fullHeight > CLAMP_PX + 1;
  const open = long && (hovering || pinned);

  // Đo chiều cao đầy đủ của mô tả; đo lại khi bảng đổi kích thước làm chữ xuống dòng khác đi
  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    const measure = () => setFullHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [note, long]);

  useEffect(() => {
    if (open) {
      setSettled(false);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setSettled(true), reduce ? 0 : TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovering(true), HOVER_DELAY_MS);
  };
  const onPointerLeave = () => {
    window.clearTimeout(hoverTimer.current);
    setHovering(false);
  };

  const noteText = note && (
    <span
      ref={noteRef}
      className={cx('jm-word-note min-w-0 flex-1 text-xs leading-[18px] text-[var(--sumi-muted)]', long && !open && settled && 'line-clamp-1')}
      style={long ? { maxHeight: open ? fullHeight : CLAMP_PX } : undefined}
    >
      {note}
    </span>
  );

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="m-0 text-[15px] font-bold leading-[22px] text-[var(--sumi)]">
        Một từ ở tỉnh
      </h3>
      <div className="jm-word" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
        <span className={cx('min-w-0 font-jp text-2xl font-bold leading-[34px]', furigana && kana && 'mt-2')} lang="ja">
          {furigana && kana ? (
            <ruby>
              {jp}
              <rt className="text-[11px] font-medium text-[var(--sumi-muted)]">{kana}</rt>
            </ruby>
          ) : (
            jp
          )}
        </span>
        {canSpeak && (
          <span className="self-center">
            <IconButton icon="volume_up" label={`Nghe từ ${jp}`} size="sm" onClick={() => speakJa(kana || jp)} />
          </span>
        )}
        <span className="col-span-full text-[15px] font-medium leading-[22px]">{vi}</span>
        {long ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${pinned ? 'Thu gọn' : 'Xem đầy đủ'} mô tả: ${note}`}
            onClick={() => setPinned((p) => !p)}
            className="col-span-full flex rounded-jc-sm border-0 bg-transparent p-0 pt-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            {noteText}
          </button>
        ) : (
          noteText && <span className="col-span-full flex pt-1">{noteText}</span>
        )}
      </div>
    </section>
  );
};
