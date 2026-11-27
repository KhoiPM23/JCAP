import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, EmptyState, Toast } from '../components/jcap';
import { ChannelRail } from '../components/community/ChannelRail';
import { CHANNELS } from '../components/community/channels';
import { matchPost, type ForumSort } from '../components/community/feed';
import { timeAgo } from '../components/community/format';
import { ForumToolbar } from '../components/community/ForumToolbar';
import { NewPostsPill } from '../components/community/NewPostsPill';
import { PostCard } from '../components/community/PostCard';
import { PostComposerModal, type PostDraft } from '../components/community/PostComposerModal';
import { QuickComposer } from '../components/community/QuickComposer';
import { useForumFeed } from '../components/community/useForumFeed';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { communityService } from '../services/communityService';
import { feedbackService } from '../services/feedbackService';
import type { ForumAttachment, ForumChannel, ForumPost } from '../types/community';
import '../components/community/community.css';

export const CommunityForumView: React.FC = () => {
  const { user, userLevel } = useAuth();
  const { isDark } = useTheme();
  const isAdmin = user?.role === 'Admin';
  const theme = isDark ? 'hoc-tap-dem' : 'kham-pha';
  const currentUserName = user?.fullName || user?.email?.split('@')[0] || 'Học viên JCAP';
  const currentLevel = isAdmin ? 'ADMIN' : userLevel || 'N5';

  const [activeChannel, setActiveChannel] = useState<'ALL' | ForumChannel>('ALL');
  const [sortBy, setSortBy] = useState<ForumSort>('HOT');
  const [searchQuery, setSearchQuery] = useState('');
  const feed = useForumFeed(sortBy, user?.id || user?.email);
  /** Thao tác lưu không thành công (thích, ghim, đánh dấu, xoá) */
  const [actionError, setActionError] = useState('');

  // Bài đang mở khung bình luận
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Trả lời bình luận cụ thể (nested comment)
  const [replyingToComment, setReplyingToComment] = useState<{
    postId: string;
    commentId: string;
    authorName: string;
  } | null>(null);

  // Ô nhập bình luận
  const [commentText, setCommentText] = useState('');
  const [commentAnon, setCommentAnon] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<ForumAttachment[]>([]);
  const [isUploadingCommentFile, setIsUploadingCommentFile] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  // Khung soạn bài và thông báo ngắn sau khi đăng
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Xem ảnh lớn
  const [lightboxImage, setLightboxImage] = useState<ForumAttachment | null>(null);

  const commentFileInputRef = useRef<HTMLInputElement>(null);

  const filteredPosts = feed.posts.filter((p) => matchPost(p, activeChannel, searchQuery));
  const counts: Record<string, number> = { ALL: feed.posts.length };
  for (const p of feed.posts) counts[p.channel] = (counts[p.channel] ?? 0) + 1;

  const openCompose = () => setIsComposeOpen(true);

  const togglePost = (postId: string) => {
    if (expandedPostId !== postId) {
      setCommentText('');
      setCommentAttachments([]);
      setReplyingToComment(null);
      setCommentError('');
    }
    setExpandedPostId(expandedPostId === postId ? null : postId);
  };

  // Tải ảnh/tệp đính kèm bình luận
  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingCommentFile(true);
    setCommentError('');

    try {
      const added: ForumAttachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          setCommentError(`Tệp "${file.name}" lớn hơn 5MB. Hãy chọn tệp nhỏ hơn.`);
          continue;
        }
        const res = await feedbackService.uploadAttachment(file);
        if (res.success && res.data) {
          added.push({
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: res.data.fileName,
            fileSize: res.data.fileSize,
            fileType: res.data.fileType,
            url: res.data.cloudinaryUrl,
          });
        } else {
          setCommentError(res.message || `Chưa tải lên được "${file.name}". Hãy thử lại.`);
        }
      }
      setCommentAttachments((prev) => [...prev, ...added]);
    } finally {
      setIsUploadingCommentFile(false);
    }
  };

  /** Thích, ghim, đánh dấu giải đáp: đổi ngay trên màn hình, máy chủ không lưu được thì trả lại như cũ */
  const mutatePost = async (post: ForumPost, optimistic: ForumPost, send: (id: string) => Promise<ForumPost | null>, failText: string) => {
    setActionError('');
    feed.putPost(optimistic);
    const updated = await send(post.id);
    if (updated) {
      feed.putPost(updated);
    } else {
      feed.putPost(post);
      setActionError(failText);
    }
    return !!updated;
  };

  const handleToggleUpvotePost = (post: ForumPost) =>
    mutatePost(
      post,
      { ...post, upvotedByMe: !post.upvotedByMe, upvotes: Math.max(0, post.upvotes + (post.upvotedByMe ? -1 : 1)) },
      communityService.toggleUpvote,
      'Chưa lưu được lượt thích. Hãy thử lại.',
    );

  const handleTogglePin = async (post: ForumPost) => {
    const ok = await mutatePost(post, { ...post, isPinned: !post.isPinned }, communityService.togglePin, 'Chưa ghim được bài. Hãy thử lại.');
    if (ok) feed.reorder();
  };

  const handleToggleSolved = (post: ForumPost) =>
    mutatePost(post, { ...post, isSolved: !post.isSolved }, communityService.toggleSolved, 'Chưa đánh dấu được. Hãy thử lại.');

  const handleDeletePost = async (post: ForumPost) => {
    if (!window.confirm(`Xoá bài "${post.title}"? Bạn không khôi phục lại được.`)) return;
    setActionError('');
    if (await communityService.deletePost(post.id)) feed.removePost(post.id);
    else setActionError('Chưa xoá được bài. Hãy thử lại.');
  };

  // Đăng bài thảo luận mới; false = máy chủ chưa nhận, khung soạn giữ nguyên nội dung
  const handleCreatePost = async (draft: PostDraft) => {
    const created = await communityService.createPost({
      ...draft,
      authorId: user?.id,
      authorEmail: user?.email,
      authorName: currentUserName,
      authorLevel: currentLevel,
      authorRole: isAdmin ? 'ADMIN' : 'LEARNER',
      authorAvatar: user?.avatarUrl,
    });
    if (!created) return false;
    setIsComposeOpen(false);
    // Bài mới phải thấy được ngay dù đang lọc kênh khác hay đang tìm
    if (activeChannel !== 'ALL' && activeChannel !== created.channel) setActiveChannel('ALL');
    setSearchQuery('');
    feed.addOwnPost(created);
    setExpandedPostId(created.id);
    setToast('Đã đăng bài thảo luận');
    return true;
  };

  // Gửi bình luận vào bài viết: gửi lỗi thì giữ nguyên nội dung đã gõ
  const handleAddComment = async (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    if (sendingComment || (!commentText.trim() && commentAttachments.length === 0)) return;
    setSendingComment(true);
    setCommentError('');
    const updated = await communityService.addComment(postId, {
      parentCommentId: replyingToComment?.postId === postId ? replyingToComment.commentId : null,
      content: commentText.trim() || '(Đính kèm tệp/ảnh)',
      isAnonymous: commentAnon,
      attachments: commentAttachments,
      authorId: user?.id,
      authorEmail: user?.email,
      authorName: currentUserName,
      authorLevel: currentLevel,
      authorRole: isAdmin ? 'ADMIN' : 'LEARNER',
      authorAvatar: user?.avatarUrl,
    });
    setSendingComment(false);
    if (!updated) {
      setCommentError('Chưa gửi được bình luận. Nội dung bạn viết vẫn còn ở đây.');
      return;
    }
    feed.putPost(updated);
    setCommentText('');
    setCommentAttachments([]);
    setReplyingToComment(null);
  };

  /** Phần bình luận (giao diện cũ, thay ở lượt 14b) */
  const renderComments = (post: ForumPost) => {
    const rootComments = post.comments.filter((c) => !c.parentCommentId);
    return (
                  <div className="fm-legacy bg-slate-50/70 border-t border-slate-200/80 p-4 sm:p-5 space-y-4">
                    {/* Danh sách bình luận */}
                    {rootComments.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-2">
                        Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ ý kiến!
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {rootComments.map((cmt) => {
                          const replies = post.comments.filter(
                            (r) => r.parentCommentId === cmt.id
                          );
                          return (
                            <div key={cmt.id} className="space-y-2">
                              <div className="bg-white rounded-xl border border-slate-200/80 p-3 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-800">
                                      {cmt.isAnonymous ? '🕵️ ' : ''}
                                      {cmt.authorName}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                        cmt.authorRole === 'ADMIN'
                                          ? 'bg-[#071A44] text-white'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {cmt.authorRole === 'ADMIN'
                                        ? '🛡️ Admin'
                                        : cmt.authorLevel}
                                    </span>
                                    {cmt.isAcceptedAnswer && (
                                      <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                                        ✓ Câu trả lời hữu ích
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-slate-400">
                                    {timeAgo(cmt.createdAt)}
                                  </span>
                                </div>

                                <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                                  {cmt.content}
                                </p>

                                {cmt.attachments && cmt.attachments.length > 0 && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {cmt.attachments.map((att) =>
                                      att.fileType === 'IMAGE' ? (
                                        <img
                                          key={att.id}
                                          src={att.url}
                                          alt={att.fileName}
                                          onClick={() => setLightboxImage(att)}
                                          className="h-24 w-auto rounded-lg border border-slate-200 cursor-pointer"
                                        />
                                      ) : (
                                        <a
                                          key={att.id}
                                          href={att.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs text-blue-600 underline"
                                        >
                                          📎 {att.fileName}
                                        </a>
                                      )
                                    )}
                                  </div>
                                )}

                                <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReplyingToComment({
                                        postId: post.id,
                                        commentId: cmt.id,
                                        authorName: cmt.authorName,
                                      })
                                    }
                                    className="font-semibold hover:text-blue-600 cursor-pointer"
                                  >
                                    ↩ Trả lời
                                  </button>
                                </div>
                              </div>

                              {/* Các phản hồi con (Replies) */}
                              {replies.length > 0 && (
                                <div className="pl-5 border-l-2 border-slate-200 space-y-2">
                                  {replies.map((rep) => (
                                    <div
                                      key={rep.id}
                                      className="bg-white rounded-xl border border-slate-200/70 p-2.5 space-y-1"
                                    >
                                      <div className="flex items-center justify-between text-[11px]">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-bold text-slate-800">
                                            {rep.isAnonymous ? '🕵️ ' : ''}
                                            {rep.authorName}
                                          </span>
                                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                                            {rep.authorRole === 'ADMIN'
                                              ? '🛡️ Admin'
                                              : rep.authorLevel}
                                          </span>
                                        </div>
                                        <span className="text-slate-400">
                                          {timeAgo(rep.createdAt)}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-700 whitespace-pre-line">
                                        {rep.content}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Form viết bình luận nhanh */}
                    <form
                      onSubmit={(e) => handleAddComment(e, post.id)}
                      className="bg-white rounded-xl border border-slate-200 p-3 space-y-2"
                    >
                      {replyingToComment?.postId === post.id && (
                        <div className="flex items-center justify-between text-[11px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">
                          <span>
                            Đang trả lời <strong>@{replyingToComment.authorName}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setReplyingToComment(null)}
                            className="font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      )}


                      {commentError && (
                        <p role="alert" className="text-xs font-semibold text-red-600">
                          {commentError}
                        </p>
                      )}

                      <textarea
                        rows={2}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Viết bình luận chia sẻ hoặc giải đáp..."
                        className="w-full text-xs sm:text-sm outline-none resize-none text-slate-800"
                      />

                      {commentAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {commentAttachments.map((att) => (
                            <span
                              key={att.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px]"
                            >
                              {att.fileName}
                              <button
                                type="button"
                                onClick={() =>
                                  setCommentAttachments((prev) =>
                                    prev.filter((x) => x.id !== att.id)
                                  )
                                }
                                className="font-bold ml-1 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-3">
                          <input
                            ref={commentFileInputRef}
                            type="file"
                            multiple
                            accept="image/*,.pdf,.txt,.doc,.docx"
                            className="hidden"
                            onChange={(e) => {
                              handleUploadFiles(e.target.files);
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            disabled={isUploadingCommentFile}
                            onClick={() => commentFileInputRef.current?.click()}
                            className="text-xs text-slate-600 hover:text-blue-600 font-medium cursor-pointer"
                          >
                            {isUploadingCommentFile ? '⏳ Đang tải...' : '📎 Đính kèm ảnh/tệp'}
                          </button>

                          {!isAdmin && (
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={commentAnon}
                                onChange={(e) => setCommentAnon(e.target.checked)}
                                className="rounded border-slate-300"
                              />
                              <span>🕵️ Bình luận ẩn danh</span>
                            </label>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={
                            sendingComment ||
                            isUploadingCommentFile ||
                            (!commentText.trim() && commentAttachments.length === 0)
                          }
                          className="px-3.5 py-1.5 rounded-lg bg-[#0878EE] hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                        >
                          Gửi bình luận
                        </button>
                      </div>
                    </form>
                  </div>
    );
  };

  const channelName = CHANNELS.find((c) => c.id === activeChannel)?.label;
  const q = searchQuery.trim();

  return (
    <div className="fm" data-theme={theme}>
      <div className="fm-wrap">
        <div className="fm-grid">
          {/* Cột trái đứng yên khi cuộn: tiêu đề và danh sách kênh */}
          <div className="fm-side">
            <header className="fm-head">
              <h1>
                Diễn đàn{' '}
                <span className="kj" lang="ja">
                  掲示板
                </span>
              </h1>
            </header>
            <ChannelRail active={activeChannel} counts={counts} onPick={setActiveChannel} showSupport={!isAdmin} />
          </div>

          <section className="fm-feed" aria-label="Bài thảo luận">
            <QuickComposer name={currentUserName} avatar={user?.avatarUrl} admin={isAdmin} onOpen={openCompose} />
            <ForumToolbar sort={sortBy} onSort={setSortBy} query={searchQuery} onQuery={setSearchQuery} />

            {q && feed.status === 'ok' && filteredPosts.length > 0 && (
              <p className="fm-count" aria-live="polite">
                {`${filteredPosts.length} bài khớp với “${q}”${channelName ? ` trong kênh ${channelName}` : ''}`}
              </p>
            )}
            {actionError && (
              <p className="fm-note" role="alert">
                {actionError}
                <button type="button" className="fm-x" aria-label="Đóng thông báo" onClick={() => setActionError('')}>
                  ×
                </button>
              </p>
            )}
            <NewPostsPill count={feed.pendingCount} onTake={feed.takePending} />

            {feed.status === 'loading' ? (
              <ol className="fm-list" aria-busy="true" aria-label="Đang tải bài thảo luận">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="fm-post fm-skel" aria-hidden="true">
                    <span className="jc-skel jc-skel--text" style={{ width: '38%' }} />
                    <span className="jc-skel jc-skel--text" style={{ width: '72%', height: 18 }} />
                    <span className="jc-skel jc-skel--text" style={{ width: '96%' }} />
                    <span className="jc-skel jc-skel--text" style={{ width: '60%' }} />
                  </li>
                ))}
              </ol>
            ) : feed.status === 'error' ? (
              <EmptyState
                className="fm-empty"
                icon="cloud_off"
                title="Chưa tải được Diễn đàn"
                action={
                  <Button variant="primary" icon="refresh" onClick={feed.retry}>
                    Thử lại
                  </Button>
                }
              >
                Máy chủ chưa phản hồi. Kiểm tra kết nối mạng rồi thử lại.
              </EmptyState>
            ) : filteredPosts.length === 0 ? (
              q ? (
                <EmptyState
                  className="fm-empty"
                  icon="search_off"
                  title={`Không tìm thấy bài nào khớp với “${q}”`}
                  action={
                    activeChannel !== 'ALL' ? (
                      <Button variant="secondary" onClick={() => setActiveChannel('ALL')}>
                        Tìm ở tất cả kênh
                      </Button>
                    ) : undefined
                  }
                  secondaryAction={
                    <Button variant="ghost" onClick={() => setSearchQuery('')}>
                      Xoá từ khoá
                    </Button>
                  }
                >
                  {activeChannel !== 'ALL' ? 'Thử từ khoá khác, hoặc tìm ở tất cả kênh.' : 'Thử từ khoá ngắn hơn hoặc tên tác giả.'}
                </EmptyState>
              ) : (
                <EmptyState
                  className="fm-empty"
                  icon="forum"
                  title="Chưa có bài thảo luận nào ở mục này"
                  action={
                    <Button variant="primary" icon="edit_square" onClick={openCompose}>
                      Đăng bài thảo luận
                    </Button>
                  }
                >
                  Bạn có thể mở đầu bằng một câu hỏi hoặc một mẹo nhỏ.
                </EmptyState>
              )
            ) : (
              <ol className="fm-list">
                {filteredPosts.map((post) => (
                  <li key={post.id}>
                    <PostCard
                      post={post}
                      open={expandedPostId === post.id}
                      isAdmin={isAdmin}
                      onToggle={() => togglePost(post.id)}
                      onLike={() => handleToggleUpvotePost(post)}
                      onSolve={() => handleToggleSolved(post)}
                      onPin={() => handleTogglePin(post)}
                      onDelete={() => handleDeletePost(post)}
                      onImage={setLightboxImage}
                    >
                      {expandedPostId === post.id ? renderComments(post) : null}
                    </PostCard>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <PostComposerModal
        open={isComposeOpen}
        defaultChannel={activeChannel === 'ALL' ? 'QA_JAPANESE' : activeChannel}
        isAdmin={isAdmin}
        theme={theme}
        onClose={() => setIsComposeOpen(false)}
        onSubmit={handleCreatePost}
      />
      {toast &&
        createPortal(
          <div className="fm fm-toast" data-theme={theme}>
            <Toast title={toast} onClose={() => setToast('')} />
          </div>,
          document.body,
        )}

      {/* Lightbox xem ảnh */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-xs font-bold">
              <span>{lightboxImage.fileName}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex justify-center">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.fileName}
                className="max-h-[440px] w-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
