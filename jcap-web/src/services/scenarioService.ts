import type { ApiResponse } from '../types/auth';
import type { ScenarioDetails, ScenarioListItem } from '../types/scenarioDetails';

const API_BASE_URL = '/api/scenarios';

export const scenarioService = {
  async getScenarios(query?: string): Promise<ApiResponse<ScenarioListItem[]>> {
    const token = localStorage.getItem('jcap_token');

    if (!token) {
      return {
        success: false,
        message: 'Chưa đăng nhập. Vui lòng đăng nhập để xem danh sách scenario.',
      };
    }

    try {
      const url = query && query.trim() !== ''
        ? `${API_BASE_URL}?query=${encodeURIComponent(query.trim())}`
        : API_BASE_URL;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = (await response.json().catch(() => null)) as ApiResponse<ScenarioListItem[]> | null;

      if (result) {
        return result;
      }

      return {
        success: false,
        message: `Không thể tải danh sách scenario (HTTP ${response.status}).`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để tải danh sách scenario.',
      };
    }
  },

  async getDetails(scenarioId: number): Promise<ApiResponse<ScenarioDetails>> {
    const token = localStorage.getItem('jcap_token');

    if (!token) {
      return {
        success: false,
        message: 'Chưa đăng nhập. Vui lòng đăng nhập để xem scenario.',
      };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/${scenarioId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = (await response.json().catch(() => null)) as ApiResponse<ScenarioDetails> | null;

      if (result) {
        return result;
      }

      return {
        success: false,
        message: `Không thể tải scenario (HTTP ${response.status}).`,
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để tải scenario.',
      };
    }
  },

  async getAdminScenarios(): Promise<ApiResponse<ScenarioListItem[]>> {
    const token = localStorage.getItem('jcap_token');
    try {
      const response = await fetch(`${API_BASE_URL}/admin/all`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<ScenarioListItem[]> | null;
      return result || { success: false, message: 'Không thể tải danh sách kịch bản quản trị.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi lấy danh sách quản trị kịch bản.' };
    }
  },

  async createScenario(payload: any): Promise<ApiResponse<ScenarioDetails>> {
    const token = localStorage.getItem('jcap_token');
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<ScenarioDetails> | null;
      return result || { success: false, message: 'Không thể tạo kịch bản mới.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi tạo kịch bản.' };
    }
  },

  async updateScenario(scenarioId: number, payload: any): Promise<ApiResponse<ScenarioDetails>> {
    const token = localStorage.getItem('jcap_token');
    try {
      const response = await fetch(`${API_BASE_URL}/${scenarioId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<ScenarioDetails> | null;
      return result || { success: false, message: 'Không thể cập nhật kịch bản.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi cập nhật kịch bản.' };
    }
  },

  async deleteScenario(scenarioId: number): Promise<ApiResponse<boolean>> {
    const token = localStorage.getItem('jcap_token');
    try {
      const response = await fetch(`${API_BASE_URL}/${scenarioId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<boolean> | null;
      return result || { success: false, message: 'Không thể xóa kịch bản.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi xóa kịch bản.' };
    }
  },
};
