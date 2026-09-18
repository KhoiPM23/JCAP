import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { authService } from '../services/authService';

interface ForgotPasswordViewProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordView({ onBackToLogin }: ForgotPasswordViewProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    const response = await authService.forgotPassword(email.trim());
    if (response.success) {
      setMessage(response.message);
    } else {
      setError(response.errors?.[0] ?? response.message);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="p-8">
      <div className="mb-7 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0878EE]">Khôi phục tài khoản</p>
        <h1 className="mt-2 text-2xl font-bold text-[#071A44]">Quên mật khẩu?</h1>
        <p className="mt-2 text-sm leading-6 text-[#71809A]">
          Nhập email đã đăng ký. Nếu tài khoản tồn tại, JCAP sẽ gửi một liên kết đặt lại mật khẩu.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="forgot-email"
          label="Địa chỉ email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="learner@jcap.com"
        />

        {message ? (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          {isSubmitting ? 'Đang gửi...' : 'Gửi hướng dẫn đặt lại'}
        </Button>
        <Button type="button" variant="secondary" onClick={onBackToLogin} className="w-full">
          Quay lại đăng nhập
        </Button>
      </form>
    </div>
  );
}
