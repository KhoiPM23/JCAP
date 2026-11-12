import { Badge, FeedbackItem } from '../jcap';
import type { ShadowingDiffToken } from '../../types/shadowing';
import { buildWordFeedback, issueLabel, type WordFeedback } from '../../utils/wordFeedback';

interface Props {
  tokens?: ShadowingDiffToken[] | null;
}

/** "Mẫu ↔ Bạn nói" của một từ: hai cột ngắn để mắt so được ngay chỗ khác nhau. */
function Compare({ expected, spoken }: { expected: string | null; spoken: string | null }) {
  if (!expected && !spoken) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] leading-5">
      {expected && (
        <>
          <dt className="text-sumi-muted">Mẫu</dt>
          <dd lang="ja" className="font-jp text-sumi">{expected}</dd>
        </>
      )}
      {spoken && (
        <>
          <dt className="text-sumi-muted">Bạn nói</dt>
          <dd lang="ja" className="font-jp text-danger">{spoken}</dd>
        </>
      )}
    </dl>
  );
}

function Item({ item }: { item: WordFeedback }) {
  if (item.kind === 'extra') {
    return (
      <FeedbackItem tone="warning" title="Nói thừa">
        <p>
          Bạn nói thêm <span lang="ja">「{item.spoken}」</span> không có trong câu mẫu.
        </p>
      </FeedbackItem>
    );
  }

  const title = <span lang="ja" className="font-jp">「{item.word}」</span>;

  if (item.kind === 'missing') {
    return (
      <FeedbackItem tone="error" title={title}>
        <p>Bạn chưa nói từ này.</p>
        <Compare expected={item.expected} spoken={null} />
      </FeedbackItem>
    );
  }

  return (
    <FeedbackItem tone="warning" title={title}>
      <Compare expected={item.expected} spoken={item.spoken} />
      {item.issues.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {item.issues.map((issue, i) => (
            <li key={i} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-2">
              <Badge tone="warning" className="shrink-0 self-start">{issueLabel(issue)}</Badge>
              <span className="min-w-0">
                <span className="block text-sumi">{issue.message}</span>
                {issue.hint && <span className="block text-[13px] leading-5 text-sumi-muted">{issue.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">Khác nhiều so với mẫu. Nghe lại giọng mẫu rồi đọc chậm từng âm.</p>
      )}
    </FeedbackItem>
  );
}

/**
 * Nhận xét theo từ cho một câu: mỗi từ chưa đúng là một mục (so mẫu với điều bạn nói, rồi từng lỗi âm kèm cách sửa).
 * Thứ tự theo câu. Không có lỗi thì không hiện gì.
 */
export default function WordFeedbackList({ tokens }: Props) {
  const items = buildWordFeedback(tokens);
  if (items.length === 0) return null;
  return (
    <section aria-label="Cần chỉnh" className="rounded-xl border border-line bg-paper-50 px-3.5">
      <h5 className="m-0 pt-3 text-xs font-bold text-sumi">
        Cần chỉnh {items.length > 1 ? `(${items.length} chỗ)` : ''}
      </h5>
      {items.map((item, i) => (
        <Item key={i} item={item} />
      ))}
    </section>
  );
}
