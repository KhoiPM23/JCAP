import type { ApiResponse } from '../types/auth';
import type {
  CompleteRoleplaySessionResponse,
  RoleplayResultDetail,
  RoleplayResultHistoryResponse,
} from '../types/roleplayResult';

const BASE_URL = '/api/roleplay';

class RoleplayResultService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('jcap_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  public async completeSession(
    sessionId: number,
  ): Promise<ApiResponse<CompleteRoleplaySessionResponse>> {
    return this.request(`${BASE_URL}/sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
  }

  public async getHistory(
    page = 1,
    pageSize = 10,
    passStatus?: boolean,
  ): Promise<ApiResponse<RoleplayResultHistoryResponse>> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    if (passStatus !== undefined) {
      params.set('passStatus', String(passStatus));
    }

    return this.request(`${BASE_URL}/results?${params.toString()}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
  }

  public async getDetail(resultId: number): Promise<ApiResponse<RoleplayResultDetail>> {
    return this.request(`${BASE_URL}/results/${resultId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<ApiResponse<T>> {
    if (!localStorage.getItem('jcap_token')) {
      return {
        success: false,
        message: 'Vui lòng đăng nhập để xem kết quả luyện tập.',
      };
    }

    try {
      const response = await fetch(url, init);
      const payload = await response.json().catch(() => null);

      if (response.ok && payload) {
        return payload as ApiResponse<T>;
      }

      return {
        success: false,
        message:
          payload?.message ||
          (response.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
            : `Không thể xử lý yêu cầu (${response.status}).`),
        errors: payload?.errors,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ. Vui lòng thử lại.',
      };
    }
  }
}

export const roleplayResultService = new RoleplayResultService();
