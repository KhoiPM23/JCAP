import type { LearningContentKind } from '../../types/learnerLearning';

export const LEARNING_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
export function positivePage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 1000000 ? page : 1;
}
export function contentKind(value: string | null): LearningContentKind { return value === 'grammars' ? 'grammars' : 'vocabularies'; }
export function catalogHref(params: URLSearchParams) {
  const back = new URLSearchParams();
  if (params.get('catalogKind') === 'grammars') back.set('kind', 'grammars');
  const page = positivePage(params.get('catalogPage')); if (page > 1) back.set('page', String(page));
  const level = params.get('catalogLevel'); if (level && LEARNING_LEVELS.includes(level)) back.set('level', level);
  const keyword = params.get('catalogKeyword')?.slice(0, 200); if (keyword) back.set('keyword', keyword);
  return `/learning/topics${back.size ? `?${back}` : ''}`;
}
export function topicHref(topicId: number, params: URLSearchParams, kind?: LearningContentKind, fromCatalog = false) {
  const next = new URLSearchParams();
  if (fromCatalog) {
    next.set('catalogKind', contentKind(params.get('kind')));
    for (const [from, to] of [['page', 'catalogPage'], ['level', 'catalogLevel'], ['keyword', 'catalogKeyword']]) {
      const value = params.get(from); if (value) next.set(to, value);
    }
  } else {
    for (const name of ['catalogKind', 'catalogPage', 'catalogLevel', 'catalogKeyword']) { const value = params.get(name); if (value) next.set(name, value); }
  }
  next.set('tab', kind ?? contentKind(params.get('tab')));
  return `/learning/topics/${topicId}?${next}`;
}
export function sourceHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function exampleText(japanese: string, furigana: string | null) {
  const strip = (text: string) => text.replace(/\{([^|}]+)\|[^}]+\}/g, '$1').trim();
  return furigana && strip(furigana) === strip(japanese) ? furigana : japanese;
}
export function pageNumbers(page: number, last: number): (number | null)[] {
  const pages = [...new Set([1, last, page - 1, page, page + 1].filter(p => p >= 1 && p <= last))].sort((a, b) => a - b);
  return pages.flatMap((p, index) => index > 0 && p - pages[index - 1] > 1 ? [null, p] : [p]);
}
