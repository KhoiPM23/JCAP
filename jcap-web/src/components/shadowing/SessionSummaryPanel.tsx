import { Badge } from '../jcap';
import type { ShadowingSessionSummary } from '../../types/shadowing';
import AiSessionReview from './AiSessionReview';

const ERROR_LABEL: Record<string, string> = {
  chouon: 'trường âm',
  sokuon: 'âm ngắt っ',
  hatsuon: 'âm ん',
  voicing: 'âm đục/trong',
  mora: 'sai âm',
  extra: 'nói thừa',
  missing: 'thiếu từ',
};

const status = (s: 'COMPLETED' | 'UNAVAILABLE', completedText: string) =>
  s === 'COMPLETED' ? completedText : 'chưa khả dụng';

interface Props {
  summary: ShadowingSessionSummary;
  /** Id buổi đã lưu: có thì hiện nút nhận xét chi tiết từ AI. */
  sessionId?: string | null;
}

/**
 * Tổng kết buổi luyện do backend tính (Shadowing V2): số lần gửi chấm, câu cần luyện lại, trạng thái từng chiều,
 * và các loại lỗi trong buổi. Chiều chưa có điểm đã kiểm chứng chỉ hiện trạng thái, không hiện số.
 */
export default function SessionSummaryPanel({ summary, sessionId }: Props) {
  const errors = Object.entries(summary.errorTypeCounts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="space-y-4" aria-label="Tổng kết buổi luyện">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="info">Lần gửi chấm: {summary.totalSubmissions}{summary.unscoredSubmissions > 0 ? ` (${summary.unscoredSubmissions} chưa chấm được)` : ''}</Badge>
        <Badge tone="neutral">Câu đã chấm: {summary.evaluatedSentenceCount}/{summary.learnerSentenceCount}</Badge>
        <Badge tone="success">Nội dung: {summary.contentAccuracy}/100</Badge>
        <Badge tone="neutral">Phát âm: {status(summary.pronunciationStatus, 'đã chấm')}</Badge>
        <Badge tone="neutral">Lưu loát: {status(summary.fluencyStatus, 'có số liệu tham khảo')}</Badge>
        <Badge tone="neutral">Ngữ điệu: {status(summary.prosodyStatus, 'đã chấm')}</Badge>
      </div>
      {summary.pronunciationStatus !== 'COMPLETED' && (
        <p className="text-[11px] text-sumi-muted">
          Điểm của buổi là điểm nội dung (bạn nói đúng các từ đến đâu). Phát âm chưa được chấm vì phương pháp đánh giá âm chưa được kiểm chứng trên giọng người học.
        </p>
      )}

      {summary.sentencesToRetry.length > 0 && (
        <div className="rounded-2xl border border-line bg-paper-100 p-4">
          <p className="text-xs font-bold text-sumi mb-2">Câu nên luyện lại</p>
          <ul className="space-y-1.5">
            {summary.sentencesToRetry.map((s) => (
              <li key={s.sentenceId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-jp text-sumi">{s.japaneseText}</span>
                {s.reason === 'NOT_EVALUATED' ? (
                  <Badge tone="warning">chưa chấm được</Badge>
                ) : (
                  <Badge tone="danger">{s.bestScore}/100</Badge>
                )}
                {s.mainErrorType && <Badge tone="neutral">{ERROR_LABEL[s.mainErrorType] ?? s.mainErrorType}</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <p className="text-xs text-sumi-muted">
          Lỗi trong buổi: {errors.map(([type, n]) => `${ERROR_LABEL[type] ?? type} ×${n}`).join(' · ')}
        </p>
      )}

      {sessionId && <AiSessionReview key={sessionId} sessionId={sessionId} />}
    </section>
  );
}
