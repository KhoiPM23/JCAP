export interface ScenarioTopic {
  id: number;
  code: string;
  name: string;
  description?: string;
  scenarioCount: number;
  isPrimary: boolean;
  icon: string;
}

export interface ScenarioListItem {
  id: number;
  title: string;
  description: string;
  thumbnail?: string;
  isActive: boolean;
  scenarioCode?: string;
  supportedJLPTLevels: string[];
  topicId?: number;
  topicCode?: string;
  topicName?: string;
}

export interface AiGeneratedScenario {
  title: string;
  japaneseTitle?: string;
  description: string;
  scenarioCode: string;
  jlptLevel: string;
  aiPersona: string;
  voiceVoxVoiceId: number;
  voiceVoxVoiceName: string;
  topicCode: string;
  topicName: string;
  missions: Array<{ order: number; content: string; target?: string; intent?: string; conditions?: string[] }>;
  compatibleEvents: string[];
  targetVocabularies: Array<{ word: string; reading?: string; meaning: string }>;
  targetGrammars: Array<{ pattern: string; meaning: string; exampleSentence?: string }>;
}

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

export interface GeneratedLevelContent {
  jlptLevel: string;
  title: string;
  description: string;
  aiPersona: string;
  missions: {
    content: string;
    order: number;
    intent?: string;
    target?: string;
    conditions?: string[];
  }[];
  targetVocabularies: {
    word: string;
    reading?: string;
    meaning: string;
  }[];
  targetGrammars: {
    pattern: string;
    meaning: string;
    exampleSentence?: string;
  }[];
}
