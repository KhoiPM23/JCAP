import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import logoMark from '../assets/jcap-logo-mark.svg';
import '../views/auth/auth.css';

// Hình bên trái vẽ bản đồ từ dữ liệu 47 tỉnh: tách chunk riêng, form vẫn hiện ngay khi hình chưa tải xong
const AuthArt = React.lazy(() => import('../views/auth/AuthArt'));

/** Câu ở góc dưới phần hình, đổi theo trang (design-handoff mục 9e) */
const artTitle = (path: string) => {
  if (path.startsWith('/login')) return 'Hành trình của bạn vẫn đang chờ.';
  if (path.startsWith('/forgot-password') || path.startsWith('/reset-password')) return 'Lấy lại tài khoản, đi tiếp hành trình.';
  return 'Đường ngàn dặm cũng bắt đầu từ một câu nói';
};

/**
 * Khung chung của Đăng nhập, Đăng ký, Kiểm tra email, Quên/Đặt lại mật khẩu.
 * Trái: bản đồ minh hoạ (ẩn trên điện thoại). Phải: form của từng trang (Outlet).
 */
export const AuthLayout: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div className="auth" data-theme="kham-pha">
      <div className="au-art">
        <React.Suspense fallback={null}>
          <AuthArt />
        </React.Suspense>
        <div className="au-top">
          <button type="button" className="home" onClick={() => navigate('/')} aria-label="Về trang giới thiệu JCAP">
            <img src={logoMark} alt="" />
            JCAP
          </button>
        </div>
        <div className="copy">
          <h2>{artTitle(pathname)}</h2>
          <p>Luyện nói qua những tình huống bạn sẽ gặp ở Nhật, cho người Việt từ N5 đến N3.</p>
        </div>
      </div>
      <main className="au-form">
        <Outlet />
      </main>
    </div>
  );
};
