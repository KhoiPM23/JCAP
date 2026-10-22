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

// ---- Soạn nội dung trong tỉnh (giai đoạn 3) ----

export type ExploreSpotStatus = 'Draft' | 'Published';

/** Khoá các mục kiểm tra trước khi chuyển mốc sang "Đang dùng" (khớp ExploreSpotCheck ở backend) */
export type ExploreSpotCheckKey = 'place' | 'sentence' | 'target' | 'situation' | 'realUse' | 'shadowing';

export interface AdminExplorePrefectureContent {
  id: number;
  isOpen: boolean;
  chapterId?: number | null;
  word?: AdminExploreWord | null;
  spots: AdminExploreSpotSummary[];
}

export interface AdminExploreWord {
  word: string;
  kana: string;
  meaning: string;
  note?: string | null;
  status: ExploreSpotStatus;
}

export interface AdminExploreSpotSummary {
  id: number;
  iconId: string;
  nameVi: string;
  nameJp: string;
  latitude: number;
  longitude: number;
  status: ExploreSpotStatus;
  jlptLevel: ExploreLevel;
  hasRoleplay: boolean;
  updatedAt: string;
  missing: ExploreSpotCheckKey[];
}

export interface ExploreLookupItem {
  id: number;
  title: string;
  subtitle?: string | null;
  jlptLevel?: string | null;
  /** false = nội dung đã ngừng dùng/lưu trữ */
  available: boolean;
}

export type ExploreLookupKind = 'grammar' | 'vocabulary' | 'shadowing' | 'roleplay';

export interface AdminExploreActivity {
  type: 'Shadowing' | 'Roleplay';
  referenceId?: number | null;
  passThreshold?: number | null;
  reference?: ExploreLookupItem | null;
}

export interface AdminExploreSpot {
  id: number;
  prefectureId: number;
  prefectureIsOpen: boolean;
  iconId: string;
  nameVi: string;
  nameJp: string;
  nameKana?: string | null;
  latitude: number;
  longitude: number;
  status: ExploreSpotStatus;
  createdAt: string;
  updatedAt: string;
  jlptLevel: ExploreLevel;
  situation: string;
  realUse: string;
  sentence: { text: string; reading?: string | null }[];
  meaning: string;
  grammarNote?: string | null;
  estimatedMinutes: number;
  grammars: ExploreLookupItem[];
  vocabularies: ExploreLookupItem[];
  activities: AdminExploreActivity[];
  missing: ExploreSpotCheckKey[];
}

export interface SaveExploreSpot {
  iconId: string;
  nameVi: string;
  nameJp: string;
  nameKana?: string | null;
  latitude: number;
  longitude: number;
  jlptLevel: ExploreLevel;
  situation: string;
  realUse: string;
  sentence: { text: string; reading?: string | null }[];
  meaning: string;
  grammarNote?: string | null;
  estimatedMinutes: number;
  grammarIds: number[];
  vocabularyIds: number[];
  activities: { type: 'Shadowing' | 'Roleplay'; referenceId: number | null; passThreshold?: number | null }[];
}
