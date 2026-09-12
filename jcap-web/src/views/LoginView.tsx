import React, { useState } from 'react';

// Định nghĩa dữ liệu truyền vào màn hình này (Props)
interface LoginViewProps {
  onLoginSuccess: (email: string, level: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  // 1. Khai báo biến trạng thái (State) - Tương đương các ô nhập trong Form
  const [email, setEmail] = useState('learner1@jcap.com');
  const [password, setPassword] = useState('Learner@123!');
  const [selectedLevel, setSelectedLevel] = useState('N5');

  // 2. Hàm xử lý khi bấm nút "Đăng nhập"
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Ngăn trình duyệt tải lại trang
    if (!email) {
      alert('Vui lòng nhập Email!');
      return;
    }
    // Gọi hàm chuyển sang màn hình tiếp theo
    onLoginSuccess(email, selectedLevel);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        {/* Tiêu đề & Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl font-bold border border-red-100">
            日
          </div>
          <h1 className="text-2xl font-bold text-slate-800">JCAP Platform</h1>
          <p className="text-slate-500 text-sm mt-1">Luyện nói tiếng Nhật cùng AI (Demo Mock FE)</p>
        </div>

        {/* Form Đăng Nhập */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Ô nhập Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Địa chỉ Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition"
              placeholder="nhap-email@example.com"
            />
          </div>

          {/* Ô nhập Mật khẩu */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          {/* Chọn trình độ JLPT (N5 - N4 - N3) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Trình độ JLPT mục tiêu
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {['N5', 'N4', 'N3'].map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={`py-2 rounded-xl text-sm font-bold border transition ${
                    selectedLevel === level
                      ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">AI sẽ điều chỉnh tốc độ nói và từ vựng theo cấp độ này.</p>
          </div>

          {/* Nút bấm Đăng Nhập */}
          <button
            type="submit"
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-lg shadow-red-200 transition transform active:scale-[0.98]"
          >
            Đăng nhập & Vào học thử ➔
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400">
          * Dữ liệu mô phỏng chạy trên trình duyệt (Chưa gọi API Backend)
        </div>
      </div>
    </div>
  );
};

