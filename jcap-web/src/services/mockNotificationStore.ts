// ============================================================================
// Mock Store cho Quản lý & Cài đặt Thông báo Hệ thống (Admin cài đặt -> Hiển thị bên Learner)
// - Admin cấu hình thông báo tại /admin/notifications
// - Thông báo hiển thị ở biểu tượng Chuông góc trên cùng bên phải màn hình Trang chủ / Hành trình (Learner)
// - Có chấm đỏ khi có thông báo chưa đọc
// - Mốc thời gian thực tế: hiển thị rõ ràng ngày giờ tạo / ngày bắt đầu / ngày kết thúc
// - Đồng bộ 2 chiều tức thời giữa 2 role (Admin lưu / sửa -> Learner nhận ngay lập tức qua CustomEvent & storage)
// ============================================================================

export type NotificationStyleType = 'ANNOUNCEMENT' | 'MAINTENANCE' | 'PROMOTION';

export type NotificationPlacementKey =
  | 'HOME_DASHBOARD'
  | 'SCENARIOS'
  | 'SHADOWING'
  | 'FLASHCARDS'
  | 'RESULTS_STAMPS'
  | 'CREDITS'
  | 'FEEDBACK'
  | 'PROFILE_SETTINGS';

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  styleType: NotificationStyleType;
  placements: NotificationPlacementKey[];
  /** Chuỗi datetime-local (YYYY-MM-DDTHH:mm) hoặc ISO string. Rỗng/undefined = hiện ngay lập tức */
  startAt?: string;
  /** Chuỗi datetime-local (YYYY-MM-DDTHH:mm) hoặc ISO string. Rỗng/undefined = không giới hạn thời gian tắt */
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
    icon: string;
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
    icon: 'campaign',
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
    icon: 'build',
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
    icon: 'celebration',
  },
};

export interface PlacementMeta {
  key: NotificationPlacementKey;
  label: string;
  description: string;
  icon: string;
  learnerPathHint: string;
  learnerPathPrefixes: string[];
}

export const PLACEMENT_OPTIONS: PlacementMeta[] = [
  {
    key: 'HOME_DASHBOARD',
    label: 'Trang chủ / Hành trình Khám phá',
    description: 'Hiện khi Học viên vào Trang chủ hoặc Bản đồ Hành trình',
    icon: '🗾',
    learnerPathHint: '/, /explore, /dashboard',
    learnerPathPrefixes: ['/explore', '/dashboard'],
  },
  {
    key: 'SCENARIOS',
    label: 'Hội thoại AI (Roleplay)',
    description: 'Hiện khi Học viên bấm vào mục Hội thoại AI',
    icon: '💬',
    learnerPathHint: '/scenarios',
    learnerPathPrefixes: ['/scenarios'],
  },
  {
    key: 'SHADOWING',
    label: 'Luyện nói Shadowing',
    description: 'Hiện khi Học viên bấm vào mục Luyện nói Shadowing',
    icon: '🎧',
    learnerPathHint: '/shadowing',
    learnerPathPrefixes: ['/shadowing'],
  },
  {
    key: 'FLASHCARDS',
    label: 'Thẻ ghi nhớ (Flashcard)',
    description: 'Hiện khi Học viên bấm vào mục Tự học Flashcard SRS',
    icon: '🃏',
    learnerPathHint: '/flashcards',
    learnerPathPrefixes: ['/flashcards'],
  },
  {
    key: 'RESULTS_STAMPS',
    label: 'Kết quả & Sổ con dấu',
    description: 'Hiện khi Học viên xem Kết quả hội thoại hoặc Sổ con dấu',
    icon: '📊',
    learnerPathHint: '/roleplay/results, /stamps',
    learnerPathPrefixes: ['/roleplay/results', '/stamps'],
  },
  {
    key: 'CREDITS',
    label: 'Gói Hội viên & Nạp Credit',
    description: 'Hiện khi Học viên vào trang Số dư, Gói học hoặc Nạp Credit',
    icon: '🪙',
    learnerPathHint: '/subscription, /credits',
    learnerPathPrefixes: ['/subscription', '/credits'],
  },
  {
    key: 'FEEDBACK',
    label: 'Góp ý ẩn danh',
    description: 'Hiện khi Học viên mở mục Góp ý ẩn danh & Hỗ trợ',
    icon: '📬',
    learnerPathHint: '/feedback, /help',
    learnerPathPrefixes: ['/feedback', '/help'],
  },
  {
    key: 'PROFILE_SETTINGS',
    label: 'Hồ sơ & Cài đặt',
    description: 'Hiện khi Học viên mở trang Hồ sơ cá nhân hoặc Cài đặt',
    icon: '⚙️',
    learnerPathHint: '/profile, /settings',
    learnerPathPrefixes: ['/profile', '/settings'],
  },
];

export const PLACEMENT_MAP: Record<NotificationPlacementKey, PlacementMeta> = PLACEMENT_OPTIONS.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<NotificationPlacementKey, PlacementMeta>,
);

const STORAGE_KEY = 'jcap_learner_notifications_mock_v2';
const READ_STORAGE_KEY = 'jcap_learner_notifications_read_v1';

// Tạo mốc thời gian thực tế rõ ràng chuẩn ngày giờ thực
const now = new Date();
const pad = (n: number) => n.toString().padStart(2, '0');
const toLocalISOString = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const d1 = new Date(now.getTime() - 2 * 3600 * 1000); // 2 giờ trước
const d2 = new Date(now.getTime() - 5 * 3600 * 1000); // 5 giờ trước
const d2End = new Date(now.getTime() + 2 * 3600 * 1000); // 2 giờ tới
const d3 = new Date(now.getTime() - 24 * 3600 * 1000); // 1 ngày trước
const d3End = new Date(now.getTime() + 6 * 24 * 3600 * 1000); // 6 ngày tới

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'NOTIF-1001',
    title: 'Cập nhật Bản đồ Hành trình & Hội thoại AI',
    content:
      'Hệ thống vừa cập nhật thêm dữ liệu địa danh mới trên Bản đồ Hành trình và tối ưu hóa độ trễ phản hồi hội thoại AI.\nTham gia cộng đồng học viên để chia sẻ kinh nghiệm học tập:\nhttps://jcap.edu.vn/support-community',
    styleType: 'ANNOUNCEMENT',
    placements: ['HOME_DASHBOARD'],
    startAt: toLocalISOString(d1),
    endAt: '',
    isEnabled: true,
    createdAt: d1.toISOString(),
    updatedAt: d1.toISOString(),
  },
  {
    id: 'NOTIF-1002',
    title: 'Bảo trì máy chủ âm thanh VoiceVox',
    content:
      'Hệ thống tổng hợp giọng nói AI cho bài tập Shadowing và Hội thoại đang được nâng cấp máy chủ định kỳ nhằm tăng tốc độ tải âm thanh.\nThời gian dự kiến kết thúc vào lúc ' +
      d2End.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
      '. Rất mong các bạn học viên thông cảm!',
    styleType: 'MAINTENANCE',
    placements: ['HOME_DASHBOARD', 'SCENARIOS', 'SHADOWING'],
    startAt: toLocalISOString(d2),
    endAt: toLocalISOString(d2End),
    isEnabled: true,
    createdAt: d2.toISOString(),
    updatedAt: d2.toISOString(),
  },
  {
    id: 'NOTIF-1003',
    title: 'Sự kiện Tuần lễ Tích lũy Credit Mùa Đông',
    content:
      'Hoàn thành 3 bài luyện Shadowing hoặc kích hoạt gói Hội viên trong tuần để nhận ngay 50 Credit thưởng vào tài khoản.\nXem chi tiết điều kiện tại mục Gói & Credit!',
    styleType: 'PROMOTION',
    placements: ['HOME_DASHBOARD', 'CREDITS'],
    startAt: toLocalISOString(d3),
    endAt: toLocalISOString(d3End),
    isEnabled: true,
    createdAt: d3.toISOString(),
    updatedAt: d3.toISOString(),
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

/**
 * Lấy danh sách ID các thông báo đã đọc bên Học viên
 */
export function getReadNotificationIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/**
 * Đánh dấu thông báo là đã đọc
 */
export function markNotificationAsRead(id: string) {
  try {
    const ids = getReadNotificationIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids));
      emitChange();
    }
  } catch (e) {
    console.error('Lỗi lưu read state:', e);
  }
}

/**
 * Đánh dấu tất cả thông báo đang hoạt động là đã đọc
 */
export function markAllNotificationsAsRead() {
  try {
    const active = getActiveLearnerNotifications();
    const ids = active.map((n) => n.id);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids));
    emitChange();
  } catch (e) {
    console.error('Lỗi lưu markAllAsRead:', e);
  }
}

/**
 * Đặt lại trạng thái đọc (để test)
 */
export function clearAllReadStatus() {
  try {
    localStorage.removeItem(READ_STORAGE_KEY);
    emitChange();
  } catch {}
}

/**
 * Lấy tất cả thông báo đang có hiệu lực dành cho Học viên
 */
export function getActiveLearnerNotifications(nowMs: number = Date.now()): NotificationItem[] {
  const all = getNotifications();
  return all
    .filter((item) => computeNotificationStatus(item, nowMs) === 'ACTIVE_NOW')
    .sort((a, b) => {
      const timeA = a.startAt ? new Date(a.startAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.startAt ? new Date(b.startAt).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
}

/**
 * Đếm số lượng thông báo chưa đọc bên Học viên
 */
export function getUnreadNotificationCount(nowMs: number = Date.now()): number {
  const active = getActiveLearnerNotifications(nowMs);
  const readIds = getReadNotificationIds();
  return active.filter((item) => !readIds.includes(item.id)).length;
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
  clearAllReadStatus();
}
