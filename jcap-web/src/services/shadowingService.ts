import type { ApiResponse } from '../types/auth';
import type {
  ShadowingDialogueItem,
  ShadowingDialogueDetail,
  ShadowingFilterParams,
  ShadowingSessionCompletePayload,
  ShadowingAiAnalysisPayload,
  ShadowingAiAnalysisResult,
  ShadowingTextbookItem,
  ShadowingChapterItem,
} from '../types/shadowing';

class ShadowingService {
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

  /**
   * UC-25 & UC-26: Lấy danh mục bài học Shadowing thực tế từ Backend Database
   * Đồng bộ 100% với các bài do Admin tạo từ trang quản trị.
   */
  public async getCatalog(params?: ShadowingFilterParams): Promise<ApiResponse<ShadowingDialogueItem[]>> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.keyword) searchParams.append('keyword', params.keyword);
      if (params?.jlptLevel && params.jlptLevel !== 'ALL') searchParams.append('jlptLevel', params.jlptLevel);
      if (params?.scenarioId) searchParams.append('scenarioId', params.scenarioId.toString());

      const url = `/api/shadowing${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || `Lỗi tải danh mục bài học (${response.status}).`,
          data: [],
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend.',
        data: [],
      };
    }
  }

  /**
   * UC-27: Lấy chi tiết bài học Shadowing kèm danh sách câu thoại thực tế từ Database
   */
  public async getDetail(id: number): Promise<ApiResponse<ShadowingDialogueDetail>> {
    try {
      const response = await fetch(`/api/shadowing/${id}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || `Không tìm thấy bài học Shadowing với Id = ${id}.`,
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để lấy bài học.',
      };
    }
  }

  /**
   * Lưu lại tiến trình hoàn thành buổi luyện tập
   */
  public async completeSession(payload: ShadowingSessionCompletePayload): Promise<ApiResponse<unknown>> {
    try {
      const response = await fetch('/api/shadowing/session/complete', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => null);
      return {
        success: false,
        message: err?.message || 'Không thể lưu kết quả buổi luyện tập.',
      };
    } catch {
      return {
        success: true,
        message: 'Đã hoàn thành buổi luyện tập cục bộ.',
      };
    }
  }

  /**
   * Yêu cầu phân tích phát âm AI chuyên sâu (15 credits)
   */
  public async requestAiAnalysis(payload: ShadowingAiAnalysisPayload): Promise<ApiResponse<ShadowingAiAnalysisResult>> {
    try {
      const response = await fetch('/api/shadowing/session/ai-analysis', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => null);
      return {
        success: false,
        message: err?.message || 'Không thể thực hiện phân tích AI.',
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ AI.',
      };
    }
  }

  /**
   * Đánh giá âm thanh giọng nói của từng câu Shadowing qua Backend Gemini AI
   */
  public async evaluateAudio(
    audioBlob: Blob,
    targetText: string
  ): Promise<ApiResponse<{
    evaluationStatus: 'completed' | 'partial' | 'unavailable' | 'failed';
    recognizedText: string;
    contentMatchScore?: number | null;
    pronunciationScore?: number | null;
    fluencyScore?: number | null;
    overallScore?: number | null;
    tier?: 'green' | 'yellow' | 'red' | string;
    feedback?: string;
    missingWords?: string[];
    mismatchedWords?: string[];
    source: string;
    errorCode?: string;
    errorMessage?: string;
  }>> {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('targetText', targetText);

      const token = localStorage.getItem('jcap_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/shadowing/evaluate-audio', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        return {
          success: false,
          message: 'Lỗi máy chủ khi đánh giá âm thanh.',
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối tới máy chủ AI.',
      };
    }
  }

  // Legacy stubs (nếu có view cũ cần gọi tạm thời)
  public async getTextbooks(_level?: string): Promise<ApiResponse<ShadowingTextbookItem[]>> {
    return { success: true, message: 'OK', data: [] };
  }
  public async getTextbookById(_id: string): Promise<ApiResponse<ShadowingTextbookItem>> {
    return { success: false, message: 'Chức năng đã chuyển sang Thư viện bài học thực tế.' };
  }
  public async getChapters(_textbookId: string): Promise<ApiResponse<ShadowingChapterItem[]>> {
    return { success: true, message: 'OK', data: [] };
  }
  public async getChapterById(_textbookId: string, _chapterId: string): Promise<ApiResponse<ShadowingChapterItem>> {
    return { success: false, message: 'Chức năng đã chuyển sang Thư viện bài học thực tế.' };
  }
  public async getDialoguesByChapter(_chapterId: string): Promise<ApiResponse<ShadowingDialogueDetail[]>> {
    return { success: true, message: 'OK', data: [] };
  }
}

export const shadowingService = new ShadowingService();

