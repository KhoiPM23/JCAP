import React, { useState } from 'react';
import { Icon } from './Icon';
import { JpText } from './JpText';
import { AudioPlayer } from './Speaking';
import { cx, verdict, VERDICT } from './utils';

export interface ChatBubbleProps {
  from: 'ai' | 'me';
  name?: string;
  /** Cú pháp {漢字|かんじ} cho furigana */
  jp: string;
  vi?: string;
  romaji?: string;
  avatar?: React.ReactNode;
  showFurigana?: boolean;
  /** Có giá trị: điều khiển từ ngoài (ẩn nút "Dịch"); không có: tự bật/tắt bằng nút "Dịch" */
  showTranslation?: boolean;
  /** null = ẩn nút nghe */
  onPlay?: ((playing: boolean) => void) | null;
  /** Chỉ bóng của học viên: bấm để xem đánh giá câu */
  onSelect?: () => void;
  selected?: boolean;
  score?: number;
  status?: 'sending' | 'error';
  onRetry?: () => void;
  className?: string;
}

/**
 * Bóng thoại. Chỉ bóng của học viên có onSelect mới là nút (và mới đổi nền khi hover, xem jcap.css):
 * bản gốc đổi nền mọi bóng khi hover làm bóng của AI mất chữ.
 */
export const ChatBubble: React.FC<ChatBubbleProps> = ({
  from,
  name,
  jp,
  vi,
  romaji,
  avatar,
  showFurigana,
  showTranslation,
  onPlay,
  onSelect,
  selected,
  score,
  status,
  onRetry,
  className,
}) => {
  const me = from === 'me';
  const [trOwn, setTrOwn] = useState(false);
  const showTr = showTranslation ?? trOwn;
  const selectable = me && !!onSelect;
  const content = (
    <>
      <JpText text={jp} furigana={showFurigana !== false} size="md" as="p" />
      {showTr && vi && <p className="jc-bubble__vi">{vi}</p>}
      {romaji && <p className="jc-bubble__romaji">{romaji}</p>}
    </>
  );
  return (
    <div className={cx('jc-bubble', me ? 'jc-bubble--me' : 'jc-bubble--ai', status && `is-${status}`, className)}>
      {!me && (
        <span className="jc-bubble__avatar" aria-hidden="true">
          {avatar || <Icon name="face" size={22} />}
        </span>
      )}
      <div className="jc-bubble__col">
        {name && <span className="jc-bubble__name">{name}</span>}
        {selectable ? (
          <button type="button" onClick={onSelect} className={cx('jc-bubble__box', selected && 'is-selected')} aria-pressed={!!selected} aria-label="Xem đánh giá câu này">
            {content}
          </button>
        ) : (
          <div className={cx('jc-bubble__box', selected && 'is-selected')}>{content}</div>
        )}
        <div className="jc-bubble__tools">
          {onPlay !== null && <AudioPlayer variant="chip" label={me ? 'Nghe lại' : 'Nghe'} onToggle={onPlay} />}
          {vi && showTranslation === undefined && (
            <button type="button" className="jc-audiochip" onClick={() => setTrOwn(!trOwn)} aria-pressed={trOwn}>
              <Icon name="translate" size={18} />
              {trOwn ? 'Ẩn dịch' : 'Dịch'}
            </button>
          )}
          {me && score !== undefined && (
            <span className={cx('jc-bubble__score', `jc-v-${verdict(score)}`)}>
              <Icon name={VERDICT[verdict(score)][1]} size={16} fill />
              {`${score} điểm`}
            </span>
          )}
          {status === 'sending' && (
            <span className="jc-bubble__status">
              <Icon name="progress_activity" size={16} spin />
              Đang gửi…
            </span>
          )}
          {status === 'error' && (
            <button type="button" className="jc-bubble__status is-error" onClick={onRetry}>
              <Icon name="refresh" size={16} />
              Gửi thất bại · Thử lại
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
