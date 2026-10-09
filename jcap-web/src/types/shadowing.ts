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

export interface ShadowingTextbookItem {
  id: string;
  title: string;
  japaneseTitle?: string;
  level: 'N5' | 'N4' | 'N3';
  coverImage?: string;
  description: string;
  publisher?: string;
  totalChapters: number;
  totalDialogues: number;
}

export interface ShadowingChapterItem {
  id: string;
  textbookId: string;
  chapterNumber: number;
  title: string;
  japaneseTitle?: string;
  description: string;
  dialoguesCount: number;
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

export interface ShadowingSentencePracticeResult {
  sentenceId: number;
  orderIndex: number;
  targetText: string;
  recognizedText: string;
  contentMatchScore: number; // 0 - 100 (60% trọng số)
  fluencyScore: number; // 0 - 100 (40% trọng số)
  overallScore: number; // Điểm tổng kết câu = 60% Content Match + 40% Fluency
  accuracyScore: number; // Backward compatibility (= contentMatchScore)
  intonationScore?: number;
  evaluationStatus?: 'completed' | 'partial' | 'unavailable' | 'failed';
  feedback?: string;
  missingWords?: string[];
  mismatchedWords?: string[];
  audioGateStatus: 'good' | 'acceptable' | 'needs_retry';
  audioGateLabel: string;
  audioQualityScore?: number;
  isValidForBestAttempt: boolean;
  attemptsCount: number;
  evaluationTier: 'green' | 'yellow' | 'red';
  diffTokens?: { text: string; status: 'correct' | 'mismatched' | 'missing'; spokenPart?: string }[];
  audioBlobUrl?: string;
  durationMs?: number;
  targetAudioUrl?: string;
  romajiText?: string;
  vietnameseTranslation?: string;
}

export interface ShadowingSessionCompletePayload {
  dialogueId: number;
  learnerRole: 'A' | 'B';
  overallContentMatchScore: number; // 60%
  overallFluencyScore: number; // 40%
  weightedOverallScore: number; // 60% Match + 40% Fluency
  overallAccuracyScore: number; // Backward compatibility
  overallIntonationScore?: number;
  overallAudioQualityScore?: number;
  audioQualityStatus?: string;
  overallAudioGateStatus: 'good' | 'acceptable' | 'needs_retry';
  audioGateLabel: string;
  durationSeconds: number;
  sentencesPracticed: number;
  totalGreenSentences: number;
  totalYellowSentences: number;
  totalRedSentences: number;
  sentenceResults: ShadowingSentencePracticeResult[];
}

export interface ShadowingAiAnalysisPayload {
  dialogueId: number;
  learnerRole: 'A' | 'B';
  overallAccuracyScore: number;
  overallContentMatchScore?: number;
  overallFluencyScore?: number;
  overallIntonationScore?: number;
  overallAudioQualityScore?: number;
  durationSeconds: number;
  sentenceResults: ShadowingSentencePracticeResult[];
  audioDataMap?: Record<number, string>;
}

export interface ShadowingAiAnalysisResult {
  creditsDeducted: number;
  remainingCreditBalance: number;
  tokyoIntonationScore: number;
  vowelClarityScore: number;
  rhythmTempoScore: number;
  pitchAccentScore: number;
  longVowelPrecisionScore: number;
  overallDiagnosis: string;
  keyStrengths: string[];
  improvementActionItems: string[];
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

