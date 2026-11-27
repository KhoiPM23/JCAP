import type { FeedbackMessage, FeedbackStatus, FeedbackTicket } from '../../services/feedbackService';

export type TicketFilter = 'ALL' | FeedbackStatus;
export type Viewer = 'learner' | 'admin';

const time = (iso: string) => new Date(iso).getTime();

/** Phiếu sự cố (không gồm góp ý), mới cập nhật đứng trước */
export const supportTickets = (tickets: FeedbackTicket[]) =>
  tickets.filter((t) => t.category !== 'SUGGESTION').sort((a, b) => time(b.updatedAt) - time(a.updatedAt));

/** Góp ý một chiều, mới gửi đứng trước */
export const suggestionTickets = (tickets: FeedbackTicket[]) =>
  tickets.filter((t) => t.category === 'SUGGESTION').sort((a, b) => time(b.createdAt) - time(a.createdAt));

export function countByStatus(tickets: FeedbackTicket[]): Record<TicketFilter, number> {
  const counts: Record<TicketFilter, number> = { ALL: tickets.length, PENDING: 0, IN_PROGRESS: 0, CLOSED: 0 };
  for (const t of tickets) counts[t.status] += 1;
  return counts;
}

/** Lọc theo trạng thái; query (admin) tìm trong mã phiếu và tiêu đề */
export function filterTickets(tickets: FeedbackTicket[], filter: TicketFilter, query = ''): FeedbackTicket[] {
  const q = query.trim().toLowerCase();
  return tickets.filter(
    (t) =>
      (filter === 'ALL' || t.status === filter) &&
      (!q || t.title.toLowerCase().includes(q) || t.anonymousCode.toLowerCase().includes(q)),
  );
}

export type TimelineItem =
  | { type: 'message'; key: string; at: string; message: FeedbackMessage }
  | { type: 'event'; key: string; at: string; text: string };

/**
 * Tin nhắn xen với các mốc có thật trong dữ liệu: admin xem phiếu lần đầu, phiếu đóng.
 * Server không lưu thời điểm mở lại (và xoá ngày đóng khi mở lại) nên không có mốc "mở lại".
 */
export function buildTimeline(ticket: FeedbackTicket): TimelineItem[] {
  const items: (TimelineItem & { order: number })[] = ticket.messages.map((m) => ({
    type: 'message',
    key: `m-${m.id}`,
    at: m.createdAt,
    message: m,
    order: 1,
  }));
  // Mốc "đã xem" đứng trước câu trả lời cùng lúc; mốc "đã đóng" đứng sau cùng
  if (ticket.adminSeenAt) items.push({ type: 'event', key: 'seen', at: ticket.adminSeenAt, text: 'Admin đã xem phiếu', order: 0 });
  if (ticket.status === 'CLOSED' && ticket.closedAt)
    items.push({ type: 'event', key: 'closed', at: ticket.closedAt, text: 'Phiếu đã đóng', order: 2 });
  return items.sort((a, b) => time(a.at) - time(b.at) || a.order - b.order);
}

/** Id tin mới nhất do phía bên kia gửi (để báo "vừa trả lời") */
export function lastIncomingId(ticket: FeedbackTicket, viewer: Viewer): number {
  const other = viewer === 'learner' ? 'ADMIN' : 'LEARNER';
  return ticket.messages.reduce((max, m) => (m.senderRole === other && m.id > max ? m.id : max), 0);
}
