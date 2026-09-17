import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { authService } from '../services/authService';

interface ResetPasswordViewProps {
  onBackToLogin: () => void;
}

export function ResetPasswordView({ onBackToLogin }: ResetPasswordViewProps) {
  const [resetRequest] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { email: params.get('email') ?? '', token: params.get('token') ?? '' };
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasValidLink = Boolean(resetRequest.email && resetRequest.token);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    const response = await authService.resetPassword({
      ...resetRequest,
      newPassword,
      confirmPassword,
    });

    if (response.success) {
      setMessage(response.message);
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setError(response.errors?.[0] ?? response.message);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="p-8">
      <div className="mb-7 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">Tạo mật khẩu mới</p>
        <h1 className="mt-2 text-2xl font-bold text-[#071A44]">Đặt lại mật khẩu</h1>
        <p className="mt-2 text-sm leading-6 text-[#71809A]">
          {hasValidLink ? `Tài khoản ${resetRequest.email}` : 'Liên kết đặt lại mật khẩu không đầy đủ hoặc không hợp lệ.'}
        </p>
      </div>

      {hasValidLink ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="reset-password"
            label="Mật khẩu mới"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            helperText="Tối thiểu 6 ký tự theo cấu hình Identity hiện tại."
          />
          <Input
            id="reset-confirm-password"
            label="Xác nhận mật khẩu mới"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          {message ? (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button type="submit" isLoading={isSubmitting} disabled={Boolean(message)} className="w-full">
            {isSubmitting ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
          </Button>
        </form>
      ) : (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          Hãy tạo yêu cầu quên mật khẩu mới để nhận một liên kết hợp lệ.
        </p>
      )}

      <Button type="button" variant="secondary" onClick={onBackToLogin} className="mt-5 w-full">
        Quay lại đăng nhập
      </Button>
    </div>
  );
}
