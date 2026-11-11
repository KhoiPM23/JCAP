import type { ShadowingProgress } from '../types/shadowingProgress';

/**
 * Bài Shadowing có đáng hiện ở mục "Tiếp tục" không: chỉ khi đang học dở thật sự.
 * Mới mở trang mà chưa xong câu nào (0 câu) thì chưa tính là đang học; đã xong đủ mọi câu thì coi như học xong,
 * kể cả khi trạng thái chưa kịp chuyển sang COMPLETED (rời trang trước khi bấm hoàn thành).
 */
export function isResumableShadowing(p: Pick<ShadowingProgress, 'status' | 'completedSentenceCount' | 'totalSentenceCount'>): boolean {
  return p.status === 'IN_PROGRESS' && p.completedSentenceCount > 0 && p.completedSentenceCount < p.totalSentenceCount;
}
