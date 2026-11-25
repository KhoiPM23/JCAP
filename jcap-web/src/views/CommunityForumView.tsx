import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  type ForumChannel,
  type ForumAttachment,
  type ForumComment,
  type ForumPost,
  CHANNEL_META,
  getForumPosts,
  saveForumPosts,
  resetForumPosts,
} from '../services/mockCommunityStore';
import { communityService } from '../services/communityService';
import { feedbackService, formatFileSize } from '../services/feedbackService';

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ngày`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export const CommunityForumView: React.FC = () => {
  const navigate = useNavigate();
  const { user, userLevel } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const currentUserName = user?.fullName || user?.email?.split('@')[0] || 'Học viên JCAP';
  const currentLevel = isAdmin ? 'ADMIN' : userLevel || 'N5';

  const [posts, setPosts] = useState<ForumPost[]>(() => getForumPosts());
  const [activeChannel, setActiveChannel] = useState<'ALL' | ForumChannel>('ALL');
  const [sortBy, setSortBy] = useState<'HOT' | 'NEW'>('HOT');
  const [searchQuery, setSearchQuery] = useState('');

  // Bài viết đang mở khung bình luận (mặc định mở bài đầu tiên để thấy ngay sự tương tác)
  const [expandedPostId, setExpandedPostId] = useState<string | null>('post-101');

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

  // Modal tạo bài thảo luận mới
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newChannel, setNewChannel] = useState<ForumChannel>('QA_JAPANESE');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newIsAnon, setNewIsAnon] = useState(false);
  const [newAttachments, setNewAttachments] = useState<ForumAttachment[]>([]);
  const [isUploadingPostFile, setIsUploadingPostFile] = useState(false);

  // Xem ảnh lớn
  const [lightboxImage, setLightboxImage] = useState<ForumAttachment | null>(null);

  const postFileInputRef = useRef<HTMLInputElement>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);

  const updatePosts = (next: ForumPost[]) => {
    setPosts(next);
    saveForumPosts(next);
  };

  const syncPostsFromServer = useCallback(async () => {
    const res = await communityService.fetchPosts();
    setPosts(res.posts);
    setExpandedPostId((prev) => {
      if (!prev) return null;
      if (res.posts.some((p) => p.id === prev)) return prev;
      if (prev === 'post-101' && res.posts.length > 0) return res.posts[0].id;
      return prev;
    });
  }, []);

  useEffect(() => {
    void syncPostsFromServer();

    const intervalId = window.setInterval(() => {
      void syncPostsFromServer();
    }, 8000);

    const handleFocus = () => {
      void syncPostsFromServer();
    };
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes('jcap_community_forum')) {
        setPosts(getForumPosts());
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, [syncPostsFromServer, user?.id, user?.email]);

  const filteredPosts = useMemo(() => {
    const list = posts.filter((p) => {
      if (activeChannel !== 'ALL' && p.channel !== activeChannel) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = p.title.toLowerCase().includes(q);
        const inBody = p.content.toLowerCase().includes(q);
        const inAuthor = p.authorName.toLowerCase().includes(q);
        if (!inTitle && !inBody && !inAuthor) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (sortBy === 'HOT') {
        const scoreA = a.upvotes * 2 + a.comments.length * 3;
        const scoreB = b.upvotes * 2 + b.comments.length * 3;
        return scoreB - scoreA;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [posts, activeChannel, sortBy, searchQuery]);

  // Tải ảnh/tệp lên Cloudinary (hoặc fallback local dataURL nếu chưa chạy backend)
  const handleUploadFiles = async (
    files: FileList | null,
    target: 'POST' | 'COMMENT'
  ) => {
    if (!files || files.length === 0) return;
    const setUploading =
      target === 'POST' ? setIsUploadingPostFile : setIsUploadingCommentFile;
    setUploading(true);

    try {
      const added: ForumAttachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          alert(`Tệp "${file.name}" vượt quá 5MB.`);
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
          // Fallback đọc ảnh trực tiếp nếu chưa bật backend
          const isImg = file.type.startsWith('image/');
          const url = isImg ? URL.createObjectURL(file) : '#';
          added.push({
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: file.name,
            fileSize: file.size,
            fileType: isImg ? 'IMAGE' : 'FILE',
            url,
          });
        }
      }

      if (target === 'POST') {
        setNewAttachments((prev) => [...prev, ...added]);
      } else {
        setCommentAttachments((prev) => [...prev, ...added]);
      }
    } finally {
      setUploading(false);
    }
  };

  // Thả Upvote bài viết
  const handleToggleUpvotePost = async (postId: string) => {
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      const already = !!p.upvotedByMe;
      return {
        ...p,
        upvotedByMe: !already,
        upvotes: already ? Math.max(0, p.upvotes - 1) : p.upvotes + 1,
      };
    });
    updatePosts(next);

    const updated = await communityService.toggleUpvote(postId);
    if (updated) {
      setPosts((prev) => {
        const list = prev.map((p) => (p.id === postId || p.id === updated.id ? updated : p));
        saveForumPosts(list);
        return list;
      });
    }
  };

  // Thả Upvote bình luận
  const handleToggleUpvoteComment = (postId: string, commentId: string) => {
    const next = posts.map((p) => {
      if (p.id !== postId) return p;
      return {
        ...p,
        comments: p.comments.map((c) => {
          if (c.id !== commentId) return c;
          const already = !!c.upvotedByMe;
          return {
            ...c,
            upvotedByMe: !already,
            upvotes: already ? Math.max(0, c.upvotes - 1) : c.upvotes + 1,
          };
        }),
      };
    });
    updatePosts(next);
  };

  // Đăng bài thảo luận mới
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const titleText = newTitle.trim();
    const contentText = newContent.trim();
    const channelVal = newChannel;
    const isAnonVal = newIsAnon;
    const attachmentsVal = [...newAttachments];

    setNewTitle('');
    setNewContent('');
    setNewAttachments([]);
    setNewIsAnon(false);
    setIsComposeOpen(false);

    const res = await communityService.createPost({
      channel: channelVal,
      title: titleText,
      content: contentText,
      isAnonymous: isAnonVal,
      attachments: attachmentsVal,
      authorId: user?.id,
      authorEmail: user?.email,
      authorName: currentUserName,
      authorLevel: currentLevel,
      authorRole: isAdmin ? 'ADMIN' : 'LEARNER',
      authorAvatar: user?.avatarUrl,
    });

    if (res.isLiveBackend && res.post) {
      const serverPost = res.post;
      setPosts((prev) => {
        const list = [serverPost, ...prev.filter((p) => p.id !== serverPost.id)];
        saveForumPosts(list);
        return list;
      });
      setExpandedPostId(serverPost.id);
      return;
    }

    const anonNum = Math.floor(100 + Math.random() * 900);
    const created: ForumPost = {
      id: `post-${Date.now()}`,
      channel: channelVal,
      title: titleText,
      content: contentText,
      authorId: user?.email || 'current-user',
      authorName: isAnonVal ? `Thành viên ẩn danh #${anonNum}` : currentUserName,
      authorAvatar: isAnonVal ? undefined : user?.avatarUrl,
      authorLevel: currentLevel,
      authorRole: isAdmin ? 'ADMIN' : 'LEARNER',
      isAnonymous: isAnonVal,
      upvotes: 1,
      upvotedByMe: true,
      views: 1,
      attachments: attachmentsVal,
      comments: [],
      createdAt: new Date().toISOString(),
    };

    updatePosts([created, ...posts]);
    setExpandedPostId(created.id);
  };

  // Gửi bình luận vào bài viết
  const handleAddComment = async (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    if (!commentText.trim() && commentAttachments.length === 0) return;

    const contentVal = commentText.trim() || '(Đính kèm tệp/ảnh)';
    const parentIdVal =
      replyingToComment?.postId === postId ? replyingToComment.commentId : null;
    const isAnonVal = commentAnon;
    const attachmentsVal = [...commentAttachments];

    setCommentText('');
    setCommentAttachments([]);
    setReplyingToComment(null);

    const res = await communityService.addComment(postId, {
      parentCommentId: parentIdVal,
      content: contentVal,
      isAnonymous: isAnonVal,
      attachments: attachmentsVal,
      authorId: user?.id,
      authorEmail: user?.email,
      authorName: currentUserName,
      authorLevel: currentLevel,
      authorRole: isAdmin ? 'ADMIN' : 'LEARNER',
      authorAvatar: user?.avatarUrl,
    });

    if (res.isLiveBackend && res.post) {
      const updatedPost = res.post;
      setPosts((prev) => {
        const list = prev.map((p) =>
          p.id === postId || p.id === updatedPost.id ? updatedPost : p
        );
        saveForumPosts(list);
        return list;
      });
      return;
    }

    const anonNum = Math.floor(100 + Math.random() * 900);
    const newCmt: ForumComment = {
      id: `cmt-${Date.now()}`,
      postId,
      parentCommentId: parentIdVal,
      authorName: isAnonVal ? `Thành viên ẩn danh #${anonNum}` : currentUserName,
      authorAvatar: isAnonVal ? undefined : user?.avatarUrl,
      authorLevel: currentLevel,
      authorRole: isAdmin ? 'ADMIN' : 'LEARNER',
      isAnonymous: isAnonVal,
      content: contentVal,
      attachments: attachmentsVal,
      upvotes: 0,
      createdAt: new Date().toISOString(),
    };

    const next = posts.map((p) =>
      p.id === postId ? { ...p, comments: [...p.comments, newCmt] } : p
    );
    updatePosts(next);
  };

  // Đánh dấu Đã giải đáp / Ghim bài / Xóa bài
  const handleTogglePin = async (postId: string) => {
    updatePosts(
      posts.map((p) => (p.id === postId ? { ...p, isPinned: !p.isPinned } : p))
    );
    const updated = await communityService.togglePin(postId);
    if (updated) {
      setPosts((prev) => {
        const list = prev.map((p) => (p.id === postId || p.id === updated.id ? updated : p));
        saveForumPosts(list);
        return list;
      });
    }
  };

  const handleToggleSolved = async (postId: string) => {
    updatePosts(
      posts.map((p) => (p.id === postId ? { ...p, isSolved: !p.isSolved } : p))
    );
    const updated = await communityService.toggleSolved(postId);
    if (updated) {
      setPosts((prev) => {
        const list = prev.map((p) => (p.id === postId || p.id === updated.id ? updated : p));
        saveForumPosts(list);
        return list;
      });
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa bài thảo luận này?')) return;
    updatePosts(posts.filter((p) => p.id !== postId));
    await communityService.deletePost(postId);
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-4 pb-10 font-sans text-slate-900">
      {/* Header gọn 1 hàng */}
      <div className="bg-white rounded-2xl border border-slate-200/90 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-xl shrink-0">
            💬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-[#071A44] tracking-tight">
                Diễn đàn Cộng đồng JCAP
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Thảo luận mở
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Hỏi đáp ngữ pháp, chia sẻ mẹo luyện nói AI và kết nối bạn học tiếng Nhật
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/feedback')}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              title="Báo lỗi kỹ thuật hoặc thanh toán với Admin"
            >
              🛠️ Hỗ trợ kỹ thuật
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsComposeOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            ＋ Đăng bài thảo luận
          </button>
        </div>
      </div>

      {/* Thanh tạo bài nhanh kiểu Threads (1 dòng gọn mắt) */}
      <div
        onClick={() => setIsComposeOpen(true)}
        className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:border-blue-300 transition shadow-2xs"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full bg-[#071A44] text-white text-xs font-bold flex items-center justify-center shrink-0">
            {currentUserName.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs sm:text-sm text-slate-400 truncate">
            Đặt câu hỏi tiếng Nhật, chia sẻ mẹo Shadowing hoặc đính kèm tài liệu cho mọi người...
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
          <span className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 font-medium">
            🖼️ Ảnh / 📎 Tệp
          </span>
        </div>
      </div>

      {/* Thanh lọc Kênh (Pills) + Tìm kiếm & Sắp xếp */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveChannel('ALL')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              activeChannel === 'ALL'
                ? 'bg-[#071A44] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Tất cả ({posts.length})
          </button>
          {(Object.keys(CHANNEL_META) as ForumChannel[]).map((ch) => {
            const meta = CHANNEL_META[ch];
            const active = activeChannel === ch;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => setActiveChannel(ch)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                  active
                    ? 'bg-[#0878EE] text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm chủ đề..."
            className="w-36 sm:w-44 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
          />
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSortBy('HOT')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                sortBy === 'HOT' ? 'bg-slate-100 text-[#071A44] font-bold' : 'text-slate-500'
              }`}
            >
              🔥 Nổi bật
            </button>
            <button
              type="button"
              onClick={() => setSortBy('NEW')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                sortBy === 'NEW' ? 'bg-slate-100 text-[#071A44] font-bold' : 'text-slate-500'
              }`}
            >
              🕒 Mới
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              resetForumPosts();
              void syncPostsFromServer();
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] text-slate-500 cursor-pointer"
            title="Khôi phục dữ liệu mẫu"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Danh sách bài thảo luận (Feed gọn mắt kiểu Threads / Reddit) */}
      <div className="space-y-3">
        {filteredPosts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <div className="text-2xl">🌱</div>
            <p className="text-sm font-bold text-slate-700">Chưa có bài thảo luận nào ở mục này</p>
            <button
              type="button"
              onClick={() => setIsComposeOpen(true)}
              className="mt-1 px-4 py-2 rounded-xl bg-[#0878EE] text-white text-xs font-bold cursor-pointer"
            >
              ＋ Mở chủ đề đầu tiên
            </button>
          </div>
        ) : (
          filteredPosts.map((post) => {
            const chMeta = CHANNEL_META[post.channel] || CHANNEL_META.LOUNGE;
            const isExpanded = expandedPostId === post.id;
            const rootComments = post.comments.filter((c) => !c.parentCommentId);

            return (
              <div
                key={post.id}
                className={`bg-white rounded-2xl border transition overflow-hidden ${
                  post.isPinned
                    ? 'border-blue-200/90 shadow-xs'
                    : 'border-slate-200/90 shadow-2xs'
                }`}
              >
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Hàng 1: Thông tin tác giả + Kênh + Trạng thái */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          post.authorRole === 'ADMIN'
                            ? 'bg-[#071A44] text-white'
                            : post.isAnonymous
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {post.isAnonymous
                          ? '🕵️'
                          : post.authorName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        {post.authorName}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          post.authorRole === 'ADMIN'
                            ? 'bg-[#071A44] text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {post.authorRole === 'ADMIN' ? '🛡️ Admin' : `JLPT ${post.authorLevel}`}
                      </span>
                      <span className="text-xs text-slate-400">
                        • {formatTimeAgo(post.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {post.isPinned && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          📌 Đã ghim
                        </span>
                      )}
                      {post.isSolved && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✅ Đã giải đáp
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${chMeta.badgeBg} ${chMeta.badgeText} ${chMeta.badgeBorder}`}
                      >
                        {chMeta.icon} {chMeta.label}
                      </span>
                    </div>
                  </div>

                  {/* Hàng 2: Tiêu đề + Nội dung */}
                  <div
                    onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                    className="space-y-1.5 cursor-pointer"
                  >
                    <h2 className="text-sm sm:text-base font-bold text-[#071A44] hover:text-[#0878EE] transition leading-snug">
                      {post.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                      {post.content}
                    </p>
                  </div>

                  {/* Hàng 3: Tệp / Ảnh đính kèm (gọn mắt) */}
                  {post.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      {post.attachments.map((att) =>
                        att.fileType === 'IMAGE' ? (
                          <div
                            key={att.id}
                            onClick={() => setLightboxImage(att)}
                            className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 cursor-pointer hover:border-blue-400 transition max-w-sm"
                          >
                            <img
                              src={att.url}
                              alt={att.fileName}
                              className="max-h-44 w-auto object-cover"
                            />
                          </div>
                        ) : (
                          <a
                            key={att.id}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/50 text-xs transition"
                          >
                            <span>📄</span>
                            <span className="font-semibold text-slate-700 truncate max-w-[200px]">
                              {att.fileName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({formatFileSize(att.fileSize)}) ↗
                            </span>
                          </a>
                        )
                      )}
                    </div>
                  )}

                  {/* Hàng 4: Thanh nút tương tác gọn kiểu Reddit / Threads */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleUpvotePost(post.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                          post.upvotedByMe
                            ? 'bg-blue-50 text-[#0878EE] border border-blue-200'
                            : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                        }`}
                      >
                        <span>▲</span>
                        <span>{post.upvotes}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
                          isExpanded
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                        }`}
                      >
                        <span>💬</span>
                        <span>{post.comments.length} bình luận</span>
                      </button>
                    </div>

                    {/* Quyền điều phối của Admin hoặc Tác giả */}
                    <div className="flex items-center gap-1.5">
                      {post.channel === 'QA_JAPANESE' && (
                        <button
                          type="button"
                          onClick={() => handleToggleSolved(post.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                        >
                          {post.isSolved ? '✓ Đã giải đáp' : 'Đánh dấu đã giải đáp'}
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTogglePin(post.id)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-600 hover:bg-blue-50 cursor-pointer"
                          >
                            {post.isPinned ? 'Bỏ ghim' : '📌 Ghim'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            🗑️ Xóa
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Khu vực Bình luận phân nhánh (chỉ mở khi bấm vào bài) */}
                {isExpanded && (
                  <div className="bg-slate-50/70 border-t border-slate-200/80 p-4 sm:p-5 space-y-4">
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
                                    {formatTimeAgo(cmt.createdAt)}
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
                                    onClick={() => handleToggleUpvoteComment(post.id, cmt.id)}
                                    className={`font-semibold hover:text-blue-600 cursor-pointer ${
                                      cmt.upvotedByMe ? 'text-blue-600' : ''
                                    }`}
                                  >
                                    ▲ Thích ({cmt.upvotes})
                                  </button>
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
                                          {formatTimeAgo(rep.createdAt)}
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
                              handleUploadFiles(e.target.files, 'COMMENT');
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
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Đăng bài thảo luận mới */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h3 className="text-sm font-bold text-[#071A44]">
                ✨ Tạo Chủ đề Thảo luận Cộng đồng
              </h3>
              <button
                type="button"
                onClick={() => setIsComposeOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200/70 text-slate-500 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Chuyên mục
                  </label>
                  <select
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value as ForumChannel)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  >
                    {(Object.keys(CHANNEL_META) as ForumChannel[]).map((ch) => (
                      <option key={ch} value={ch}>
                        {CHANNEL_META[ch].icon} {CHANNEL_META[ch].label}
                      </option>
                    ))}
                  </select>
                </div>

                {!isAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Chế độ danh tính
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewIsAnon(!newIsAnon)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border font-semibold flex items-center justify-between cursor-pointer ${
                        newIsAnon
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>
                        {newIsAnon
                          ? '🕵️ Đăng ẩn danh'
                          : `👤 Hiện tên (${currentUserName})`}
                      </span>
                      <span className="text-[10px] opacity-75">Đổi</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Tiêu đề chủ đề thảo luận hoặc câu hỏi..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <textarea
                  rows={4}
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Nội dung chi tiết câu hỏi, kinh nghiệm học hoặc tài liệu muốn chia sẻ..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <input
                  ref={postFileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadFiles(e.target.files, 'POST');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={isUploadingPostFile}
                  onClick={() => postFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  {isUploadingPostFile
                    ? '⏳ Đang tải lên Cloud...'
                    : '📎 Đính kèm ảnh / tài liệu'}
                </button>
              </div>

              {newAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {newAttachments.map((att) => (
                    <span
                      key={att.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800"
                    >
                      <span>{att.fileType === 'IMAGE' ? '🖼️' : '📄'}</span>
                      <span className="truncate max-w-[160px]">{att.fileName}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewAttachments((prev) => prev.filter((x) => x.id !== att.id))
                        }
                        className="font-bold cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploadingPostFile}
                  className="px-4 py-2 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  Đăng lên Cộng đồng
                </button>
              </div>
            </form>
          </div>
        </div>
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
