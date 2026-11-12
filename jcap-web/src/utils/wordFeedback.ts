import type { ShadowingDiffToken, ShadowingMoraIssue } from '../types/shadowing';

/** Nhãn ngắn cho loại lỗi của một âm. */
export function issueLabel(issue: ShadowingMoraIssue): string {
  switch (issue.errorType) {
    case 'sokuon': return 'Âm ngắt っ';
    case 'chouon': return 'Trường âm';
    case 'hatsuon': return 'Âm ん';
    case 'voicing': return 'Âm đục / trong';
    default:
      return issue.kind === 'extra' ? 'Thừa âm' : issue.kind === 'missing' ? 'Thiếu âm' : 'Sai âm';
  }
}

export type WordFeedback =
  /** Từ đọc sai: so mẫu với điều người học nói, kèm lỗi từng âm (rỗng nếu nói khác hẳn). */
  | { kind: 'mismatched'; word: string; expected: string | null; spoken: string | null; issues: ShadowingMoraIssue[] }
  /** Từ chưa nói. */
  | { kind: 'missing'; word: string; expected: string | null }
  /** Âm nói thừa đứng riêng giữa các từ. */
  | { kind: 'extra'; spoken: string };

const PUNCT = /[。、！？!?.,「」『』（）()・\s]/g;
const clean = (s: string | null | undefined) => (s ?? '').replace(PUNCT, '');

/** Gom các token sai của câu thành từng mục nhận xét, theo thứ tự trong câu. */
export function buildWordFeedback(tokens: ShadowingDiffToken[] | null | undefined): WordFeedback[] {
  const items: WordFeedback[] = [];
  for (const t of tokens ?? []) {
    if (t.status === 'correct') continue;
    if (t.status === 'mismatched' && t.errorType === 'extra') {
      const spoken = clean(t.spokenPart || t.text);
      if (spoken) items.push({ kind: 'extra', spoken });
      continue;
    }
    const word = clean(t.text);
    if (!word) continue;
    const expected = t.expectedReading && clean(t.expectedReading) !== word ? clean(t.expectedReading) : null;
    if (t.status === 'missing') items.push({ kind: 'missing', word, expected });
    else items.push({ kind: 'mismatched', word, expected, spoken: clean(t.spokenPart) || null, issues: t.issues ?? [] });
  }
  return items;
}
