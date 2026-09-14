import type { ApiResponse, AuthResponseDto, LoginPayload, RegisterPayload } from '../types/auth';

const API_BASE = ''; // Trong Vite dev proxy, các request /api sẽ tự động chuyển tiếp tới backend http://localhost:5254

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  let json: any = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Body không phải định dạng JSON (có thể do lỗi 502/504 hoặc proxy từ chối kết nối)
    }
  }

  if (!response.ok) {
    if (json && typeof json === 'object' && 'message' in json) {
      return json as ApiResponse<T>;
    }

    if (response.status === 502 || response.status === 503 || response.status === 504 || response.status === 500) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ Backend (http://localhost:5254). Vui lòng đảm bảo server ASP.NET Core đang chạy (dotnet run).',
      };
    }

    return {
      success: false,
      message: (json && json.message) || text || `Máy chủ phản hồi lỗi (HTTP ${response.status}).`,
    };
  }

  if (!json) {
    return {
      success: false,
      message: 'Dữ liệu phản hồi từ máy chủ trống hoặc không đúng định dạng JSON.',
    };
  }

  return json as ApiResponse<T>;
}

export const authService = {
  /**
   * Đăng nhập tài khoản
   */
  async login(payload: LoginPayload): Promise<ApiResponse<AuthResponseDto>> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return await parseResponse<AuthResponseDto>(response);
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ Backend (http://localhost:5254). Vui lòng kiểm tra xem bạn đã chạy `dotnet run` ở thư mục backend chưa.',
      };
    }
  },

  /**
   * Đăng ký tài khoản người dùng mới
   */
  async register(payload: RegisterPayload): Promise<ApiResponse<AuthResponseDto>> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: payload.fullName,
          email: payload.email,
          password: payload.password,
          confirmPassword: payload.confirmPassword,
          role: payload.role || 'Learner',
        }),
      });

      return await parseResponse<AuthResponseDto>(response);
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ Backend (http://localhost:5254). Vui lòng kiểm tra xem bạn đã chạy `dotnet run` ở thư mục backend chưa.',
      };
    }
  },

  /**
   * Lấy thông tin tài khoản người dùng đang đăng nhập bằng JWT Bearer Token
   */
  async getCurrentUser(token: string): Promise<ApiResponse<AuthResponseDto>> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      return await parseResponse<AuthResponseDto>(response);
    } catch (err: any) {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ Backend.',
      };
    }
  },

  /**
   * Đăng xuất tài khoản
   */
  async logout(token?: string): Promise<ApiResponse<string>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers,
      });

      return await parseResponse<string>(response);
    } catch {
      return {
        success: true,
        message: 'Đăng xuất thành công.',
      };
    }
  },

  /**
   * Lấy đường dẫn điều hướng đến Google OAuth (trỏ trực tiếp vào backend endpoint)
   */
  getGoogleLoginUrl(): string {
    return 'http://localhost:5254/api/auth/google';
  },
};

