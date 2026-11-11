import { Badge } from '../jcap';
import type { ShadowingEvaluationDimension, ShadowingEvaluationDimensions } from '../../types/shadowing';

/** Lý do không có điểm → câu giải thích cho người học (không đổ lỗi cho người học khi lỗi là của hệ thống). */
const REASON_TEXT: Record<string, string> = {
  INSUFFICIENT_ACOUSTIC_EVIDENCE: 'Chưa chấm phát âm: phương pháp đánh giá âm chưa được kiểm chứng trên giọng người học.',
  SCORE_NOT_VALIDATED: 'Chỉ có số liệu nhịp nói để tham khảo, chưa thành điểm.',
  NOT_IMPLEMENTED: 'Chưa hỗ trợ đánh giá ngữ điệu.',
  NOT_MEASURED: 'Chưa đo được.',
  ASR_UNAVAILABLE: 'Hệ thống nhận dạng lời nói đang tạm ngừng.',
  ASR_TIMEOUT: 'Nhận dạng lời nói quá lâu.',
  ASR_BUSY: 'Hệ thống nhận dạng đang bận.',
  ASR_UNRELIABLE: 'Nhận dạng chưa đáng tin cậy ở lượt này.',
  NO_SPEECH_DETECTED: 'Không nghe rõ giọng nói.',
  READING_UNAVAILABLE: 'Chưa có cách đọc của câu mẫu.',
};

const describe = (d: ShadowingEvaluationDimension) => (d.reason ? REASON_TEXT[d.reason] ?? d.reason : undefined);

interface Props {
  dimensions?: ShadowingEvaluationDimensions | null;
  className?: string;
}

/**
 * Trạng thái từng chiều đánh giá (Shadowing V2): mỗi chiều độc lập. Chỉ chiều có điểm đã kiểm chứng mới hiện số;
 * chiều chưa khả dụng hiện rõ "chưa khả dụng" thay vì một con số.
 */
export default function EvaluationDimensionsRow({ dimensions, className = '' }: Props) {
  if (!dimensions) return null;
  const { content, pronunciation, fluency, prosody } = dimensions;

  const item = (label: string, d: ShadowingEvaluationDimension, completedText: (d: ShadowingEvaluationDimension) => string) => {
    const done = d.status === 'COMPLETED';
    const tone = done ? (d.score != null ? 'success' : 'info') : d.status === 'FAILED' ? 'danger' : 'neutral';
    return (
      <span title={describe(d)} className="inline-flex">
        <Badge tone={tone} dot>
          {label}: {done ? completedText(d) : d.status === 'FAILED' ? 'lỗi' : 'chưa khả dụng'}
        </Badge>
      </span>
    );
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Các chiều đánh giá">
      {item('Nội dung', content, (d) => (d.score != null ? `${d.score}/100` : 'đã đo'))}
      {item('Phát âm', pronunciation, (d) => (d.score != null ? `${d.score}/100` : 'đã đo'))}
      {item('Lưu loát', fluency, (d) => (d.score != null ? `${d.score}/100` : 'số liệu tham khảo'))}
      {item('Ngữ điệu', prosody, (d) => (d.score != null ? `${d.score}/100` : 'đã đo'))}
      {pronunciation.status !== 'COMPLETED' && (
        <p className="w-full text-[11px] text-sumi-muted">{describe(pronunciation)} Điểm hiển thị là điểm nội dung.</p>
      )}
    </div>
  );
}
