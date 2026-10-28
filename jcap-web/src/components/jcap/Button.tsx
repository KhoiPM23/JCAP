import React from 'react';
import { Icon } from './Icon';
import { cx } from './utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  block?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading,
  block,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    {...rest}
    className={cx('jc-btn', `jc-btn--${variant}`, `jc-btn--${size}`, block && 'jc-btn--block', loading && 'is-loading', className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
  >
    {loading ? <Icon name="progress_activity" spin size={18} /> : icon ? <Icon name={icon} size={20} /> : null}
    {children ? <span className="jc-btn__label">{children}</span> : null}
    {iconRight && !loading ? <Icon name={iconRight} size={20} /> : null}
  </button>
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Bắt buộc: dùng làm aria-label và tooltip */
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md';
  /** Nút bật/tắt: có giá trị thì thêm aria-pressed */
  active?: boolean;
  fill?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  active,
  fill,
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    {...rest}
    className={cx('jc-iconbtn', `jc-iconbtn--${variant}`, `jc-iconbtn--${size}`, active && 'is-active', className)}
    aria-label={label}
    title={label}
    aria-pressed={active === undefined ? undefined : !!active}
  >
    <Icon name={icon} size={size === 'sm' ? 18 : 22} fill={fill || active} />
  </button>
);
