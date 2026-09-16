import React from 'react';

interface EmailVerificationPendingViewProps {
  email: string;
  onBackToLogin: () => void;
}

export const EmailVerificationPendingView: React.FC<EmailVerificationPendingViewProps> = ({
  email,
  onBackToLogin,
}) => {
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
        <p className="mt-2">
          Nếu đang chạy local, bạn có thể xem email trong{' '}
          <a
            href="http://localhost:5000"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            smtp4dev
          </a>
          .
        </p>
      </div>

      <button
        type="button"
        onClick={onBackToLogin}
        className="w-full mt-6 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition"
      >
        Đi tới đăng nhập
      </button>
    </div>
  );
};
