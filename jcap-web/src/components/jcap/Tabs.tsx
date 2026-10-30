import React from 'react';
import { Icon } from './Icon';
import { cx, useControlled } from './utils';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ items, value, defaultValue, onChange, ariaLabel, className }) => {
  const [cur, setCur] = useControlled(value, defaultValue ?? items[0]?.id ?? '', onChange);
  return (
    <div className={cx('jc-tabs', className)} role="tablist" aria-label={ariaLabel}>
      {items.map((t) => {
        const on = t.id === cur;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} className={cx('jc-tab', on && 'is-on')} onClick={() => setCur(t.id)}>
            {t.icon && <Icon name={t.icon} size={20} fill={on} />}
            <span>{t.label}</span>
            {t.count !== undefined && <span className="jc-tab__count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
};

export interface Step {
  label: React.ReactNode;
  description?: React.ReactNode;
  status?: 'done' | 'current' | 'todo' | 'locked' | 'error';
  tag?: React.ReactNode;
  number?: number;
}

export interface StepperProps {
  steps: Step[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

const STEP_ICON: Partial<Record<NonNullable<Step['status']>, string>> = { done: 'check', locked: 'lock', error: 'priority_high' };

export const Stepper: React.FC<StepperProps> = ({ steps, orientation = 'horizontal', className }) => (
  <ol className={cx('jc-stepper', `jc-stepper--${orientation}`, className)}>
    {steps.map((s, i) => {
      const st = s.status || 'todo';
      const icon = STEP_ICON[st];
      return (
        <li key={i} className={cx('jc-step', `is-${st}`)} aria-current={st === 'current' ? 'step' : undefined}>
          <span className="jc-step__dot">{icon ? <Icon name={icon} size={16} /> : s.number || i + 1}</span>
          <span className="jc-step__text">
            <span className="jc-step__label">{s.label}</span>
            {s.description && <span className="jc-step__desc">{s.description}</span>}
          </span>
          {s.tag && <span className="jc-step__tag">{s.tag}</span>}
        </li>
      );
    })}
  </ol>
);
