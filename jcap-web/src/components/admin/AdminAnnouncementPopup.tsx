import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  type NotificationItem,
  type NotificationStyleType,
  STYLE_TYPE_META,
  PLACEMENT_MAP,
  resolvePlacementFromAdminPath,
  getActiveNotificationsForPlacement,
  dismissNotification,
} from '../../services/mockNotificationStore';

/**
 * Chuyển đổi văn bản có chứa URL (http/https) thành đoạn văn có link bấm được
 */
function renderFormattedContent(text: string) {
  if (!text) return <span className="text-slate-400 italic">Chưa có nội dung thông báo...</span>;

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const lines = text.split('\n');

  return lines.map((line, lineIdx) => {
    const parts = line.split(urlRegex);
    return (
      <React.Fragment key={lineIdx}>
        {parts.map((part, partIdx) => {
          if (part.match(urlRegex)) {
            return (
              <a
                key={partIdx}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-900 font-bold underline decoration-slate-400 hover:text-blue-600 hover:decoration-blue-600 break-all transition-colors"
              >
                {part}
              </a>
            );
          }
          return <React.Fragment key={partIdx}>{part}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

function HeaderIcon({ styleType }: { styleType: NotificationStyleType }) {
  if (styleType === 'MAINTENANCE') {
    return (
      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }

  // Mặc định: Icon chiếc loa giống ảnh mẫu
  return (
    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
      />
    </svg>
  );
}

export interface AnnouncementPopupCardProps {
  title: string;
  content: string;
  styleType: NotificationStyleType;
  placementLabel?: string;
  currentIndex?: number;
  totalCount?: number;
  onClose: () => void;
  onHide6Hours: () => void;
  onHide24Hours: () => void;
  isInlinePreview?: boolean;
}

/**
 * Giao diện thẻ Popup Thông báo (Thiết kế chuẩn theo mẫu ảnh người dùng cung cấp)
 */
export const AnnouncementPopupCard: React.FC<AnnouncementPopupCardProps> = ({
  title,
  content,
  styleType,
  placementLabel,
  currentIndex = 0,
  totalCount = 1,
  onClose,
  onHide6Hours,
  onHide24Hours,
  isInlinePreview = false,
}) => {
  const meta = STYLE_TYPE_META[styleType] || STYLE_TYPE_META.ANNOUNCEMENT;

  return (
    <div
      className={`w-full max-w-[440px] rounded-[24px] bg-white shadow-2xl overflow-hidden border border-slate-100 select-none ${
        isInlinePreview ? 'mx-auto shadow-lg' : 'animate-in fade-in zoom-in-95 duration-200'
      }`}
    >
      {/* Phần Header màu xanh/cam với hoạ tiết vòng tròn mờ và icon chiếc loa ở giữa */}
      <div
        className={`relative bg-gradient-to-br ${meta.headerGradient} pt-7 pb-14 px-6 text-center overflow-hidden`}
      >
        {/* Hoạ tiết góc phải trên giống ảnh mẫu */}
        <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/15 pointer-events-none" />
        <div className="absolute top-12 -right-6 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />

        {/* Nút X góc trên phải */}
        <button
          type="button"
          onClick={onClose}
          title="Đóng thông báo"
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer z-10"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Badge báo vị trí (chỉ hiển thị nhỏ gọn nếu có) */}
        {placementLabel && (
          <div className="mb-2.5 flex justify-center">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/15 text-white/95 text-[11px] font-medium backdrop-blur-xs">
              <span>📍</span> {placementLabel}
              {totalCount > 1 && (
                <span className="ml-1 px-1.5 py-0.2 bg-white/20 rounded-full text-[10px] font-bold">
                  {currentIndex + 1}/{totalCount}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Hộp vuông bo góc mờ chứa Icon Loa */}
        <div className="w-14 h-14 mx-auto rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-inner border border-white/25 mb-3">
          <HeaderIcon styleType={styleType} />
        </div>

        {/* Tiêu đề thông báo */}
        <h3 className="text-white font-extrabold text-base sm:text-lg tracking-wide uppercase drop-shadow-2xs">
          {title?.trim() || meta.defaultTitle}
        </h3>
      </div>

      {/* Thẻ trắng nổi đè lên phần dưới của Header */}
      <div className="px-5 pb-5 bg-[#F8FAFC]">
        <div className="-mt-8 relative z-10 bg-white rounded-2xl p-5 shadow-md border border-slate-100 min-h-[135px] max-h-[260px] overflow-y-auto">
          <div className="flex items-start gap-2.5 text-left">
            {/* Icon tích xanh / cảnh báo đầu dòng giống ảnh mẫu */}
            <span
              className="mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold shadow-2xs"
              style={{ backgroundColor: meta.accentColor }}
            >
              {styleType === 'MAINTENANCE' ? '!' : '✓'}
            </span>
            <div className="text-[15px] leading-relaxed font-semibold text-slate-800 break-words flex-1">
              {renderFormattedContent(content)}
            </div>
          </div>
        </div>

        {/* 3 Nút hành động: Đóng | Ẩn 6 tiếng | Ẩn 24 tiếng */}
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold text-xs sm:text-sm transition-all cursor-pointer shadow-2xs"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={onHide6Hours}
            className={`py-2.5 px-3 rounded-xl border bg-white font-semibold text-xs sm:text-sm transition-all cursor-pointer shadow-2xs ${meta.outlineBtnBorder} ${meta.outlineBtnText}`}
          >
            Ẩn 6 tiếng
          </button>

          <button
            type="button"
            onClick={onHide24Hours}
            className={`py-2.5 px-3 rounded-xl text-white font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-sm ${meta.primaryBtnBg}`}
          >
            Ẩn 24 tiếng
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Host tự động kiểm tra route hiện tại của Admin và bật Popup thông báo tương ứng
 * (Chỉ hoạt động bên phía Admin theo yêu cầu, không can thiệp sang Learner)
 */
export const AdminAnnouncementModalHost: React.FC = () => {
  const location = useLocation();
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentPlacement = resolvePlacementFromAdminPath(location.pathname);

  const refreshQueue = useCallback(() => {
    if (!currentPlacement) {
      setQueue([]);
      setCurrentIndex(0);
      return;
    }
    const activeList = getActiveNotificationsForPlacement(currentPlacement);
    setQueue(activeList);
    setCurrentIndex(0);
  }, [currentPlacement]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    const handleStorageUpdated = () => refreshQueue();
    window.addEventListener('jcap_notifications_updated', handleStorageUpdated);
    return () => window.removeEventListener('jcap_notifications_updated', handleStorageUpdated);
  }, [refreshQueue]);

  if (!currentPlacement || queue.length === 0) return null;

  const currentItem = queue[currentIndex] || queue[0];
  if (!currentItem) return null;

  const placementMeta = PLACEMENT_MAP[currentPlacement];

  const handleAction = (hours: 0 | 6 | 24) => {
    dismissNotification(currentItem, currentPlacement, hours);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
      onClick={() => handleAction(0)}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px]">
        <AnnouncementPopupCard
          title={currentItem.title}
          content={currentItem.content}
          styleType={currentItem.styleType}
          placementLabel={placementMeta?.label}
          currentIndex={currentIndex}
          totalCount={queue.length}
          onClose={() => handleAction(0)}
          onHide6Hours={() => handleAction(6)}
          onHide24Hours={() => handleAction(24)}
        />
      </div>
    </div>
  );
};

