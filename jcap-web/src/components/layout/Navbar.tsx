import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export interface NavbarProps {
  activePath?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activePath, onLogout }) => {
  const { logout } = useAuth();
  const handleLogout = onLogout || logout;

  // Learner navigation items in exact order as specified
  const navItems = [
    { name: 'Trang chủ', path: '/', icon: HomeIcon },
    { name: 'Học tập', path: '/scenarios', icon: BookIcon },
    { name: 'Shadowing', path: '/shadowing', icon: MicIcon },
    { name: 'Lịch học', path: '/schedule', icon: CalendarIcon },
    { name: 'Kết quả', path: '/roleplay/results', icon: ChartIcon },
    { name: 'Hồ sơ', path: '/profile', icon: UserIcon },
    { name: 'Cài đặt', path: '/settings', icon: SettingsIcon },
  ];

  const bottomItems = [
    { name: 'Trợ giúp', path: '/help', icon: HelpIcon },
  ];

  return (
    <aside className="w-[174px] bg-white border-r border-[#E6EDF5] flex flex-col h-[calc(100vh-64px)] sticky top-[64px] z-30">
      <nav className="flex-1 py-6 px-3 flex flex-col gap-2">
        {navItems.map((item) => (
          <NavItem key={item.path} {...item} forceActive={activePath === item.path} />
        ))}
      </nav>

      <div className="p-3 border-t border-[#E6EDF5] flex flex-col gap-2">
        {bottomItems.map((item) => (
          <NavItem key={item.path} {...item} forceActive={activePath === item.path} />
        ))}
        <button
          type="button"
          onClick={handleLogout}
          className={`
            flex items-center gap-3 px-3 rounded-lg h-[42px] transition-colors w-full text-left
            ${activePath === '/logout'
              ? 'bg-[#0878EE] text-white font-medium'
              : 'text-[#71809A] hover:bg-red-50 hover:text-[#D92D20]'
            }
          `}
        >
          <LogoutIcon className={`w-5 h-5 ${activePath === '/logout' ? 'text-white' : 'text-current'}`} />
          <span className="text-sm font-medium">Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
};

// NavItem Component
interface NavItemProps {
  name: string;
  path: string;
  icon: React.FC<{ className?: string }>;
  forceActive?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ name, path, icon: Icon, forceActive }) => {
  return (
    <NavLink
      to={path}
      className={({ isActive }) => {
        const active = forceActive !== undefined ? forceActive : isActive;
        return `
          flex items-center gap-3 px-3 rounded-lg h-[42px] transition-colors
          ${active 
            ? 'bg-[#0878EE] text-white font-medium' 
            : 'text-[#71809A] hover:bg-blue-50 hover:text-[#0878EE]'
          }
        `;
      }}
    >
      {({ isActive }) => {
        const active = forceActive !== undefined ? forceActive : isActive;
        return (
          <>
            <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-current'}`} />
            <span className="text-sm">{name}</span>
          </>
        );
      }}
    </NavLink>
  );
};

// Icons (SVG representations)
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}
