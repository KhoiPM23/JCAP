import type { ApiResponse } from '../types/auth';
import type { ExploreJourney, ExplorePrefectureDetail } from '../types/explore';

/** Bản đồ Khám phá phía người học (chỉ đọc): hành trình và các mốc học của từng tỉnh */
class ExploreService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('jcap_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async get<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, { method: 'GET', headers: this.getHeaders() });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) {
        return { success: false, message: body?.message || `Lỗi máy chủ (${response.status})` };
      }
      return body as ApiResponse<T>;
    } catch {
      return { success: false, message: 'Không kết nối được máy chủ.' };
    }
  }

  /** Các chương và trạng thái 47 tỉnh (mở/đóng, số mốc, "Một từ ở tỉnh") */
  public getJourney(): Promise<ApiResponse<ExploreJourney>> {
    return this.get<ExploreJourney>('/api/explore/journey');
  }

  /** Các mốc đang dùng của một tỉnh; tỉnh đóng trả isOpen = false và không có mốc */
  public getPrefecture(id: number): Promise<ApiResponse<ExplorePrefectureDetail>> {
    return this.get<ExplorePrefectureDetail>(`/api/explore/prefectures/${id}`);
  }
}

export const exploreService = new ExploreService();
