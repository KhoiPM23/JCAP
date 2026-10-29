import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type NotificationItem,
  type NotificationPlacementKey,
  type NotificationStyleType,
  type ComputedNotificationStatus,
  STYLE_TYPE_META,
  PLACEMENT_OPTIONS,
  PLACEMENT_MAP,
  getNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
  computeNotificationStatus,
  clearAllDismissals,
  resetDefaultNotifications,
} from '../../services/mockNotificationStore';
import { AnnouncementPopupCard } from '../../components/admin/AdminAnnouncementPopup';

const STATUS_BADGE_META: Record<
  ComputedNotificationStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  ACTIVE_NOW: {
    label: 'Đang hiển thị',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500 animate-pulse',
  },
  SCHEDULED: {
    label: 'Chờ đến giờ hiện',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  EXPIRED: {
    label: 'Đã qua giờ tắt',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  DISABLED: {
    label: 'Đang tắt',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
};

function formatDateTimeDisplay(val?: string): string {
  if (!val || val.trim() === '') return 'Không giới hạn';
  const date = new Date(val);
  if (Number.isNaN(date.getTime())) return val;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const AdminNotificationView: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // Bộ lọc danh sách
  const [statusFilter, setStatusFilter] = useState<'ALL' | ComputedNotificationStatus>('ALL');
  const [placementFilter, setPlacementFilter] = useState<'ALL' | NotificationPlacementKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Trạng thái Form Cài đặt Thông báo (Tạo mới hoặc Sửa)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('THÔNG BÁO');
  const [content, setContent] = useState<string>('');
  const [styleType, setStyleType] = useState<NotificationStyleType>('ANNOUNCEMENT');
  const [placements, setPlacements] = useState<NotificationPlacementKey[]>(['HOME_DASHBOARD']);
  const [startAt, setStartAt] = useState<string>('');
  const [endAt, setEndAt] = useState<string>('');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal Xem thử toàn màn hình
  const [previewModalItem, setPreviewModalItem] = useState<{
    title: string;
    content: string;
    styleType: NotificationStyleType;
    placementLabel?: string;
  } | null>(null);

  const loadData = () => {
    setNotifications(getNotifications());
    setNowMs(Date.now());
  };

  useEffect(() => {
    loadData();
    const handleUpdated = () => loadData();
    window.addEventListener('jcap_notifications_updated', handleUpdated);

    // Tự động cập nhật đồng hồ mỗi 15 giây để xét thời gian xuất hiện / thời gian tắt
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => {
      window.removeEventListener('jcap_notifications_updated', handleUpdated);
      clearInterval(timer);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const resetFormToCreate = () => {
    setEditingId(null);
    setTitle('THÔNG BÁO');
    setContent('');
    setStyleType('ANNOUNCEMENT');
    setPlacements(['HOME_DASHBOARD']);
    setStartAt('');
    setEndAt('');
    setIsEnabled(true);
    setFormError(null);
  };

  const handleSelectEdit = (item: NotificationItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setContent(item.content);
    setStyleType(item.styleType);
    setPlacements([...item.placements]);
    setStartAt(item.startAt || '');
    setEndAt(item.endAt || '');
    setIsEnabled(item.isEnabled);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const togglePlacement = (key: NotificationPlacementKey) => {
    setPlacements((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
    setFormError(null);
  };

  const handleSelectAllPlacements = () => {
    if (placements.length === PLACEMENT_OPTIONS.length) {
      setPlacements([]);
    } else {
      setPlacements(PLACEMENT_OPTIONS.map((p) => p.key));
    }
    setFormError(null);
  };

  const handleStyleTypeChange = (newType: NotificationStyleType) => {
    setStyleType(newType);
    const defaultTitles = Object.values(STYLE_TYPE_META).map((m) => m.defaultTitle);
    if (!title.trim() || defaultTitles.includes(title.trim().toUpperCase())) {
      setTitle(STYLE_TYPE_META[newType].defaultTitle);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Vui lòng nhập tiêu đề thông báo.');
      return;
    }
    if (!content.trim()) {
      setFormError('Vui lòng nhập nội dung thông báo.');
      return;
    }
    if (placements.length === 0) {
      setFormError('Vui lòng chọn ít nhất 1 nơi xuất hiện thông báo.');
      return;
    }
    if (startAt && endAt) {
      const s = new Date(startAt).getTime();
      const end = new Date(endAt).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(end) && end <= s) {
        setFormError('Thời gian tắt thông báo phải sau thời gian bắt đầu xuất hiện.');
        return;
      }
    }

    if (editingId) {
      updateNotification(editingId, {
        title: title.trim(),
        content: content.trim(),
        styleType,
        placements,
        startAt: startAt.trim(),
        endAt: endAt.trim(),
        isEnabled,
      });
      showToast('Đã cập nhật cài đặt thông báo thành công!');
      resetFormToCreate();
    } else {
      createNotification({
        title: title.trim(),
        content: content.trim(),
        styleType,
        placements,
        startAt: startAt.trim(),
        endAt: endAt.trim(),
        isEnabled,
      });
      showToast('Đã tạo thông báo mới! Bạn có thể bấm vào chức năng tương ứng để xem Popup.');
      resetFormToCreate();
    }
  };

  const handleToggleEnable = (item: NotificationItem) => {
    updateNotification(item.id, { isEnabled: !item.isEnabled });
    showToast(
      !item.isEnabled
        ? `Đã bật hiển thị thông báo "${item.title}"`
        : `Đã tạm tắt thông báo "${item.title}"`,
    );
  };

  const handleDelete = (item: NotificationItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xoá thông báo "${item.title}" (${item.id})?`)) {
      return;
    }
    deleteNotification(item.id);
    if (editingId === item.id) resetFormToCreate();
    showToast('Đã xoá thông báo.');
  };

  const handleResetSnooze = () => {
    clearAllDismissals();
    showToast('Đã đặt lại trạng thái ẩn (Đóng / 6h / 24h). Tất cả thông báo đang bật sẽ hiện lại ngay!');
  };

  const stats = useMemo(() => {
    let activeNow = 0;
    let scheduled = 0;
    let expiredOrDisabled = 0;

    notifications.forEach((n) => {
      const st = computeNotificationStatus(n, nowMs);
      if (st === 'ACTIVE_NOW') activeNow++;
      else if (st === 'SCHEDULED') scheduled++;
      else expiredOrDisabled++;
    });

    return {
      total: notifications.length,
      activeNow,
      scheduled,
      expiredOrDisabled,
    };
  }, [notifications, nowMs]);

  const filteredList = useMemo(() => {
    return notifications.filter((item) => {
      const st = computeNotificationStatus(item, nowMs);
      if (statusFilter !== 'ALL' && st !== statusFilter) return false;
      if (placementFilter !== 'ALL' && !item.placements.includes(placementFilter)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchContent = item.content.toLowerCase().includes(q);
        const matchId = item.id.toLowerCase().includes(q);
        if (!matchTitle && !matchContent && !matchId) return false;
      }
      return true;
    });
  }, [notifications, nowMs, statusFilter, placementFilter, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Thông báo Toast góc trên */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-sm font-medium animate-in fade-in slide-in-from-bottom-4">
          <span className="text-emerald-400 text-base">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Banner tiêu đề trang */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-6 sm:p-7 text-white shadow-md relative overflow-hidden border border-slate-800">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <span>📢</span> Quản lý & Cài đặt Thông báo Hệ thống
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Cài đặt Popup Thông báo & Bảo trì theo Chức năng
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Thiết lập thông báo xuất hiện tại Trang chủ (Dashboard) hoặc hiển thị ngay khi truy cập vào từng chức năng cụ thể (Hội thoại AI, Shadowing, Khám phá, Gói nạp Credit...).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleResetSnooze}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
              title="Nếu bạn đã bấm Đóng / Ẩn 6 tiếng / Ẩn 24 tiếng, nhấn nút này để hiện lại Popup ngay"
            >
              <span>🔄</span> Bật lại các Popup đã ẩn (Test nhanh)
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              <span>🏠</span> Về Dashboard xem thử
            </button>
          </div>
        </div>
      </div>

      {/* 4 Thẻ thống kê nhanh */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Tổng thông báo</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-lg">
            📋
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase">Đang hiển thị</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{stats.activeNow}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
            🟢
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-700 uppercase">Chờ đến giờ hiện</p>
            <p className="text-2xl font-black text-blue-600 mt-1">{stats.scheduled}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg">
            ⏰
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Đang tắt / Hết hạn</p>
            <p className="text-2xl font-black text-slate-600 mt-1">{stats.expiredOrDisabled}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center text-lg">
            ⏸️
          </div>
        </div>
      </div>

      {/* Khu vực chính: Form Cài đặt (Trái) & Xem trước trực tiếp (Phải) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (7/12): FORM CÀI ĐẶT THÔNG BÁO */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
        >
          <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">{editingId ? '✏️' : '➕'}</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingId ? `Chỉnh sửa thông báo (${editingId})` : 'Cài đặt Thông báo mới'}
                </h2>
                <p className="text-xs text-slate-500">
                  Điền tiêu đề, nội dung, thời gian (tuỳ chọn) và chọn một hoặc nhiều nơi xuất hiện
                </p>
              </div>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetFormToCreate}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Huỷ sửa / Tạo mới
              </button>
            )}
          </div>

          <div className="p-6 space-y-5">
            {formError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <span>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            {/* 1. Loại giao diện thông báo */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                1. Kiểu thông báo & Màu sắc
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(Object.keys(STYLE_TYPE_META) as NotificationStyleType[]).map((key) => {
                  const meta = STYLE_TYPE_META[key];
                  const active = styleType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleStyleTypeChange(key)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                        active
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: meta.accentColor }}
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">{meta.label}</div>
                        <div className="text-[11px] text-slate-500">{meta.defaultTitle}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Tiêu đề & Nội dung */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    2. Tiêu đề thông báo <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    {['THÔNG BÁO', 'THÔNG BÁO BẢO TRÌ', 'CẬP NHẬT HỆ THỐNG'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTitle(preset)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 transition-colors cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: THÔNG BÁO, THÔNG BÁO BẢO TRÌ..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none text-sm font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  3. Nội dung thông báo <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Nhập nội dung thông báo bảo trì, hướng dẫn hoặc dán đường dẫn https://... (tự động nhận diện thành link bấm được)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 outline-none text-sm text-slate-800 leading-relaxed"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 Mẹo: Bạn có thể xuống dòng hoặc chèn đường dẫn (VD: <code className="text-slate-600">https://...</code>), Popup sẽ tự động làm nổi bật đường dẫn giống ảnh mẫu.
                </p>
              </div>
            </div>

            {/* 4. Chọn nơi xuất hiện thông báo (Multi-select) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  4. Chọn nơi xuất hiện thông báo (Chọn được nhiều chỗ) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllPlacements}
                  className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  {placements.length === PLACEMENT_OPTIONS.length
                    ? 'Bỏ chọn tất cả'
                    : 'Chọn tất cả vị trí'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PLACEMENT_OPTIONS.map((opt) => {
                  const checked = placements.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      onClick={() => togglePlacement(opt.key)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                        checked
                          ? 'border-blue-600 bg-blue-50/50 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                          <span>{opt.icon}</span>
                          <span className="truncate">{opt.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {opt.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 5. Thời gian xuất hiện thông báo (Không bắt buộc) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    5. Thời gian xuất hiện thông báo <span className="text-slate-400 font-normal">(Không bắt buộc)</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Nếu bỏ trống cả hai ô, thông báo sẽ <strong>tự động hiện ngay lập tức</strong> khi đang ở trạng thái Bật.
                  </p>
                </div>

                {(startAt || endAt) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartAt('');
                      setEndAt('');
                    }}
                    className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    ✕ Xoá thời gian (Đặt về Auto hiện)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Thời gian bắt đầu hiện (Từ lúc)
                  </label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Thời gian tự động tắt (Đến lúc)
                  </label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600 bg-white px-3 py-2 rounded-lg border border-slate-200/70">
                <span>⏱️</span>
                <span>
                  Chế độ hiện tại:{' '}
                  {!startAt && !endAt ? (
                    <strong className="text-emerald-700">
                      Tự động hiện ngay lập tức (Không giới hạn thời gian)
                    </strong>
                  ) : (
                    <strong className="text-blue-700">
                      Hiện từ [{formatDateTimeDisplay(startAt)}] → Tắt lúc [{formatDateTimeDisplay(endAt)}]
                    </strong>
                  )}
                </span>
              </div>
            </div>

            {/* 6. Trạng thái kích hoạt & Nút Lưu */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-bold text-slate-800">
                  Kích hoạt thông báo này ngay sau khi lưu
                </span>
              </label>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewModalItem({
                      title,
                      content,
                      styleType,
                      placementLabel:
                        placements.length > 0
                          ? placements.map((k) => PLACEMENT_MAP[k]?.label).join(', ')
                          : 'Chưa chọn vị trí',
                    })
                  }
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  👁️ Bật Popup xem thử
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#0878EE] hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer"
                >
                  {editingId ? '💾 Lưu thay đổi' : '🚀 Lưu & Áp dụng Thông báo'}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* CỘT PHẢI (5/12): KHUNG LIVE PREVIEW TRỰC TIẾP */}
        <div className="lg:col-span-5 space-y-4 sticky top-[84px]">
          <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block">
                  Live Preview
                </span>
                <h3 className="text-sm font-bold text-white">
                  Xem trước giao diện Popup thực tế
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-300 text-[11px] font-medium">
                {placements.length} vị trí được chọn
              </span>
            </div>

            {/* Bản xem trước Popup giống hệt ảnh mẫu */}
            <AnnouncementPopupCard
              title={title}
              content={content}
              styleType={styleType}
              placementLabel={
                placements.length > 0
                  ? PLACEMENT_MAP[placements[0]]?.label +
                    (placements.length > 1 ? ` (+${placements.length - 1} nơi khác)` : '')
                  : 'Chưa chọn nơi thông báo'
              }
              onClose={() => showToast('Nút [Đóng]: Sẽ đóng Popup trong phiên làm việc hiện tại.')}
              onHide6Hours={() => showToast('Nút [Ẩn 6 tiếng]: Sẽ tạm ẩn Popup này trong 6 giờ.')}
              onHide24Hours={() => showToast('Nút [Ẩn 24 tiếng]: Sẽ tạm ẩn Popup này trong 24 giờ.')}
              isInlinePreview
            />

            <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed">
              Khi Admin truy cập vào các trang đã đánh dấu (VD: <strong>Dashboard</strong>, <strong>Kịch bản Hội thoại</strong>, <strong>Shadowing</strong>...), Popup này sẽ tự động bật lên giữa màn hình.
            </p>
          </div>
        </div>
      </div>

      {/* DANH SÁCH THÔNG BÁO ĐÃ CÀI ĐẶT */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>📑</span> Danh sách các Thông báo đã cài đặt ({filteredList.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Bấm vào nhãn vị trí trên từng thông báo để chuyển thẳng tới chức năng đó và kiểm tra Popup
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Tìm kiếm */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tiêu đề, nội dung..."
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-blue-500 w-48"
            />

            {/* Lọc theo vị trí */}
            <select
              value={placementFilter}
              onChange={(e) => setPlacementFilter(e.target.value as 'ALL' | NotificationPlacementKey)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">Tất cả nơi thông báo</option>
              {PLACEMENT_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.icon} {p.label}
                </option>
              ))}
            </select>

            {/* Lọc theo trạng thái */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ComputedNotificationStatus)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE_NOW">🟢 Đang hiển thị</option>
              <option value="SCHEDULED">⏰ Chờ đến giờ hiện</option>
              <option value="EXPIRED">⌛ Đã qua giờ tắt</option>
              <option value="DISABLED">⏸️ Đang tắt</option>
            </select>

            <button
              type="button"
              onClick={() => {
                resetDefaultNotifications();
                showToast('Đã khôi phục dữ liệu mẫu ban đầu.');
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer"
              title="Khôi phục lại 3 thông báo mẫu mặc định"
            >
              Khôi phục mẫu
            </button>
          </div>
        </div>

        {filteredList.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Không tìm thấy thông báo nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredList.map((item) => {
              const computedStatus = computeNotificationStatus(item, nowMs);
              const statusBadge = STATUS_BADGE_META[computedStatus];
              const styleMeta = STYLE_TYPE_META[item.styleType] || STYLE_TYPE_META.ANNOUNCEMENT;
              const isAutoTime = !item.startAt && !item.endAt;

              return (
                <div
                  key={item.id}
                  className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400 font-semibold">
                        #{item.id}
                      </span>

                      {/* Badge Trạng thái */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
                        {statusBadge.label}
                      </span>

                      {/* Badge Loại giao diện */}
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styleMeta.badgeBg} ${styleMeta.badgeText} ${styleMeta.badgeBorder}`}
                      >
                        {styleMeta.label}
                      </span>

                      {/* Thời gian xuất hiện */}
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        <span>🕒</span>
                        {isAutoTime ? (
                          <span>Auto hiện (Không giới hạn giờ)</span>
                        ) : (
                          <span>
                            Hiện: {formatDateTimeDisplay(item.startAt)} → Tắt:{' '}
                            {formatDateTimeDisplay(item.endAt)}
                          </span>
                        )}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-line line-clamp-2">
                      {item.content}
                    </p>

                    {/* Các nơi thông báo (Bấm vào để nhảy tới trang đó xem thử) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-xs font-semibold text-slate-400 mr-1">
                        Nơi xuất hiện:
                      </span>
                      {item.placements.map((pKey) => {
                        const pMeta = PLACEMENT_MAP[pKey];
                        if (!pMeta) return null;
                        return (
                          <button
                            key={pKey}
                            type="button"
                            onClick={() => {
                              clearAllDismissals();
                              navigate(pMeta.adminNavigatePath);
                            }}
                            title={`Nhấn để mở "${pMeta.label}" và xem Popup xuất hiện`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <span>{pMeta.icon}</span>
                            <span>{pMeta.label}</span>
                            <span className="text-[10px] opacity-70">↗</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cụm nút thao tác bên phải */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleEnable(item)}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        item.isEnabled
                          ? 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {item.isEnabled ? '⏸️ Tạm tắt' : '▶️ Bật hiển thị'}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPreviewModalItem({
                          title: item.title,
                          content: item.content,
                          styleType: item.styleType,
                          placementLabel: item.placements
                            .map((k) => PLACEMENT_MAP[k]?.label)
                            .join(', '),
                        })
                      }
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      👁️ Xem thử
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectEdit(item)}
                      className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold cursor-pointer"
                    >
                      ✏️ Sửa
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                    >
                      🗑️ Xoá
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Xem thử toàn màn hình */}
      {previewModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => setPreviewModalItem(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px]">
            <AnnouncementPopupCard
              title={previewModalItem.title}
              content={previewModalItem.content}
              styleType={previewModalItem.styleType}
              placementLabel={`Xem thử: ${previewModalItem.placementLabel || ''}`}
              onClose={() => setPreviewModalItem(null)}
              onHide6Hours={() => {
                setPreviewModalItem(null);
                showToast('Đã mô phỏng bấm [Ẩn 6 tiếng]');
              }}
              onHide24Hours={() => {
                setPreviewModalItem(null);
                showToast('Đã mô phỏng bấm [Ẩn 24 tiếng]');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

