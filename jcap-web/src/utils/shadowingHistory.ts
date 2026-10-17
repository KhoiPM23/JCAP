/**
 * Chuẩn hóa bản ghi lịch sử luyện tập đọc từ localStorage.
 * Bản ghi cũ (trước khi có ScoringVersion) thiếu nhiều trường và có thể chứa điểm lưu loát/ngữ điệu
 * được ước lượng chứ không đo thực. Hàm này KHÔNG bịa giá trị còn thiếu: trường nào thiếu thì giữ undefined.
 */
import type { ShadowingPracticeSession } from '../types/shadowingProgress';
import type { ShadowingPracticeSessionRecord } from '../types/shadowing';

/**
 * Chuyển một buổi luyện đọc từ backend sang dạng hiển thị của màn lịch sử.
 * Điểm giữ nguyên như backend đã tính; giá trị chưa đo (fluency) vẫn là null.
 */
export function fromServerSession(record: ShadowingPracticeSessionRecord, learnerId: string): ShadowingPracticeSession {
  const level = record.jlptLevel === 'N5' || record.jlptLevel === 'N4' || record.jlptLevel === 'N3' ? record.jlptLevel : undefined;
  return {
    id: record.id,
    sessionId: record.id,
    learnerId,
    dialogueId: record.dialogueId,
    dialogueTitle: record.dialogueTitle,
    scenarioTitle: record.scenarioTitle || undefined,
    jlptLevel: level,
    role: record.learnerRole,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    sentenceScores: record.sentences.map((s) => s.overallScore),
    averageScore: record.weightedOverallScore,
    contentMatchScore: record.contentMatchScore,
    accuracyScore: record.contentMatchScore,
    fluencyScore: record.fluencyScore ?? null,
    audioQualityStatus: record.audioQualityStatus,
    scoringVersion: record.scoringVersion,
    durationSeconds: record.durationSeconds,
    totalSentences: record.learnerSentenceCount,
    completed: true,
    sentenceResults: record.sentences.map((s) => ({
      sentenceId: s.sentenceId,
      orderIndex: s.orderIndex,
      targetText: s.targetText,
      recognizedText: s.recognizedText,
      contentMatchScore: s.contentMatchScore,
      overallScore: s.overallScore,
      evaluationTier: s.tier || null,
      feedback: s.feedback,
      diffTokens: s.diffTokens,
      scoringVersion: s.scoringVersion,
    })),
  };
}

/**
 * Lịch sử hiển thị = buổi luyện lưu ở backend + bản ghi cũ còn trong trình duyệt (trước khi lịch sử được lưu ở backend).
 * Không trùng lặp vì từ nay buổi luyện mới chỉ được lưu ở backend. Sắp xếp mới nhất trước.
 */
export function mergeHistory(server: ShadowingPracticeSession[], local: ShadowingPracticeSession[]): ShadowingPracticeSession[] {
  const serverIds = new Set(server.map((s) => s.id));
  const time = (s: ShadowingPracticeSession) => Date.parse(s.completedAt) || 0;
  return [...server, ...local.filter((s) => !serverIds.has(s.id))].sort((a, b) => time(b) - time(a));
}

export function normalizeHistorySession(raw: unknown): ShadowingPracticeSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.dialogueId !== 'number') return null;

  const sentenceResults = Array.isArray(r.sentenceResults) ? (r.sentenceResults as unknown[]) : [];
  const sentenceScores = Array.isArray(r.sentenceScores)
    ? (r.sentenceScores as unknown[]).filter((v): v is number => typeof v === 'number')
    : [];

  return {
    ...(r as unknown as ShadowingPracticeSession),
    sentenceScores,
    sentenceResults,
    averageScore: typeof r.averageScore === 'number' ? r.averageScore : 0,
    totalSentences: typeof r.totalSentences === 'number' ? r.totalSentences : sentenceScores.length,
    completed: r.completed !== false,
  };
}

export function normalizeHistoryList(raw: unknown): ShadowingPracticeSession[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeHistorySession)
    .filter((s): s is ShadowingPracticeSession => s !== null);
}

/** Bản ghi tạo trước khi có phiên bản công thức chấm điểm. */
export function isLegacyHistorySession(session: Pick<ShadowingPracticeSession, 'scoringVersion'>): boolean {
  return !session.scoringVersion;
}

/** Giá trị số có thật để hiển thị, hoặc null nếu thiếu (hiển thị "Chưa đo", không suy ra). */
export function measuredScore(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
