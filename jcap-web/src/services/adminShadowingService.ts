import type { ApiResponse } from '../types/auth';
import type {
  ShadowingDialogueItem,
  ShadowingDialogueDetail,
  CreateShadowingDialoguePayload,
  UpdateShadowingDialoguePayload,
  GenerateShadowingDialoguePayload,
  GeneratedShadowingDialogueResult,
  TranslateAssistPayload,
  TranslateAssistResult,
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
          message: err?.message || 'Không thể xóa bài học.',
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để xóa bài học.',
      };
    }
  }

  public async generateDialogue(payload: GenerateShadowingDialoguePayload): Promise<ApiResponse<GeneratedShadowingDialogueResult>> {
    try {
      const response = await fetch('/api/admin/shadowing/generate-dialogue', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || 'Không thể tạo gợi ý bài hội thoại Shadowing từ AI.',
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Lỗi kết nối khi gọi AI tạo bài hội thoại Shadowing.',
      };
    }
  }

  public async translateAssist(payload: TranslateAssistPayload): Promise<ApiResponse<TranslateAssistResult>> {
    try {
      const response = await fetch('/api/admin/shadowing/translate-assist', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || 'Không thể hỗ trợ dịch thuật tự động.',
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Lỗi kết nối khi gọi hỗ trợ dịch thuật.',
      };
    }
  }

  public async uploadAudio(file: Blob | File): Promise<ApiResponse<string>> {
    const token = localStorage.getItem('jcap_token');
    const formData = new FormData();
    formData.append('file', file, 'audio_record.webm');

    try {
      const response = await fetch('/api/admin/shadowing/upload-audio', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || 'Tải tệp âm thanh thất bại.',
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để tải âm thanh.',
      };
    }
  }
}

export const adminShadowingService = new AdminShadowingService();
