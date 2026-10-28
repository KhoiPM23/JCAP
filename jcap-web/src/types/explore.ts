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
  /** Chương đã mở cho người học này (chương đầu luôn mở; đã mở thì mở mãi) */
  isUnlocked: boolean;
  /** Số mốc người học thấy được trong chương và số mốc đã có con dấu */
  spotCount: number;
  stampCount: number;
}

export interface ExplorePrefectureSummary {
  /** Mã tỉnh JIS 1..47 */
  id: number;
  isOpen: boolean;
  chapterId?: number | null;
  spotCount: number;
  word?: ExploreProvinceWord | null;
  /** Tỉnh thuộc chương người học chưa mở */
  isLocked: boolean;
  stampCount: number;
  redStampCount: number;
  /** Con dấu tỉnh; null = chưa có */
  stamp?: ExploreStamp | null;
}

export interface ExplorePrefectureDetail {
  id: number;
  isOpen: boolean;
  chapterId?: number | null;
  /** Thuộc chương chưa mở: không có mốc */
  isLocked: boolean;
  word?: ExploreProvinceWord | null;
  spots: ExploreSpot[];
  stamp?: ExploreStamp | null;
}

/** Con dấu đã cấp; redStampedAt có giá trị = đã thành dấu son */
export interface ExploreStamp {
  stampedAt: string;
  redStampedAt?: string | null;
}

export interface ExploreSpotProgress {
  understoodAt?: string | null;
  stampedAt?: string | null;
  redStampedAt?: string | null;
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
  prefectureId: number;
  lesson?: ExploreLesson | null;
  progress: ExploreSpotProgress;
}

export interface ExploreActivity {
  type: 'Shadowing' | 'Roleplay' | 'Quiz' | 'Flashcard';
  referenceId?: number | null;
  passThreshold?: number | null;
  /** Tên bài Shadowing / kịch bản Hội thoại AI */
  title?: string | null;
  /** Hội thoại AI: kịch bản gốc (mở trang /scenarios/:id), cấp độ và số Credit */
  scenarioId?: number | null;
  jlptLevel?: string | null;
  creditCost?: number | null;
}

export interface ExploreLesson {
  jlptLevel: string;
  situation: string;
  realUse: string;
  sentence: { text: string; reading?: string | null }[];
  meaning: string;
  grammarNote?: string | null;
  estimatedMinutes: number;
  activities: ExploreActivity[];
}

/** Những gì vừa đạt trong một lần đồng bộ (để diễn hiệu ứng đóng dấu đúng một lần) */
export interface ExploreAwards {
  stampSpotIds: number[];
  redStampSpotIds: number[];
  prefectureStamp: boolean;
  prefectureRedStamp: boolean;
  unlockedChapterIds: number[];
}

export interface ExploreSyncResult {
  prefecture: ExplorePrefectureDetail;
  awards: ExploreAwards;
}
