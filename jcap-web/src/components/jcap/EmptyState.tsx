import React from 'react';
import { Icon } from './Icon';
import { cx } from './utils';

export interface EmptyStateProps {
  icon?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = 'inbox', title, children, action, secondaryAction, compact, className }) => (
  <div className={cx('jc-empty', compact && 'jc-empty--compact', className)}>
    <span className="jc-empty__icon">
      <Icon name={icon} size={32} />
    </span>
    <h3 className="jc-empty__title">{title}</h3>
    {children && <p className="jc-empty__text">{children}</p>}
    {(action || secondaryAction) && (
      <div className="jc-empty__actions">
        {action}
        {secondaryAction}
      </div>
    )}
  </div>
);
