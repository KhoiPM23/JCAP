export interface ParsedTurnHighlight {
  badge?: string;
  text: string;
}

export interface ParsedGeneralFeedback {
  summary: string;
  turnHighlights: ParsedTurnHighlight[];
  strengths: string[];
  improvements: string[];
  delivery: string | null;
  naturalAlternatives: string[];
}

const SECTION_MARKERS = [
  { key: 'turns', label: 'Nhận xét theo lượt:' },
  { key: 'strengths', label: 'Điểm làm tốt:' },
  { key: 'improvements', label: 'Điểm cần cải thiện:' },
  { key: 'naturalAlt', label: 'Cách diễn đạt tự nhiên hơn:' },
  { key: 'delivery', label: 'Độ trôi chảy & Phát âm:' },
] as const;

type SectionKey = (typeof SECTION_MARKERS)[number]['key'];

const stripOuterPunctuation = (value: string): string =>
  value
    .replace(/^[;,\s.:•-]+/, '')
    .replace(/[;\s]+$/, '')
    .trim();

const splitIntoCleanBullets = (rawSegment?: string): string[] => {
  if (!rawSegment) return [];
  const seen = new Set<string>();
  const items: string[] = [];

  rawSegment
    .split(/(?:;\s*|\n+|(?:\.\s+(?=[A-ZÀ-Ỹ])))/)
    .map(stripOuterPunctuation)
    .filter(Boolean)
    .forEach((part) => {
      const normalizedKey = part.replace(/\.$/, '').toLowerCase();
      if (!seen.has(normalizedKey)) {
        seen.add(normalizedKey);
        items.push(part);
      }
    });

  return items;
};

const parseTurnHighlights = (rawSegment?: string): ParsedTurnHighlight[] => {
  if (!rawSegment) return [];
  return rawSegment
    .split(/(?:;\s*|\n+)/)
    .map(stripOuterPunctuation)
    .filter(Boolean)
    .map((entry) => {
      const bulletSplit = entry.match(/^([^•]+?)\s*•\s*(.+)$/);
      if (bulletSplit) {
        return {
          badge: bulletSplit[1].trim(),
          text: stripOuterPunctuation(bulletSplit[2]),
        };
      }
      return { text: entry };
    });
};

/**
 * Parses `generalFeedbackText` by locating explicit Vietnamese section markers rather than
 * fragile period-delimited regexes, preventing sections from bleeding into or duplicating each other.
 */
export const parseGeneralFeedbackSections = (rawText?: string | null): ParsedGeneralFeedback => {
  const normalized = (rawText || '').trim();
  if (!normalized) {
    return {
      summary: '',
      turnHighlights: [],
      strengths: [],
      improvements: [],
      delivery: null,
      naturalAlternatives: [],
    };
  }

  const hits: Array<{ key: SectionKey; index: number; endOfMarker: number }> = [];
  for (const marker of SECTION_MARKERS) {
    const regex = new RegExp(marker.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      hits.push({
        key: marker.key,
        index: match.index,
        endOfMarker: match.index + match[0].length,
      });
    }
  }

  hits.sort((a, b) => a.index - b.index);

  if (hits.length === 0) {
    return {
      summary: normalized,
      turnHighlights: [],
      strengths: [],
      improvements: [],
      delivery: null,
      naturalAlternatives: [],
    };
  }

  const summary = stripOuterPunctuation(normalized.slice(0, hits[0].index));
  const rawBuckets: Partial<Record<SectionKey, string>> = {};

  for (let i = 0; i < hits.length; i++) {
    const current = hits[i];
    const nextIndex = i + 1 < hits.length ? hits[i + 1].index : normalized.length;
    const body = stripOuterPunctuation(normalized.slice(current.endOfMarker, nextIndex));
    if (!body) continue;
    rawBuckets[current.key] = rawBuckets[current.key]
      ? `${rawBuckets[current.key]}; ${body}`
      : body;
  }

  const naturalAlternatives = rawBuckets.naturalAlt
    ? rawBuckets.naturalAlt
        .split(/\s*\|\s*/)
        .map(stripOuterPunctuation)
        .filter(Boolean)
    : [];

  return {
    summary,
    turnHighlights: parseTurnHighlights(rawBuckets.turns),
    strengths: splitIntoCleanBullets(rawBuckets.strengths),
    improvements: splitIntoCleanBullets(rawBuckets.improvements),
    delivery: rawBuckets.delivery ? stripOuterPunctuation(rawBuckets.delivery) : null,
    naturalAlternatives,
  };
};

