import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';

import {
  type FeedbackCategory,
  type FeedbackStatus,
  type FeedbackAttachment,
  type FeedbackTicket,
  STATUS_META,
  CATEGORY_META,
  feedbackService,
  formatFileSize,
} from '../services/feedbackService';

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const LearnerFeedbackView: React.FC = () => {
  const [myTickets, setMyTickets] = useState<FeedbackTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bộ lọc danh sách của riêng học viên
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeedbackStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal tạo bài góp ý ẩn danh mới
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<FeedbackCategory>('SCENARIO_BUG');
  const [newContent, setNewContent] = useState('');
  const [newAttachments, setNewAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingNewAttachment, setIsUploadingNewAttachment] = useState(false);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Ô nhập phản hồi tiếp theo của học viên
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingReplyAttachment, setIsUploadingReplyAttachment] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Lightbox xem ảnh đính kèm
  const [previewImage, setPreviewImage] = useState<FeedbackAttachment | null>(null);

  const newFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const loadMyTickets = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const res = await feedbackService.getMyTickets();
    if (res.success && res.data) {
      setMyTickets(res.data);
      setSelectedTicketId((prev) => {
        if (prev && res.data!.some((t) => t.id === prev)) return prev;
        return res.data![0]?.id ?? null;
      });
      setErrorMessage(null);
    } else if (!silent) {
      setErrorMessage(res.message || 'Không thể tải lịch sử góp ý của bạn.');
    }
    if (!silent) setIsLoading(false);
  }, []);

  useEffect(() => {
    loadMyTickets(false);
    // Tự động đồng bộ mỗi 10 giây để cập nhật trạng thái Admin đã xem / phản hồi mới
    const timer = window.setInterval(() => {
      loadMyTickets(true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadMyTickets]);

  const counts = useMemo(() => {
    return {
      ALL: myTickets.length,
      PENDING: myTickets.filter((t) => t.status === 'PENDING').length,
      IN_PROGRESS: myTickets.filter((t) => t.status === 'IN_PROGRESS').length,
      CLOSED: myTickets.filter((t) => t.status === 'CLOSED').length,
    };
  }, [myTickets]);

  const filteredTickets = useMemo(() => {
    return myTickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchCode = t.anonymousCode.toLowerCase().includes(q);
        const matchBody = t.messages.some((m) => m.content.toLowerCase().includes(q));
        if (!matchTitle && !matchCode && !matchBody) return false;
      }
      return true;
    });
  }, [myTickets, statusFilter, searchQuery]);

  const selectedTicket = useMemo(
    () => myTickets.find((t) => t.id === selectedTicketId) || null,
    [myTickets, selectedTicketId]
  );

  // Tải tệp/ảnh thực tế lên Cloudinary (folder: issues/)
  const handleFileUpload = async (
    files: FileList | null,
    target: 'NEW' | 'REPLY'
  ) => {
    if (!files || files.length === 0) return;

    const setUploading =
      target === 'NEW' ? setIsUploadingNewAttachment : setIsUploadingReplyAttachment;
    setUploading(true);
    setErrorMessage(null);

    try {
      const uploadedList: FeedbackAttachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          alert(`Tệp "${file.name}" vượt quá giới hạn 5MB.`);
          continue;
        }
        const res = await feedbackService.uploadAttachment(file);
        if (res.success && res.data) {
          uploadedList.push(res.data);
        } else {
          alert(res.message || `Không thể tải tệp "${file.name}" lên Cloudinary.`);
        }
      }

      if (uploadedList.length > 0) {
        if (target === 'NEW') {
          setNewAttachments((prev) => [...prev, ...uploadedList]);
        } else {
          setReplyAttachments((prev) => [...prev, ...uploadedList]);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  // Gửi bài góp ý ẩn danh mới lên Backend & lưu vào Database
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || isSubmittingNew) return;

    setIsSubmittingNew(true);
    setErrorMessage(null);
    try {
      const res = await feedbackService.createTicket({
        title: newTitle.trim(),
        category: newCategory,
        content: newContent.trim(),
        attachments: newAttachments.map((a) => ({
          fileName: a.fileName,
          fileSize: a.fileSize,
          fileType: a.fileType,
          mimeType: a.mimeType,
          cloudinaryUrl: a.cloudinaryUrl,
          cloudinaryPublicId: a.cloudinaryPublicId,
        })),
      });

      if (res.success && res.data) {
        setMyTickets((prev) => [res.data!, ...prev]);
        setSelectedTicketId(res.data.id);
        setNewTitle('');
        setNewContent('');
        setNewAttachments([]);
        setIsNewModalOpen(false);
      } else {
        setErrorMessage(res.message || 'Không thể gửi bài góp ý.');
      }
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Học viên gửi phản hồi trong bài của mình
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || selectedTicket.status === 'CLOSED' || isSubmittingReply) return;
    if (!replyContent.trim() && replyAttachments.length === 0) return;

    setIsSubmittingReply(true);
    setErrorMessage(null);
    try {
      const res = await feedbackService.replyAsLearner(selectedTicket.id, {
        content: replyContent.trim() || '(Đính kèm tệp/ảnh)',
        attachments: replyAttachments.map((a) => ({
          fileName: a.fileName,
          fileSize: a.fileSize,
          fileType: a.fileType,
          mimeType: a.mimeType,
          cloudinaryUrl: a.cloudinaryUrl,
          cloudinaryPublicId: a.cloudinaryPublicId,
        })),
      });

      if (res.success && res.data) {
        setMyTickets((prev) =>
          prev.map((t) => (t.id === res.data!.id ? res.data! : t))
        );
        setReplyContent('');
        setReplyAttachments([]);
      } else {
        setErrorMessage(res.message || 'Không thể gửi phản hồi.');
      }
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div className="w-full font-sans text-slate-900">


      <div className="max-w-7xl w-full mx-auto">
        {/* Header Hòm thư Góp ý Ẩn danh của Học viên */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span>🕵️</span>
                <span>Bảo mật 100% Ẩn danh • Riêng tư giữa Bạn và Admin</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#071A44] tracking-tight">
                Hòm thư Góp ý & Hỗ trợ Ẩn danh của Tôi
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
                Gửi báo lỗi kịch bản, góp ý chấm điểm AI hoặc đề xuất tính năng hoàn toàn <strong>ẩn danh</strong>.
                Bạn <strong>chỉ nhìn thấy lịch sử các bài do chính mình gửi</strong> (không ai khác xem được) và theo dõi trực tiếp xem Admin đã để ý hay phản hồi chưa.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => loadMyTickets(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
                title="Làm mới danh sách"
              >
                <span>🔄</span>
                <span className="hidden sm:inline">Làm mới</span>
              </button>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition cursor-pointer"
              >
                <span className="text-base leading-none">＋</span>
                <span>Gửi góp ý ẩn danh mới</span>
              </button>
            </div>
          </div>

          {/* Thanh 3 trạng thái để học viên theo dõi tiến độ */}
          <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-[#071A44] text-white border-[#071A44] shadow-xs'
                  : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-200/80'
              }`}
            >
              <div>
                <div className="text-[11px] font-medium opacity-80">Tất cả bài của tôi</div>
                <div className="text-xs font-bold mt-0.5">Toàn bộ lịch sử</div>
              </div>
              <span className="text-lg font-extrabold">{counts.ALL}</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                  : 'bg-amber-50/60 hover:bg-amber-50 text-amber-900 border-amber-200'
              }`}
            >
              <div>
                <div className="text-[11px] font-medium opacity-85">Trạng thái 1</div>
                <div className="text-xs font-bold mt-0.5">⏳ Chờ Admin phản hồi</div>
              </div>
              <span className="text-lg font-extrabold">{counts.PENDING}</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-[#0878EE] text-white border-[#0878EE] shadow-xs'
                  : 'bg-blue-50/60 hover:bg-blue-50 text-blue-900 border-blue-200'
              }`}
            >
              <div>
                <div className="text-[11px] font-medium opacity-85">Trạng thái 2</div>
                <div className="text-xs font-bold mt-0.5">💬 Đang trò chuyện</div>
              </div>
              <span className="text-lg font-extrabold">{counts.IN_PROGRESS}</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('CLOSED')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                statusFilter === 'CLOSED'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                  : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-700 border-slate-300'
              }`}
            >
              <div>
                <div className="text-[11px] font-medium opacity-85">Trạng thái 3</div>
                <div className="text-xs font-bold mt-0.5">🔒 Đã đóng</div>
              </div>
              <span className="text-lg font-extrabold">{counts.CLOSED}</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between">
            <span>⚠️ {errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Khung 2 cột: Cột trái = Lịch sử bài của tôi | Cột phải = Luồng trò chuyện với Admin */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* CỘT TRÁI (5/12): Lịch sử bài góp ý của riêng tôi */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
            <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#071A44] uppercase tracking-wider">
                  📬 Lịch sử góp ý của tôi ({filteredTickets.length})
                </span>
                <span className="text-[11px] text-slate-500">Chỉ mình bạn xem được</span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm trong lịch sử góp ý của bạn..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {isLoading ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Đang tải lịch sử hòm thư của bạn...
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="text-2xl">📭</div>
                  <p className="text-sm font-semibold text-slate-700">
                    Chưa có bài góp ý nào trong mục này
                  </p>
                  <p className="text-xs text-slate-500">
                    Bấm &ldquo;Gửi góp ý ẩn danh mới&rdquo; ở góc trên để gửi phản ánh tới Admin.
                  </p>
                </div>
              ) : (
                filteredTickets.map((ticket) => {
                  const isSelected = ticket.id === selectedTicket?.id;
                  const catMeta = CATEGORY_META[ticket.category] || CATEGORY_META.SUGGESTION;
                  const statusMeta = STATUS_META[ticket.status] || STATUS_META.PENDING;
                  const lastMsg = ticket.messages[ticket.messages.length - 1];
                  const totalAttachments = ticket.messages.reduce(
                    (sum, m) => sum + (m.attachments?.length || 0),
                    0
                  );

                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`w-full text-left p-4 transition flex flex-col gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-4 border-l-[#0878EE]'
                          : 'hover:bg-slate-50/90'
                      }`}
                    >
                      {/* Hàng 1: Trạng thái + Mã ẩn danh + Thời gian */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.badgeBg} ${statusMeta.badgeText} ${statusMeta.badgeBorder}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotColor}`} />
                          {statusMeta.label}
                        </span>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="font-mono font-semibold text-slate-500">
                            {ticket.anonymousCode}
                          </span>
                          <span>•</span>
                          <span>{formatRelativeTime(ticket.updatedAt)}</span>
                        </div>
                      </div>

                      {/* Tiêu đề */}
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                        {ticket.title}
                      </h3>

                      {/* Chỉ báo Admin đã để ý hay chưa */}
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium border ${catMeta.badgeBg} ${catMeta.badgeText} ${catMeta.badgeBorder}`}
                        >
                          <span>{catMeta.icon}</span>
                          <span>{catMeta.label}</span>
                        </span>

                        {ticket.status === 'PENDING' && (
                          <span
                            className={`text-[11px] font-medium ${
                              ticket.adminSeenAt ? 'text-blue-600' : 'text-amber-700'
                            }`}
                          >
                            {ticket.adminSeenAt
                              ? '👁️ Admin đã xem bài của bạn'
                              : '⏳ Admin chưa mở xem'}
                          </span>
                        )}

                        {ticket.status === 'IN_PROGRESS' && lastMsg && (
                          <span
                            className={`text-[11px] font-semibold ${
                              lastMsg.senderRole === 'ADMIN'
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {lastMsg.senderRole === 'ADMIN'
                              ? '🛡️ Admin vừa phản hồi bạn'
                              : '✓ Bạn đã phản hồi'}
                          </span>
                        )}
                      </div>

                      {/* Thống kê số tin nhắn & tệp đính kèm */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span>💬 {ticket.messages.length} tin nhắn trong luồng</span>
                        {totalAttachments > 0 && <span>📎 {totalAttachments} tệp đính kèm</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* CỘT PHẢI (7/12): Chi tiết lịch sử trò chuyện giữa Tôi và Admin */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
            {!selectedTicket ? (
              <div className="p-14 text-center space-y-3">
                <div className="text-3xl">💬</div>
                <h2 className="text-base font-bold text-slate-700">
                  Chọn một bài góp ý ở cột bên trái để xem cuộc trò chuyện với Admin
                </h2>
              </div>
            ) : (
              <>
                {/* Header của bài góp ý + Thanh tiến trình 3 bước */}
                <div className="p-5 border-b border-slate-200/80 bg-slate-50/40 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                          (STATUS_META[selectedTicket.status] || STATUS_META.PENDING).badgeBg
                        } ${(STATUS_META[selectedTicket.status] || STATUS_META.PENDING).badgeText} ${
                          (STATUS_META[selectedTicket.status] || STATUS_META.PENDING).badgeBorder
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            (STATUS_META[selectedTicket.status] || STATUS_META.PENDING).dotColor
                          }`}
                        />
                        {(STATUS_META[selectedTicket.status] || STATUS_META.PENDING).label}
                      </span>

                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        🕵️ Mã ẩn danh của bạn: {selectedTicket.anonymousCode}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${
                          (CATEGORY_META[selectedTicket.category] || CATEGORY_META.SUGGESTION).badgeBg
                        } ${(CATEGORY_META[selectedTicket.category] || CATEGORY_META.SUGGESTION).badgeText} ${
                          (CATEGORY_META[selectedTicket.category] || CATEGORY_META.SUGGESTION).badgeBorder
                        }`}
                      >
                        <span>
                          {(CATEGORY_META[selectedTicket.category] || CATEGORY_META.SUGGESTION).icon}
                        </span>
                        <span>
                          {(CATEGORY_META[selectedTicket.category] || CATEGORY_META.SUGGESTION).label}
                        </span>
                      </span>
                    </div>

                    <span className="text-xs text-slate-500">
                      Gửi lúc {formatRelativeTime(selectedTicket.createdAt)}
                    </span>
                  </div>

                  <h2 className="text-base sm:text-lg font-bold text-[#071A44] leading-snug">
                    {selectedTicket.title}
                  </h2>

                  {/* Thanh theo dõi trạng thái trực quan cho Học viên */}
                  <div className="p-3 rounded-xl bg-white border border-slate-200/90 space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold">
                      <div
                        className={`py-1.5 px-2 rounded-lg border ${
                          selectedTicket.status === 'PENDING'
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-emerald-50/70 border-emerald-200 text-emerald-700'
                        }`}
                      >
                        1. Đã gửi ẩn danh
                        {selectedTicket.adminSeenAt && (
                          <span className="block text-[10px] font-normal">
                            (Admin đã xem {formatRelativeTime(selectedTicket.adminSeenAt)})
                          </span>
                        )}
                      </div>

                      <div
                        className={`py-1.5 px-2 rounded-lg border ${
                          selectedTicket.status === 'IN_PROGRESS'
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : selectedTicket.status === 'CLOSED'
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        2. Đang trò chuyện với Admin
                      </div>

                      <div
                        className={`py-1.5 px-2 rounded-lg border ${
                          selectedTicket.status === 'CLOSED'
                            ? 'bg-slate-800 border-slate-800 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        3. Admin đóng bài
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600">
                      💡 {(STATUS_META[selectedTicket.status] || STATUS_META.PENDING).learnerHint}
                    </p>
                  </div>
                </div>

                {/* Luồng tin nhắn phân nhánh giữa Tôi (Ẩn danh) và Admin */}
                <div className="p-5 space-y-5 max-h-[480px] overflow-y-auto bg-[#F8FAFC]">
                  {selectedTicket.messages.map((msg, idx) => {
                    const isAdmin = msg.senderRole === 'ADMIN';
                    return (
                      <div key={msg.id} className="relative pl-5">
                        {idx < selectedTicket.messages.length - 1 && (
                          <div className="absolute left-2 top-7 bottom-[-22px] w-0.5 bg-slate-200" />
                        )}
                        <div
                          className={`absolute left-0 top-3 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] ${
                            isAdmin
                              ? 'bg-[#071A44] border-[#071A44] text-white'
                              : 'bg-white border-[#0878EE] text-[#0878EE]'
                          }`}
                        >
                          {isAdmin ? '★' : '●'}
                        </div>

                        <div
                          className={`rounded-2xl border overflow-hidden shadow-2xs ${
                            isAdmin
                              ? 'border-blue-200/90 bg-white ring-1 ring-blue-500/10'
                              : 'border-slate-200/90 bg-white'
                          }`}
                        >
                          <div
                            className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 text-xs ${
                              isAdmin
                                ? 'bg-gradient-to-r from-[#071A44] to-[#0E2963] text-white border-slate-800'
                                : 'bg-slate-50/90 text-slate-700 border-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  isAdmin
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {isAdmin ? '🛡️' : '🕵️'}
                              </span>
                              <span className="font-bold">
                                {isAdmin
                                  ? 'Ban Quản trị JCAP (Admin)'
                                  : `Bạn (${selectedTicket.anonymousCode})`}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isAdmin
                                    ? 'bg-blue-400/20 text-blue-100 border border-blue-300/30'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {isAdmin ? 'Phản hồi chính thức' : 'Đã ẩn danh'}
                              </span>
                            </div>

                            <span className={isAdmin ? 'text-slate-300' : 'text-slate-400'}>
                              {formatRelativeTime(msg.createdAt)}
                            </span>
                          </div>

                          <div className="p-4 space-y-3">
                            <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                              {msg.content}
                            </p>

                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="pt-2 border-t border-slate-100 space-y-2">
                                <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                                  <span>☁️ Tệp đính kèm trên Cloudinary ({msg.attachments.length}):</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {msg.attachments.map((att) =>
                                    att.fileType === 'IMAGE' ? (
                                      <div
                                        key={att.id}
                                        onClick={() => setPreviewImage(att)}
                                        className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 cursor-pointer hover:border-blue-400 transition"
                                      >
                                        <img
                                          src={att.cloudinaryUrl}
                                          alt={att.fileName}
                                          className="w-full h-32 object-cover group-hover:opacity-90 transition"
                                        />
                                        <div className="p-2 bg-white flex items-center justify-between text-[11px]">
                                          <span className="font-medium text-slate-700 truncate">
                                            🖼️ {att.fileName}
                                          </span>
                                          <span className="text-slate-400 shrink-0 ml-2">
                                            {formatFileSize(att.fileSize)}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <a
                                        key={att.id}
                                        href={att.cloudinaryUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/50 transition"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-sm shrink-0">
                                            📄
                                          </span>
                                          <div className="min-w-0">
                                            <div className="text-xs font-semibold text-slate-800 truncate">
                                              {att.fileName}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-mono truncate">
                                              ☁️ {att.cloudinaryPublicId} • {formatFileSize(att.fileSize)}
                                            </div>
                                          </div>
                                        </div>
                                        <span className="text-[11px] font-semibold text-blue-600 shrink-0 ml-2">
                                          Mở tệp ↗
                                        </span>
                                      </a>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Khu vực trả lời tiếp theo (Chỉ mở khi bài chưa bị Admin đóng) */}
                <div className="p-4 border-t border-slate-200/80 bg-white">
                  {selectedTicket.status === 'CLOSED' ? (
                    <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-center space-y-1">
                      <div className="text-xs font-bold text-slate-700">
                        🔒 Bài góp ý này đã được Admin đóng lại
                      </div>
                      <p className="text-xs text-slate-500">
                        Chỉ Admin mới có quyền đóng hoặc mở lại bài. Nếu bạn có vấn đề mới, vui lòng tạo bài góp ý ẩn danh mới.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSendReply} className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">
                          🕵️ Gửi tin nhắn tiếp theo cho Admin (ẩn danh {selectedTicket.anonymousCode})
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Chỉ Admin mới có quyền đóng bài này
                        </span>
                      </div>

                      <textarea
                        rows={3}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Nhập nội dung phản hồi thêm cho Admin..."
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                      />

                      {replyAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {replyAttachments.map((att) => (
                            <div
                              key={att.cloudinaryUrl}
                              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800"
                            >
                              <span>{att.fileType === 'IMAGE' ? '🖼️' : '📎'}</span>
                              <span className="font-medium max-w-[180px] truncate">{att.fileName}</span>
                              <span className="text-[10px] text-blue-600">
                                ({formatFileSize(att.fileSize)})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setReplyAttachments((prev) =>
                                    prev.filter((x) => x.cloudinaryUrl !== att.cloudinaryUrl)
                                  )
                                }
                                className="text-blue-500 hover:text-red-600 font-bold ml-1 cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            multiple
                            accept="image/*,.pdf,.txt,.log,.json,.zip,.doc,.docx"
                            className="hidden"
                            onChange={(e) => {
                              handleFileUpload(e.target.files, 'REPLY');
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            disabled={isUploadingReplyAttachment}
                            onClick={() => replyFileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-medium transition cursor-pointer"
                          >
                            <span>📎</span>
                            <span>
                              {isUploadingReplyAttachment
                                ? 'Đang tải lên Cloudinary...'
                                : 'Đính kèm ảnh / tệp nhỏ (≤ 5MB)'}
                            </span>
                          </button>
                        </div>

                        <button
                          type="submit"
                          disabled={
                            isSubmittingReply ||
                            isUploadingReplyAttachment ||
                            (!replyContent.trim() && replyAttachments.length === 0)
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0878EE] hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold shadow-2xs transition cursor-pointer"
                        >
                          <span>{isSubmittingReply ? '⏳ Đang gửi...' : '📤 Gửi phản hồi ẩn danh'}</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal tạo bài góp ý ẩn danh mới */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div>
                <h3 className="text-base font-bold text-[#071A44]">
                  🕵️ Gửi Góp ý & Phản ánh Ẩn danh Mới
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chỉ bạn và Admin xem được cuộc trò chuyện này. Admin không thể biết danh tính của bạn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-500 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Phân loại góp ý
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as FeedbackCategory)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {(Object.keys(CATEGORY_META) as FeedbackCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tiêu đề tóm tắt *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Lỗi chấm từ vựng ở kịch bản Nhà hàng Izakaya N4..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nội dung chi tiết (Lưu vào Database) *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Mô tả chi tiết vấn đề hoặc ý kiến đóng góp của bạn..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>

              {/* Đính kèm ảnh / tệp nhỏ lên Cloudinary */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Đính kèm hình ảnh / tệp nhỏ (Lưu trên Cloudinary folder <code className="font-mono">issues/</code>, tối đa 5MB/tệp)
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={newFileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.txt,.log,.json,.zip,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      handleFileUpload(e.target.files, 'NEW');
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={isUploadingNewAttachment}
                    onClick={() => newFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-medium cursor-pointer"
                  >
                    <span>📁</span>
                    <span>
                      {isUploadingNewAttachment
                        ? 'Đang tải lên Cloudinary...'
                        : 'Chọn ảnh / tệp từ máy (Cloudinary)'}
                    </span>
                  </button>
                </div>

                {newAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {newAttachments.map((att) => (
                      <div
                        key={att.cloudinaryUrl}
                        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800"
                      >
                        <span>{att.fileType === 'IMAGE' ? '🖼️' : '📎'}</span>
                        <span className="font-medium max-w-[180px] truncate">{att.fileName}</span>
                        <span className="text-[10px] text-blue-600">
                          ({formatFileSize(att.fileSize)})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewAttachments((prev) =>
                              prev.filter((x) => x.cloudinaryUrl !== att.cloudinaryUrl)
                            )
                          }
                          className="text-blue-500 hover:text-red-600 font-bold cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew || isUploadingNewAttachment}
                  className="px-4 py-2 rounded-xl bg-[#0878EE] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm cursor-pointer"
                >
                  {isSubmittingNew ? '⏳ Đang gửi...' : '🚀 Gửi bài góp ý ẩn danh'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox xem ảnh đính kèm */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">
                  🖼️ {previewImage.fileName} ({formatFileSize(previewImage.fileSize)})
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate">
                  ☁️ Cloudinary URL: {previewImage.cloudinaryUrl}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center">
              <img
                src={previewImage.cloudinaryUrl}
                alt={previewImage.fileName}
                className="max-h-[420px] w-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
