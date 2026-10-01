import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export interface NavbarProps {
  activePath?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activePath, onLogout }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const currentPath = activePath ?? location.pathname;
  const currentSearch = location.search;
  const handleLogout = onLogout || logout;

  // Learner navigation items
  const navItems = [
    { name: 'Trang chủ', path: '/', icon: HomeIcon, matchPrefix: false },
    { name: 'Học tập', path: '/scenarios', icon: BookIcon, matchPrefix: true },
    { name: 'Shadowing', path: '/shadowing', icon: MicIcon, matchPrefix: true },
    { name: 'Lịch học', path: '/schedule', icon: CalendarIcon, matchPrefix: true },
    { name: 'Kết quả', path: '/roleplay/results', icon: ChartIcon, matchPrefix: true },
    { name: 'Hồ sơ', path: '/profile', icon: UserIcon, matchPrefix: true },
    { name: 'Cài đặt', path: '/settings', icon: SettingsIcon, matchPrefix: true },
  ];

  const bottomItems = [
    { name: 'Trợ giúp', path: '/help', icon: HelpIcon, matchPrefix: true },
  ];

  // If user is Admin, render the Admin Sidebar matching mockup image media_1790526792509.png
  if (user?.role === 'Admin') {
    const isAudioTab = currentPath.startsWith('/admin/audio') || (currentPath === '/admin/shadowing' && currentSearch.includes('tab=audio'));

    return (
      <aside className="w-[210px] bg-white border-r border-[#E6EDF5] flex flex-col h-[calc(100vh-64px)] sticky top-[64px] z-30 font-sans">
        <nav className="flex-1 py-5 px-3 flex flex-col gap-4 overflow-y-auto">
          {/* 1. TỔNG QUAN */}
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400 px-3 tracking-wider mb-1.5">
              TỔNG QUAN
            </div>
            <div className="flex flex-col gap-1">
              <NavItem
                name="Dashboard Tổng quan"
                path="/admin/dashboard"
                icon={GridIcon}
                forceActive={currentPath === '/admin' || currentPath.startsWith('/admin/dashboard')}
              />
            </div>
          </div>

          {/* 2. QUẢN TRỊ NỘI DUNG */}
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400 px-3 tracking-wider mb-1.5">
              QUẢN TRỊ NỘI DUNG
            </div>
            <div className="flex flex-col gap-1">
              <NavItem
                name="Kịch bản Hội thoại"
                path="/admin/scenarios"
                icon={ChatBubbleIcon}
                forceActive={currentPath.startsWith('/admin/scenarios')}
              />
              <NavItem
                name="Quản lý Shadowing"
                path="/admin/shadowing"
                icon={UsersTalkIcon}
                forceActive={currentPath.startsWith('/admin/shadowing') && !isAudioTab}
              />
              <NavItem
                name="Kho Âm thanh Bản xứ"
                path="/admin/shadowing?tab=audio"
                icon={AudioWavesIcon}
                forceActive={isAudioTab}
              />
            </div>
          </div>

          {/* 3. HỆ THỐNG & NGƯỜI DÙNG */}
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-400 px-3 tracking-wider mb-1.5">
              HỆ THỐNG & NGƯỜI DÙNG
            </div>
            <div className="flex flex-col gap-1">
              <NavItem
                name="Quản lý Học viên"
                path="/admin/users"
                icon={UsersGroupIcon}
                forceActive={currentPath.startsWith('/admin/users')}
              />
              <NavItem
                name="Quản lý Gói Credit"
                path="/admin/credits/packages"
                icon={CoinCardIcon}
                forceActive={currentPath.startsWith('/admin/credits')}
              />
              <NavItem
                name="Hồ sơ cá nhân"
                path="/profile"
                icon={UserIcon}
                forceActive={currentPath.startsWith('/profile')}
              />
              <NavItem
                name="Cấu hình AI & Prompt"
                path="/admin/ai-config"
                icon={BrainGearIcon}
                forceActive={currentPath.startsWith('/admin/ai-config')}
              />
              <NavItem
                name="Cài đặt hệ thống"
                path="/admin/settings"
                icon={SettingsIcon}
                forceActive={currentPath.startsWith('/admin/settings')}
              />
            </div>
          </div>
        </nav>

        {/* Bottom Logout Button */}
        <div className="p-3 border-t border-[#E6EDF5]">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 rounded-xl h-[42px] transition-colors w-full text-left text-red-600 hover:bg-red-50 font-medium text-xs cursor-pointer"
          >
            <LogoutIcon className="w-5 h-5 text-red-600" />
            <span className="font-bold text-sm">Đăng xuất</span>
          </button>
        </div>
      </aside>
    );
  }

  // Learner Sidebar
  return (
    <aside className="w-[174px] bg-white border-r border-[#E6EDF5] flex flex-col h-[calc(100vh-64px)] sticky top-[64px] z-30">
      <nav className="flex-1 py-6 px-3 flex flex-col gap-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            {...item}
            forceActive={item.matchPrefix ? currentPath.startsWith(item.path) : currentPath === item.path}
          />
        ))}
      </nav>

      <div className="p-3 border-t border-[#E6EDF5] flex flex-col gap-2">
        {bottomItems.map((item) => (
          <NavItem
            key={item.path}
            {...item}
            forceActive={item.matchPrefix ? currentPath.startsWith(item.path) : currentPath === item.path}
          />
        ))}
        <button
          type="button"
          onClick={handleLogout}
          className={`
            flex items-center gap-3 px-3 rounded-lg h-[42px] transition-colors w-full text-left
            ${currentPath === '/logout'
              ? 'bg-[#0878EE] text-white font-medium'
              : 'text-[#71809A] hover:bg-red-50 hover:text-[#D92D20]'
            }
          `}
        >
          <LogoutIcon className={`w-5 h-5 ${currentPath === '/logout' ? 'text-white' : 'text-current'}`} />
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
          flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[42px] transition-colors
          ${active 
            ? 'bg-[#0878EE] text-white font-semibold shadow-xs' 
            : 'text-[#71809A] hover:bg-blue-50 hover:text-[#0878EE]'
          }
        `;
      }}
    >
      {({ isActive }) => {
        const active = forceActive !== undefined ? forceActive : isActive;
        return (
          <>
            <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-white' : 'text-current'}`} />
            <span className="text-sm leading-snug">{name}</span>
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

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function UsersTalkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ListLinesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  );
}

function AudioWavesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 010-7.072m-2.828 9.9a9 9 0 010-12.728M12 3v18" />
    </svg>
  );
}

function UsersGroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function BrainGearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function CoinCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
