import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface LoginViewProps {
  onLoginSuccess?: () => void;
  onSwitchToRegister?: () => void;
  onForgotPassword?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onSwitchToRegister,
  onForgotPassword,
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
    <div className="p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-[#071A44]">JCAP Platform</h1>
        <p className="text-[#71809A] text-sm mt-1">Luyện nói tiếng Nhật phản xạ cùng AI</p>
      </div>

      <Button type="button" variant="secondary" className="w-full gap-3 mb-5" onClick={loginWithGoogle}>
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
        <span>Đăng nhập với Google</span>
      </Button>

      <div className="relative flex items-center justify-center mb-5">
        <div className="border-t border-[#E6EDF5] w-full"></div>
        <span className="bg-white px-3 text-xs text-[#71809A] uppercase font-medium whitespace-nowrap">hoặc đăng nhập bằng email</span>
        <div className="border-t border-[#E6EDF5] w-full"></div>
      </div>

      {displayedError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-start gap-2" role="alert">
          <span className="font-bold">⚠️</span>
          <span>{displayedError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="login-email"
          label="Địa chỉ Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nhap-email@example.com"
        />

        <div className="relative">
          <Input
            id="login-password"
            label="Mật khẩu"
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 bottom-2.5 text-[#71809A] hover:text-[#071A44] focus:outline-none transition cursor-pointer"
            title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs font-semibold text-[#0878EE] hover:underline"
          >
            Quên mật khẩu?
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#071A44] mb-1.5">Trình độ JLPT mục tiêu</label>
          <div className="grid grid-cols-3 gap-2">
            {['N5', 'N4', 'N3'].map((level) => (
              <button
                type="button"
                key={level}
                onClick={() => setSelectedLevel(level)}
                className={`py-2 rounded-lg text-xs font-bold border transition ${selectedLevel === level ? 'bg-[#0878EE] text-white border-[#0878EE] shadow-md shadow-blue-200' : 'bg-white text-[#71809A] border-[#E6EDF5] hover:bg-blue-50'}`}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#71809A] mt-1">AI sẽ điều chỉnh tốc độ nói và từ vựng theo cấp độ này.</p>
        </div>

        <Button type="submit" className="w-full mt-2" isLoading={isSubmitting}>
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập & Vào học ➔'}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-[#71809A]">
        Chưa có tài khoản?{' '}
        <button type="button" onClick={onSwitchToRegister} className="text-[#0878EE] font-bold hover:underline">
          Đăng ký ngay
        </button>
      </div>
    </div>
  );
};

