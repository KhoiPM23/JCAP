import type { ApiResponse } from '../types/auth';
import type {
  ActiveRoleplaySessionDto,
  RoleplaySessionDetailsDto,
  RoleplayTurnResponseDto,
  RoleplayHintDto,
  LearnerIntelligenceProfileDto,
} from '../types/roleplay';

const BASE_URL = '/api/roleplay';

class RoleplayService {
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
   * Lấy thông tin phiên luyện tập đang diễn ra của kịch bản
   */
  public async getActiveSession(scenarioId: number): Promise<ApiResponse<ActiveRoleplaySessionDto>> {
    try {
      const response = await fetch(`${BASE_URL}/scenarios/${scenarioId}/active-session`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi lấy phiên luyện tập (${response.status})`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối.',
      };
    }
  }

  /**
   * Bắt đầu một phiên luyện tập kịch bản mới (hoặc trả về session đang chạy nếu chưa forceRestart)
   */
  public async startSession(
    scenarioId: number,
    level: string,
    forceRestart: boolean = false
  ): Promise<ApiResponse<RoleplaySessionDetailsDto>> {
    try {
      const response = await fetch(
        `${BASE_URL}/scenarios/${scenarioId}/levels/${encodeURIComponent(level)}/sessions`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ forceRestart }),
        }
      );

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi khởi tạo phiên luyện tập (${response.status})`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ để tạo phiên luyện tập.',
      };
    }
  }

  /**
   * Lấy chi tiết phiên luyện tập bao gồm danh sách tin nhắn, nhiệm vụ và cheat sheet
   */
  public async getSession(sessionId: number): Promise<ApiResponse<RoleplaySessionDetailsDto>> {
    try {
      const response = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi tải chi tiết phiên (${response.status})`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ để tải phiên hội thoại.',
      };
    }
  }

  /**
   * Gửi tin nhắn của học viên, nhận phản hồi từ AI và cập nhật tiến độ nhiệm vụ
   */
  public async sendMessage(
    sessionId: number,
    message: string,
    delivery?: {
      speakingDurationSeconds?: number;
      responseLatencySeconds?: number;
      speechConfidence?: number;
      audioUrl?: string;
      hintLevelUsed?: number;
      translationPeekCount?: number;
      retryCount?: number;
      fallbackToTextInput?: boolean;
      bargeInInterrupted?: boolean;
      moraRate?: number;
      pauseRatio?: number;
    }
  ): Promise<ApiResponse<RoleplayTurnResponseDto>> {
    try {
      const response = await fetch(`${BASE_URL}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          message,
          speakingDurationSeconds: delivery?.speakingDurationSeconds,
          responseLatencySeconds: delivery?.responseLatencySeconds,
          speechConfidence: delivery?.speechConfidence,
          audioUrl: delivery?.audioUrl,
          hintLevelUsed: delivery?.hintLevelUsed ?? 0,
          translationPeekCount: delivery?.translationPeekCount ?? 0,
          retryCount: delivery?.retryCount ?? 0,
          fallbackToTextInput: delivery?.fallbackToTextInput ?? false,
          bargeInInterrupted: delivery?.bargeInInterrupted ?? false,
          moraRate: delivery?.moraRate,
          pauseRatio: delivery?.pauseRatio,
        }),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi gửi tin nhắn (${response.status})`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ để gửi tin nhắn.',
      };
    }
  }

  /**
   * Xin gợi ý câu trả lời phù hợp với ngữ cảnh hội thoại
   */
  public async getHint(sessionId: number): Promise<ApiResponse<RoleplayHintDto>> {
    try {
      const response = await fetch(`${BASE_URL}/sessions/${sessionId}/hint`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi xin gợi ý (${response.status})`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ để lấy gợi ý.',
      };
    }
  }

  /**
   * Kết thúc phiên luyện tập
   */
  public async endSession(sessionId: number): Promise<ApiResponse<RoleplaySessionDetailsDto>> {
    try {
      const response = await fetch(`${BASE_URL}/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi kết thúc phiên (${response.status})`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ để kết thúc phiên.',
      };
    }
  }

  /**
   * Lấy hồ sơ trí tuệ học viên và các chỉ số phản xạ giao tiếp ngầm (TikTok-style Linguistic Intelligence Profile)
   */
  public async getIntelligenceProfile(): Promise<ApiResponse<LearnerIntelligenceProfileDto>> {
    try {
      const response = await fetch(`${BASE_URL}/intelligence-profile`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi lấy hồ sơ trí tuệ học viên (${response.status})`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ để lấy hồ sơ trí tuệ.',
      };
    }
  }
}

export const roleplayService = new RoleplayService();
