/**
 * Hàm thuần cho ngăn tỉnh (design-handoff mục 9k): mốc đang ở bước nào, dòng trong danh sách ghi gì
 * và nút chính ở chân ngăn làm gì. Điều kiện cấp dấu do server quyết định, ở đây chỉ để hiển thị.
 */
import type { SpotStamp } from './learnProgress';

export type StepKey = 'understand' | 'shadowing' | 'roleplay';

export interface SpotStepInput {
  stamp: SpotStamp;
  /** Mốc đã có nội dung bài học */
  hasLesson: boolean;
  hasShadowing: boolean;
  hasRoleplay: boolean;
  /** Phiên Shadowing đang dở (chỉ số câu tính từ 0) */
  resume: { index: number; total: number } | null;
}

const isDone = (stamp: SpotStamp) => stamp === 'stamp' || stamp === 'red';

/** Bước đang cần làm; null = không còn gì (hoặc mốc chưa đủ nội dung để làm tiếp) */
export function currentStep({ stamp, hasLesson, hasShadowing, hasRoleplay }: SpotStepInput): StepKey | null {
  if (stamp === 'none') return hasLesson ? 'understand' : null;
  if (stamp === 'understood') return hasShadowing ? 'shadowing' : null;
  if (stamp === 'stamp') return hasRoleplay ? 'roleplay' : null;
  return null;
}

export type RowTone = 'next' | 'progress' | 'muted';

/** Chữ phụ bên phải một dòng mốc, chỉ khi cần */
export function rowMeta(input: SpotStepInput, isNext: boolean): { text: string; tone: RowTone } | null {
  if (isNext) return { text: 'Tiếp theo', tone: 'next' };
  if (isDone(input.stamp)) return null;
  if (input.resume) return { text: `Câu ${input.resume.index + 1}/${input.resume.total}`, tone: 'progress' };
  if (!input.hasShadowing) return { text: 'Chưa có Shadowing', tone: 'muted' };
  if (input.stamp === 'understood') return { text: 'Còn Shadowing', tone: 'muted' };
  return null;
}

/** Tên bước hiện tại cho dòng gợi ý dưới nút "Học tiếp" (rỗng nếu không còn bước nào) */
export function stepHint(input: SpotStepInput): string {
  switch (currentStep(input)) {
    case 'understand':
      return 'Hiểu câu mẫu';
    case 'shadowing':
      return input.resume ? `Shadowing, câu ${input.resume.index + 1}/${input.resume.total}` : 'Shadowing';
    case 'roleplay':
      return 'Hội thoại AI';
    default:
      return '';
  }
}
