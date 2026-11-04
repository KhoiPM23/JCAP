import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  type NotificationItem,
  STYLE_TYPE_META,
  getActiveLearnerNotifications,
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../services/mockNotificationStore';
import { Icon } from '../jcap';

/**
 * Hiển thị mốc thời gian thực tế rõ ràng:
 * - Dưới 1 phút: "Vừa xong"
 * - Dưới 60 phút: "X phút trước"
 * - Dưới 24 giờ: "X giờ trước"
 * - Từ 1 đến 7 ngày: "X ngày trước"
 * - Lớn hơn: "HH:mm - DD/MM/YYYY"
 */
function formatNotificationTime(isoString?: string): string {
  if (!isoString) return 'Vừa xong';
  try {
    const time = new Date(isoString).getTime();
    if (Number.isNaN(time)) return isoString;
    const diffMs = Date.now() - time;
    if (diffMs < 0) {
      // Thông báo hẹn giờ trong tương lai
      return (
        'Bắt đầu: ' +
        new Date(isoString).toLocaleString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        })
      );
    }
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Vừa xong';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays <= 7) return `${diffDays} ngày trước`;

    return new Date(isoString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Hiển thị ngày giờ đầy đủ rõ ràng (Giờ:Phút - Ngày/Tháng/Năm)
 */
function formatFullDateTime(isoString?: string): string {
  if (!isoString || !isoString.trim()) return 'Ngay lập tức (Không giới hạn)';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Nút Chuông Thông báo dạng Facebook cho Học viên:
 * - Chỉ xuất hiện ở góc trên cùng bên phải của trang chủ / Hành trình
 * - Tự động ẩn đi khi tương tác mở chi tiết tỉnh trên bản đồ (?tinh=...) hoặc chuyển sang tính năng khác
 * - Có chấm đỏ khi có thông báo chưa đọc
 * - Khi click mở danh sách thông báo kiểu Facebook với 3 tab: "Tất cả", "Bảo trì", "Sự kiện"
 * - Khi click vào một thông báo, hiện popup modal chi tiết (tiêu đề, nội dung, ngày bắt đầu, nút Đóng)
 *   và tự động đánh dấu đã đọc (không còn bôi đậm, mất chấm xanh).
 */
export const LearnerNotificationBell: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'MAINTENANCE' | 'PROMOTION'>('ALL');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [activeDetailItem, setActiveDetailItem] = useState<NotificationItem | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Chỉ hiển thị ở trang chủ / Hành trình ('/' hoặc '/explore'). Bấm sang tính năng khác sẽ tự mất.
  const isMapHome = location.pathname === '/' || location.pathname.startsWith('/explore');
  // Khi học viên tương tác mở tỉnh (có query param ?tinh=...) như trong Hình 2 thì ẩn chuông đi
  const isInteractingWithPrefecture = Boolean(searchParams.get('tinh'));

  const loadData = () => {
    setNotifications(getActiveLearnerNotifications());
    setReadIds(getReadNotificationIds());
  };

  useEffect(() => {
    loadData();
    const handleUpdated = () => loadData();
    window.addEventListener('jcap_notifications_updated', handleUpdated);
    window.addEventListener('storage', handleUpdated);
    return () => {
      window.removeEventListener('jcap_notifications_updated', handleUpdated);
      window.removeEventListener('storage', handleUpdated);
    };
  }, []);

  // Đóng dropdown khi click ra ngoài hoặc bấm Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Đóng dropdown khi chuyển trang
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Lọc thông báo theo 3 phân loại: Tất cả, Bảo trì, Sự kiện
  const filteredList = useMemo(() => {
    if (filterTab === 'ALL') return notifications;
    return notifications.filter((n) => n.styleType === filterTab);
  }, [notifications, filterTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.includes(n.id)).length;
  }, [notifications, readIds]);

  if (!isMapHome || isInteractingWithPrefecture) return null;

  const handleOpenDetail = (item: NotificationItem) => {
    markNotificationAsRead(item.id);
    setReadIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    setActiveDetailItem(item);
  };

  return (
    <>
      {/* Chuông tròn nhỏ ở góc trên cùng bên phải màn hình Trang chủ (Hành trình) */}
      <div
        ref={containerRef}
        className="fixed top-4 right-4 z-40 select-none font-sans"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
            isOpen
              ? 'bg-blue-600 text-white ring-4 ring-blue-500/30'
              : 'bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/80 backdrop-blur-md'
          }`}
          aria-label="Thông báo hệ thống"
          title="Thông báo"
        >
          <Icon name="notifications" size={24} fill={isOpen || unreadCount > 0} />

          {/* Chấm đỏ báo hiệu khi có thông báo chưa đọc */}
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-white" />
            </span>
          )}
        </button>

        {/* Dropdown danh sách Thông báo kiểu Facebook */}
        {isOpen && (
          <div className="absolute top-13 right-0 w-[360px] sm:w-[390px] max-h-[85vh] bg-[#242526] text-[#E4E6EB] rounded-2xl shadow-2xl border border-[#3E4042] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Header thông báo */}
            <div className="p-4 pb-2 border-b border-[#3E4042]/70">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-white tracking-tight">Thông báo</h2>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      markAllNotificationsAsRead();
                      setReadIds(notifications.map((n) => n.id));
                    }}
                    className="text-xs font-medium text-[#4599FF] hover:underline cursor-pointer"
                  >
                    Đánh dấu tất cả đã đọc
                  </button>
                )}
              </div>

              {/* 3 Tab phân loại: 1. Tất cả, 2. Bảo trì, 3. Sự kiện */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilterTab('ALL')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    filterTab === 'ALL'
                      ? 'bg-[#2D88FF] text-white shadow-xs'
                      : 'bg-[#3A3B3C] text-[#E4E6EB] hover:bg-[#4E4F50]'
                  }`}
                >
                  Tất cả
                </button>

                <button
                  type="button"
                  onClick={() => setFilterTab('MAINTENANCE')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterTab === 'MAINTENANCE'
                      ? 'bg-[#F59E0B] text-slate-950 font-bold shadow-xs'
                      : 'bg-[#3A3B3C] text-[#E4E6EB] hover:bg-[#4E4F50]'
                  }`}
                >
                  <span>🔧</span>
                  <span>Bảo trì</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterTab('PROMOTION')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterTab === 'PROMOTION'
                      ? 'bg-[#E11D48] text-white font-bold shadow-xs'
                      : 'bg-[#3A3B3C] text-[#E4E6EB] hover:bg-[#4E4F50]'
                  }`}
                >
                  <span>🎉</span>
                  <span>Sự kiện</span>
                </button>
              </div>
            </div>

            {/* Danh sách thông báo */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#3E4042]/40 max-h-[460px]">
              {filteredList.length === 0 ? (
                <div className="py-12 px-6 text-center text-[#B0B3B8] text-sm">
                  <div className="text-3xl mb-2 opacity-50">🔔</div>
                  Không có thông báo nào trong mục này.
                </div>
              ) : (
                filteredList.map((item) => {
                  const isRead = readIds.includes(item.id);
                  const meta = STYLE_TYPE_META[item.styleType] || STYLE_TYPE_META.ANNOUNCEMENT;
                  const timeDisplay = formatNotificationTime(item.startAt || item.createdAt);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleOpenDetail(item)}
                      className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer select-none ${
                        isRead ? 'hover:bg-[#3A3B3C]/50 opacity-90' : 'bg-[#2E3B4E]/40 hover:bg-[#2E3B4E]/70'
                      }`}
                    >
                      {/* Avatar / Icon đại diện loại thông báo */}
                      <div className="relative shrink-0 mt-0.5">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white shadow-md"
                          style={{ backgroundColor: meta.accentColor }}
                        >
                          <Icon name={meta.icon} size={22} fill />
                        </div>
                      </div>

                      {/* Nội dung thông báo */}
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.2 rounded"
                            style={{
                              backgroundColor: `${meta.accentColor}25`,
                              color: meta.accentColor,
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {/* Tiêu đề & nội dung: Nếu chưa đọc thì chữ đậm hơn */}
                        <h4
                          className={`text-sm leading-snug line-clamp-1 ${
                            isRead ? 'font-normal text-[#D0D2D6]' : 'font-bold text-white'
                          }`}
                        >
                          {item.title}
                        </h4>

                        <p
                          className={`text-xs mt-1 line-clamp-2 leading-relaxed ${
                            isRead ? 'text-[#9A9DA2]' : 'text-[#C5C7CB]'
                          }`}
                        >
                          {item.content}
                        </p>

                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={`text-[11px] ${
                              isRead ? 'text-[#8A8D91]' : 'text-[#4599FF] font-semibold'
                            }`}
                          >
                            🕒 {timeDisplay}
                          </span>
                        </div>
                      </div>

                      {/* Chấm xanh bên phải như Facebook khi chưa đọc */}
                      {!isRead && (
                        <div className="shrink-0 self-center">
                          <span className="block w-3 h-3 rounded-full bg-[#2D88FF] shadow-xs" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Popup Bảng nhỏ hiển thị chi tiết thông báo khi click vào 1 mục */}
      {activeDetailItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans animate-in fade-in duration-150"
          onClick={() => setActiveDetailItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in zoom-in-95 duration-150"
          >
            {/* Header màu sắc theo loại thông báo */}
            <div
              className={`p-5 text-white bg-gradient-to-r ${
                STYLE_TYPE_META[activeDetailItem.styleType]?.headerGradient || 'from-blue-600 to-indigo-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold tracking-wide">
                  <span>{activeDetailItem.styleType === 'MAINTENANCE' ? '🔧' : activeDetailItem.styleType === 'PROMOTION' ? '🎉' : '📢'}</span>
                  <span>{STYLE_TYPE_META[activeDetailItem.styleType]?.label || 'Thông báo'}</span>
                </span>
                <span className="text-[11px] text-white/85">
                  {formatNotificationTime(activeDetailItem.startAt || activeDetailItem.createdAt)}
                </span>
              </div>
              <h3 className="text-lg font-bold tracking-tight leading-snug">
                {activeDetailItem.title}
              </h3>
            </div>

            {/* Thân chi tiết: Nội dung & Mốc thời gian thực tế rõ ràng */}
            <div className="p-5 space-y-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Nội dung chi tiết
                </span>
                <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100 max-h-[240px] overflow-y-auto">
                  {activeDetailItem.content}
                </div>
              </div>

              {/* Hộp mốc thời gian thực tế rõ ràng */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-medium">Thời gian bắt đầu:</span>
                  <span className="font-bold text-slate-900">
                    {formatFullDateTime(activeDetailItem.startAt || activeDetailItem.createdAt)}
                  </span>
                </div>
                {activeDetailItem.endAt && activeDetailItem.endAt.trim() !== '' && (
                  <div className="flex items-center justify-between text-slate-600 pt-1.5 border-t border-slate-200/50">
                    <span className="font-medium">Thời gian kết thúc:</span>
                    <span className="font-bold text-slate-900">
                      {formatFullDateTime(activeDetailItem.endAt)}
                    </span>
                  </div>
                )}
              </div>

              {/* Nút Đóng */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setActiveDetailItem(null)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-all cursor-pointer shadow-md"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
