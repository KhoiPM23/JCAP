import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import type { User } from '../../types/auth';

export interface HeaderProps {
  user?: User | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user: propUser, onLogout }) => {
  const { user: authUser, logout } = useAuth();
  const [currentUser, setCurrentUser] = React.useState<User | null>(propUser !== undefined ? propUser : authUser);
  const handleLogout = onLogout || logout;

  React.useEffect(() => {
    if (propUser !== undefined) {
      setCurrentUser(propUser);
      return;
    }
    const saved = localStorage.getItem('jcap_user');
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch {
        setCurrentUser(authUser);
      }
    } else {
      setCurrentUser(authUser);
    }
  }, [authUser, propUser]);

  React.useEffect(() => {
    const handleProfileUpdated = (event: any) => {
      const detail = event.detail;
      if (detail) {
        setCurrentUser((prev) => ({
          ...(prev || {}),
          id: detail.id || prev?.id || '',
          email: detail.email || prev?.email || '',
          role: detail.role || prev?.role || 'Learner',
          fullName: detail.fullName,
          level: detail.jlptLevel,
          avatarUrl: detail.profilePictureUrl,
        }));
      }
    };

    window.addEventListener('jcap_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
  }, []);

  const user = currentUser;

  return (
    <header className="h-[64px] bg-white border-b border-[#E6EDF5] flex items-center justify-between px-8 sticky top-0 z-40">
      {/* Left: Logo/Brand */}
      <div className="flex items-center gap-4">
        <Link to="/" className="text-2xl font-bold text-[#0878EE] tracking-tight">
          JCAP
        </Link>
      </div>

      {/* Center: Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-[#71809A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-[#E6EDF5] rounded-lg leading-5 bg-gray-50 placeholder-[#71809A] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0878EE] focus:border-[#0878EE] sm:text-sm transition-colors"
            placeholder="Tìm kiếm khóa học, bài học..."
          />
        </div>
      </div>

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-6">
        {/* Notifications */}
        <button 
          type="button"
          className="text-[#71809A] hover:text-[#0878EE] transition-colors relative p-1 rounded-full hover:bg-blue-50"
          aria-label="Thông báo"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {/* Notification badge dot */}
          <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-[#D92D20] ring-2 ring-white"></span>
        </button>

        {/* User Account Info */}
        {user && (
          <div className="flex items-center gap-3 border-l border-[#E6EDF5] pl-6">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-medium text-[#071A44]">{user.fullName || user.email}</span>
              {user.level && (
                <span className="text-xs text-[#0878EE] font-medium bg-blue-50 px-2 py-0.5 rounded-full mt-0.5">
                  JLPT {user.level}
                </span>
              )}
            </div>
            
            {/* Avatar Dropdown */}
            <div className="relative group cursor-pointer">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName || user.email}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-transparent group-hover:ring-[#0878EE] transition-all"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div 
                  className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-[#0878EE] font-bold ring-2 ring-transparent group-hover:ring-[#0878EE] transition-all"
                >
                  {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                </div>
              )}
              
              {/* Dropdown menu */}
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 border border-[#E6EDF5] hidden group-hover:block z-50">
                <Link to="/profile" className="block px-4 py-2 text-sm text-[#071A44] hover:bg-gray-50">
                  Hồ sơ cá nhân
                </Link>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-[#D92D20] hover:bg-red-50"
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
