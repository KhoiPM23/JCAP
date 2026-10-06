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
  durationSeconds?: number;
  totalSentences: number;
  completed: boolean;
}

export interface ShadowingBookmark {
  id: string;
  learnerId: string;
  dialogueId: number;
  createdAt: string;
}

