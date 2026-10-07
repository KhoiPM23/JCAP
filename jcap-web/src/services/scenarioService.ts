import type { ApiResponse } from '../types/auth';
import type { ScenarioDetails, ScenarioListItem, GeneratedLevelContent } from '../types/scenarioDetails';

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

  async getAiStatus(): Promise<ApiResponse<{ modelId: string; displayName: string; isReady: boolean; mode: string }>> {
    const token = localStorage.getItem('jcap_token');
    try {
      const response = await fetch('/api/admin/scenarios/ai-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<{ modelId: string; displayName: string; isReady: boolean; mode: string }> | null;
      return result || { success: false, message: 'Không thể tải trạng thái AI.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi lấy trạng thái AI.' };
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

  async getAdminScenarioDetails(scenarioId: number): Promise<ApiResponse<ScenarioDetails>> {
    const token = localStorage.getItem('jcap_token');
    try {
      const response = await fetch(`/api/admin/scenarios/${scenarioId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<ScenarioDetails> | null;
      return result || { success: false, message: 'Không thể tải chi tiết kịch bản.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối máy chủ khi lấy chi tiết kịch bản.' };
    }
  },

  async generateLevelContent(
    scenarioTitle: string,
    scenarioDescription: string,
    jlptLevel: string,
    missionCount: number = 3,
    vocabularyCount: number = 3,
    grammarCount: number = 3,
    existing?: {
      missions?: { id?: number; content: string; target?: string; intent?: string; conditions?: string[] }[];
      vocabularies?: { id?: number; word: string; reading?: string; meaning: string }[];
      grammars?: { id?: number; pattern: string; meaning: string; exampleSentence?: string }[];
    }
  ): Promise<ApiResponse<GeneratedLevelContent>> {
    const token = localStorage.getItem('jcap_token');
    try {
      const response = await fetch('/api/admin/scenarios/generate-level-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scenarioTitle,
          scenarioDescription,
          jlptLevel,
          missionCount,
          vocabularyCount,
          grammarCount,
          existingMissions: existing?.missions ?? [],
          existingVocabularies: existing?.vocabularies ?? [],
          existingGrammars: existing?.grammars ?? [],
        }),
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<GeneratedLevelContent> | null;
      return result || { success: false, message: 'Không thể tạo gợi ý nội dung AI.' };
    } catch {
      return { success: false, message: 'Lỗi kết nối khi gọi AI gợi ý nội dung.' };
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
