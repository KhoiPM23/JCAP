// Khớp với DTOs/Explore/ExploreDtos.cs (backend). Sửa một bên thì sửa cả bên kia.

export interface ExploreJourney {
  chapters: ExploreChapter[];
  prefectures: ExplorePrefectureSummary[];
}

export interface ExploreChapter {
  id: number;
  orderIndex: number;
  title: string;
  description?: string | null;
  minLevel: string;
  maxLevel: string;
  unlockThresholdPercent: number;
  prefectureIds: number[];
}

export interface ExplorePrefectureSummary {
  /** Mã tỉnh JIS 1..47 */
  id: number;
  isOpen: boolean;
  chapterId?: number | null;
  spotCount: number;
  word?: ExploreProvinceWord | null;
}

export interface ExplorePrefectureDetail {
  id: number;
  isOpen: boolean;
  chapterId?: number | null;
  word?: ExploreProvinceWord | null;
  spots: ExploreSpot[];
}

export interface ExploreProvinceWord {
  word: string;
  kana: string;
  meaning: string;
  note?: string | null;
}

export interface ExploreSpot {
  id: number;
  /** Id biểu tượng NDC (vd. "P_nara-park") hoặc biểu tượng riêng của JCAP có tiền tố "X_" */
  iconId: string;
  nameVi: string;
  nameJp: string;
  nameKana?: string | null;
  latitude: number;
  longitude: number;
  lesson?: ExploreLesson | null;
}

export interface ExploreLesson {
  jlptLevel: string;
  situation: string;
  realUse: string;
  sentence: { text: string; reading?: string | null }[];
  meaning: string;
  grammarNote?: string | null;
  estimatedMinutes: number;
  activities: { type: 'Shadowing' | 'Roleplay' | 'Quiz' | 'Flashcard'; referenceId?: number | null; passThreshold?: number | null }[];
}
