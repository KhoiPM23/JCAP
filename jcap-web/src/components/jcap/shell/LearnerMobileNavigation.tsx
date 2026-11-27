import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Icon, Logo } from '..';
import { LearnerNotificationBell } from '../../learner/LearnerNotificationBell';
import { PracticeConfirmation } from '../PracticeConfirmation';
import { useLearnerAccount } from './useLearnerAccount';

const tabs = [
  { to: '/', label: 'Hành trình', icon: 'travel_explore', paths: ['/explore'] },
  { to: '/scenarios', label: 'Hội thoại', icon: 'forum', paths: ['/scenarios', '/roleplay'] },
  { to: '/shadowing', label: 'Shadowing', icon: 'record_voice_over', paths: ['/shadowing'] },
  { to: '/learning/topics', label: 'Học liệu', icon: 'auto_stories', paths: ['/learning'] },
];

const moreLinks = [
  { to: '/flashcards', label: 'Flashcard', icon: 'style' },
  { to: '/roleplay/results', label: 'Kết quả hội thoại', icon: 'insights' },
  { to: '/stamps', label: 'Sổ con dấu', icon: 'approval' },
  { to: '/community', label: 'Diễn đàn', icon: 'groups', aliases: ['/forum'] },
  { to: '/subscription', label: 'Gói và Credit', icon: 'toll', aliases: ['/credits'] },
  { to: '/profile', label: 'Hồ sơ', icon: 'person' },
  { to: '/settings', label: 'Cài đặt', icon: 'settings' },
  { to: '/feedback', label: 'Hỗ trợ và góp ý', icon: 'help', aliases: ['/help'] },
];

function matches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function LearnerMobileNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { credit } = useLearnerAccount();
  const sheet = useRef<HTMLDialogElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const extra = moreLinks.find(item => [item.to, ...(item.aliases ?? [])].some(path => matches(location.pathname, path)));
  const tab = location.pathname === '/' ? tabs[0] : tabs.find(item => item.paths.some(path => matches(location.pathname, path)));
  const title = extra?.label ?? tab?.label ?? 'Tổng quan';

  useEffect(() => {
    sheet.current?.close();
  }, [location.key]);

  return (
    <>
      <header className="jx-mobile-header">
        <Link to="/" className="jx-mobile-home" aria-label="JCAP, về Hành trình"><Logo size={28} withName={false} /></Link>
        <span className="jx-mobile-title">{title}</span>
        <Link className="jx-mobile-credit" to="/subscription" aria-label={`${credit} Credit, xem gói và Credit`}>
          <Icon name="toll" size={19} />
          {new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(credit)}
        </Link>
        <LearnerNotificationBell />
      </header>
      <nav className="jx-mobile-nav" aria-label="Điều hướng học viên">
        {tabs.map(item => {
          const active = item === tab && !extra;
          return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined}><Icon name={item.icon} size={23} fill={active} /><span>{item.label}</span></Link>;
        })}
        <button type="button" aria-haspopup="dialog" aria-current={extra ? 'true' : undefined} onClick={() => sheet.current?.showModal()}>
          <Icon name="more_horiz" size={23} /><span>Thêm</span>
        </button>
      </nav>
      <dialog ref={sheet} className="jx-mobile-more" aria-labelledby="jx-mobile-more-title" onClick={event => {
        if (event.target === event.currentTarget) sheet.current?.close();
      }}>
        <div className="jx-mobile-more-content">
          <div className="jx-mobile-more-heading">
            <h2 id="jx-mobile-more-title">Thêm</h2>
            <button type="button" aria-label="Đóng menu" onClick={() => sheet.current?.close()}><Icon name="close" size={24} /></button>
          </div>
          <nav aria-label="Các mục khác">
            {moreLinks.map(item => (
              <Link key={item.to} to={item.to} onClick={() => sheet.current?.close()} aria-current={item === extra ? 'page' : undefined}>
                <Icon name={item.icon} size={22} /><span>{item.label}</span><Icon name="chevron_right" size={20} />
              </Link>
            ))}
          </nav>
          <button type="button" className="jx-mobile-sign-out" disabled={signingOut} onClick={() => {
            sheet.current?.close();
            setConfirmSignOut(true);
          }}><Icon name="logout" size={22} />{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
        </div>
      </dialog>
      {confirmSignOut && (
        <PracticeConfirmation
          title="Đăng xuất khỏi JCAP?"
          description="Bạn cần đăng nhập lại để tiếp tục học."
          cancelLabel="Ở lại"
          confirmLabel="Đăng xuất"
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={async () => {
            setConfirmSignOut(false);
            setSigningOut(true);
            await logout();
            navigate('/login', { replace: true });
          }}
        />
      )}
    </>
  );
}
