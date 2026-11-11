import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';
import { Button } from '../components/jcap';
import { AuthField, AuthHeading, AuthMessage, GoogleButton } from './auth/AuthUi';

interface LoginViewProps {
  onLoginSuccess?: () => void;
  onSwitchToRegister?: () => void;
  onForgotPassword?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onSwitchToRegister,
  onForgotPassword,
}) => {
  const [searchParams] = useSearchParams();
  const confirmed = searchParams.get('confirmed');
  const confirmationError = searchParams.get('error');

  const {
    login,
    loginWithGoogle,
    loginError,
    googleError,
    clearLoginError,
    clearGoogleError,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [resendStatus, setResendStatus] = useState<{ message: string; isError?: boolean } | null>(null);
  const [isResending, setIsResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    clearLoginError();
    clearGoogleError();

    if (!email.trim()) {
      setClientError('Vui lòng nhập Email!');
      return;
    }

    if (!password) {
      setClientError('Vui lòng nhập Mật khẩu!');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email.trim(), password);
      onLoginSuccess?.();
    } catch (err: any) {
      setClientError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendFromLogin = async () => {
    if (!email.trim()) {
      setClientError('Vui lòng nhập địa chỉ Email ở ô bên dưới trước khi yêu cầu gửi lại.');
      return;
    }
    setIsResending(true);
    setResendStatus(null);
    try {
      const res = await authService.resendConfirmationEmail(email.trim());
      if (res.success) {
        setResendStatus({ message: res.message || 'Đã gửi lại email xác thực thành công. Vui lòng kiểm tra hộp thư.' });
      } else {
        setResendStatus({ message: res.message || 'Không thể gửi lại email xác thực.', isError: true });
      }
    } catch {
      setResendStatus({ message: 'Không thể kết nối đến máy chủ Backend.', isError: true });
    } finally {
      setIsResending(false);
    }
  };

  const displayedError = clientError || loginError || googleError;

  return (
    <div className="au-box">
      <AuthHeading title="Chào mừng quay lại" lead="Đăng nhập để đi tiếp hành trình của bạn." />

      {confirmed === 'true' && <AuthMessage tone="ok">Email đã được xác minh. Bạn có thể đăng nhập.</AuthMessage>}

      {confirmed === 'false' && (
        <AuthMessage tone="err">
          <span>{confirmationError ? decodeURIComponent(confirmationError) : 'Liên kết xác minh email không hợp lệ hoặc đã hết hạn.'}</span>
          <button type="button" className="lnk" onClick={handleResendFromLogin} disabled={isResending}>
            {isResending ? 'Đang gửi lại...' : 'Gửi lại liên kết xác minh qua email'}
          </button>
        </AuthMessage>
      )}

      {resendStatus && <AuthMessage tone={resendStatus.isError ? 'err' : 'ok'}>{resendStatus.message}</AuthMessage>}

      {displayedError && (
        <AuthMessage tone="err">
          <span>{displayedError}</span>
          {displayedError.toLowerCase().includes('chưa được xác minh') && (
            <button type="button" className="lnk" onClick={handleResendFromLogin} disabled={isResending}>
              {isResending ? 'Đang gửi lại...' : 'Gửi lại email xác thực'}
            </button>
          )}
        </AuthMessage>
      )}

      <GoogleButton label="Đăng nhập với Google" onClick={loginWithGoogle} />
      <div className="or">hoặc</div>

      <form onSubmit={handleSubmit}>
        <AuthField
          id="login-email"
          label="Email"
          icon="mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@example.com"
        />
        <AuthField
          id="login-password"
          label="Mật khẩu"
          icon="lock"
          password
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          labelAction={
            <button type="button" className="lnk" onClick={onForgotPassword}>
              Quên mật khẩu?
            </button>
          }
        />
        <Button type="submit" variant="primary" block loading={isSubmitting}>
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>

      <p className="af-sw">
        Chưa có tài khoản?{' '}
        <button type="button" className="lnk" onClick={onSwitchToRegister}>
          Đăng ký miễn phí
        </button>
      </p>
    </div>
  );
};
