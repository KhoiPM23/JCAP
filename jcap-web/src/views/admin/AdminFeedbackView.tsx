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
} from '../../services/feedbackService';

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

export const AdminFeedbackView: React.FC = () => {
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bộ lọc quản trị
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeedbackStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | FeedbackCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Ô nhập phản hồi của Admin
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Lightbox xem ảnh đính kèm
  const [previewImage, setPreviewImage] = useState<FeedbackAttachment | null>(null);

  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const loadAllTickets = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const res = await feedbackService.getAllTicketsForAdmin();
    if (res.success && res.data) {
      setTickets(res.data);
      setSelectedTicketId((prev) => {
        if (prev && res.data!.some((t) => t.id === prev)) return prev;
        return res.data![0]?.id ?? null;
      });
      setErrorMessage(null);
    } else if (!silent) {
      setErrorMessage(res.message || 'Không thể tải danh sách hòm thư quản trị.');
    }
    if (!silent) setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAllTickets(false);
    const timer = window.setInterval(() => {
      loadAllTickets(true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadAllTickets]);

  const counts = useMemo(() => {
    return {
      ALL: tickets.length,
      PENDING: tickets.filter((t) => t.status === 'PENDING').length,
      IN_PROGRESS: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
      CLOSED: tickets.filter((t) => t.status === 'CLOSED').length,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchAnon = t.anonymousCode.toLowerCase().includes(q);
        const matchBody = t.messages.some((m) => m.content.toLowerCase().includes(q));
        if (!matchTitle && !matchAnon && !matchBody) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, searchQuery]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  // Khi Admin bấm chọn một bài đang PENDING mà chưa có adminSeenAt -> gọi API đánh dấu Admin đã mở xem
  const handleSelectTicket = async (ticketId: number) => {
    setSelectedTicketId(ticketId);
    const target = tickets.find((t) => t.id === ticketId);
    if (target && !target.adminSeenAt) {
      const res = await feedbackService.markSeenByAdmin(ticketId);
      if (res.success && res.data) {
        setTickets((prev) => prev.map((t) => (t.id === res.data!.id ? res.data! : t)));
      }
    }
  };

  // Tải tệp đính kèm thực tế lên Cloudinary (folder: issues/)
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploadingAttachment(true);
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
        setReplyAttachments((prev) => [...prev, ...uploadedList]);
      }
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  // Admin gửi phản hồi -> trạng thái tự động chuyển từ PENDING sang IN_PROGRESS (Đang trò chuyện)
  const handleAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || selectedTicket.status === 'CLOSED' || isSubmittingReply) return;
    if (!replyContent.trim() && replyAttachments.length === 0) return;

    setIsSubmittingReply(true);
    setErrorMessage(null);
    try {
      const res = await feedbackService.replyAsAdmin(selectedTicket.id, {
        content: replyContent.trim() || '(Đính kèm tệp/ảnh từ Admin)',
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
        setTickets((prev) => prev.map((t) => (t.id === res.data!.id ? res.data! : t)));
        setReplyContent('');
        setReplyAttachments([]);
      } else {
        setErrorMessage(res.message || 'Không thể gửi phản hồi Admin.');
      }
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Admin đóng bài hoặc mở lại bài
  const handleToggleCloseTicket = async (ticket: FeedbackTicket) => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setErrorMessage(null);
    try {
      const res =
        ticket.status === 'CLOSED'
          ? await feedbackService.reopenTicketAsAdmin(ticket.id)
          : await feedbackService.closeTicketAsAdmin(ticket.id);

      if (res.success && res.data) {
        setTickets((prev) => prev.map((t) => (t.id === res.data!.id ? res.data! : t)));
      } else {
        setErrorMessage(res.message || 'Không thể cập nhật trạng thái bài góp ý.');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Quản trị Hòm thư Góp ý Ẩn danh */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <span>🛡️ Quản trị Hòm thư Góp ý Ẩn danh</span>
              <span>•</span>
              <span>Bảo vệ danh tính người gửi (#ANON)</span>
            </div>
            <h1 className="text-xl font-bold text-[#071A44]">
              Tiếp nhận & Phản hồi Góp ý Học viên
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Toàn bộ bài góp ý của học viên được ẩn danh hoàn toàn (không hiển thị tên, email hay ID tài khoản).
              Khi Admin phản hồi, trạng thái sẽ tự động chuyển sang <strong>Đang trò chuyện</strong>. Chỉ Admin mới có quyền <strong>Đóng bài</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs">
              <span className="text-amber-700">Chờ Admin phản hồi: </span>
              <strong className="text-amber-900 font-bold">{counts.PENDING}</strong>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs">
              <span className="text-blue-700">Đang trò chuyện: </span>
              <strong className="text-blue-900 font-bold">{counts.IN_PROGRESS}</strong>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs">
              <span className="text-slate-600">Đã đóng: </span>
              <strong className="text-slate-800 font-bold">{counts.CLOSED}</strong>
            </div>
            <button
              type="button"
              onClick={() => loadAllTickets(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
              title="Làm mới danh sách"
            >
              <span>🔄</span>
              <span>Làm mới</span>
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between">
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

      {/* Bố cục 2 cột cho Admin */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (5/12): Danh sách tất cả bài góp ý ẩn danh gửi về hệ thống */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
            {/* Bộ lọc 3 trạng thái */}
            <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-[#071A44] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({counts.ALL})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PENDING')}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer ${
                  statusFilter === 'PENDING'
                    ? 'bg-white text-amber-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chờ ({counts.PENDING})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('IN_PROGRESS')}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer ${
                  statusFilter === 'IN_PROGRESS'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đang chat ({counts.IN_PROGRESS})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CLOSED')}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer ${
                  statusFilter === 'CLOSED'
                    ? 'bg-white text-slate-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đã đóng ({counts.CLOSED})
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã #ANON, tiêu đề, nội dung..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | FeedbackCategory)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-700"
              >
                <option value="ALL">Mọi danh mục</option>
                {(Object.keys(CATEGORY_META) as FeedbackCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
            {isLoading ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Đang tải danh sách hòm thư góp ý...
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Không có bài góp ý nào khớp với bộ lọc hiện tại.
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = ticket.id === selectedTicket?.id;
                const catMeta = CATEGORY_META[ticket.category] || CATEGORY_META.SUGGESTION;
                const statusMeta = STATUS_META[ticket.status] || STATUS_META.PENDING;
                const lastMsg = ticket.messages[ticket.messages.length - 1];
                const waitingForAdmin =
                  ticket.status === 'PENDING' ||
                  (ticket.status === 'IN_PROGRESS' && lastMsg?.senderRole === 'LEARNER');

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => handleSelectTicket(ticket.id)}
                    className={`w-full text-left p-4 transition flex flex-col gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-l-[#0878EE]'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.badgeBg} ${statusMeta.badgeText} ${statusMeta.badgeBorder}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotColor}`} />
                          {statusMeta.label}
                        </span>
                        {waitingForAdmin && ticket.status !== 'CLOSED' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                            Cần phản hồi
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400">
                        {formatRelativeTime(ticket.updatedAt)}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                      {ticket.title}
                    </h3>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-mono font-semibold text-slate-600">
                        🕵️ {ticket.anonymousCode} (Ẩn danh)
                      </span>
                      <span>
                        {catMeta.icon} {catMeta.label} • 💬 {ticket.messages.length}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* CỘT PHẢI (7/12): Luồng xử lý & Đóng bài dành cho Admin */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {!selectedTicket ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Chọn một bài góp ý ở cột bên trái để xem chi tiết và phản hồi cho học viên.
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-slate-200/80 bg-slate-50/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
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

                    <span className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      🕵️ Người gửi: {selectedTicket.anonymousCode} (Đã ẩn danh tính)
                    </span>
                  </div>

                  {/* Nút Đóng / Mở lại bài - Đặc quyền của Admin */}
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleToggleCloseTicket(selectedTicket)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                      selectedTicket.status === 'CLOSED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    {selectedTicket.status === 'CLOSED' ? (
                      <>
                        <span>🔓</span>
                        <span>Mở lại bài góp ý</span>
                      </>
                    ) : (
                      <>
                        <span>🔒</span>
                        <span>Đóng bài góp ý này</span>
                      </>
                    )}
                  </button>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-[#071A44]">
                  {selectedTicket.title}
                </h2>
              </div>

              {/* Luồng tin nhắn */}
              <div className="p-5 space-y-4 max-h-[460px] overflow-y-auto bg-[#F8FAFC]">
                {selectedTicket.messages.map((msg) => {
                  const isAdmin = msg.senderRole === 'ADMIN';
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-2xl border overflow-hidden shadow-2xs ${
                        isAdmin ? 'border-blue-200 bg-white' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div
                        className={`px-4 py-2.5 border-b flex items-center justify-between text-xs ${
                          isAdmin
                            ? 'bg-[#071A44] text-white border-slate-800'
                            : 'bg-slate-50 text-slate-700 border-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold">
                          <span>{isAdmin ? '🛡️ Ban Quản trị (Admin)' : `🕵️ Học viên ẩn danh (${selectedTicket.anonymousCode})`}</span>
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
                          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {msg.attachments.map((att) =>
                              att.fileType === 'IMAGE' ? (
                                <div
                                  key={att.id}
                                  onClick={() => setPreviewImage(att)}
                                  className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 cursor-pointer hover:border-blue-400"
                                >
                                  <img
                                    src={att.cloudinaryUrl}
                                    alt={att.fileName}
                                    className="w-full h-32 object-cover"
                                  />
                                  <div className="p-2 bg-white flex items-center justify-between text-[11px]">
                                    <span className="truncate font-medium">🖼️ {att.fileName}</span>
                                    <span className="text-slate-400">{formatFileSize(att.fileSize)}</span>
                                  </div>
                                </div>
                              ) : (
                                <a
                                  key={att.id}
                                  href={att.cloudinaryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/40 flex items-center justify-between text-xs"
                                >
                                  <span className="font-semibold truncate">📄 {att.fileName}</span>
                                  <span className="text-slate-400 shrink-0 ml-2">
                                    {formatFileSize(att.fileSize)} ↗
                                  </span>
                                </a>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Khung Admin phản hồi */}
              <div className="p-4 border-t border-slate-200/80 bg-white">
                {selectedTicket.status === 'CLOSED' ? (
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
                    <span className="font-semibold text-slate-700">
                      🔒 Bài góp ý này đang ở trạng thái Đã đóng.
                    </span>
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleToggleCloseTicket(selectedTicket)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      🔓 Mở lại để phản hồi tiếp
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleAdminReply} className="space-y-3">
                    <textarea
                      rows={3}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder={`Nhập phản hồi chính thức của Admin gửi tới ${selectedTicket.anonymousCode}...`}
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />

                    {replyAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {replyAttachments.map((att) => (
                          <div
                            key={att.cloudinaryUrl}
                            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800"
                          >
                            <span>{att.fileType === 'IMAGE' ? '🖼️' : '📎'}</span>
                            <span className="truncate max-w-[180px]">{att.fileName}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setReplyAttachments((prev) =>
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

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={replyFileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.txt,.log,.json,.zip,.doc,.docx"
                          className="hidden"
                          onChange={(e) => {
                            handleFileUpload(e.target.files);
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          disabled={isUploadingAttachment}
                          onClick={() => replyFileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-xs font-medium text-slate-700 cursor-pointer"
                        >
                          {isUploadingAttachment
                            ? '⏳ Đang tải lên Cloudinary...'
                            : '📎 Đính kèm ảnh / tệp (Cloudinary)'}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isUpdatingStatus}
                          onClick={() => handleToggleCloseTicket(selectedTicket)}
                          className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 text-xs font-bold cursor-pointer"
                        >
                          🔒 Đóng bài
                        </button>
                        <button
                          type="submit"
                          disabled={
                            isSubmittingReply ||
                            isUploadingAttachment ||
                            (!replyContent.trim() && replyAttachments.length === 0)
                          }
                          className="px-4 py-2 rounded-xl bg-[#071A44] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                        >
                          {isSubmittingReply ? '⏳ Đang gửi...' : '🛡️ Gửi phản hồi của Admin'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox xem ảnh */}
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
