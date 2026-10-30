export type LearningKind = 'topics' | 'vocabularies' | 'grammars';
export type ContentKind = Exclude<LearningKind, 'topics'>;
export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export interface TopicOption { id: number; code: string; name: string; jlptLevel: string; isActive: boolean }
export interface TopicRow extends TopicOption { description: string | null; vocabularyCount: number; grammarCount: number }
export interface ContentRow { id: number; text: string; reading: string | null; meaning: string; jlptLevel: string; partOfSpeech: string | null; isActive: boolean; exampleCount: number; topics: TopicOption[] }
export interface ExampleInfo { id: number; japaneseText: string; vietnameseTranslation: string | null; furigana: string | null; orderIndex: number; sourceName: string | null; externalId: string | null }
export interface SaveExample { id?: number; japaneseText: string; vietnameseTranslation: string | null; furigana: string | null }
export interface SourceInfo { name: string; version: string; sourceUrl: string; license: string; licenseUrl: string; attribution: string; externalId: string }
export interface ContentDetail { item: ContentRow; formation: string | null; explanation: string | null; usageNotes: string | null; examples: ExampleInfo[]; sources: SourceInfo[]; shadowingUses: number; exploreUses: number }
export interface TopicDetail { topic: TopicRow; vocabularies: ContentRow[]; grammars: ContentRow[] }
export interface SaveTopic { code: string; name: string; jlptLevel: string; description: string | null }
export interface SaveContent { text: string; reading: string | null; meaning: string; jlptLevel: string; partOfSpeech: string | null; formation: string | null; explanation: string | null; usageNotes: string | null; topicIds: number[]; examples: SaveExample[]; allowSimilar: boolean }
export interface LearningPage<T> { items: T[]; total: number; page: number; pageSize: number }
export type LearningFilters = { keyword?: string; jlptLevel?: string; topicId?: string; untopiced?: string; isActive?: string; partOfSpeech?: string; page?: string; pageSize?: string };
