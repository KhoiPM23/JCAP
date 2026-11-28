/**
 * Phiên Hội thoại AI gần nhất người học vào (chỉ để thanh bên hiện mục "đang dở"; không có API liệt kê phiên đang dở).
 * Phòng hội thoại ghi lại khi mở phiên; thanh bên hỏi lại trạng thái thật bằng roleplayService.getSession.
 */
const KEY = 'jcap.recentRoleplaySession';

interface StoredRecentRoleplay {
  userId: string;
  sessionId: number;
}

export function rememberRoleplaySession(sessionId: number, userId?: string | null) {
  if (!Number.isFinite(sessionId) || sessionId <= 0 || !userId?.trim()) return;
  try {
    const payload: StoredRecentRoleplay = { userId: userId.trim(), sessionId };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* không lưu được thì thôi */
  }
}

export function recentRoleplaySessionId(userId?: string | null): number | null {
  if (!userId?.trim()) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRecentRoleplay> | number;
    if (typeof parsed !== 'object' || parsed === null) {
      // Dữ liệu kiểu cũ không gắn userId -> dọn luôn để không rò chéo tài khoản
      localStorage.removeItem(KEY);
      return null;
    }
    if (parsed.userId !== userId.trim()) return null;
    const sid = Number(parsed.sessionId);
    return Number.isFinite(sid) && sid > 0 ? sid : null;
  } catch {
    return null;
  }
}

export function forgetRoleplaySession(userId?: string | null) {
  try {
    if (!userId?.trim()) {
      localStorage.removeItem(KEY);
      return;
    }
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<StoredRecentRoleplay> | number;
    if (typeof parsed !== 'object' || parsed === null || parsed.userId === userId.trim()) {
      localStorage.removeItem(KEY);
    }
  } catch {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  }
}
