import { useState } from 'react';
import { Button, FeedbackItem, Icon } from '../jcap';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingAiReviewSection, ShadowingSessionAiReview } from '../../types/shadowing';

interface Props {
  sessionId: string;
}

/** Một phần nhận xét: tên phần + đánh giá 1 câu, rồi từng vấn đề (bằng chứng ở dòng nhạt, cách sửa ở dòng đậm). */
function Section({ icon, title, note, section }: { icon: string; title: string; note?: string; section: ShadowingAiReviewSection }) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <Icon name={icon} size={20} className="mt-0.5 text-ai" />
        <div className="min-w-0">
          <h6 className="m-0 text-sm font-bold text-sumi">
            {title}
            {note && <span className="ml-1.5 text-xs font-normal text-sumi-muted">{note}</span>}
          </h6>
          {section.verdict && <p className="m-0 text-sm text-sumi-muted">{section.verdict}</p>}
        </div>
      </div>
      {section.issues.length > 0 && (
        <div className="mt-1 pl-7">
          {section.issues.map((p, i) => (
            <FeedbackItem key={i} tone="warning" title={p.title}>
              {p.evidence && <p>{p.evidence}</p>}
              {p.fix && <p className="font-medium text-sumi">{p.fix}</p>}
            </FeedbackItem>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Nhận xét buổi luyện do AI viết từ số liệu hệ thống đã đo, tập trung Phát âm và Lưu loát.
 * Điểm nhấn duy nhất là việc nên luyện ngay; các phần còn lại để giản dị. Chỉ tạo khi người học bấm; không lưu, không phải điểm.
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
          {state === 'loading' ? 'Đang phân tích phát âm và nhịp nói…' : state === 'error' ? 'Thử lại' : 'Nhận xét phát âm và lưu loát từ AI'}
        </Button>
        {state === 'error' && (
          <p role="alert" className="text-xs text-danger">{error}</p>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Nhận xét từ AI" className="space-y-4 rounded-2xl border border-line bg-paper-50 p-4 sm:p-5">
      <p className="m-0 text-[15px] leading-6 text-sumi">{review.summary}</p>

      {review.priority && (
        <div className="flex items-start gap-3 rounded-xl border-l-4 border-ai bg-ai-soft px-4 py-3">
          <Icon name="my_location" size={20} className="mt-0.5 text-ai" />
          <div className="min-w-0">
            <p className="m-0 text-xs font-bold text-ai">Ưu tiên luyện ngay</p>
            <p className="m-0 text-sm font-medium text-sumi">{review.priority}</p>
          </div>
        </div>
      )}

      <Section icon="record_voice_over" title="Phát âm" section={review.pronunciation} />

      {review.fluency ? (
        <Section icon="speed" title="Lưu loát" note="so với nhịp giọng mẫu" section={review.fluency} />
      ) : (
        <p className="m-0 text-xs text-sumi-muted">
          Chưa có số liệu nhịp nói: câu cần đạt nội dung từ 70 điểm thì hệ thống mới so được với giọng mẫu.
        </p>
      )}

      <p className="m-0 border-t border-line pt-3 text-[11px] text-sumi-muted">
        AI viết từ số liệu hệ thống đã đo, không phải điểm. Lỗi âm dựa trên những gì hệ thống nhận ra nên có thể bỏ sót.
      </p>
    </section>
  );
}
