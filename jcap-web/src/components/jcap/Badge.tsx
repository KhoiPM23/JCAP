import React from 'react';
import { Icon } from './Icon';
import { cx, fmt, type Jlpt, type Tone } from './utils';

export interface JlptBadgeProps {
  level: Jlpt;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Nhãn trình độ JLPT, màu theo cấp (--n5/--n4/--n3) */
export const JlptBadge: React.FC<JlptBadgeProps> = ({ level, size = 'md', className }) => {
  const lv = String(level || 'N5').toUpperCase();
  return (
    <span className={cx('jc-jlpt', `jc-jlpt--${lv.toLowerCase()}`, `jc-jlpt--${size}`, className)} title={`Trình độ JLPT ${lv}`}>
      {lv}
    </span>
  );
};

export interface CreditBadgeProps {
  amount: number;
  /** balance = số dư, cost = chi phí ("5 Credit") */
  variant?: 'balance' | 'cost';
  size?: 'sm' | 'md' | 'lg';
  low?: boolean;
  unit?: string;
  /** Có onClick thì thành nút (mở Gói & Credit) */
  onClick?: () => void;
  className?: string;
}

export const CreditBadge: React.FC<CreditBadgeProps> = ({ amount, variant = 'balance', size = 'md', low, unit, onClick, className }) => {
  const text = variant === 'cost' ? `${fmt(amount)} Credit` : fmt(amount);
  const inner = (
    <>
      <span className="jc-credit__coin" aria-hidden="true">
        <Icon name="toll" size={size === 'lg' ? 22 : 16} />
      </span>
      <span className="jc-credit__num">{text}</span>
      {variant === 'balance' && size !== 'sm' && <span className="jc-credit__unit">{unit || 'Credit'}</span>}
    </>
  );
  const cls = cx('jc-credit', `jc-credit--${size}`, `jc-credit--${variant}`, low && 'is-low', className);
  const aria = `${variant === 'cost' ? 'Chi phí' : 'Số dư'} ${fmt(amount)} Credit`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={`${aria}. Mở Gói & Credit`}>
      {inner}
    </button>
  ) : (
    <span className={cls} aria-label={aria}>
      {inner}
    </span>
  );
};

export interface BadgeProps {
  tone?: 'neutral' | 'ai' | 'shu' | Tone;
  icon?: string;
  dot?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', icon, dot, children, className }) => (
  <span className={cx('jc-badge', `jc-badge--${tone}`, className)}>
    {dot && <span className="jc-badge__dot" aria-hidden="true" />}
    {icon && <Icon name={icon} size={16} />}
    {children}
  </span>
);
