import type { ApiResponse } from '../types/auth';
import type { ShadowingDialogueItem, ShadowingDialogueDetail, ShadowingFilterParams } from '../types/shadowing';

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
          message: err?.message || `Lỗi máy chủ (${response.status}): Không thể tải danh sách bài học.`,
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để tải bài học Shadowing.',
      };
    }
  }

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
        message: 'Không thể kết nối đến máy chủ backend để tải chi tiết bài học.',
      };
    }
  }
}

export const shadowingService = new ShadowingService();
