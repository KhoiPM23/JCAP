// Khớp với DTOs/Explore/AdminExploreDtos.cs (backend). Sửa một bên thì sửa cả bên kia.

export type ExploreLevel = 'N5' | 'N4' | 'N3';

export interface AdminExploreOverview {
  prefectures: AdminExplorePrefecture[];
  chapters: AdminExploreChapter[];
}

export interface AdminExplorePrefecture {
  /** Mã tỉnh JIS 1..47 */
  id: number;
  isOpen: boolean;
  openedAt?: string | null;
  /** Chương đang chứa tỉnh (chỉ tính chương đang dùng) */
  chapterId?: number | null;
  /** Số mốc người học thấy được */
  publishedSpotCount: number;
  /** Số mốc còn nháp */
  draftSpotCount: number;
  /** Đã có "Một từ ở tỉnh" đang dùng */
  hasWord: boolean;
}

export interface AdminExploreChapter {
  id: number;
  orderIndex: number;
  title: string;
  description?: string | null;
  minLevel: ExploreLevel;
  maxLevel: ExploreLevel;
  unlockThresholdPercent: number;
  prefectureIds: number[];
}

export interface SaveExploreChapter {
  title: string;
  description?: string | null;
  minLevel: ExploreLevel;
  maxLevel: ExploreLevel;
  unlockThresholdPercent: number;
}
