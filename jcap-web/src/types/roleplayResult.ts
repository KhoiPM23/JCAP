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

export interface RoleplayResultDetail extends RoleplayResultSummary {
  grammarScore: number;
  vocabularyScore: number;
  impressionScore: number;
  generalFeedbackText: string;
  completedMissions: CompletedMissionResult[];
}

export interface RoleplayResultHistoryResponse {
  items: RoleplayResultSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
