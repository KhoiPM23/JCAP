import type { ShadowingServerProgress } from '../types/shadowing';
import type { ShadowingProgress } from '../types/shadowingProgress';

/**
 * Lớp tương thích tạm thời (Milestone 1): server là nguồn chính thức của tiến độ; một số màn hình cũ (Dashboard,
 * danh sách Shadowing) vẫn đọc `localStorage`. Trang luyện ghi đè `localStorage` bằng dữ liệu server, KHÔNG có chiều ngược lại.
 * Xem docs/shadowing-v2/MILESTONE-1-PLAN.md mục 6b.
 */

export interface LocalDialogueMeta {
  subtitle?: string;
  scenarioTitle?: string;
  textbookTitle?: string;
  chapterTitle?: string;
}

const asLevel = (level: string): 'N5' | 'N4' | 'N3' | undefined =>
  level === 'N5' || level === 'N4' || level === 'N3' ? level : undefined;

/** Bỏ các khóa undefined để khi gộp vào bản cũ không xóa mất thông tin (vd. tiêu đề chương). */
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Bản ghi `localStorage` (định dạng ShadowingProgress cũ) tương ứng với phiên server. null với phiên đã bỏ (abandoned):
 * phiên mới thay thế nó sẽ được ghi ngay sau đó.
 */
export function serverToLocalProgress(
  server: ShadowingServerProgress,
  learnerId: string,
  meta: LocalDialogueMeta = {},
): ShadowingProgress | null {
  if (server.status === 'abandoned') return null;
  const completed = server.status === 'completed';
  const total = server.totalSentenceCount;
  return {
    sessionId: server.id,
    learnerId,
    dialogueId: server.dialogueId,
    role: server.learnerRole,
    status: completed ? 'COMPLETED' : 'IN_PROGRESS',
    currentSentenceIndex: completed ? Math.max(0, total - 1) : server.currentSentenceIndex,
    // Cùng ý nghĩa với bản cũ: số câu đã đi qua (Dashboard dùng để tính phần trăm)
    completedSentenceCount: completed ? total : Math.min(total, server.currentSentenceIndex),
    totalSentenceCount: total,
    startedAt: server.startedAt,
    lastPracticedAt: server.lastActivityAt,
    ...defined({
      dialogueTitle: server.dialogueTitle || undefined,
      jlptLevel: asLevel(server.jlptLevel),
      currentSentenceText: server.currentSentenceText || undefined,
      completedAt: completed ? server.completedAt ?? server.lastActivityAt : undefined,
      subtitle: meta.subtitle,
      scenarioTitle: meta.scenarioTitle,
      textbookTitle: meta.textbookTitle,
      chapterTitle: meta.chapterTitle,
    }),
  };
}

/**
 * Vị trí gợi ý từ `localStorage` gửi kèm khi bắt đầu phiên. Server CHỈ dùng nó khi chưa từng có phiên cho bài + vai này,
 * nên dữ liệu cũ không bao giờ ghi đè tiến độ đã có trên server.
 */
export function suggestedIndexFromLocal(
  local: ShadowingProgress | null | undefined,
  role: 'A' | 'B',
): number | undefined {
  if (!local || local.status !== 'IN_PROGRESS' || local.role !== role) return undefined;
  return Number.isInteger(local.currentSentenceIndex) && local.currentSentenceIndex > 0 ? local.currentSentenceIndex : undefined;
}
