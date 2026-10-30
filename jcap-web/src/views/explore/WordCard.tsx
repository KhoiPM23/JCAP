import React from 'react';
import type { ProvinceWord } from '../../data/learnContent';
import { ListenButton } from './exploreUi';
import { useCanSpeakJa, speakJa } from './speak';

/**
 * "Một từ ở [tỉnh]": một từ gắn với tỉnh, kèm cách đọc, nghĩa và ghi chú.
 * Desktop: thẻ 220px ở góc trên trái bản đồ (cấp tỉnh). Điện thoại: một mục trong panel.
 */
export const WordCard: React.FC<{
  provinceNameVi: string;
  word: ProvinceWord;
  furigana: boolean;
  ink: string;
  /** "floating" = thẻ nổi trên bản đồ; "inline" = mục trong panel */
  variant: 'floating' | 'inline';
}> = ({ provinceNameVi, word, furigana, ink, variant }) => {
  const [jp, kana, vi, note] = word;
  const canSpeak = useCanSpeakJa();
  return (
    <section
      data-map-ui
      aria-label={`Một từ ở ${provinceNameVi}`}
      className={variant === 'floating' ? 'jm-wordcard' : 'jm-wordcard jm-wordcard-inline'}
    >
      <div className="text-xs font-semibold text-[var(--ink-2)]">Một từ ở {provinceNameVi}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="jm-word-jp min-w-0 flex-1" style={{ color: ink }} lang="ja">
          {furigana ? (
            <ruby>
              {jp}
              <rt>{kana}</rt>
            </ruby>
          ) : (
            jp
          )}
        </div>
        {canSpeak && <ListenButton label={`Nghe: ${kana}`} onClick={() => speakJa(kana)} />}
      </div>
      <div className="mt-1 text-sm font-semibold text-[var(--ink)]">{vi}</div>
      {note && <p className="mt-1 text-[12.5px] leading-snug text-[var(--ink-2)]">{note}</p>}
    </section>
  );
};
