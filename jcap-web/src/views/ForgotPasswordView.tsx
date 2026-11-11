import { useState, type FormEvent } from 'react';
import { Button } from '../components/jcap';
import { AuthField, AuthHeading, AuthMessage } from './auth/AuthUi';
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
    <div className="au-box">
      <AuthHeading title="Quên mật khẩu?" lead="Nhập email bạn đã đăng ký. Chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu." />

      <form onSubmit={handleSubmit}>
        <AuthField
          id="forgot-email"
          label="Email"
          icon="mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ban@example.com"
        />

        {message ? <AuthMessage tone="ok">{message}</AuthMessage> : null}
        {error ? <AuthMessage tone="err">{error}</AuthMessage> : null}

        <Button type="submit" variant="primary" block loading={isSubmitting}>
          {isSubmitting ? 'Đang gửi...' : 'Gửi hướng dẫn đặt lại'}
        </Button>
        <Button type="button" variant="secondary" block onClick={onBackToLogin}>
          Quay lại đăng nhập
        </Button>
      </form>
    </div>
  );
}
