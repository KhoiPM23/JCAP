import type { ScenarioVocabulary, ScenarioGrammar } from './scenarioDetails';

export interface ActiveRoleplaySessionDto {
  hasActiveSession?: boolean;
  activeSessionId?: number;
  sessionId?: number;
  id?: number;
  scenarioId?: number;
  level?: string;
  jlptLevel?: string;
  scenarioTitle?: string;
  scenarioCode?: string;
  aiPersona?: string;
  startedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  completedMissionsCount?: number;
  totalMissionsCount?: number;
}

export interface LinguisticDetailItemDto {
  type: 'success' | 'warning' | 'error' | string;
  aspect: string;
  comment: string;
}

export interface SpeechDeliveryMetricsDto {
  speakingDurationSeconds?: number;
  responseLatencySeconds?: number;
  speechConfidence?: number;
  speechPace?: number;
  turnFluencyScore?: number;
  turnAutonomyScore?: number;
  autonomyAssessment?: string;
  pronunciationClarityScore?: number;
  moraRate?: number;
  jlptLevel?: string;
  paceAssessment?: string;
  latencyAssessment?: string;
  audioUrl?: string;
}

export interface GrammarErrorItemDto {
  type?: string;
  explanation: string;
  suggestedCorrection?: string;
}

export interface GrammarAccuracyDto {
  score?: number;
  errors?: GrammarErrorItemDto[];
}

export interface LinguisticFeedbackDto {
  evaluationSource?: 'AI' | 'Simulator' | string;
  status?: string;
  quickStatus?: string;
  summary: string;
  details?: LinguisticDetailItemDto[];
  grammarAssessment?: string;
  grammarAccuracy?: GrammarAccuracyDto;
  vocabularyAssessment?: string;
  politenessAssessment?: string;
  naturalAlternative?: string;
  culturalTip?: string;
  speechDelivery?: SpeechDeliveryMetricsDto;
}

export interface RoleplayMessageDto {
  id: number;
  sender: 'Ai' | 'User' | string;
  japaneseText: string;
  vietnameseMeaning?: string;
  furiganaHtml?: string;
  furiganaText?: string;
  audioUrl?: string;
  userAudioUrl?: string;
  createdAt: string;
  linguisticFeedback?: LinguisticFeedbackDto;
}

export interface RoleplayMissionDto {
  missionId?: number;
  id?: number;
  order: number;
  content: string;
  target?: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface RoleplaySessionDetailsDto {
  sessionId?: number;
  id?: number;
  userId?: number | string;
  scenarioId: number;
  scenarioTitle: string;
  scenarioCode: string;
  jlptLevel?: string;
  level?: string;
  aiPersona: string;
  scenarioContext?: string;
  status: 'Active' | 'InProgress' | 'Completed' | 'Abandoned' | string;
  creditDeducted?: number;
  creditCost?: number;
  creditBalance?: number;
  isNaturallyConcluded: boolean;
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
  missions: RoleplayMissionDto[];
  messages: RoleplayMessageDto[];
  targetVocabularies?: ScenarioVocabulary[];
  targetGrammars?: ScenarioGrammar[];
  recommendedAiVoiceId?: number;
  recommendedAiVoiceName?: string;
  recommendedLearnerVoiceId?: number;
  recommendedLearnerVoiceName?: string;
  roleVoiceMappings?: Record<string, number>;
  sceneType?: string;
  npcAffinityScore?: number;
  currentDayStreak?: number;
  npcRelationshipTitle?: string;
  npcMemories?: string[];
}

export interface DetectedGrammarIssue {
  code: string;
  title: string;
  severity: 'info' | 'warning' | 'error' | string;
  matchedSnippet: string;
  suggestedFix: string;
  explanationVi: string;
}

export interface RoleplayTurnResponseDto {
  userMessage: RoleplayMessageDto;
  aiMessage: RoleplayMessageDto;
  newlyCompletedMissionIds?: number[];
  updatedMissions: RoleplayMissionDto[];
  allMissionsCompleted?: boolean;
  isNaturallyConcluded: boolean;
  creditBalance?: number;
  sessionStatus?: string;
  detectedIssues?: DetectedGrammarIssue[];
  speedScale?: number;
  shouldOfferEncouragement?: boolean;
}

export interface RoleplayHintDto {
  japaneseSuggestion?: string;
  suggestedJapaneseText?: string;
  vietnameseMeaning?: string;
  suggestedVietnameseMeaning?: string;
  contextExplanation?: string;
  explanation?: string;
  keywords?: string[];
  clozeSentence?: string;
}

export interface StartRoleplaySessionRequestDto {
  forceRestart?: boolean;
}

export interface SendRoleplayMessageRequestDto {
  message: string;
  speakingDurationSeconds?: number;
  responseLatencySeconds?: number;
  speechConfidence?: number;
  audioUrl?: string;
  hintLevelUsed?: number;
  translationPeekCount?: number;
  retryCount?: number;
  fallbackToTextInput?: boolean;
  bargeInInterrupted?: boolean;
  moraRate?: number;
  pauseRatio?: number;
}

export interface LearnerSkillMasteryItemDto {
  skillCode: string;
  skillName: string;
  category: string;
  stability: number;
  difficulty: number;
  repetitions: number;
  lapses: number;
  nextRecommendedReviewUtc: string;
  isDueForReview: boolean;
}

export interface LearnerIntelligenceProfileDto {
  userId: string;
  thetaEstimate: number;
  speakingReflexIndex: number;
  keigoCommandScore: number;
  particleAccuracyRate: number;
  averageMoraRate: number;
  hintDependencyRate: number;
  communicativeConfidenceScore: number;
  communicativeProficiencyIndex: number;
  totalSessionsCompleted: number;
  totalPracticeTurns: number;
  strengths: string[];
  targetFocusAreas: string[];
  omikujiRank: string;
  kotowazaProverb: string;
  lastPracticedAtUtc?: string;
  hesitationRate?: number;
  averageHesitationSeconds?: number;
  scaffoldTierPreference?: string;
  preferredTone?: string;
  toneConsistencyScore?: number;
  dominantWeaknessCategory?: string;
  nextRecommendedScenarioId?: number;
  nextRecommendedScenarioCode?: string;
  nextRecommendedScenarioTitle?: string;
  nextRecommendedReason?: string;
  predictedSuccessRateNextScenario?: number;
  adaptiveLearningPathStatus?: string;
  dueReviewItems?: LearnerSkillMasteryItemDto[];
}
