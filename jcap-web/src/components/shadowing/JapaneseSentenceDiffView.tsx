import React from 'react';
import type { ShadowingDiffToken } from '../../types/shadowing';

interface JapaneseSentenceDiffViewProps {
  diffTokens?: ShadowingDiffToken[];
  targetText: string;
  spokenText?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Mô tả ngắn gọn loại lỗi cho chú thích khi rê chuột. */
const describeError = (type: ShadowingDiffToken['errorType']): string => {
  switch (type) {
    case 'chouon': return 'Trường âm (kéo dài âm)';
    case 'sokuon': return 'Âm ngắt っ';
    case 'hatsuon': return 'Âm ん';
    case 'voicing': return 'Âm đục / âm trong';
    case 'extra': return 'Thừa âm';
    case 'mora': return 'Sai hoặc thiếu âm';
    default: return '';
  }
};

export const JapaneseSentenceDiffView: React.FC<JapaneseSentenceDiffViewProps> = ({
  diffTokens,
  targetText,
  spokenText,
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
                const kind = describeError(token.errorType);
                const expected = token.expectedReading && token.expectedReading !== token.text
                  ? `"${token.text}" (${token.expectedReading})`
                  : `"${token.text}"`;
                const tooltipText = token.errorType === 'extra'
                  ? `${kind}: "${token.text}"`
                  : token.spokenPart
                  ? `${kind ? kind + ' — ' : ''}Câu mẫu: ${expected} ➔ Bạn nói: "${token.spokenPart}"`
                  : `${kind || 'Khác biệt'}: ${expected}`;

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
                    title={`${describeError(token.errorType) || 'Thiếu âm'}: bạn chưa phát âm "${token.text}"${token.expectedReading && token.expectedReading !== token.text ? ` (${token.expectedReading})` : ''}`}
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

