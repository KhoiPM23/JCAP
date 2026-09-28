export interface ShadowingSentenceItem {
  id: number;
  orderIndex: number;
  speakerRole: 'A' | 'B';
  japaneseText: string;
  romajiText?: string | null;
  vietnameseTranslation: string;
  nativeAudioUrl: string;
}

export interface ShadowingVocabularyItem {
  id: number;
  word: string;
  reading?: string | null;
  meaning: string;
}

export interface ShadowingGrammarItem {
  id: number;
  pattern: string;
  meaning: string;
  exampleSentence?: string | null;
}

export interface ShadowingDialogueItem {
  id: number;
  scenarioId: number;
  scenarioTitle: string;
  title: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  sourceDescription?: string | null;
  speakerRoleA_Name: string;
  speakerRoleB_Name: string;
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
  accuracyScore: number;
  evaluationTier: 'green' | 'yellow' | 'red';
  audioBlobUrl?: string;
}

export interface ShadowingSessionCompletePayload {
  dialogueId: number;
  learnerRole: 'A' | 'B';
  overallAccuracyScore: number;
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
  durationSeconds: number;
  sentenceResults: ShadowingSentencePracticeResult[];
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
  speakerRole: 'A' | 'B';
  japaneseText: string;
  romajiText?: string | null;
  vietnameseTranslation: string;
  nativeAudioUrl: string;
}

export interface CreateShadowingDialoguePayload {
  scenarioId: number;
  title: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  sourceDescription?: string | null;
  speakerRoleA_Name: string;
  speakerRoleB_Name: string;
  sentences: CreateShadowingSentencePayload[];
}

export interface UpdateShadowingDialoguePayload {
  title: string;
  jlptLevel: 'N5' | 'N4' | 'N3';
  sourceDescription?: string | null;
  speakerRoleA_Name: string;
  speakerRoleB_Name: string;
  isActive: boolean;
  sentences: CreateShadowingSentencePayload[];
}

