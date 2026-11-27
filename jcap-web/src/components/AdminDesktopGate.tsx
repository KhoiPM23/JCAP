import { useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePhoneViewport } from '../hooks/usePhoneViewport';
import { Button } from './jcap/Button';
import { Icon } from './jcap/Icon';
import { Logo } from './jcap/Logo';

export function AdminDesktopGate({ children }: { children: ReactNode }) {
  const isPhone = usePhoneViewport();
  return isPhone ? <AdminDesktopNotice /> : <>{children}</>;
}

function AdminDesktopNotice() {
  const { logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await logout();
  }

  return (
    <main
      data-theme="hoc-tap"
      lang="vi"
      aria-labelledby="admin-desktop-title"
      className="grid min-h-dvh place-items-center bg-paper-100 px-4 py-8 text-sumi"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper-50 p-5 shadow-sm min-[360px]:p-6">
        <Logo />
        <div className="my-5 grid h-12 w-12 place-items-center rounded-xl bg-ai-soft text-ai">
          <Icon name="desktop_windows" size={26} />
        </div>
        <h1 id="admin-desktop-title" className="text-xl font-bold leading-snug">
          Vui lòng dùng máy tính
        </h1>
        <p className="mb-6 mt-3 text-sm leading-relaxed text-sumi-muted">
          Đăng nhập JCAP trên máy tính để vào khu vực quản trị.
        </p>
        <Button variant="primary" size="lg" block icon="logout" loading={isSigningOut} onClick={signOut}>
          {isSigningOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </Button>
      </div>
    </main>
  );
}
