import type {
  FlashcardContentType,
  FlashcardQuota,
  FlashcardSetSummary,
  FlashcardSetDetail,
  FlashcardSession,
  StartFlashcardSessionRequest,
  RateFlashcardRequest,
  FlashcardRateResult,
  FlashcardSessionSummary,
  FlashcardSessionHistoryItem,
  FlashcardSessionHistoryDetail,
  BookmarkItem,
  BookmarkListResponse,
  ToggleBookmarkResponse,
} from '../types/flashcard';
import { creditService } from './creditService';

const BASE_URL = '/api/flashcards';

// Tự động dọn dẹp các key mock cũ còn sót trong localStorage
try {
  localStorage.removeItem('jcap_flashcard_mock_mode');
  localStorage.removeItem('jcap_flashcard_mock_extra_unlocked');
  localStorage.removeItem('jcap_flashcard_mock_sets_v2');
  localStorage.removeItem('jcap_flashcard_mock_cards_v2');
  localStorage.removeItem('jcap_flashcard_mock_history_v2');
} catch {}

class FlashcardService {
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

  // ============================================================
  // 1. Quota & Credit Unlocking
  // ============================================================

  public async getDailyQuota(): Promise<{ success: boolean; data?: FlashcardQuota; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/quota`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi tải hạn mức (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<FlashcardQuota>(json);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async unlockExtraNewCards(): Promise<{ success: boolean; data?: FlashcardQuota; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/quota/unlock`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi mở thêm thẻ (${res.status})` };
      }
      const json = await res.json();
      const unwrapped = this.unwrapResponse<FlashcardQuota>(json);
      if (unwrapped.success && unwrapped.data && typeof unwrapped.data.userCreditBalance === 'number') {
        creditService.updateLocalCreditBalance(unwrapped.data.userCreditBalance);
      }
      return unwrapped;
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  // ============================================================
  // 2. Flashcard Sets (UC-55, UC-56)
  // ============================================================

  public async getSets(contentType?: string, jlptLevel?: string): Promise<{ success: boolean; data?: FlashcardSetSummary[]; message?: string }> {
    try {
      const params = new URLSearchParams();
      if (contentType && contentType !== 'All') params.append('contentType', contentType);
      if (jlptLevel && jlptLevel !== 'All') params.append('jlptLevel', jlptLevel);

      const res = await fetch(`${BASE_URL}/sets?${params.toString()}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, data: [], message: errJson?.message || `Lỗi tải danh sách bộ thẻ (${res.status})` };
      }
      const json = await res.json();
      const unwrapped = this.unwrapResponse<FlashcardSetSummary[]>(json, []);
      if (!Array.isArray(unwrapped.data)) {
        unwrapped.data = [];
      }
      return unwrapped;
    } catch (err: any) {
      return { success: false, data: [], message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async getSetDetail(topicId: number, contentType: string): Promise<{ success: boolean; data?: FlashcardSetDetail; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/sets/${topicId}/${contentType}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi tải chi tiết bộ thẻ (${res.status})` };
      }
      const json = await res.json();
      const unwrapped = this.unwrapResponse<FlashcardSetDetail>(json);
      if (unwrapped.data && !Array.isArray(unwrapped.data.cards)) {
        unwrapped.data.cards = [];
      }
      return unwrapped;
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  // ============================================================
  // 3. Study Session (UC-54, UC-57)
  // ============================================================

  public async startSession(req: StartFlashcardSessionRequest): Promise<{ success: boolean; data?: FlashcardSession; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/sessions/start`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi bắt đầu phiên học (${res.status})` };
      }
      const json = await res.json();
      const unwrapped = this.unwrapResponse<FlashcardSession>(json);
      if (unwrapped.data && !Array.isArray(unwrapped.data.cards)) {
        unwrapped.data.cards = [];
      }
      return unwrapped;
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async rateCard(sessionId: number, req: RateFlashcardRequest): Promise<{ success: boolean; data?: FlashcardRateResult; message?: string }> {
    try {
      const payload: { vocabularyId?: number; grammarId?: number; rating: string } = {
        rating: req.rating,
      };
      if (req.itemType.toLowerCase() === 'grammar') {
        payload.grammarId = req.itemId;
      } else {
        payload.vocabularyId = req.itemId;
      }

      const res = await fetch(`${BASE_URL}/sessions/${sessionId}/review`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi đánh giá thẻ (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<FlashcardRateResult>(json);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async getSessionSummary(sessionId: number): Promise<{ success: boolean; data?: FlashcardSessionSummary; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi tải tổng kết phiên (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<FlashcardSessionSummary>(json);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  // ============================================================
  // 4. Review History (UC-58)
  // ============================================================

  public async getReviewHistory(page = 1, pageSize = 10, contentType?: string): Promise<{
    success: boolean;
    data?: { items: FlashcardSessionHistoryItem[]; totalCount: number; page: number; pageSize: number };
    message?: string;
  }> {
    try {
      const res = await fetch(`${BASE_URL}/history`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi tải lịch sử (${res.status})` };
      }
      const json = await res.json();
      const unwrapped = this.unwrapResponse<any>(json);
      let items: FlashcardSessionHistoryItem[] = [];
      if (Array.isArray(unwrapped.data)) {
        items = unwrapped.data;
      } else if (unwrapped.data?.items && Array.isArray(unwrapped.data.items)) {
        items = unwrapped.data.items;
      }
      if (contentType && contentType !== 'All') {
        items = items.filter((i) => i.contentType?.toLowerCase() === contentType.toLowerCase());
      }
      return {
        success: true,
        data: {
          items,
          totalCount: items.length,
          page,
          pageSize,
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async getSessionHistoryDetail(sessionId: number): Promise<{ success: boolean; data?: FlashcardSessionHistoryDetail; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/history/${sessionId}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi tải chi tiết phiên lịch sử (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<FlashcardSessionHistoryDetail>(json);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  // ============================================================
  // 5. Debug / Simulation (SRS Testing)
  // ============================================================

  public async simulateDays(days: number): Promise<{ success: boolean; data?: boolean; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/debug/simulate-days?days=${days}`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi giả lập ngày (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<boolean>(json, false);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  // ============================================================
  // 6. Bookmarks (UC-52, UC-53)
  // ============================================================

  public async toggleBookmark(itemType: 'Vocabulary' | 'Grammar', itemId: number): Promise<{
    success: boolean;
    data?: ToggleBookmarkResponse;
    message?: string;
  }> {
    try {
      const payload: { vocabularyId?: number; grammarId?: number } = {};
      if (itemType.toLowerCase() === 'grammar') {
        payload.grammarId = itemId;
      } else {
        payload.vocabularyId = itemId;
      }

      const res = await fetch('/api/bookmarks/toggle', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return { success: false, message: errJson?.message || `Lỗi lưu thẻ (${res.status})` };
      }
      const json = await res.json();
      return this.unwrapResponse<ToggleBookmarkResponse>(json);
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể kết nối đến máy chủ backend.' };
    }
  }

  public async getBookmarks(itemType?: string, jlptLevel?: string, keyword?: string): Promise<{
    success: boolean;
    data?: BookmarkListResponse;
    message?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (itemType && itemType !== 'All') params.append('itemType', itemType);
      if (jlptLevel && jlptLevel !== 'All') params.append('jlptLevel', jlptLevel);
      if (keyword && keyword.trim()) params.append('keyword', keyword.trim());

      const res = await fetch(`/api/bookmarks?${params.toString()}`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return {
          success: false,
          data: { items: [], totalCount: 0, dueCount: 0, newCount: 0 },
          message: errJson?.message || `Lỗi tải danh sách thẻ đã lưu (${res.status})`,
        };
      }
      const json = await res.json();
      const unwrapped = this.unwrapResponse<BookmarkListResponse>(json, {
        items: [],
        totalCount: 0,
        dueCount: 0,
        newCount: 0,
      });
      if (unwrapped.data && !Array.isArray(unwrapped.data.items)) {
        unwrapped.data.items = [];
      }
      return unwrapped;
    } catch (err: any) {
      return {
        success: false,
        data: { items: [], totalCount: 0, dueCount: 0, newCount: 0 },
        message: err.message || 'Không thể kết nối đến máy chủ backend.',
      };
    }
  }
}

export const flashcardService = new FlashcardService();
