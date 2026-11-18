import React, { useEffect, useState } from 'react';
import { Button, Icon } from '../jcap';

export interface PlacementTestInvitationModalProps {
  open: boolean;
  onStart: () => void;
  onSkip: () => Promise<void> | void;
}

/**
 * Hộp thoại mời học viên làm bài Kiểm tra xếp lớp đầu vào (Placement Test)
 * khi đăng nhập lần đầu (NotStarted & hasSeenPlacementPrompt === false).
 * Không bắt buộc: người học có thể bỏ qua và làm lại bất kỳ lúc nào từ trang Hồ sơ (/profile).
 */
export const PlacementTestInvitationModal: React.FC<PlacementTestInvitationModalProps> = ({
  open,
  onStart,
  onSkip,
}) => {
  const [isSkipping, setIsSkipping] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSkipping) {
        void handleSkipClick();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, isSkipping]);

  if (!open) return null;

  const handleSkipClick = async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    try {
      await onSkip();
    } finally {
      setIsSkipping(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="placement-invite-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-paper-50 p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Nút đóng nhanh (coi như bỏ qua, để sau) */}
        <button
          type="button"
          onClick={handleSkipClick}
          disabled={isSkipping}
          aria-label="Đóng hộp thoại mời kiểm tra xếp lớp"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-sumi-muted hover:bg-paper-200 hover:text-sumi transition cursor-pointer disabled:opacity-50"
        >
          <Icon name="close" size={18} />
        </button>

        {/* Huy hiệu & Tiêu đề */}
        <div className="space-y-2.5 pr-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ai)]/10 px-3 py-1 text-[11px] font-bold text-[var(--ai)] uppercase tracking-wider">
            <span>🏨</span>
            <span>Đánh giá đầu vào · Miễn phí 100% Credit</span>
          </div>
          <h2 id="placement-invite-title" className="m-0 text-xl sm:text-2xl font-bold leading-tight text-sumi font-serif">
            Kiểm tra trình độ hội thoại tiếng Nhật?
          </h2>
          <p className="m-0 text-sm leading-relaxed text-sumi-muted">
            Trò chuyện ngắn (~3–5 phút) tại quầy lễ tân <strong>Khách sạn Sakura</strong> cùng AI để hệ thống ước lượng năng lực giao tiếp hiện tại của bạn (tương đương N5 – N3) và gợi ý lộ trình phù hợp hơn.
          </p>
        </div>

        {/* Điểm nổi bật */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="rounded-2xl border border-line bg-paper-100/70 p-3 space-y-1">
            <span className="font-bold text-sumi block">🎙️ Nói hoặc gõ chữ</span>
            <span className="text-sumi-muted block leading-snug">Linh hoạt chọn mic hoặc nhập văn bản.</span>
          </div>
          <div className="rounded-2xl border border-line bg-paper-100/70 p-3 space-y-1">
            <span className="font-bold text-sumi block">🪙 0 Credit</span>
            <span className="text-sumi-muted block leading-snug">Hoàn toàn miễn phí, không trừ số dư.</span>
          </div>
          <div className="rounded-2xl border border-line bg-paper-100/70 p-3 space-y-1">
            <span className="font-bold text-sumi block">⏸️ Tự do tạm dừng</span>
            <span className="text-sumi-muted block leading-snug">Không bắt buộc, có thể bỏ qua làm sau.</span>
          </div>
        </div>

        <p className="m-0 text-[11.5px] text-sumi-faint leading-relaxed">
          Nếu chọn bỏ qua bây giờ, bạn vẫn có thể vào mục <strong>Hồ sơ</strong> bất kỳ lúc nào để bắt đầu làm bài đánh giá.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
          <Button
            variant="ghost"
            onClick={handleSkipClick}
            disabled={isSkipping}
          >
            {isSkipping ? 'Đang lưu...' : 'Bỏ qua, để sau'}
          </Button>
          <Button
            variant="primary"
            icon="arrow_forward"
            onClick={onStart}
            disabled={isSkipping}
          >
            Bắt đầu kiểm tra ngay
          </Button>
        </div>
      </div>
    </div>
  );
};
