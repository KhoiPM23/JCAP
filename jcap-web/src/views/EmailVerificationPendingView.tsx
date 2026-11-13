import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { Button, Icon } from '../components/jcap';
import { AuthMessage } from './auth/AuthUi';

interface EmailVerificationPendingViewProps {
  email: string;
  onBackToLogin: () => void;
}

export const EmailVerificationPendingView: React.FC<EmailVerificationPendingViewProps> = ({
  email,
  onBackToLogin,
}) => {
  const [countdown, setCountdown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleResend = async () => {
    if (countdown > 0 || isResending) return;
    setIsResending(true);
    setStatusMessage(null);
    try {
      const res = await authService.resendConfirmationEmail(email);
      if (res.success) {
        setStatusMessage({ text: res.message || 'Đã gửi lại email xác thực thành công. Vui lòng kiểm tra hộp thư.' });
        setCountdown(60);
      } else {
        setStatusMessage({ text: res.message || 'Không thể gửi lại email xác minh lúc này.', isError: true });
      }
    } catch {
      setStatusMessage({ text: 'Có lỗi xảy ra khi gửi lại email. Vui lòng thử lại.', isError: true });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="au-box">
      <span className="mailic">
        <Icon name="mark_email_unread" size={32} />
      </span>
      <div>
        <h1>Kiểm tra email của bạn</h1>
        <p className="lead">
          Chúng tôi đã gửi liên kết xác minh tới <b className="mail-to">{email}</b>. Mở email và bấm liên kết để kích hoạt tài khoản.
        </p>
      </div>
      <p className="af-h" style={{ margin: 0, fontSize: 14, lineHeight: '22px' }}>
        Không thấy email? Xem thư mục Spam hoặc Quảng cáo, rồi gửi lại nếu cần.
      </p>

      {statusMessage && <AuthMessage tone={statusMessage.isError ? 'err' : 'ok'}>{statusMessage.text}</AuthMessage>}

      <Button type="button" variant="secondary" block icon="forward_to_inbox" onClick={handleResend} disabled={countdown > 0} loading={isResending}>
        {isResending ? 'Đang gửi...' : countdown > 0 ? `Gửi lại email sau ${countdown} giây` : 'Gửi lại email xác thực'}
      </Button>
      <Button type="button" variant="ghost" block onClick={onBackToLogin}>
        Quay lại đăng nhập
      </Button>
    </div>
  );
};
