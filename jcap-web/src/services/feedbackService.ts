import type { ApiResponse } from '../types/auth';

export type FeedbackCategory =
  | 'SCENARIO_BUG'
  | 'AI_ASSESSMENT'
  | 'PAYMENT_CREDIT'
  | 'SYSTEM_BUG'
  | 'SUGGESTION';

export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'CLOSED';

export interface FeedbackAttachment {
  id: number | string;
  fileName: string;
  fileSize: number;
  fileType: 'IMAGE' | 'FILE';
  mimeType: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
}

export interface FeedbackMessage {
  id: number;
  ticketId: number;
  senderRole: 'LEARNER' | 'ADMIN';
  content: string;
  attachments: FeedbackAttachment[];
  createdAt: string;
}

export interface FeedbackTicket {
  id: number;
  anonymousCode: string;
  title: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  adminSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  messages: FeedbackMessage[];
}

export interface CreateFeedbackTicketPayload {
  title: string;
  category: FeedbackCategory;
  content: string;
  attachments: {
    fileName: string;
    fileSize: number;
    fileType: 'IMAGE' | 'FILE';
    mimeType: string;
    cloudinaryUrl: string;
    cloudinaryPublicId: string;
  }[];
}

export interface ReplyFeedbackTicketPayload {
  content: string;
  attachments: {
    fileName: string;
    fileSize: number;
    fileType: 'IMAGE' | 'FILE';
    mimeType: string;
    cloudinaryUrl: string;
    cloudinaryPublicId: string;
  }[];
}

export const STATUS_META: Record<
  FeedbackStatus,
  {
    label: string;
    learnerHint: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    dotColor: string;
  }
> = {
  PENDING: {
    label: 'Chờ Admin phản hồi',
    learnerHint: 'Bài góp ý đã được gửi ẩn danh, đang chờ Admin tiếp nhận và phản hồi.',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  IN_PROGRESS: {
    label: 'Đang trò chuyện',
    learnerHint: 'Admin đã tiếp nhận và phản hồi. Bạn có thể trao đổi tiếp bên dưới.',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    dotColor: 'bg-blue-600',
  },
  CLOSED: {
    label: 'Đã đóng',
    learnerHint: 'Admin đã xử lý xong và đóng luồng góp ý này.',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-300',
    dotColor: 'bg-slate-500',
  },
};

export const CATEGORY_META: Record<
  FeedbackCategory,
  { label: string; badgeBg: string; badgeText: string; badgeBorder: string; icon: string }
> = {
  SCENARIO_BUG: {
    label: 'Lỗi Kịch bản / Nội dung',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200',
    icon: '📖',
  },
  AI_ASSESSMENT: {
    label: 'Chấm điểm AI & Giọng nói',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
    icon: '🎙️',
  },
  PAYMENT_CREDIT: {
    label: 'Gói học & Credit',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    icon: '💳',
  },
  SYSTEM_BUG: {
    label: 'Lỗi Kỹ thuật / Hệ thống',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    badgeBorder: 'border-orange-200',
    icon: '⚙️',
  },
  SUGGESTION: {
    label: 'Đề xuất & Góp ý tính năng',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-700',
    badgeBorder: 'border-teal-200',
    icon: '💡',
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function getAuthHeaders(includeJsonContentType = true): Record<string, string> {
  const token = localStorage.getItem('jcap_token');
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const feedbackService = {
  // ================= LEARNER APIs (UC-09) =================
  async getMyTickets(): Promise<ApiResponse<FeedbackTicket[]>> {
    try {
      const res = await fetch('/api/feedback/my', {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket[]> | null;
      return data || { success: false, message: `Không thể tải danh sách góp ý (HTTP ${res.status}).` };
    } catch {
      return { success: false, message: 'Không thể kết nối đến máy chủ để tải danh sách góp ý.' };
    }
  },

  async createTicket(payload: CreateFeedbackTicketPayload): Promise<ApiResponse<FeedbackTicket>> {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket> | null;
      return data || { success: false, message: `Không thể gửi bài góp ý (HTTP ${res.status}).` };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi gửi bài góp ý.' };
    }
  },

  async replyAsLearner(
    ticketId: number,
    payload: ReplyFeedbackTicketPayload
  ): Promise<ApiResponse<FeedbackTicket>> {
    try {
      const res = await fetch(`/api/feedback/${ticketId}/reply`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket> | null;
      return data || { success: false, message: `Không thể gửi phản hồi (HTTP ${res.status}).` };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi gửi phản hồi.' };
    }
  },

  // ================= CLOUDINARY ATTACHMENT UPLOAD =================
  async uploadAttachment(file: File): Promise<ApiResponse<FeedbackAttachment>> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/feedback/upload-attachment', {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackAttachment> | null;
      return data || { success: false, message: `Không thể tải tệp lên Cloudinary (HTTP ${res.status}).` };
    } catch {
      return { success: false, message: 'Lỗi kết nối khi tải tệp đính kèm lên Cloudinary.' };
    }
  },

  // ================= ADMIN APIs (UC-59) =================
  async getAllTicketsForAdmin(): Promise<ApiResponse<FeedbackTicket[]>> {
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket[]> | null;
      return data || { success: false, message: `Không thể tải danh sách hòm thư quản trị (HTTP ${res.status}).` };
    } catch {
      return { success: false, message: 'Không thể kết nối máy chủ để tải danh sách hòm thư.' };
    }
  },

  async markSeenByAdmin(ticketId: number): Promise<ApiResponse<FeedbackTicket>> {
    try {
      const res = await fetch(`/api/admin/feedback/${ticketId}/seen`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket> | null;
      return data || { success: false, message: 'Không thể cập nhật trạng thái đã xem.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối khi đánh dấu đã xem.' };
    }
  },

  async replyAsAdmin(
    ticketId: number,
    payload: ReplyFeedbackTicketPayload
  ): Promise<ApiResponse<FeedbackTicket>> {
    try {
      const res = await fetch(`/api/admin/feedback/${ticketId}/reply`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket> | null;
      return data || { success: false, message: `Không thể gửi phản hồi Admin (HTTP ${res.status}).` };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi gửi phản hồi Admin.' };
    }
  },

  async closeTicketAsAdmin(ticketId: number): Promise<ApiResponse<FeedbackTicket>> {
    try {
      const res = await fetch(`/api/admin/feedback/${ticketId}/close`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket> | null;
      return data || { success: false, message: 'Không thể đóng bài góp ý.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi đóng bài góp ý.' };
    }
  },

  async reopenTicketAsAdmin(ticketId: number): Promise<ApiResponse<FeedbackTicket>> {
    try {
      const res = await fetch(`/api/admin/feedback/${ticketId}/reopen`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = (await res.json().catch(() => null)) as ApiResponse<FeedbackTicket> | null;
      return data || { success: false, message: 'Không thể mở lại bài góp ý.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi mở lại bài góp ý.' };
    }
  },
};

