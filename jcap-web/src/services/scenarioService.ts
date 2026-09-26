import type { ApiResponse } from '../types/auth';
import type { ScenarioDetails, ScenarioListItem } from '../types/scenarioDetails';

const API_BASE_URL = '/api/scenarios';

export const scenarioService = {
  async getScenarios(): Promise<ApiResponse<ScenarioListItem[]>> {
    const token = localStorage.getItem('jcap_token');

    if (!token) {
      return {
        success: false,
        message: 'Chưa đăng nhập. Vui lòng đăng nhập để xem danh sách scenario.',
      };
    }

    try {
      const response = await fetch(API_BASE_URL, {
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
};
