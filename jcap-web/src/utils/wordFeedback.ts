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
  /** Âm nói thừa đứng riêng giữa các từ; `before`/`after`: từ của câu mẫu ngay sau/trước chỗ đó (để nói "trước 「成田」"). */
  | { kind: 'extra'; spoken: string; before: string | null; after: string | null };

const PUNCT = /[。、！？!?.,「」『』（）()・\s]/g;
const clean = (s: string | null | undefined) => (s ?? '').replace(PUNCT, '');
/** Âm nói thừa lấy từ cách đọc (katakana): đổi sang hiragana cho thống nhất với dòng "Bạn nói". */
const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Gom các token sai của câu thành từng mục nhận xét, theo thứ tự trong câu. */
export function buildWordFeedback(tokens: ShadowingDiffToken[] | null | undefined): WordFeedback[] {
  const items: WordFeedback[] = [];
  const list = tokens ?? [];
  const isExtra = (t: ShadowingDiffToken) => t.status === 'mismatched' && t.errorType === 'extra';
  /** Từ câu mẫu gần nhất theo hướng `step` (bỏ qua âm thừa khác); token đúng có thể gộp nhiều từ nên lấy phần sát chỗ thừa. */
  const neighbour = (from: number, step: 1 | -1): string | null => {
    for (let j = from + step; j >= 0 && j < list.length; j += step) {
      if (isExtra(list[j])) continue;
      const parts = list[j].text.split(/[。、！？!?\s]+/).map(clean).filter(Boolean);
      return (step === 1 ? parts[0] : parts[parts.length - 1]) ?? null;
    }
    return null;
  };
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.status === 'correct') continue;
    if (isExtra(t)) {
      const spoken = toHiragana(clean(t.spokenPart || t.text));
      if (spoken) items.push({ kind: 'extra', spoken, before: neighbour(i, 1), after: neighbour(i, -1) });
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
