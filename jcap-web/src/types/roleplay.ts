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
  jlptLevel?: string;
  paceAssessment?: string;
  latencyAssessment?: string;
}

export interface LinguisticFeedbackDto {
  evaluationSource?: 'AI' | 'Simulator' | string;
  status?: string;
  quickStatus?: string;
  summary: string;
  details?: LinguisticDetailItemDto[];
  grammarAssessment?: string;
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
}

export interface RoleplayHintDto {
  japaneseSuggestion?: string;
  suggestedJapaneseText?: string;
  vietnameseMeaning?: string;
  suggestedVietnameseMeaning?: string;
  contextExplanation?: string;
  explanation?: string;
}

export interface StartRoleplaySessionRequestDto {
  forceRestart?: boolean;
}

export interface SendRoleplayMessageRequestDto {
  message: string;
}
