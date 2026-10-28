import React from 'react';
import { Icon } from './Icon';
import { cx, useControlled } from './utils';

export type MicState = 'idle' | 'permission' | 'recording' | 'analyzing' | 'denied' | 'unsupported' | 'disabled';

const MIC: Record<MicState, [icon: string, label: string]> = {
  idle: ['mic', 'Bấm để nói'],
  permission: ['mic', 'Đang xin quyền micro…'],
  recording: ['graphic_eq', 'Đang nghe… bấm để dừng'],
  analyzing: ['progress_activity', 'Đang phân tích…'],
  denied: ['mic_off', 'Chưa có quyền micro'],
  unsupported: ['mic_off', 'Trình duyệt không hỗ trợ'],
  disabled: ['mic', 'Micro tạm khoá'],
};

export interface MicButtonProps {
  state?: MicState;
  /** Mức âm 0–1 (vòng sóng khi đang thu) */
  level?: number;
  onClick?: () => void;
  label?: string;
  hint?: string;
  size?: 'md' | 'lg';
  hideLabel?: boolean;
  className?: string;
}

export const MicButton: React.FC<MicButtonProps> = ({ state = 'idle', level = 0, onClick, label, hint, size = 'lg', hideLabel, className }) => {
  const m = MIC[state] ?? MIC.idle;
  const lvl = Math.max(0, Math.min(1, level));
  const blocked = state === 'denied' || state === 'unsupported' || state === 'disabled' || state === 'analyzing' || state === 'permission';
  return (
    <div className={cx('jc-mic', `is-${state}`, `jc-mic--${size}`, className)}>
      <div className="jc-mic__wrap" style={{ '--lvl': lvl } as React.CSSProperties}>
        {state === 'recording' && <span className="jc-mic__wave" aria-hidden="true" />}
        {/* Bị từ chối quyền vẫn bấm được (để xin lại quyền) */}
        <button
          type="button"
          className="jc-mic__btn"
          onClick={onClick}
          disabled={blocked && state !== 'denied'}
          aria-pressed={state === 'recording'}
          aria-label={label || m[1]}
        >
          <Icon name={m[0]} size={size === 'md' ? 26 : 32} fill={state === 'recording' || state === 'idle'} spin={state === 'analyzing'} />
        </button>
      </div>
      {!hideLabel && (
        <span className="jc-mic__label" aria-live="polite">
          {label || m[1]}
        </span>
      )}
      {hint && <span className="jc-mic__hint">{hint}</span>}
    </div>
  );
};

const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export interface AudioPlayerProps {
  variant?: 'bar' | 'chip';
  label?: string;
  /** Giây */
  duration?: number;
  /** 0–1 */
  progress?: number;
  playing?: boolean;
  onToggle?: (playing: boolean) => void;
  speeds?: boolean;
  speed?: number;
  onSpeed?: () => void;
  className?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ variant = 'bar', label, duration = 0, progress = 0, playing, onToggle, speeds, speed = 1, onSpeed, className }) => {
  const [on, setOn] = useControlled(playing, false, onToggle);
  if (variant === 'chip') {
    return (
      <button type="button" className={cx('jc-audiochip', on && 'is-playing', className)} onClick={() => setOn(!on)} aria-label={`${on ? 'Dừng' : 'Nghe'} ${label ?? ''}`.trim()}>
        <Icon name={on ? 'stop_circle' : 'volume_up'} size={18} fill={on} />
        {label}
      </button>
    );
  }
  return (
    <div className={cx('jc-audio', on && 'is-playing', className)}>
      <button type="button" className="jc-audio__play" onClick={() => setOn(!on)} aria-label={on ? 'Tạm dừng' : `Phát ${label ?? ''}`.trim()}>
        <Icon name={on ? 'pause' : 'play_arrow'} size={22} fill />
      </button>
      <div className="jc-audio__main">
        {label && <span className="jc-audio__label">{label}</span>}
        <div className="jc-audio__track">
          <div className="jc-audio__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
      <span className="jc-audio__time">{`${mmss(progress * duration)} / ${mmss(duration)}`}</span>
      {speeds && (
        <button type="button" className="jc-audio__speed" onClick={onSpeed} aria-label={`Tốc độ phát ${speed}x`}>
          {`${speed}×`}
        </button>
      )}
    </div>
  );
};
