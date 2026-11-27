import type {
  SubmitFlashcardQuizAttemptRequest,
  FlashcardQuizHistoryItem,
  FlashcardQuizHistoryDetail,
} from '../types/flashcardQuiz';
import { resolveApiUrl } from '../utils/apiBase';

const BASE_URL = resolveApiUrl('/api/flashcard-quiz');

class FlashcardQuizService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('jcap_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private unwrapResponse<T>(json: any, fallbackData?: T): { success: boolean; data?: T; message?: string } {
    if (!json) {
      return { success: false, data: fallbackData, message: 'Phản hồi từ máy chủ không hợp lệ.' };
    }
    if (typeof json.success === 'boolean') {
      return {
        success: json.success,
        data: json.data !== undefined && json.data !== null ? json.data : fallbackData,
        message: json.message || undefined,
      };
    }
    return {
      success: true,
      data: json as T,
    };
  }

  public async submitAttempt(
    req: SubmitFlashcardQuizAttemptRequest
  ): Promise<{ success: boolean; data?: FlashcardQuizHistoryItem; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/attempts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi lưu kết quả tự đánh giá (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<FlashcardQuizHistoryItem>(json);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async getHistory(
    contentType?: string,
    topicId?: number | null
  ): Promise<{ success: boolean; data?: FlashcardQuizHistoryItem[]; message?: string }> {
    try {
      const params = new URLSearchParams();
      if (contentType && contentType !== 'All') params.append('contentType', contentType);
      if (topicId && topicId > 0) params.append('topicId', String(topicId));
      const qs = params.toString();

      const res = await fetch(`${BASE_URL}/history${qs ? `?${qs}` : ''}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, data: [], message: errJson?.message || `Lỗi tải lịch sử tự đánh giá (${res.status})` };
      }
      const json = await res.json();
      const unwrapped = this.unwrapResponse<FlashcardQuizHistoryItem[]>(json, []);
      if (!Array.isArray(unwrapped.data)) {
        unwrapped.data = [];
      }
      return unwrapped;
    } catch (err: any) {
      return { success: false, data: [], message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async getHistoryDetail(
    attemptId: number
  ): Promise<{ success: boolean; data?: FlashcardQuizHistoryDetail; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/history/${attemptId}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi tải chi tiết bài tự đánh giá (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<FlashcardQuizHistoryDetail>(json);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }
}

export const flashcardQuizService = new FlashcardQuizService();
