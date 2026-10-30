// ============================================================================
// Mock Store cho Quản lý & Cài đặt Thông báo Hệ thống (Admin Notification Config)
// - Hỗ trợ chọn nhiều nơi hiển thị (Multi-placement: Trang chủ/Dashboard, Hội thoại, Shadowing...)
// - Hỗ trợ cài đặt thời gian xuất hiện / thời gian tắt (Không bắt buộc: bỏ trống sẽ auto hiện)
// - Hỗ trợ người xem bấm: Đóng (tắt trong phiên), Ẩn 6 tiếng, Ẩn 24 tiếng
// ============================================================================

export type NotificationStyleType = 'ANNOUNCEMENT' | 'MAINTENANCE' | 'PROMOTION';

export type NotificationPlacementKey =
  | 'HOME_DASHBOARD'
  | 'SCENARIOS'
  | 'SHADOWING'
  | 'EXPLORE'
  | 'CREDITS'
  | 'FEEDBACK'
  | 'USERS';

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  styleType: NotificationStyleType;
  placements: NotificationPlacementKey[];
  /** ISO string hoặc chuỗi datetime-local (YYYY-MM-DDTHH:mm). Rỗng/undefined = hiện ngay lập tức */
  startAt?: string;
  /** ISO string hoặc chuỗi datetime-local (YYYY-MM-DDTHH:mm). Rỗng/undefined = không giới hạn thời gian tắt */
  endAt?: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ComputedNotificationStatus = 'ACTIVE_NOW' | 'SCHEDULED' | 'EXPIRED' | 'DISABLED';

export const STYLE_TYPE_META: Record<
  NotificationStyleType,
  {
    label: string;
    defaultTitle: string;
    headerGradient: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    primaryBtnBg: string;
    outlineBtnText: string;
    outlineBtnBorder: string;
    accentColor: string;
  }
> = {
  ANNOUNCEMENT: {
    label: 'Thông báo chung',
    defaultTitle: 'THÔNG BÁO',
    headerGradient: 'from-[#1D63DC] to-[#2575FC]',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    primaryBtnBg: 'bg-[#2563EB] hover:bg-[#1D4ED8]',
    outlineBtnText: 'text-[#2563EB]',
    outlineBtnBorder: 'border-[#93C5FD] hover:bg-blue-50',
    accentColor: '#2563EB',
  },
  MAINTENANCE: {
    label: 'Bảo trì chức năng',
    defaultTitle: 'THÔNG BÁO BẢO TRÌ',
    headerGradient: 'from-[#D97706] to-[#F59E0B]',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    primaryBtnBg: 'bg-[#D97706] hover:bg-[#B45309]',
    outlineBtnText: 'text-[#D97706]',
    outlineBtnBorder: 'border-[#FCD34D] hover:bg-amber-50',
    accentColor: '#D97706',
  },
  PROMOTION: {
    label: 'Sự kiện / Ưu đãi',
    defaultTitle: 'THÔNG BÁO SỰ KIỆN',
    headerGradient: 'from-[#E11D48] to-[#F43F5E]',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200',
    primaryBtnBg: 'bg-[#E11D48] hover:bg-[#BE123C]',
    outlineBtnText: 'text-[#E11D48]',
    outlineBtnBorder: 'border-[#FDA4AF] hover:bg-rose-50',
    accentColor: '#E11D48',
  },
};

export interface PlacementMeta {
  key: NotificationPlacementKey;
  label: string;
  description: string;
  icon: string;
  adminPathPrefixes: string[];
  adminNavigatePath: string;
}

export const PLACEMENT_OPTIONS: PlacementMeta[] = [
  {
    key: 'HOME_DASHBOARD',
    label: 'Trang chủ / Dashboard',
    description: 'Hiện ngay khi mở trang Tổng quan Dashboard',
    icon: '🏠',
    adminPathPrefixes: ['/admin/dashboard'],
    adminNavigatePath: '/admin/dashboard',
  },
  {
    key: 'SCENARIOS',
    label: 'Kịch bản Hội thoại AI',
    description: 'Hiện khi vào mục Kịch bản Hội thoại / Roleplay',
    icon: '💬',
    adminPathPrefixes: ['/admin/scenarios'],
    adminNavigatePath: '/admin/scenarios',
  },
  {
    key: 'SHADOWING',
    label: 'Luyện nói Shadowing & Âm thanh',
    description: 'Hiện khi vào mục Quản lý Shadowing hoặc Kho âm thanh',
    icon: '🎧',
    adminPathPrefixes: ['/admin/shadowing', '/admin/audio'],
    adminNavigatePath: '/admin/shadowing',
  },
  {
    key: 'EXPLORE',
    label: 'Bản đồ Khám phá',
    description: 'Hiện khi vào mục Bản đồ Khám phá 47 tỉnh thành',
    icon: '🗾',
    adminPathPrefixes: ['/admin/explore'],
    adminNavigatePath: '/admin/explore',
  },
  {
    key: 'CREDITS',
    label: 'Gói nạp & Credit',
    description: 'Hiện khi vào mục Quản lý Gói và Credit',
    icon: '🪙',
    adminPathPrefixes: ['/admin/credits'],
    adminNavigatePath: '/admin/credits/packages',
  },
  {
    key: 'FEEDBACK',
    label: 'Hòm thư Góp ý',
    description: 'Hiện khi vào mục Hòm thư Góp ý & Hỗ trợ',
    icon: '📬',
    adminPathPrefixes: ['/admin/feedback'],
    adminNavigatePath: '/admin/feedback',
  },
  {
    key: 'USERS',
    label: 'Quản lý Học viên',
    description: 'Hiện khi vào mục Quản lý tài khoản Học viên',
    icon: '👥',
    adminPathPrefixes: ['/admin/users'],
    adminNavigatePath: '/admin/users',
  },
];

export const PLACEMENT_MAP: Record<NotificationPlacementKey, PlacementMeta> = PLACEMENT_OPTIONS.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<NotificationPlacementKey, PlacementMeta>,
);

const STORAGE_KEY = 'jcap_admin_notifications_mock_v1';
const DISMISS_STORAGE_KEY = 'jcap_admin_notifications_dismissed_v1';
const SESSION_CLOSED_KEY = 'jcap_admin_notifications_session_closed_v1';

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'NOTIF-1001',
    title: 'THÔNG BÁO',
    content:
      'Hệ thống JCAP vừa cập nhật bộ dữ liệu Bản đồ Khám phá Nhật Bản và nâng cấp tốc độ phản hồi hội thoại AI.\nMọi thắc mắc hoặc góp ý vui lòng gửi tại Hòm thư Góp ý hoặc liên hệ nhóm hỗ trợ:\nhttps://jcap.edu.vn/support-community',
    styleType: 'ANNOUNCEMENT',
    placements: ['HOME_DASHBOARD'],
    startAt: '',
    endAt: '',
    isEnabled: true,
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
  },
  {
    id: 'NOTIF-1002',
    title: 'THÔNG BÁO BẢO TRÌ',
    content:
      'Chức năng tổng hợp giọng nói VoiceVox cho bài luyện Shadowing và Kịch bản Hội thoại sẽ bảo trì định kỳ từ 23:30 đến 00:15 tối nay để nâng cấp máy chủ âm thanh.\nTrong thời gian này, việc tạo audio mới có thể chậm hơn bình thường.',
    styleType: 'MAINTENANCE',
    placements: ['SCENARIOS', 'SHADOWING'],
    startAt: '',
    endAt: '',
    isEnabled: true,
    createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
  },
  {
    id: 'NOTIF-1003',
    title: 'BẢO TRÌ CỔNG THANH TOÁN',
    content:
      'Cổng thanh toán QR PayOS đang được kiểm tra đối soát định kỳ. Vui lòng kiểm tra kỹ bảng giá gói Credit trước khi điều chỉnh.',
    styleType: 'MAINTENANCE',
    placements: ['CREDITS'],
    startAt: '',
    endAt: '',
    isEnabled: false,
    createdAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
  },
];

function emitChange() {
  window.dispatchEvent(new CustomEvent('jcap_notifications_updated'));
}

export function getNotifications(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_NOTIFICATIONS));
      return [...DEFAULT_NOTIFICATIONS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.error('Lỗi đọc mock notifications:', e);
  }
  return [...DEFAULT_NOTIFICATIONS];
}

function saveNotifications(list: NotificationItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    emitChange();
  } catch (e) {
    console.error('Lỗi lưu mock notifications:', e);
  }
}

export function computeNotificationStatus(
  item: NotificationItem,
  nowMs: number = Date.now(),
): ComputedNotificationStatus {
  if (!item.isEnabled) return 'DISABLED';

  if (item.startAt && item.startAt.trim() !== '') {
    const startMs = new Date(item.startAt).getTime();
    if (!Number.isNaN(startMs) && nowMs < startMs) {
      return 'SCHEDULED';
    }
  }

  if (item.endAt && item.endAt.trim() !== '') {
    const endMs = new Date(item.endAt).getTime();
    if (!Number.isNaN(endMs) && nowMs > endMs) {
      return 'EXPIRED';
    }
  }

  return 'ACTIVE_NOW';
}

export function resolvePlacementFromAdminPath(pathname: string): NotificationPlacementKey | null {
  for (const option of PLACEMENT_OPTIONS) {
    if (option.adminPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) {
      return option.key;
    }
  }
  return null;
}

interface DismissRecord {
  untilMs: number;
  updatedAtVersion: string;
}

function getDismissMap(): Record<string, DismissRecord> {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function getSessionClosedMap(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(SESSION_CLOSED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

/**
 * Đóng thông báo:
 * - hours = 0: Chỉ đóng tạm thời cho phiên hiện tại tại vị trí đó (`key = notifId:placement`)
 * - hours > 0 (VD: 6 hoặc 24): Ẩn trong `hours` tiếng (lưu vào localStorage)
 */
export function dismissNotification(
  notification: NotificationItem,
  placement: NotificationPlacementKey,
  hours: 0 | 6 | 24,
) {
  const compositeKey = `${notification.id}__${placement}`;

  if (hours === 0) {
    try {
      const map = getSessionClosedMap();
      map[compositeKey] = notification.updatedAt;
      sessionStorage.setItem(SESSION_CLOSED_KEY, JSON.stringify(map));
    } catch {}
    emitChange();
    return;
  }

  try {
    const map = getDismissMap();
    map[compositeKey] = {
      untilMs: Date.now() + hours * 3600 * 1000,
      updatedAtVersion: notification.updatedAt,
    };
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
  emitChange();
}

/**
 * Xoá toàn bộ lịch sử bấm "Đóng / Ẩn 6h / Ẩn 24h" để Admin có thể test lại tất cả Popup ngay lập tức
 */
export function clearAllDismissals() {
  try {
    localStorage.removeItem(DISMISS_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_CLOSED_KEY);
  } catch {}
  emitChange();
}

export function getActiveNotificationsForPlacement(
  placement: NotificationPlacementKey,
  nowMs: number = Date.now(),
): NotificationItem[] {
  const all = getNotifications();
  const dismissMap = getDismissMap();
  const sessionMap = getSessionClosedMap();

  return all.filter((item) => {
    if (!item.placements.includes(placement)) return false;
    if (computeNotificationStatus(item, nowMs) !== 'ACTIVE_NOW') return false;

    const compositeKey = `${item.id}__${placement}`;

    // Kiểm tra đóng trong phiên (nếu Admin vừa cập nhật lại thông báo thì updatedAt mới sẽ tự hiện lại)
    if (sessionMap[compositeKey] && sessionMap[compositeKey] === item.updatedAt) {
      return false;
    }

    // Kiểm tra ẩn 6 tiếng / 24 tiếng
    const dismissRecord = dismissMap[compositeKey];
    if (
      dismissRecord &&
      dismissRecord.updatedAtVersion === item.updatedAt &&
      nowMs < dismissRecord.untilMs
    ) {
      return false;
    }

    return true;
  });
}

export function createNotification(
  input: Omit<NotificationItem, 'id' | 'createdAt' | 'updatedAt'>,
): NotificationItem {
  const list = getNotifications();
  const nowIso = new Date().toISOString();
  const newItem: NotificationItem = {
    ...input,
    id: `NOTIF-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  saveNotifications([newItem, ...list]);
  return newItem;
}

export function updateNotification(
  id: string,
  patch: Partial<Omit<NotificationItem, 'id' | 'createdAt'>>,
): NotificationItem | null {
  const list = getNotifications();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  const updated: NotificationItem = {
    ...list[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  saveNotifications(list);
  return updated;
}

export function deleteNotification(id: string): boolean {
  const list = getNotifications();
  const filtered = list.filter((x) => x.id !== id);
  if (filtered.length === list.length) return false;
  saveNotifications(filtered);
  return true;
}

export function resetDefaultNotifications() {
  saveNotifications([...DEFAULT_NOTIFICATIONS]);
  clearAllDismissals();
}

