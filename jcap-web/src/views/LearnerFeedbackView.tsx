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
import { Button, Badge, Icon, EmptyState } from '../components/jcap';
import { parseDateTime } from '../utils/dateUtils';

function formatRelativeTime(iso: string): string {
  const date = parseDateTime(iso);
  if (!date) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin}m trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h trước`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function formatFullDateTime(iso: string): string {
  const date = parseDateTime(iso);
  if (!date) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function getStatusTone(status: FeedbackStatus): 'warning' | 'ai' | 'neutral' {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'IN_PROGRESS':
      return 'ai';
    case 'CLOSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function getCategoryTone(category: FeedbackCategory): 'shu' | 'ai' | 'neutral' {
  switch (category) {
    case 'SCENARIO_BUG':
    case 'SYSTEM_BUG':
      return 'shu';
    case 'AI_ASSESSMENT':
      return 'ai';
    default:
      return 'neutral';
  }
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
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  const newFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMyTickets = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const res = await feedbackService.getMyTickets();
    if (res.success && res.data) {
      setMyTickets(res.data);
      setSelectedTicketId((prev) => {
        const urlParams = new URLSearchParams(window.location.search);
        const qTicketId = urlParams.get('ticketId') ? Number(urlParams.get('ticketId')) : null;
        if (qTicketId && res.data!.some((t) => t.id === qTicketId)) return qTicketId;
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
    // Tự động đồng bộ mỗi 10 giây để cập nhật phản hồi mới từ Admin
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

  // Tải tệp/ảnh thực tế lên Cloudinary
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

  // Gửi bài góp ý ẩn danh mới lên Backend
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
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setErrorMessage(res.message || 'Không thể gửi phản hồi.');
      }
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div data-theme="hoc-tap" className="w-full min-h-screen bg-[var(--paper-100)] text-[var(--sumi)] py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Header thanh thoát kiểu Claude / Linear */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--sumi)]">
              Góp ý & Báo lỗi
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--paper-200)] text-[var(--sumi-muted)]">
              <Icon name="verified_user" size={13} className="text-[var(--shu)]" />
              Ẩn danh #ANON
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              onClick={() => loadMyTickets(false)}
              loading={isLoading}
            >
              Làm mới
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="add"
              onClick={() => setIsNewModalOpen(true)}
            >
              Gửi góp ý mới
            </Button>
          </div>
        </div>

        {errorMessage && (
          <div className="px-3.5 py-2.5 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="error" size={16} />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-[var(--danger)] hover:opacity-75 font-bold cursor-pointer"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}

        {/* Khung 2 cột: Cột trái (Hộp thư gọn gàng) | Cột phải (Chi tiết nội dung rõ ràng) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-140px)] min-h-[600px]">
          {/* CỘT TRÁI (4/12): Danh sách cuộc trao đổi */}
          <div
            className={`lg:col-span-4 bg-[var(--paper-50)] rounded-2xl border border-[var(--line)] shadow-xs flex flex-col overflow-hidden ${
              isMobileDetailOpen ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Header cột trái: Tìm kiếm + Tab lọc inline */}
            <div className="p-3 border-b border-[var(--line)] space-y-2.5 bg-[var(--paper-100)]/40">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tiêu đề, mã #ANON..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--line)] bg-[var(--paper-50)] text-[var(--sumi)] placeholder:text-[var(--sumi-faint)] focus:outline-none focus:border-[var(--ai)] transition"
                />
                <span className="absolute left-2.5 top-2 text-[var(--sumi-faint)]">
                  <Icon name="search" size={14} />
                </span>
              </div>

              {/* Bộ lọc Tab 4 trạng thái dạng Segmented Grid tinh gọn, không cuộn */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-[var(--paper-200)]/60 rounded-xl text-center">
                {[
                  { id: 'ALL', label: 'Tất cả', count: counts.ALL },
                  { id: 'PENDING', label: 'Chờ duyệt', count: counts.PENDING },
                  { id: 'IN_PROGRESS', label: 'Đang chat', count: counts.IN_PROGRESS },
                  { id: 'CLOSED', label: 'Đã đóng', count: counts.CLOSED },
                ].map((tab) => {
                  const isActive = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id as 'ALL' | FeedbackStatus)}
                      className={`py-1 px-1 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1 ${
                        isActive
                          ? 'bg-[var(--paper-50)] text-[var(--sumi)] shadow-xs font-bold'
                          : 'text-[var(--sumi-muted)] hover:text-[var(--sumi)]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`px-1 py-0.2 rounded-md text-[10px] font-mono ${
                          isActive
                            ? 'bg-[var(--sumi)] text-white'
                            : 'bg-[var(--paper-200)] text-[var(--sumi-muted)]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Danh sách các bài góp ý */}
            <div className="divide-y divide-[var(--line)] overflow-y-auto flex-1">
              {isLoading ? (
                <div className="p-12 text-center text-xs text-[var(--sumi-muted)]">
                  <div className="inline-block animate-spin mb-2">
                    <Icon name="progress_activity" size={22} className="text-[var(--ai)]" />
                  </div>
                  <div>Đang tải góp ý...</div>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon="inbox"
                    title="Chưa có bài góp ý nào"
                  >
                    Bấm nút "Gửi góp ý mới" ở trên để gửi báo lỗi hoặc đề xuất.
                  </EmptyState>
                </div>
              ) : (
                filteredTickets.map((ticket) => {
                  const isSelected = ticket.id === selectedTicket?.id;
                  const catMeta = CATEGORY_META[ticket.category] || CATEGORY_META.SUGGESTION;
                  const isPending = ticket.status === 'PENDING';
                  const isInProgress = ticket.status === 'IN_PROGRESS';
                  const dotColor = isPending
                    ? 'bg-amber-500'
                    : isInProgress
                    ? 'bg-[var(--ai)]'
                    : 'bg-slate-400';

                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => {
                        setSelectedTicketId(ticket.id);
                        setIsMobileDetailOpen(true);
                      }}
                      className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 cursor-pointer relative ${
                        isSelected
                          ? 'bg-[var(--paper-200)]/60 border-l-[3px] border-l-[var(--ai)]'
                          : 'hover:bg-[var(--paper-100)]/70'
                      }`}
                    >
                      {/* Dòng 1: Chấm trạng thái + Phân loại + Thời gian */}
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                          <span className="font-semibold text-[var(--sumi)] truncate">
                            {catMeta.label}
                          </span>
                        </div>
                        <span className="text-[var(--sumi-faint)] shrink-0 ml-2 font-mono text-[10px]">
                          {formatRelativeTime(ticket.updatedAt)}
                        </span>
                      </div>

                      {/* Dòng 2: Tiêu đề rõ ràng */}
                      <div
                        className={`text-xs sm:text-[13px] leading-snug line-clamp-2 ${
                          isSelected
                            ? 'font-bold text-[var(--sumi)]'
                            : 'font-medium text-[var(--sumi)]'
                        }`}
                      >
                        {ticket.title}
                      </div>

                      {/* Dòng 3: Mã ẩn danh + Số tin + Chỉ báo */}
                      <div className="flex items-center justify-between text-[11px] text-[var(--sumi-faint)] pt-0.5">
                        <span className="font-mono text-[10px] text-[var(--sumi-muted)] bg-[var(--paper-200)] px-1.5 py-0.5 rounded">
                          {ticket.anonymousCode}
                        </span>

                        <div className="flex items-center gap-2">
                          {isPending && ticket.adminSeenAt && (
                            <span className="text-[var(--ai)] flex items-center gap-0.5 text-[10px] font-medium">
                              <Icon name="visibility" size={13} />
                              Đã xem
                            </span>
                          )}
                          <span className="flex items-center gap-0.5 text-[11px] text-[var(--sumi-muted)]">
                            <Icon name="chat_bubble" size={12} />
                            {ticket.messages.length}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* CỘT PHẢI (8/12): Chi tiết nội dung - Trọng tâm trải nghiệm người dùng */}
          <div
            className={`lg:col-span-8 bg-[var(--paper-50)] rounded-2xl border border-[var(--line)] shadow-xs flex flex-col overflow-hidden ${
              isMobileDetailOpen ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {!selectedTicket ? (
              <div className="m-auto p-12 text-center max-w-sm">
                <EmptyState
                  icon="forum"
                  title="Chọn một bài góp ý để xem nội dung"
                >
                  Nhấn vào bài góp ý từ danh sách bên trái để đọc toàn bộ phản hồi từ Ban Quản trị.
                </EmptyState>
              </div>
            ) : (
              <>
                {/* Header bài góp ý thanh lịch */}
                <div className="px-5 py-4 border-b border-[var(--line)] bg-[var(--paper-50)] space-y-3 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsMobileDetailOpen(false)}
                        className="lg:hidden p-1 -ml-1 text-[var(--sumi-muted)] hover:text-[var(--sumi)] cursor-pointer"
                        title="Quay lại danh sách"
                      >
                        <Icon name="arrow_back" size={18} />
                      </button>
                      <Badge tone={getStatusTone(selectedTicket.status)}>
                        {(STATUS_META[selectedTicket.status] || STATUS_META.PENDING).label}
                      </Badge>
                      <Badge tone={getCategoryTone(selectedTicket.category)}>
                        {(CATEGORY_META[selectedTicket.category] || CATEGORY_META.SUGGESTION).label}
                      </Badge>
                      <span className="text-xs font-mono text-[var(--sumi-muted)] bg-[var(--paper-200)] px-2 py-0.5 rounded-md font-semibold">
                        {selectedTicket.anonymousCode}
                      </span>
                    </div>

                    <span className="text-[11px] text-[var(--sumi-faint)] font-mono">
                      Gửi lúc {formatFullDateTime(selectedTicket.createdAt)}
                    </span>
                  </div>

                  {/* Tiêu đề bài viết lớn, rõ ràng */}
                  <h2 className="text-base sm:text-lg font-bold text-[var(--sumi)] leading-snug tracking-tight">
                    {selectedTicket.title}
                  </h2>

                  {/* Tiến trình 3 bước siêu gọn */}
                  <div className="flex items-center justify-between gap-1 text-[11px] py-1 border-t border-[var(--line)]/60 pt-2">
                    <div className="flex items-center gap-1.5 font-medium text-[var(--success)]">
                      <Icon name="check_circle" size={14} />
                      <span>1. Đã gửi ẩn danh</span>
                      {selectedTicket.adminSeenAt && (
                        <span className="text-[10px] text-[var(--ai)] font-mono">
                          (Admin đã xem)
                        </span>
                      )}
                    </div>
                    <span className="text-[var(--line)]">→</span>
                    <div
                      className={`flex items-center gap-1.5 font-medium ${
                        selectedTicket.status === 'IN_PROGRESS' || selectedTicket.status === 'CLOSED'
                          ? 'text-[var(--ai)]'
                          : 'text-[var(--sumi-faint)]'
                      }`}
                    >
                      <Icon
                        name={selectedTicket.status === 'IN_PROGRESS' ? 'forum' : 'radio_button_unchecked'}
                        size={14}
                      />
                      <span>2. Đang trao đổi</span>
                    </div>
                    <span className="text-[var(--line)]">→</span>
                    <div
                      className={`flex items-center gap-1.5 font-medium ${
                        selectedTicket.status === 'CLOSED'
                          ? 'text-[var(--sumi)]'
                          : 'text-[var(--sumi-faint)]'
                      }`}
                    >
                      <Icon
                        name={selectedTicket.status === 'CLOSED' ? 'task_alt' : 'radio_button_unchecked'}
                        size={14}
                      />
                      <span>3. Đã giải quyết</span>
                    </div>
                  </div>
                </div>

                {/* Luồng tin nhắn rộng rãi, dễ đọc tuyệt đối (Claude style) */}
                <div className="flex-1 p-5 sm:p-6 space-y-6 overflow-y-auto bg-[var(--paper-100)]/30">
                  {selectedTicket.messages.map((msg) => {
                    const isAdmin = msg.senderRole === 'ADMIN';

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 sm:gap-4 max-w-3xl ${
                          isAdmin ? 'mr-auto' : 'mr-auto'
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                            isAdmin
                              ? 'bg-[var(--ai)] text-white shadow-xs'
                              : 'bg-[var(--paper-200)] text-[var(--sumi)] border border-[var(--line)]'
                          }`}
                        >
                          <Icon name={isAdmin ? 'support_agent' : 'person'} size={18} />
                        </div>

                        {/* Thân tin nhắn */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          {/* Tên người gửi + nhãn */}
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-[var(--sumi)]">
                              {isAdmin ? 'Ban Quản Trị JCAP' : 'Bạn (Ẩn danh)'}
                            </span>
                            {isAdmin ? (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[var(--ai-soft)] text-[var(--ai)]">
                                Phản hồi chính thức
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-[var(--sumi-muted)]">
                                {selectedTicket.anonymousCode}
                              </span>
                            )}
                            <span className="text-[10px] text-[var(--sumi-faint)] font-mono ml-auto">
                              {formatFullDateTime(msg.createdAt)}
                            </span>
                          </div>

                          {/* Nội dung tin nhắn: font rõ ràng, khoảng cách thoáng đãng */}
                          <div
                            className={`p-4 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
                              isAdmin
                                ? 'bg-[var(--paper-50)] border border-[var(--ai)]/30 text-[var(--sumi)] shadow-xs'
                                : 'bg-[var(--paper-50)] border border-[var(--line)] text-[var(--sumi)]'
                            }`}
                          >
                            {msg.content}

                            {/* Tệp & Ảnh đính kèm */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-[var(--line)]/70 space-y-2">
                                <div className="text-[11px] font-semibold text-[var(--sumi-muted)] flex items-center gap-1">
                                  <Icon name="attachment" size={14} />
                                  <span>Tệp đính kèm ({msg.attachments.length}):</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {msg.attachments.map((att) =>
                                    att.fileType === 'IMAGE' ? (
                                      <div
                                        key={att.id}
                                        onClick={() => setPreviewImage(att)}
                                        className="group relative rounded-xl border border-[var(--line)] overflow-hidden cursor-pointer hover:border-[var(--ai)] transition bg-[var(--paper-100)]"
                                      >
                                        <img
                                          src={att.cloudinaryUrl}
                                          alt={att.fileName}
                                          className="w-full h-36 object-cover group-hover:scale-102 transition duration-200"
                                        />
                                        <div className="p-2 bg-[var(--paper-50)] flex items-center justify-between text-[11px]">
                                          <span className="truncate font-medium text-[var(--sumi)] flex items-center gap-1">
                                            <Icon name="image" size={13} className="text-[var(--ai)]" />
                                            {att.fileName}
                                          </span>
                                          <span className="text-[var(--sumi-faint)] font-mono text-[10px] ml-2 shrink-0">
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
                                        className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--line)] bg-[var(--paper-50)] hover:bg-[var(--paper-100)] transition"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="w-7 h-7 rounded-lg bg-[var(--ai-soft)] text-[var(--ai)] flex items-center justify-center shrink-0">
                                            <Icon name="description" size={16} />
                                          </span>
                                          <div className="min-w-0">
                                            <div className="text-xs font-semibold text-[var(--sumi)] truncate">
                                              {att.fileName}
                                            </div>
                                            <div className="text-[10px] text-[var(--sumi-faint)] font-mono">
                                              {formatFileSize(att.fileSize)}
                                            </div>
                                          </div>
                                        </div>
                                        <span className="text-xs text-[var(--ai)] font-medium shrink-0 ml-2">
                                          Mở ↗
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
                  <div ref={messagesEndRef} />
                </div>

                {/* Khung nhập phản hồi kiểu Claude tinh tế */}
                <div className="p-4 border-t border-[var(--line)] bg-[var(--paper-50)] shrink-0">
                  {selectedTicket.status === 'CLOSED' ? (
                    <div className="p-3.5 rounded-xl bg-[var(--paper-100)] border border-[var(--line)] text-center">
                      <div className="text-xs font-bold text-[var(--sumi)] flex items-center justify-center gap-1.5">
                        <Icon name="check_circle" size={16} className="text-[var(--success)]" />
                        Góp ý này đã được giải quyết và đóng
                      </div>
                      <p className="text-[11px] text-[var(--sumi-muted)] mt-0.5">
                        Cảm ơn bạn đã đóng góp ý kiến. Bạn có thể bấm "Gửi góp ý mới" ở trên nếu cần hỗ trợ thêm.
                      </p>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSendReply}
                      className="border border-[var(--line)] rounded-2xl bg-[var(--paper-50)] shadow-xs focus-within:border-[var(--ai)] focus-within:ring-2 focus-within:ring-[var(--ai)]/15 transition p-3 space-y-2"
                    >
                      <textarea
                        rows={2}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Nhập phản hồi hoặc bổ sung chi tiết cho Quản trị viên..."
                        className="w-full bg-transparent text-xs sm:text-sm text-[var(--sumi)] placeholder:text-[var(--sumi-faint)] focus:outline-none resize-none leading-relaxed"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handleSendReply(e);
                          }
                        }}
                      />

                      {replyAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {replyAttachments.map((att) => (
                            <div
                              key={att.cloudinaryUrl}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--paper-200)] text-xs text-[var(--sumi)]"
                            >
                              <Icon name={att.fileType === 'IMAGE' ? 'image' : 'attach_file'} size={13} />
                              <span className="font-medium max-w-[140px] truncate">{att.fileName}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setReplyAttachments((prev) =>
                                    prev.filter((x) => x.cloudinaryUrl !== att.cloudinaryUrl)
                                  )
                                }
                                className="text-[var(--sumi-muted)] hover:text-[var(--danger)] cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-[var(--line)]/50">
                        <div className="flex items-center gap-2">
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
                            className="inline-flex items-center gap-1 text-xs text-[var(--sumi-muted)] hover:text-[var(--ai)] font-medium cursor-pointer transition"
                          >
                            <Icon name="attach_file" size={16} />
                            <span>{isUploadingReplyAttachment ? 'Đang tải...' : 'Đính kèm tệp/ảnh'}</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="hidden sm:inline text-[10px] text-[var(--sumi-faint)]">
                            Ctrl + Enter để gửi
                          </span>
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            icon="send"
                            loading={isSubmittingReply}
                            disabled={
                              isSubmittingReply ||
                              isUploadingReplyAttachment ||
                              (!replyContent.trim() && replyAttachments.length === 0)
                            }
                          >
                            Gửi
                          </Button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal gửi góp ý mới thanh lịch */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--sumi)]/50 backdrop-blur-xs p-4">
          <div className="bg-[var(--paper-50)] rounded-2xl border border-[var(--line)] shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-3.5 border-b border-[var(--line)] flex items-center justify-between bg-[var(--paper-100)]/60">
              <div className="flex items-center gap-2">
                <Icon name="edit_square" size={18} className="text-[var(--shu)]" />
                <h3 className="text-sm font-bold text-[var(--sumi)]">
                  Gửi Góp ý & Báo lỗi Ẩn danh
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-[var(--paper-200)] text-[var(--sumi-muted)] flex items-center justify-center cursor-pointer transition"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--sumi)] mb-1">
                  Chủ đề phản ánh
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as FeedbackCategory)}
                  className="w-full px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-[var(--line)] bg-[var(--paper-50)] text-[var(--sumi)] focus:outline-none focus:border-[var(--ai)] transition cursor-pointer"
                >
                  {(Object.keys(CATEGORY_META) as FeedbackCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_META[cat].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--sumi)] mb-1">
                  Tiêu đề tóm tắt *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Nhận diện giọng nói ở kịch bản Nhà hàng..."
                  className="w-full px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-[var(--line)] bg-[var(--paper-50)] text-[var(--sumi)] focus:outline-none focus:border-[var(--ai)] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--sumi)] mb-1">
                  Nội dung chi tiết *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Mô tả chi tiết nội dung hoặc vấn đề bạn gặp phải..."
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-[var(--line)] bg-[var(--paper-50)] text-[var(--sumi)] focus:outline-none focus:border-[var(--ai)] resize-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--sumi)]">
                    Đính kèm tệp / ảnh
                  </span>
                  <span className="text-[11px] text-[var(--sumi-faint)]">Tối đa 5MB</span>
                </div>

                <div className="flex items-center gap-2">
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon="attach_file"
                    disabled={isUploadingNewAttachment}
                    onClick={() => newFileInputRef.current?.click()}
                  >
                    {isUploadingNewAttachment ? 'Đang tải lên...' : 'Chọn tệp đính kèm'}
                  </Button>
                </div>

                {newAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {newAttachments.map((att) => (
                      <div
                        key={att.cloudinaryUrl}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--paper-200)] text-xs text-[var(--sumi)]"
                      >
                        <Icon name={att.fileType === 'IMAGE' ? 'image' : 'attach_file'} size={13} />
                        <span className="font-medium max-w-[140px] truncate">{att.fileName}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewAttachments((prev) =>
                              prev.filter((x) => x.cloudinaryUrl !== att.cloudinaryUrl)
                            )
                          }
                          className="text-[var(--sumi-muted)] hover:text-[var(--danger)] cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[var(--line)] flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsNewModalOpen(false)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon="send"
                  loading={isSubmittingNew}
                  disabled={isSubmittingNew || isUploadingNewAttachment}
                >
                  Gửi góp ý
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox xem ảnh */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--sumi)]/80 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--paper-50)] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-[var(--line)]"
          >
            <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between">
              <div className="min-w-0 text-xs font-bold text-[var(--sumi)] truncate flex items-center gap-1.5">
                <Icon name="image" size={15} className="text-[var(--ai)]" />
                {previewImage.fileName} ({formatFileSize(previewImage.fileSize)})
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-6 h-6 rounded-lg hover:bg-[var(--paper-200)] text-[var(--sumi-muted)] flex items-center justify-center cursor-pointer"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
            <div className="p-4 bg-[var(--sumi)] flex items-center justify-center">
              <img
                src={previewImage.cloudinaryUrl}
                alt={previewImage.fileName}
                className="max-h-[460px] w-auto rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
