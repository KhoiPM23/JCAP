export type LearningContentKind = 'vocabularies' | 'grammars';
export interface LearnerTopic { id: number; name: string; jlptLevel: string; description: string | null; vocabularyCount: number; grammarCount: number }
export interface LearnerContentRow { id: number; text: string; reading: string | null; meaning: string; jlptLevel: string; partOfSpeech: string | null; formation: string | null; exampleCount: number }
export interface LearnerPage<T> { items: T[]; total: number; page: number; pageSize: number }
export interface LearnerContentPage { topic: LearnerTopic; contents: LearnerPage<LearnerContentRow> }
export interface LearnerSource { name: string; version: string; sourceUrl: string; license: string; licenseUrl: string; attribution: string; externalId: string | null }
export interface LearnerExample { id: number; japaneseText: string; vietnameseTranslation: string | null; furigana: string | null; externalId: string | null; source: LearnerSource | null }
export interface LearnerContentDetail { topic: LearnerTopic; item: LearnerContentRow; explanation: string | null; usageNotes: string | null; examples: LearnerExample[]; sources: LearnerSource[]; topics: LearnerTopic[]; previousId: number | null; nextId: number | null; previousPage: number; nextPage: number }
