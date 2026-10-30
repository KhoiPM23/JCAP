import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** Chế độ màu người dùng chọn (Cài đặt › Giao diện). 'system' đi theo prefers-color-scheme của máy */
export type ThemeMode = 'light' | 'dark' | 'system';
/** Khu vực giao diện: trang học viên, phòng luyện (Shadowing / Hội thoại AI), bản đồ Hành trình */
export type ThemeArea = 'learn' | 'room' | 'map';

const KEY = 'jcap.themeMode';

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* không đọc được thì dùng mặc định */
  }
  return 'light';
}

const systemPrefersDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
  /** Giá trị data-theme cho một khu vực (design-handoff mục 9b). Bản đồ luôn giữ kham-pha: chỉ phần nổi trên nó đổi theo chế độ tối */
  themeFor: (area: ThemeArea) => string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* không lưu được thì vẫn đổi trong phiên */
    }
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemDark);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode,
      isDark,
      themeFor: (area) => {
        if (area === 'room') return isDark ? 'phong-luyen-dem' : 'phong-luyen';
        if (area === 'learn') return isDark ? 'hoc-tap-dem' : 'hoc-tap';
        return 'kham-pha';
      },
    }),
    [mode, setMode, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme phải nằm trong ThemeProvider');
  return ctx;
}
