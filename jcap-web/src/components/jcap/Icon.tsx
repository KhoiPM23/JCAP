import React from 'react';
import { cx } from './utils';

export interface IconProps {
  name: string;
  size?: number;
  fill?: boolean;
  spin?: boolean;
  /** Có label: icon mang nghĩa (role img); không có: chỉ trang trí (aria-hidden) */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Biểu tượng Material Symbols Rounded */
export const Icon: React.FC<IconProps> = ({ name, size = 20, fill, spin, label, className, style }) => (
  <span
    className={cx('jc-icon material-symbols-rounded', spin && 'jc-spin', className)}
    style={{
      fontSize: size,
      width: size,
      height: size,
      fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${Math.min(48, Math.max(20, size))}`,
      ...style,
    }}
    aria-hidden={label ? undefined : true}
    role={label ? 'img' : undefined}
    aria-label={label}
  >
    {name}
  </span>
);
