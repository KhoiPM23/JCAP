import type { ApiResponse } from '../types/auth';
import type { LearnerProfile, UpdateLearnerProfileRequest, JLPTLevel } from '../types/profile';

const API_BASE_URL = '/api/profile';
const ALLOWED_JLPT_LEVELS: JLPTLevel[] = ['N5', 'N4', 'N3'];

class ProfileService {
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
   * UC07: Lấy thông tin hồ sơ học viên từ Backend API (GET /api/profile)
   * Sử dụng trực tiếp API backend, không dùng mock data giả lập thành công.
   */
  public async getProfile(): Promise<ApiResponse<LearnerProfile>> {
    const token = localStorage.getItem('jcap_token');
    if (!token) {
      return {
        success: false,
        message: 'Chưa đăng nhập. Vui lòng đăng nhập để xem thông tin hồ sơ.',
      };
    }

    try {
      const response = await fetch(API_BASE_URL, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const result: ApiResponse<LearnerProfile> = await response.json();
        if (result.success && result.data) {
          this.syncLocalSession(result.data);
          return result;
        }
        return result;
      }

      if (response.status === 401) {
        return {
          success: false,
          message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        };
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Lỗi máy chủ (${response.status}): Không thể tải hồ sơ.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend. Vui lòng kiểm tra lại dịch vụ API.',
      };
    }
  }

  /**
   * UC08: Cập nhật thông tin hồ sơ học viên lên Backend API (PUT /api/profile)
   * Sử dụng trực tiếp API backend, chỉ cập nhật session khi server xác nhận thành công.
   */
  public async updateProfile(payload: UpdateLearnerProfileRequest): Promise<ApiResponse<LearnerProfile>> {
    // Ràng buộc nghiệp vụ: JCAP chỉ chấp nhận N5, N4, N3
    if (!ALLOWED_JLPT_LEVELS.includes(payload.jlptLevel)) {
      return {
        success: false,
        message: 'Trình độ JLPT không hợp lệ. JCAP chỉ hỗ trợ cấp độ N5, N4 hoặc N3.',
        errors: ['Chỉ chấp nhận N5, N4, N3. Không hỗ trợ N2 hoặc N1.'],
      };
    }

    const token = localStorage.getItem('jcap_token');
    if (!token) {
      return {
        success: false,
        message: 'Chưa đăng nhập. Vui lòng đăng nhập để thực hiện cập nhật.',
      };
    }

    try {
      const response = await fetch(API_BASE_URL, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          fullName: payload.fullName.trim(),
          phoneNumber: payload.phoneNumber?.trim() || null,
          profilePictureUrl: payload.profilePictureUrl?.trim() || null,
          jlptLevel: payload.jlptLevel,
        }),
      });

      if (response.ok) {
        const result: ApiResponse<LearnerProfile> = await response.json();
        if (result.success && result.data) {
          // Chỉ đồng bộ jcap_user sau khi server xác nhận thành công
          this.syncLocalSession(result.data);
          window.dispatchEvent(new CustomEvent('jcap_profile_updated', { detail: result.data }));
          return result;
        }
        return result;
      }

      const errData = await response.json().catch(() => null);
      return {
        success: false,
        message: errData?.message || `Cập nhật hồ sơ thất bại (Mã lỗi ${response.status}).`,
        errors: errData?.errors,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để cập nhật hồ sơ.',
      };
    }
  }

  /**
   * Đồng bộ thông tin user vào localStorage ('jcap_user') để Header và Navbar cập nhật hiển thị
   */
  private syncLocalSession(profile: LearnerProfile) {
    const savedUserStr = localStorage.getItem('jcap_user');
    if (savedUserStr) {
      try {
        const u = JSON.parse(savedUserStr);
        const updatedUser = {
          ...u,
          fullName: profile.fullName,
          level: profile.jlptLevel,
          avatarUrl: profile.profilePictureUrl || undefined,
        };
        localStorage.setItem('jcap_user', JSON.stringify(updatedUser));
      } catch {
        // ignore
      }
    }
  }
}

export const profileService = new ProfileService();
