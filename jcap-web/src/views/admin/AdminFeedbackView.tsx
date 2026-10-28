import React, { useState, useMemo, useRef } from 'react';
import {
  getAllMockFeedbackTickets,
  saveMockFeedbackTickets,
  resetMockFeedbackTickets,
  createSampleAttachment,
  formatFileSize,
  CATEGORY_META,
  STATUS_META,
  type FeedbackTicket,
  type FeedbackCategory,
  type FeedbackStatus,
  type FeedbackAttachment,
} from '../../services/mockFeedbackStore';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // Giới hạn 5MB

export const AdminFeedbackView: React.FC = () => {
  const [tickets, setTickets] = useState<FeedbackTicket[]>(() => getAllMockFeedbackTickets());
  const [selectedTicketId, setSelectedTicketId] = useState<string>(() => {
    const initial = getAllMockFeedbackTickets();
    return initial[0]?.id || '';
  });

  // Bộ lọc 3 trạng thái: Chờ Admin phản hồi (PENDING) | Đang trò chuyện (IN_PROGRESS) | Đã đóng (CLOSED)
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeedbackStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | FeedbackCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // State phản hồi của Admin
  const [replyContent, setReplyContent] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingReply, setIsUploadingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Lightbox xem ảnh đính kèm
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    name: string;
    publicId: string;
  } | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const syncTickets = (updated: FeedbackTicket[]) => {
    setTickets(updated);
    saveMockFeedbackTickets(updated);
  };

  // Thống kê tổng quan cho Admin
  const stats = useMemo(() => {
    const total = tickets.length;
    const pendingCount = tickets.filter((t) => t.status === 'PENDING').length;
    const inProgressCount = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const closedCount = tickets.filter((t) => t.status === 'CLOSED').length;
    return { total, pendingCount, inProgressCount, closedCount };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchCode = t.anonymousCode.toLowerCase().includes(q);
        const matchMsg = t.messages.some((m) => m.content.toLowerCase().includes(q));
        if (!matchTitle && !matchCode && !matchMsg) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, searchQuery]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || filteredTickets[0] || null,
    [tickets, selectedTicketId, filteredTickets]
  );

  // Khi Admin bấm chọn xem một bài đang PENDING mà chưa có adminSeenAt, đánh dấu là Admin đã mở xem
  const handleSelectTicket = (ticket: FeedbackTicket) => {
    setSelectedTicketId(ticket.id);
    setReplyError(null);
    if (!ticket.adminSeenAt) {
      const nowIso = new Date().toISOString();
      const updated = tickets.map((t) =>
        t.id === ticket.id ? { ...t, adminSeenAt: nowIso } : t
      );
      syncTickets(updated);
    }
  };

  // Upload tệp/ảnh đính kèm khi Admin trả lời
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setReplyError(null);

    if (replyAttachments.length + files.length > 3) {
      setReplyError('Tối đa 3 tệp/ảnh đính kèm trong một lần gửi.');
      return;
    }

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setReplyError(`Tệp "${f.name}" vượt quá giới hạn dung lượng nhỏ (Tối đa 5MB).`);
        return;
      }
      validFiles.push(f);
    }

    setIsUploadingReply(true);

    Promise.all(
      validFiles.map(
        (file) =>
          new Promise<FeedbackAttachment>((resolve) => {
            const isImage = file.type.startsWith('image/');
            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const randSuffix = Math.floor(1000 + Math.random() * 9000);
            const publicId = `issues/admin_${cleanName.replace(/\.[^.]+$/, '')}_${randSuffix}`;

            if (isImage) {
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: 'IMAGE',
                  mimeType: file.type || 'image/png',
                  cloudinaryUrl: typeof reader.result === 'string' ? reader.result : '',
                  cloudinaryPublicId: publicId,
                });
              };
              reader.readAsDataURL(file);
            } else {
              resolve({
                id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                fileName: file.name,
                fileSize: file.size,
                fileType: 'FILE',
                mimeType: file.type || 'application/octet-stream',
                cloudinaryUrl: `https://res.cloudinary.com/jcap-cloud/raw/upload/v1/${publicId}`,
                cloudinaryPublicId: publicId,
              });
            }
          })
      )
    ).then((uploaded) => {
      setTimeout(() => {
        setReplyAttachments((prev) => [...prev, ...uploaded]);
        setIsUploadingReply(false);
        showToast(`Đã tải ${uploaded.length} tệp lên Cloudinary (folder: issues/)`);
      }, 400);
    });
  };

  const handleAddSampleAttachment = (type: 'IMAGE' | 'FILE') => {
    if (replyAttachments.length >= 3) {
      setReplyError('Tối đa 3 tệp/ảnh đính kèm trong một lần gửi.');
      return;
    }
    setReplyError(null);
    const sample = createSampleAttachment(type);
    setReplyAttachments((prev) => [...prev, sample]);
    showToast(`Đã đính kèm ${type === 'IMAGE' ? 'ảnh mẫu' : 'tệp PDF mẫu'} lên Cloudinary`);
  };

  // Admin gửi phản hồi -> Tự động chuyển trạng thái từ PENDING sang IN_PROGRESS ("Đang trò chuyện")
  const handleSendAdminReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (selectedTicket.status === 'CLOSED') {
      setReplyError('Bài góp ý đã đóng. Hãy mở lại bài nếu muốn gửi thêm phản hồi.');
      return;
    }
    if (!replyContent.trim() && replyAttachments.length === 0) {
      setReplyError('Vui lòng nhập nội dung phản hồi hoặc đính kèm tệp/ảnh.');
      return;
    }

    const nowIso = new Date().toISOString();
    const newMsg = {
      id: `msg-${Date.now()}`,
      ticketId: selectedTicket.id,
      senderRole: 'ADMIN' as const,
      content: replyContent.trim(),
      attachments: replyAttachments,
      createdAt: nowIso,
    };

    const updated = tickets.map((t) =>
      t.id === selectedTicket.id
        ? {
            ...t,
            status: 'IN_PROGRESS' as const, // Chuyển sang trạng thái "Đang trò chuyện"
            adminSeenAt: t.adminSeenAt || nowIso,
            updatedAt: nowIso,
            messages: [...t.messages, newMsg],
          }
        : t
    );

    syncTickets(updated);
    setReplyContent('');
    setReplyAttachments([]);
    setReplyError(null);
    showToast(
      `Đã gửi phản hồi cho ${selectedTicket.anonymousCode} — Trạng thái: Đang trò chuyện`
    );
  };

  // Chỉ Admin mới có quyền đóng bài
  const handleCloseTicket = (ticketId: string) => {
    const nowIso = new Date().toISOString();
    const updated = tickets.map((t) =>
      t.id === ticketId
        ? {
            ...t,
            status: 'CLOSED' as const,
            adminSeenAt: t.adminSeenAt || nowIso,
            closedAt: nowIso,
            updatedAt: nowIso,
          }
        : t
    );
    syncTickets(updated);
    showToast('Đã đóng bài góp ý thành công.');
  };

  const handleReopenTicket = (ticketId: string) => {
    const nowIso = new Date().toISOString();
    const updated = tickets.map((t) =>
      t.id === ticketId
        ? {
            ...t,
            status: 'IN_PROGRESS' as const,
            closedAt: undefined,
            updatedAt: nowIso,
          }
        : t
    );
    syncTickets(updated);
    showToast('Đã mở lại bài góp ý sang trạng thái Đang trò chuyện.');
  };

  const handleResetDemo = () => {
    const fresh = resetMockFeedbackTickets();
    setTickets(fresh);
    setSelectedTicketId(fresh[0]?.id || '');
    showToast('Đã khôi phục bộ dữ liệu mẫu ban đầu.');
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto space-y-6 pb-10">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#071A44] text-white px-5 py-3.5 rounded-xl shadow-xl border border-blue-400/30 flex items-center gap-3 animate-fade-in">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* HEADER QUẢN TRỊ HÒM THƯ GÓP Ý ẨN DANH                                 */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-[#E6EDF5] p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-extrabold text-[#071A44]">
                Quản lý Hòm thư Góp ý Ẩn danh
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                🛡️ Bảo vệ Danh tính Học viên
              </span>
            </div>

            <p className="text-sm text-slate-600 mt-1.5 max-w-3xl leading-relaxed">
              Tiếp nhận và giải đáp phản ánh từ tất cả học viên trong hệ thống. Danh tính người gửi được ẩn hoàn toàn dưới mã{' '}
              <code className="text-indigo-600 font-semibold">#ANON-xxxx</code>. Khi Admin gửi phản hồi, trạng thái bài sẽ tự động chuyển từ{' '}
              <strong>Chờ Admin phản hồi</strong> sang <strong>Đang trò chuyện</strong>. Chỉ Admin có quyền đóng bài.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetDemo}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition cursor-pointer shrink-0 self-start md:self-auto"
          >
            Khôi phục dữ liệu mẫu
          </button>
        </div>

        {/* Thống kê 3 trạng thái */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
            <div className="text-xs font-medium text-slate-500">Tổng số thư góp ý</div>
            <div className="text-xl font-extrabold text-[#071A44] mt-0.5">{stats.total} bài</div>
          </div>
          <div className="bg-amber-50/70 rounded-xl p-3.5 border border-amber-200">
            <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Chờ Admin phản hồi
            </div>
            <div className="text-xl font-extrabold text-amber-800 mt-0.5">{stats.pendingCount}</div>
          </div>
          <div className="bg-blue-50/70 rounded-xl p-3.5 border border-blue-200">
            <div className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              Đang trò chuyện
            </div>
            <div className="text-xl font-extrabold text-blue-700 mt-0.5">
              {stats.inProgressCount}
            </div>
          </div>
          <div className="bg-slate-100/80 rounded-xl p-3.5 border border-slate-200">
            <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              Đã đóng (Closed)
            </div>
            <div className="text-xl font-extrabold text-slate-700 mt-0.5">{stats.closedCount}</div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BỐ CỤC 2 CỘT: DANH SÁCH THƯ ẨN DANH (TRÁI) & XỬ LÝ LUỒNG (PHẢI)        */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI: DANH SÁCH TOÀN BỘ THƯ GÓP Ý (5/12) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E6EDF5] shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
            <div className="relative">
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo mã #ANON, tiêu đề hoặc nội dung..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#0878EE]"
              />
            </div>

            {/* Bộ lọc 3 trạng thái */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-[#071A44] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PENDING')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === 'PENDING'
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Chờ phản hồi ({stats.pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('IN_PROGRESS')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === 'IN_PROGRESS'
                    ? 'bg-[#0878EE] text-white'
                    : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Đang trò chuyện ({stats.inProgressCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CLOSED')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === 'CLOSED'
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Đã đóng ({stats.closedCount})
              </button>
            </div>

            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | FeedbackCategory)}
                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-[#0878EE]"
              >
                <option value="ALL">Tất cả danh mục chủ đề</option>
                {(Object.keys(CATEGORY_META) as FeedbackCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredTickets.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm font-semibold text-slate-700">
                  Không có bài góp ý nào khớp bộ lọc
                </p>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                const catMeta = CATEGORY_META[ticket.category];
                const stMeta = STATUS_META[ticket.status];
                const lastMessage = ticket.messages[ticket.messages.length - 1];

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => handleSelectTicket(ticket)}
                    className={`w-full text-left p-4 transition cursor-pointer block ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-l-[#0878EE]'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${stMeta.badgeBg} ${stMeta.badgeText} ${stMeta.badgeBorder}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dotColor}`} />
                        {stMeta.label}
                      </span>

                      <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        🕵️ {ticket.anonymousCode}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-[#071A44] line-clamp-2 leading-snug mt-1">
                      {ticket.title}
                    </h3>

                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${catMeta.badgeBg} ${catMeta.badgeText} ${catMeta.badgeBorder}`}
                      >
                        {catMeta.icon} {catMeta.label}
                      </span>
                    </div>

                    {lastMessage && (
                      <p className="text-xs text-slate-500 line-clamp-1 mt-2">
                        <span className="font-semibold text-slate-700">
                          {lastMessage.senderRole === 'ADMIN'
                            ? '🛡️ Admin: '
                            : `🕵️ ${ticket.anonymousCode}: `}
                        </span>
                        {lastMessage.content}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-100">
                      <span>Cập nhật: {formatDateTime(ticket.updatedAt)}</span>
                      <span className="font-semibold text-slate-600">
                        💬 {ticket.messages.length} tin nhắn
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* CỘT PHẢI: CHI TIẾT XỬ LÝ & ĐÓNG BÀI CỦA ADMIN (7/12) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E6EDF5] shadow-xs overflow-hidden flex flex-col">
          {!selectedTicket ? (
            <div className="p-16 text-center text-slate-500">
              Chọn một thư góp ý ở bên trái để xem nội dung và phản hồi cho học viên.
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-slate-200 bg-slate-50/60">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                          STATUS_META[selectedTicket.status].badgeBg
                        } ${STATUS_META[selectedTicket.status].badgeText} ${
                          STATUS_META[selectedTicket.status].badgeBorder
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            STATUS_META[selectedTicket.status].dotColor
                          }`}
                        />
                        {STATUS_META[selectedTicket.status].label}
                      </span>

                      <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                        Người gửi: Học viên Ẩn danh ({selectedTicket.anonymousCode})
                      </span>

                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                          CATEGORY_META[selectedTicket.category].badgeBg
                        } ${CATEGORY_META[selectedTicket.category].badgeText} ${
                          CATEGORY_META[selectedTicket.category].badgeBorder
                        }`}
                      >
                        {CATEGORY_META[selectedTicket.category].icon}{' '}
                        {CATEGORY_META[selectedTicket.category].label}
                      </span>
                    </div>

                    <h2 className="text-lg font-extrabold text-[#071A44] leading-snug">
                      {selectedTicket.title}
                    </h2>

                    <div className="text-xs text-slate-500">
                      🕵️ Danh tính học viên (Tên, Email, User ID) được ẩn tuyệt đối khỏi Admin • Ngày gửi:{' '}
                      {formatDateTime(selectedTicket.createdAt)}
                    </div>
                  </div>

                  {/* Nút Đóng bài / Mở lại bài của Admin */}
                  <div className="shrink-0">
                    {selectedTicket.status !== 'CLOSED' ? (
                      <button
                        type="button"
                        onClick={() => handleCloseTicket(selectedTicket.id)}
                        className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>Đóng bài góp ý</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReopenTicket(selectedTicket.id)}
                        className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <span>🔓 Mở lại bài</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Luồng tin nhắn */}
              <div className="p-6 space-y-0 flex-1 max-h-[540px] overflow-y-auto bg-[#FAFCFF]">
                {selectedTicket.messages.map((msg, idx) => {
                  const isAdmin = msg.senderRole === 'ADMIN';
                  const isFirst = idx === 0;

                  return (
                    <div key={msg.id} className="relative pl-8 pb-6 last:pb-2">
                      {idx < selectedTicket.messages.length - 1 ||
                      selectedTicket.status === 'CLOSED' ? (
                        <div className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-slate-200" />
                      ) : null}

                      <div
                        className={`absolute left-0 top-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-2xs border-2 border-white ${
                          isAdmin ? 'bg-[#0878EE] text-white' : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {isAdmin ? '🛡️' : '🕵️'}
                      </div>

                      <div
                        className={`rounded-2xl border overflow-hidden shadow-2xs ${
                          isAdmin
                            ? 'bg-blue-50/40 border-blue-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div
                          className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs ${
                            isAdmin
                              ? 'bg-blue-100/50 border-blue-200 text-blue-950'
                              : 'bg-slate-50 border-slate-200/80 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold">
                              {isAdmin
                                ? 'Ban Quản Trị JCAP (Admin)'
                                : `Học viên Ẩn danh (${selectedTicket.anonymousCode})`}
                            </span>
                            {isFirst && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                Bài góp ý gốc
                              </span>
                            )}
                          </div>
                          <span className="text-slate-500">{formatDateTime(msg.createdAt)}</span>
                        </div>

                        <div className="p-4 text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                          {msg.content}
                        </div>

                        {msg.attachments.length > 0 && (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-100/80 bg-slate-50/40">
                            <div className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                              <span>☁️ Tệp & Ảnh đính kèm (Cloudinary)</span>
                              <span className="text-slate-400">({msg.attachments.length})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {msg.attachments.map((att) =>
                                att.fileType === 'IMAGE' ? (
                                  <div
                                    key={att.id}
                                    onClick={() =>
                                      setPreviewImage({
                                        url: att.cloudinaryUrl,
                                        name: att.fileName,
                                        publicId: att.cloudinaryPublicId,
                                      })
                                    }
                                    className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 cursor-pointer hover:border-[#0878EE] transition"
                                  >
                                    <img
                                      src={att.cloudinaryUrl}
                                      alt={att.fileName}
                                      className="w-full h-36 object-cover group-hover:opacity-90 transition"
                                    />
                                    <div className="p-2 bg-white flex items-center justify-between text-xs">
                                      <span className="font-semibold text-slate-700 truncate max-w-[160px]">
                                        🖼️ {att.fileName}
                                      </span>
                                      <span className="text-[11px] text-slate-400 shrink-0">
                                        {formatFileSize(att.fileSize)}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    key={att.id}
                                    className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 hover:border-blue-300 transition"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0878EE] flex items-center justify-center font-bold text-sm shrink-0">
                                        📄
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold text-slate-800 truncate">
                                          {att.fileName}
                                        </div>
                                        <div className="text-[11px] text-slate-400 truncate">
                                          {formatFileSize(att.fileSize)} • {att.cloudinaryPublicId}
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        showToast(
                                          `Đang tải tệp từ Cloudinary: ${att.cloudinaryPublicId}`
                                        )
                                      }
                                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-xs font-semibold text-[#0878EE] shrink-0 cursor-pointer"
                                    >
                                      Tải về
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {selectedTicket.status === 'CLOSED' && (
                  <div className="relative pl-8 pt-1">
                    <div className="absolute left-0 top-1.5 w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs shadow-2xs border-2 border-white">
                      🔒
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700">
                      <strong>Admin</strong> đã đóng bài góp ý này
                      {selectedTicket.closedAt
                        ? ` vào lúc ${formatDateTime(selectedTicket.closedAt)}`
                        : ''}
                      .
                    </div>
                  </div>
                )}
              </div>

              {/* Khung Admin trả lời */}
              <div className="p-5 border-t border-slate-200 bg-white">
                {selectedTicket.status === 'CLOSED' ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                    <div className="text-sm font-bold text-slate-700">
                      🔒 Bài góp ý này đã đóng
                    </div>
                    <p className="text-xs text-slate-500">
                      Nếu cần trao đổi thêm với học viên {selectedTicket.anonymousCode}, hãy bấm nút "Mở lại bài" ở góc trên.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendAdminReply} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-700">
                        🛡️ Phản hồi của Admin gửi tới Học viên Ẩn danh ({selectedTicket.anonymousCode})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setReplyContent(
                            `Chào bạn (${selectedTicket.anonymousCode}), Ban Quản Trị đã kiểm tra thông tin bạn gửi và hoàn tất xử lý trên hệ thống. Bạn vui lòng tải lại trang để kiểm tra kết quả nhé!`
                          )
                        }
                        className="text-[11px] font-bold text-[#0878EE] hover:underline cursor-pointer"
                      >
                        ✨ Điền nhanh câu trả lời mẫu
                      </button>
                    </div>

                    {replyError && (
                      <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                        {replyError}
                      </div>
                    )}

                    <textarea
                      rows={3}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Nhập nội dung phản hồi hoặc hướng dẫn giải quyết cho học viên..."
                      className="w-full p-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0878EE] resize-none"
                    />

                    {replyAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {replyAttachments.map((att) => (
                          <div
                            key={att.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900"
                          >
                            <span>{att.fileType === 'IMAGE' ? '🖼️' : '📄'}</span>
                            <span className="font-semibold truncate max-w-[160px]">
                              {att.fileName}
                            </span>
                            <span className="text-[10px] text-blue-600">
                              ({formatFileSize(att.fileSize)})
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setReplyAttachments((prev) =>
                                  prev.filter((x) => x.id !== att.id)
                                )
                              }
                              className="text-rose-600 hover:text-rose-800 font-bold ml-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          ref={replyFileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                          onChange={(e) => handleFilesSelected(e.target.files)}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={isUploadingReply}
                          onClick={() => replyFileInputRef.current?.click()}
                          className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <span>📎</span>
                          <span>
                            {isUploadingReply
                              ? 'Đang tải lên Cloudinary...'
                              : 'Đính kèm ảnh / tệp (<5MB)'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddSampleAttachment('IMAGE')}
                          className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-600 cursor-pointer"
                        >
                          + Ảnh mẫu
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddSampleAttachment('FILE')}
                          className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-600 cursor-pointer"
                        >
                          + Tệp PDF mẫu
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCloseTicket(selectedTicket.id)}
                          className="px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition cursor-pointer"
                        >
                          Đóng bài góp ý
                        </button>
                        <button
                          type="submit"
                          disabled={isUploadingReply}
                          className="px-5 py-2.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                        >
                          Gửi phản hồi của Admin
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

      {/* Lightbox xem ảnh đính kèm */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between text-xs">
              <div>
                <span className="font-bold">{previewImage.name}</span>
                <span className="text-slate-400 ml-2">
                  (Cloudinary: {previewImage.publicId})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-bold cursor-pointer"
              >
                Đóng ✕
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-h-[70vh] w-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFeedbackView;
