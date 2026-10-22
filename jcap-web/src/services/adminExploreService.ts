import type { ApiResponse } from '../types/auth';
import type {
  AdminExploreChapter,
  AdminExploreOverview,
  AdminExplorePrefecture,
  SaveExploreChapter,
} from '../types/adminExplore';

const BASE = '/api/admin/explore';

/** Quản lý bản đồ Khám phá phía admin: mở tỉnh và quản lý chương */
class AdminExploreService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('jcap_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async send<T>(method: string, url: string, body?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      if (!json) return { success: false, message: `Lỗi máy chủ (${response.status})` };
      if (!response.ok) return { ...json, success: false, message: json.message || `Lỗi máy chủ (${response.status})` };
      return json as ApiResponse<T>;
    } catch {
      return { success: false, message: 'Không kết nối được máy chủ.' };
    }
  }

  /** Trạng thái 47 tỉnh và các chương đang dùng */
  public getOverview() {
    return this.send<AdminExploreOverview>('GET', BASE);
  }

  /** Mở tỉnh cho người học (cần ít nhất 1 mốc đang dùng). Không có thao tác đóng. */
  public openPrefecture(id: number) {
    return this.send<AdminExplorePrefecture>('POST', `${BASE}/prefectures/${id}/open`);
  }

  /** Đưa tỉnh vào chương; null = bỏ khỏi chương */
  public assignChapter(prefectureId: number, chapterId: number | null) {
    return this.send<AdminExploreOverview>('PUT', `${BASE}/prefectures/${prefectureId}/chapter`, { chapterId });
  }

  public createChapter(dto: SaveExploreChapter) {
    return this.send<AdminExploreChapter>('POST', `${BASE}/chapters`, dto);
  }

  public updateChapter(id: number, dto: SaveExploreChapter) {
    return this.send<AdminExploreChapter>('PUT', `${BASE}/chapters/${id}`, dto);
  }

  public reorderChapters(chapterIds: number[]) {
    return this.send<AdminExploreChapter[]>('PUT', `${BASE}/chapters/order`, { chapterIds });
  }

  /** Ngừng dùng chương (không xoá cứng) */
  public deactivateChapter(id: number) {
    return this.send<boolean>('DELETE', `${BASE}/chapters/${id}`);
  }
}

export const adminExploreService = new AdminExploreService();
