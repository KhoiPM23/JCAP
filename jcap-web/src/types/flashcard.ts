export type FlashcardContentType = 'Vocabulary' | 'Grammar';
export type FlashcardSessionSource = 'TopicSet' | 'Bookmark' | 'DueReview';
export type FlashcardSrsState = 'New' | 'Learning' | 'Due';
export type FlashcardRating = 'Again' | 'Good' | 'Easy';

export interface SrsIntervalPreview {
  againDays?: number;
  goodDays?: number;
  easyDays?: number;
  againIntervalDays?: number;
  goodIntervalDays?: number;
  easyIntervalDays?: number;
}

export interface FlashcardQuota {
  freeNewCardsLimit: number;
  extraUnlockedToday: number;
  totalAllowedNewCardsToday: number;
  studiedNewCardsToday: number;
  remainingNewCardsToday: number;
  unlockBatchSize: number;
  unlockCreditCost: number;
  userCreditBalance: number;
  hasActiveSubscription: boolean;
  totalDueCardsToday?: number;
  dueVocabularyCount?: number;
  dueGrammarCount?: number;
}

export interface FlashcardSetSummary {
  topicId: number;
  topicTitle: string;
  topicDescription?: string | null;
  jlptLevel: string;
  contentType: FlashcardContentType;
  setTitle: string;
  totalCards: number;
  learnedCards: number;
  dueCards: number;
  newCards: number;
  nextDueAt?: string | null;
}

export interface FlashcardCardItem {
  itemType: FlashcardContentType;
  itemId: number;
  frontText: string; // Kanji / Word or Pattern
  readingOrFormation?: string | null; // Furigana or Formation rule
  meaning: string;
  partOfSpeech?: string | null;
  explanation?: string | null;
  exampleSentence?: string | null;
  audioUrl?: string | null;
  jlptLevel: string;
  isBookmarked: boolean;
  srsState: FlashcardSrsState;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt?: string | null;
  intervalPreview: SrsIntervalPreview;
}

export interface FlashcardSetDetail {
  summary: FlashcardSetSummary;
  cards: FlashcardCardItem[];
}

export interface StartFlashcardSessionRequest {
  sourceType?: FlashcardSessionSource;
  topicId?: number | null;
  contentType?: FlashcardContentType | 'Mixed';
  jlptLevelFilter?: string | null;
  isExtraPractice?: boolean;
}

export interface FlashcardSession {
  sessionId: number;
  sourceType: string;
  topicId?: number | null;
  setTitle: string;
  contentType: string;
  isExtraPractice: boolean;
  isResumedSession?: boolean;
  previouslyReviewedCount?: number;
  totalCardsInSession: number;
  remainingCardsCount: number;
  requeuedCount: number;
  startedAt: string;
  cards: FlashcardCardItem[];
}

export interface RateFlashcardRequest {
  itemType: FlashcardContentType;
  itemId: number;
  rating: FlashcardRating;
}

export interface FlashcardRateResult {
  sessionId: number;
  itemType: FlashcardContentType;
  itemId: number;
  rating: FlashcardRating;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt?: string | null;
  requeuedInSession: boolean;
  remainingCardsCount: number;
  isSessionCompleted: boolean;
}

export interface FlashcardSessionSummary {
  sessionId: number;
  sourceType: string;
  setTitle: string;
  contentType: string;
  isExtraPractice: boolean;
  isEarlyExit?: boolean;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  totalCardsInSession?: number;
  reviewedCardsCount?: number;
  unreviewedCardsCount?: number;
  totalReviewed: number;
  againCount: number;
  goodCount: number;
  easyCount: number;
  difficultItems: FlashcardReviewLogItem[];
}

export interface FlashcardReviewLogItem {
  logId: number;
  itemType: FlashcardContentType;
  itemId: number;
  frontText: string;
  meaning: string;
  rating: FlashcardRating;
  isNewCard: boolean;
  intervalBefore: number;
  intervalAfter: number;
  reviewedAt: string;
}

export interface FlashcardSessionHistoryItem {
  sessionId: number;
  sourceType: string;
  topicId?: number | null;
  setTitle: string;
  contentType: string;
  isExtraPractice: boolean;
  isIncomplete?: boolean;
  startedAt: string;
  endedAt?: string | null;
  lastActivityAt?: string | null;
  durationSeconds: number;
  totalCards: number;
  reviewedCardsCount?: number;
  unreviewedCardsCount?: number;
  totalReviews?: number;
  againCount: number;
  goodCount: number;
  easyCount: number;
}

export interface FlashcardSessionHistoryDetail {
  session: FlashcardSessionHistoryItem;
  logs: FlashcardReviewLogItem[];
}

export interface ToggleBookmarkResponse {
  isBookmarked: boolean;
  vocabularyId?: number | null;
  grammarId?: number | null;
}
