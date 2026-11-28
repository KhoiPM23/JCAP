import React, { useEffect, useId, useRef } from 'react';
import { IconButton } from './Button';
import { Icon } from './Icon';
import { cx, type Tone } from './utils';

export interface ModalProps {
  open?: boolean;
  title: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  icon?: string;
  tone?: 'ai' | 'warning' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Hộp thoại: Esc hoặc bấm nền để đóng, Tab không ra ngoài hộp, đóng xong trả focus về chỗ cũ */
export const Modal: React.FC<ModalProps> = ({ open = true, title, children, footer, onClose, icon, tone = 'ai', size = 'md', className }) => {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    if (box && !box.contains(document.activeElement)) box.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="jc-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div ref={boxRef} className={cx('jc-modal', `jc-modal--${size}`, className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="jc-modal__head">
          {icon && (
            <span className={cx('jc-modal__icon', `jc-tone-bg-${tone}`)}>
              <Icon name={icon} size={24} />
            </span>
          )}
          <h2 className="jc-modal__title" id={titleId}>
            {title}
          </h2>
          {onClose && <IconButton icon="close" label="Đóng" onClick={onClose} />}
        </div>
        <div className="jc-modal__body">{children}</div>
        {footer && <div className="jc-modal__foot">{footer}</div>}
      </div>
    </div>
  );
};

type NoticeTone = Extract<Tone, 'info' | 'success' | 'warning' | 'danger'>;
const TONE_ICON: Record<NoticeTone, string> = { info: 'info', success: 'check_circle', warning: 'warning', danger: 'error' };

export interface AlertProps {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ tone = 'info', title, children, action, onClose, className }) => (
  <div className={cx('jc-alert', `jc-alert--${tone}`, className)} role={tone === 'danger' ? 'alert' : 'status'}>
    <Icon name={TONE_ICON[tone]} size={22} className="jc-alert__icon" fill />
    <div className="jc-alert__body">
      {title && <p className="jc-alert__title">{title}</p>}
      {children && <div className="jc-alert__text">{children}</div>}
      {action && <div className="jc-alert__action">{action}</div>}
    </div>
    {onClose && <IconButton icon="close" label="Đóng" size="sm" onClick={onClose} className="jc-alert__close" />}
  </div>
);

export const Toast: React.FC<AlertProps> = ({ tone = 'success', title, children, action, onClose, className }) => (
  <div className={cx('jc-toast', `jc-toast--${tone}`, className)} role="status" aria-live="polite">
    <Icon name={TONE_ICON[tone]} size={22} className="jc-toast__icon" fill />
    <div className="jc-toast__body">
      {title && <p className="jc-toast__title">{title}</p>}
      {children && <p className="jc-toast__text">{children}</p>}
    </div>
    {action}
    {onClose && <IconButton icon="close" label="Đóng thông báo" size="sm" onClick={onClose} />}
  </div>
);
