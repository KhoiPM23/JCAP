import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';

export function ChangePasswordView() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      await logout();
      navigate('/login', { replace: true });
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    const response = await authService.changePassword(
      { currentPassword, newPassword, confirmPassword },
      token,
    );

    if (response.success) {
      setMessage(response.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setError(response.errors?.[0] ?? response.message);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-[#E6EDF5] bg-white shadow-sm">
      <div className="border-b border-[#E6EDF5] px-6 py-6 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">Hồ sơ học viên</p>
        <h1 className="mt-2 text-2xl font-bold text-[#071A44]">Bảo mật tài khoản</h1>
        <p className="mt-2 text-sm text-[#71809A]">{user?.email}</p>
      </div>

      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[0.75fr_1.25fr]">
        <div>
          <h2 className="font-bold text-[#071A44]">Đổi mật khẩu</h2>
          <p className="mt-2 text-sm leading-6 text-[#71809A]">
            Nhập mật khẩu hiện tại để xác nhận đây là tài khoản của bạn.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="current-password"
            label="Mật khẩu hiện tại"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            id="new-password"
            label="Mật khẩu mới"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <Input
            id="confirm-new-password"
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

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {isSubmitting ? 'Đang đổi mật khẩu...' : 'Cập nhật mật khẩu'}
          </Button>
        </form>
      </div>
    </div>
  );
}
