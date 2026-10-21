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

export interface RoleplayResultDetail extends RoleplayResultSummary {
  grammarScore: number;
  vocabularyScore: number;
  impressionScore: number;
  generalFeedbackText: string;
  completedMissions: CompletedMissionResult[];
  targetVocabularies?: TargetVocabulary[];
  targetGrammars?: TargetGrammar[];
  messages?: RoleplayMessageDto[];
}

export interface RoleplayResultHistoryResponse {
  items: RoleplayResultSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
