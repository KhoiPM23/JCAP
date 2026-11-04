import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

const SUPPORT_CATEGORIES: FeedbackCategory[] = [
  'PAYMENT_CREDIT',
  'SYSTEM_BUG',
  'SCENARIO_BUG',
  'AI_ASSESSMENT',
];

export const LearnerFeedbackView: React.FC = () => {
  const navigate = useNavigate();

  // 2 nhóm chức năng tách biệt theo định hướng Mentor:
  // - SUPPORT: Hỗ trợ sự cố kỹ thuật / thanh toán / tài liệu (tương tác 1-1 với Admin)
  // - SUGGESTION: Góp ý cải thiện hệ thống 1 chiều (không yêu cầu Admin phản hồi trực tiếp)
  const [activeMode, setActiveMode] = useState<'SUPPORT' | 'SUGGESTION'>('SUPPORT');

  const [myTickets, setMyTickets] = useState<FeedbackTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | FeedbackStatus>('ALL');

  // Modal tạo yêu cầu hỗ trợ sự cố
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<FeedbackCategory>('PAYMENT_CREDIT');
  const [newContent, setNewContent] = useState('');
  const [newAttachments, setNewAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingNewAttachment, setIsUploadingNewAttachment] = useState(false);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Form gửi góp ý hệ thống 1 chiều (System Suggestion)
  const [suggestionTitle, setSuggestionTitle] = useState('');
  const [suggestionContent, setSuggestionContent] = useState('');
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);

  // Ô nhập phản hồi trong luồng Hỗ trợ sự cố
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingReplyAttachment, setIsUploadingReplyAttachment] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const [previewImage, setPreviewImage] = useState<FeedbackAttachment | null>(null);

  const newFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const loadMyTickets = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const res = await feedbackService.getMyTickets();
    if (res.success && res.data) {
      setMyTickets(res.data);
      const supportOnly = res.data.filter((t) => t.category !== 'SUGGESTION');
      setSelectedTicketId((prev) => {
        if (prev && supportOnly.some((t) => t.id === prev)) return prev;
        return supportOnly[0]?.id ?? null;
      });
      setErrorMessage(null);
    } else if (!silent) {
      setErrorMessage(res.message || 'Không thể tải danh sách yêu cầu hỗ trợ.');
    }
    if (!silent) setIsLoading(false);
  }, []);

  useEffect(() => {
    loadMyTickets(false);
    const timer = window.setInterval(() => loadMyTickets(true), 10000);
    return () => window.clearInterval(timer);
  }, [loadMyTickets]);

  // Tách riêng danh sách phiếu Hỗ trợ sự cố vs Góp ý hệ thống
  const supportTickets = useMemo(
    () => myTickets.filter((t) => t.category !== 'SUGGESTION'),
    [myTickets]
  );

  const suggestionTickets = useMemo(
    () => myTickets.filter((t) => t.category === 'SUGGESTION'),
    [myTickets]
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
      return true;
    });
  }, [supportTickets, statusFilter]);

  const selectedTicket = useMemo(
    () => supportTickets.find((t) => t.id === selectedTicketId) || null,
    [supportTickets, selectedTicketId]
  );

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

  // Gửi phiếu yêu cầu Hỗ trợ sự cố (Customer Support)
  const handleCreateSupportTicket = async (e: React.FormEvent) => {
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
        setErrorMessage(res.message || 'Không thể gửi yêu cầu hỗ trợ.');
      }
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Gửi Góp ý hệ thống 1 chiều (System Suggestion - không cần chờ Admin chat lại)
  const handleSendSystemSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestionTitle.trim() || !suggestionContent.trim() || isSubmittingSuggestion) return;

    setIsSubmittingSuggestion(true);
    setErrorMessage(null);
    setSuccessBanner(null);
    try {
      const res = await feedbackService.createTicket({
        title: suggestionTitle.trim(),
        category: 'SUGGESTION',
        content: suggestionContent.trim(),
        attachments: [],
      });

      if (res.success && res.data) {
        setMyTickets((prev) => [res.data!, ...prev]);
        setSuggestionTitle('');
        setSuggestionContent('');
        setSuccessBanner('Cảm ơn bạn! Góp ý trải nghiệm hệ thống đã được ghi nhận.');
      } else {
        setErrorMessage(res.message || 'Không thể gửi góp ý.');
      }
    } finally {
      setIsSubmittingSuggestion(false);
    }
  };

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
        setErrorMessage(res.message || 'Không thể gửi tin nhắn.');
      }
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-4 font-sans text-slate-900">
      {/* Header gọn 1 hàng + Chuyển đổi 2 nhóm chức năng rõ ràng */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xl shrink-0">
            🛠️
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#071A44] tracking-tight">
              Trung tâm Hỗ trợ & Góp ý Hệ thống
            </h1>
            <p className="text-xs text-slate-500">
              Xử lý sự cố thanh toán, lỗi tài liệu học tập hoặc gửi góp ý cải tiến sản phẩm
            </p>
          </div>
        </div>

        {/* Chuyển đổi nhanh giữa Hỗ trợ sự cố / Góp ý hệ thống / Diễn đàn học tập */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveMode('SUPPORT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeMode === 'SUPPORT'
                  ? 'bg-white text-[#071A44] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🛠️ Hỗ trợ Sự cố ({supportTickets.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('SUGGESTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeMode === 'SUGGESTION'
                  ? 'bg-white text-[#071A44] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💡 Góp ý Hệ thống
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate('/community')}
            className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#0878EE] text-xs font-bold transition cursor-pointer"
          >
            💬 Hỏi bài tại Diễn đàn ↗
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

      {/* =====================================================================
          CHẾ ĐỘ 1: CUSTOMER SUPPORT (Báo lỗi thanh toán, kỹ thuật, tài liệu)
      ===================================================================== */}
      {activeMode === 'SUPPORT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* CỘT TRÁI (4/12): Danh sách phiếu yêu cầu hỗ trợ của tôi */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#071A44]">
                  Phiếu hỗ trợ của tôi
                </span>
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
                >
                  ＋ Báo sự cố mới
                </button>
              </div>

              {/* Bộ lọc trạng thái gọn */}
              <div className="grid grid-cols-4 gap-1 bg-slate-200/60 p-1 rounded-xl text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`py-1 rounded-lg cursor-pointer ${
                    statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
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
                  Đang xử lý ({counts.IN_PROGRESS})
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
            </div>

            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Đang tải danh sách...
                </div>
              ) : filteredSupportTickets.length === 0 ? (
                <div className="p-8 text-center space-y-1.5">
                  <div className="text-xl">📭</div>
                  <p className="text-xs font-semibold text-slate-600">
                    Chưa có phiếu yêu cầu hỗ trợ nào
                  </p>
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
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-4 border-l-[#0878EE]'
                          : 'hover:bg-slate-50'
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
                        <span>
                          {catMeta.icon} {catMeta.label}
                        </span>
                        {ticket.status === 'PENDING' && (
                          <span className={ticket.adminSeenAt ? 'text-blue-600' : 'text-amber-600'}>
                            {ticket.adminSeenAt ? '👁️ Admin đã xem' : '⏳ Chờ tiếp nhận'}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* CỘT PHẢI (8/12): Chi tiết trao đổi xử lý sự cố với Admin */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
            {!selectedTicket ? (
              <div className="p-12 text-center text-xs text-slate-500">
                Chọn một phiếu ở cột bên trái để xem tiến độ xử lý của Admin.
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
                        Mã phiếu: {selectedTicket.anonymousCode}
                      </span>
                    </div>
                    <h2 className="text-sm sm:text-base font-bold text-[#071A44]">
                      {selectedTicket.title}
                    </h2>
                  </div>

                  <span className="text-xs text-slate-400">
                    {formatRelativeTime(selectedTicket.createdAt)}
                  </span>
                </div>

                {/* Luồng tin nhắn gọn */}
                <div className="p-4 sm:p-5 space-y-3.5 max-h-[420px] overflow-y-auto bg-[#F8FAFC]">
                  {selectedTicket.messages.map((msg) => {
                    const isAdmin = msg.senderRole === 'ADMIN';
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-xl border p-3.5 space-y-2 ${
                          isAdmin
                            ? 'bg-white border-blue-200 shadow-2xs'
                            : 'bg-white border-slate-200/90'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>{isAdmin ? '🛡️' : '👤'}</span>
                            <span>
                              {isAdmin
                                ? 'Ban Quản trị Hỗ trợ (Admin)'
                                : `Bạn (${selectedTicket.anonymousCode})`}
                            </span>
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
                                  className="h-28 w-auto rounded-lg border border-slate-200 object-cover cursor-pointer hover:border-blue-400"
                                />
                              ) : (
                                <a
                                  key={att.id}
                                  href={att.cloudinaryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-blue-600 font-medium"
                                >
                                  📄 {att.fileName} ({formatFileSize(att.fileSize)}) ↗
                                </a>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Khung trả lời tiếp theo */}
                <div className="p-4 border-t border-slate-200/80 bg-white">
                  {selectedTicket.status === 'CLOSED' ? (
                    <div className="py-2.5 px-4 rounded-xl bg-slate-100 text-center text-xs text-slate-600 font-medium">
                      🔒 Sự cố này đã được xử lý xong và đóng lại.
                    </div>
                  ) : (
                    <form onSubmit={handleSendReply} className="space-y-2.5">
                      <textarea
                        rows={2}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Bổ sung thông tin hoặc phản hồi cho Admin..."
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
                              handleFileUpload(e.target.files, 'REPLY');
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            disabled={isUploadingReplyAttachment}
                            onClick={() => replyFileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
                          >
                            {isUploadingReplyAttachment
                              ? '⏳ Đang tải lên Cloud...'
                              : '📎 Đính kèm ảnh / tệp'}
                          </button>
                        </div>

                        <button
                          type="submit"
                          disabled={
                            isSubmittingReply ||
                            isUploadingReplyAttachment ||
                            (!replyContent.trim() && replyAttachments.length === 0)
                          }
                          className="px-4 py-1.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                        >
                          {isSubmittingReply ? 'Đang gửi...' : 'Gửi tin nhắn'}
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

      {/* =====================================================================
          CHẾ ĐỘ 2: SYSTEM SUGGESTIONS (Góp ý hệ thống 1 chiều - gọn nhẹ)
      ===================================================================== */}
      {activeMode === 'SUGGESTION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Form gửi góp ý 1 chiều */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#071A44]">
                💡 Đóng góp Ý kiến Cải thiện Hệ thống
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Gửi đề xuất về giao diện, tính năng hoặc trải nghiệm học tập. Ý kiến được ghi nhận trực tiếp cho đội ngũ phát triển (không yêu cầu phản hồi 1-1).
              </p>
            </div>

            {successBanner && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                ✅ {successBanner}
              </div>
            )}

            <form onSubmit={handleSendSystemSuggestion} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chủ đề góp ý *
                </label>
                <input
                  type="text"
                  required
                  value={suggestionTitle}
                  onChange={(e) => setSuggestionTitle(e.target.value)}
                  placeholder="VD: Đề xuất thêm tốc độ đọc 0.75x cho bài Shadowing..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chi tiết đề xuất của bạn *
                </label>
                <textarea
                  rows={4}
                  required
                  value={suggestionContent}
                  onChange={(e) => setSuggestionContent(e.target.value)}
                  placeholder="Chia sẻ điểm bạn chưa hài lòng hoặc ý tưởng giúp JCAP tốt hơn..."
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingSuggestion}
                className="w-full py-2.5 rounded-xl bg-[#071A44] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                {isSubmittingSuggestion ? '⏳ Đang gửi...' : '🚀 Gửi góp ý cho hệ thống'}
              </button>
            </form>
          </div>

          {/* Lịch sử các góp ý đã gửi */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Các góp ý bạn đã gửi ({suggestionTickets.length})
            </h3>
            {suggestionTickets.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Bạn chưa gửi góp ý cải tiến nào.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
                {suggestionTickets.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold text-teal-700">
                        💡 Đã ghi nhận vào hệ thống
                      </span>
                      <span>{formatRelativeTime(item.createdAt)}</span>
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-slate-800">
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {item.messages[0]?.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal tạo phiếu yêu cầu Hỗ trợ sự cố */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h3 className="text-sm font-bold text-[#071A44]">
                🛠️ Gửi Yêu cầu Hỗ trợ Sự cố
              </h3>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200/70 text-slate-500 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSupportTicket} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Loại sự cố cần Admin hỗ trợ
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as FeedbackCategory)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  {SUPPORT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tiêu đề sự cố *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Đã thanh toán gói Credit qua PayOS nhưng chưa cộng vào ví..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô tả chi tiết *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Mô tả rõ lỗi bạn gặp phải (mã giao dịch, tên bài học bị lỗi...) để Admin xử lý nhanh nhất"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="space-y-2">
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
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  {isUploadingNewAttachment
                    ? '⏳ Đang tải lên Cloudinary...'
                    : '📎 Đính kèm ảnh chụp màn hình / hóa đơn (≤ 5MB)'}
                </button>

                {newAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {newAttachments.map((att) => (
                      <span
                        key={att.cloudinaryUrl}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800"
                      >
                        <span className="truncate max-w-[160px]">{att.fileName}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewAttachments((prev) =>
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
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew || isUploadingNewAttachment}
                  className="px-4 py-2 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  {isSubmittingNew ? 'Đang gửi...' : 'Gửi yêu cầu hỗ trợ'}
                </button>
              </div>
            </form>
          </div>
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
