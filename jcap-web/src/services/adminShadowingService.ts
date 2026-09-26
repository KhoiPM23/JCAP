import type { ApiResponse } from '../types/auth';
import type {
  ShadowingDialogueItem,
  ShadowingDialogueDetail,
  CreateShadowingDialoguePayload,
  UpdateShadowingDialoguePayload
} from '../types/shadowing';

class AdminShadowingService {
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

  public async getCatalog(): Promise<ApiResponse<ShadowingDialogueItem[]>> {
    try {
      const response = await fetch('/api/admin/shadowing', {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || `Lỗi tải danh sách quản trị (${response.status}).`,
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend.',
      };
    }
  }

  public async getDetail(id: number): Promise<ApiResponse<ShadowingDialogueDetail>> {
    try {
      const response = await fetch(`/api/admin/shadowing/${id}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || `Lỗi tải chi tiết bài học (${response.status}).`,
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend.',
      };
    }
  }

  public async createDialogue(payload: CreateShadowingDialoguePayload): Promise<ApiResponse<ShadowingDialogueDetail>> {
    try {
      const response = await fetch('/api/admin/shadowing', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || 'Tạo bài học thất bại.',
          errors: err?.errors,
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để tạo bài học.',
      };
    }
  }

  public async updateDialogue(id: number, payload: UpdateShadowingDialoguePayload): Promise<ApiResponse<ShadowingDialogueDetail>> {
    try {
      const response = await fetch(`/api/admin/shadowing/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || 'Cập nhật bài học thất bại.',
          errors: err?.errors,
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để cập nhật bài học.',
      };
    }
  }

  public async softDelete(id: number): Promise<ApiResponse<boolean>> {
    try {
      const response = await fetch(`/api/admin/shadowing/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || 'Vô hiệu hóa bài học thất bại.',
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend.',
      };
    }
  }
}

export const adminShadowingService = new AdminShadowingService();
