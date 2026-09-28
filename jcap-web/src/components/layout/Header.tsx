import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { creditService } from '../../services/creditService';
import type { User } from '../../types/auth';

export interface HeaderProps {
  user?: User | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user: propUser, onLogout }) => {
  const { user: authUser, logout } = useAuth();
  const [currentUser, setCurrentUser] = React.useState<User | null>(propUser !== undefined ? propUser : authUser);
  const handleLogout = onLogout || logout;

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const currentQuery = searchParams.get('query') || searchParams.get('search') || '';
  const [searchTerm, setSearchTerm] = React.useState(currentQuery);

  React.useEffect(() => {
    setSearchTerm(currentQuery);
  }, [currentQuery]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (location.pathname === '/scenarios' || location.pathname === '/') {
      const newParams = new URLSearchParams(searchParams);
      if (value.trim()) {
        newParams.set('query', value);
      } else {
        newParams.delete('query');
        newParams.delete('search');
      }
      setSearchParams(newParams, { replace: true });
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchTerm.trim();
    if (location.pathname !== '/scenarios') {
      navigate(trimmed ? `/scenarios?query=${encodeURIComponent(trimmed)}` : '/scenarios');
    } else {
      const newParams = new URLSearchParams(searchParams);
      if (trimmed) {
        newParams.set('query', trimmed);
      } else {
        newParams.delete('query');
        newParams.delete('search');
      }
      setSearchParams(newParams, { replace: true });
    }
  };

  // Đồng bộ propUser hoặc authUser vào currentUser
  React.useEffect(() => {
    if (propUser !== undefined) {
      setCurrentUser(propUser);
      return;
    }
    if (authUser) {
      setCurrentUser((prev) => {
        if (!prev) return authUser;
        return {
          ...authUser,
          creditBalance: typeof prev.creditBalance === 'number' && prev.creditBalance > 0
            ? prev.creditBalance
            : (authUser.creditBalance ?? prev.creditBalance),
        };
      });
    } else {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        try {
          setCurrentUser(JSON.parse(saved));
        } catch {
          setCurrentUser(null);
        }
      }
    }
  }, [authUser, propUser]);

  // Luôn chủ động đồng bộ số dư credit từ máy chủ khi Header mount
  React.useEffect(() => {
    const token = localStorage.getItem('jcap_token');
    if (token) {
      creditService.getHistory(1, 1).then((res) => {
        if (res.success && res.data && typeof res.data.currentCreditBalance === 'number') {
          creditService.updateLocalCreditBalance(res.data.currentCreditBalance);
          setCurrentUser((prev) => ({
            ...(prev || authUser || {}),
            creditBalance: res.data!.currentCreditBalance,
          } as User));
        }
      }).catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    const handleProfileUpdated = (event: any) => {
      const detail = event.detail;
      if (detail) {
        setCurrentUser((prev) => ({
          ...(prev || authUser || {}),
          id: detail.id || prev?.id || authUser?.id || '',
          email: detail.email || prev?.email || authUser?.email || '',
          role: detail.role || prev?.role || authUser?.role || 'Learner',
          fullName: detail.fullName !== undefined ? detail.fullName : (prev?.fullName || authUser?.fullName),
          level: detail.jlptLevel || detail.level || prev?.level || authUser?.level,
          avatarUrl: detail.profilePictureUrl || detail.avatarUrl || prev?.avatarUrl || authUser?.avatarUrl,
          creditBalance: typeof detail.creditBalance === 'number' ? detail.creditBalance : (prev?.creditBalance ?? authUser?.creditBalance),
        }));
      }
    };

    window.addEventListener('jcap_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('jcap_profile_updated', handleProfileUpdated);
  }, [authUser]);

  // Tính số dư credit thực tế hiển thị
  const displayCredit = React.useMemo(() => {
    if (typeof currentUser?.creditBalance === 'number') {
      return currentUser.creditBalance;
    }
    if (typeof authUser?.creditBalance === 'number') {
      return authUser.creditBalance;
    }
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (typeof u.creditBalance === 'number') return u.creditBalance;
      }
    } catch {}
    return 0;
  }, [currentUser?.creditBalance, authUser?.creditBalance]);

  const user = propUser !== undefined ? propUser : (currentUser || authUser);

  return (
    <header className="h-[64px] bg-white border-b border-[#E6EDF5] flex items-center justify-between px-8 sticky top-0 z-40">
      {/* Left: Logo/Brand */}
      <div className="flex items-center gap-4">
        <Link to="/" className="text-2xl font-bold text-[#0878EE] tracking-tight">
          JCAP
        </Link>
      </div>

      {/* Center: Search */}
      <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-[#71809A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-[#E6EDF5] rounded-lg leading-5 bg-gray-50 placeholder-[#71809A] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0878EE] focus:border-[#0878EE] sm:text-sm transition-colors"
            placeholder="Tìm kiếm khóa học, bài học..."
          />
        </div>
      </form>

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-4 sm:gap-6">
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

        {/* User Account Info & Credit Badge */}
        {user && (
          <div className="flex items-center gap-3 border-l border-[#E6EDF5] pl-6">
            {/* Credit Balance Badge */}
            <Link
              to="/credits"
              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs group"
              title="Nhấn để nạp thêm credit"
            >
              <span className="text-amber-600 group-hover:scale-110 transition-transform">🪙</span>
              <span>{displayCredit}</span>
              <span className="hidden sm:inline text-amber-700 font-medium">Credits</span>
            </Link>

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
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl py-1.5 border border-[#E6EDF5] hidden group-hover:block z-50">
                <div className="px-4 py-2 border-b border-gray-100 sm:hidden">
                  <p className="text-xs font-semibold text-[#071A44] truncate">{user.fullName || user.email}</p>
                  <p className="text-[11px] text-amber-600 font-bold mt-0.5">🪙 {displayCredit} Credits</p>
                </div>
                <Link to="/profile" className="flex items-center gap-2 px-4 py-2 text-xs text-[#071A44] hover:bg-slate-50 transition-colors">
                  <span>👤</span> Hồ sơ cá nhân
                </Link>
                <Link to="/credits" className="flex items-center gap-2 px-4 py-2 text-xs text-[#0878EE] font-medium hover:bg-blue-50 transition-colors">
                  <span>🪙</span> Nạp thêm Credit
                </Link>
                <Link to="/credits/history" className="flex items-center gap-2 px-4 py-2 text-xs text-[#071A44] hover:bg-slate-50 transition-colors">
                  <span>📋</span> Lịch sử giao dịch
                </Link>
                <div className="border-t border-gray-100 my-1"></div>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 text-xs text-[#D92D20] hover:bg-red-50 transition-colors"
                >
                  <span>🚪</span> Đăng xuất
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
