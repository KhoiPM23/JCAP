import React from 'react';
import type { FuriganaSegment } from '../../types/shadowing';
import type { ShadowingSession } from '../../hooks/useShadowingSession';
import { matchingFurigana } from '../../utils/furigana';

/** Năm tab ghi chú bên trái khung chat (HANDOFF 9g) */
export type NoteTab = 'ctx' | 'script' | 'vocab' | 'gram' | 'res';

export const NOTE_TABS: { key: NoteTab; jp: string; label: string }[] = [
  { key: 'ctx', jp: '背景', label: 'Bối cảnh' },
  { key: 'script', jp: '台本', label: 'Cả bài' },
  { key: 'vocab', jp: '単語', label: 'Từ vựng' },
  { key: 'gram', jp: '文法', label: 'Ngữ pháp' },
  { key: 'res', jp: '結果', label: 'Kết quả' },
];

/** Mức điểm câu, cùng ngưỡng với backend (ShadowingScoring.GreenMinScore / YellowMinScore); chỉ để tô màu */
export type ScoreTone = 'good' | 'mid' | 'low';
export const toneOf = (score: number): ScoreTone => (score >= 80 ? 'good' : score >= 65 ? 'mid' : 'low');

/** Câu tiếng Nhật kèm furigana khi bật và dữ liệu khớp đúng chữ của câu (lệch thì hiện chữ thường) */
export const SentenceText: React.FC<{ text: string; segments?: readonly FuriganaSegment[] | null; show: boolean; className?: string }> = ({
  text,
  segments,
  show,
  className,
}) => {
  const segs = show ? matchingFurigana(text, segments) : null;
  return (
    <span lang="ja" className={className}>
      {segs
        ? segs.map((seg, i) =>
            seg.reading ? (
              <ruby key={i}>
                {seg.text}
                <rt>{seg.reading}</rt>
              </ruby>
            ) : (
              <React.Fragment key={i}>{seg.text}</React.Fragment>
            ),
          )
        : text}
    </span>
  );
};

/**
 * Điểm tốt nhất của một câu: lần chấm trong buổi này, không có thì điểm cao nhất đã lưu ở server (tiếp tục phiên từ lần trước).
 * null = chưa chấm.
 */
export function bestScoreOf(session: ShadowingSession, sentenceId: number): number | null {
  const local = session.sentenceResults.get(sentenceId);
  if (local && local.isValidForBestAttempt !== false) return local.overallScore;
  return session.serverProgress?.sentences.find((x) => x.sentenceId === sentenceId)?.bestScore ?? null;
}

/**
 * Vị trí đang dở của từng bài trong phiên làm việc này (đóng khung giữa chừng), để nút ở thẻ mốc ghi "Tiếp tục (câu N/T)".
 * Tiến độ thật nằm ở server; đây chỉ là nhãn cho nút.
 */
const resumeMemory = new Map<number, { index: number; total: number }>();
export const rememberResume = (dialogueId: number, index: number, total: number) => resumeMemory.set(dialogueId, { index, total });
export const forgetResume = (dialogueId: number) => resumeMemory.delete(dialogueId);
export const resumeOf = (dialogueId: number) => resumeMemory.get(dialogueId) ?? null;

/** Vai đã luyện gần nhất của từng bài trong phiên làm việc này */
const roleMemory = new Map<number, 'A' | 'B'>();
export const rememberRole = (dialogueId: number, role: 'A' | 'B') => roleMemory.set(dialogueId, role);
export const roleOf = (dialogueId: number): 'A' | 'B' => roleMemory.get(dialogueId) ?? 'A';
