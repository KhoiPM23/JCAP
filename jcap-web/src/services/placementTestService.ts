import type { ApiResponse } from '../types/auth';
import type {
  PlacementTestStatusDto,
  PlacementTestStartResponseDto,
  PlacementTestMessageRequestDto,
  PlacementTestMessageResponseDto,
  PlacementTestCompleteResponseDto,
  PlacementTestHistoryItemDto,
  PlacementTestHistoryDetailDto,
} from '../types/placementTest';

const BASE_URL = '/api/placement-test';

class PlacementTestService {
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
   * Lấy trạng thái Placement Test của người dùng
   */
  public async getStatus(): Promise<ApiResponse<PlacementTestStatusDto>> {
    try {
      const response = await fetch(`${BASE_URL}/status`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể kết nối đến máy chủ.',
        data: null as any,
      };
    }
  }

  /**
   * Khởi tạo hoặc tiếp tục phiên Placement Test (0 Credit)
   * @param reset Nếu true, hủy bỏ phiên cũ để bắt đầu bài mới
   */
  public async startOrResume(reset: boolean = false): Promise<ApiResponse<PlacementTestStartResponseDto>> {
    try {
      const response = await fetch(`${BASE_URL}/start?reset=${reset}`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể bắt đầu phiên kiểm tra xếp lớp.',
        data: null as any,
      };
    }
  }

  /**
   * Bỏ qua bài kiểm tra xếp lớp
   */
  public async skip(): Promise<ApiResponse<boolean>> {
    try {
      const response = await fetch(`${BASE_URL}/skip`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể bỏ qua bài kiểm tra.',
        data: false,
      };
    }
  }

  /**
   * Gửi câu trả lời của học viên trong một lượt hội thoại
   */
  public async sendMessage(
    sessionId: number,
    request: PlacementTestMessageRequestDto
  ): Promise<ApiResponse<PlacementTestMessageResponseDto>> {
    try {
      const response = await fetch(`${BASE_URL}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Lỗi gửi tin nhắn đến máy chủ.',
        data: null as any,
      };
    }
  }

  /**
   * Hoàn tất phiên kiểm tra và nhận kết quả đánh giá năng lực
   */
  public async complete(sessionId: number): Promise<ApiResponse<PlacementTestCompleteResponseDto>> {
    try {
      const response = await fetch(`${BASE_URL}/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Lỗi hoàn tất bài kiểm tra.',
        data: null as any,
      };
    }
  }

  /**
   * Lấy danh sách lịch sử các phiên kiểm tra xếp lớp
   */
  public async getHistoryList(): Promise<ApiResponse<PlacementTestHistoryItemDto[]>> {
    try {
      const response = await fetch(`${BASE_URL}/history`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể tải lịch sử kiểm tra xếp lớp.',
        data: [],
      };
    }
  }

  /**
   * Lấy chi tiết bằng chứng và nhận xét của một phiên cụ thể
   */
  public async getHistoryDetail(sessionId: number): Promise<ApiResponse<PlacementTestHistoryDetailDto>> {
    try {
      const response = await fetch(`${BASE_URL}/history/${sessionId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Không thể tải chi tiết phiên kiểm tra.',
        data: null as any,
      };
    }
  }
}

export const placementTestService = new PlacementTestService();
