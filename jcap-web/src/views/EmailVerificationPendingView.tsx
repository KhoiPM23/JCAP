import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';

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
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl border border-blue-100">
        ✉
      </div>

      <h1 className="text-2xl font-bold text-slate-800">Kiểm tra email của bạn</h1>
      <p className="text-slate-500 text-sm mt-3 leading-6">
        Liên kết xác minh đã được gửi tới địa chỉ:
      </p>
      <p className="text-slate-800 font-semibold mt-1 break-all">{email}</p>

      <div className="mt-6 p-4 bg-slate-50 rounded-xl text-left text-sm text-slate-600 leading-6">
        <p>Hãy mở email và nhấn vào liên kết xác minh để kích hoạt tài khoản JCAP.</p>
        <p className="mt-2 text-xs text-slate-500">
          💡 Nếu không tìm thấy thư trong Hộp thư đến (Inbox), vui lòng kiểm tra thêm mục <strong>Spam</strong> hoặc <strong>Thư rác</strong>.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`mt-4 p-3 rounded-lg text-xs flex items-start gap-2 ${
            statusMessage.isError
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
          role="status"
        >
          <span>{statusMessage.isError ? '⚠️' : '✅'}</span>
          <span className="text-left leading-5">{statusMessage.text}</span>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={countdown > 0 || isResending}
          className={`w-full py-2.5 px-4 font-semibold rounded-xl border transition cursor-pointer ${
            countdown > 0 || isResending
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          {isResending
            ? 'Đang gửi...'
            : countdown > 0
            ? `Gửi lại email sau (${countdown}s)`
            : 'Gửi lại email xác thực'}
        </button>

        <button
          type="button"
          onClick={onBackToLogin}
          className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition cursor-pointer"
        >
          Đi tới đăng nhập
        </button>
      </div>
    </div>
  );
};
