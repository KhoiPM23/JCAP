import React from 'react';
import logoMark from '../../assets/jcap-logo-mark.svg';
import { cx } from './utils';

export interface LogoProps {
  /** lockup chưa có file riêng trong dự án: dùng mark + chữ JCAP */
  variant?: 'mark' | 'lockup';
  size?: number;
  withName?: boolean;
  /** Mặc định là logo của dự án (src/assets/jcap-logo-mark.svg) */
  src?: string;
  className?: string;
}

/** Logo JCAP (mark torii trong bong bóng thoại), kèm chữ "JCAP" trừ khi withName = false */
export const Logo: React.FC<LogoProps> = ({ variant = 'mark', size = 36, withName, src, className }) => {
  if (variant === 'lockup' && src) {
    return (
      <span className={cx('jc-logo jc-logo--lockup', className)}>
        <span className="jc-logo__plate">
          <img src={src} alt="JCAP — 千里の道も一言から" height={size} style={{ height: size, width: 'auto' }} />
        </span>
      </span>
    );
  }
  return (
    <span className={cx('jc-logo', className)}>
      <span className="jc-logo__plate">
        <img src={src ?? logoMark} alt={withName === false ? 'JCAP' : ''} width={size} height={size} />
      </span>
      {withName !== false && <span className="jc-logo__name">JCAP</span>}
    </span>
  );
};
