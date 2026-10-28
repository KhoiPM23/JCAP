/**
 * Phiên Hội thoại AI gần nhất người học vào (chỉ để thanh bên hiện mục "đang dở"; không có API liệt kê phiên đang dở).
 * Phòng hội thoại ghi lại khi mở phiên; thanh bên hỏi lại trạng thái thật bằng roleplayService.getSession.
 */
const KEY = 'jcap.recentRoleplaySession';

export function rememberRoleplaySession(sessionId: number) {
  try {
    localStorage.setItem(KEY, String(sessionId));
  } catch {
    /* không lưu được thì thôi */
  }
}

export function recentRoleplaySessionId(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function forgetRoleplaySession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}
