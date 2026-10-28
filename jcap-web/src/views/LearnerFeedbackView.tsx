import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getAllMockFeedbackTickets,
  getLearnerOwnTickets,
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
} from '../services/mockFeedbackStore';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // Giới hạn 5MB cho tệp/ảnh dung lượng nhỏ

export const LearnerFeedbackView: React.FC = () => {
  const { user } = useAuth();
  const learnerKey = useMemo(() => {
    if (user?.id) return String(user.id);
    if (user?.email) return user.email.toLowerCase();
    try {
      const saved = localStorage.getItem('jcap_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        return String(parsed.id || parsed.email || 'PRIMARY_DEMO_LEARNER').toLowerCase();
      }
    } catch {}
    return 'PRIMARY_DEMO_LEARNER';
  }, [user]);

  // Chỉ lấy các bài góp ý CỦA CHÍNH HỌC VIÊN ĐANG ĐĂNG NHẬP
  const [myTickets, setMyTickets] = useState<FeedbackTicket[]>(() =>
    getLearnerOwnTickets(learnerKey)
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string>(() => {
    const initial = getLearnerOwnTickets(learnerKey);
    return initial[0]?.id || '';
  });

  useEffect(() => {
    const own = getLearnerOwnTickets(learnerKey);
    setMyTickets(own);
    if (own.length > 0 && !own.some((t) => t.id === selectedTicketId)) {
      setSelectedTicketId(own[0].id);
    }
  }, [learnerKey]);

  // Bộ lọc danh sách theo 3 trạng thái
  const [statusFilter, setStatusFilter] = useState<'ALL' | FeedbackStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | FeedbackCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // State cho Modal Tạo Bài Góp Ý Mới
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<FeedbackCategory>('SCENARIO_BUG');
  const [newContent, setNewContent] = useState('');
  const [newAttachments, setNewAttachments] = useState<FeedbackAttachment[]>([]);
  const [isUploadingNew, setIsUploadingNew] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // State cho khung Phản hồi trong luồng (Reply Box)
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

  // Toast thông báo thao tác
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const newFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Thống kê theo 3 trạng thái của riêng học viên này
  const stats = useMemo(() => {
    const total = myTickets.length;
    const pendingCount = myTickets.filter((t) => t.status === 'PENDING').length;
    const inProgressCount = myTickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const closedCount = myTickets.filter((t) => t.status === 'CLOSED').length;
    return { total, pendingCount, inProgressCount, closedCount };
  }, [myTickets]);

  // Lọc danh sách bài góp ý của cá nhân học viên
  const filteredTickets = useMemo(() => {
    return myTickets.filter((t) => {
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
  }, [myTickets, statusFilter, categoryFilter, searchQuery]);

  const selectedTicket = useMemo(
    () => myTickets.find((t) => t.id === selectedTicketId) || filteredTickets[0] || null,
    [myTickets, selectedTicketId, filteredTickets]
  );

  // Xử lý chọn file từ máy tính & giả lập upload lên Cloudinary (folder: issues/)
  const handleFilesSelected = (files: FileList | null, target: 'NEW' | 'REPLY') => {
    if (!files || files.length === 0) return;
    const setErr = target === 'NEW' ? setCreateError : setReplyError;
    const currentList = target === 'NEW' ? newAttachments : replyAttachments;
    const setList = target === 'NEW' ? setNewAttachments : setReplyAttachments;
    const setUploading = target === 'NEW' ? setIsUploadingNew : setIsUploadingReply;

    setErr(null);

    if (currentList.length + files.length > 3) {
      setErr('Tối đa 3 tệp/ảnh đính kèm trong một lần gửi.');
      return;
    }

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setErr(`Tệp "${f.name}" vượt quá giới hạn dung lượng nhỏ (Tối đa 5MB).`);
        return;
      }
      validFiles.push(f);
    }

    setUploading(true);

    Promise.all(
      validFiles.map(
        (file) =>
          new Promise<FeedbackAttachment>((resolve) => {
            const isImage = file.type.startsWith('image/');
            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const randSuffix = Math.floor(1000 + Math.random() * 9000);
            const publicId = `issues/${cleanName.replace(/\.[^.]+$/, '')}_${randSuffix}`;

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
        setList((prev) => [...prev, ...uploaded]);
        setUploading(false);
        showToast(`Đã tải ${uploaded.length} tệp lên Cloudinary (folder: issues/)`);
      }, 400);
    });
  };

  const handleAddSampleAttachment = (target: 'NEW' | 'REPLY', type: 'IMAGE' | 'FILE') => {
    const currentList = target === 'NEW' ? newAttachments : replyAttachments;
    const setList = target === 'NEW' ? setNewAttachments : setReplyAttachments;
    const setErr = target === 'NEW' ? setCreateError : setReplyError;
    if (currentList.length >= 3) {
      setErr('Tối đa 3 tệp/ảnh đính kèm trong một lần gửi.');
      return;
    }
    setErr(null);
    const sample = createSampleAttachment(type);
    setList((prev) => [...prev, sample]);
    showToast(`Đã đính kèm ${type === 'IMAGE' ? 'ảnh mẫu' : 'tệp PDF mẫu'} lên Cloudinary`);
  };

  // Gửi bài góp ý ẩn danh mới
  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError('Vui lòng nhập tiêu đề bài góp ý.');
      return;
    }
    if (!newContent.trim()) {
      setCreateError('Vui lòng nhập nội dung chi tiết.');
      return;
    }

    const randomAnonNum = Math.floor(1000 + Math.random() * 9000);
    const nowIso = new Date().toISOString();
    const newId = `fb-${Date.now()}`;

    const created: FeedbackTicket = {
      id: newId,
      learnerOwnerKey: 'PRIMARY_DEMO_LEARNER',
      anonymousCode: `#ANON-${randomAnonNum}`,
      title: newTitle.trim(),
      category: newCategory,
      status: 'PENDING', // Mới tạo luôn ở trạng thái "Chờ Admin phản hồi"
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [
        {
          id: `msg-${Date.now()}`,
          ticketId: newId,
          senderRole: 'LEARNER',
          content: newContent.trim(),
          attachments: newAttachments,
          createdAt: nowIso,
        },
      ],
    };

    const allTickets = getAllMockFeedbackTickets();
    const updatedAll = [created, ...allTickets];
    saveMockFeedbackTickets(updatedAll);

    setMyTickets(getLearnerOwnTickets(learnerKey));
    setSelectedTicketId(created.id);
    setNewTitle('');
    setNewContent('');
    setNewAttachments([]);
    setCreateError(null);
    setIsCreateModalOpen(false);
    showToast(
      `Đã gửi bài góp ý ẩn danh (${created.anonymousCode}) — Trạng thái: Chờ Admin phản hồi!`
    );
  };

  // Học viên gửi tin nhắn tiếp theo trong cuộc trò chuyện với Admin
  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (selectedTicket.status === 'CLOSED') {
      setReplyError('Bài góp ý này đã được Admin đóng lại, không thể gửi thêm phản hồi.');
      return;
    }
    if (!replyContent.trim() && replyAttachments.length === 0) {
      setReplyError('Vui lòng nhập nội dung tin nhắn hoặc đính kèm tệp/ảnh.');
      return;
    }

    const nowIso = new Date().toISOString();
    const newMsg = {
      id: `msg-${Date.now()}`,
      ticketId: selectedTicket.id,
      senderRole: 'LEARNER' as const,
      content: replyContent.trim(),
      attachments: replyAttachments,
      createdAt: nowIso,
    };

    const allTickets = getAllMockFeedbackTickets();
    const updatedAll = allTickets.map((t) =>
      t.id === selectedTicket.id
        ? {
            ...t,
            updatedAt: nowIso,
            messages: [...t.messages, newMsg],
          }
        : t
    );
    saveMockFeedbackTickets(updatedAll);
    setMyTickets(getLearnerOwnTickets(learnerKey));

    setReplyContent('');
    setReplyAttachments([]);
    setReplyError(null);
    showToast(`Đã gửi tin nhắn tới Admin trong luồng ${selectedTicket.anonymousCode}`);
  };

  const handleResetDemo = () => {
    resetMockFeedbackTickets();
    const freshMine = getLearnerOwnTickets(learnerKey);
    setMyTickets(freshMine);
    setSelectedTicketId(freshMine[0]?.id || '');
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
      {/* HEADER RIÊNG CỦA HỌC VIÊN & CAM KẾT BẢO MẬT RIÊNG TƯ                   */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-[#E6EDF5] p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-extrabold text-[#071A44]">
                Hòm thư Góp ý Ẩn danh của Tôi
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                🔒 Riêng tư & Ẩn danh 100%
              </span>
            </div>

            <p className="text-sm text-slate-600 mt-1.5 max-w-3xl leading-relaxed">
              Không gian trao đổi riêng giữa bạn và Ban Quản Trị.{' '}
              <strong className="text-slate-800">
                Các học viên khác không thể nhìn thấy bài góp ý của bạn
              </strong>
              , và phía Admin cũng chỉ thấy mã ẩn danh ngẫu nhiên (VD:{' '}
              <code className="text-indigo-600 font-semibold">#ANON-8492</code>) mà không biết danh tính tài khoản của bạn.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={handleResetDemo}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition cursor-pointer"
            >
              Khôi phục dữ liệu mẫu
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setIsCreateModalOpen(true);
              }}
              className="px-5 py-3 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white font-bold text-sm shadow-sm flex items-center gap-2 transition cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Gửi góp ý ẩn danh mới</span>
            </button>
          </div>
        </div>

        {/* Thống kê 3 trạng thái lịch sử góp ý của bản thân */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
            <div className="text-xs font-medium text-slate-500">Lịch sử góp ý của bạn</div>
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
              Đang trò chuyện với Admin
            </div>
            <div className="text-xl font-extrabold text-blue-700 mt-0.5">
              {stats.inProgressCount}
            </div>
          </div>
          <div className="bg-slate-100/80 rounded-xl p-3.5 border border-slate-200">
            <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              Đã đóng (Hoàn tất)
            </div>
            <div className="text-xl font-extrabold text-slate-700 mt-0.5">{stats.closedCount}</div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BỐ CỤC 2 CỘT: LỊCH SỬ BÀI CỦA TÔI (TRÁI) & TRÒ CHUYỆN VỚI ADMIN (PHẢI) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI: LỊCH SỬ GÓP Ý CỦA TÔI (5/12) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E6EDF5] shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Lịch sử góp ý của riêng bạn ({filteredTickets.length})
              </span>
            </div>

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
                placeholder="Tìm trong lịch sử góp ý của bạn..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#0878EE]"
              />
            </div>

            {/* Bộ lọc 3 trạng thái: Chờ Admin phản hồi | Đang trò chuyện | Đã đóng */}
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

          {/* Danh sách bài góp ý của riêng học viên */}
          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredTickets.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm font-semibold text-slate-700">
                  Bạn chưa có bài góp ý nào ở mục này
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Bấm nút "Gửi góp ý ẩn danh mới" để gửi phản ánh hoặc câu hỏi tới Admin.
                </p>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                const catMeta = CATEGORY_META[ticket.category];
                const stMeta = STATUS_META[ticket.status];
                const lastMessage = ticket.messages[ticket.messages.length - 1];
                const hasAdminReplied = ticket.messages.some((m) => m.senderRole === 'ADMIN');

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setSelectedTicketId(ticket.id);
                      setReplyError(null);
                    }}
                    className={`w-full text-left p-4 transition cursor-pointer block ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-l-[#0878EE]'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      {/* Badge 3 Trạng thái */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${stMeta.badgeBg} ${stMeta.badgeText} ${stMeta.badgeBorder}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dotColor}`} />
                        {stMeta.label}
                      </span>

                      <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        {ticket.anonymousCode}
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

                      {/* Chỉ báo xem Admin đã để ý chưa */}
                      {ticket.status === 'PENDING' && (
                        <span className="text-[11px] font-medium text-amber-700">
                          {ticket.adminSeenAt
                            ? '👁️ Admin đã xem bài của bạn'
                            : '⏳ Admin chưa mở xem'}
                        </span>
                      )}
                      {hasAdminReplied && ticket.status === 'IN_PROGRESS' && (
                        <span className="text-[11px] font-semibold text-blue-600">
                          ✓ Có phản hồi từ Admin
                        </span>
                      )}
                    </div>

                    {lastMessage && (
                      <p className="text-xs text-slate-500 line-clamp-1 mt-2">
                        <span className="font-semibold text-slate-700">
                          {lastMessage.senderRole === 'ADMIN' ? '🛡️ Admin: ' : 'Bạn: '}
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

        {/* CỘT PHẢI: CHI TIẾT CUỘC TRÒ CHUYỆN VỚI ADMIN (7/12) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E6EDF5] shadow-xs overflow-hidden flex flex-col">
          {!selectedTicket ? (
            <div className="p-16 text-center text-slate-500">
              Chọn một bài góp ý ở danh sách bên trái để xem lịch sử trò chuyện với Admin.
            </div>
          ) : (
            <>
              {/* Header chi tiết bài góp ý & Thanh theo dõi tiến trình Admin xử lý */}
              <div className="p-6 border-b border-slate-200 bg-slate-50/60 space-y-4">
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
                        Mã ẩn danh của bạn: {selectedTicket.anonymousCode}
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
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 font-medium shrink-0">
                    🔒 Chỉ Admin có quyền đóng bài
                  </div>
                </div>

                {/* Thanh Tiến trình Trạng thái để học viên biết Admin đã chú ý chưa */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
                        selectedTicket.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-700'
                          : selectedTicket.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {selectedTicket.status === 'PENDING'
                        ? '⏳'
                        : selectedTicket.status === 'IN_PROGRESS'
                        ? '💬'
                        : '✅'}
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-[#071A44]">
                        Trạng thái hiện tại: {STATUS_META[selectedTicket.status].label}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {selectedTicket.status === 'PENDING' ? (
                          selectedTicket.adminSeenAt ? (
                            <span className="text-amber-700 font-medium">
                              👁️ Admin đã mở xem bài của bạn vào lúc{' '}
                              {formatDateTime(selectedTicket.adminSeenAt)} và đang chuẩn bị phản hồi.
                            </span>
                          ) : (
                            <span>
                              Bài góp ý đã vào hàng đợi ẩn danh, đang chờ Admin mở xem và phản hồi.
                            </span>
                          )
                        ) : (
                          STATUS_META[selectedTicket.status].learnerHint
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ================================================================= */}
              {/* LUỒNG TRÒ CHUYỆN PHÂN NHÁNH GIỮA BẠN VÀ ADMIN                     */}
              {/* ================================================================= */}
              <div className="p-6 space-y-0 flex-1 max-h-[540px] overflow-y-auto bg-[#FAFCFF]">
                {selectedTicket.messages.map((msg, idx) => {
                  const isAdmin = msg.senderRole === 'ADMIN';
                  const isFirst = idx === 0;

                  return (
                    <div key={msg.id} className="relative pl-8 pb-6 last:pb-2">
                      {/* Đường kẻ nhánh dọc nối các tin nhắn */}
                      {idx < selectedTicket.messages.length - 1 ||
                      selectedTicket.status === 'CLOSED' ? (
                        <div className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-slate-200" />
                      ) : null}

                      {/* Node chấm tròn trên nhánh */}
                      <div
                        className={`absolute left-0 top-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-2xs border-2 border-white ${
                          isAdmin ? 'bg-[#0878EE] text-white' : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {isAdmin ? '🛡️' : '🕵️'}
                      </div>

                      {/* Thẻ nội dung tin nhắn */}
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
                                : `Bạn (Ẩn danh ${selectedTicket.anonymousCode})`}
                            </span>
                            {isFirst && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700">
                                Bài góp ý gốc
                              </span>
                            )}
                            {isAdmin && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#0878EE] text-white">
                                Phản hồi từ Admin
                              </span>
                            )}
                          </div>
                          <span className="text-slate-500">{formatDateTime(msg.createdAt)}</span>
                        </div>

                        <div className="p-4 text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                          {msg.content}
                        </div>

                        {/* Danh sách Ảnh & Tệp đính kèm (Lưu trên Cloudinary) */}
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
                      <strong>Ban Quản Trị (Admin)</strong> đã đóng bài góp ý này
                      {selectedTicket.closedAt
                        ? ` vào lúc ${formatDateTime(selectedTicket.closedAt)}`
                        : ''}
                      . Cuộc trò chuyện đã kết thúc.
                    </div>
                  </div>
                )}
              </div>

              {/* ================================================================= */}
              {/* KHUNG NHẮN TIN TIẾP CHO ADMIN (KHI CHƯA ĐÓNG)                      */}
              {/* ================================================================= */}
              <div className="p-5 border-t border-slate-200 bg-white">
                {selectedTicket.status === 'CLOSED' ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1.5">
                    <div className="text-sm font-bold text-slate-700">
                      🔒 Bài góp ý này đã được Admin đóng lại
                    </div>
                    <p className="text-xs text-slate-500">
                      Bạn không thể gửi thêm tin nhắn vào luồng đã đóng. Nếu có thắc mắc hoặc góp ý mới, hãy bấm "Gửi góp ý ẩn danh mới".
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendReply} className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">
                        🕵️ Nhắn tin phản hồi cho Admin (dưới mã ẩn danh {selectedTicket.anonymousCode})
                      </span>
                      <span className="text-slate-400">
                        Tin nhắn lưu DB • Ảnh & Tệp nhỏ lưu Cloudinary
                      </span>
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
                      placeholder="Nhập tin nhắn trao đổi với Admin hoặc bổ sung thêm thông tin..."
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
                          onChange={(e) => handleFilesSelected(e.target.files, 'REPLY')}
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
                          onClick={() => handleAddSampleAttachment('REPLY', 'IMAGE')}
                          className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-600 cursor-pointer"
                        >
                          + Ảnh mẫu
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddSampleAttachment('REPLY', 'FILE')}
                          className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-600 cursor-pointer"
                        >
                          + Tệp PDF mẫu
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={isUploadingReply}
                        className="px-5 py-2.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                      >
                        Gửi tin nhắn ẩn danh
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL TẠO BÀI GÓP Ý ẨN DANH MỚI                                       */}
      {/* ===================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="px-6 py-4 bg-gradient-to-r from-[#071A44] to-[#0878EE] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🕵️</span>
                <div>
                  <h3 className="text-base font-extrabold">Gửi Bài Góp Ý / Báo Lỗi Ẩn Danh</h3>
                  <p className="text-xs text-blue-100">
                    Chỉ mình bạn và Admin thấy bài này • Danh tính của bạn được giấu kín
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateTicket}
              className="p-6 space-y-4 max-h-[82vh] overflow-y-auto"
            >
              {createError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Chủ đề góp ý / phản ánh *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_META) as FeedbackCategory[]).map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const active = newCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNewCategory(cat)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                          active
                            ? 'border-[#0878EE] bg-blue-50/80 text-[#071A44] ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <span className="text-base">{meta.icon}</span>
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Tiêu đề tóm tắt *</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategory('SCENARIO_BUG');
                      setNewTitle('Kịch bản "Mua vé tàu Shinkansen" bị thiếu gợi ý từ vựng câu #3');
                      setNewContent(
                        'Chào Admin, ở kịch bản Mua vé tàu Shinkansen (N4), lượt thoại thứ 3 nhân viên nhà ga nói khá nhanh từ 指定席 (Ghế đặt trước) nhưng trong khung gợi ý từ vựng bên phải chưa liệt kê từ này. Nhờ team bổ sung giúp ạ!'
                      );
                    }}
                    className="text-[11px] font-bold text-[#0878EE] hover:underline cursor-pointer"
                  >
                    ✨ Điền nhanh nội dung mẫu
                  </button>
                </div>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Câu thoại số 2 bài Phỏng vấn xin việc bị sai âm đọc..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0878EE]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nội dung chi tiết *
                </label>
                <textarea
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Mô tả chi tiết vấn đề bạn gặp phải hoặc ý kiến đóng góp cho hệ thống..."
                  className="w-full p-3.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0878EE] resize-none"
                />
              </div>

              {/* Khu vực đính kèm ảnh / tệp lưu lên Cloudinary */}
              <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-700">
                      ☁️ Đính kèm Ảnh hoặc Tệp nhỏ (Lưu trữ qua Cloudinary)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Hỗ trợ PNG, JPG, PDF, TXT, DOCX (Tối đa 5MB/tệp • Tối đa 3 tệp).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={newFileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                      onChange={(e) => handleFilesSelected(e.target.files, 'NEW')}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploadingNew}
                      onClick={() => newFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#0878EE] text-xs font-bold text-[#0878EE] shadow-2xs cursor-pointer"
                    >
                      {isUploadingNew ? 'Đang tải lên...' : '+ Chọn tệp từ máy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddSampleAttachment('NEW', 'IMAGE')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-200/70 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      + Ảnh mẫu
                    </button>
                  </div>
                </div>

                {newAttachments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    {newAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span>{att.fileType === 'IMAGE' ? '🖼️' : '📄'}</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 truncate">
                              {att.fileName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {formatFileSize(att.fileSize)} • {att.cloudinaryPublicId}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setNewAttachments((prev) => prev.filter((x) => x.id !== att.id))
                          }
                          className="text-rose-500 hover:text-rose-700 font-bold px-1.5 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isUploadingNew}
                  className="px-5 py-2.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  Gửi góp ý ẩn danh
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

export default LearnerFeedbackView;
