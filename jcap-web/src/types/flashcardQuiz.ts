import type { FlashcardContentType } from './flashcard';

export type QuizQuestionTypeDto = 'true_false' | 'multiple_choice' | 'matching' | 'written';
export type QuizDirectionDto = 'ja_to_vi' | 'vi_to_ja' | 'mixed';
export type QuizCardScopeDto = 'all' | 'learned' | 'due' | 'bookmarked';

export interface SubmitFlashcardQuizAttemptItem {
  questionIndex: number;
  questionType: QuizQuestionTypeDto;
  direction: 'ja_to_vi' | 'vi_to_ja';
  itemType: FlashcardContentType;
  itemId: number;
  promptText: string;
  correctAnswer: string;
  userAnswer?: string | null;
  isCorrect: boolean;
  isSkipped: boolean;
}

export interface SubmitFlashcardQuizAttemptRequest {
  sourceType: 'TopicSet' | 'Bookmark';
  topicId?: number | null;
  contentType: FlashcardContentType | 'Mixed';
  setTitle?: string;
  direction: QuizDirectionDto;
  cardScope: QuizCardScopeDto;
  instantFeedback: boolean;
  durationSeconds: number;
  items: SubmitFlashcardQuizAttemptItem[];
}

export interface FlashcardQuizHistoryItem {
  attemptId: number;
  sourceType: 'TopicSet' | 'Bookmark' | string;
  topicId?: number | null;
  setTitle: string;
  contentType: FlashcardContentType | 'Mixed' | string;
  direction: QuizDirectionDto | string;
  cardScope: QuizCardScopeDto | string;
  instantFeedback: boolean;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  scorePercent: number;
  durationSeconds: number;
  startedAt: string;
  completedAt: string;
}

export interface FlashcardQuizAttemptItemDetail {
  itemLogId: number;
  questionIndex: number;
  questionType: QuizQuestionTypeDto | string;
  direction: 'ja_to_vi' | 'vi_to_ja' | string;
  itemType: FlashcardContentType | string;
  itemId: number;
  frontText: string;
  meaning: string;
  promptText: string;
  correctAnswer: string;
  userAnswer?: string | null;
  isCorrect: boolean;
  isSkipped: boolean;
  answeredAt: string;
}

export interface FlashcardQuizHistoryDetail {
  attempt: FlashcardQuizHistoryItem;
  items: FlashcardQuizAttemptItemDetail[];
}
