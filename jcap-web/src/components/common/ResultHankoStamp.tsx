import React from 'react';

export interface ResultHankoStampProps {
  passed: boolean;
  /** 'sm' for history list rows, 'lg' for detail hero banner */
  size?: 'sm' | 'lg';
  /** Adds a crisp ivory Washi seal-disk backing so ink contrast stays high over dark surfaces */
  onDarkSurface?: boolean;
  /** Enables stamp-slam entrance animation */
  animated?: boolean;
  className?: string;
}

/**
 * Unified Hanko completion seal shared between the conversation history list
 * and the result detail hero banner.
 */
export const ResultHankoStamp: React.FC<ResultHankoStampProps> = ({
  passed,
  size = 'sm',
  onDarkSurface = false,
  animated = false,
  className = '',
}) => {
  const outerSizeClass =
    size === 'lg'
      ? 'w-20 h-20 sm:w-24 sm:h-24'
      : 'w-12 h-12 sm:w-14 sm:h-14';

  const titleText = passed
    ? 'Dấu triện hội thoại: Đạt chuẩn (合格)'
    : 'Dấu triện tu luyện: Cần rèn thêm (未達)';

  const outerBorderClass = passed
    ? 'border-[#c23a2b] text-[#c23a2b] rotate-[-4deg]'
    : 'border-stone-600 text-stone-700 rotate-[3deg]';

  const innerBorderClass = passed
    ? 'border-[#c23a2b]/80 bg-[#c23a2b]/[0.03]'
    : 'border-stone-400/90 bg-stone-500/[0.03]';

  const kanjiColorClass = passed ? 'text-[#c23a2b]' : 'text-stone-800';
  const subColorClass = passed ? 'text-[#c23a2b]' : 'text-stone-600';

  const kanjiSizeClass =
    size === 'lg'
      ? 'text-sm sm:text-lg tracking-[0.14em]'
      : 'text-[10px] sm:text-[11px] tracking-widest';

  const subSizeClass =
    size === 'lg'
      ? 'text-[8px] sm:text-[10px] tracking-wider'
      : 'text-[7px] sm:text-[8px] tracking-tight';

  const inkStamp = (
    <div
      className={`rounded-full border-2 p-0.5 flex items-center justify-center leading-none select-none ${
        onDarkSurface ? 'w-full h-full' : `${outerSizeClass} transition-transform group-hover:scale-105`
      } ${outerBorderClass}`}
      style={{
        filter: 'url(#jc-inkfx)',
        mixBlendMode: 'multiply',
        opacity: passed ? 0.94 : 0.9,
      }}
      title={titleText}
    >
      <div
        className={`w-full h-full rounded-full border flex flex-col items-center justify-center leading-none ${innerBorderClass}`}
      >
        <span className={`font-serif font-black leading-none ${kanjiSizeClass} ${kanjiColorClass}`}>
          {passed ? '合格' : '未達'}
        </span>
        <span className={`font-sans font-black uppercase mt-0.5 leading-none ${subSizeClass} ${subColorClass}`}>
          {passed ? 'ĐẠT' : 'CẦN RÈN'}
        </span>
      </div>
    </div>
  );

  if (!onDarkSurface) {
    return (
      <div className={`shrink-0 select-none flex items-center justify-center ${animated ? 'animate-stamp-slam' : ''} ${className}`}>
        {inkStamp}
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 select-none ${outerSizeClass} rounded-full bg-[#FFFDF7] p-1.5 border border-stone-200/90 ring-4 ring-white/20 shadow-[0_12px_28px_rgba(2,6,23,0.45)] flex items-center justify-center ${
        animated ? 'animate-stamp-slam' : ''
      } ${className}`}
      title={titleText}
    >
      {inkStamp}
    </div>
  );
};

