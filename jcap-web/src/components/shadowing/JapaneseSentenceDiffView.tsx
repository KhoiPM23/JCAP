import React from 'react';
import type { JapaneseDiffToken } from '../../utils/japaneseDiffUtils';

interface JapaneseSentenceDiffViewProps {
  diffTokens?: JapaneseDiffToken[];
  targetText: string;
  spokenText?: string;
  showLegend?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const JapaneseSentenceDiffView: React.FC<JapaneseSentenceDiffViewProps> = ({
  diffTokens,
  targetText,
  spokenText,
  showLegend = true,
  size = 'md',
  className = '',
}) => {
  const hasSpoken = spokenText && spokenText.trim().length > 0;
  // Nếu chưa có giọng nói thực tế hoặc diff rỗng thì hiển thị câu mẫu chuẩn không tô màu lỗi
  const hasDiffs = hasSpoken && diffTokens && diffTokens.length > 0;

  const textSizeClass =
    size === 'lg'
      ? 'text-lg sm:text-xl'
      : size === 'sm'
      ? 'text-xs sm:text-sm'
      : 'text-sm sm:text-base';

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Diff Highlighting Display */}
      <div className={`font-jp font-bold leading-relaxed ${textSizeClass} text-[#071A44]`}>
        {hasDiffs ? (
          <span className="inline-flex flex-wrap items-center gap-x-0.5 gap-y-1">
            {diffTokens.map((token, idx) => {
              if (token.status === 'correct') {
                return (
                  <span key={idx} className="text-[#071A44] transition-colors">
                    {token.text}
                  </span>
                );
              }

              if (token.status === 'mismatched') {
                const tooltipText = token.spokenPart
                  ? `Nhận dạng: "${token.spokenPart}" ➔ Câu mẫu: "${token.text}"`
                  : `Khác biệt / Nhầm trợ từ: "${token.text}"`;

                return (
                  <span
                    key={idx}
                    title={tooltipText}
                    className="inline-block bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded-md underline decoration-rose-400 decoration-wavy cursor-help hover:bg-rose-100 transition-colors shadow-2xs"
                  >
                    {token.text}
                  </span>
                );
              }

              if (token.status === 'missing') {
                return (
                  <span
                    key={idx}
                    title={`Chưa phát hiện thấy từ này trong giọng nói: "${token.text}"`}
                    className="inline-block text-amber-800 bg-amber-50/80 font-medium px-1.5 py-0.5 rounded-md border-b-2 border-dashed border-amber-400 cursor-help hover:bg-amber-100 transition-colors"
                  >
                    {token.text}
                  </span>
                );
              }

              return <span key={idx}>{token.text}</span>;
            })}
          </span>
        ) : (
          <span className="text-[#071A44]">{targetText}</span>
        )}
      </div>

      {/* Spoken Text Comparison if different */}
      {hasSpoken && spokenText.trim() !== targetText.trim() && (
        <div className="text-xs text-[#556987] flex items-center gap-1.5 flex-wrap pt-1">
          <span className="font-semibold text-slate-500">Bạn đã nói:</span>
          <span className="font-jp text-[#071A44] bg-white px-2 py-0.5 rounded border border-slate-200 font-medium text-xs">
            {spokenText}
          </span>
        </div>
      )}


    </div>
  );
};

