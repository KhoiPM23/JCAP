import type { ApiResponse } from '../types/auth';
import type { ExploreJourney, ExploreStampBook, ExploreSyncResult } from '../types/explore';

/** Bản đồ Khám phá phía người học: hành trình, các mốc học của từng tỉnh và con dấu của người học */
class ExploreService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('jcap_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async send<T>(method: 'GET' | 'POST', url: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, { method, headers: this.getHeaders() });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) {
        return { success: false, message: body?.message || `Lỗi máy chủ (${response.status})` };
      }
      return body as ApiResponse<T>;
    } catch {
      return { success: false, message: 'Không kết nối được máy chủ.' };
    }
  }

  /** Các chương và trạng thái 47 tỉnh (mở/đóng, khoá theo chương, số mốc, số con dấu, "Một từ ở tỉnh") */
  public getJourney(): Promise<ApiResponse<ExploreJourney>> {
    return this.send<ExploreJourney>('GET', '/api/explore/journey');
  }

  /** Các mốc của một tỉnh kèm tiến độ; server xét bằng chứng học của cả tỉnh và cấp con dấu vừa đạt trước khi trả */
  public syncPrefecture(id: number): Promise<ApiResponse<ExploreSyncResult>> {
    return this.send<ExploreSyncResult>('POST', `/api/explore/prefectures/${id}/sync`);
  }

  /** Sổ con dấu: các mốc đã có con dấu (chỉ đọc, không cấp dấu) */
  public getStampBook(): Promise<ApiResponse<ExploreStampBook>> {
    return this.send<ExploreStampBook>('GET', '/api/explore/stamps');
  }

  /** Ghi nhận "Đã hiểu" phần câu mẫu của mốc (rồi đồng bộ cả tỉnh) */
  public markUnderstood(spotId: number): Promise<ApiResponse<ExploreSyncResult>> {
    return this.send<ExploreSyncResult>('POST', `/api/explore/spots/${spotId}/understood`);
  }
}

export const exploreService = new ExploreService();
