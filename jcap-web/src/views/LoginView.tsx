import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface LoginViewProps {
  onLoginSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onSwitchToRegister,
}) => {
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
  const [selectedLevel, setSelectedLevel] = useState('N5');
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      await login(email.trim(), password, selectedLevel);
      onLoginSuccess?.();
    } catch (err: any) {
      setClientError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = clientError || loginError || googleError;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100 my-8">
        {/* Tiêu đề & Logo */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl font-bold border border-red-100">
            日
          </div>
          <h1 className="text-2xl font-bold text-slate-800">JCAP Platform</h1>
          <p className="text-slate-500 text-sm mt-1">Luyện nói tiếng Nhật phản xạ cùng AI</p>
        </div>

        {/* Nút Đăng nhập bằng Google */}
        <button
          type="button"
          onClick={loginWithGoogle}
          className="w-full py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition flex items-center justify-center gap-3 shadow-sm active:scale-[0.99] mb-5"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Đăng nhập với Google</span>
        </button>

        <div className="relative flex items-center justify-center mb-5">
          <div className="border-t border-slate-200 w-full"></div>
          <span className="bg-white px-3 text-xs text-slate-400 uppercase font-medium">hoặc đăng nhập bằng email</span>
          <div className="border-t border-slate-200 w-full"></div>
        </div>

        {/* Thông báo lỗi */}
        {displayedError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-start gap-2">
            <span className="font-bold">⚠️</span>
            <span>{displayedError}</span>
          </div>
        )}

        {/* Form Đăng Nhập */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ô nhập Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Địa chỉ Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition text-sm"
              placeholder="nhap-email@example.com"
            />
          </div>

          {/* Ô nhập Mật khẩu */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Mật khẩu
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition text-sm"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition cursor-pointer"
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? (
                  /* Icon Eye-Off (Mắt có dấu gạch chéo khi đang hiển thị mật khẩu) */
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  /* Icon Eye (Mắt mở khi đang ẩn mật khẩu) */
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Chọn trình độ JLPT (N5 - N4 - N3) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Trình độ JLPT mục tiêu
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['N5', 'N4', 'N3'].map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                    selectedLevel === level
                      ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">AI sẽ điều chỉnh tốc độ nói và từ vựng theo cấp độ này.</p>
          </div>

          {/* Nút bấm Đăng Nhập */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold rounded-xl shadow-lg shadow-red-200 transition transform active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Đang đăng nhập...</span>
              </>
            ) : (
              <span>Đăng nhập & Vào học ➔</span>
            )}
          </button>
        </form>

        {/* Chuyển sang màn hình Đăng ký */}
        <div className="mt-6 text-center text-sm text-slate-600">
          Chưa có tài khoản?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-red-600 font-bold hover:underline"
          >
            Đăng ký ngay
          </button>
        </div>
      </div>
    </div>
  );
};

