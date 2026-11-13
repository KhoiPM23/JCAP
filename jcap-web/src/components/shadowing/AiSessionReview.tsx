import { useState } from 'react';
import { Button, FeedbackItem } from '../jcap';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingAiReviewPoint, ShadowingSessionAiReview } from '../../types/shadowing';

interface Props {
  sessionId: string;
}

function Points({ title, items }: { title: string; items: ShadowingAiReviewPoint[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h6 className="m-0 text-xs font-bold text-sumi">{title}</h6>
      {items.map((p, i) => (
        <FeedbackItem key={i} tone="warning" title={p.point}>
          {p.evidence && <p>{p.evidence}</p>}
          {p.advice && <p className="text-sumi">{p.advice}</p>}
        </FeedbackItem>
      ))}
    </div>
  );
}

/**
 * Nhận xét chi tiết buổi luyện do AI viết từ số liệu hệ thống đã đo (điểm nội dung, lỗi từng âm, nhịp nói so với giọng mẫu).
 * Chỉ tạo khi người học bấm; không lưu lại, không phải điểm.
 */
export default function AiSessionReview({ sessionId }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [review, setReview] = useState<ShadowingSessionAiReview | null>(null);
  const [error, setError] = useState('');

  const generate = async () => {
    setState('loading');
    setError('');
    const res = await shadowingService.createSessionAiReview(sessionId);
    if (res.success && res.data) {
      setReview(res.data);
      setState('done');
    } else {
      setError(res.message || 'Chưa tạo được nhận xét lúc này. Hãy thử lại sau ít phút.');
      setState('error');
    }
  };

  if (state !== 'done' || !review) {
    return (
      <div className="space-y-2">
        <Button variant="secondary" size="sm" icon="auto_awesome" loading={state === 'loading'} onClick={generate} disabled={state === 'loading'}>
          {state === 'loading' ? 'Đang viết nhận xét…' : state === 'error' ? 'Thử lại nhận xét từ AI' : 'Nhận xét chi tiết từ AI'}
        </Button>
        {state === 'error' && (
          <p role="alert" className="text-xs text-danger">{error}</p>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Nhận xét chi tiết từ AI" className="space-y-3 rounded-2xl border border-line bg-paper-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="m-0 text-sm font-bold text-sumi">Nhận xét chi tiết từ AI</h5>
        <span className="text-[11px] text-sumi-muted">Viết từ số liệu đã đo, không phải điểm</span>
      </div>
      <p className="text-sm text-sumi">{review.overview}</p>

      {review.strengths.length > 0 && (
        <div>
          <h6 className="m-0 text-xs font-bold text-sumi">Bạn làm tốt</h6>
          {review.strengths.map((s, i) => (
            <FeedbackItem key={i} tone="success" title={s} />
          ))}
        </div>
      )}

      <Points title="Từ và âm cần chỉnh" items={review.content} />
      <Points title="Nhịp nói (so với giọng mẫu, tham khảo)" items={review.fluency} />

      {review.nextSteps.length > 0 && (
        <div>
          <h6 className="m-0 text-xs font-bold text-sumi">Nên làm tiếp</h6>
          {review.nextSteps.map((s, i) => (
            <FeedbackItem key={i} tone="tip" title={s} />
          ))}
        </div>
      )}
    </section>
  );
}
