import React, { useEffect, useId, useRef, useState } from 'react';
import type { ProvinceWord } from '../../data/learnContent';
import { Icon, IconButton } from '../../components/jcap';
import { speakJa, useCanSpeakJa } from './speak';

/** "Từ của tỉnh": nút tròn cạnh con dấu tỉnh; rê chuột, focus hoặc chạm thì hiện khung nổi bên dưới */
export const ProvinceWordButton: React.FC<{ word: ProvinceWord; prefName: string }> = ({ word, prefName }) => {
  const [jp, kana, vi, note] = word;
  const canSpeak = useCanSpeakJa();
  const popId = useId();
  const ref = useRef<HTMLDivElement>(null);
  /** Đã chạm/bấm để ghim khung mở (màn cảm ứng không rê chuột được) */
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setPinned(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc đóng khung này, không lùi bản đồ
      e.preventDefault();
      setPinned(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [pinned]);

  return (
    <div ref={ref} className={`jm-qw${pinned ? ' on' : ''}`}>
      <button
        type="button"
        className="jm-qw-btn"
        aria-label={`Từ của tỉnh ${prefName}`}
        aria-describedby={popId}
        aria-expanded={pinned}
        onClick={() => setPinned((p) => !p)}
      >
        <Icon name="menu_book" size={17} />
      </button>
      <div className="jm-qw-pop" id={popId} role="tooltip">
        <div className="jm-qw-in">
          <div className="jm-qw-head">
            <span>Từ của tỉnh</span>
            {canSpeak && <IconButton icon="volume_up" label={`Nghe ${jp}`} size="sm" onClick={() => speakJa(kana || jp)} />}
          </div>
          <p className="jm-qw-word">
            <span lang="ja">
              {kana ? (
                <ruby>
                  {jp}
                  <rt>{kana}</rt>
                </ruby>
              ) : (
                jp
              )}
            </span>
            <b>{vi}</b>
          </p>
          {note && <p className="jm-qw-note">{note}</p>}
        </div>
      </div>
    </div>
  );
};
