import React, { useId, useState } from 'react';
import { Icon } from './Icon';
import { cx, useControlled } from './utils';

/** Khung chung của ô nhập: nhãn, lỗi hoặc gợi ý (id-msg để aria-describedby trỏ vào) */
const Field: React.FC<{
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ id, label, hint, error, required, className, children }) => (
  <div className={cx('jc-field', error && 'has-error', className)}>
    {label && (
      <label className="jc-field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="jc-field__req" aria-hidden="true">
            {' *'}
          </span>
        )}
      </label>
    )}
    {children}
    {error ? (
      <p className="jc-field__error" id={`${id}-msg`}>
        <Icon name="error" size={16} />
        {error}
      </p>
    ) : hint ? (
      <p className="jc-field__hint" id={`${id}-msg`}>
        {hint}
      </p>
    ) : null}
  </div>
);

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement & HTMLTextAreaElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: string;
  multiline?: boolean;
  rows?: number;
  trailing?: React.ReactNode;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  hint,
  error,
  icon,
  className,
  multiline,
  rows,
  type,
  trailing,
  id: idProp,
  ...rest
}) => {
  const autoId = useId();
  const id = idProp || autoId;
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  const common = {
    ...rest,
    id,
    className: 'jc-input__el',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? `${id}-msg` : undefined,
  };
  return (
    <Field id={id} label={label} hint={hint} error={error} required={rest.required} className={className}>
      <div className={cx('jc-input', multiline && 'jc-input--multi', rest.disabled && 'is-disabled')}>
        {icon && <Icon name={icon} size={20} className="jc-input__icon" />}
        {multiline ? <textarea {...common} rows={rows || 3} /> : <input {...common} type={isPw && show ? 'text' : type || 'text'} />}
        {isPw && (
          <button type="button" className="jc-input__toggle" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
            <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
          </button>
        )}
        {trailing}
      </div>
    </Field>
  );
};

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  options: Array<string | SelectOption>;
}

export const Select: React.FC<SelectProps> = ({ label, hint, error, options, className, id: idProp, placeholder, ...rest }) => {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} required={rest.required} className={className}>
      <div className="jc-input jc-select">
        <select {...rest} id={id} className="jc-input__el" aria-invalid={error ? true : undefined}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) =>
            typeof o === 'string' ? (
              <option key={o} value={o}>
                {o}
              </option>
            ) : (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ),
          )}
        </select>
        <Icon name="expand_more" size={20} className="jc-select__chev" />
      </div>
    </Field>
  );
};

export interface SwitchProps {
  label?: string;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({ label, description, checked, defaultChecked, onChange, disabled, className }) => {
  const [on, setOn] = useControlled(checked, !!defaultChecked, onChange);
  const id = useId();
  return (
    <div className={cx('jc-switch', disabled && 'is-disabled', className)}>
      <div className="jc-switch__text">
        {label && (
          <label className="jc-switch__label" htmlFor={id}>
            {label}
          </label>
        )}
        {description && <p className="jc-switch__desc">{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={on} disabled={disabled} className={cx('jc-switch__track', on && 'is-on')} onClick={() => setOn(!on)}>
        <span className="jc-switch__thumb">{on && <Icon name="check" size={14} />}</span>
      </button>
    </div>
  );
};

export interface SegmentOption {
  value: string;
  label: React.ReactNode;
  icon?: string;
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: Array<string | SegmentOption>;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  size?: 'sm' | 'md';
  block?: boolean;
  ariaLabel?: string;
  className?: string;
}

const optValue = (o: string | SegmentOption) => (typeof o === 'string' ? o : o.value);

export const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, defaultValue, onChange, size = 'md', block, ariaLabel, className }) => {
  const [cur, setCur] = useControlled(value, defaultValue ?? (options[0] ? optValue(options[0]) : ''), onChange);
  return (
    <div className={cx('jc-seg', `jc-seg--${size}`, block && 'jc-seg--block', className)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const v = optValue(o);
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        const on = v === cur;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} disabled={opt.disabled} className={cx('jc-seg__opt', on && 'is-on')} onClick={() => setCur(v)}>
            {opt.icon && <Icon name={opt.icon} size={18} />}
            {opt.label}
            {opt.count !== undefined && <span className="jc-seg__count">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
};
