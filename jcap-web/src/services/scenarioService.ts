import type { ApiResponse } from '../types/auth';
import type { ScenarioDetails } from '../types/scenarioDetails';

const API_BASE_URL = '/api/scenarios';

export const scenarioService = {
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
