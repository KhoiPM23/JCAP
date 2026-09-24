export interface ShadowingSentenceItem {
  id: number;
  orderIndex: number;
  speakerRole: 'A' | 'B';
  japaneseText: string;
  romajiText?: string | null;
  vietnameseTranslation: string;
  nativeAudioUrl: string;
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
  sentences: ShadowingSentenceItem[];
}

export interface ShadowingFilterParams {
  keyword?: string;
  jlptLevel?: string;
  scenarioId?: number;
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
