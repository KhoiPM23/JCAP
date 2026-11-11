import React, { useId, useState } from 'react';
import { Icon } from '../../components/jcap';
import './auth.css';

/**
 * Các mảnh giao diện dùng chung cho Đăng nhập, Đăng ký, Kiểm tra email, Quên mật khẩu (design-handoff mục 9e).
 * Chỉ là giao diện: state và xử lý vẫn nằm trong từng view.
 */

interface AuthFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** Icon Material Symbols ở đầu ô */
  icon: string;
  /** Nút/liên kết nằm cùng hàng nhãn (vd "Quên mật khẩu?") */
  labelAction?: React.ReactNode;
  /** Ô mật khẩu: có nút mắt hiện/ẩn */
  password?: boolean;
}

/** Ô nhập cao 44px, icon ở đầu, nhãn ở trên; ô mật khẩu có nút hiện/ẩn */
export const AuthField: React.FC<AuthFieldProps> = ({ label, icon, labelAction, password, id, type, ...input }) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [shown, setShown] = useState(false);
  return (
    <div className="af">
      <span className="af-l">
        <label htmlFor={inputId}>{label}</label>
        {labelAction}
      </span>
      <span className="af-in">
        <Icon name={icon} size={20} />
        <input id={inputId} type={password ? (shown ? 'text' : 'password') : type} {...input} />
        {password && (
          <button type="button" className="af-eye" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={shown}>
            <Icon name={shown ? 'visibility_off' : 'visibility'} size={20} />
          </button>
        )}
      </span>
    </div>
  );
};

/** Nút đăng nhập/đăng ký bằng Google, viền mảnh, logo Google sẵn có của dự án */
export const GoogleButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" className="gbtn" onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
    {label}
  </button>
);

/** Khung thông báo dưới tiêu đề: ok (xanh) hoặc lỗi (đỏ); children có thể kèm nút hành động */
export const AuthMessage: React.FC<{ tone: 'ok' | 'err'; children: React.ReactNode }> = ({ tone, children }) => (
  <div className={`msg ${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
    <Icon name={tone === 'ok' ? 'check_circle' : 'error'} size={20} />
    <div className="msg-body">{children}</div>
  </div>
);

/** Tiêu đề + dòng mô tả của mỗi màn */
export const AuthHeading: React.FC<{ title: string; lead?: React.ReactNode }> = ({ title, lead }) => (
  <div>
    <h1>{title}</h1>
    {lead && <p className="lead">{lead}</p>}
  </div>
);
