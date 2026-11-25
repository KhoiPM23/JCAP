import type { FeedbackCategory, FeedbackTicket } from '../../services/feedbackService';
import type { TicketFilter, Viewer } from './thread';

export interface StatusView {
  label: string;
  icon: string;
  tone: 'pending' | 'active' | 'closed';
}

/** Trạng thái luôn có icon kèm chữ. Danh sách của học viên nói rõ phiếu đang chờ đã được xem chưa. */
export function statusView(ticket: FeedbackTicket, inLearnerList = false): StatusView {
  if (ticket.status === 'CLOSED') return { label: 'Đã đóng', icon: 'check_circle', tone: 'closed' };
  if (ticket.status === 'IN_PROGRESS') return { label: 'Đang trò chuyện', icon: 'forum', tone: 'active' };
  if (inLearnerList)
    return ticket.adminSeenAt
      ? { label: 'Admin đã xem', icon: 'visibility', tone: 'pending' }
      : { label: 'Chờ tiếp nhận', icon: 'schedule', tone: 'pending' };
  return { label: 'Chờ Admin phản hồi', icon: 'hourglass_top', tone: 'pending' };
}

export const CATEGORIES: Record<FeedbackCategory, { label: string; icon: string; use: string }> = {
  PAYMENT_CREDIT: { label: 'Gói học & Credit', icon: 'toll', use: 'Thanh toán, cộng hoặc trừ Credit' },
  SYSTEM_BUG: { label: 'Lỗi kỹ thuật / Hệ thống', icon: 'bug_report', use: 'Micro, trình duyệt, trang không chạy' },
  SCENARIO_BUG: { label: 'Lỗi kịch bản / Nội dung', icon: 'edit_note', use: 'Sai chữ, thiếu furigana, nội dung bài học' },
  AI_ASSESSMENT: { label: 'Chấm điểm AI & Giọng nói', icon: 'graphic_eq', use: 'Chấm sai nhiệm vụ, nhận dạng giọng nói' },
  SUGGESTION: { label: 'Đề xuất & Góp ý', icon: 'lightbulb', use: 'Góp ý một chiều' },
};

export const SUPPORT_CATEGORIES: FeedbackCategory[] = ['PAYMENT_CREDIT', 'SYSTEM_BUG', 'SCENARIO_BUG', 'AI_ASSESSMENT'];

export const FILTERS: { id: TicketFilter; label: string }[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'PENDING', label: 'Chờ' },
  { id: 'IN_PROGRESS', label: 'Đang xử lý' },
  { id: 'CLOSED', label: 'Đã đóng' },
];

/** Tên người gửi ở phía bên kia; admin chỉ thấy mã ẩn danh */
export const otherName = (viewer: Viewer, code: string) => (viewer === 'learner' ? 'Ban Quản trị Hỗ trợ' : `Học viên ${code}`);

/** "5 phút trước"; quá một tuần thì ngày giờ */
export function supportTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const min = Math.floor((now - date.getTime()) / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} ngày trước`;
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
