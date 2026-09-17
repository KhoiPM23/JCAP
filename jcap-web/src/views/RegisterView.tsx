import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface RegisterViewProps {
  onRegisterSuccess: (email: string) => void;
  onSwitchToLogin: () => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({
  onRegisterSuccess,
  onSwitchToLogin,
}) => {
  const { register, loginWithGoogle, registerError, clearRegisterError } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('N5');
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    clearRegisterError();

    if (!fullName.trim()) {
      setClientError('Vui lòng nhập Họ và tên.');
      return;
    }

    if (!email.trim()) {
      setClientError('Vui lòng nhập địa chỉ Email.');
      return;
    }

    if (password.length < 6) {
      setClientError('Mật khẩu tối thiểu phải từ 6 ký tự trở lên.');
      return;
    }

    if (password !== confirmPassword) {
      setClientError('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      setIsSubmitting(true);
      const registrationResult = await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        confirmPassword,
        jlptLevel: selectedLevel,
        role: 'Learner',
      });

      onRegisterSuccess(registrationResult.email);
    } catch (err: any) {
      // Error is set in AuthContext or thrown
      setClientError(err.message || 'Đăng ký tài khoản thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = clientError || registerError;

  return (
    <div className="p-8">
        {/* Tiêu đề & Logo */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#071A44]">Tạo tài khoản JCAP</h1>
          <p className="text-[#71809A] text-sm mt-1">Đăng ký để bắt đầu luyện Kaiwa cùng AI</p>
        </div>

        {/* Nút Đăng ký bằng Google */}
        <Button type="button" variant="secondary" className="w-full gap-3 mb-5" onClick={loginWithGoogle}>
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
          <span>Đăng ký nhanh với Google</span>
        </Button>

        <div className="relative flex items-center justify-center mb-5">
          <div className="border-t border-[#E6EDF5] w-full"></div>
          <span className="bg-white px-3 text-xs text-[#71809A] uppercase font-medium whitespace-nowrap">hoặc đăng ký bằng email</span>
          <div className="border-t border-[#E6EDF5] w-full"></div>
        </div>

        {/* Thông báo lỗi */}
        {displayedError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-start gap-2" role="alert">
            <span className="font-bold">⚠️</span>
            <span>{displayedError}</span>
          </div>
        )}

        {/* Form Đăng ký */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Họ và tên */}
          <Input id="register-full-name" label="Họ và tên" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />

          {/* Địa chỉ Email */}
          <Input id="register-email" label="Địa chỉ Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="learner@example.com" />

          {/* Mật khẩu */}
          <Input id="register-password" label="Mật khẩu" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" />

          {/* Xác nhận mật khẩu */}
          <Input id="register-confirm-password" label="Xác nhận mật khẩu" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu" />

          {/* Chọn trình độ JLPT (N5 - N4 - N3) */}
          <div>
            <label className="block text-sm font-medium text-[#071A44] mb-1.5">
              Trình độ JLPT hiện tại / mục tiêu
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['N5', 'N4', 'N3'].map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                    selectedLevel === level
                    ? 'bg-[#0878EE] text-white border-[#0878EE] shadow-md shadow-blue-200'
                    : 'bg-white text-[#71809A] border-[#E6EDF5] hover:bg-blue-50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Nút bấm Tạo tài khoản */}
          <Button type="submit" className="w-full mt-2" isLoading={isSubmitting}>
            {isSubmitting ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản ➔'}
          </Button>
        </form>

        {/* Chuyển sang màn hình Đăng nhập */}
        <div className="mt-6 text-center text-sm text-[#71809A]">
          Đã có tài khoản?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-[#0878EE] font-bold hover:underline"
          >
            Đăng nhập ngay
          </button>
        </div>
    </div>
  );
};
