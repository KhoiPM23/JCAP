import React from 'react';
import { Icon } from './Icon';
import { JpText } from './JpText';
import { AudioPlayer } from './Speaking';
import { cx } from './utils';

type FeedbackTone = 'success' | 'warning' | 'error' | 'tip';

const FB: Record<FeedbackTone, [icon: string, srLabel: string]> = {
  success: ['check_circle', 'Làm tốt'],
  warning: ['change_history', 'Nên chỉnh'],
  error: ['cancel', 'Cần sửa'],
  tip: ['lightbulb', 'Mẹo'],
};

export interface FeedbackItemProps {
  tone?: FeedbackTone;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Câu gợi ý tự nhiên hơn (cú pháp {漢字|かんじ}) */
  suggestion?: { jp: string; vi?: string };
  onPlay?: () => void;
  onCopy?: () => void;
  className?: string;
}

export const FeedbackItem: React.FC<FeedbackItemProps> = ({ tone = 'tip', title, children, suggestion, onPlay, onCopy, className }) => {
  const [icon, sr] = FB[tone];
  return (
    <div className={cx('jc-fb', `jc-fb--${tone}`, className)}>
      <Icon name={icon} size={20} fill className="jc-fb__icon" />
      <div className="jc-fb__body">
        <p className="jc-fb__title">
          <span className="jc-sr">{`${sr}: `}</span>
          {title}
        </p>
        {children && <div className="jc-fb__text">{children}</div>}
        {suggestion && (
          <div className="jc-fb__sugg">
            <JpText text={suggestion.jp} size="sm" as="p" />
            {suggestion.vi && <p className="jc-fb__vi">{suggestion.vi}</p>}
            <div className="jc-fb__tools">
              <AudioPlayer variant="chip" label="Nghe mẫu" onToggle={onPlay ? () => onPlay() : undefined} />
              <button type="button" className="jc-audiochip" onClick={onCopy}>
                <Icon name="content_copy" size={18} />
                Chép
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
