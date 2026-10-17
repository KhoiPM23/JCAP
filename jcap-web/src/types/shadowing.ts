export interface ShadowingSentenceItem {
  id: number;
  orderIndex: number;
  speakerRole: string; // 'A' | 'B' | 'C' etc.
  japaneseText: string;
  romajiText?: string | null;
  vietnameseTranslation: string;
  nativeAudioUrl?: string | null;
  audioDurationMs?: number | null;
}

export interface ShadowingVocabularyItem {
  id?: number;
  word: string;
  reading?: string | null;
  meaning: string;
  wordClass?: string;
  jlptLevel?: string;
  exampleSentence?: string | null;
}

export interface ShadowingGrammarItem {
  id?: number;
  pattern: string;
  meaning: string;
  exampleSentence?: string | null;
  jlptLevel?: string;
}

export interface ShadowingDialogueItem {
  id: number;
  scenarioId: number;
  scenarioTitle: string;
  textbookId?: string;
  textbookTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  title: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  sourceDescription?: string | null;
  speakerRoleA_Name: string;
  speakerRoleB_Name: string;
  speakerRoles?: string[];
  totalSentences: number;
  isActive: boolean;
  createdAt: string;
}

export interface ShadowingDialogueDetail extends ShadowingDialogueItem {
  scenarioDescription?: string | null;
  scenarioLevelDescription?: string | null;
  sentences: ShadowingSentenceItem[];
  targetVocabularies?: ShadowingVocabularyItem[];
  targetGrammars?: ShadowingGrammarItem[];
}

export interface ShadowingFilterParams {
  keyword?: string;
  jlptLevel?: string;
  scenarioId?: number;
}

export type ShadowingEvaluationStatus = 'completed' | 'partial' | 'unavailable' | 'failed';
export type ShadowingAudioQualityStatus = 'good' | 'acceptable' | 'needs_retry' | 'unmeasured';

export interface ShadowingDiffToken {
  text: string;
  status: 'correct' | 'mismatched' | 'missing';
  spokenPart?: string | null;
  /** Cách đọc chuẩn (kana) của đoạn này; chỉ có với đoạn chưa đúng, dùng làm chú thích. */
  expectedReading?: string | null;
  errorType?: ShadowingDiffErrorType | null;
}

/** Loại lỗi do bộ so khớp theo từ (kana-word-v1) phân loại; các giá trị cũ (particle/word) chỉ còn trong bản ghi cũ. */
export type ShadowingDiffErrorType =
  | 'chouon' | 'sokuon' | 'hatsuon' | 'voicing' | 'mora' | 'extra'
  | 'particle' | 'word';

/**
 * Số liệu thô về nhịp nói do backend đo từ tín hiệu. KHÔNG phải điểm, KHÔNG nói lên phát âm đúng/sai
 * và chưa được tính vào điểm tổng. status = 'unavailable' nghĩa là không đo được (kèm reasonCode), không phải 0.
 */
export interface ShadowingFluencyMetrics {
  status: 'available' | 'unavailable';
  reasonCode?: string | null;
  version: string;
  durationMs?: number | null;
  leadingSilenceMs?: number | null;
  trailingSilenceMs?: number | null;
  speechSpanMs?: number | null;
  speechMs?: number | null;
  speechRatio?: number | null;
  pauseCount?: number | null;
  totalPauseMs?: number | null;
  longestPauseMs?: number | null;
  pauseRatio?: number | null;
  pauses?: { startMs: number; endMs: number; durationMs: number }[];
  moraCount?: number | null;
  speakingRateMoraPerSec?: number | null;
  articulationRateMoraPerSec?: number | null;
  /** Số liệu nhịp nói của giọng mẫu (cùng bộ VAD). */
  reference?: { source: string; speakerId?: number | null; metrics: ShadowingFluencyMetrics } | null;
  /** Kết quả so với giọng mẫu. status = 'unavailable' nghĩa là KHÔNG đủ điều kiện so sánh, không phải nói tốt hay kém. */
  comparison?: ShadowingFluencyComparison | null;
  /** Nhận xét có bằng chứng (tối đa 3). */
  observations?: ShadowingFluencyObservation[];
  /** Đo thời lượng trường âm so với giọng mẫu (THỬ NGHIỆM, chưa có điểm). */
  duration?: ShadowingMoraDuration | null;
}

export interface ShadowingMoraDuration {
  status: 'available' | 'unavailable';
  reasonCode?: string | null;
  version: string;
  alignmentCost?: number | null;
  tempoRatio?: number | null;
  tempoSpread?: number | null;
  units: {
    kind: 'chouon' | string;
    text: string;
    moraIndex: number;
    referenceMs: number;
    learnerMs: number;
    relativeRatio: number;
    flagged: boolean;
  }[];
}

export interface ShadowingFluencyComparison {
  status: 'available' | 'unavailable';
  reasonCode?: string | null;
  articulationRateRatio?: number | null;
  speakingRateRatio?: number | null;
  learnerPauseCount?: number | null;
  referencePauseCount?: number | null;
  extraPauseCount?: number | null;
  moraCountConsistency?: number | null;
}

export interface ShadowingFluencyObservation {
  code: 'chouon_short' | 'slow_vs_reference' | 'fast_vs_reference' | 'extra_pause' | string;
  message: string;
  measuredValue: number;
  threshold: number;
  data?: Record<string, unknown>;
}

/** Kết quả đánh giá một câu do backend trả về. Backend là nguồn điểm duy nhất. */
export interface ShadowingAudioEvaluationResult {
  /** Id kết quả chấm backend đã lưu (chỉ có khi gửi sentenceId và câu được chấm). Dùng khi hoàn thành buổi luyện. */
  evaluationId?: string | null;
  sentenceId?: number | null;
  evaluationStatus: ShadowingEvaluationStatus;
  /** recognized | no_speech | unavailable: tách biệt với chất lượng âm thanh. */
  recognitionStatus: 'recognized' | 'no_speech' | 'unavailable';
  recognitionSource: 'gemini' | 'web_speech' | 'none';
  /** Lý do phải dùng nguồn dự phòng (vd. AI_TIMEOUT). */
  fallbackReason?: string | null;
  audioQualityStatus: ShadowingAudioQualityStatus;
  audioQualityDetail?: string | null;
  scoringVersion: string;
  comparisonMethod: string;
  /** Nguồn cách đọc đã dùng cho cả hai phía (voicevox). */
  readingSource?: string;
  /** Cách đọc (hiragana) của câu mẫu và của transcript. */
  targetReading?: string;
  recognizedReading?: string;
  targetText: string;
  recognizedText: string;
  contentMatchScore?: number | null;
  pronunciationScore?: number | null;
  fluencyScore?: number | null;
  /** Số liệu nhịp nói (tham khảo); null nếu client không gửi bản ghi phân tích. */
  fluency?: ShadowingFluencyMetrics | null;
  overallScore?: number | null;
  unavailableDimensions: string[];
  tier: 'green' | 'yellow' | 'red' | '';
  feedback: string;
  diffTokens: ShadowingDiffToken[];
  missingWords: string[];
  mismatchedWords: string[];
  source: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ShadowingSentencePracticeResult {
  sentenceId: number;
  /** Id kết quả chấm đã lưu ở backend; thiếu thì câu này không vào được lịch sử. */
  evaluationId?: string | null;
  orderIndex: number;
  targetText: string;
  /** Transcript thực tế đã chấm. Không bao giờ được thay bằng câu mẫu. */
  recognizedText: string;
  contentMatchScore: number; // 0 - 100, do backend tính
  /** null = chưa đo được đáng tin cậy (không phải 0). */
  fluencyScore: number | null;
  overallScore: number; // Điểm câu do backend tính (ShadowingScoring)
  accuracyScore: number; // Tương thích ngược (= contentMatchScore)
  /** Không còn được tạo ra: ngữ điệu chưa được đo. Chỉ còn trong bản ghi cũ. */
  intonationScore?: number;
  evaluationStatus?: ShadowingEvaluationStatus;
  recognitionSource?: 'gemini' | 'web_speech';
  fallbackReason?: string | null;
  scoringVersion?: string;
  comparisonMethod?: string;
  targetReading?: string;
  recognizedReading?: string;
  feedback?: string;
  missingWords?: string[];
  mismatchedWords?: string[];
  audioGateStatus: ShadowingAudioQualityStatus;
  audioGateLabel: string;
  /** Không còn được tạo ra (heuristic chưa hiệu chuẩn). Chỉ còn trong bản ghi cũ. */
  audioQualityScore?: number;
  isValidForBestAttempt: boolean;
  attemptsCount: number;
  evaluationTier: 'green' | 'yellow' | 'red';
  diffTokens?: ShadowingDiffToken[];
  audioBlobUrl?: string;
  durationMs?: number;
  targetAudioUrl?: string;
  romajiText?: string;
  vietnameseTranslation?: string;
}

/**
 * Hoàn thành buổi luyện: chỉ gửi Id các kết quả chấm backend đã trả, KHÔNG gửi điểm.
 * Backend tự đọc điểm đã lưu, tính điểm tổng và lưu buổi luyện vào lịch sử.
 */
export interface ShadowingSessionCompletePayload {
  dialogueId: number;
  learnerRole: 'A' | 'B';
  durationSeconds: number;
  startedAt?: string;
  evaluationIds: string[];
}

/** Phản hồi của backend khi hoàn thành buổi luyện (điểm tổng do backend tính từ kết quả đã lưu). */
export interface ShadowingSessionCompleteResult {
  sessionId: string;
  dialogueId: number;
  dialogueTitle: string;
  overallAccuracyScore: number;
  overallFluencyScore?: number | null;
  audioQualityStatus: string;
  weightedOverallScore: number;
  scoringVersion: string;
  rankTitle: string;
  summaryFeedback: string;
  learnerSentenceCount: number;
  scoredSentenceCount: number;
}

/** Một câu trong buổi luyện đã lưu ở backend. */
export interface ShadowingSessionSentenceRecord {
  evaluationId: string;
  sentenceId: number;
  orderIndex: number;
  targetText: string;
  recognizedText: string;
  contentMatchScore: number;
  overallScore: number;
  tier: 'green' | 'yellow' | 'red' | '';
  feedback: string;
  scoringVersion: string;
  diffTokens: ShadowingDiffToken[];
  evaluatedAt: string;
}

/** Một buổi luyện trong lịch sử, đọc từ backend (ShadowingPracticeSession). */
export interface ShadowingPracticeSessionRecord {
  id: string;
  dialogueId: number;
  dialogueTitle: string;
  scenarioTitle: string;
  jlptLevel: string;
  learnerRole: 'A' | 'B';
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  contentMatchScore: number;
  fluencyScore?: number | null;
  weightedOverallScore: number;
  scoringVersion: string;
  audioQualityStatus: string;
  rankTitle: string;
  learnerSentenceCount: number;
  scoredSentenceCount: number;
  sentences: ShadowingSessionSentenceRecord[];
}

export interface CreateShadowingSentencePayload {
  orderIndex: number;
  speakerRole: string;
  japaneseText: string;
  romajiText?: string | null;
  vietnameseTranslation: string;
  nativeAudioUrl?: string | null;
  audioDurationMs?: number | null;
}

export interface CreateShadowingDialoguePayload {
  scenarioId: number;
  title: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  sourceDescription?: string | null;
  speakerRoleA_Name: string;
  speakerRoleB_Name: string;
  speakerRoles?: string[];
  sentences: CreateShadowingSentencePayload[];
  targetVocabularies?: ShadowingVocabularyItem[];
  targetGrammars?: ShadowingGrammarItem[];
}

export interface UpdateShadowingDialoguePayload {
  title: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  sourceDescription?: string | null;
  speakerRoleA_Name: string;
  speakerRoleB_Name: string;
  speakerRoles?: string[];
  isActive: boolean;
  sentences: CreateShadowingSentencePayload[];
  targetVocabularies?: ShadowingVocabularyItem[];
  targetGrammars?: ShadowingGrammarItem[];
}

export * from './shadowingProgress';

export interface GenerateShadowingDialoguePayload {
  scenarioId?: number;
  contextTitle: string;
  contextDescription?: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  speakerRoles?: string[];
  sentenceCount?: number;
  vocabCount?: number;
  grammarCount?: number;
  customInstructions?: string;
}

export interface GeneratedShadowingDialogueResult {
  title: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  contextDescription?: string;
  speakerRoles: string[];
  sentences: CreateShadowingSentencePayload[];
  targetVocabularies: ShadowingVocabularyItem[];
  targetGrammars: ShadowingGrammarItem[];
}

export interface TranslateAssistPayload {
  text: string;
  sourceLanguage: 'ja' | 'vi';
  jlptLevel?: string;
}

export interface TranslateAssistResult {
  japaneseText: string;
  romajiText?: string | null;
  vietnameseTranslation: string;
}

