/**
 * Tổng hợp điểm cả buổi từ kết quả TỪNG CÂU do backend chấm.
 *
 * Đây chỉ là phép lấy trung bình số học các điểm backend đã tính, KHÔNG áp lại công thức trọng số
 * (công thức duy nhất nằm ở backend: ShadowingScoring). Điểm cuối cùng của buổi do backend xác nhận qua
 * `/api/shadowing/session/complete`; hàm này dùng để hiển thị ngay và làm dự phòng khi backend không phản hồi.
 */
import type { ShadowingSentencePracticeResult } from '../types/shadowing';

export type SessionGateStatus = 'good' | 'acceptable' | 'needs_retry' | 'unmeasured';

export interface SessionScoreSummary {
  totalLearnerSentences: number;
  practicedSentences: number;
  /** Trung bình trên TỔNG số câu của vai người học (câu chưa luyện tính 0). */
  contentMatch: number;
  overall: number;
  /** null nếu chưa câu nào đo được lưu loát. */
  fluency: number | null;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  gateStatus: SessionGateStatus;
}

const round = (n: number) => Math.round(n);

export function summarizeSessionScores(
  learnerSentenceIds: number[],
  results: Map<number, ShadowingSentencePracticeResult>,
): SessionScoreSummary {
  const total = learnerSentenceIds.length;
  const valid = learnerSentenceIds
    .map((id) => results.get(id))
    .filter((r): r is ShadowingSentencePracticeResult => r != null && r.isValidForBestAttempt !== false);

  const sum = (pick: (r: ShadowingSentencePracticeResult) => number) =>
    valid.reduce((acc, r) => acc + pick(r), 0);

  const hasData = total > 0 && valid.length > 0;
  const measuredFluency = valid.filter((r) => r.fluencyScore != null);

  let gateStatus: SessionGateStatus = valid.length === 0 ? 'unmeasured' : 'good';
  if (valid.some((r) => r.audioGateStatus === 'needs_retry')) gateStatus = 'needs_retry';
  else if (valid.some((r) => r.audioGateStatus === 'acceptable')) gateStatus = 'acceptable';
  else if (valid.length > 0 && valid.every((r) => r.audioGateStatus === 'unmeasured')) gateStatus = 'unmeasured';

  return {
    totalLearnerSentences: total,
    practicedSentences: valid.length,
    contentMatch: hasData ? round(sum((r) => r.contentMatchScore ?? r.accuracyScore ?? 0) / total) : 0,
    overall: hasData ? round(sum((r) => r.overallScore ?? 0) / total) : 0,
    fluency: hasData && measuredFluency.length > 0
      ? round(measuredFluency.reduce((acc, r) => acc + (r.fluencyScore as number), 0) / total)
      : null,
    greenCount: valid.filter((r) => r.evaluationTier === 'green').length,
    yellowCount: valid.filter((r) => r.evaluationTier === 'yellow').length,
    redCount: valid.filter((r) => r.evaluationTier === 'red').length,
    gateStatus,
  };
}

/** Hạng của buổi luyện theo điểm tổng; cùng ngưỡng với backend (ShadowingService.RankTitleFor) để khớp với lịch sử đã lưu. */
export function sessionRankTitle(overall: number): string {
  if (overall >= 90) return 'Hạng S · Rất xuất sắc';
  if (overall >= 80) return 'Hạng A · Rất tốt';
  if (overall >= 65) return 'Hạng B · Đạt chuẩn';
  return 'Hạng C · Cần luyện thêm';
}
