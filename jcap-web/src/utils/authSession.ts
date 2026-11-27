import type { User } from '../types/auth';

export interface StoredAuthSession {
  user: User | null;
  token: string | null;
}

export interface AuthErrorLike {
  success: boolean;
  statusCode?: number;
  message?: string;
}

export function isValidStoredUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.email === 'string' &&
    candidate.email.trim().length > 0
  );
}

export function clearStoredAuthSession(storage?: Pick<Storage, 'removeItem'>): void {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!target) return;
  target.removeItem('jcap_token');
  target.removeItem('jcap_user');
  target.removeItem('jcap_current_view');
}

export function readStoredAuthSession(
  storage?: Pick<Storage, 'getItem' | 'removeItem'>
): StoredAuthSession {
  const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!target) {
    return { user: null, token: null };
  }

  const rawToken = target.getItem('jcap_token');
  const token = rawToken && rawToken.trim().length > 0 ? rawToken.trim() : null;
  const rawUser = target.getItem('jcap_user');

  // Có jcap_user nhưng không có token -> phiên "ma", dọn sạch để tránh vào trang chủ rỗng
  if (!token) {
    if (rawUser !== null || rawToken !== null) {
      clearStoredAuthSession(target);
    }
    return { user: null, token: null };
  }

  if (!rawUser) {
    return { user: null, token };
  }

  try {
    const parsed: unknown = JSON.parse(rawUser);
    if (isValidStoredUser(parsed)) {
      return { user: parsed, token };
    }
  } catch {
    // JSON hỏng -> rơi xuống xóa jcap_user bên dưới
  }

  target.removeItem('jcap_user');
  return { user: null, token };
}

export function shouldClearSessionOnAuthError(res: AuthErrorLike): boolean {
  if (res.success) {
    return false;
  }

  if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 404) {
    return true;
  }

  const msg = (res.message || '').toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('404') ||
    msg.includes('hết hạn') ||
    msg.includes('không hợp lệ') ||
    msg.includes('không tìm thấy thông tin người dùng') ||
    msg.includes('tài khoản của bạn đã bị khóa')
  );
}

export function isEmailConfirmationReturn(pathname: string, search: string): boolean {
  if (pathname !== '/login') {
    return false;
  }
  const params = new URLSearchParams(search);
  return params.has('confirmed');
}

export function shouldBypassPublicRouteRedirect(pathname: string, search: string): boolean {
  if (pathname === '/reset-password') {
    return true;
  }
  if (pathname !== '/login') {
    return false;
  }
  const params = new URLSearchParams(search);
  return params.has('confirmed') || params.get('reset') === 'true';
}
