import { useState, type FormEvent } from 'react';
import { Button } from '../components/jcap';
import { AuthField, AuthHeading, AuthMessage } from './auth/AuthUi';
import { authService } from '../services/authService';

interface ResetPasswordViewProps {
  onResetSuccess: () => void;
  onBackToLogin: () => void;
}

export function ResetPasswordView({ onResetSuccess, onBackToLogin }: ResetPasswordViewProps) {
  const [resetRequest] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { email: params.get('email') ?? '', token: params.get('token') ?? '' };
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasValidLink = Boolean(resetRequest.email && resetRequest.token);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Mật khẩu mới tối thiểu phải từ 6 ký tự trở lên.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authService.resetPassword({
        ...resetRequest,
        newPassword,
        confirmPassword,
      });

      if (response.success) {
        onResetSuccess();
        return;
      }

      setError(response.errors?.[0] ?? response.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="au-box">
      <AuthHeading
        title="Đặt lại mật khẩu"
        lead={
          hasValidLink
            ? `Tạo mật khẩu mới cho tài khoản ${resetRequest.email}.`
            : 'Liên kết đặt lại mật khẩu không đầy đủ hoặc không hợp lệ.'
        }
      />

      {hasValidLink ? (
        <form onSubmit={handleSubmit}>
          <AuthField
            id="reset-password"
            label="Mật khẩu mới"
            icon="lock"
            password
            autoComplete="new-password"
            minLength={6}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="••••••••"
          />
          <AuthField
            id="reset-confirm-password"
            label="Xác nhận mật khẩu mới"
            icon="lock"
            password
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
          />
          <span className="af-h">Tối thiểu 6 ký tự.</span>

          {error ? <AuthMessage tone="err">{error}</AuthMessage> : null}

          <Button type="submit" variant="primary" block loading={isSubmitting}>
            {isSubmitting ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
          </Button>
          <Button type="button" variant="secondary" block onClick={onBackToLogin}>
            Quay lại đăng nhập
          </Button>
        </form>
      ) : (
        <>
          <AuthMessage tone="err">
            Hãy tạo yêu cầu quên mật khẩu mới để nhận một liên kết hợp lệ.
          </AuthMessage>
          <Button type="button" variant="secondary" block onClick={onBackToLogin}>
            Quay lại đăng nhập
          </Button>
        </>
      )}
    </div>
  );
}
