import type { ApiResponse } from '../types/auth';
import type {
  AdminExploreChapter,
  AdminExploreOverview,
  AdminExplorePrefecture,
  AdminExplorePrefectureContent,
  AdminExploreSpot,
  AdminExploreSpotRow,
  AdminExploreStats,
  AdminExploreWord,
  ExploreLookupItem,
  ExploreLookupKind,
  ExploreSpotRef,
  ExploreSpotStatus,
  SaveExploreChapter,
  SaveExploreSpot,
} from '../types/adminExplore';

const BASE = '/api/admin/explore';

/** Số mốc đang dùng tối thiểu để mở một tỉnh (khớp AdminExploreService.MinSpotsToOpen ở backend) */
export const MIN_SPOTS_TO_OPEN = 3;

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

  /** Mở tỉnh cho người học (cần ít nhất MIN_SPOTS_TO_OPEN mốc đang dùng). Không có thao tác đóng. */
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

  /** Thống kê tiến độ người học: tổng quan, theo chương và phễu từng mốc đang dùng */
  public getStats() {
    return this.send<AdminExploreStats>('GET', `${BASE}/stats`);
  }

  // ---- Soạn nội dung trong tỉnh ----

  /** Mọi mốc (nháp và đang dùng) của tỉnh, kèm "Một từ ở tỉnh" */
  public getPrefectureContent(prefectureId: number) {
    return this.send<AdminExplorePrefectureContent>('GET', `${BASE}/prefectures/${prefectureId}/spots`);
  }

  public saveWord(prefectureId: number, dto: AdminExploreWord) {
    return this.send<AdminExploreWord>('PUT', `${BASE}/prefectures/${prefectureId}/word`, dto);
  }

  public getSpot(id: number) {
    return this.send<AdminExploreSpot>('GET', `${BASE}/spots/${id}`);
  }

  /** Tạo mốc mới (luôn ở trạng thái Nháp) */
  public createSpot(prefectureId: number, dto: SaveExploreSpot) {
    return this.send<AdminExploreSpot>('POST', `${BASE}/prefectures/${prefectureId}/spots`, dto);
  }

  public updateSpot(id: number, dto: SaveExploreSpot) {
    return this.send<AdminExploreSpot>('PUT', `${BASE}/spots/${id}`, dto);
  }

  public setSpotStatus(id: number, status: ExploreSpotStatus) {
    return this.send<AdminExploreSpot>('PUT', `${BASE}/spots/${id}/status`, { status });
  }

  /** Ngừng dùng mốc nháp (không xoá cứng) */
  public deactivateSpot(id: number) {
    return this.send<boolean>('DELETE', `${BASE}/spots/${id}`);
  }

  /** Mọi mốc của cả nước kèm nội dung đã gắn (bảng "Nội dung các mốc") */
  public listSpots() {
    return this.send<AdminExploreSpotRow[]>('GET', `${BASE}/spots`);
  }

  /** Các mốc đang dùng một nội dung (để cảnh báo trước khi ngừng dùng nội dung đó) */
  public getUsages(kind: ExploreLookupKind, id: number) {
    return this.send<ExploreSpotRef[]>('GET', `${BASE}/usages?kind=${kind}&id=${id}`);
  }

  /** Tìm ngữ pháp, từ vựng, bài Shadowing, kịch bản Hội thoại AI để gắn vào bài (kèm các mốc đang dùng) */
  public lookup(kind: ExploreLookupKind, level?: string | null, q?: string) {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (q?.trim()) params.set('q', q.trim());
    const qs = params.toString();
    return this.send<ExploreLookupItem[]>('GET', `${BASE}/lookups/${kind}${qs ? `?${qs}` : ''}`);
  }
}

export const adminExploreService = new AdminExploreService();
