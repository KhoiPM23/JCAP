import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const AdminFeedbackView: React.FC = () => {
  const navigate = useNavigate();

  // Tách 2 nhóm quản trị rõ ràng theo góp ý của Mentor:
  // - SUPPORT: Customer Support (cần Admin xử lý & phản hồi)
  // - SUGGESTION: System Suggestions (góp ý trải nghiệm hệ thống 1 chiều)
  const [activeTab, setActiveTab] = useState<'SUPPORT' | 'SUGGESTION'>('SUPPORT');

  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | FeedbackStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [previewImage, setPreviewImage] = useState<FeedbackAttachment | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const loadAllTickets = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const res = await feedbackService.getAllTicketsForAdmin();
    if (res.success && res.data) {
      setTickets(res.data);
      const supportOnly = res.data.filter((t) => t.category !== 'SUGGESTION');
      setSelectedTicketId((prev) => {
        if (prev && supportOnly.some((t) => t.id === prev)) return prev;
        return supportOnly[0]?.id ?? null;
      });
      setErrorMessage(null);
    } else if (!silent) {
      setErrorMessage(res.message || 'Không thể tải danh sách hỗ trợ.');
    }
    if (!silent) setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAllTickets(false);
    const timer = window.setInterval(() => loadAllTickets(true), 10000);
    return () => window.clearInterval(timer);
  }, [loadAllTickets]);

  const supportTickets = useMemo(
    () => tickets.filter((t) => t.category !== 'SUGGESTION'),
    [tickets]
  );

  const suggestionTickets = useMemo(
    () => tickets.filter((t) => t.category === 'SUGGESTION'),
    [tickets]
  );

  const counts = useMemo(() => {
    return {
      ALL: supportTickets.length,
      PENDING: supportTickets.filter((t) => t.status === 'PENDING').length,
      IN_PROGRESS: supportTickets.filter((t) => t.status === 'IN_PROGRESS').length,
      CLOSED: supportTickets.filter((t) => t.status === 'CLOSED').length,
    };
  }, [supportTickets]);

  const filteredSupportTickets = useMemo(() => {
    return supportTickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchAnon = t.anonymousCode.toLowerCase().includes(q);
        if (!matchTitle && !matchAnon) return false;
      }
      return true;
    });
  }, [supportTickets, statusFilter, searchQuery]);

  const selectedTicket = useMemo(
    () => supportTickets.find((t) => t.id === selectedTicketId) || null,
    [supportTickets, selectedTicketId]
  );

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
        setErrorMessage(res.message || 'Không thể cập nhật trạng thái.');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header gọn 1 hàng */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-[#071A44]">
            Quản trị Hỗ trợ Sự cố & Góp ý Hệ thống
          </h1>
          <p className="text-xs text-slate-500">
            Tách biệt giữa xử lý sự cố kỹ thuật/thanh toán (Customer Support) và ghi nhận góp ý trải nghiệm (System Suggestions)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('SUPPORT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'SUPPORT'
                  ? 'bg-white text-[#071A44] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🛠️ Hỗ trợ Sự cố ({supportTickets.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SUGGESTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'SUGGESTION'
                  ? 'bg-white text-[#071A44] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💡 Góp ý Hệ thống ({suggestionTickets.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/community')}
            className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#0878EE] font-bold text-xs transition cursor-pointer"
          >
            💬 Quản lý Diễn đàn ↗
          </button>

          <button
            type="button"
            onClick={() => loadAllTickets(false)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
          >
            🔄
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: CUSTOMER SUPPORT (Xử lý sự cố 1-1) */}
      {activeTab === 'SUPPORT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* CỘT TRÁI (4/12): Danh sách phiếu sự cố */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
              <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`py-1 rounded-lg cursor-pointer ${
                    statusFilter === 'ALL' ? 'bg-white text-[#071A44] shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Tất cả ({counts.ALL})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('PENDING')}
                  className={`py-1 rounded-lg cursor-pointer ${
                    statusFilter === 'PENDING' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Chờ ({counts.PENDING})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('IN_PROGRESS')}
                  className={`py-1 rounded-lg cursor-pointer ${
                    statusFilter === 'IN_PROGRESS' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Đang hỗ trợ ({counts.IN_PROGRESS})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('CLOSED')}
                  className={`py-1 rounded-lg cursor-pointer ${
                    statusFilter === 'CLOSED' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Đóng ({counts.CLOSED})
                </button>
              </div>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã phiếu hoặc tiêu đề..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Đang tải danh sách...
                </div>
              ) : filteredSupportTickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Không có phiếu sự cố nào trong mục này.
                </div>
              ) : (
                filteredSupportTickets.map((ticket) => {
                  const isSelected = ticket.id === selectedTicket?.id;
                  const catMeta = CATEGORY_META[ticket.category] || CATEGORY_META.SYSTEM_BUG;
                  const statusMeta = STATUS_META[ticket.status] || STATUS_META.PENDING;

                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => handleSelectTicket(ticket.id)}
                      className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-4 border-l-[#0878EE]'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta.badgeBg} ${statusMeta.badgeText} ${statusMeta.badgeBorder}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotColor}`} />
                          {statusMeta.label}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatRelativeTime(ticket.updatedAt)}
                        </span>
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                        {ticket.title}
                      </h3>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-mono">{ticket.anonymousCode}</span>
                        <span>
                          {catMeta.icon} {catMeta.label}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* CỘT PHẢI (8/12): Chi tiết & Xử lý sự cố */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            {!selectedTicket ? (
              <div className="p-12 text-center text-xs text-slate-500">
                Chọn một phiếu sự cố ở cột bên trái để xem và phản hồi.
              </div>
            ) : (
              <>
                <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          (STATUS_META[selectedTicket.status] || STATUS_META.PENDING).badgeBg
                        } ${(STATUS_META[selectedTicket.status] || STATUS_META.PENDING).badgeText} ${
                          (STATUS_META[selectedTicket.status] || STATUS_META.PENDING).badgeBorder
                        }`}
                      >
                        {(STATUS_META[selectedTicket.status] || STATUS_META.PENDING).label}
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {selectedTicket.anonymousCode}
                      </span>
                    </div>
                    <h2 className="text-sm sm:text-base font-bold text-[#071A44]">
                      {selectedTicket.title}
                    </h2>
                  </div>

                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleToggleCloseTicket(selectedTicket)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                      selectedTicket.status === 'CLOSED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {selectedTicket.status === 'CLOSED' ? '🔓 Mở lại phiếu' : '🔒 Đóng phiếu'}
                  </button>
                </div>

                <div className="p-4 sm:p-5 space-y-3.5 max-h-[420px] overflow-y-auto bg-[#F8FAFC]">
                  {selectedTicket.messages.map((msg) => {
                    const isAdmin = msg.senderRole === 'ADMIN';
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-xl border p-3.5 space-y-2 ${
                          isAdmin ? 'border-blue-200 bg-white' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">
                            {isAdmin
                              ? '🛡️ Ban Quản trị Hỗ trợ (Admin)'
                              : `👤 Học viên (${selectedTicket.anonymousCode})`}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatRelativeTime(msg.createdAt)}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                          {msg.content}
                        </p>

                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {msg.attachments.map((att) =>
                              att.fileType === 'IMAGE' ? (
                                <img
                                  key={att.id}
                                  src={att.cloudinaryUrl}
                                  alt={att.fileName}
                                  onClick={() => setPreviewImage(att)}
                                  className="h-28 w-auto rounded-lg border border-slate-200 object-cover cursor-pointer"
                                />
                              ) : (
                                <a
                                  key={att.id}
                                  href={att.cloudinaryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-blue-600 font-medium"
                                >
                                  📄 {att.fileName} ↗
                                </a>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 border-t border-slate-200/80 bg-white">
                  {selectedTicket.status === 'CLOSED' ? (
                    <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-100 text-xs">
                      <span className="font-semibold text-slate-700">
                        🔒 Phiếu hỗ trợ đã đóng.
                      </span>
                      <button
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleToggleCloseTicket(selectedTicket)}
                        className="font-bold text-blue-600 cursor-pointer"
                      >
                        Mở lại
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleAdminReply} className="space-y-2.5">
                      <textarea
                        rows={2}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder={`Nhập phản hồi hỗ trợ cho ${selectedTicket.anonymousCode}...`}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                      />

                      {replyAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {replyAttachments.map((att) => (
                            <span
                              key={att.cloudinaryUrl}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800"
                            >
                              <span className="truncate max-w-[160px]">{att.fileName}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setReplyAttachments((prev) =>
                                    prev.filter((x) => x.cloudinaryUrl !== att.cloudinaryUrl)
                                  )
                                }
                                className="font-bold cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <div>
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
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
                          >
                            {isUploadingAttachment ? '⏳ Đang tải...' : '📎 Đính kèm ảnh/tệp'}
                          </button>
                        </div>

                        <button
                          type="submit"
                          disabled={
                            isSubmittingReply ||
                            isUploadingAttachment ||
                            (!replyContent.trim() && replyAttachments.length === 0)
                          }
                          className="px-4 py-1.5 rounded-xl bg-[#071A44] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                        >
                          {isSubmittingReply ? 'Đang gửi...' : 'Gửi phản hồi hỗ trợ'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM SUGGESTIONS (Xem tổng hợp góp ý 1 chiều của người dùng) */}
      {activeTab === 'SUGGESTION' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#071A44]">
                💡 Danh sách Góp ý Cải thiện Hệ thống ({suggestionTickets.length})
              </h2>
              <p className="text-xs text-slate-500">
                Các ý kiến đóng góp 1 chiều từ học viên về trải nghiệm giao diện và tính năng
              </p>
            </div>
          </div>

          {suggestionTickets.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              Chưa có góp ý hệ thống nào.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suggestionTickets.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono font-semibold text-teal-700">
                      💡 {item.anonymousCode}
                    </span>
                    <span>{formatRelativeTime(item.createdAt)}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                    {item.messages[0]?.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox xem ảnh */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-xs font-bold">
              <span>{previewImage.fileName}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex justify-center">
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
