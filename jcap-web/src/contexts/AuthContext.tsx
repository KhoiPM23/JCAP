import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, RegisterPayload, RegisterResponseDto } from '../types/auth';
import { authService } from '../services/authService';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  userLevel: string;
  loginError: string | null;
  registerError: string | null;
  googleError: string | null;
  clearLoginError: () => void;
  clearRegisterError: () => void;
  clearGoogleError: () => void;
  setUserLevel: (level: string) => void;
  login: (email: string, password: string, level?: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<RegisterResponseDto>;
  logout: () => Promise<void>;
  loginWithGoogle: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Khôi phục thông tin user đã lưu trong localStorage (nếu có) để F5 không bị mất phiên
  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('jcap_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('jcap_token'));
  const [userLevel, setUserLevelState] = useState<string>(() => localStorage.getItem('jcap_level') || 'N5');

  // Nếu đã có sẵn cả user và token từ localStorage thì không cần hiện màn hình loading xoay vòng
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isGoogleCallback = window.location.pathname === '/scenarios' && urlParams.has('token');
    const hasGoogleError = window.location.pathname === '/login' && urlParams.has('error');
    if (isGoogleCallback || hasGoogleError) return true;
    if (localStorage.getItem('jcap_user') && localStorage.getItem('jcap_token')) return false;
    return !!localStorage.getItem('jcap_token');
  });

  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const clearLoginError = useCallback(() => {
    setLoginError(null);
  }, []);

  const clearRegisterError = useCallback(() => {
    setRegisterError(null);
  }, []);

  const clearGoogleError = useCallback(() => {
    setGoogleError(null);
  }, []);

  // Hàm tiện ích lưu phiên đăng nhập đồng bộ vào cả React State và localStorage
  const saveSession = useCallback((userData: User, tokenStr?: string, levelStr?: string) => {
    setUser(userData);
    localStorage.setItem('jcap_user', JSON.stringify(userData));

    if (tokenStr) {
      setToken(tokenStr);
      localStorage.setItem('jcap_token', tokenStr);
    }
    if (levelStr) {
      setUserLevelState(levelStr);
      localStorage.setItem('jcap_level', levelStr);
    }
  }, []);

  const setUserLevel = useCallback((level: string) => {
    setUserLevelState(level);
    localStorage.setItem('jcap_level', level);
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, level };
      localStorage.setItem('jcap_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // 2. Tự động khôi phục phiên đăng nhập hoặc xử lý callback từ Google OAuth
  useEffect(() => {
    const initAuth = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const isGoogleCallback = window.location.pathname === '/scenarios' && urlParams.has('token');
        const googleToken = isGoogleCallback ? urlParams.get('token') : null;
        const googleError = window.location.pathname === '/login' ? urlParams.get('error') : null;
        const googleUserId = urlParams.get('userId');
        const googleEmail = urlParams.get('email');
        const googleFullName = urlParams.get('fullName');
        const googleRole = urlParams.get('role');

        let activeToken = token;

        if (googleError) {
          setGoogleError(decodeURIComponent(googleError));
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (googleToken) {
          activeToken = googleToken;
          setGoogleError(null);
          setToken(googleToken);
          localStorage.setItem('jcap_token', googleToken);

          if (googleUserId && googleEmail) {
            const savedLevel = localStorage.getItem('jcap_level') || 'N5';
            const googleUser: User = {
              id: decodeURIComponent(googleUserId),
              email: decodeURIComponent(googleEmail),
              fullName: decodeURIComponent(googleFullName || ''),
              role: decodeURIComponent(googleRole || 'Learner'),
              level: savedLevel,
            };
            saveSession(googleUser, googleToken, savedLevel);
          }

          window.history.replaceState({}, document.title, window.location.pathname);
          setIsLoading(false);
          return;
        }

        // Xác thực ngầm (Silent Revalidation) với server
        if (activeToken) {
          const res = await authService.getCurrentUser(activeToken);
          if (res.success && res.data) {
            const savedLevel = localStorage.getItem('jcap_level') || 'N5';
            const refreshedUser: User = {
              id: res.data.userId,
              email: res.data.email,
              fullName: res.data.fullName,
              role: res.data.role,
              level: savedLevel,
            };
            saveSession(refreshedUser, activeToken, savedLevel);
          } else if (!res.success && (res.message?.includes('401') || res.message?.includes('hết hạn') || res.message?.includes('không hợp lệ'))) {
            // Chỉ xóa phiên khi server từ chối token rõ ràng
            localStorage.removeItem('jcap_token');
            localStorage.removeItem('jcap_user');
            localStorage.removeItem('jcap_current_view');
            setToken(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Lỗi kiểm tra phiên xác thực:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [saveSession]);

  // 3. Hàm Đăng nhập bằng Email & Password
  const login = async (email: string, password: string, level?: string) => {
    setLoginError(null);
    const res = await authService.login({ email, password });

    if (!res.success || !res.data) {
      const errorMsg = res.message || (res.errors && res.errors.length > 0 ? res.errors.join(', ') : 'Đăng nhập thất bại.');
      setLoginError(errorMsg);
      throw new Error(errorMsg);
    }

    const { token: jwtToken, userId, fullName, role } = res.data;
    const finalLevel = level || userLevel || 'N5';

    const userData: User = {
      id: userId,
      email,
      fullName,
      role,
      level: finalLevel,
    };

    saveSession(userData, jwtToken, finalLevel);
  };

  // 4. Hàm Đăng ký tài khoản
  const register = async (payload: RegisterPayload): Promise<RegisterResponseDto> => {
    setRegisterError(null);
    const res = await authService.register(payload);

    if (!res.success || !res.data) {
      const errorMsg = res.message || (res.errors && res.errors.length > 0 ? res.errors.join(', ') : 'Đăng ký thất bại.');
      setRegisterError(errorMsg);
      throw new Error(errorMsg);
    }

    return res.data;
  };

  // 5. Ham Dang xuat
  const logout = async () => {
    try {
      if (token) {
        await authService.logout(token);
      }
    } catch (err) {
      console.error('Loi khi goi API logout:', err);
    } finally {
      localStorage.removeItem('jcap_token');
      localStorage.removeItem('jcap_user');
      setToken(null);
      setUser(null);
      setLoginError(null);
      setRegisterError(null);
      setGoogleError(null);
    }
  };

  // 6. Hàm Đăng nhập bằng Google
  const loginWithGoogle = () => {
    window.location.href = authService.getGoogleLoginUrl();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        userLevel,
        loginError,
        registerError,
        googleError,
        clearLoginError,
        clearRegisterError,
        clearGoogleError,
        setUserLevel,
        login,
        register,
        logout,
        loginWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider!');
  }
  return context;
};

