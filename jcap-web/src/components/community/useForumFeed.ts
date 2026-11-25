import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { communityService } from '../../services/communityService';
import type { ForumPost } from '../../types/community';
import { mergeRefresh, sortPosts, type ForumSort } from './feed';

const REFRESH_MS = 8000;

/**
 * Danh sách bài của Diễn đàn: tải lần đầu, tự làm mới mỗi 8 giây và khi quay lại tab, giữ bài mới ở hàng chờ,
 * và giữ nguyên thứ tự đang xem (chỉ sắp lại khi đổi cách sắp xếp, lấy bài mới, đăng hoặc ghim bài).
 */
export function useForumFeed(sort: ForumSort, userKey: string | undefined) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [pending, setPending] = useState<ForumPost[]>([]);
  const [justPosted, setJustPosted] = useState<string | null>(null);
  const [orderVersion, setOrderVersion] = useState(0);
  /** Danh sách mới nhất, cập nhật ngay khi đặt: hai lần tải về sát nhau không được so với danh sách cũ */
  const postsRef = useRef<ForumPost[]>([]);
  const commit = useCallback((next: ForumPost[]) => {
    postsRef.current = next;
    setPosts(next);
  }, []);
  const loadedRef = useRef(false);
  /** Tăng sau mỗi thao tác của mình: kết quả tải bắt đầu trước thao tác đó đã cũ, bỏ qua */
  const mutationRef = useRef(0);

  const refresh = useCallback(async () => {
    const before = mutationRef.current;
    const fetched = await communityService.fetchPosts();
    if (before !== mutationRef.current) return;
    if (!fetched) {
      // Làm mới ngầm lỗi thì giữ danh sách đang có
      if (!loadedRef.current) setStatus('error');
      return;
    }
    if (!loadedRef.current) {
      loadedRef.current = true;
      commit(fetched);
      setStatus('ok');
      return;
    }
    const merged = mergeRefresh(postsRef.current, fetched);
    commit(merged.posts);
    setPending(merged.pending);
  }, [commit]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, userKey]);

  const retry = () => {
    setStatus('loading');
    void refresh();
  };

  const reorder = () => setOrderVersion((v) => v + 1);

  const takePending = () => {
    const shown = postsRef.current;
    commit([...shown, ...pending.filter((p) => !shown.some((x) => x.id === p.id))]);
    setPending([]);
    reorder();
  };

  /** Thay một bài bằng bản mới (từ máy chủ hoặc cập nhật lạc quan) */
  const putPost = (post: ForumPost) => {
    mutationRef.current += 1;
    commit(postsRef.current.map((p) => (p.id === post.id ? post : p)));
  };
  const addOwnPost = (post: ForumPost) => {
    mutationRef.current += 1;
    commit([post, ...postsRef.current.filter((p) => p.id !== post.id)]);
    setJustPosted(post.id);
    reorder();
  };
  const removePost = (id: string) => {
    mutationRef.current += 1;
    commit(postsRef.current.filter((p) => p.id !== id));
  };

  const idsKey = posts.map((p) => p.id).sort().join(',');
  // Thứ tự chỉ tính lại khi tập bài, cách sắp xếp hoặc orderVersion đổi: thích hay bình luận không làm bài nhảy chỗ
  const order = useMemo(
    () => sortPosts(postsRef.current, sort, justPosted).map((p) => p.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, sort, justPosted, orderVersion],
  );
  const byId = new Map(posts.map((p) => [p.id, p]));
  const ordered = order.map((id) => byId.get(id)).filter((p): p is ForumPost => !!p);

  return { status, posts: ordered, pendingCount: pending.length, refresh, retry, takePending, putPost, addOwnPost, removePost, reorder };
}
