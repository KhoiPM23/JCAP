import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/jcap';
import { AuthField, AuthHeading, AuthMessage, GoogleButton } from './auth/AuthUi';

interface RegisterViewProps {
  onRegisterSuccess: (email: string) => void;
  onSwitchToLogin: () => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({
  onRegisterSuccess,
  onSwitchToLogin,
}) => {
  const { register, loginWithGoogle, registerError, clearRegisterError } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    clearRegisterError();

    if (!fullName.trim()) {
      setClientError('Vui lòng nhập Họ và tên.');
      return;
    }

    if (!email.trim()) {
      setClientError('Vui lòng nhập địa chỉ Email.');
      return;
    }

    if (password.length < 6) {
      setClientError('Mật khẩu tối thiểu phải từ 6 ký tự trở lên.');
      return;
    }

    if (password !== confirmPassword) {
      setClientError('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      setIsSubmitting(true);
      const registrationResult = await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        confirmPassword,
        role: 'Learner',
      });

      onRegisterSuccess(registrationResult.email);
    } catch (err: any) {
      // Error is set in AuthContext or thrown
      setClientError(err.message || 'Đăng ký tài khoản thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = clientError || registerError;

  return (
    <div className="au-box">
      <AuthHeading title="Tạo tài khoản" lead="Miễn phí. Bắt đầu từ chương đầu tiên trên bản đồ." />

      {displayedError && <AuthMessage tone="err">{displayedError}</AuthMessage>}

      <GoogleButton label="Đăng ký với Google" onClick={loginWithGoogle} />
      <div className="or">hoặc đăng ký bằng email</div>

      <form onSubmit={handleSubmit}>
        <AuthField
          id="register-full-name"
          label="Họ và tên"
          icon="person"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nguyễn Văn An"
        />
        <AuthField
          id="register-email"
          label="Email"
          icon="mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@example.com"
        />
        <div className="af2">
          <AuthField
            id="register-password"
            label="Mật khẩu"
            icon="lock"
            password
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-describedby="register-password-hint"
          />
          <AuthField
            id="register-confirm-password"
            label="Nhập lại mật khẩu"
            icon="lock"
            password
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            aria-describedby="register-password-hint"
          />
          <span className="af-h" id="register-password-hint">
            Tối thiểu 6 ký tự.
          </span>
        </div>
        <Button type="submit" variant="primary" block loading={isSubmitting}>
          {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
        </Button>
      </form>

      <p className="af-sw">
        Đã có tài khoản?{' '}
        <button type="button" className="lnk" onClick={onSwitchToLogin}>
          Đăng nhập
        </button>
      </p>
    </div>
  );
};
