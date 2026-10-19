export type ShadowingProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ShadowingProgress {
  sessionId?: string;
  learnerId: string;
  dialogueId: number;
  dialogueTitle?: string;
  subtitle?: string;
  scenarioTitle?: string;
  textbookTitle?: string;
  chapterTitle?: string;
  jlptLevel?: 'N5' | 'N4' | 'N3';
  role: 'A' | 'B';
  status: ShadowingProgressStatus;
  currentSentenceIndex: number;
  currentSentenceText?: string;
  completedSentenceCount: number;
  totalSentenceCount: number;
  averageScore?: number;
  startedAt: string;
  lastPracticedAt: string;
  completedAt?: string;
}

export interface ShadowingPracticeSession {
  id: string;
  sessionId?: string;
  learnerId: string;
  dialogueId: number;
  dialogueTitle: string;
  scenarioTitle?: string;
  textbookTitle?: string;
  chapterTitle?: string;
  jlptLevel?: 'N5' | 'N4' | 'N3';
  role: 'A' | 'B';
  startedAt: string;
  completedAt: string;
  sentenceScores: number[];
  averageScore: number;
  contentMatchScore?: number;
  accuracyScore?: number;
  /** null/undefined = chưa đo. Bản ghi cũ (không có scoringVersion) có thể chứa giá trị ước lượng. */
  fluencyScore?: number | null;
  /** Chưa được đo bởi bất kỳ phiên bản chấm điểm nào; chỉ còn trong bản ghi cũ. */
  intonationScore?: number | null;
  audioQualityScore?: number | null;
  audioQualityStatus?: string;
  /** Phiên bản công thức chấm. Vắng mặt = bản ghi cũ (legacy). */
  scoringVersion?: string;
  audioGateStatus?: 'good' | 'acceptable' | 'needs_retry' | 'unmeasured';
  audioGateLabel?: string;
  durationSeconds?: number;
  totalSentences: number;
  completed: boolean;
  sentenceResults?: any[];
}

export interface ShadowingBookmark {
  id: string;
  learnerId: string;
  dialogueId: number;
  createdAt: string;
}

