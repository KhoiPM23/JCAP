import React from 'react';
import { Icon } from './Icon';
import { cx, fmt, verdict, VERDICT, type Verdict } from './utils';

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: React.ReactNode;
  showValue?: boolean;
  tone?: 'ai' | 'success' | 'warning' | 'danger' | 'shu' | 'credit';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, max = 100, label, showValue, tone = 'ai', size = 'md', className }) => {
  const pct = Math.max(0, Math.min(100, ((value || 0) / (max || 100)) * 100));
  return (
    <div className={cx('jc-progress', `jc-progress--${size}`, className)}>
      {(label || showValue) && (
        <div className="jc-progress__row">
          {label ? <span className="jc-progress__label">{label}</span> : <span />}
          {showValue && <span className="jc-progress__val">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        className="jc-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value || 0}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className={cx('jc-progress__fill', `jc-tone-${tone}`)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export interface QuotaMeterProps {
  label: string;
  used: number;
  total: number;
  /** vd "2 giờ 14 phút" */
  resetIn?: string;
  tone?: '5h' | 'week' | 'wallet';
  icon?: string;
  className?: string;
}

export const QuotaMeter: React.FC<QuotaMeterProps> = ({ label, used = 0, total = 1, resetIn, tone = '5h', icon, className }) => {
  const pct = Math.min(100, Math.round((used / (total || 1)) * 100));
  const left = Math.max(0, total - used);
  const state = pct >= 100 ? 'is-empty' : pct >= 80 ? 'is-low' : '';
  return (
    <div className={cx('jc-quota', `jc-quota--${tone}`, state, className)}>
      <div className="jc-quota__head">
        <span className="jc-quota__label">
          <Icon name={icon || (tone === 'week' ? 'date_range' : 'timelapse')} size={20} />
          {label}
        </span>
        <span className="jc-quota__left">{pct >= 100 ? 'Đã hết' : `Còn ${fmt(left)}`}</span>
      </div>
      <div className="jc-quota__track" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={used} aria-label={`${label}: đã dùng ${used} trên ${total}`}>
        <div className="jc-quota__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="jc-quota__foot">
        <span>{`Đã dùng ${fmt(used)} / ${fmt(total)} · ${pct}%`}</span>
        {resetIn && (
          <span>
            <Icon name="history" size={16} />
            {`Hồi phục sau ${resetIn}`}
          </span>
        )}
      </div>
    </div>
  );
};

export interface ScoreRingProps {
  value: number;
  size?: number;
  label?: React.ReactNode;
  showVerdict?: boolean;
  /** Mặc định theo điểm: ≥80 good, ≥50 mid, còn lại low */
  tone?: Verdict;
  className?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({ value, size = 96, label, showVerdict, tone, className }) => {
  const stroke = Math.max(6, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  const t = tone || verdict(v);
  return (
    <div className={cx('jc-ring', `jc-ring--${t}`, className)} style={{ minWidth: size }}>
      <div className="jc-ring__fig" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle className="jc-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
          <circle
            className="jc-ring__bar"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span className="jc-ring__num" style={{ fontSize: Math.round(size * 0.32) }}>
          {Math.round(v)}
          {size >= 96 && <span className="jc-ring__max">/100</span>}
        </span>
      </div>
      {label && <span className="jc-ring__label">{label}</span>}
      {showVerdict && (
        <span className="jc-ring__verdict">
          <Icon name={VERDICT[t][1]} size={16} fill />
          {VERDICT[t][0]}
        </span>
      )}
    </div>
  );
};
