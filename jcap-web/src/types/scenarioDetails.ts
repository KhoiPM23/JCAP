export interface ScenarioMission {
  id: number;
  content: string;
  order: number;
  completionCriteria: {
    intent: string;
    target: string;
    conditions: string[];
  };
}

export interface ScenarioVocabulary {
  id: number;
  word: string;
  reading?: string;
  meaning: string;
}

export interface ScenarioGrammar {
  id: number;
  pattern: string;
  meaning: string;
  exampleSentence?: string;
}

export interface ScenarioLevelConfiguration {
  id: number;
  scenarioId: number;
  jlptLevel: 'N5' | 'N4' | 'N3';
  title: string;
  description: string;
  aiPersona: string;
  creditCost: number;
  status: 'Draft' | 'Published' | 'Archived';
  missions: ScenarioMission[];
  targetVocabularies: ScenarioVocabulary[];
  targetGrammars: ScenarioGrammar[];
}

export interface ScenarioDetails {
  id: number;
  title: string;
  description: string;
  thumbnail?: string;
  isActive: boolean;
  scenarioCode?: string;
  levelConfigurations: ScenarioLevelConfiguration[];
}
