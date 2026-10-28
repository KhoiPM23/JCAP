import type { RoleplayMessageDto } from './roleplay';

export interface CompleteRoleplaySessionResponse {
  resultId: number;
  isExistingResult: boolean;
  isMockEvaluation: boolean;
}

export interface CompletedMissionResult {
  missionId: number;
  title: string;
}

export interface RoleplayResultSummary {
  id: number;
  roleplaySessionId: number;
  scenarioId?: number;
  scenarioTitle: string;
  jlptLevel: string;
  overallScore: number;
  passStatus: boolean;
  completedAt: string;
}

export interface TargetVocabulary {
  id: number;
  word: string;
  reading?: string;
  meaning: string;
}

export interface TargetGrammar {
  id: number;
  pattern: string;
  meaning: string;
  exampleSentence?: string;
}

export interface RoleplayMissionProgress {
  missionId: number;
  content: string;
  target?: string;
  order: number;
  isCompleted: boolean;
  completedAt?: string;
}

export interface RoleplayAttemptComparison {
  attemptNumber: number;
  previousOverallScore?: number;
  scoreDelta: number;
  overallScore: number;
  previousLatencySeconds?: number;
  latencyDeltaSeconds?: number;
  currentLatencySeconds: number;
  previousPace?: number;
  paceDelta?: number;
  currentPace: number;
  progressSummary: string;
}

export interface RoleplayResultDetail extends RoleplayResultSummary {
  grammarScore: number;
  vocabularyScore: number;
  impressionScore: number;
  fluencyScore?: number;
  speechConfidenceScore?: number;
  averageResponseLatencySeconds?: number;
  averageSpeechPace?: number;
  generalFeedbackText: string;
  completedMissions: CompletedMissionResult[];
  allMissions?: RoleplayMissionProgress[];
  targetVocabularies?: TargetVocabulary[];
  targetGrammars?: TargetGrammar[];
  messages?: RoleplayMessageDto[];
  attemptComparison?: RoleplayAttemptComparison;
}

export interface RoleplayResultHistoryResponse {
  items: RoleplayResultSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
