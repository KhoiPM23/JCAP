import test from 'node:test';
import assert from 'node:assert/strict';
import type { ForumPost } from '../../types/community';
import { matchPost, mergeRefresh, sortPosts } from './feed.ts';

const post = (id: string, over: Partial<ForumPost> = {}): ForumPost => ({
  id,
  channel: 'LOUNGE',
  title: `Bài ${id}`,
  content: '',
  authorId: 'u',
  authorName: 'An',
  authorLevel: 'N5',
  authorRole: 'LEARNER',
  isAnonymous: false,
  upvotes: 0,
  views: 0,
  attachments: [],
  comments: [],
  createdAt: `2026-11-0${id}T00:00:00Z`,
  ...over,
});

test('bài ghim đứng đầu, bài vừa đăng ngay sau, rồi theo điểm nổi bật', () => {
  const list = [post('1', { upvotes: 5 }), post('2'), post('3', { isPinned: true }), post('4', { upvotes: 1 })];
  assert.deepEqual(sortPosts(list, 'HOT', '2').map((p) => p.id), ['3', '2', '1', '4']);
  assert.deepEqual(sortPosts(list, 'NEW').map((p) => p.id), ['3', '4', '2', '1']);
});

test('lọc theo kênh và tìm trong tiêu đề, nội dung, tác giả', () => {
  const p = post('1', { title: 'Kính ngữ', authorName: 'Minh' });
  assert.equal(matchPost(p, 'ALL', 'kính'), true);
  assert.equal(matchPost(p, 'ALL', 'minh'), true);
  assert.equal(matchPost(p, 'QA_JAPANESE', ''), false);
  assert.equal(matchPost(p, 'ALL', 'không có'), false);
});

test('tự làm mới: bài mới của người khác nằm chờ, bài đã xoá biến mất, bài của mình hiện ngay', () => {
  const r = mergeRefresh([post('1'), post('2')], [post('1', { upvotes: 3 }), post('3'), post('4', { isOwnPost: true })]);
  assert.deepEqual(r.posts.map((p) => p.id), ['1', '4']);
  assert.equal(r.posts[0].upvotes, 3);
  assert.deepEqual(r.pending.map((p) => p.id), ['3']);
});
