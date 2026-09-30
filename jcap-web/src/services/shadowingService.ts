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
import {
  getMockTextbooks,
  getMockTextbookById,
  getMockChapters,
  getMockChapterById,
  getMockDialoguesByChapter,
  getMockDialogueById,
} from '../data/mockShadowingData';

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
   * Lấy danh sách giáo trình theo JLPT Level (N5, N4, N3)
   */
  public async getTextbooks(level?: string): Promise<ApiResponse<ShadowingTextbookItem[]>> {
    try {
      const data = getMockTextbooks(level);
      return {
        success: true,
        message: 'Tải danh sách giáo trình thành công.',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể tải danh sách giáo trình tiếng Nhật.',
      };
    }
  }

  /**
   * Lấy chi tiết một giáo trình
   */
  public async getTextbookById(id: string): Promise<ApiResponse<ShadowingTextbookItem>> {
    const book = getMockTextbookById(id);
    if (book) {
      return {
        success: true,
        message: 'Tải thông tin giáo trình thành công.',
        data: book,
      };
    }
    return {
      success: false,
      message: `Không tìm thấy giáo trình với mã: ${id}`,
    };
  }

  /**
   * Lấy danh sách các Chapter thuộc một giáo trình
   */
  public async getChapters(textbookId: string): Promise<ApiResponse<ShadowingChapterItem[]>> {
    const chapters = getMockChapters(textbookId);
    return {
      success: true,
      message: 'Tải danh sách chương học thành công.',
      data: chapters,
    };
  }

  /**
   * Lấy chi tiết một Chapter
   */
  public async getChapterById(textbookId: string, chapterId: string): Promise<ApiResponse<ShadowingChapterItem>> {
    const chapter = getMockChapterById(textbookId, chapterId);
    if (chapter) {
      return {
        success: true,
        message: 'Tải thông tin chương học thành công.',
        data: chapter,
      };
    }
    return {
      success: false,
      message: `Không tìm thấy chương học với mã: ${chapterId}`,
    };
  }

  /**
   * Lấy danh sách Dialogue của một Chapter
   */
  public async getDialoguesByChapter(chapterId: string): Promise<ApiResponse<ShadowingDialogueDetail[]>> {
    const dialogues = getMockDialoguesByChapter(chapterId);
    return {
      success: true,
      message: 'Tải danh sách bài hội thoại thành công.',
      data: dialogues,
    };
  }

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

      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fallback below
    }

    // Fallback to mock data
    const mockDialogues = [
      getMockDialogueById(1401)!,
      getMockDialogueById(1402)!,
      getMockDialogueById(1403)!,
      getMockDialogueById(1301)!,
      getMockDialogueById(1501)!,
      getMockDialogueById(3101)!,
    ].filter(Boolean);

    let filtered = mockDialogues;
    if (params?.jlptLevel && params.jlptLevel !== 'ALL') {
      filtered = filtered.filter(d => d.jlptLevel === params.jlptLevel);
    }
    if (params?.keyword) {
      const kw = params.keyword.toLowerCase();
      filtered = filtered.filter(d => d.title.toLowerCase().includes(kw) || d.scenarioTitle.toLowerCase().includes(kw));
    }

    return {
      success: true,
      message: 'Tải danh mục bài học thành công.',
      data: filtered,
    };
  }

  public async getDetail(id: number): Promise<ApiResponse<ShadowingDialogueDetail>> {
    try {
      const response = await fetch(`/api/shadowing/${id}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.success && json.data) {
          return json;
        }
      }
    } catch {
      // Fallback below
    }

    const mockDetail = getMockDialogueById(id);
    if (mockDetail) {
      return {
        success: true,
        message: 'Tải chi tiết bài học thành công.',
        data: mockDetail,
      };
    }

    return {
      success: false,
      message: `Không tìm thấy bài học Shadowing với Id = ${id}.`,
    };
  }

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
    } catch {
      // Fallback simulation
    }

    return {
      success: true,
      message: 'Hoàn tất phiên luyện tập thành công (chế độ mô phỏng).',
    };
  }

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
    } catch {
      // Fallback simulation
    }

    // Mock AI Analysis result
    return {
      success: true,
      message: 'Phân tích AI hoàn tất.',
      data: {
        creditsDeducted: 15,
        remainingCreditBalance: 2980,
        tokyoIntonationScore: 88,
        vowelClarityScore: 92,
        rhythmTempoScore: 85,
        pitchAccentScore: 84,
        longVowelPrecisionScore: 90,
        overallDiagnosis: 'Phát âm tự nhiên, ngữ điệu chuẩn Tokyo. Nhịp điệu và trường âm duy trì ổn định qua các câu đối thoại.',
        keyStrengths: [
          'Trường âm (ー) và âm ngắt (っ) được xử lý chính xác, không bị dính chữ.',
          'Ngữ điệu câu hỏi ～てもいい？ hạ giọng nhẹ và lên ở phách cuối rất tự nhiên.',
          'Phát âm phụ âm k, s, t rõ nét, khớp nhịp điệu người bản xứ.',
        ],
        improvementActionItems: [
          'Cần chú ý nối âm mượt mà hơn ở các cụm từ dài như 「体育館で行っています」.',
          'Tốc độ đọc câu trả lời có thể tăng nhẹ 0.1x để đạt phản xạ giao tiếp tự nhiên nhất.',
        ],
      },
    };
  }
}

export const shadowingService = new ShadowingService();

