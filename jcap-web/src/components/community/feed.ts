import type { ForumChannel, ForumPost } from '../../types/community';

export type ForumSort = 'HOT' | 'NEW';

/** Điểm "Nổi bật" */
export const hotScore = (p: ForumPost) => p.upvotes * 2 + p.comments.length * 3;

/** Bài ghim luôn đầu, bài vừa đăng đứng ngay sau bài ghim; còn lại theo cách sắp xếp đang chọn */
export function sortPosts(posts: ForumPost[], sort: ForumSort, justPostedId: string | null = null): ForumPost[] {
  const time = (p: ForumPost) => new Date(p.createdAt).getTime();
  return [...posts].sort(
    (a, b) =>
      Number(!!b.isPinned) - Number(!!a.isPinned) ||
      Number(b.id === justPostedId) - Number(a.id === justPostedId) ||
      (sort === 'HOT' ? hotScore(b) - hotScore(a) : 0) ||
      time(b) - time(a),
  );
}

/** Lọc theo kênh và từ khoá (tiêu đề, nội dung, tên tác giả) */
export function matchPost(p: ForumPost, channel: 'ALL' | ForumChannel, query: string): boolean {
  if (channel !== 'ALL' && p.channel !== channel) return false;
  const q = query.trim().toLowerCase();
  return !q || [p.title, p.content, p.authorName].some((text) => text.toLowerCase().includes(q));
}

/**
 * Kết quả một lần tự làm mới: bài đang hiện được cập nhật (thích, bình luận…), bài đã xoá biến mất,
 * bài mới của người khác nằm chờ để không làm nhảy chỗ đang đọc; bài của chính mình hiện ngay.
 */
export function mergeRefresh(shown: ForumPost[], fetched: ForumPost[]): { posts: ForumPost[]; pending: ForumPost[] } {
  const known = new Set(shown.map((p) => p.id));
  const posts: ForumPost[] = [];
  const pending: ForumPost[] = [];
  for (const p of fetched) (known.has(p.id) || p.isOwnPost ? posts : pending).push(p);
  return { posts, pending };
}
